/**
 * DSSExporter.ts — Export TrackerSong as Digital Sound Studio (.dss) format
 *
 * Produces a valid DSS file matching the binary layout parsed by
 * DigitalSoundStudioParser.ts. The format uses 4 channels, 31 instrument
 * slots, 64-row patterns, and big-endian byte order throughout.
 *
 * File layout (big-endian):
 *   0x000   4 bytes   Magic "MMU2"
 *   0x004   4 bytes   Offset to first sample data (informational)
 *   0x008   1 byte    Song tempo (BPM; 0 = 125)
 *   0x009   1 byte    Song speed
 *   0x00A   31*46     Sample information (31 slots, 0x2E bytes each)
 *   0x59C   2 bytes   Number of positions (<=128)
 *   0x59E   128 bytes Position list
 *   0x61E   N*1024    Pattern data
 *   (remainder)       Sample PCM data (8-bit signed)
 *
 * Cell encoding (4 bytes):
 *   AAAAABBB BBBBBBBB CCCCCCCC DDDDDDDD
 *   A = sample number (5 bits)
 *   B = period (11 bits)
 *   C = effect number
 *   D = effect argument
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Constants ────────────────────────────────────────────────────────────────

const CHANNELS         = 4;
const NUM_SAMPLES      = 31;
const SAMPLE_INFO_SIZE = 0x2e; // 46 bytes
const ROWS_PER_PATTERN = 64;
const BYTES_PER_CELL   = 4;
const BYTES_PER_ROW    = CHANNELS * BYTES_PER_CELL;  // 16
const BYTES_PER_PATTERN = ROWS_PER_PATTERN * BYTES_PER_ROW; // 1024

const HEADER_SIZE      = 0x00a; // magic (4) + sampleDataOffset (4) + tempo (1) + speed (1)
const SAMPLE_INFO_BASE = HEADER_SIZE;
const NUM_POSITIONS_OFF = 0x59c;
const POSITION_LIST_OFF = 0x59e;
const PATTERN_DATA_OFF  = 0x61e;

// DSS period table (finetune 0) — 48 entries, 4 octaves x 12 notes
// Parser maps index + 13 = XM note, so XM note - 13 = index
const DSS_PERIODS_FT0 = [
  1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  906,
   856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453,
   428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
   214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
];

// ── Utility ──────────────────────────────────────────────────────────────────

function writeU8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xff;
}

function writeU16BE(buf: Uint8Array, off: number, val: number): void {
  buf[off]     = (val >> 8) & 0xff;
  buf[off + 1] = val & 0xff;
}

function writeU32BE(buf: Uint8Array, off: number, val: number): void {
  buf[off]     = (val >> 24) & 0xff;
  buf[off + 1] = (val >> 16) & 0xff;
  buf[off + 2] = (val >> 8) & 0xff;
  buf[off + 3] = val & 0xff;
}

function writeString(buf: Uint8Array, off: number, str: string, len: number): void {
  for (let i = 0; i < len; i++) {
    buf[off + i] = i < str.length ? str.charCodeAt(i) & 0x7f : 0;
  }
}

/**
 * Convert XM note (1-96) to Amiga period using finetune 0 table.
 * Parser: xmNote = periodTableIndex + 13, so index = xmNote - 13.
 */
function xmNoteToPeriod(xmNote: number): number {
  if (xmNote === 0 || xmNote === 97) return 0;
  const idx = xmNote - 13;
  if (idx >= 0 && idx < DSS_PERIODS_FT0.length) return DSS_PERIODS_FT0[idx]!;
  return 0;
}

/**
 * Reverse-translate XM effect to DSS effect.
 * Exact reverse of DigitalSoundStudioParser's switch statement.
 */
function reverseEffect(effTyp: number, eff: number): { effect: number; effectArg: number } {
  if (effTyp === 0 && eff === 0) return { effect: 0, effectArg: 0 };

  switch (effTyp) {
    case 0x00: return { effect: 0x00, effectArg: eff }; // Arpeggio
    case 0x01: return { effect: 0x01, effectArg: eff }; // Portamento up
    case 0x02: return { effect: 0x02, effectArg: eff }; // Portamento down
    case 0x03: return { effect: 0x1B, effectArg: eff }; // Tone portamento -> DSS 0x1B
    case 0x0B: return { effect: 0x06, effectArg: eff }; // Position jump -> DSS 0x06
    case 0x0C: return { effect: 0x03, effectArg: eff }; // Set volume -> DSS 0x03
    case 0x0F: // Set speed/tempo
      if (eff >= 32) return { effect: 0x0B, effectArg: eff }; // BPM -> DSS 0x0B
      return { effect: 0x05, effectArg: eff }; // Speed -> DSS 0x05
    default: return { effect: 0, effectArg: 0 };
  }
}

/**
 * Extract 8-bit signed PCM from an instrument's sample audioBuffer (WAV format).
 * Returns null if no sample data available.
 */
function extractPCM(inst: { sample?: { audioBuffer?: ArrayBuffer } }): Uint8Array | null {
  if (!inst?.sample?.audioBuffer) return null;
  const wav = new DataView(inst.sample.audioBuffer);
  if (wav.byteLength < 44) return null;
  const dataLen = wav.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  if (frames === 0) return null;
  const pcm = new Uint8Array(frames);
  for (let j = 0; j < frames; j++) {
    const s16 = wav.getInt16(44 + j * 2, true);
    pcm[j] = (s16 >> 8) & 0xff; // 16-bit signed -> 8-bit signed (two's complement)
  }
  return pcm;
}

// ── Main Exporter ────────────────────────────────────────────────────────────

export async function exportDSS(
  song: TrackerSong
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];

  // ── Song positions ──────────────────────────────────────────────────────
  const positions = song.songPositions.slice(0, 128);
  const numPositions = positions.length || 1;
  if (song.songPositions.length > 128) {
    warnings.push(`Song has ${song.songPositions.length} positions; truncated to 128.`);
  }

  // ── Determine number of patterns ────────────────────────────────────────
  const highestPatIdx = Math.max(0, ...positions);
  const numPatterns = highestPatIdx + 1;

  if (song.numChannels > CHANNELS) {
    warnings.push(`DSS supports 4 channels; channels 5+ will be dropped.`);
  }

  // ── Collect sample data from instruments ─────────────────────────────────
  const samplePCMs: (Uint8Array | null)[] = [];
  const sampleInfos: Array<{
    name: string;
    length: number;      // words (one-shot)
    loopStart: number;   // byte offset relative to sample data block
    loopLength: number;  // words
    finetune: number;    // 0-15
    volume: number;      // 0-64
    frequency: number;   // informational
  }> = [];

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const inst = song.instruments[i];
    if (!inst) {
      samplePCMs.push(null);
      sampleInfos.push({ name: '', length: 0, loopStart: 0, loopLength: 0, finetune: 0, volume: 0, frequency: 0 });
      continue;
    }

    const pcm = extractPCM(inst);
    if (!pcm || pcm.length === 0) {
      samplePCMs.push(null);
      sampleInfos.push({
        name: (inst.name || '').slice(0, 30),
        length: 0, loopStart: 0, loopLength: 0,
        finetune: 0, volume: 0, frequency: 0,
      });
      continue;
    }

    const sample = inst.sample;
    const loopStartSamples = sample?.loopStart ?? 0;
    const loopEndSamples   = sample?.loopEnd ?? 0;
    const hasLoop = loopEndSamples > loopStartSamples;

    // DSS stores one-shot length and loop length separately.
    // Total PCM = one-shot + loop portion.
    // one-shot length in words = loopStart / 2 (if looping), else total / 2
    // loop length in words = (loopEnd - loopStart) / 2
    let oneShotWords: number;
    let loopLenWords: number;

    if (hasLoop) {
      oneShotWords = Math.floor(loopStartSamples / 2);
      loopLenWords = Math.floor((loopEndSamples - loopStartSamples) / 2);
      if (loopLenWords < 2) loopLenWords = 2; // minimum loop length
    } else {
      oneShotWords = Math.floor(pcm.length / 2);
      loopLenWords = 0;
    }

    const vol = Math.min(64, Math.max(0, Math.round((inst.volume ?? 1) * 64)));
    const ft = (inst as unknown as Record<string, unknown>).finetune as number | undefined;
    const finetune = (ft != null) ? ft & 0x0f : 0;

    samplePCMs.push(pcm);
    sampleInfos.push({
      name: (inst.name || '').slice(0, 30),
      length: oneShotWords,
      loopStart: 0, // will be computed after layout
      loopLength: loopLenWords,
      finetune,
      volume: vol,
      frequency: 0,
    });
  }

  // ── Compute sample data layout ──────────────────────────────────────────
  // Each sample's startOffset is relative to the sample data block base.
  // loopStart is also relative to sample data block base.
  const sampleStartOffsets: number[] = [];
  let sampleBlockCursor = 0;

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const pcm = samplePCMs[i];
    sampleStartOffsets.push(sampleBlockCursor);
    if (pcm && pcm.length > 0) {
      // Ensure even alignment
      const len = pcm.length & ~1; // mask to even
      sampleBlockCursor += len;
    }
  }

  // Now set loopStart (byte offset relative to sample data block base)
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const info = sampleInfos[i]!;
    if (info.loopLength > 0) {
      // loopStart = startOffset + one-shot bytes
      info.loopStart = sampleStartOffsets[i]! + info.length * 2;
    } else {
      info.loopStart = 0;
    }
  }

  const totalSampleBytes = sampleBlockCursor;

  // ── Calculate file size ──────────────────────────────────────────────────
  const sampleDataBase = PATTERN_DATA_OFF + numPatterns * BYTES_PER_PATTERN;
  const totalFileSize = sampleDataBase + totalSampleBytes;

  const output = new Uint8Array(totalFileSize);

  // ── Magic "MMU2" ─────────────────────────────────────────────────────────
  output[0] = 0x4d; // M
  output[1] = 0x4d; // M
  output[2] = 0x55; // U
  output[3] = 0x32; // 2

  // ── Offset to first sample data (informational) ──────────────────────────
  writeU32BE(output, 0x004, sampleDataBase);

  // ── Tempo and speed ──────────────────────────────────────────────────────
  writeU8(output, 0x008, (song.initialBPM ?? 125) & 0xff);
  writeU8(output, 0x009, (song.initialSpeed ?? 6) & 0xff);

  // ── Sample information (31 entries x 46 bytes) ───────────────────────────
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const base = SAMPLE_INFO_BASE + i * SAMPLE_INFO_SIZE;
    const info = sampleInfos[i]!;

    // 0x00: sample name (30 bytes)
    writeString(output, base + 0x00, info.name, 30);

    // 0x1E: start offset (4 bytes, masked to even)
    writeU32BE(output, base + 0x1e, sampleStartOffsets[i]! & 0xfffffffe);

    // 0x22: length in words (one-shot)
    writeU16BE(output, base + 0x22, info.length & 0xffff);

    // 0x24: loop start (4 bytes)
    writeU32BE(output, base + 0x24, info.loopStart);

    // 0x28: loop length in words
    writeU16BE(output, base + 0x28, info.loopLength & 0xffff);

    // 0x2A: finetune
    writeU8(output, base + 0x2a, info.finetune & 0x0f);

    // 0x2B: volume
    writeU8(output, base + 0x2b, info.volume & 0x7f);

    // 0x2C: frequency (informational, 2 bytes)
    writeU16BE(output, base + 0x2c, info.frequency & 0xffff);
  }

  // ── Number of positions ──────────────────────────────────────────────────
  writeU16BE(output, NUM_POSITIONS_OFF, numPositions);

  // ── Position list (128 bytes) ────────────────────────────────────────────
  for (let i = 0; i < 128; i++) {
    output[POSITION_LIST_OFF + i] = i < numPositions ? (positions[i] ?? 0) : 0;
  }

  // ── Pattern data ─────────────────────────────────────────────────────────
  for (let p = 0; p < numPatterns; p++) {
    const pat = song.patterns[p];
    const patBase = PATTERN_DATA_OFF + p * BYTES_PER_PATTERN;

    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < CHANNELS; ch++) {
        const off = patBase + row * BYTES_PER_ROW + ch * BYTES_PER_CELL;

        const cell = pat?.channels[ch]?.rows[row];
        const sample = cell?.instrument ?? 0;
        const period = xmNoteToPeriod(cell?.note ?? 0);
        const { effect, effectArg } = reverseEffect(cell?.effTyp ?? 0, cell?.eff ?? 0);

        // Byte 0: sample[4:0] << 3 | period[10:8]
        output[off]     = ((sample & 0x1f) << 3) | ((period >> 8) & 0x07);
        // Byte 1: period[7:0]
        output[off + 1] = period & 0xff;
        // Byte 2: effect number
        output[off + 2] = effect & 0xff;
        // Byte 3: effect argument
        output[off + 3] = effectArg & 0xff;
      }
    }
  }

  // ── Sample PCM data ──────────────────────────────────────────────────────
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const pcm = samplePCMs[i];
    if (pcm && pcm.length > 0) {
      const absOffset = sampleDataBase + sampleStartOffsets[i]!;
      const len = pcm.length & ~1; // even length
      output.set(pcm.subarray(0, len), absOffset);
    }
  }

  // ── Instrument count warning ─────────────────────────────────────────────
  if (song.instruments.length > NUM_SAMPLES) {
    warnings.push(`DSS supports 31 instruments; instruments 32+ will be dropped.`);
  }

  const baseName = (song.name || 'untitled')
    .replace(/\s*\[Digital Sound Studio\]\s*$/, '')
    .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
    .trim() || 'untitled';

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename: `${baseName}.dss`,
    warnings,
  };
}
