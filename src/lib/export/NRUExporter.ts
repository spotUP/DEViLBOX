/**
 * NRUExporter.ts — Export TrackerSong as NoiseRunner (.nru) binary format
 *
 * Reconstructs a valid NRU file from TrackerSong data by reversing the
 * NRUParser's decoding. NRU is a modified ProTracker format with a different
 * sample header layout and pattern cell encoding.
 *
 * Binary layout (1084-byte header):
 *   +0    31 x NRU sample header (16 bytes each = 496 bytes)
 *           +0  volume        (uint16BE, 0-64)
 *           +2  sampleAddr    (uint32BE, Amiga memory address)
 *           +6  length        (uint16BE, in words)
 *           +8  loopStartAddr (uint32BE, Amiga memory address)
 *           +12 loopLength    (uint16BE, in words)
 *           +14 finetune      (int16BE, valid only when negative)
 *   +496  454 bytes of zero padding (garbage area in original format)
 *   +950  numOrders  (uint8)
 *   +951  restartPos (uint8)
 *   +952  order list (128 bytes, uint8 each)
 *   +1080 "M.K." magic (4 bytes)
 *   +1084 pattern data (numPatterns x 64 rows x 4 channels x 4 bytes)
 *   +1084 + numPatterns*1024: sample PCM data (signed int8)
 *
 * Pattern cell (4 bytes):
 *   data[0]: effect encoding (special mapping, see NRUEncoder)
 *   data[1]: effect parameter
 *   data[2]: note value (0=empty, else (xmNote - 36) * 2)
 *   data[3]: instrument << 3
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

// ── Constants ─────────────────────────────────────────────────────────────────

const HEADER_SIZE        = 1084;
const SAMPLE_HEADER_SIZE = 16;
const NUM_SAMPLES        = 31;
const NUM_CHANNELS       = 4;
const ROWS_PER_PATTERN   = 64;
const BYTES_PER_CELL     = 4;
const BYTES_PER_PATTERN  = ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL; // 1024
const ORDER_OFFSET       = 950;
const MAGIC_OFFSET       = 1080;

// Base Amiga address for sample data placement (arbitrary valid even address)
const BASE_SAMPLE_ADDR   = 0x10000;

// ── Binary write helpers ──────────────────────────────────────────────────────

function writeU8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xFF;
}

function writeU16BE(buf: Uint8Array, off: number, val: number): void {
  buf[off]     = (val >> 8) & 0xFF;
  buf[off + 1] = val & 0xFF;
}

function writeI16BE(buf: Uint8Array, off: number, val: number): void {
  // Two's complement for signed 16-bit
  const u = val < 0 ? val + 0x10000 : val;
  buf[off]     = (u >> 8) & 0xFF;
  buf[off + 1] = u & 0xFF;
}

function writeU32BE(buf: Uint8Array, off: number, val: number): void {
  buf[off]     = (val >> 24) & 0xFF;
  buf[off + 1] = (val >> 16) & 0xFF;
  buf[off + 2] = (val >> 8) & 0xFF;
  buf[off + 3] = val & 0xFF;
}

// ── Reverse finetune: XM finetune byte -> NRU int16 ──────────────────────────

/**
 * Reverse the nruFinetune() conversion from the parser.
 *
 * Parser: idx = finetune / -72; xmFt = (idx < 8 ? idx : idx - 16) * 16
 * Reverse: idx from xmFt, then nruFt = -idx * 72
 *
 * XM finetune 0       -> NRU 0
 * XM finetune 16..112 -> idx 1..7  -> NRU -72..-504
 * XM finetune -128..-16 -> idx 8..15 -> NRU -576..-1080
 */
function reverseNRUFinetune(xmFinetune: number): number {
  if (xmFinetune === 0) return 0;

  // xmFt = (idx < 8 ? idx : idx - 16) * 16
  // so idx = xmFt / 16 if positive (1-7), or idx = xmFt / 16 + 16 if negative (8-15)
  let idx: number;
  if (xmFinetune > 0) {
    idx = Math.round(xmFinetune / 16);
  } else {
    idx = Math.round(xmFinetune / 16) + 16;
  }

  // Clamp to valid range
  idx = Math.max(0, Math.min(15, idx));
  if (idx === 0) return 0;

  return -idx * 72;
}

// ── Reverse effect encoding (same as NRUEncoder) ─────────────────────────────

function reverseNRUEffect(effTyp: number, eff: number): { d0: number; d1: number } {
  if (effTyp === 0 && eff === 0) return { d0: 0, d1: 0 };

  let d0: number;
  switch (effTyp) {
    case 0x03: d0 = 0x00; break;   // tone portamento -> d0=0
    case 0x00: d0 = 0x0C; break;   // arpeggio -> d0=0x0C
    default:   d0 = (effTyp << 2) & 0xFC; break;
  }

  return { d0, d1: eff & 0xFF };
}

// ── Extract 8-bit signed PCM from instrument ─────────────────────────────────

function extractPCM(inst: TrackerSong['instruments'][0]): Uint8Array | null {
  const sample = inst?.sample;
  if (!sample?.audioBuffer) return null;

  const wav = new DataView(sample.audioBuffer);

  // Minimal WAV parsing: find data chunk length at offset 40
  if (sample.audioBuffer.byteLength < 46) return null;

  const dataLen = wav.getUint32(40, true);
  const frames  = Math.floor(dataLen / 2);
  if (frames === 0) return null;

  const pcm = new Uint8Array(frames);
  for (let j = 0; j < frames; j++) {
    const s16 = wav.getInt16(44 + j * 2, true);
    // 16-bit signed -> 8-bit signed (stored as unsigned byte, two's complement)
    pcm[j] = (s16 >> 8) & 0xFF;
  }

  return pcm;
}

// ── Main export function ─────────────────────────────────────────────────────

export async function exportNRU(
  song: TrackerSong,
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];

  // ── Validate channel count ──────────────────────────────────────────────
  if (song.numChannels !== NUM_CHANNELS) {
    warnings.push(
      `NRU supports exactly 4 channels; song has ${song.numChannels}. ` +
      `Only the first 4 channels will be exported.`
    );
  }

  // ── Order list ──────────────────────────────────────────────────────────
  const songLen = Math.min(127, song.songPositions.length);
  if (songLen === 0) {
    warnings.push('Song has no positions; exporting with 1 position pointing to pattern 0.');
  }
  const numOrders = Math.max(1, songLen);
  const orderList: number[] = [];

  let maxPattern = 0;
  for (let i = 0; i < numOrders; i++) {
    const pat = Math.min(63, song.songPositions[i] ?? 0);
    orderList.push(pat);
    if (pat > maxPattern) maxPattern = pat;
  }

  const numPatterns = maxPattern + 1;
  const restartPos  = Math.min(numOrders - 1, song.restartPosition ?? 0);

  // ── Collect sample data ─────────────────────────────────────────────────
  interface SampleInfo {
    pcm:        Uint8Array | null;
    volume:     number;   // 0-64
    lengthW:    number;   // length in words
    loopStartW: number;   // loop start in words (relative to sample start)
    loopLenW:   number;   // loop length in words
    finetune:   number;   // NRU int16 finetune
  }

  const samples: SampleInfo[] = [];

  for (let s = 0; s < NUM_SAMPLES; s++) {
    const inst = s < song.instruments.length ? song.instruments[s] : null;

    if (!inst) {
      samples.push({ pcm: null, volume: 0, lengthW: 0, loopStartW: 0, loopLenW: 1, finetune: 0 });
      continue;
    }

    const pcm = extractPCM(inst);

    if (!pcm || pcm.length === 0) {
      samples.push({ pcm: null, volume: 0, lengthW: 0, loopStartW: 0, loopLenW: 1, finetune: 0 });
      continue;
    }

    // Volume: from instrument metadata or default 64
    const volume = Math.min(64, Math.max(0,
      inst.metadata?.modPlayback?.defaultVolume ?? 64
    ));

    // Length in words (round down to even byte count)
    const byteLen = pcm.length & ~1; // ensure even
    const lengthW = byteLen >> 1;

    // Loop info
    const loopStart = inst.sample?.loopStart ?? 0;
    const loopEnd   = inst.sample?.loopEnd ?? 0;
    const hasLoop   = inst.sample?.loop && loopEnd > loopStart;

    let loopStartW = 0;
    let loopLenW   = 1; // 1 = no loop (NRU convention)

    if (hasLoop) {
      loopStartW = Math.floor(loopStart / 2);
      const loopEndW = Math.min(lengthW, Math.ceil(loopEnd / 2));
      loopLenW = Math.max(1, loopEndW - loopStartW);
    }

    // Finetune: convert XM finetune back to NRU int16
    const xmFinetune = inst.metadata?.modPlayback?.finetune ?? 0;
    const finetune = reverseNRUFinetune(xmFinetune);

    samples.push({ pcm, volume, lengthW, loopStartW, loopLenW, finetune });
  }

  // Warn if more than 31 instruments
  if (song.instruments.length > NUM_SAMPLES) {
    warnings.push(
      `NRU supports max 31 samples; song has ${song.instruments.length}. ` +
      `Instruments beyond 31 will be dropped.`
    );
  }

  // ── Calculate total file size ───────────────────────────────────────────
  let totalSampleBytes = 0;
  for (const s of samples) {
    if (s.pcm) totalSampleBytes += s.lengthW * 2;
  }

  const totalSize = HEADER_SIZE + numPatterns * BYTES_PER_PATTERN + totalSampleBytes;
  const output = new Uint8Array(totalSize);

  // ── Write sample headers (31 x 16 bytes at offset 0) ───────────────────
  // Compute absolute Amiga addresses for each sample
  let sampleAddr = BASE_SAMPLE_ADDR;

  for (let s = 0; s < NUM_SAMPLES; s++) {
    const info = samples[s];
    const base = s * SAMPLE_HEADER_SIZE;

    writeU16BE(output, base + 0, info.volume);

    if (info.lengthW === 0) {
      // Empty sample: sampleAddr and loopStartAddr are the same, loopLength=1
      writeU32BE(output, base + 2, sampleAddr);
      writeU16BE(output, base + 6, 0);
      writeU32BE(output, base + 8, sampleAddr);
      writeU16BE(output, base + 12, 1);
      writeI16BE(output, base + 14, 0);
    } else {
      writeU32BE(output, base + 2, sampleAddr);
      writeU16BE(output, base + 6, info.lengthW);

      const loopStartAddr = sampleAddr + info.loopStartW * 2;
      writeU32BE(output, base + 8, loopStartAddr);
      writeU16BE(output, base + 12, info.loopLenW);
      writeI16BE(output, base + 14, info.finetune);

      sampleAddr += info.lengthW * 2;
    }
  }

  // ── Padding area (496..949) — zero-filled, already done ─────────────────

  // ── Order block (at offset 950) ─────────────────────────────────────────
  writeU8(output, ORDER_OFFSET, numOrders);
  writeU8(output, ORDER_OFFSET + 1, restartPos);

  for (let i = 0; i < 128; i++) {
    output[ORDER_OFFSET + 2 + i] = i < numOrders ? (orderList[i] & 0xFF) : 0;
  }

  // ── "M.K." magic (at offset 1080) ──────────────────────────────────────
  output[MAGIC_OFFSET]     = 0x4D; // M
  output[MAGIC_OFFSET + 1] = 0x2E; // .
  output[MAGIC_OFFSET + 2] = 0x4B; // K
  output[MAGIC_OFFSET + 3] = 0x2E; // .

  // ── Pattern data (at offset 1084) ──────────────────────────────────────
  for (let pIdx = 0; pIdx < numPatterns; pIdx++) {
    const pat = pIdx < song.patterns.length ? song.patterns[pIdx] : null;
    const patBase = HEADER_SIZE + pIdx * BYTES_PER_PATTERN;

    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff = patBase + (row * NUM_CHANNELS + ch) * BYTES_PER_CELL;
        const cell = pat?.channels[ch]?.rows[row];

        if (!cell) {
          // Empty cell — already zero-filled
          // But d0=0x00 means tone porta in NRU, so we need it to be an
          // empty cell. An empty cell should have d0=0 (porta), d1=0 (no param),
          // which decodes to porta with param 0 = no effect. This is correct
          // because the parser checks (modEffect !== 0 || d1 !== 0) before
          // applying the effect, and porta with param 0 does nothing.
          continue;
        }

        const note = cell.note ?? 0;
        const instrument = cell.instrument ?? 0;
        const effTyp = cell.effTyp ?? 0;
        const eff = cell.eff ?? 0;

        // Effect encoding
        const { d0, d1 } = reverseNRUEffect(effTyp, eff);
        output[cellOff + 0] = d0;
        output[cellOff + 1] = d1;

        // Note: (xmNote - 36) * 2, must be even and <= 72
        if (note > 0 && note >= 37) {
          const nruNote = ((note - 36) * 2) & 0xFF;
          output[cellOff + 2] = nruNote <= 72 ? nruNote : 0;
        } else {
          output[cellOff + 2] = 0;
        }

        // Instrument: upper 5 bits
        output[cellOff + 3] = (instrument << 3) & 0xFF;
      }
    }
  }

  // ── Sample PCM data (after patterns) ───────────────────────────────────
  let pcmCursor = HEADER_SIZE + numPatterns * BYTES_PER_PATTERN;

  for (let s = 0; s < NUM_SAMPLES; s++) {
    const info = samples[s];
    if (info.pcm && info.lengthW > 0) {
      const byteLen = info.lengthW * 2;
      output.set(info.pcm.subarray(0, byteLen), pcmCursor);
      pcmCursor += byteLen;
    }
  }

  // ── Build result ───────────────────────────────────────────────────────
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_\- ]/g, '');
  const filename = `${baseName}.nru`;

  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename,
    warnings,
  };
}
