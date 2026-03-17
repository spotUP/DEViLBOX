/**
 * jamExport.ts — Build a JamCracker (.jam) file from TrackerSong
 *
 * Produces a valid JamCracker "BeEp" binary from any 4-channel TrackerSong.
 * Pattern data uses 8-byte cells matching the JamCracker format.
 *
 * File layout:
 *   "BeEp" (4)
 *   NOI (u16BE) + NOI × 40-byte instrument table
 *   NOP (u16BE) + NOP × 6-byte pattern table (rows + unused address)
 *   SL (u16BE) + SL × u16BE song table (pattern indices)
 *   NOP × patternRows × 4ch × 8-byte cell data
 *   Concatenated PCM/AM sample data
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types';

export interface JamExportResult {
  data: Blob;
  filename: string;
  warnings: string[];
}

// ── Binary write helpers ──────────────────────────────────────────────────

function writeU8(buf: Uint8Array, off: number, val: number): void {
  buf[off] = val & 0xFF;
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

// ── Note conversion ─────────────────────────────────────────────────────

/** XM note → JamCracker note index (1-36). 0 = empty. */
function xmNoteToJC(xmNote: number): number {
  if (xmNote === 0 || xmNote === 97) return 0;
  const jcNote = xmNote - 12;
  if (jcNote < 1 || jcNote > 36) return 0;
  return jcNote;
}

// ── Cell encoding ───────────────────────────────────────────────────────

/** Encode TrackerCell → 8-byte JamCracker cell. */
function encodeCell(cell: TrackerCell, buf: Uint8Array, off: number): void {
  buf[off + 0] = xmNoteToJC(cell.note ?? 0);
  buf[off + 1] = (cell.instrument ?? 0) & 0xFF;

  // Effects: route XM effect type to the appropriate JC byte
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  // Bytes 2-5,7 default to 0 (already zero-filled)
  if (effTyp === 0x0F && eff > 0) {
    buf[off + 2] = eff;           // speed
  } else if (effTyp === 0x00 && eff > 0) {
    buf[off + 3] = eff;           // arpeggio
  } else if (effTyp === 0x04 && eff > 0) {
    buf[off + 4] = eff;           // vibrato
  } else if (effTyp === 0x03 && eff > 0) {
    buf[off + 7] = eff;           // portamento
  }
  // byte 5 = phase (no XM equivalent, always 0)

  // Volume: XM 0x10-0x50 → JC 1-65
  const vol = cell.volume ?? 0;
  if (vol >= 0x10 && vol <= 0x50) {
    buf[off + 6] = (vol - 0x10) + 1;
  }
}

// ── PCM extraction ──────────────────────────────────────────────────────

/** Extract 8-bit signed PCM from a 16-bit LE WAV ArrayBuffer. */
function extractPCM8FromWAV(audioBuffer: ArrayBuffer): Int8Array {
  const view = new DataView(audioBuffer);
  if (audioBuffer.byteLength < 44) return new Int8Array(0);
  const dataLen = view.getUint32(40, true);
  const frames = Math.floor(dataLen / 2);
  const result = new Int8Array(frames);
  for (let i = 0; i < frames; i++) {
    const s16 = view.getInt16(44 + i * 2, true);
    result[i] = s16 >> 8;
  }
  return result;
}

// ── Main export ─────────────────────────────────────────────────────────

export function exportSongToJam(song: TrackerSong): JamExportResult {
  const warnings: string[] = [];
  const MAX_INSTRUMENTS = 255;
  const MAX_ORDERS = 256;
  const CHANNELS = 4;
  const CELL_BYTES = 8;

  // ── Instruments ───────────────────────────────────────────────────────
  const instruments = song.instruments.slice(0, MAX_INSTRUMENTS);
  const noi = instruments.length || 1; // at least 1 instrument slot

  // Extract PCM data for each instrument
  const pcmBuffers: Int8Array[] = [];
  const instrFlags: number[] = [];
  const instrNames: string[] = [];

  for (let i = 0; i < noi; i++) {
    const inst = instruments[i];
    if (!inst) {
      pcmBuffers.push(new Int8Array(0));
      instrFlags.push(0);
      instrNames.push('');
      continue;
    }

    instrNames.push((inst.name || `Sample ${i + 1}`).slice(0, 31));

    // Check for JamCracker AM synth
    const jcConfig = (inst as unknown as Record<string, unknown>).jamCracker as
      | { flags?: number; waveformData?: Uint8Array; isAM?: boolean }
      | undefined;

    if (jcConfig?.isAM && jcConfig.waveformData) {
      instrFlags.push(jcConfig.flags ?? 0x02);
      pcmBuffers.push(new Int8Array(jcConfig.waveformData.buffer));
    } else if (inst.sample?.audioBuffer) {
      try {
        const pcm = extractPCM8FromWAV(inst.sample.audioBuffer);
        const hasLoop = (inst.sample.loopEnd ?? 0) > (inst.sample.loopStart ?? 0);
        instrFlags.push(hasLoop ? 0x01 : 0x00);
        pcmBuffers.push(pcm);
      } catch {
        warnings.push(`Instrument ${i + 1}: PCM extraction failed.`);
        instrFlags.push(0);
        pcmBuffers.push(new Int8Array(0));
      }
    } else {
      instrFlags.push(0);
      pcmBuffers.push(new Int8Array(0));
    }
  }

  // ── Patterns ──────────────────────────────────────────────────────────
  const patterns = song.patterns;
  const nop = patterns.length || 1;

  // ── Song order ────────────────────────────────────────────────────────
  const orders = song.songPositions.length > 0
    ? song.songPositions.slice(0, MAX_ORDERS)
    : [0];
  if (song.songPositions.length > MAX_ORDERS) {
    warnings.push(`Song has ${song.songPositions.length} orders; truncated to ${MAX_ORDERS}.`);
  }

  // ── Calculate sizes ───────────────────────────────────────────────────
  const INST_STRIDE = 40;
  const PATT_STRIDE = 6;

  const headerSize = 4;                              // "BeEp"
  const instrTableSize = 2 + noi * INST_STRIDE;     // NOI + instruments
  const pattTableSize = 2 + nop * PATT_STRIDE;      // NOP + pattern entries
  const songTableSize = 2 + orders.length * 2;       // SL + order entries

  // Pattern data: sum of (rows × channels × cellBytes) for each pattern
  let patternDataSize = 0;
  const patternRows: number[] = [];
  for (let p = 0; p < nop; p++) {
    const rows = patterns[p]?.length ?? 64;
    patternRows.push(rows);
    patternDataSize += rows * CHANNELS * CELL_BYTES;
  }

  // Sample data: sum of all PCM buffer sizes
  let sampleDataSize = 0;
  for (const buf of pcmBuffers) sampleDataSize += buf.length;

  const totalSize = headerSize + instrTableSize + pattTableSize +
    songTableSize + patternDataSize + sampleDataSize;

  // ── Build binary ──────────────────────────────────────────────────────
  const output = new Uint8Array(totalSize); // zero-initialized
  let pos = 0;

  // Magic "BeEp"
  writeString(output, pos, 'BeEp', 4);
  pos += 4;

  // NOI
  writeU16BE(output, pos, noi);
  pos += 2;

  // Instrument table (40 bytes each)
  for (let i = 0; i < noi; i++) {
    const base = pos + i * INST_STRIDE;
    writeString(output, base, instrNames[i] || '', 31);
    writeU8(output, base + 31, instrFlags[i] || 0);
    writeU32BE(output, base + 32, pcmBuffers[i]?.length ?? 0);
    // bytes 36-39: address pointer (set to 0, runtime-only)
  }
  pos += noi * INST_STRIDE;

  // NOP
  writeU16BE(output, pos, nop);
  pos += 2;

  // Pattern table (6 bytes each: rows(u16) + address(u32))
  for (let p = 0; p < nop; p++) {
    const base = pos + p * PATT_STRIDE;
    writeU16BE(output, base, patternRows[p]);
    // bytes 2-5: address pointer (set to 0, runtime-only)
  }
  pos += nop * PATT_STRIDE;

  // Song length
  writeU16BE(output, pos, orders.length);
  pos += 2;

  // Song table (pattern indices)
  for (let i = 0; i < orders.length; i++) {
    writeU16BE(output, pos, orders[i]);
    pos += 2;
  }

  // ── Pattern data ──────────────────────────────────────────────────────
  for (let p = 0; p < nop; p++) {
    const pat = patterns[p];
    const rows = patternRows[p];
    for (let row = 0; row < rows; row++) {
      for (let ch = 0; ch < CHANNELS; ch++) {
        const cell = pat?.channels[ch]?.rows[row];
        if (cell) {
          encodeCell(cell, output, pos);
        }
        pos += CELL_BYTES;
      }
    }
  }

  // ── Sample data ───────────────────────────────────────────────────────
  for (let i = 0; i < noi; i++) {
    const pcm = pcmBuffers[i];
    if (pcm.length > 0) {
      for (let j = 0; j < pcm.length; j++) {
        output[pos + j] = pcm[j] & 0xFF;
      }
      pos += pcm.length;
    }
  }

  const baseName = (song.name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    data: new Blob([output], { type: 'application/octet-stream' }),
    filename: `${baseName}.jam`,
    warnings,
  };
}
