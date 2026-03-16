/**
 * JamCrackerEncoder — Encodes TrackerCell back to JamCracker (.jam) binary format.
 *
 * Cell encoding: 8 bytes [period, instr, speed, arpeggio, vibrato, phase, volume, porta]
 *   period:   0 = empty, 1-36 = note index (C-1 to B-3)
 *   instr:    signed int8 (1-based; 0 = none)
 *   speed:    set speed (0 = no change)
 *   arpeggio: arpeggio param (XY nibbles, 0 = no arpeggio)
 *   vibrato:  vibrato param (XY nibbles, 0 = no vibrato)
 *   phase:    phase shift (no XM equivalent; preserved if available)
 *   volume:   0 = no change, 1-65 → volume 0-64
 *   porta:    portamento speed (0 = no portamento)
 *
 * This is the exact reverse of JamCrackerParser's decode logic.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

/**
 * Reverse XM note → JamCracker note index.
 * Parser: amigaNoteToXM(period) = period + 12
 * Reverse: jcNote = xmNote - 12, clamped to 1-36.
 */
function xmNoteToJC(xmNote: number): number {
  if (xmNote === 0) return 0;
  const jcNote = xmNote - 12;
  if (jcNote < 1 || jcNote > 36) return 0;
  return jcNote;
}

/**
 * Encode a TrackerCell to JamCracker binary format (8 bytes).
 */
function encodeJCCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(8);

  // Byte 0: period (note index 1-36, 0=empty)
  out[0] = xmNoteToJC(cell.note ?? 0);

  // Byte 1: instrument (signed int8, 1-based, 0=none)
  const instr = cell.instrument ?? 0;
  out[1] = instr & 0xFF;

  // Bytes 2-7: effects — reverse the priority-based mapping from the parser.
  // Parser picks ONE of: speed > arpeggio > vibrato > porta
  // We reverse: check effTyp to determine which JC field to populate.
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  if (effTyp === 0x0F && eff > 0) {
    // Set speed → JC speed byte
    out[2] = eff;
  } else if (effTyp === 0x00 && eff > 0) {
    // Arpeggio → JC arpeggio byte
    out[3] = eff;
  } else if (effTyp === 0x04 && eff > 0) {
    // Vibrato → JC vibrato byte
    out[4] = eff;
  } else if (effTyp === 0x03 && eff > 0) {
    // Portamento to note → JC porta byte
    out[7] = eff;
  }
  // Byte 5 (phase): no XM equivalent, leave 0

  // Byte 6: volume
  // Parser: if (vol > 0) volCol = 0x10 + min(vol - 1, 64)
  // Reverse: vol > 0 means JC vol = (volCol - 0x10) + 1
  const volCol = cell.volume ?? 0;
  if (volCol >= 0x10 && volCol <= 0x50) {
    out[6] = (volCol - 0x10) + 1;  // 1-65
  }

  return out;
}

registerPatternEncoder('jamCracker', () => encodeJCCell);

export { encodeJCCell };
