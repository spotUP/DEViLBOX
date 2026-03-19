/**
 * IMSExporter.ts — Export TrackerSong as Images Music System (.ims) format
 *
 * Reconstructs a valid IMS binary from TrackerSong pattern data.
 * IMS is a 4-channel Amiga tracker format with no magic bytes.
 *
 * Binary layout (all big-endian):
 *   +0    song name (20 bytes, null-padded ASCII)
 *   +20   31 x sample headers (30 bytes each = 930 bytes total)
 *         Each: name(22) + length(u16BE words) + finetune(i8) + volume(u8)
 *               + loopStart(u16BE words) + loopLen(u16BE words)
 *   +950  numOrders  (u8)
 *   +951  restartPos (u8)
 *   +952  order list (128 bytes, u8 each)
 *   +1080 sampleDataOffset (u32BE)
 *   +1084 pattern data (3 bytes/cell x 64 rows x 4 channels per pattern)
 *   +sampleDataOffset: sample PCM data (signed int8, sequential per instrument)
 *
 * Reference: IMSParser.ts (import) and IMSEncoder.ts (cell encoding)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { encodeIMSCell } from '@/engine/uade/encoders/IMSEncoder';

// ── Constants ─────────────────────────────────────────────────────────────────

const HEADER_SIZE = 1084;
const BYTES_PER_CELL = 3;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
const BYTES_PER_PATTERN = BYTES_PER_CELL * ROWS_PER_PATTERN * NUM_CHANNELS; // 768
const MAX_SAMPLES = 31;

// ── Helpers ───────────────────────────────────────────────────────────────────

function writeU16BE(view: DataView, off: number, val: number): void {
  view.setUint16(off, val, false);
}

function writeU32BE(view: DataView, off: number, val: number): void {
  view.setUint32(off, val, false);
}

function writeString(output: Uint8Array, off: number, str: string, maxLen: number): void {
  for (let i = 0; i < maxLen; i++) {
    output[off + i] = i < str.length ? str.charCodeAt(i) & 0x7F : 0;
  }
}

function emptyCell(): { note: number; instrument: number; volume: number; effTyp: number; eff: number; effTyp2: number; eff2: number } {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

// ── Main export function ──────────────────────────────────────────────────────

export async function exportIMS(
  song: TrackerSong
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];

  // ── Validate channel count ────────────────────────────────────────────
  if (song.numChannels > NUM_CHANNELS) {
    warnings.push(
      `IMS supports 4 channels but song has ${song.numChannels}. Extra channels will be truncated.`
    );
  }

  // ── Collect sample PCM data ───────────────────────────────────────────
  const maxInstruments = Math.min(song.instruments.length, MAX_SAMPLES);
  const samplePCMs: Uint8Array[] = [];
  const sampleLengths: number[] = [];    // in words
  const sampleLoopStarts: number[] = []; // in words
  const sampleLoopLens: number[] = [];   // in words
  const sampleVolumes: number[] = [];
  const sampleNames: string[] = [];

  for (let i = 0; i < MAX_SAMPLES; i++) {
    if (i < maxInstruments) {
      const inst = song.instruments[i];
      const name = inst?.name ?? `Sample ${i + 1}`;
      sampleNames.push(name);

      if (inst?.sample?.audioBuffer) {
        const wav = new DataView(inst.sample.audioBuffer);
        // Find data chunk in WAV
        let dataOffset = 12;
        let dataLen = 0;
        while (dataOffset + 8 <= inst.sample.audioBuffer.byteLength) {
          const chunkId = String.fromCharCode(
            wav.getUint8(dataOffset),
            wav.getUint8(dataOffset + 1),
            wav.getUint8(dataOffset + 2),
            wav.getUint8(dataOffset + 3),
          );
          const chunkSize = wav.getUint32(dataOffset + 4, true);
          if (chunkId === 'data') {
            dataLen = chunkSize;
            dataOffset += 8;
            break;
          }
          dataOffset += 8 + chunkSize;
          if (chunkSize & 1) dataOffset++;
        }
        const frames = Math.floor(dataLen / 2);
        const pcm = new Uint8Array(frames);
        for (let j = 0; j < frames; j++) {
          const s16 = wav.getInt16(dataOffset + j * 2, true);
          pcm[j] = (s16 >> 8) & 0xFF; // 16-bit signed -> 8-bit signed (two's complement)
        }
        samplePCMs.push(pcm);

        // Length in words (2 bytes per word)
        const lenWords = Math.ceil(frames / 2);
        sampleLengths.push(lenWords);

        // Loop info (stored as byte offsets in TrackerSong, convert to words)
        const loopStart = inst.sample?.loopStart ?? 0;
        const loopEnd = inst.sample?.loopEnd ?? 0;
        const loopStartWords = Math.floor(loopStart / 2);
        const loopLenWords = loopEnd > loopStart
          ? Math.ceil((loopEnd - loopStart) / 2)
          : 1; // IMS: loopLen <= 1 means no loop
        if (loopEnd > loopStart) {
          sampleLoopStarts.push(loopStartWords);
          sampleLoopLens.push(loopLenWords);
        } else {
          sampleLoopStarts.push(0);
          sampleLoopLens.push(1); // 1 = no loop in IMS
        }

        // Volume: convert from dB (-60..0) to 0-64
        const vol = inst?.volume != null
          ? Math.round(Math.pow(10, inst.volume / 20) * 64)
          : 64;
        sampleVolumes.push(Math.max(0, Math.min(64, vol)));
      } else {
        samplePCMs.push(new Uint8Array(0));
        sampleLengths.push(0);
        sampleLoopStarts.push(0);
        sampleLoopLens.push(1);
        sampleVolumes.push(0);
      }
    } else {
      sampleNames.push(`Sample ${i + 1}`);
      samplePCMs.push(new Uint8Array(0));
      sampleLengths.push(0);
      sampleLoopStarts.push(0);
      sampleLoopLens.push(1);
      sampleVolumes.push(0);
    }
  }

  // ── Encode pattern data ───────────────────────────────────────────────
  const numPatterns = song.patterns.length || 1;
  const patternBlockSize = numPatterns * BYTES_PER_PATTERN;
  const patternBytes = new Uint8Array(patternBlockSize);

  for (let p = 0; p < numPatterns; p++) {
    const pat = song.patterns[p];
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cell = pat?.channels[ch]?.rows[row] ?? emptyCell();
        const encoded = encodeIMSCell(cell);
        const offset =
          p * BYTES_PER_PATTERN +
          (row * NUM_CHANNELS + ch) * BYTES_PER_CELL;
        patternBytes.set(encoded, offset);
      }
    }

    if (pat && pat.length > ROWS_PER_PATTERN) {
      warnings.push(
        `Pattern ${p} has ${pat.length} rows but IMS supports max ${ROWS_PER_PATTERN}. Extra rows truncated.`
      );
    }
  }

  // ── Calculate sample data offset ──────────────────────────────────────
  const sampleDataOffset = HEADER_SIZE + patternBlockSize;

  // ── Calculate total sample PCM size ───────────────────────────────────
  const totalSampleBytes = samplePCMs.reduce((s, p) => s + p.length, 0);

  // ── Total file size ───────────────────────────────────────────────────
  const totalSize = sampleDataOffset + totalSampleBytes;

  // ── Write the file ────────────────────────────────────────────────────
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // +0: Song name (20 bytes, null-padded)
  writeString(output, 0, song.name || 'Untitled', 20);

  // +20: 31 sample headers (30 bytes each)
  for (let s = 0; s < MAX_SAMPLES; s++) {
    const base = 20 + s * 30;
    writeString(output, base, sampleNames[s], 22);              // +0: name (22 bytes)
    writeU16BE(view, base + 22, sampleLengths[s]);              // +22: length (words)
    output[base + 24] = 0;                                       // +24: finetune (always 0 for IMS)
    output[base + 25] = sampleVolumes[s];                        // +25: volume (0-64)
    writeU16BE(view, base + 26, sampleLoopStarts[s]);           // +26: loopStart (words)
    writeU16BE(view, base + 28, sampleLoopLens[s]);             // +28: loopLen (words)
  }

  // +950: numOrders (u8)
  const songLen = Math.min(128, song.songPositions.length || 1);
  output[950] = songLen;

  // +951: restartPos (u8)
  output[951] = Math.min(song.restartPosition ?? 0, songLen);

  // +952: order list (128 bytes)
  for (let i = 0; i < 128; i++) {
    output[952 + i] = i < songLen ? (song.songPositions[i] ?? 0) : 0;
  }

  // +1080: sampleDataOffset (u32BE)
  writeU32BE(view, 1080, sampleDataOffset);

  // +1084: pattern data
  output.set(patternBytes, HEADER_SIZE);

  // +sampleDataOffset: sample PCM data (sequential)
  let pcmWriteOffset = sampleDataOffset;
  for (let s = 0; s < MAX_SAMPLES; s++) {
    if (samplePCMs[s].length > 0) {
      output.set(samplePCMs[s], pcmWriteOffset);
      pcmWriteOffset += samplePCMs[s].length;
    }
  }

  // ── Build result ──────────────────────────────────────────────────────
  if (maxInstruments === 0) {
    warnings.push('No instruments found; exported with empty sample headers.');
  }

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_\- ]/g, '_');
  const data = new Blob([output.buffer as ArrayBuffer], { type: 'application/octet-stream' });

  return {
    data,
    filename: `${baseName}.ims`,
    warnings,
  };
}
