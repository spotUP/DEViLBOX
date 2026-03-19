/**
 * QuadraComposerExporter.ts — Export TrackerSong as Quadra Composer (.emod) format
 *
 * Produces a valid IFF FORM/EMOD file with three sub-chunks:
 *   EMIC — module info: instruments, patterns, song order
 *   PATT — pattern data (4 bytes per cell, 4 channels, variable row count)
 *   8SMP — 8-bit signed PCM sample data (all samples concatenated)
 *
 * Cell encoding (4 bytes) — delegated to encodeQCCell:
 *   byte[0]: instrument (1-based; 0 = no instrument)
 *   byte[1]: note (0-35 = C-1 to B-3; >35 = no note)
 *   byte[2]: effect type (low nibble only)
 *   byte[3]: effect parameter
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { encodeQCCell } from '@/engine/uade/encoders/QuadraComposerEncoder';

// -- Binary helpers -----------------------------------------------------------

function writeStr(view: DataView, offset: number, str: string, maxLen: number): void {
  for (let i = 0; i < maxLen; i++) {
    view.setUint8(offset + i, i < str.length ? str.charCodeAt(i) & 0xFF : 0);
  }
}

function writeU8(view: DataView, offset: number, val: number): void {
  view.setUint8(offset, val & 0xFF);
}

function writeU16BE(view: DataView, offset: number, val: number): void {
  view.setUint16(offset, val, false);
}

function writeU32BE(view: DataView, offset: number, val: number): void {
  view.setUint32(offset, val, false);
}

function writeI8(view: DataView, offset: number, val: number): void {
  view.setInt8(offset, val);
}

// -- Export result interface --------------------------------------------------

export interface QuadraComposerExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

// -- Sample extraction --------------------------------------------------------

interface SampleInfo {
  name: string;
  volume: number;       // 0-64
  pcm: Uint8Array;      // 8-bit signed PCM
  hasLoop: boolean;
  loopStart: number;    // in bytes
  loopLength: number;   // in bytes
  finetune: number;     // -8..7
}

function extractSample(inst: TrackerSong['instruments'][number]): SampleInfo {
  const name = (inst?.name ?? '').slice(0, 20);
  const volume = Math.min(64, Math.max(0, Math.round(64)));

  let pcm = new Uint8Array(0);
  if (inst?.sample?.audioBuffer) {
    const wav = new DataView(inst.sample.audioBuffer);
    const dataLen = wav.getUint32(40, true);
    const frames = Math.floor(dataLen / 2);
    pcm = new Uint8Array(frames);
    for (let j = 0; j < frames; j++) {
      const s16 = wav.getInt16(44 + j * 2, true);
      pcm[j] = (s16 >> 8) & 0xFF; // 16-bit signed → 8-bit signed
    }
  }

  // Ensure even length (Amiga DMA requirement)
  if (pcm.length & 1) {
    const padded = new Uint8Array(pcm.length + 1);
    padded.set(pcm);
    pcm = padded;
  }

  const loopStart = inst?.sample?.loopStart ?? 0;
  const loopEnd = inst?.sample?.loopEnd ?? 0;
  const hasLoop = loopEnd > loopStart && loopEnd <= pcm.length;
  const loopLength = hasLoop ? loopEnd - loopStart : 0;

  return {
    name,
    volume,
    pcm,
    hasLoop,
    loopStart: hasLoop ? loopStart : 0,
    loopLength,
    finetune: inst?.sample?.detune ? Math.round(inst.sample.detune / 12.5) : 0,
  };
}

// -- Note conversion ----------------------------------------------------------

/**
 * Convert XM note to QC note. QC uses 0-35 for C-1 to B-3.
 * The parser maps QC 0-35 → XM 13-48 (adding 13).
 * So the reverse is: XM note - 13 = QC note.
 * The encoder (encodeQCCell) handles this internally with its own mapping,
 * but for volume column → effect C conversion we need our own check.
 */

// -- Main exporter ------------------------------------------------------------

export async function exportQuadraComposer(
  song: TrackerSong,
): Promise<QuadraComposerExportResult> {
  const warnings: string[] = [];

  const numChannels = 4; // Quadra Composer is always 4-channel
  const maxInstruments = Math.min(song.instruments.length, 63); // practical limit

  // ── Extract samples ─────────────────────────────────────────────────────
  const samples: SampleInfo[] = [];
  for (let i = 0; i < maxInstruments; i++) {
    samples.push(extractSample(song.instruments[i]));
  }

  if (song.instruments.length > 63) {
    warnings.push(`Quadra Composer supports up to 63 instruments. ${song.instruments.length - 63} instruments truncated.`);
  }

  // ── Prepare patterns ────────────────────────────────────────────────────
  const numPatterns = song.patterns.length;
  if (numPatterns > 255) {
    warnings.push(`Quadra Composer supports up to 255 patterns. ${numPatterns - 255} patterns truncated.`);
  }
  const patternCount = Math.min(numPatterns, 255);

  // Pattern rows: each pattern can have variable row count (1-256)
  const patternRows: number[] = [];
  for (let p = 0; p < patternCount; p++) {
    const rows = Math.min(256, Math.max(1, song.patterns[p].length));
    patternRows.push(rows);
  }

  // ── Build PATT chunk data ───────────────────────────────────────────────
  // 4 bytes per cell × 4 channels × rows per pattern
  const pattChunks: Uint8Array[] = [];
  let totalPattBytes = 0;

  for (let p = 0; p < patternCount; p++) {
    const pat = song.patterns[p];
    const rows = patternRows[p];
    const pattData = new Uint8Array(rows * numChannels * 4);

    for (let row = 0; row < rows; row++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const cell = pat.channels[ch]?.rows[row];
        const offset = (row * numChannels + ch) * 4;

        if (cell) {
          // Convert volume column (XM vol command 0x10+vol) back to effect C
          let cellToEncode = cell;
          if (cell.volume >= 0x10 && cell.volume <= 0x50 && cell.effTyp === 0 && cell.eff === 0) {
            cellToEncode = {
              ...cell,
              effTyp: 0x0C,
              eff: cell.volume - 0x10,
              volume: 0,
            };
          }
          const encoded = encodeQCCell(cellToEncode);
          pattData.set(encoded, offset);
        }
        // else: all zeros = empty cell (ins=0, note=0, fx=0, param=0)
        // But note byte 0 means "C-1" in QC, not empty. For empty, note should be >35.
        else {
          pattData[offset + 1] = 0xFF; // no note
        }
      }
    }

    pattChunks.push(pattData);
    totalPattBytes += pattData.length;
  }

  // ── Build 8SMP chunk data ───────────────────────────────────────────────
  let totalSampleBytes = 0;
  for (const s of samples) {
    totalSampleBytes += s.pcm.length;
  }

  // ── Build EMIC chunk ────────────────────────────────────────────────────
  // EMIC layout:
  //   u16 version (0x0001)
  //   20 bytes song name
  //   20 bytes composer name
  //   u8 initial BPM
  //   u8 numSamples
  //   For each sample (33 bytes each):
  //     u8 sample number (1-based original index)
  //     u8 volume
  //     u16 length (in words = bytes/2)
  //     20 bytes name
  //     u8 control (bit0 = loop)
  //     i8 finetune
  //     u16 loop start (in words)
  //     u16 loop length (in words)
  //     u32 file offset pointer (0, filled by player)
  //   u8 pad
  //   u8 numPatterns
  //   For each pattern (24 bytes each):
  //     u8 original pattern number
  //     u8 rows - 1
  //     20 bytes pattern name
  //     u32 file offset pointer (0, filled by player)
  //   u8 numPositions
  //   numPositions × u8 pattern indices

  const numSamples = samples.length;
  const numPositions = Math.min(255, song.songPositions.length);

  const emicSize = 2 + 20 + 20 + 1 + 1 +
    numSamples * 34 +
    1 + 1 +
    patternCount * 26 +
    1 + numPositions;

  // ── Calculate total file size ───────────────────────────────────────────
  // IFF: FORM(4) + formSize(4) + EMOD(4) +
  //      EMIC(4) + emicChunkSize(4) + emicData +
  //      PATT(4) + pattChunkSize(4) + pattData +
  //      8SMP(4) + smpChunkSize(4) + smpData
  // IFF chunks are word-aligned

  const emicPadded = emicSize + (emicSize & 1);
  const pattPadded = totalPattBytes + (totalPattBytes & 1);
  const smpPadded = totalSampleBytes + (totalSampleBytes & 1);

  const formContentSize = 4 + // EMOD
    8 + emicPadded +           // EMIC chunk
    8 + pattPadded +           // PATT chunk
    8 + smpPadded;             // 8SMP chunk

  const totalFileSize = 8 + formContentSize; // FORM + size + content
  const output = new Uint8Array(totalFileSize);
  const view = new DataView(output.buffer);
  let pos = 0;

  // ── FORM header ─────────────────────────────────────────────────────────
  writeStr(view, pos, 'FORM', 4); pos += 4;
  writeU32BE(view, pos, formContentSize); pos += 4;
  writeStr(view, pos, 'EMOD', 4); pos += 4;

  // ── EMIC chunk header ───────────────────────────────────────────────────
  writeStr(view, pos, 'EMIC', 4); pos += 4;
  writeU32BE(view, pos, emicSize); pos += 4;
  const emicStart = pos;

  // Version
  writeU16BE(view, pos, 1); pos += 2;

  // Song name (20 bytes)
  writeStr(view, pos, (song.name ?? 'Untitled').slice(0, 20), 20); pos += 20;

  // Composer name (20 bytes) — empty
  writeStr(view, pos, '', 20); pos += 20;

  // Initial BPM
  writeU8(view, pos, Math.max(1, Math.min(255, song.initialBPM ?? 125))); pos += 1;

  // Number of samples
  writeU8(view, pos, numSamples); pos += 1;

  // Sample definitions
  let sampleFileOffset = 0; // relative offset within 8SMP chunk data
  for (let i = 0; i < numSamples; i++) {
    const s = samples[i];
    writeU8(view, pos, i + 1); pos += 1;                    // sample number (1-based)
    writeU8(view, pos, s.volume); pos += 1;                  // volume
    writeU16BE(view, pos, Math.floor(s.pcm.length / 2)); pos += 2; // length in words
    writeStr(view, pos, s.name, 20); pos += 20;             // name
    writeU8(view, pos, s.hasLoop ? 1 : 0); pos += 1;        // control (bit0 = loop)
    writeI8(view, pos, s.finetune); pos += 1;               // finetune
    writeU16BE(view, pos, Math.floor(s.loopStart / 2)); pos += 2;  // loop start in words
    writeU16BE(view, pos, Math.floor(s.loopLength / 2)); pos += 2; // loop length in words
    writeU32BE(view, pos, sampleFileOffset); pos += 4;       // file offset (relative)
    sampleFileOffset += s.pcm.length;
  }

  // Pad byte
  writeU8(view, pos, 0); pos += 1;

  // Number of patterns
  writeU8(view, pos, patternCount); pos += 1;

  // Pattern definitions
  let patternFileOffset = 0; // relative offset within PATT chunk data
  for (let p = 0; p < patternCount; p++) {
    writeU8(view, pos, p); pos += 1;                                    // original pattern number
    writeU8(view, pos, patternRows[p] - 1); pos += 1;                  // rows - 1
    const patName = (song.patterns[p].name ?? `Pattern ${p}`).slice(0, 20);
    writeStr(view, pos, patName, 20); pos += 20;                        // pattern name
    writeU32BE(view, pos, patternFileOffset); pos += 4;                 // file offset (relative)
    patternFileOffset += patternRows[p] * numChannels * 4;
  }

  // Number of positions
  writeU8(view, pos, numPositions); pos += 1;

  // Song positions — in EMOD these reference the original pattern numbers directly
  // Since our patterns are numbered sequentially (0, 1, 2, ...), just write the index
  for (let i = 0; i < numPositions; i++) {
    const patIdx = Math.min(patternCount - 1, Math.max(0, song.songPositions[i] ?? 0));
    writeU8(view, pos, patIdx); pos += 1;
  }

  // IFF word-alignment for EMIC
  if ((pos - emicStart) & 1) {
    pos += 1;
  }

  // ── PATT chunk ──────────────────────────────────────────────────────────
  writeStr(view, pos, 'PATT', 4); pos += 4;
  writeU32BE(view, pos, totalPattBytes); pos += 4;

  for (const chunk of pattChunks) {
    output.set(chunk, pos);
    pos += chunk.length;
  }

  // IFF word-alignment for PATT
  if (totalPattBytes & 1) {
    pos += 1;
  }

  // ── 8SMP chunk ──────────────────────────────────────────────────────────
  writeStr(view, pos, '8SMP', 4); pos += 4;
  writeU32BE(view, pos, totalSampleBytes); pos += 4;

  for (const s of samples) {
    output.set(s.pcm, pos);
    pos += s.pcm.length;
  }

  // IFF word-alignment for 8SMP (at end of file, optional)
  // if (totalSampleBytes & 1) pos += 1;

  // ── Return result ───────────────────────────────────────────────────────
  const data = new Blob([output], { type: 'application/octet-stream' });
  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');

  return {
    data,
    filename: `${baseName}.emod`,
    warnings,
  };
}
