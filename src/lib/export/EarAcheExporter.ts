/**
 * EarAcheExporter.ts — Export TrackerSong as EarAche (.ea) format
 *
 * Reconstructs a valid EarAche binary from TrackerSong pattern data.
 * EarAche is a 4-channel Amiga format (magic "EASO") using standard
 * ProTracker MOD 4-byte cell encoding for pattern data.
 *
 * File layout (all big-endian):
 *   "EASO" magic (4 bytes)
 *   patternDataOffset   u32 BE (offset to pattern data, always 0x18)
 *   instrumentsOffset   u32 BE (offset to instrument/waveform block)
 *   instrDefsOffset     u32 BE (offset to instrument definitions)
 *   sampleDataOffset    u32 BE (offset to sample PCM data)
 *   envelopeDataOffset  u32 BE (offset to envelope data)
 *   Pattern data: numPatterns × 64 rows × 4 channels × 4 bytes
 *   Instrument block (waveforms, definitions, envelopes, sample data)
 *
 * Reference: EarAcheParser.ts (import) and EarAcheEncoder.ts (cell encoding)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { encodeEarAcheCell } from '@/engine/uade/encoders/EarAcheEncoder';

// ── Helpers ────────────────────────────────────────────────────────────────

function writeU32BE(view: DataView, off: number, val: number): void {
  view.setUint32(off, val, false);
}

function emptyCell(): { note: number; instrument: number; effTyp: number; eff: number } {
  return { note: 0, instrument: 0, effTyp: 0, eff: 0 };
}

// ── Main export function ───────────────────────────────────────────────────

export async function exportEarAche(
  song: TrackerSong
): Promise<{ data: Blob; filename: string; warnings: string[] }> {
  const warnings: string[] = [];
  const NUM_CHANNELS = 4;
  const ROWS_PER_PATTERN = 64;
  const BYTES_PER_CELL = 4;
  const HEADER_SIZE = 4 + 5 * 4; // "EASO" + 5 u32 offsets = 24 bytes

  // ── Validate channel count ────────────────────────────────────────────
  if (song.numChannels > NUM_CHANNELS) {
    warnings.push(
      `EarAche supports 4 channels but song has ${song.numChannels}. Extra channels will be truncated.`
    );
  }

  // ── Encode pattern data ───────────────────────────────────────────────
  const numPatterns = song.patterns.length || 1;
  const patternBlockSize = numPatterns * ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL;
  const patternBytes = new Uint8Array(patternBlockSize);

  for (let p = 0; p < numPatterns; p++) {
    const pat = song.patterns[p];
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cell = pat?.channels[ch]?.rows[row] ?? emptyCell();
        const encoded = encodeEarAcheCell(cell);
        const offset =
          p * ROWS_PER_PATTERN * NUM_CHANNELS * BYTES_PER_CELL +
          row * NUM_CHANNELS * BYTES_PER_CELL +
          ch * BYTES_PER_CELL;
        patternBytes.set(encoded, offset);
      }
    }

    // Warn if pattern is longer than 64 rows
    if (pat && pat.length > ROWS_PER_PATTERN) {
      warnings.push(
        `Pattern ${p} has ${pat.length} rows but EarAche supports max ${ROWS_PER_PATTERN}. Extra rows truncated.`
      );
    }
  }

  // ── Build instrument/sample data ──────────────────────────────────────
  // EarAche instrument block: waveform data, instrument definitions,
  // envelope data, and sample PCM data. For instruments without sample
  // data we write minimal placeholder blocks.

  const maxInstruments = Math.min(song.instruments.length, 31);

  // Collect sample PCM data (8-bit signed)
  const samplePCMs: Uint8Array[] = [];
  for (let i = 0; i < maxInstruments; i++) {
    const inst = song.instruments[i];
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
        pcm[j] = (s16 >> 8) & 0xFF;
      }
      samplePCMs.push(pcm);
    } else {
      samplePCMs.push(new Uint8Array(0));
    }
  }

  // Instrument block layout: waveform header + instrument defs + envelope data
  // Each instrument definition: 16 bytes (sample offset u32, sample length u32,
  // loop start u32, loop length u32, volume u8, finetune u8, padding u16)
  const INSTR_DEF_SIZE = 16;
  const ENVELOPE_SIZE = 32; // 32 bytes per envelope entry

  // Waveform block: 4 bytes per instrument (sample pointer as u32 offset)
  const waveformBlockSize = maxInstruments * 12; // 3 x u32 per instrument (ptr, len, loop)
  const instrDefBlockSize = maxInstruments * INSTR_DEF_SIZE;
  const envelopeBlockSize = maxInstruments * ENVELOPE_SIZE;
  const totalSampleBytes = samplePCMs.reduce((s, p) => s + p.length, 0);

  // ── Calculate offsets ──────────────────────────────────────────────────
  const patternDataOffset = HEADER_SIZE;
  const instrumentsOffset = patternDataOffset + patternBlockSize;
  const instrDefsOffset = instrumentsOffset + waveformBlockSize;
  const envelopeDataOffset = instrDefsOffset + instrDefBlockSize;
  const sampleDataOffset = envelopeDataOffset + envelopeBlockSize;
  const totalSize = sampleDataOffset + totalSampleBytes;

  // ── Write the file ────────────────────────────────────────────────────
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // Magic: "EASO"
  output[0] = 0x45; // E
  output[1] = 0x41; // A
  output[2] = 0x53; // S
  output[3] = 0x4F; // O

  // Header offsets (5 x u32 BE)
  writeU32BE(view, 4, patternDataOffset);
  writeU32BE(view, 8, instrumentsOffset);
  writeU32BE(view, 12, instrDefsOffset);
  writeU32BE(view, 16, sampleDataOffset);
  writeU32BE(view, 20, envelopeDataOffset);

  // Pattern data
  output.set(patternBytes, patternDataOffset);

  // Instrument waveform block (sample start offsets relative to sample data start)
  let sampleOffset = 0;
  for (let i = 0; i < maxInstruments; i++) {
    const base = instrumentsOffset + i * 12;
    const pcmLen = samplePCMs[i].length;
    writeU32BE(view, base, sampleOffset);     // sample data offset (relative)
    writeU32BE(view, base + 4, pcmLen);       // sample length in bytes
    writeU32BE(view, base + 8, pcmLen > 2 ? pcmLen : 0); // loop length (0 = no loop)
    sampleOffset += pcmLen;
  }

  // Instrument definitions
  for (let i = 0; i < maxInstruments; i++) {
    const base = instrDefsOffset + i * INSTR_DEF_SIZE;
    const inst = song.instruments[i];
    // Volume: convert from dB (-60..0) to 0-64
    const vol = inst?.volume != null
      ? Math.round(Math.pow(10, inst.volume / 20) * 64)
      : 64;
    output[base] = Math.max(0, Math.min(64, vol)); // volume
    output[base + 1] = 0; // finetune
    // Rest is padding (zeros)
  }

  // Envelope data (simple sustain envelope for each instrument)
  for (let i = 0; i < maxInstruments; i++) {
    const base = envelopeDataOffset + i * ENVELOPE_SIZE;
    // Write a simple sustain envelope: ramp to max volume then hold
    output[base] = 0x40; // max volume
    // Rest is zeros (sustain at max)
  }

  // Sample PCM data
  let pcmWriteOffset = sampleDataOffset;
  for (let i = 0; i < maxInstruments; i++) {
    if (samplePCMs[i].length > 0) {
      output.set(samplePCMs[i], pcmWriteOffset);
      pcmWriteOffset += samplePCMs[i].length;
    }
  }

  // ── Build result ──────────────────────────────────────────────────────

  if (maxInstruments === 0) {
    warnings.push('No instruments found; exported with empty instrument block.');
  }

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_\- ]/g, '_');
  const data = new Blob([output.buffer as ArrayBuffer], { type: 'application/octet-stream' });

  return {
    data,
    filename: `${baseName}.ea`,
    warnings,
  };
}
