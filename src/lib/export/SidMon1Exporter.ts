/**
 * SidMon1Exporter.ts — Export TrackerSong to SidMon 1.0 (.sid1/.smn) native format.
 *
 * Reconstructs a valid SidMon 1.0 binary from TrackerSong data by reversing the
 * parser logic in SidMon1Parser.ts.
 *
 * Binary layout (all offsets big-endian):
 *   8-byte preamble: 0x41fa <j:u16> 0xd1e8 0xffd4
 *   Offset table: 11 × u32 at position-44..position-0
 *   32-byte ID string: " SID-MON BY R.v.VLIET  (c) 1988 "
 *   Data sections (order: tracks, instruments, waveforms, patterns, pattern pointers)
 *
 * All section offsets in the offset table are relative to `position`.
 *
 * Instrument records: 32 bytes each
 *   waveform(u32) + arpeggio(16×u8) + attackSpeed(u8) + attackMax(u8)
 *   + decaySpeed(u8) + decayMin(u8) + sustain(u8) + pad(u8)
 *   + releaseSpeed(u8) + releaseMin(u8) + phaseShift(u8) + phaseSpeed(u8)
 *   + finetune(u8) + pitchFall(s8)
 *
 * Pattern rows: 5 bytes each (note, sample, effect, param, speed)
 * Tracks: 6 bytes each (pattern:u32, pad:u8, transpose:s8)
 * Pattern pointers: u32 each (byte offset into pattern data / 5 → row index)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { SidMon1Config } from '@/types/instrument/exotic';

// ── Binary write helpers ──────────────────────────────────────────────────

function writeU8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xFF;
}

function writeS8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val < 0 ? (val + 256) & 0xFF : val & 0xFF;
}

function writeU16BE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >> 8) & 0xFF;
  buf[off + 1] = val & 0xFF;
}

function writeU32BE(buf: Uint8Array, off: number, val: number): void {
  buf[off] = (val >>> 24) & 0xFF;
  buf[off + 1] = (val >>> 16) & 0xFF;
  buf[off + 2] = (val >>> 8) & 0xFF;
  buf[off + 3] = val & 0xFF;
}

function writeString(buf: Uint8Array, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0xFF : 0;
  }
}

// ── SM1 period table (from parser) ────────────────────────────────────────

const SM1_PERIODS: number[] = [
  0,
  5760,5424,5120,4832,4560,4304,4064,3840,3616,3424,3232,3048,
  2880,2712,2560,2416,2280,2152,2032,1920,1808,1712,1616,1524,
  1440,1356,1280,1208,1140,1076,1016, 960, 904, 856, 808, 762,
   720, 678, 640, 604, 570, 538, 508, 480, 452, 428, 404, 381,
   360, 339, 320, 302, 285, 269, 254, 240, 226, 214, 202, 190,
   180, 170, 160, 151, 143, 135, 127,
];

// Standard ProTracker periods for reverse mapping
const PT_PERIODS: number[] = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

/**
 * Convert XM note (1-96) to SM1 note index (1-66).
 * Parser: SM1 note → SM1_PERIODS[note] → closest PT period → XM note = ptIdx + 13
 * Reverse: XM note - 13 → ptIdx → PT_PERIODS[ptIdx] → closest SM1 period index
 */
function xmNoteToSM1(xmNote: number): number {
  if (xmNote <= 0 || xmNote > 96) return 0;
  const ptIdx = xmNote - 13;
  if (ptIdx < 0 || ptIdx >= PT_PERIODS.length) return 0;
  const period = PT_PERIODS[ptIdx];

  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 1; i < SM1_PERIODS.length; i++) {
    const d = Math.abs(SM1_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ── Main export ───────────────────────────────────────────────────────────

export interface SidMon1ExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

export async function exportSidMon1(song: TrackerSong): Promise<SidMon1ExportResult> {
  const warnings: string[] = [];
  const CHANNELS = 4;
  const ROWS_PER_PATTERN = 16;

  // ── Collect waveforms from instruments ──────────────────────────────────
  // Each waveform is 32 bytes of signed 8-bit data.
  // Build a deduplicated waveform table and map instrument → waveform index.
  const waveformTable: Int8Array[] = [];
  const waveformMap = new Map<string, number>(); // serialized wave → index

  function addWaveform(wave: number[]): number {
    const key = wave.join(',');
    const existing = waveformMap.get(key);
    if (existing !== undefined) return existing;
    const idx = waveformTable.length;
    const arr = new Int8Array(32);
    for (let i = 0; i < 32; i++) {
      arr[i] = wave[i] ?? 0;
    }
    waveformTable.push(arr);
    waveformMap.set(key, idx);
    return idx;
  }

  // Ensure at least one waveform (sine-like default)
  const defaultWave = [
    127, 100, 71, 41, 9, -22, -53, -82, -108, -127, -127, -127,
    -108, -82, -53, -22, 9, 41, 71, 100, 127, 100, 71, 41,
    9, -22, -53, -82, -108, -127, -127, -127,
  ];
  addWaveform(defaultWave);

  // ── Build instrument records ────────────────────────────────────────────
  // Each instrument is 32 bytes. SM1 instruments are 1-based, records are stored
  // sequentially starting at index 0 in the binary (instrument 1 = first record).
  const maxInstruments = Math.min(63, song.instruments.length);

  interface SM1InstrRecord {
    waveform: number;
    arpeggio: number[];
    attackSpeed: number;
    attackMax: number;
    decaySpeed: number;
    decayMin: number;
    sustain: number;
    releaseSpeed: number;
    releaseMin: number;
    phaseShift: number;
    phaseSpeed: number;
    finetune: number;
    pitchFall: number;
  }

  const instrRecords: SM1InstrRecord[] = [];

  for (let i = 0; i < maxInstruments; i++) {
    const inst = song.instruments[i];
    const sm1 = inst?.sidmon1 as SidMon1Config | undefined;

    if (sm1) {
      // Register waveforms
      const mainWaveIdx = addWaveform(sm1.mainWave ?? defaultWave);
      if (sm1.phaseShift && sm1.phaseShift > 0 && sm1.phaseWave) {
        addWaveform(sm1.phaseWave);
      }

      // Reverse finetune: parser does finetune * 67, so raw = finetune / 67
      let rawFinetune = 0;
      if (sm1.finetune !== undefined && sm1.finetune > 0) {
        rawFinetune = Math.round(sm1.finetune / 67);
        if (rawFinetune > 15) rawFinetune = 15;
      }

      // phaseShift: parser keeps the raw value (or sets to 0 if > totWaveforms)
      // For export, use the stored phaseShift as the waveform index
      let phaseShift = sm1.phaseShift ?? 0;
      if (phaseShift > 0 && sm1.phaseWave) {
        // Re-register phaseWave and use its index
        phaseShift = addWaveform(sm1.phaseWave);
      }

      instrRecords.push({
        waveform: mainWaveIdx,
        arpeggio: sm1.arpeggio ?? new Array(16).fill(0),
        attackSpeed: sm1.attackSpeed ?? 0,
        attackMax: sm1.attackMax ?? 0,
        decaySpeed: sm1.decaySpeed ?? 0,
        decayMin: sm1.decayMin ?? 0,
        sustain: sm1.sustain ?? 0,
        releaseSpeed: sm1.releaseSpeed ?? 0,
        releaseMin: sm1.releaseMin ?? 0,
        phaseShift,
        phaseSpeed: sm1.phaseSpeed ?? 0,
        finetune: rawFinetune,
        pitchFall: sm1.pitchFall ?? 0,
      });
    } else {
      // Non-SM1 instrument — write a default record
      warnings.push(`Instrument ${i + 1} has no SidMon1 config; using defaults.`);
      instrRecords.push({
        waveform: 0,
        arpeggio: new Array(16).fill(0),
        attackSpeed: 8,
        attackMax: 64,
        decaySpeed: 4,
        decayMin: 32,
        sustain: 0,
        releaseSpeed: 4,
        releaseMin: 0,
        phaseShift: 0,
        phaseSpeed: 0,
        finetune: 0,
        pitchFall: 0,
      });
    }
  }

  // Ensure at least one instrument record
  if (instrRecords.length === 0) {
    instrRecords.push({
      waveform: 0,
      arpeggio: new Array(16).fill(0),
      attackSpeed: 8,
      attackMax: 64,
      decaySpeed: 4,
      decayMin: 32,
      sustain: 0,
      releaseSpeed: 4,
      releaseMin: 0,
      phaseShift: 0,
      phaseSpeed: 0,
      finetune: 0,
      pitchFall: 0,
    });
  }

  // ── Build unique single-channel pattern blocks ──────────────────────────
  // In SM1, patterns are single-channel blocks of ROWS_PER_PATTERN rows.
  // TrackerSong patterns have 4 channels. Decompose into single-channel blocks.
  // Deduplicate identical blocks.

  interface SM1PatRow {
    note: number;   // SM1 note index (0=none, 1-66)
    sample: number; // 1-based instrument (0=none)
    effect: number;
    param: number;
    speed: number;
  }

  const patternBlocks: SM1PatRow[][] = [];
  const patternBlockMap = new Map<string, number>(); // serialized → index

  // Add an empty pattern block as index 0
  const emptyBlock: SM1PatRow[] = Array.from({ length: ROWS_PER_PATTERN }, () => ({
    note: 0, sample: 0, effect: 0, param: 0, speed: 0,
  }));
  patternBlocks.push(emptyBlock);
  patternBlockMap.set(serializeBlock(emptyBlock), 0);

  function serializeBlock(block: SM1PatRow[]): string {
    return block.map(r => `${r.note},${r.sample},${r.effect},${r.param},${r.speed}`).join('|');
  }

  function addPatternBlock(block: SM1PatRow[]): number {
    const key = serializeBlock(block);
    const existing = patternBlockMap.get(key);
    if (existing !== undefined) return existing;
    const idx = patternBlocks.length;
    patternBlocks.push(block);
    patternBlockMap.set(key, idx);
    return idx;
  }

  // ── Build track table ───────────────────────────────────────────────────
  // Each song step has 4 tracks (one per channel).
  // Each track references a pattern block index + transpose.

  interface SM1Track {
    pattern: number;   // index into patternBlocks (= index into patternPtrs)
    transpose: number; // signed byte
  }

  const trackTable: SM1Track[] = [];
  const songLen = Math.min(128, song.songPositions.length);

  for (let step = 0; step < songLen; step++) {
    const patIdx = song.songPositions[step] ?? 0;
    const pat = song.patterns[patIdx];

    for (let ch = 0; ch < CHANNELS; ch++) {
      const channel = pat?.channels[ch];
      const rows: SM1PatRow[] = [];

      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        const cell = channel?.rows[r];
        if (!cell || (cell.note === 0 && cell.instrument === 0)) {
          rows.push({ note: 0, sample: 0, effect: 0, param: 0, speed: 0 });
        } else {
          const sm1Note = xmNoteToSM1(cell.note ?? 0);
          rows.push({
            note: sm1Note,
            sample: (cell.instrument ?? 0) & 0xFF,
            effect: 0,
            param: 0,
            speed: 0,
          });
        }
      }

      // Pad to exactly ROWS_PER_PATTERN
      while (rows.length < ROWS_PER_PATTERN) {
        rows.push({ note: 0, sample: 0, effect: 0, param: 0, speed: 0 });
      }

      const blockIdx = addPatternBlock(rows);
      trackTable.push({ pattern: blockIdx, transpose: 0 });
    }
  }

  // ── Compute section sizes ────────────────────────────────────────────────

  const numWaveforms = waveformTable.length;
  const numInstruments = instrRecords.length;
  const numPatternBlocks = patternBlocks.length;
  const numTracks = trackTable.length;

  const waveformDataSize = numWaveforms * 32;
  const instrumentDataSize = numInstruments * 32;
  const patternDataSize = numPatternBlocks * ROWS_PER_PATTERN * 5;
  const patternPtrsSize = (numPatternBlocks + 1) * 4; // +1 for the first entry the parser skips
  const trackDataSize = numTracks * 6;

  // File layout:
  //   [0..7]    : 8-byte preamble
  //   [8..51]   : offset table (11 × u32 = 44 bytes), at position-44..position-1
  //   [52..83]  : 32-byte ID string (position = 52)
  //   [84..]    : data sections in this order:
  //               1. Track data
  //               2. Instrument data
  //               3. Waveform data
  //               4. Pattern data
  //               5. Pattern pointers

  const PREAMBLE_SIZE = 8;
  const OFFSET_TABLE_SIZE = 44; // 11 × u32
  const ID_STRING_SIZE = 32;
  const HEADER_SIZE = PREAMBLE_SIZE + OFFSET_TABLE_SIZE + ID_STRING_SIZE;
  const position = PREAMBLE_SIZE + OFFSET_TABLE_SIZE; // = 52

  // Data section offsets (relative to position)
  const trackDataRelOffset = HEADER_SIZE - position; // = ID_STRING_SIZE = 32
  const instrDataRelOffset = trackDataRelOffset + trackDataSize;
  const waveDataRelOffset = instrDataRelOffset + instrumentDataSize;
  const waveDataEndRelOffset = waveDataRelOffset + waveformDataSize;
  const patDataRelOffset = waveDataEndRelOffset;
  const patDataEndRelOffset = patDataRelOffset + patternDataSize;
  const patPtrsRelOffset = patDataEndRelOffset;
  const patPtrsEndRelOffset = patPtrsRelOffset + patternPtrsSize;

  const totalSize = position + patPtrsEndRelOffset;

  // ── Build the binary ────────────────────────────────────────────────────

  const output = new Uint8Array(totalSize);

  // ── Preamble ────────────────────────────────────────────────────────────
  // 0x41fa <j:u16> 0xd1e8 0xffd4
  // j = position - i - 2, with preamble at i=0: j = position - 2 = 50
  output[0] = 0x41;
  output[1] = 0xfa;
  writeU16BE(output, 2, position - 2);
  output[4] = 0xd1;
  output[5] = 0xe8;
  output[6] = 0xff;
  output[7] = 0xd4;

  // ── Offset table (11 × u32 at position-44..position-0) ─────────────────
  // The parser reads these as relative offsets from position to data sections.

  // Voice track start offsets: all voices use sequential entries in trackTable
  // Voice 0 starts at index 0, voice 1 at songLen entries offset, etc.
  // But parser reads: tracksPtr[v] = (raw - trackBase) / 6
  // trackBase at position-44, voices 1-3 at position-40,-36,-32
  // For our layout, all 4 voices are interleaved (step0ch0, step0ch1, step0ch2, step0ch3, step1ch0, ...)
  // Parser reads tracksPtr[0]=0, tracksPtr[v] = (u32(pos-44+v*4) - trackBase) / 6
  // Since tracks are interleaved by 4 channels per step, voice v starts at track index v
  // trackBase is the offset of track data from position

  writeU32BE(output, position - 44, trackDataRelOffset); // trackBase (voice 0 = start)
  // Voices 1-3: raw value such that (raw - trackBase) / 6 = voice index
  // tracksPtr[v] = v (voice v starts at track index v in interleaved layout)
  // So raw = trackBase + v * 6
  writeU32BE(output, position - 40, trackDataRelOffset + 1 * 6); // voice 1
  writeU32BE(output, position - 36, trackDataRelOffset + 2 * 6); // voice 2
  writeU32BE(output, position - 32, trackDataRelOffset + 3 * 6); // voice 3

  // Instrument section: instrBase, instrEnd (= waveStart)
  writeU32BE(output, position - 28, instrDataRelOffset);
  writeU32BE(output, position - 24, waveDataRelOffset); // instrEnd = waveStart

  // Waveform section: waveEnd
  writeU32BE(output, position - 20, waveDataEndRelOffset);

  // Unknown field at position-16 — set to waveDataEndRelOffset (safe value)
  writeU32BE(output, position - 16, waveDataEndRelOffset);

  // Pattern data: patStart, patEnd (= ppBase)
  writeU32BE(output, position - 12, patDataRelOffset);
  writeU32BE(output, position - 8, patDataEndRelOffset); // patEnd = ppBase

  // Pattern pointers end
  writeU32BE(output, position - 4, patPtrsEndRelOffset);

  // ── ID string ──────────────────────────────────────────────────────────
  writeString(output, position, ' SID-MON BY R.v.VLIET  (c) 1988 ', 32);

  // ── Track data ──────────────────────────────────────────────────────────
  // Each track: pattern(u32) + pad(u8) + transpose(s8) = 6 bytes
  let off = position + trackDataRelOffset;
  for (const track of trackTable) {
    writeU32BE(output, off, track.pattern);
    writeU8(output, off + 4, 0); // padding byte
    writeS8(output, off + 5, track.transpose);
    off += 6;
  }

  // ── Instrument data ─────────────────────────────────────────────────────
  // Each instrument record: 32 bytes
  off = position + instrDataRelOffset;
  for (const rec of instrRecords) {
    writeU32BE(output, off, rec.waveform);
    for (let k = 0; k < 16; k++) {
      writeU8(output, off + 4 + k, rec.arpeggio[k] ?? 0);
    }
    writeU8(output, off + 20, rec.attackSpeed);
    writeU8(output, off + 21, rec.attackMax);
    writeU8(output, off + 22, rec.decaySpeed);
    writeU8(output, off + 23, rec.decayMin);
    writeU8(output, off + 24, rec.sustain);
    writeU8(output, off + 25, 0); // padding
    writeU8(output, off + 26, rec.releaseSpeed);
    writeU8(output, off + 27, rec.releaseMin);
    writeU8(output, off + 28, rec.phaseShift);
    writeU8(output, off + 29, rec.phaseSpeed);
    writeU8(output, off + 30, rec.finetune);
    writeS8(output, off + 31, rec.pitchFall);
    off += 32;
  }

  // ── Waveform data ───────────────────────────────────────────────────────
  off = position + waveDataRelOffset;
  for (const wave of waveformTable) {
    for (let b = 0; b < 32; b++) {
      writeS8(output, off + b, wave[b]);
    }
    off += 32;
  }

  // ── Pattern data ────────────────────────────────────────────────────────
  // All pattern blocks concatenated, each block = ROWS_PER_PATTERN × 5 bytes
  off = position + patDataRelOffset;
  for (const block of patternBlocks) {
    for (let r = 0; r < ROWS_PER_PATTERN; r++) {
      const row = block[r];
      writeU8(output, off, row.note);
      writeU8(output, off + 1, row.sample);
      writeU8(output, off + 2, row.effect);
      writeU8(output, off + 3, row.param);
      writeU8(output, off + 4, row.speed);
      off += 5;
    }
  }

  // ── Pattern pointers ────────────────────────────────────────────────────
  // Parser: patternsBase = position + ppBase; reads from patternsBase + 4 + i*4
  //         ptr = u32(offset) / 5  (byte offset → row index)
  // The first 4 bytes at patternsBase are skipped (+4 in parser loop).
  // So we write a dummy u32 first, then one u32 per pattern block.
  off = position + patPtrsRelOffset;
  writeU32BE(output, off, 0); // skipped first entry
  off += 4;
  for (let i = 0; i < numPatternBlocks; i++) {
    // Byte offset from start of pattern data = block_index × rows × 5
    const byteOffset = i * ROWS_PER_PATTERN * 5;
    writeU32BE(output, off, byteOffset);
    off += 4;
  }

  // ── Build result ────────────────────────────────────────────────────────
  const baseName = (song.name || 'untitled')
    .replace(/\s*\[SidMon 1\.0\]\s*$/, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename: `${baseName || 'untitled'}.sid1`,
    warnings,
  };
}
