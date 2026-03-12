/**
 * GraoumfTracker2Encoder — Encodes TrackerCell back to Graoumf Tracker format.
 *
 * Two sub-formats:
 *
 * GTK (v1-3, 4 bytes/cell):
 *   byte[0]: note (24-83 valid, 0=empty)
 *   byte[1]: instrument (1-based)
 *   byte[2]: effect
 *   byte[3]: effect parameter
 *
 * GTK (v4+, 5 bytes/cell):
 *   bytes 0-3: same as above
 *   byte[4]: volume (0=none, else (vol+1)*4 approx)
 *
 * GT2 (5 bytes/cell):
 *   byte[0]: note (1-120, 0=empty)
 *   byte[1]: instrument (1-based)
 *   byte[2]: effect
 *   byte[3]: effect parameter
 *   byte[4]: volume
 *
 * Note mapping:
 *   GTK: xmNote = data0 + 37 → reverse: data0 = xmNote - 37 (valid 24-83)
 *   GT2: xmNote = data0 + 1  → reverse: data0 = xmNote - 1  (valid 1-120)
 *
 * Effect reverse mapping (XM → GTK/GT2):
 *   Only simple 1:1 effects are reversed. Complex 12-bit effects are dropped.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

/**
 * Reverse XM effect to Graoumf Tracker effect byte + param.
 * Returns [effect, param]. Non-reversible effects return [0, 0].
 */
function reverseEffect(effTyp: number, eff: number, isGTK: boolean): [number, number] {
  switch (effTyp) {
    case 0x00: // Arpeggio → 0x10
      return eff ? [0x10, eff] : [0, 0];
    case 0x01: // Porta up → 0x01
      return [0x01, eff];
    case 0x02: // Porta down → 0x02
      return [0x02, eff];
    case 0x03: // Tone porta → 0x03
      return [0x03, eff];
    case 0x04: // Vibrato → 0x04
      return [0x04, eff];
    case 0x07: // Tremolo → 0x07
      return [0x07, eff];
    case 0x08: // Set panning → 0x4xxx (12-bit param, needs upper nibble in effect byte)
      if (!isGTK) {
        const pan12 = Math.min(eff * 16, 0xFFF);
        return [0x40 | ((pan12 >> 8) & 0x0F), pan12 & 0xFF];
      }
      return [0, 0];
    case 0x0A: // Volume slide
      if ((eff & 0xF0) > 0) return [0x14, (eff >> 4) & 0x0F]; // slide up → 0x14
      if ((eff & 0x0F) > 0) return [0x15, eff & 0x0F];         // slide down → 0x15
      return [0, 0];
    case 0x0B: // Pattern jump → 0x0B
      return [0x0B, eff];
    case 0x0C: // Set volume → 0x2xxx (12-bit: vol * 4)
      {
        const vol12 = Math.min(eff * 4, 0xFFF);
        return [0x20 | ((vol12 >> 8) & 0x0F), vol12 & 0xFF];
      }
    case 0x0D: // Pattern break → 0x0D
      return [0x0D, eff];
    case 0x0E: // Extended
      {
        const subCmd = (eff >> 4) & 0x0F;
        const subParam = eff & 0x0F;
        if (subCmd === 0x0D) return [0x09, subParam]; // Note delay → 0x09
        if (subCmd === 0x0B && !isGTK) return [0xB1, subParam]; // Pattern loop → 0xB1
        if (subCmd === 0x0E && !isGTK) return [0xAA, subParam]; // Pattern delay → 0xAA
        return [0, 0];
      }
    case 0x0F: // Set speed/tempo → 0x0F or 0xA8
      return [0x0F, eff];
    case 0x14: // Key off → 0x0A
      return [0x0A, 0];
    case 0x1B: // Retrigger → 0x7xyy
      return [0x70 | (eff & 0x0F), 0];
    default:
      return [0, 0];
  }
}

/**
 * Encode a TrackerCell to GTK format (4 bytes, version < 4).
 */
export function encodeGTK4Cell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // Byte 0: note (24-83 range, 0=empty)
  if (note > 0 && note <= 96) {
    const raw = note - 37;
    if (raw >= 24 && raw < 84) out[0] = raw;
  }

  // Byte 1: instrument
  out[1] = (cell.instrument ?? 0) & 0xFF;

  // Bytes 2-3: effect + param
  const [eff, param] = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0, true);
  out[2] = eff & 0xFF;
  out[3] = param & 0xFF;

  return out;
}

/**
 * Encode a TrackerCell to GTK format (5 bytes, version >= 4).
 */
export function encodeGTK5Cell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(5);
  const note = cell.note ?? 0;

  if (note > 0 && note <= 96) {
    const raw = note - 37;
    if (raw >= 24 && raw < 84) out[0] = raw;
  }

  out[1] = (cell.instrument ?? 0) & 0xFF;

  const [eff, param] = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0, true);
  out[2] = eff & 0xFF;
  out[3] = param & 0xFF;

  // Byte 4: volume (reverse of: volCmdVal = min(trunc((data4 + 1) / 4), 64))
  // Forward: xmVol = (data4 + 1) / 4, so data4 = xmVol * 4 - 1
  const vol = cell.volume ?? 0;
  if (vol > 0) {
    out[4] = Math.max(1, Math.min(255, vol * 4 - 1));
  }

  return out;
}

/**
 * Encode a TrackerCell to GT2 format (5 bytes).
 */
export function encodeGT2Cell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(5);
  const note = cell.note ?? 0;

  // Byte 0: note (1-120, 0=empty). Reverse: data0 = xmNote - 1
  if (note > 0 && note <= 120) {
    out[0] = note - 1;
  }

  // Byte 1: instrument
  out[1] = (cell.instrument ?? 0) & 0xFF;

  // Bytes 2-3: effect + param
  const [eff, param] = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0, false);
  out[2] = eff & 0xFF;
  out[3] = param & 0xFF;

  // Byte 4: volume (codingVersion 0: vol * 4, codingVersion 1: vol + 0x10)
  // We default to codingVersion 1 encoding (more common in GT2)
  const vol = cell.volume ?? 0;
  if (vol > 0) {
    out[4] = Math.min(255, vol + 0x10);
  }

  return out;
}

registerPatternEncoder('graoumfTracker2_gtk4', () => encodeGTK4Cell);
registerPatternEncoder('graoumfTracker2_gtk5', () => encodeGTK5Cell);
registerPatternEncoder('graoumfTracker2_gt2', () => encodeGT2Cell);

export { reverseEffect };
