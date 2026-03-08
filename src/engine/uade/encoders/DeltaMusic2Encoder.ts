/**
 * DeltaMusic2Encoder — Encodes TrackerCell back to Delta Music 2.0 (.dm2) format.
 *
 * Cell encoding (4 bytes per row in block):
 *   byte[0]: note index (0 = no note; 1-84 = period table index)
 *   byte[1]: instrument (0-based in file, parser converts to 1-based)
 *   byte[2]: effect type
 *   byte[3]: effect argument
 *
 * Note mapping:
 *   Parser: DM2 note value is used directly as XM note (note + transpose → xmNote)
 *   Reverse: xmNote is the raw DM2 note index (1-based, 1-96 range)
 *
 * Effect mapping:
 *   Parser: DM2 effects → XM effects with specific mapping per effect type
 *   Reverse: XM effects → DM2 effect codes
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function encodeDeltaMusic2Cell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // Byte 0: note index (DM2 note = XM note directly)
  // Parser: xmNote = Math.max(1, Math.min(96, line.note + transpose))
  // In the block data, the raw note is stored without transpose
  // For encoding, we store the XM note as-is (transpose is applied at pattern level)
  if (note > 0 && note <= 96) {
    out[0] = note;
  } else {
    out[0] = 0;
  }

  // Byte 1: instrument (parser converts 0-based to 1-based; reverse: 1-based to 0-based)
  const instr = cell.instrument ?? 0;
  out[1] = instr > 0 ? (instr - 1) & 0xFF : 0;

  // Bytes 2-3: effect type + param
  // Reverse the XM → DM2 effect mapping
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  const vol = cell.volume ?? 0;

  let dm2Effect = 0;
  let dm2Param = 0;

  // Check volume column first (effect 0x06 = SetVolume in DM2 stores via volume column)
  if (vol >= 0x10 && vol <= 0x50) {
    // Volume column: 0x10 + volValue → DM2 effect 0x06
    const xmVol = vol - 0x10; // 0-64
    dm2Effect = 0x06;
    dm2Param = Math.round(xmVol / 64 * 63) & 0x3F;
    out[2] = dm2Effect & 0xFF;
    out[3] = dm2Param & 0xFF;
    return out;
  }

  switch (effTyp) {
    case 0x0F: // Set speed → DM2 effect 0x01
      dm2Effect = 0x01;
      dm2Param = eff & 0x0F;
      break;
    case 0x01: // Portamento up → DM2 effect 0x03
      dm2Effect = 0x03;
      dm2Param = eff;
      break;
    case 0x02: // Portamento down → DM2 effect 0x04
      dm2Effect = 0x04;
      dm2Param = eff;
      break;
    case 0x03: // Tone portamento → DM2 effect 0x05
      dm2Effect = 0x05;
      dm2Param = eff;
      break;
    case 0x10: // Global volume → DM2 effect 0x07
      dm2Effect = 0x07;
      dm2Param = Math.round(Math.min(64, eff) / 64 * 63) & 0x3F;
      break;
    case 0x00: // Arpeggio → DM2 effect 0x08
      if (eff !== 0) {
        dm2Effect = 0x08;
        // The parser extracts arpeggio table index from effectArg & 0x3f
        dm2Param = eff & 0x3F;
      }
      break;
    default:
      break;
  }

  out[2] = dm2Effect & 0xFF;
  out[3] = dm2Param & 0xFF;

  return out;
}

registerPatternEncoder('deltaMusic2', () => encodeDeltaMusic2Cell);

export { encodeDeltaMusic2Cell };
