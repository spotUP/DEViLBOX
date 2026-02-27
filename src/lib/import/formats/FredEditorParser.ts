/**
 * FredEditorParser.ts -- Fred Editor (.fred) Amiga format parser
 *
 * Fred Editor is a 4-channel Amiga tracker with multiple subsongs, ADSR envelopes,
 * arpeggio tables, vibrato, portamento, and synth/pulse/blending sample types.
 *
 * Binary format detected by scanning for 68k assembly patterns:
 *   - 0x4efa (jmp) at 16-byte intervals in the first 16 bytes
 *   - 0x123a/0xb001 and 0x214a/0x47fa sequences in the first 1024 bytes
 *
 * Reference: FlodJS FEPlayer.js by Christian Corti (Neoart)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell } from '@/types';
import type { InstrumentConfig, FredConfig } from '@/types/instrument';
import { createSamplerInstrument } from './AmigaUtils';

// ── Fred Editor period table (from FEPlayer.js) ─────────────────────────────
// 6 octaves of 12 semitones = 72 entries. Used with relative tuning per sample.

// ── Utility: read big-endian values from a DataView ─────────────────────────

function readUint32(view: DataView, off: number): number {
  return view.getUint32(off, false);
}

function readInt16(view: DataView, off: number): number {
  return view.getInt16(off, false);
}

function readUint16(view: DataView, off: number): number {
  return view.getUint16(off, false);
}

function readUint8(view: DataView, off: number): number {
  return view.getUint8(off);
}

function readInt8(view: DataView, off: number): number {
  const v = view.getUint8(off);
  return v < 128 ? v : v - 256;
}

// ── FE sample definition ────────────────────────────────────────────────────

interface FESample {
  pointer: number;
  loopPtr: number;     // signed short - loop offset within sample
  length: number;      // in bytes (already <<1)
  relative: number;    // relative tuning (period multiplier / 1024)

  vibratoDelay: number;
  vibratoSpeed: number;
  vibratoDepth: number;

  envelopeVol: number;
  attackSpeed: number;
  attackVol: number;
  decaySpeed: number;
  decayVol: number;
  sustainTime: number;
  releaseSpeed: number;
  releaseVol: number;

  arpeggio: Int8Array;      // 16 signed bytes
  arpeggioLimit: number;
  arpeggioSpeed: number;

  type: number;             // 0=regular, 1=PWM/pulse, 2=wavetable blending
  synchro: number;

  pulseRateNeg: number;
  pulseRatePos: number;
  pulseSpeed: number;
  pulsePosL: number;
  pulsePosH: number;
  pulseDelay: number;
  pulseCounter: number;

  blendRate: number;
  blendDelay: number;
  blendCounter: number;
}

// ── FE song definition ──────────────────────────────────────────────────────

interface FESong {
  speed: number;
  length: number;     // max track length
  tracks: Uint32Array[];  // 4 tracks, each with pattern offsets
}

// ── Map a Fred Editor note to XM note ───────────────────────────────────────
// FE notes are stored as 1-based values in the file (1-72, 6 octaves).
// FE note 1 = C-1 (period 856) = XM note 13
// FE note 13 = C-2 (period 428) = XM note 25
// FE note 25 = C-3 = XM note 37

function feNoteToXM(feNote: number): number {
  if (feNote < 1 || feNote > 72) return 0;
  return feNote + 12; // 1-based: FE note 1 (C-1) → XM note 13
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Check if a buffer is a Fred Editor format file.
 * Detection: scan first 16 bytes at 4-byte intervals for 0x4efa (jmp instruction),
 * then search within first 1024 bytes for 0x123a/0xb001 and 0x214a/0x47fa patterns.
 */
export function isFredEditorFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 1024) return false;

  const view = new DataView(buffer);

  // Check for jmp (0x4efa) at 4-byte intervals in the first 16 bytes
  // The FEPlayer reads at positions 0, 4, 8, 12 (incrementing by 4 from 16-bit read + skip 2)
  let hasJmp = true;
  for (let pos = 0; pos < 16; pos += 4) {
    const value = view.getUint16(pos, false);
    if (value !== 0x4efa) {
      hasJmp = false;
      break;
    }
  }
  if (!hasJmp) return false;

  // Search for 68k code patterns: 0x123a/0xb001 or 0x214a/0x47fa
  let foundDataPtr = false;
  let foundBasePtr = false;
  let pos = 16;

  while (pos < 1024 && pos + 6 <= buffer.byteLength) {
    const value = view.getUint16(pos, false);

    if (value === 0x123a) {
      // move.b $x,d1 -- check for cmp.b d1,d0 at pos+4
      if (pos + 4 < buffer.byteLength) {
        const next = view.getUint16(pos + 4, false);
        if (next === 0xb001) {
          foundDataPtr = true;
        }
      }
    } else if (value === 0x214a) {
      // move.l a2,(a0) -- check for lea $x,a3 at pos+4
      if (pos + 4 < buffer.byteLength) {
        const next = view.getUint16(pos + 4, false);
        if (next === 0x47fa) {
          foundBasePtr = true;
        }
      }
    }

    if (foundDataPtr && foundBasePtr) return true;
    pos += 2;
  }

  // The loader only requires basePtr (version check). dataPtr is also needed for
  // actual parsing, but for detection we require at least the basePtr pattern.
  return foundBasePtr;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Fred Editor (.fred) file into a TrackerSong.
 *
 * Extracts samples, songs, and pattern data. Each subsong is flattened into
 * sequential patterns. Sample instruments are created with proper loop points.
 * Arpeggio tables and portamento are mapped to XM effects.
 */
export async function parseFredEditorFile(
  buffer: ArrayBuffer,
  filename: string
): Promise<TrackerSong> {
  const view = new DataView(buffer);
  const byteLength = buffer.byteLength;

  // ── Step 1: Locate dataPtr and basePtr using 68k assembly patterns ────────

  // Verify jmp instructions
  for (let pos = 0; pos < 16; pos += 4) {
    const value = view.getUint16(pos, false);
    if (value !== 0x4efa) {
      throw new Error('Not a Fred Editor file: missing jmp instructions');
    }
  }

  let dataPtr = 0;
  let basePtr = -1;
  let pos = 16;

  while (pos < 1024 && pos + 6 <= byteLength) {
    const value = view.getUint16(pos, false);

    if (value === 0x123a) {
      // move.b $x,d1
      const offset = view.getUint16(pos + 2, false); // displacement
      const nextInstr = view.getUint16(pos + 4, false);

      if (nextInstr === 0xb001) {
        // cmp.b d1,d0 -- calculate dataPtr
        // FEPlayer: dataPtr = (stream.position + stream.readUshort()) - 0x895
        // stream.position was at pos (before reading 0x123a), then +2 for the
        // first readUshort, so displacement is relative to pos.
        // Actually: the FlodJS code reads at stream.position (gets 0x123a),
        // advances position by 2 (the readUshort), then skips 2 (position += 2),
        // then reads the next ushort and checks for 0xb001.
        // When it found 0x123a: position was at `pos`, readUshort advances to pos+2,
        // position += 2 makes it pos+4, then it backs up 4 (position -= 4) to get
        // the displacement calculation: dataPtr = (position + readUshort()) - 0x895
        // position at that point = pos+4-4 = pos
        // readUshort reads the displacement at pos which is the 0x123a value itself...
        // Let me re-read the FlodJS more carefully.
        //
        // FlodJS loader:
        //   value = stream.readUshort();             // reads at position, advances +2
        //   if (value == 0x123a) {
        //     stream.position += 2;                   // skip 2 bytes (the displacement)
        //     value = stream.readUshort();             // reads next instruction
        //     if (value == 0xb001) {
        //       stream.position -= 4;                  // back to the displacement
        //       dataPtr = (stream.position + stream.readUshort()) - 0x895;
        //     }
        //   }
        //
        // So: after reading 0x123a at pos, position = pos+2
        // skip 2: position = pos+4
        // read 0xb001 at pos+4, position = pos+6
        // back 4: position = pos+2
        // read displacement at pos+2, position = pos+4
        // dataPtr = (pos+2 + displacement) - 0x895
        dataPtr = (pos + 2 + offset) - 0x895;
      }
    } else if (value === 0x214a) {
      // move.l a2,(a0)
      const nextPos = pos + 2;
      if (nextPos + 2 <= byteLength) {
        // Skip 2 bytes (position += 2 in FlodJS after reading 0x214a)
        const nextInstr = view.getUint16(nextPos + 2, false);
        if (nextInstr === 0x47fa) {
          // lea $x,a3 -- basePtr = position + displacement (signed short)
          // FlodJS: stream.position += 2; value = stream.readUshort();
          // if (value == 0x47fa) basePtr = stream.position + stream.readShort();
          //
          // After reading 0x214a at pos, position = pos+2
          // position += 2: position = pos+4
          // read 0x47fa at pos+4, position = pos+6
          // read signed short displacement at pos+6, position = pos+8
          // basePtr = pos+6 + displacement
          if (pos + 8 <= byteLength) {
            const displacement = view.getInt16(pos + 6, false);
            basePtr = pos + 6 + displacement;
          }
          break;
        }
      }
    }

    pos += 2;
  }

  if (basePtr === -1) {
    throw new Error('Not a Fred Editor file: could not locate basePtr');
  }

  // ── Step 2: Read sample definitions ───────────────────────────────────────
  // FlodJS: stream.position = dataPtr + 0x8a2; pos = stream.readUint();
  //         stream.position = basePtr + pos;
  // Then reads samples until sentinel.

  const sampleTableOffset = dataPtr + 0x8a2;
  if (sampleTableOffset + 8 > byteLength) {
    throw new Error('Fred Editor: sample table offset out of bounds');
  }

  const sampleDataOffset = readUint32(view, sampleTableOffset);
  let readPos = basePtr + sampleDataOffset;

  if (readPos >= byteLength) {
    throw new Error('Fred Editor: sample data position out of bounds');
  }

  const samples: FESample[] = [];
  let minSamplePointer = 0x7fffffff; // tracks earliest sample PCM data

  while (readPos + 64 <= byteLength) {
    const samplePointer = readUint32(view, readPos);

    if (samplePointer !== 0) {
      // Validate: pointer should be forward of current position or within file
      if ((samplePointer < readPos && samplePointer !== 0) || samplePointer >= byteLength) {
        break;
      }
      // Track minimum raw pointer (NOT basePtr-adjusted) so comparisons stay in consistent units
      if (samplePointer < minSamplePointer) {
        minSamplePointer = samplePointer;
      }
    }

    const sample: FESample = {
      pointer: samplePointer,
      loopPtr: readInt16(view, readPos + 4),
      length: readUint16(view, readPos + 6) << 1,
      relative: readUint16(view, readPos + 8),

      vibratoDelay: readUint8(view, readPos + 10),
      // skip 1 byte (readPos + 11)
      vibratoSpeed: readUint8(view, readPos + 12),
      vibratoDepth: readUint8(view, readPos + 13),

      envelopeVol: readUint8(view, readPos + 14),
      attackSpeed: readUint8(view, readPos + 15),
      attackVol: readUint8(view, readPos + 16),
      decaySpeed: readUint8(view, readPos + 17),
      decayVol: readUint8(view, readPos + 18),
      sustainTime: readUint8(view, readPos + 19),
      releaseSpeed: readUint8(view, readPos + 20),
      releaseVol: readUint8(view, readPos + 21),

      arpeggio: new Int8Array(16),
      arpeggioSpeed: 0,
      arpeggioLimit: 0,
      type: 0,
      synchro: 0,
      pulseRateNeg: 0,
      pulseRatePos: 0,
      pulseSpeed: 0,
      pulsePosL: 0,
      pulsePosH: 0,
      pulseDelay: 0,
      pulseCounter: 0,
      blendRate: 0,
      blendDelay: 0,
      blendCounter: 0,
    };

    // 16 signed bytes of arpeggio data
    for (let i = 0; i < 16; i++) {
      sample.arpeggio[i] = readInt8(view, readPos + 22 + i);
    }

    sample.arpeggioSpeed = readUint8(view, readPos + 38);
    sample.type = readInt8(view, readPos + 39);
    sample.pulseRateNeg = readInt8(view, readPos + 40);
    sample.pulseRatePos = readUint8(view, readPos + 41);
    sample.pulseSpeed = readUint8(view, readPos + 42);
    sample.pulsePosL = readUint8(view, readPos + 43);
    sample.pulsePosH = readUint8(view, readPos + 44);
    sample.pulseDelay = readUint8(view, readPos + 45);
    sample.synchro = readUint8(view, readPos + 46);
    sample.blendRate = readUint8(view, readPos + 47);
    sample.blendDelay = readUint8(view, readPos + 48);
    sample.pulseCounter = readUint8(view, readPos + 49);
    sample.blendCounter = readUint8(view, readPos + 50);
    sample.arpeggioLimit = readUint8(view, readPos + 51);

    // Skip 12 padding bytes
    readPos += 64; // 52 data bytes + 12 padding = 64 total per sample entry

    samples.push(sample);
  }

  // ── Step 3: Extract PCM sample data ───────────────────────────────────────
  // FlodJS: mixer.store(stream, stream.length - pos) where pos = basePtr + minSamplePointer
  // Then adjusts sample pointers relative to the stored memory base.

  // minSamplePointer is raw (relative to basePtr); convert to absolute file offset
  const pcmBase = minSamplePointer < 0x7fffffff ? (basePtr + minSamplePointer) : 0;
  const pcmData = pcmBase > 0 && pcmBase < byteLength
    ? new Uint8Array(buffer, pcmBase, byteLength - pcmBase)
    : new Uint8Array(0);

  // Adjust sample pointers to be relative to pcmBase
  // sample.pointer is raw (relative to basePtr); absolute = basePtr + sample.pointer
  if (pcmBase > 0) {
    for (const sample of samples) {
      if (sample.pointer > 0) {
        sample.pointer = (basePtr + sample.pointer) - pcmBase;
      }
    }
  }

  // ── Step 4: Read pattern byte stream ──────────────────────────────────────
  // FlodJS:
  //   stream.position = dataPtr + 0x8a2;
  //   len = stream.readUint();     // sampleDataOffset (already read above)
  //   pos = stream.readUint();     // patternDataOffset
  //   stream.position = basePtr + pos;
  //   patterns = ByteArray(new ArrayBuffer((len - pos)));
  //   stream.readBytes(patterns, 0, (len - pos));

  const patternDataOffset = readUint32(view, sampleTableOffset + 4);
  const patternStart = basePtr + patternDataOffset;
  const patternLen = sampleDataOffset - patternDataOffset;

  let patternBytes: Uint8Array;
  if (patternLen > 0 && patternStart + patternLen <= byteLength) {
    patternBytes = new Uint8Array(buffer, patternStart, patternLen);
  } else {
    patternBytes = new Uint8Array(0);
  }

  // ── Step 5: Read songs ────────────────────────────────────────────────────
  // FlodJS:
  //   stream.position = dataPtr + 0x895;
  //   lastSong = len = stream.readUbyte();
  //   songs.length = ++len;
  //   basePtr2 = dataPtr + 0xb0e;      // track data starts here
  //   tracksLen = patternStart - basePtr2;
  //
  // Each song has 4 tracks. Track table: sequential uint16 entries.
  // For each song, 4 x uint16 start offsets, track lengths derived from
  // adjacent offsets. Track data is uint16 arrays of pattern offsets.

  const songCountOffset = dataPtr + 0x895;
  if (songCountOffset >= byteLength) {
    throw new Error('Fred Editor: song count offset out of bounds');
  }

  const numSongs = readUint8(view, songCountOffset) + 1;
  const tracksBase = dataPtr + 0xb0e;
  const tracksLen = patternStart - tracksBase;

  const songs: FESong[] = [];
  let trackTablePos = 0;

  for (let i = 0; i < numSongs; i++) {
    const song: FESong = {
      speed: 0,
      length: 0,
      tracks: [],
    };

    for (let j = 0; j < 4; j++) {
      const trackOffset = tracksBase + trackTablePos;
      if (trackOffset + 2 > byteLength) break;

      const startOff = readUint16(view, trackOffset);

      // Determine end offset
      let endOff: number;
      if (j === 3 && i === numSongs - 1) {
        endOff = tracksLen;
      } else {
        const nextOffset = tracksBase + trackTablePos + 2;
        if (nextOffset + 2 <= byteLength) {
          endOff = readUint16(view, nextOffset);
        } else {
          endOff = tracksLen;
        }
      }

      const trackEntries = (endOff - startOff) >> 1;
      if (trackEntries > song.length) song.length = trackEntries;

      const track = new Uint32Array(Math.max(0, trackEntries));
      for (let ptr = 0; ptr < trackEntries; ptr++) {
        const entryOff = tracksBase + startOff + ptr * 2;
        if (entryOff + 2 <= byteLength) {
          track[ptr] = readUint16(view, entryOff);
        }
      }
      song.tracks[j] = track;

      trackTablePos += 2;
    }

    // Read speed for this song
    const speedOffset = dataPtr + 0x897 + i;
    if (speedOffset < byteLength) {
      song.speed = readUint8(view, speedOffset);
    }
    if (song.speed === 0) song.speed = 6;

    songs.push(song);
  }

  // ── Step 6: Build instruments from samples ────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const instId = i + 1;
    const name = `Sample ${i + 1}`;

    if (sample.length > 0 && sample.pointer >= 0 && sample.type === 0) {
      // Regular PCM sample
      const start = sample.pointer;
      const end = start + sample.length;

      if (end <= pcmData.length) {
        const pcm = pcmData.slice(start, end);

        // Calculate loop points
        let loopStart = 0;
        let loopEnd = 0;
        if (sample.loopPtr > 0) {
          loopStart = sample.loopPtr;
          loopEnd = sample.length;
        }

        instruments.push(createSamplerInstrument(
          instId,
          name,
          pcm,
          Math.min(64, sample.envelopeVol || 64),
          8287,
          loopStart,
          loopEnd
        ));
      } else {
        instruments.push(makePlaceholderInstrument(instId, name));
      }
    } else if (sample.type === 1) {
      // PWM synth instrument — use FredSynth
      const fredCfg: FredConfig = {
        envelopeVol:   sample.envelopeVol,
        attackSpeed:   sample.attackSpeed,
        attackVol:     sample.attackVol,
        decaySpeed:    sample.decaySpeed,
        decayVol:      sample.decayVol,
        sustainTime:   sample.sustainTime,
        releaseSpeed:  sample.releaseSpeed,
        releaseVol:    sample.releaseVol,
        vibratoDelay:  sample.vibratoDelay,
        vibratoSpeed:  sample.vibratoSpeed,
        vibratoDepth:  sample.vibratoDepth,
        arpeggio:      Array.from(sample.arpeggio),
        arpeggioLimit: sample.arpeggioLimit,
        arpeggioSpeed: sample.arpeggioSpeed,
        pulseRateNeg:  sample.pulseRateNeg,
        pulseRatePos:  sample.pulseRatePos,
        pulseSpeed:    sample.pulseSpeed,
        pulsePosL:     sample.pulsePosL,
        pulsePosH:     sample.pulsePosH,
        pulseDelay:    sample.pulseDelay,
        relative:      sample.relative,
      };
      instruments.push({
        id:        instId,
        name:      `${name} (PWM)`,
        type:      'synth' as const,
        synthType: 'FredSynth' as const,
        fred:      fredCfg,
        effects:   [],
        volume:    -6,
        pan:       0,
      } as unknown as InstrumentConfig);
    } else if (sample.type === 2) {
      // Wavetable blend — use Sampler approximation with the PCM data if available
      const start = sample.pointer;
      const end   = start + sample.length;
      if (sample.length > 0 && start >= 0 && end <= pcmData.length) {
        const pcm = pcmData.slice(start, end);
        instruments.push(createSamplerInstrument(
          instId,
          `${name} (Blend)`,
          pcm,
          Math.min(64, sample.envelopeVol || 64),
          8287,
          0,
          0
        ));
      } else {
        instruments.push(makePlaceholderInstrument(instId, `${name} (Blend)`));
      }
    } else {
      instruments.push(makePlaceholderInstrument(instId, name));
    }
  }

  // Ensure at least one instrument
  if (instruments.length === 0) {
    instruments.push(makePlaceholderInstrument(1, 'Default'));
  }

  // ── Step 7: Convert songs to TrackerSong patterns ─────────────────────────
  // We flatten the first song (subsong 0) into sequential patterns.
  // Each track position yields one pattern of rows.

  const trackerPatterns: Pattern[] = [];
  const songPositions: number[] = [];
  const activeSong = songs.length > 0 ? songs[0] : null;

  if (activeSong && patternBytes.length > 0) {
    const speed = activeSong.speed || 6;

    // We need to simulate the playback to extract patterns.
    // Each voice has a track position that advances through track entries.
    // A track entry is an offset into the pattern byte stream.
    // We step through the byte stream until we hit -128 (pattern end).

    // First, determine the song length by finding the max track length
    const maxTrackLen = activeSong.length;

    for (let trackPos = 0; trackPos < maxTrackLen; trackPos++) {
      const channelRows: TrackerCell[][] = [[], [], [], []];

      // For each channel, decode the pattern data starting at the
      // offset given by the track entry.
      for (let ch = 0; ch < 4; ch++) {
        const track = activeSong.tracks[ch];
        if (!track || trackPos >= track.length) {
          // Fill with empty rows
          for (let row = 0; row < 64; row++) {
            channelRows[ch].push(emptyCell());
          }
          continue;
        }

        const patOffset = track[trackPos];

        // Check for end/loop markers in track entries
        if (patOffset === 65535) {
          // End of song marker
          for (let row = 0; row < 64; row++) {
            channelRows[ch].push(emptyCell());
          }
          continue;
        }
        if (patOffset > 32767) {
          // Loop marker: (value ^ 32768) >> 1 = target track position
          // We don't loop, just fill empty
          for (let row = 0; row < 64; row++) {
            channelRows[ch].push(emptyCell());
          }
          continue;
        }

        // Decode the pattern byte stream
        const rows = decodePatternStream(patternBytes, patOffset, speed, samples);
        for (const row of rows) {
          channelRows[ch].push(row);
        }
      }

      // Normalize all channels to the same row count
      const maxRows = Math.max(
        ...channelRows.map(r => r.length),
        1
      );
      // Cap at 64 rows per pattern
      const patternLength = Math.min(maxRows, 64);

      for (let ch = 0; ch < 4; ch++) {
        while (channelRows[ch].length < patternLength) {
          channelRows[ch].push(emptyCell());
        }
        // Truncate if over 64
        if (channelRows[ch].length > patternLength) {
          channelRows[ch].length = patternLength;
        }
      }

      const channels: ChannelData[] = channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50, // Amiga LRRL hard stereo
        instrumentId: null,
        color: null,
        rows,
      }));

      const patIdx = trackerPatterns.length;
      trackerPatterns.push({
        id: `pattern-${patIdx}`,
        name: `Pattern ${patIdx}`,
        length: patternLength,
        channels,
        importMetadata: {
          sourceFormat: 'MOD' as const,
          sourceFile: filename,
          importedAt: new Date().toISOString(),
          originalChannelCount: 4,
          originalPatternCount: maxTrackLen,
          originalInstrumentCount: samples.length,
        },
      });
      songPositions.push(patIdx);
    }
  }

  // Fallback: at least one empty pattern
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename));
    songPositions.push(0);
  }

  const moduleName = filename.replace(/\.[^/.]+$/, '');
  const initialSpeed = activeSong?.speed || 6;

  return {
    name: moduleName,
    format: 'MOD' as TrackerFormat,
    patterns: trackerPatterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed,
    initialBPM: 125,
    linearPeriods: false,
  };
}

// ── Pattern byte stream decoder ─────────────────────────────────────────────

/**
 * Decode a Fred Editor pattern byte stream starting at the given offset.
 * Returns an array of TrackerCells representing the rows.
 *
 * Byte stream encoding:
 *   Positive (1-127): note value, consume 1 tick worth of rows
 *   Negative values are commands:
 *     -125 (0x83): set sample, followed by 1 byte sample index
 *     -126 (0x82): set speed, followed by 1 byte speed value
 *     -127 (0x81): portamento, followed by speed (1), note (1), delay (1)
 *     -124 (0x84): note off
 *     -128 (0x80): pattern end
 *     Other negative: duration = speed * abs(value)
 */
function decodePatternStream(
  patternBytes: Uint8Array,
  startOffset: number,
  initialSpeed: number,
  samples: FESample[]
): TrackerCell[] {
  const rows: TrackerCell[] = [];
  let pos = startOffset;
  let currentSample = 0;
  let speed = initialSpeed;
  let portaSpeed = 0;
  let portaNote = 0;
  let portaDelay = 0;
  const maxRows = 64;

  while (pos < patternBytes.length && rows.length < maxRows) {
    const value = patternBytes[pos] < 128 ? patternBytes[pos] : patternBytes[pos] - 256;
    pos++;

    if (value > 0 && value <= 127) {
      // Note trigger
      const xmNote = feNoteToXM(value);
      const instrument = currentSample + 1; // 1-based

      // Volume from sample envelope (use attackVol as initial volume)
      const smp = currentSample < samples.length ? samples[currentSample] : null;
      let vol = 0;
      if (smp) {
        vol = Math.min(64, smp.attackVol || smp.envelopeVol || 64);
      }
      const xmVolume = 0x10 + vol;

      // Build effects
      let effTyp = 0;
      let eff = 0;
      let effTyp2 = 0;
      let eff2 = 0;

      // Arpeggio from sample definition
      if (smp && smp.arpeggioLimit > 0 && smp.arpeggio[0] !== 0) {
        // Map first two arpeggio offsets to XM arpeggio effect 0xy
        const arp1 = Math.abs(smp.arpeggio[0]) & 0xF;
        const arp2 = smp.arpeggioLimit > 1
          ? Math.abs(smp.arpeggio[1]) & 0xF
          : 0;
        if (arp1 > 0 || arp2 > 0) {
          effTyp = 0x00; // Arpeggio
          eff = (arp1 << 4) | arp2;
        }
      }

      // Portamento effect if active.
      // In MOD mode, TrackerReplayer sets ch.portaTarget from row.note when effTyp === 0x03.
      // So we must: (a) put the TARGET in the note field, and (b) use the primary effect slot.
      let noteToUse = xmNote;
      if (portaDelay === 0 && portaSpeed > 0) {
        const pNote = feNoteToXM(portaNote);
        if (pNote > 0 && pNote !== xmNote) {
          effTyp = 0x03; // Tone portamento (primary slot — TrackerReplayer checks effTyp only)
          eff = Math.min(portaSpeed, 0xFF);
          effTyp2 = 0;
          eff2 = 0;
          noteToUse = pNote; // portamento TARGET so ch.portaTarget = period(pNote)
        }
      }

      // Vibrato from sample definition (only if portamento not already using primary slot)
      if (smp && smp.vibratoSpeed > 0 && smp.vibratoDepth > 0 && effTyp === 0) {
        effTyp = 0x04; // Vibrato
        const vSpeed = Math.min(smp.vibratoSpeed, 15);
        const vDepth = Math.min(smp.vibratoDepth, 15);
        eff = (vSpeed << 4) | vDepth;
      }

      rows.push({
        note: noteToUse, instrument, volume: xmVolume,
        effTyp, eff, effTyp2, eff2,
      });
    } else if (value < 0) {
      switch (value) {
        case -125: {
          // Set sample: next byte is sample index
          if (pos < patternBytes.length) {
            currentSample = patternBytes[pos];
            pos++;
          }
          break;
        }
        case -126: {
          // Set speed: next byte is speed value
          if (pos < patternBytes.length) {
            speed = patternBytes[pos];
            pos++;

            // Emit speed change effect on the current row or a new empty row
            const cell = emptyCell();
            cell.effTyp = 0x0F; // Fxx speed
            cell.eff = speed;
            rows.push(cell);
          }
          break;
        }
        case -127: {
          // Portamento: speed(1), note(1), delay(1)
          if (pos + 2 < patternBytes.length) {
            portaSpeed = patternBytes[pos] * speed;
            portaNote = patternBytes[pos + 1];
            portaDelay = patternBytes[pos + 2] * speed;
            pos += 3;
          }
          break;
        }
        case -124: {
          // Note off
          rows.push({
            note: 97, instrument: 0, volume: 0,
            effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
          });
          break;
        }
        case -128: {
          // Pattern end
          return rows;
        }
        default: {
          // Duration: adds speed * abs(value) empty ticks
          // In the tracker world, this translates to empty rows
          const duration = Math.abs(value);
          const emptyRows = Math.min(duration - 1, maxRows - rows.length);
          for (let d = 0; d < emptyRows; d++) {
            rows.push(emptyCell());
          }
          break;
        }
      }
    } else {
      // value === 0: should not normally occur, treat as empty row
      rows.push(emptyCell());
    }
  }

  return rows;
}

// ── Helper functions ────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return {
    note: 0, instrument: 0, volume: 0,
    effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  };
}

function makePlaceholderInstrument(id: number, name: string): InstrumentConfig {
  return {
    id,
    name,
    type: 'synth' as const,
    synthType: 'Synth' as const,
    effects: [],
    volume: -6,
    pan: 0,
  } as InstrumentConfig;
}

function makeEmptyPattern(filename: string): Pattern {
  return {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: (ch === 0 || ch === 3) ? -50 : 50, // Amiga LRRL hard stereo
      instrumentId: null,
      color: null,
      rows: Array.from({ length: 64 }, () => emptyCell()),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 0,
      originalInstrumentCount: 0,
    },
  };
}
