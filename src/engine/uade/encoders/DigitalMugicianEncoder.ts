/**
 * DigitalMugicianEncoder — Encodes TrackerCell back to Digital Mugician (.dmu) format.
 *
 * Cell encoding (4 bytes per row):
 *   byte[0]: note (DM period table index, 0=no note)
 *   byte[1]: sample (bits[5:0] = instrument index, 1-based)
 *   byte[2]: effect byte (0-63=portamento target, 64+=effect type)
 *   byte[3]: effect parameter (signed int8)
 *
 * Note: The parser applies per-track transpose + per-instrument finetune when
 * building the displayed XM note. This encoder converts XM note back to a raw
 * DM period index (DigitalMugicianNotes.noteToDMIndex, periodNotes naming)
 * WITHOUT accounting for transpose (same pattern as SoundMon).
 * The 68k replayer applies transpose at playback time.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { noteToDMIndex } from '@/lib/import/formats/DigitalMugicianNotes';

export function encodeDigitalMugicianCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const xmNote = cell.note ?? 0;

  // Byte 0: DM note index
  if (xmNote > 0 && xmNote <= 96) {
    out[0] = noteToDMIndex(xmNote);
  } else {
    out[0] = 0;
  }

  // Byte 1: sample (6-bit, 0=none)
  out[1] = (cell.instrument ?? 0) & 0x3F;

  // Byte 2: effect — default to 64 (no effect / val1=2)
  // Parser: val1 = effect < 64 ? 1 : effect - 62
  // So effect=64 → val1=2 (no effect), effect=65 → val1=3 (volume), etc.
  // For basic encoding, write 64 (no effect) unless we have effect data
  const effTyp = cell.effTyp ?? 0;
  if (effTyp === 0) {
    out[2] = 64; // no effect
  } else if (effTyp === 0x0F && (cell.eff ?? 0) > 0 && (cell.eff ?? 0) <= 15) {
    // Set speed → DM effect val1=6 → effect = 6 + 62 = 68
    out[2] = 68;
  } else if (effTyp === 0x0E && (cell.eff ?? 0) === 0x01) {
    // LED filter on → DM effect val1=7 → effect = 7 + 62 = 69
    out[2] = 69;
  } else if (effTyp === 0x0E && (cell.eff ?? 0) === 0x00) {
    // LED filter off → DM effect val1=8 → effect = 8 + 62 = 70
    out[2] = 70;
  } else if (effTyp === 0x03) {
    // Tone portamento → DM val1=12 → effect = 12 + 62 = 74
    out[2] = 74;
  } else {
    out[2] = 64; // fallback: no effect
  }

  // Byte 3: effect parameter (signed int8)
  if (effTyp === 0x01) {
    // Portamento up → positive param
    out[3] = Math.min(cell.eff ?? 0, 127) & 0xFF;
  } else if (effTyp === 0x02) {
    // Portamento down → negative param
    out[3] = (-(Math.min(cell.eff ?? 0, 127))) & 0xFF;
  } else if (effTyp === 0x0F) {
    out[3] = (cell.eff ?? 0) & 0xFF;
  } else if (effTyp === 0x03) {
    out[3] = (cell.eff ?? 0) & 0xFF;
  } else {
    out[3] = 0;
  }

  // Byte-exact carrier restore. DigitalMugicianParser.decodeCell stashes the exact 4
  // source bytes in the invisible period/pan/cutoff carriers (fields the grid loop
  // never sets); reproduce all 4 bytes verbatim for an unedited cell. Edited grid
  // cells lack the carriers and keep the derivation above.
  if (cell.period !== undefined && cell.pan !== undefined && cell.cutoff !== undefined) {
    out[0] = (cell.period >> 8) & 0xFF;
    out[1] = cell.period & 0xFF;
    out[2] = cell.pan & 0xFF;
    out[3] = cell.cutoff & 0xFF;
  }

  return out;
}

registerPatternEncoder('digitalMugician', () => encodeDigitalMugicianCell);
