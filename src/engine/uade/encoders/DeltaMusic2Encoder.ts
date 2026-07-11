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
 *   decodeCell stores the DM2 effect command + argument VERBATIM (raw native codes), so
 *   encode writes them straight back to bytes[2]/[3] — a byte-exact inverse. DM2 is played
 *   by the dedicated deltamusic2-wasm replayer from these raw bytes, not the XM effect engine.
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

  // Bytes 2-3: effect command + argument, written VERBATIM. decodeDeltaMusic2Cell stores the
  // native DM2 effect/arg raw codes (not an XM remap), so encode is their exact inverse and
  // the codec is byte-exact over real pattern data. DM2 is played by the dedicated
  // deltamusic2-wasm replayer from these raw bytes; a lossy XM→DM2 remap here dropped
  // arpeggio-table-0 (`08 00`) and rounded the volume args. See DeltaMusic2Parser.decodeCell.
  out[2] = (cell.effTyp ?? 0) & 0xFF;
  out[3] = (cell.eff ?? 0) & 0xFF;

  return out;
}

registerPatternEncoder('deltaMusic2', () => encodeDeltaMusic2Cell);

export { encodeDeltaMusic2Cell };
