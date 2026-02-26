/**
 * SoundFXParser.ts -- SoundFX (.sfx, .sfx13) Amiga format parser
 *
 * SoundFX is a 4-channel Amiga tracker format by Linel Software.
 * Two versions:
 *   v1.0: magic "SONG" at offset 60, 16 sample slots
 *   v2.0: magic "SO31" at offset 124, 32 sample slots
 *
 * Pattern data: 64 rows per pattern, 4 bytes per row per channel:
 *   2-byte note (signed short, Amiga period), 1-byte effect+sample, 1-byte param
 *
 * Effects: arpeggio (1), pitch bend (2), filter on/off (3/4), volume +/- (5/6),
 *          step up/down (7/8), auto slide (9)
 *
 * Reference: FlodJS FXPlayer by Christian Corti (Neoart)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument, periodToNoteIndex } from './AmigaUtils';

// -- SoundFX period table (from FlodJS FXPlayer.PERIODS) ---------------------
// 67 entries: 3 octaves of Amiga periods plus padding, ending with -1 sentinel.
// Note conversion uses periodToNoteIndex() from AmigaUtils which matches against
// the standard ProTracker period table (same values minus the extended range).

// -- Binary reading helpers ---------------------------------------------------

function readUint32BE(buf: DataView, off: number): number {
  return buf.getUint32(off, false);
}

function readUint16BE(buf: DataView, off: number): number {
  return buf.getUint16(off, false);
}

function readInt16BE(buf: DataView, off: number): number {
  return buf.getInt16(off, false);
}

function readUint8(buf: DataView, off: number): number {
  return buf.getUint8(off);
}

function readString(buf: DataView, off: number, len: number): string {
  let result = '';
  for (let i = 0; i < len; i++) {
    const ch = buf.getUint8(off + i);
    if (ch === 0) break;
    result += String.fromCharCode(ch);
  }
  return result;
}

// -- SoundFX sample metadata --------------------------------------------------

interface SFXSample {
  name: string;
  length: number;      // in bytes (after <<1)
  volume: number;      // 0-64
  loop: number;        // loop start offset in bytes
  repeat: number;      // loop length in bytes (after <<1)
  pointer: number;     // offset into sample data block
}

// -- SoundFX pattern row (raw parsed) -----------------------------------------

interface SFXRow {
  note: number;        // signed 16-bit Amiga period (negative = special)
  sample: number;      // sample number (0 = none)
  effect: number;      // effect type (0-9)
  param: number;       // effect parameter
}

// -- Period to XM note conversion ---------------------------------------------

/**
 * Convert a SoundFX period value to an XM note number.
 * SoundFX uses standard Amiga periods (same table as ProTracker).
 * Returns 0 for empty, 97 for note-off/special.
 */
function sfxPeriodToNote(period: number): number {
  if (period === 0) return 0;
  if (period < 0) return 0; // negative periods are special commands, handled separately
  // Use the shared periodToNoteIndex which does closest-match
  const noteIdx = periodToNoteIndex(period);
  if (noteIdx === 0) return 0;
  // periodToNoteIndex returns 1-based (1 = C-1), XM note: C-1 = 13
  return noteIdx + 12;
}

// -- Format detection ---------------------------------------------------------

/**
 * Detect if a buffer contains a SoundFX format file.
 * Checks for "SONG" at offset 60 (v1.0) or "SO31" at offset 124 (v2.0).
 */
export function isSoundFXFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 1686) return false;
  const view = new DataView(buffer);

  // Check v1.0: "SONG" at offset 60
  const magic1 = readString(view, 60, 4);
  if (magic1 === 'SONG') return true;

  // Check v2.0: "SO31" at offset 124
  if (buffer.byteLength >= 2350) {
    const magic2 = readString(view, 124, 4);
    if (magic2 === 'SO31') return true;
  }

  return false;
}

// -- Main parser --------------------------------------------------------------

/**
 * Parse a SoundFX (.sfx, .sfx13) file into a TrackerSong.
 * Produces a fully editable MOD-format song with real sampler instruments.
 */
export async function parseSoundFXFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (buffer.byteLength < 1686) {
    throw new Error('SoundFX: file too small');
  }

  // -- Detect version ---------------------------------------------------------

  let version: 'v1' | 'v2';
  let numSampleSlots: number;
  let sampleTableOffset: number; // extra offset for v2.0 header

  const magic1 = readString(view, 60, 4);
  if (magic1 === 'SONG') {
    version = 'v1';
    numSampleSlots = 16;
    sampleTableOffset = 0;
  } else {
    if (buffer.byteLength < 2350) {
      throw new Error('SoundFX: file too small for v2.0');
    }
    const magic2 = readString(view, 124, 4);
    if (magic2 !== 'SO31') {
      throw new Error(`SoundFX: unrecognized magic bytes`);
    }
    version = 'v2';
    numSampleSlots = 32;
    sampleTableOffset = 544; // v2.0 header is 544 bytes larger
  }

  // -- Read tempo (2 bytes after magic) ---------------------------------------
  // For v1: tempo at offset 64, for v2: tempo at offset 128
  const tempoOffset = version === 'v1' ? 64 : 128;
  const tempo = readUint16BE(view, tempoOffset);

  // -- Read sample size table (at offset 0) -----------------------------------
  // Sample index 0 is unused (dummy). Entries 1..(numSampleSlots-1) are 4-byte sizes.
  let pos = 0;
  const sampleSizes: number[] = [];

  for (let i = 0; i < numSampleSlots; i++) {
    const val = readUint32BE(view, pos);
    sampleSizes.push(val);
    pos += 4;
  }

  // -- Skip 20 bytes after sample size table (FlodJS: stream.position += 20) --
  pos += 20;

  // -- Read sample metadata (30 bytes each per OpenMPT SFXSampleHeader) --
  // Bytes: name[22] + oneshotLength(2) + finetune(1) + volume(1) + loopStart(2) + loopLength(2)
  const samples: (SFXSample | null)[] = [];

  // Reconstruct sample pointers from sizes (cumulative offset)
  const samplePointers: number[] = [];
  let ptrAccum = 0;
  for (let i = 0; i < numSampleSlots; i++) {
    samplePointers.push(ptrAccum);
    if (i > 0 && sampleSizes[i] > 0) {
      ptrAccum += sampleSizes[i];
    }
  }

  for (let i = 0; i < numSampleSlots; i++) {
    if (i === 0) {
      // Sample 0 is a dummy (FlodJS creates an empty sample for it)
      samples.push(null);
      // FlodJS skips reading metadata for sample 0 (loop starts at i=1)
      // but the first 30 bytes after +20 skip correspond to sample 1 in FlodJS
      // Actually re-reading FlodJS: the loop starts at i=1 and reads metadata for
      // samples 1..(numSampleSlots-1). Sample 0 has no metadata in the file.
      continue;
    }

    if (sampleSizes[i] === 0) {
      // No sample data for this slot
      samples.push(null);
      pos += 30;
      continue;
    }

    const name = readString(view, pos, 22);
    const length = readUint16BE(view, pos + 22) << 1;
    /* finetune */ readUint8(view, pos + 24);          // not used, but read for correctness
    const volume = readUint8(view, pos + 25);          // uint8 at +25 (not uint16 at +24)
    const loop = readUint16BE(view, pos + 26);
    const repeat = readUint16BE(view, pos + 28) << 1;

    samples.push({
      name,
      length,
      volume: Math.min(volume, 64),
      loop,
      repeat,
      pointer: samplePointers[i],
    });

    pos += 30;
  }

  // -- Read song length and positions -----------------------------------------
  // Position in file: 530 + sampleTableOffset
  const songInfoOffset = 530 + sampleTableOffset;
  const songLength = readUint8(view, songInfoOffset);
  // Skip 1 byte (FlodJS: stream.position++)
  let trackPos = songInfoOffset + 2;

  const songPositions: number[] = [];
  let highestPosition = 0;

  for (let i = 0; i < songLength; i++) {
    // Track entries are stored as (pattern_number << 8) in FlodJS
    // The byte at each position is the pattern number (multiplied by 256 for internal use)
    const value = readUint8(view, trackPos);
    songPositions.push(value);
    if (value > highestPosition) highestPosition = value;
    trackPos++;
  }

  // -- Read pattern data ------------------------------------------------------
  // Pattern data starts at offset 660 + adjusted offset
  let patternDataOffset = 660 + sampleTableOffset;
  if (version === 'v2') patternDataOffset += 4; // FlodJS: if (offset) offset += 4

  // Total pattern rows: (highestPosition + 1) * 256 rows
  // Each position entry selects a block of 256 rows (64 rows * 4 channels)
  // FlodJS: higher += 256; patterns.length = higher;
  const totalPatternEntries = (highestPosition + 1) * 256;

  const rawRows: SFXRow[] = [];
  let readPos = patternDataOffset;

  for (let i = 0; i < totalPatternEntries; i++) {
    if (readPos + 4 > buffer.byteLength) {
      // Pad with empty rows if file is truncated
      rawRows.push({ note: 0, sample: 0, effect: 0, param: 0 });
      readPos += 4;
      continue;
    }

    const note = readInt16BE(view, readPos);
    const byte3 = readUint8(view, readPos + 2);
    const param = readUint8(view, readPos + 3);
    const effect = byte3 & 0x0F;
    let sampleNum = byte3 >> 4;

    // v2.0: bit 12 of note extends sample number to 16-31
    if (version === 'v2') {
      if (note & 0x1000) {
        sampleNum += 16;
        // Clear the extension bit from the note if positive
        // (FlodJS: if (row.note > 0) row.note &= 0xefff)
      }
    }

    // Validate sample number
    if (sampleNum >= numSampleSlots || samples[sampleNum] == null) {
      sampleNum = 0;
    }

    rawRows.push({
      note: (version === 'v2' && (note & 0x1000) && note > 0) ? (note & 0xEFFF) : note,
      sample: sampleNum,
      effect,
      param,
    });

    readPos += 4;
  }

  // -- Extract sample PCM data ------------------------------------------------
  // Sample data follows pattern data in the file
  const sampleDataStart = readPos;

  // -- Build instruments from samples -----------------------------------------
  const instruments: InstrumentConfig[] = [];

  for (let i = 1; i < numSampleSlots; i++) {
    const sample = samples[i];
    if (!sample || sample.length === 0) continue;

    const pcmStart = sampleDataStart + sample.pointer;
    const pcmEnd = pcmStart + sample.length;

    if (pcmEnd > buffer.byteLength) continue;

    const pcm = bytes.slice(pcmStart, pcmEnd);

    // Determine loop points
    let loopStart = 0;
    let loopEnd = 0;

    if (sample.loop > 0 && sample.repeat > 2) {
      // Sample has a loop
      loopStart = sample.loop;
      loopEnd = sample.loop + sample.repeat;
    } else if (sample.repeat > 2) {
      // repeat > 2 but loop == 0: loop from start
      loopEnd = sample.repeat;
    }

    instruments.push(
      createSamplerInstrument(
        i,
        sample.name || `Sample ${i}`,
        pcm,
        sample.volume,
        8287, // Standard Amiga C-3 sample rate
        loopStart,
        loopEnd,
      ),
    );
  }

  // -- Build patterns ---------------------------------------------------------
  // Each song position points to a block of 256 entries (64 rows * 4 channels)
  // We deduplicate: unique pattern indices map to TrackerSong patterns

  const uniquePatternIndices = [...new Set(songPositions)].sort((a, b) => a - b);
  const patternIndexMap = new Map<number, number>();
  const patterns: Pattern[] = [];

  for (let pidx = 0; pidx < uniquePatternIndices.length; pidx++) {
    const srcIdx = uniquePatternIndices[pidx];
    patternIndexMap.set(srcIdx, pidx);

    const baseRow = srcIdx * 256; // FlodJS: track[trackPos] is (patNum << 8)
    const channels: ChannelData[] = [];

    for (let ch = 0; ch < 4; ch++) {
      const rows: TrackerCell[] = [];

      for (let row = 0; row < 64; row++) {
        // FlodJS layout: patterns[value + voice.index] where value = trackPos + patternPos
        // patternPos increments by 4 each row, voice.index is 0-3
        // So: entry = baseRow + (row * 4) + ch
        const entryIdx = baseRow + (row * 4) + ch;
        const raw = entryIdx < rawRows.length
          ? rawRows[entryIdx]
          : { note: 0, sample: 0, effect: 0, param: 0 };

        let xmNote = 0;
        let instrument = 0;
        let volume = 0;
        let effTyp = 0;
        let eff = 0;

        // -- Handle note --
        if (raw.note === -3) {
          // Note -3 = "skip" / no action (FlodJS treats this as no effect)
          // Leave empty
        } else if (raw.note === -2) {
          // Note -2 = volume off (chan.volume = 0)
          xmNote = 97; // note off
        } else if (raw.note === -4) {
          // Note -4 = pattern break / jump flag
          effTyp = 0x0D; // Pattern break (Dxx)
          eff = 0;
        } else if (raw.note === -5) {
          // Note -5 = continue (no action but not skip)
          // Leave empty
        } else if (raw.note > 0) {
          xmNote = sfxPeriodToNote(raw.note);
        }

        // -- Handle sample --
        if (raw.sample > 0) {
          instrument = raw.sample;
          // Set volume from sample's default volume
          const smp = samples[raw.sample];
          if (smp) {
            volume = 0x10 + Math.min(smp.volume, 64);
          }
        }

        // -- Handle volume effects (5 = vol up, 6 = vol down) --
        // These modify volume on the same row as the note
        if (raw.effect === 5 && raw.sample > 0) {
          // Volume increase: add param to sample volume
          const smp = samples[raw.sample];
          if (smp) {
            volume = 0x10 + Math.min(smp.volume + raw.param, 64);
          }
        } else if (raw.effect === 6 && raw.sample > 0) {
          // Volume decrease: subtract param from sample volume
          const smp = samples[raw.sample];
          if (smp) {
            volume = 0x10 + Math.max(smp.volume - raw.param, 0);
          }
        }

        // -- Map SoundFX effects to XM effect codes --
        if (effTyp === 0) {
          // Only map effects if we haven't already set one (e.g., pattern break)
          switch (raw.effect) {
            case 0:
              // No effect
              break;

            case 1:
              // Arpeggio -> XM effect 0xx (arpeggio)
              if (raw.param !== 0) {
                effTyp = 0x00;
                eff = raw.param;
              }
              break;

            case 2:
              // Pitch bend (combined up/down based on param nibbles)
              // High nibble > 0: period += high nibble (pitch down)
              // High nibble == 0: period -= low nibble (pitch up)
              {
                const hi = raw.param >> 4;
                const lo = raw.param & 0x0F;
                if (hi > 0) {
                  effTyp = 0x02; // Portamento down (period increase = pitch down)
                  eff = hi;
                } else if (lo > 0) {
                  effTyp = 0x01; // Portamento up (period decrease = pitch up)
                  eff = lo;
                }
              }
              break;

            case 3:
              // Filter on -> XM E0x (set filter), param=1 (on)
              effTyp = 0x0E;
              eff = 0x01; // E01 = filter on
              break;

            case 4:
              // Filter off -> XM E0x, param=0 (off)
              effTyp = 0x0E;
              eff = 0x00; // E00 = filter off
              break;

            case 5:
              // Volume up - already handled in volume column above
              break;

            case 6:
              // Volume down - already handled in volume column above
              break;

            case 7:
              // Step up (portamento up to target) -> approximate as portamento up
              {
                const speed = raw.param & 0x0F;
                if (speed > 0) {
                  effTyp = 0x01; // Portamento up
                  eff = speed;
                }
              }
              break;

            case 8:
              // Step down (portamento down to target) -> approximate as portamento down
              {
                const speed = raw.param & 0x0F;
                if (speed > 0) {
                  effTyp = 0x02; // Portamento down
                  eff = speed;
                }
              }
              break;

            case 9:
              // Auto slide -> approximate as portamento down (auto-oscillating slide)
              // The auto slide oscillates between two points, which has no direct XM
              // equivalent. Approximate with a simple portamento.
              if (raw.param !== 0) {
                effTyp = 0x02; // Portamento down
                eff = raw.param & 0x0F;
              }
              break;

            default:
              break;
          }
        }

        rows.push({
          note: xmNote,
          instrument,
          volume,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0,
          period: raw.note > 0 ? raw.note : undefined,
        });
      }

      // Amiga LRRL panning
      const pan = (ch === 0 || ch === 3) ? -50 : 50;

      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan,
        instrumentId: null,
        color: null,
        rows,
      });
    }

    patterns.push({
      id: `pattern-${pidx}`,
      name: `Pattern ${pidx}`,
      length: 64,
      channels,
      importMetadata: {
        sourceFormat: 'MOD',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: uniquePatternIndices.length,
        originalInstrumentCount: instruments.length,
      },
    });
  }

  // -- Build song position order (map original indices to pattern array indices) --
  const mappedPositions = songPositions.map(idx => patternIndexMap.get(idx) ?? 0);

  // -- Fallback: ensure at least one pattern --
  if (patterns.length === 0) {
    patterns.push({
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
        pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null,
        color: null,
        rows: Array.from({ length: 64 }, (): TrackerCell => ({
          note: 0, instrument: 0, volume: 0,
          effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'MOD',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0,
      },
    });
    mappedPositions.push(0);
  }

  // -- Calculate BPM from tempo -----------------------------------------------
  // OpenMPT Load_sfx.cpp: BPM = (14565.0 * 122.0) / fileHeader.speed
  // where speed is the raw timer value (same as our `tempo` variable).
  const initialBPM = tempo > 0 ? Math.round((14565.0 * 122.0) / tempo) : 125;

  const moduleName = filename.replace(/\.[^/.]+$/, '');

  return {
    name: moduleName,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: mappedPositions,
    songLength: mappedPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: Math.max(32, Math.min(255, initialBPM || 125)),
    linearPeriods: false,
  };
}
