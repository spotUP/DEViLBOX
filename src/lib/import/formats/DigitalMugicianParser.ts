/**
 * DigitalMugicianParser.ts -- Digital Mugician (.dmu, .dmu2, .mug, .mug2) format parser
 *
 * Digital Mugician is a 4-channel Amiga tracker by Softeyes (1990) with wavetable
 * synthesis. Two versions exist:
 *   V1: magic " MUGICIAN/SOFTEYES 1990 " (24 bytes)
 *   V2: magic " MUGICIAN2/SOFTEYES 1990" (24 bytes) -- 7-channel mixing mode
 *
 * Supports:
 *   - Up to 8 sub-songs per file (uses first by default)
 *   - 15 wavetable effects (filter, mix, scroll, resample, negate, morph, etc.)
 *   - 128-byte wavetable synths
 *   - PCM sample instruments (V2)
 *   - Complex pitch/volume/arpeggio envelope system
 *
 * Reference: FlodJS DMPlayer by Christian Corti (Neoart)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import type { DigMugConfig, UADEChipRamInfo } from '@/types/instrument';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeDigitalMugicianCell } from '@/engine/uade/encoders/DigitalMugicianEncoder';
import { arrayBufferToBase64 } from '@/lib/import/InstrumentConverter';
import { dmIndexToNote } from './DigitalMugicianNotes';

// -- WAV helper for sample editor ------------------------------------------

/** Convert signed 8-bit PCM to a WAV data URL for the sample editor */
function pcm8ToWavDataUrl(pcm: Uint8Array, sampleRate = 8363): string {
  const n = pcm.length;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  const dst = new Uint8Array(buf, 44);
  // Amiga signed 8-bit → WAV unsigned 8-bit (center at 128)
  for (let i = 0; i < n; i++) dst[i] = (pcm[i] + 128) & 0xFF;
  return `data:audio/wav;base64,${arrayBufferToBase64(buf)}`;
}

// -- Binary reading helpers (Big Endian) ------------------------------------

function readString(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function u8(buf: Uint8Array, off: number): number {
  return buf[off];
}

function s8(buf: Uint8Array, off: number): number {
  const v = buf[off];
  return v < 128 ? v : v - 256;
}

function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}


// -- Format structures parsed from binary -----------------------------------

interface DMSong {
  title: string;
  speed: number;
  length: number;   // in steps (already <<2)
  loop: number;     // loop position flag
  loopStep: number; // loop position (already <<2)
  tracks: DMStep[]; // sequence of pattern steps (length/4 per channel)
}

interface DMStep {
  pattern: number;   // pattern index (already <<6 = offset into pattern rows)
  transpose: number; // signed transpose value
}

interface DMSample {
  wave: number;
  waveLen: number;     // in bytes (already <<1)
  volume: number;
  volumeSpeed: number;
  arpeggio: number;
  pitch: number;
  effectStep: number;
  pitchDelay: number;
  finetune: number;    // already <<6
  pitchLoop: number;
  pitchSpeed: number;
  effect: number;
  source1: number;
  source2: number;
  effectSpeed: number;
  volumeLoop: number;
  // PCM sample fields (V2 only, wave >= 32)
  pointer: number;
  sampleLength: number;
  loopOffset: number;
  repeat: number;
  name: string;
}

interface DMPatternRow {
  note: number;
  sample: number;
  effect: number;
  param: number; // signed
}

/** One replayer voice: the song header and sequence column that drive it. */
interface DMVoice {
  song: number;
  column: number;
  name: string;
  pan: number;
}

/**
 * One pool cell as the replayer plays it. The note that sounds is always the
 * row's note byte (+ transpose + finetune): the effect byte only ADDS a
 * behaviour. Effect bytes 0..63 are Pitch Bend (val1 1) whose target note is
 * the effect byte and whose speed is the parameter - a plain note carries
 * effect 0 / param 0, a bend that never moves. 0x4A (val1 12) is Note Wander:
 * no retrigger, the voice slides to the row's note.
 */
function dmCellToTracker(row: DMPatternRow, transpose: number, finetune: number, instrument: number): TrackerCell {
  const noteAt = (n: number): number => {
    const idx = n + transpose + finetune;
    return dmIndexToNote(idx);
  };
  const xmNote = noteAt(row.note);
  const val1 = row.effect < 64 ? 1 : row.effect - 62;
  const val2 = row.param;
  let effTyp = 0;
  let eff = 0;
  switch (val1) {
    case 1: { // Pitch bend from the note towards the effect byte's note
      if (val2 !== 0 && row.effect !== row.note) {
        effTyp = row.effect > row.note ? 0x01 : 0x02; // higher index = higher pitch
        eff = Math.min(Math.abs(val2), 0xFF);
      }
      break;
    }
    case 6: // Song speed
      if (val2 > 0 && val2 <= 15) { effTyp = 0x0F; eff = val2 & 0xFF; }
      break;
    case 7: // LED filter on
      effTyp = 0x0E; eff = 0x01;
      break;
    case 8: // LED filter off
      effTyp = 0x0E; eff = 0x00;
      break;
    case 12: // Note wander: slide to the row's note, no retrigger
      if (val2 !== 0) { effTyp = 0x03; eff = Math.min(Math.abs(val2), 0xFF); }
      break;
    case 13: { // Shuffle: different speeds on even/odd rows
      const lo = val2 & 0x0F;
      const hi = (val2 >> 4) & 0x0F;
      if (lo > 0 && hi > 0) { effTyp = 0x0F; eff = lo; }
      break;
    }
    default: // 2-4 no envelope restart, 5 pattern length (the grid cuts the pattern),
      // 9 switch filter, 10 no DMA, 11 arpeggio select
      break;
  }
  // DM volume comes from the instrument's envelope; no per-row volume.
  return { note: xmNote, instrument, volume: 0, effTyp, eff, effTyp2: 0, eff2: 0 };
}

// -- Format detection -------------------------------------------------------

const MAGIC_V1 = ' MUGICIAN/SOFTEYES 1990 ';
const MAGIC_V2 = ' MUGICIAN2/SOFTEYES 1990';

export function isDigitalMugicianFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 76) return false;
  const buf = new Uint8Array(buffer);
  const id = readString(buf, 0, 24);
  return id === MAGIC_V1 || id === MAGIC_V2;
}

// -- Main parser ------------------------------------------------------------

export async function parseDigitalMugicianFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (buf.length < 76) {
    throw new Error('File too small to be a Digital Mugician module');
  }

  // -- Detect version from magic string -------------------------------------
  const id = readString(buf, 0, 24);
  // V2 has 7-channel mixing mode; both V1 and V2 share the same pattern/sample format
  if (id !== MAGIC_V1 && id !== MAGIC_V2) {
    throw new Error(`Not a Digital Mugician file: magic="${id}"`);
  }

  // -- Header fields --------------------------------------------------------
  // Offset 24: UShort = flag (if == 1, arpeggios appended at end)
  const arpeggioFlag = u16BE(buf, 24);

  // Offset 26: UShort = wave data length (<<6 = number of pattern rows total)
  const waveDataLen = u16BE(buf, 26);
  const totalPatternRows = waveDataLen << 6;

  // Offset 28: 8 x UInt (32-bit) = song track indices (number of track entries / 4)
  const songTrackCounts: number[] = [];
  for (let i = 0; i < 8; i++) {
    songTrackCounts[i] = u32BE(buf, 28 + i * 4);
  }

  // Offset 60: UInt = sample count (instruments are 1-based, 0 is alias for 1)
  const sampleCount = u32BE(buf, 60);

  // Offset 64: UInt = wavetable data length (<<7 = total wavetable bytes)
  const wavetableCount = u32BE(buf, 64);
  const wavetableBytes = wavetableCount << 7;

  // Offset 68: UInt = instrument data offset (number of 32-byte instrument headers)
  const instrHeaderCount = u32BE(buf, 68);

  // Offset 72: UInt = total instrument PCM data size (V2 only)
  // const instrDataSize = u32BE(buf, 72); // Read inside loader when needed

  // -- Song headers (offset 76): 8 songs x 16 bytes each -------------------
  const songs: DMSong[] = [];
  let pos = 76;
  for (let i = 0; i < 8; i++) {
    const loop = u8(buf, pos);
    const loopStep = u8(buf, pos + 1) << 2;
    const speed = u8(buf, pos + 2);
    const length = u8(buf, pos + 3) << 2;
    const title = readString(buf, pos + 4, 12);
    songs.push({ title, speed, length, loop, loopStep, tracks: [] });
    pos += 16;
  }
  // pos is now 76 + 128 = 204

  // -- Track data (offset 204): variable per song --------------------------
  // Each song has songTrackCounts[i] * 4 steps (2 bytes per step: pattern, transpose)
  pos = 204;
  for (let i = 0; i < 8; i++) {
    const numSteps = songTrackCounts[i] << 2; // songTrackCounts[i] * 4
    for (let j = 0; j < numSteps; j++) {
      if (pos + 1 >= buf.length) break;
      const pattern = u8(buf, pos) << 6; // pattern index * 64 = row offset
      const transpose = s8(buf, pos + 1);
      songs[i].tracks.push({ pattern, transpose });
      pos += 2;
    }
  }

  // -- Instrument definitions (16 bytes each, 1-based) ----------------------
  const samples: DMSample[] = [];
  const numInstruments = sampleCount + 1; // 0 is alias for 1
  const sampleTableBase = pos; // chip RAM base address of the 16-byte instrument definitions

  for (let i = 1; i < numInstruments; i++) {
    if (pos + 16 > buf.length) break;
    const sample: DMSample = {
      wave: u8(buf, pos),
      waveLen: u8(buf, pos + 1) << 1,
      volume: u8(buf, pos + 2),
      volumeSpeed: u8(buf, pos + 3),
      arpeggio: u8(buf, pos + 4),
      pitch: u8(buf, pos + 5),
      effectStep: u8(buf, pos + 6),
      pitchDelay: u8(buf, pos + 7),
      finetune: u8(buf, pos + 8) << 6,
      pitchLoop: u8(buf, pos + 9),
      pitchSpeed: u8(buf, pos + 10),
      effect: u8(buf, pos + 11),
      source1: u8(buf, pos + 12),
      source2: u8(buf, pos + 13),
      effectSpeed: u8(buf, pos + 14),
      volumeLoop: u8(buf, pos + 15),
      pointer: 0,
      sampleLength: 0,
      loopOffset: 0,
      repeat: 0,
      name: '',
    };
    samples.push(sample);
    pos += 16;
  }
  // Set index 0 alias
  if (samples.length > 0) {
    samples.unshift(samples[0]); // samples[0] is alias for samples[1]
  }

  // -- Wavetable data (128 bytes each) --------------------------------------
  const wavetableData = new Uint8Array(wavetableBytes);
  for (let i = 0; i < wavetableBytes && pos + i < buf.length; i++) {
    wavetableData[i] = buf[pos + i];
  }
  pos += wavetableBytes;

  // -- Instrument headers (32 bytes each for PCM samples, V2) ---------------
  // File layout: ... waveforms | sample headers | TRACKS/PATTERNS | PCM audio | arpeggios
  // Tracks come BEFORE PCM audio data.
  const instrHeaderStart = pos;
  let instrDataSize = 0;  // total PCM audio bytes (offset 72), 0 for V1

  if (instrHeaderCount > 0) {
    // Sample headers end here; tracks start immediately after
    const instrDataStart = instrHeaderStart + (instrHeaderCount << 5);

    // PCM audio data follows the tracks (not the headers)
    instrDataSize = u32BE(buf, 72);
    const pcmDataOffset = instrDataStart + totalPatternRows * 4;

    // Now assign PCM info to samples with wave >= 32
    for (let i = 1; i < samples.length; i++) {
      const sample = samples[i];
      if (sample.wave < 32) continue;

      const headerOff = instrHeaderStart + ((sample.wave - 32) << 5);
      if (headerOff + 24 > buf.length) continue;  // ptrStart(4)+ptrEnd(4)+loopPtr(4)+name(12)

      const ptrStart = u32BE(buf, headerOff);
      const ptrEnd = u32BE(buf, headerOff + 4);
      const loopPtr = u32BE(buf, headerOff + 8);
      const sName = readString(buf, headerOff + 12, 12).trim();

      sample.pointer = ptrStart;
      sample.sampleLength = ptrEnd - ptrStart;
      sample.name = sName;

      if (loopPtr > 0) {
        sample.loopOffset = loopPtr - ptrStart;
        sample.repeat = sample.sampleLength - sample.loopOffset;
        if ((sample.repeat & 1) !== 0) sample.repeat--;
      } else {
        sample.loopOffset = 0;
        sample.repeat = 0;
      }

      if ((sample.pointer & 1) !== 0) sample.pointer--;
      if ((sample.sampleLength & 1) !== 0) sample.sampleLength--;

      // Adjust pointer to absolute file offset (relative to PCM audio block)
      sample.pointer += pcmDataOffset;
    }
  }

  // -- Pattern data ---------------------------------------------------------
  // Tracks start immediately after sample headers (instrHeaderCount * 32 bytes).
  // For V1 files with no PCM samples, instrHeaderCount == 0 so patterns start at instrHeaderStart.

  const patternDataStart = instrHeaderStart + (instrHeaderCount << 5);
  const patternRows: DMPatternRow[] = [];

  let ppos = patternDataStart;
  for (let i = 0; i < totalPatternRows; i++) {
    if (ppos + 4 > buf.length) {
      patternRows.push({ note: 0, sample: 0, effect: 0, param: 0 });
      ppos += 4;
      continue;
    }
    patternRows.push({
      note: u8(buf, ppos),
      sample: u8(buf, ppos + 1) & 63,
      effect: u8(buf, ppos + 2),
      param: s8(buf, ppos + 3),
    });
    ppos += 4;
  }

  // -- Arpeggio data (optional, appended at end if flag == 1) ---------------
  const arpeggios = new Uint8Array(256);
  if (arpeggioFlag === 1) {
    const patternDataEnd = patternDataStart + totalPatternRows * 4;

    // File layout: ... sample headers | patterns | PCM audio | arpeggios
    // Arpeggios come after PCM audio data.
    const arpPos = patternDataEnd + instrDataSize;

    if (arpPos < buf.length) {
      const arpLen = Math.min(256, buf.length - arpPos);
      for (let i = 0; i < arpLen; i++) {
        arpeggios[i] = buf[arpPos + i];
      }
    }
  }

  // -- Build instruments from samples + wavetable ---------------------------
  // Each DM sample index becomes one DigMugSynth instrument.
  // Instrument IDs use a simple counter; sampleToInstrumentId deduplicates.
  const instruments: InstrumentConfig[] = [];
  const sampleToInstrumentId = new Map<number, number>();
  let nextInstrId = 1;

  function getOrCreateInstrument(sampleIdx: number): number {
    if (sampleIdx <= 0 || sampleIdx >= samples.length) return 0;
    if (sampleToInstrumentId.has(sampleIdx)) return sampleToInstrumentId.get(sampleIdx)!;

    const sample = samples[sampleIdx];
    const id = nextInstrId++;
    sampleToInstrumentId.set(sampleIdx, id);

    // Extract arpeggio table (8 entries from arpeggios, starting at sample.arpeggio index)
    const arpTableArr: number[] = [];
    for (let a = 0; a < 8; a++) {
      const aidx = sample.arpeggio + a;
      arpTableArr.push(aidx < arpeggios.length ? arpeggios[aidx] : 0);
    }

    const vol = Math.min(64, sample.volume);

    // Chip RAM info: instrument defs are 1-based; sampleIdx 1 → offset 0
    const chipRam: UADEChipRamInfo = {
      moduleBase: 0,
      moduleSize: buf.byteLength,
      instrBase: sampleTableBase + (sampleIdx - 1) * 16,
      instrSize: 16,
      sections: {
        sampleTable: sampleTableBase,
      },
    };

    if (sample.wave >= 32 && sample.sampleLength > 0) {
      // PCM instrument (type=1)
      const pcmStart = sample.pointer;
      const pcmEnd = pcmStart + sample.sampleLength;
      const pcm = (pcmEnd <= buf.length && sample.sampleLength > 0)
        ? buf.slice(pcmStart, pcmEnd)
        : undefined;

      const config: DigMugConfig = {
        wavetable: [0, 0, 0, 0],
        waveBlend: 0,
        waveSpeed: 0,
        volume: vol,
        arpTable: arpTableArr,
        arpSpeed: Math.min(15, sample.pitchSpeed),
        vibSpeed: 0,
        vibDepth: 0,
        pcmData: pcm,
        loopStart: sample.loopOffset,
        loopLength: sample.repeat > 0 ? sample.repeat : 0,
      };

      // Build sample data for the sample editor
      const sampleUrl = pcm && pcm.length > 0 ? pcm8ToWavDataUrl(pcm) : undefined;
      const loopEnabled = sample.repeat > 0 && sample.loopOffset >= 0;

      instruments.push({
        id,
        name: sample.name || `PCM ${sampleIdx}`,
        type: 'synth' as const,
        synthType: 'DigMugSynth' as const,
        digMug: config,
        effects: [],
        volume: -6,
        pan: 0,
        uadeChipRam: chipRam,
        metadata: { modPlayback: { usePeriodPlayback: true, periodMultiplier: 3546895, finetune: 0 } },
        ...(sampleUrl ? {
          sample: {
            url: sampleUrl,
            sampleRate: 8363,
            baseNote: 'C4',
            detune: 0,
            loop: loopEnabled,
            loopType: loopEnabled ? 'forward' as const : 'off' as const,
            loopStart: sample.loopOffset,
            loopEnd: loopEnabled ? sample.loopOffset + sample.repeat : 0,
            reverse: false,
            playbackRate: 1.0,
          },
          parameters: { sampleUrl },
        } : {}),
      } as InstrumentConfig);

    } else if (sample.wave < 32) {
      // Wavetable synth instrument (type=0) — embed 128-byte waveform
      const waveOffset = sample.wave << 7; // wave * 128
      const waveLen = sample.waveLen > 0 ? Math.min(sample.waveLen, 128) : 128;
      const waveformData = (waveOffset + waveLen <= wavetableData.length)
        ? wavetableData.slice(waveOffset, waveOffset + waveLen)
        : undefined;

      const config: DigMugConfig = {
        wavetable: [sample.wave, sample.wave, sample.wave, sample.wave],
        waveBlend: 0,
        waveSpeed: 0,
        volume: vol,
        arpTable: arpTableArr,
        arpSpeed: Math.min(15, sample.pitchSpeed),
        vibSpeed: 0,
        vibDepth: 0,
        waveformData,
      };

      instruments.push({
        id,
        name: `Wave ${sample.wave}`,
        type: 'synth' as const,
        synthType: 'DigMugSynth' as const,
        digMug: config,
        effects: [],
        volume: -6,
        pan: 0,
        uadeChipRam: chipRam,
        metadata: { modPlayback: { usePeriodPlayback: true, periodMultiplier: 3546895, finetune: 0 } },
      } as InstrumentConfig);

    } else {
      // Placeholder for empty/unknown instrument
      instruments.push({
        id,
        name: `Instrument ${sampleIdx}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: -6,
        pan: 0,
      } as InstrumentConfig);
    }

    return id;
  }

  // -- Voices: which sequence column drives which grid channel ---------------
  // Mugician I: four voices, sub-song 0's sequence columns 0..3 (Paula 0..3).
  // Mugician II: seven voices from a PAIR of song headers (sub-song N = songs
  // 2N and 2N+1). The replayer (Mugician II_v8.asm, Init + Play) runs song 0's
  // columns 0..2 on the hardware voices AUD3, AUD1, AUD2 and song 1's columns
  // 0..3 as four software voices mixed into AUD0; song 0's column 3 is never
  // read. Position count, speed and loop come from song 0's header.
  const isV2 = id === MAGIC_V2;
  const voices: DMVoice[] = isV2
    ? [
      { song: 0, column: 0, name: 'Voice 1 (Paula 4)', pan: -50 },
      { song: 0, column: 1, name: 'Voice 2 (Paula 2)', pan: 50 },
      { song: 0, column: 2, name: 'Voice 3 (Paula 3)', pan: 50 },
      { song: 1, column: 0, name: 'Voice 4 (mixed)', pan: -50 },
      { song: 1, column: 1, name: 'Voice 5 (mixed)', pan: -50 },
      { song: 1, column: 2, name: 'Voice 6 (mixed)', pan: -50 },
      { song: 1, column: 3, name: 'Voice 7 (mixed)', pan: -50 },
    ]
    : [0, 1, 2, 3].map((c) => ({
      song: 0, column: c, name: `Channel ${c + 1}`, pan: (c === 0 || c === 3) ? -50 : 50,
    }));
  const numChannels = voices.length;

  const song = songs[0];
  if (!song || song.length === 0) {
    throw new Error('Digital Mugician file contains no song data');
  }

  const songSpeed = song.speed & 0x0f;

  // Eagerly create all declared instruments so the full list appears in the editor,
  // even if some are not referenced in the current song's patterns.
  for (let si = 1; si < numInstruments; si++) {
    getOrCreateInstrument(si);
  }

  // -- Convert to TrackerSong patterns --------------------------------------
  // One TrackerSong pattern per distinct song position. A position plays its
  // tracks until the row counter reaches 64 or the current pattern length -
  // a global the Pattern Length effect (val1 5, param 1..64) sets and that
  // persists across positions. Every voice re-applies its last effect on
  // every tick, so after a row the length is the param of the LAST voice (in
  // replayer order) whose current effect is Pattern Length.

  const numPositions = Math.floor(song.length / 4);
  const trackerPatterns: Pattern[] = [];
  const songPositions: number[] = [];
  const patternCache = new Map<string, number>();

  // DM base row (pool offset) per channel for each TrackerSong pattern, for
  // getCellFileOffset: (pattern, row, channel) -> file offset.
  const patternChannelBaseRows: number[][] = [];

  const poolRow = (rowOffset: number): DMPatternRow | null =>
    rowOffset >= 0 && rowOffset < patternRows.length ? patternRows[rowOffset] : null;

  // Replayer state carried across rows and positions.
  let patLength = 64;
  const voiceEffect = voices.map(() => 0);  // 15(a5): val1 of the voice's last note row
  const voiceParam = voices.map(() => 0);   // 13(a5): its parameter byte
  const voiceSample = voices.map(() => 1);  // 5(a5)+1: last instrument (finetune source)

  for (let posIdx = 0; posIdx < numPositions; posIdx++) {
    const steps: DMStep[] = [];
    for (const v of voices) {
      const step = songs[v.song]?.tracks[posIdx * 4 + v.column];
      if (!step) break;
      steps.push(step);
    }
    if (steps.length < numChannels) break;

    // Rows this position plays.
    let rowCount = 64;
    for (let row = 0; row < 64; row++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const cell = poolRow(steps[ch].pattern + row);
        if (!cell || cell.note === 0) continue;
        voiceEffect[ch] = cell.effect < 64 ? 1 : cell.effect - 62;
        voiceParam[ch] = cell.param & 0xFF;
        if (voiceEffect[ch] === 13) voiceEffect[ch] = 0; // shuffle clears 15(a5)
      }
      for (let ch = 0; ch < numChannels; ch++) {
        if (voiceEffect[ch] === 5 && voiceParam[ch] >= 1 && voiceParam[ch] <= 64) patLength = voiceParam[ch];
      }
      if (row + 1 === 64 || row + 1 === patLength) { rowCount = row + 1; break; }
    }

    const startSamples = voiceSample.slice();
    const cacheKey = `${rowCount}|${steps.map((s, ch) => `${s.pattern}:${s.transpose}:${startSamples[ch]}`).join('|')}`;
    const cached = patternCache.get(cacheKey);
    // Advance each voice's last-instrument state over the rows that play.
    for (let ch = 0; ch < numChannels; ch++) {
      for (let row = 0; row < rowCount; row++) {
        const cell = poolRow(steps[ch].pattern + row);
        if (cell && cell.note > 0 && cell.effect !== 0x4A && cell.sample > 0) voiceSample[ch] = cell.sample;
      }
    }
    if (cached !== undefined) {
      songPositions.push(cached);
      continue;
    }

    const patIdx = trackerPatterns.length;
    patternCache.set(cacheKey, patIdx);
    songPositions.push(patIdx);
    patternChannelBaseRows.push(steps.map((s) => s.pattern));

    const channelRows: TrackerCell[][] = steps.map((step, ch) => {
      const rows: TrackerCell[] = [];
      let lastSample = startSamples[ch];
      for (let row = 0; row < rowCount; row++) {
        const cell = poolRow(step.pattern + row);
        if (!cell || cell.note === 0) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        // Note wander (0x4A) keeps the voice's instrument; otherwise a
        // non-zero sample byte selects a new one.
        if (cell.effect !== 0x4A && cell.sample > 0) lastSample = cell.sample;
        const finetune = lastSample > 0 && lastSample < samples.length ? samples[lastSample].finetune : 0;
        rows.push(dmCellToTracker(cell, step.transpose, finetune, cell.sample > 0 ? getOrCreateInstrument(cell.sample) : 0));
      }
      return rows;
    });

    trackerPatterns.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: rowCount,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: voices[ch].name,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: voices[ch].pan,
        instrumentId: null,
        color: null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: numChannels,
        originalPatternCount: Math.floor(totalPatternRows / 64),
        originalInstrumentCount: sampleCount,
      },
    });
  }

  // Fallback: at least one empty pattern
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename, numChannels));
    songPositions.push(0);
  }

  // -- Build the restart position -------------------------------------------
  const restartPos = song.loop > 0
    ? Math.min(Math.floor(song.loopStep / 4), songPositions.length - 1)
    : 0;

  // -- Module name from first song title or filename ------------------------
  const moduleName = song.title.trim() || filename.replace(/\.[^/.]+$/, '');

  // Build uadePatternLayout with custom getCellFileOffset for DM's track indirection.
  // DM pattern data is a flat pool of single-channel 4-byte cells at patternDataStart.
  // Each TrackerSong pattern combines one channel per voice, each referencing a
  // different sub-pattern (base row offset) in the pool via the song's track sequence.
  const numDMPatterns = Math.floor(totalPatternRows / 64);
  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'digitalMugician',
    patternDataFileOffset: patternDataStart,
    bytesPerCell: 4,
    rowsPerPattern: 64,
    numChannels,
    numPatterns: numDMPatterns,
    moduleSize: buf.byteLength,
    encodeCell: encodeDigitalMugicianCell,
    decodeCell: (raw: Uint8Array): TrackerCell => {
      // byte[0] = DM note index, byte[1] = sample (6-bit), byte[2] = effect, byte[3] = param (s8)
      const dmNote = raw[0];
      const sample = raw[1] & 0x3F;
      const effect = raw[2];
      const param  = raw[3] >= 128 ? raw[3] - 256 : raw[3]; // signed

      const note = dmNote > 0 ? dmIndexToNote(dmNote) : 0;

      // Effect: 0-63 = portamento (val1=1), 64 = no effect, 65+ = effect type
      let effTyp = 0, eff = 0;
      if (effect < 64) {
        // Portamento: param is pitch slide
        if (param > 0) { effTyp = 0x01; eff = Math.min(param, 0xFF); }
        else if (param < 0) { effTyp = 0x02; eff = Math.min(-param, 0xFF); }
      } else if (effect > 64) {
        const val1 = effect - 62;
        switch (val1) {
          case 6: effTyp = 0x0F; eff = (param & 0xFF); break; // speed
          case 7: effTyp = 0x0E; eff = 0x01; break; // filter on
          case 8: effTyp = 0x0E; eff = 0x00; break; // filter off
          case 12: effTyp = 0x03; eff = (param & 0xFF); break; // tone porta
        }
      }

      // Byte-exact carrier. The 4-byte DM cell is lossy in the XM view: the note
      // index round-trips through a period-table nearest-match (and clamps at 96),
      // the sample byte drops its top 2 bits (&0x3F), and the effect byte maps
      // many-to-one onto XM effTyp/eff (most effect codes collapse to 0). Stash the
      // raw 4 source bytes in the invisible period/pan/cutoff carriers (fields the
      // channelRows grid loop never sets, so edited cells fall back to the derivation).
      return {
        note, instrument: sample, volume: 0, effTyp, eff, effTyp2: 0, eff2: 0,
        period: (raw[0] << 8) | raw[1], pan: raw[2], cutoff: raw[3],
      };
    },
    getCellFileOffset: (pattern: number, row: number, channel: number): number => {
      if (pattern < 0 || pattern >= patternChannelBaseRows.length) return patternDataStart;
      if (channel < 0 || channel >= numChannels) return patternDataStart;
      // patternChannelBaseRows[pattern][channel] = base row index in the flat pool
      const baseRow = patternChannelBaseRows[pattern][channel];
      return patternDataStart + (baseRow + row) * 4;
    },
  };

  return {
    name: moduleName,
    format: 'MOD',
    patterns: trackerPatterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: restartPos,
    numChannels,
    initialSpeed: songSpeed > 0 ? songSpeed : 6,
    initialBPM: 125,
    linearPeriods: false,
    digMugFileData: buffer.slice(0) as ArrayBuffer,
    uadePatternLayout,
  };
}

// -- Helper: empty pattern --------------------------------------------------

function makeEmptyPattern(filename: string, numChannels: number): Pattern {
  return {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
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
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 0,
      originalInstrumentCount: 0,
    },
  };
}
