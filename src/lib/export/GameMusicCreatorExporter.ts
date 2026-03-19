/**
 * GameMusicCreatorExporter.ts — Export TrackerSong as Game Music Creator (.gmc) format
 *
 * Produces a valid GMC binary file with the following layout:
 *   Header (444 bytes):
 *     15 sample headers × 16 bytes each:
 *       offset(u32BE), length(u16BE, words), zero(u8), volume(u8, 0-64),
 *       address(u32BE), loopLength(u16BE, words), dataStart(u16BE, words)
 *     3 zero bytes
 *     numOrders (u8, 1-100)
 *     100 order entries (u16BE each, patternIndex × 1024)
 *   Pattern data: numPatterns × (64 rows × 4 channels × 4 bytes/cell)
 *   Sample data: 8-bit signed PCM
 *
 * Uses encodeGameMusicCreatorCell from the encoder module for cell serialization.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { encodeGameMusicCreatorCell } from '@/engine/uade/encoders/GameMusicCreatorEncoder';

// ── Constants ──────────────────────────────────────────────────────────────────

const NUM_SAMPLES     = 15;
const NUM_CHANNELS    = 4;
const NUM_ROWS        = 64;
const SAMPLE_HDR_SIZE = 16;
const HEADER_SIZE     = NUM_SAMPLES * SAMPLE_HDR_SIZE + 3 + 1 + 100 * 2; // 444 bytes
const BYTES_PER_CELL  = 4;
const PATTERN_SIZE    = NUM_ROWS * NUM_CHANNELS * BYTES_PER_CELL; // 1024 bytes

// ── Result type ────────────────────────────────────────────────────────────────

export interface GameMusicCreatorExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

// ── Main export function ───────────────────────────────────────────────────────

export async function exportGameMusicCreator(
  song: TrackerSong,
): Promise<GameMusicCreatorExportResult> {
  const warnings: string[] = [];

  // ── Collect sample PCM data ────────────────────────────────────────────────
  // GMC supports exactly 15 sample slots. Extract 8-bit signed PCM from each.

  interface SampleInfo {
    pcm: Uint8Array;
    volume: number;       // 0-64
    loopLengthWords: number;
    lengthWords: number;
  }

  const samples: SampleInfo[] = [];

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const inst = i < song.instruments.length ? song.instruments[i] : undefined;

    if (inst?.sample?.audioBuffer) {
      const wav = new DataView(inst.sample.audioBuffer);
      const dataLen = wav.getUint32(40, true);
      const frameCount = Math.floor(dataLen / 2); // 16-bit samples → frame count
      const pcm = new Uint8Array(frameCount);

      for (let j = 0; j < frameCount; j++) {
        const s16 = wav.getInt16(44 + j * 2, true);
        // Convert 16-bit signed → 8-bit signed (two's complement)
        pcm[j] = (s16 >> 8) & 0xFF;
      }

      // Volume: use instrument volume (0-64 range), default 64
      const volume = Math.min(64, Math.max(0, inst.volume ?? 64));

      // Loop: GMC loop is at the END of the sample
      // loopLength in words (1 word = 2 bytes)
      const loopStart = inst.sample.loopStart ?? 0;
      const loopEnd = inst.sample.loopEnd ?? 0;
      let loopLengthWords = 0;
      if (loopEnd > loopStart) {
        loopLengthWords = Math.ceil((loopEnd - loopStart) / 2);
      }

      // Length in words
      const lengthWords = Math.ceil(frameCount / 2);

      samples.push({ pcm, volume, loopLengthWords, lengthWords });
    } else {
      samples.push({ pcm: new Uint8Array(0), volume: 0, loopLengthWords: 0, lengthWords: 0 });
    }
  }

  if (song.instruments.length > NUM_SAMPLES) {
    warnings.push(
      `GMC supports max ${NUM_SAMPLES} samples; ${song.instruments.length - NUM_SAMPLES} instruments were dropped.`,
    );
  }

  // ── Determine unique patterns and order list ───────────────────────────────
  // GMC supports up to 100 order entries. Each order value = patternIndex × 1024.

  const numPatterns = song.patterns.length;
  const numOrders = Math.min(100, song.songPositions.length);

  if (song.songPositions.length > 100) {
    warnings.push(
      `GMC supports max 100 order positions; truncated from ${song.songPositions.length}.`,
    );
  }

  if (numPatterns > 64) {
    warnings.push(
      `GMC typically supports up to 64 patterns; song has ${numPatterns}.`,
    );
  }

  // ── Calculate sample data offsets ──────────────────────────────────────────
  // Sample data follows immediately after all pattern data.
  const sampleDataStart = HEADER_SIZE + numPatterns * PATTERN_SIZE;

  // Compute each sample's file offset (must be even)
  const sampleOffsets: number[] = [];
  let currentOffset = sampleDataStart;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    if (samples[i].pcm.length > 0) {
      // Ensure even alignment
      if (currentOffset & 1) currentOffset++;
      sampleOffsets.push(currentOffset);
      currentOffset += samples[i].pcm.length;
      // Pad to even if needed
      if (currentOffset & 1) currentOffset++;
    } else {
      sampleOffsets.push(0);
    }
  }

  const totalFileSize = currentOffset;

  // ── Allocate output buffer ─────────────────────────────────────────────────

  const output = new Uint8Array(totalFileSize);
  const view = new DataView(output.buffer);
  let pos = 0;

  // ── Write sample headers (15 × 16 bytes) ──────────────────────────────────

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const s = samples[i];
    const offset = sampleOffsets[i];

    // offset (u32BE) — absolute file offset to sample data
    view.setUint32(pos, offset, false); pos += 4;
    // length (u16BE, in words)
    view.setUint16(pos, s.lengthWords & 0x7FFF, false); pos += 2;
    // zero byte
    view.setUint8(pos, 0); pos += 1;
    // volume (u8, 0-64)
    view.setUint8(pos, s.volume & 0x7F); pos += 1;
    // address (u32BE) — set to same as offset for simplicity
    view.setUint32(pos, offset, false); pos += 4;
    // loopLength (u16BE, in words)
    view.setUint16(pos, s.loopLengthWords & 0xFFFF, false); pos += 2;
    // dataStart (u16BE, in words) — 0 means start from beginning
    view.setUint16(pos, 0, false); pos += 2;
  }

  // ── Write 3 zero bytes ─────────────────────────────────────────────────────
  output[pos++] = 0;
  output[pos++] = 0;
  output[pos++] = 0;

  // ── Write numOrders (u8) ───────────────────────────────────────────────────
  output[pos++] = numOrders;

  // ── Write 100 order entries (u16BE, patternIndex × 1024) ───────────────────
  for (let i = 0; i < 100; i++) {
    const patIdx = i < numOrders ? (song.songPositions[i] ?? 0) : 0;
    view.setUint16(pos, (patIdx * 1024) & 0xFFFF, false);
    pos += 2;
  }

  // ── Write pattern data ─────────────────────────────────────────────────────
  // Each pattern: 64 rows × 4 channels × 4 bytes/cell

  for (let pat = 0; pat < numPatterns; pat++) {
    const pattern = song.patterns[pat];

    for (let row = 0; row < NUM_ROWS; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cell = pattern.channels[ch]?.rows[row];
        const cellData = cell
          ? encodeGameMusicCreatorCell(cell)
          : new Uint8Array(4);

        output.set(cellData, pos);
        pos += BYTES_PER_CELL;
      }
    }
  }

  // ── Write sample data ──────────────────────────────────────────────────────

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const s = samples[i];
    if (s.pcm.length === 0) continue;

    // Pad to reach the computed offset
    while (pos < sampleOffsets[i]) {
      output[pos++] = 0;
    }

    output.set(s.pcm, pos);
    pos += s.pcm.length;

    // Pad to even
    if (pos & 1) {
      output[pos++] = 0;
    }
  }

  // ── Build result ───────────────────────────────────────────────────────────

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const data = new Blob([output.buffer], { type: 'application/octet-stream' });

  return {
    data,
    filename: `${baseName}.gmc`,
    warnings,
  };
}
