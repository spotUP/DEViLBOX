/**
 * ActivisionProEncoder — Encodes TrackerCell back to Activision Pro (.avp) format.
 *
 * Activision Pro track cells encode note and instrument in a single byte:
 *   bits 5..0 = note index (into AVP_PERIODS table)
 *   bits 7..6 = instrument (0-3)
 *
 * The actual track data is variable-length per parseTrackVersion, with extra
 * preceding bytes for effects/flags. Since the encoder only handles the core
 * note+instrument byte, getCellFileOffset points to the specific byte position.
 *
 * Note mapping (reverse of parser's avpNoteToXM):
 *   Parser: xmNote = AVP_REF_XM + (periodIdx - AVP_REF_IDX)
 *           where AVP_REF_XM = 37, AVP_REF_IDX = 60
 *   Encoder: periodIdx = xmNote - AVP_REF_XM + AVP_REF_IDX = xmNote - 37 + 60 = xmNote + 23
 *
 * Instrument mapping:
 *   Parser: instrField = (noteByte >> 6) & 0x03
 *   Encoder: instrField = instrument & 0x03, placed in bits 7..6
 *
 * Cell size: 1 byte (just the note+instrument byte; preceding effect bytes
 * are not modified by the cell encoder).
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

const AVP_REF_XM = 37;
const AVP_REF_IDX = 60;
const AVP_PERIODS_LEN = 85;

export function encodeActivisionProCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(1);
  const xmNote = cell.note ?? 0;
  const instr = cell.instrument ?? 0;

  let noteIdx = 0;
  if (xmNote > 0 && xmNote <= 96) {
    // Reverse avpNoteToXM: xmNote = AVP_REF_XM + (idx - AVP_REF_IDX)
    // → idx = xmNote - AVP_REF_XM + AVP_REF_IDX
    noteIdx = xmNote - AVP_REF_XM + AVP_REF_IDX;
    noteIdx = Math.max(0, Math.min(AVP_PERIODS_LEN - 1, noteIdx));
  }

  // Pack: bits 7..6 = instrument (0-3), bits 5..0 = note index
  const instrField = (instr & 0x03) << 6;
  out[0] = instrField | (noteIdx & 0x3F);

  return out;
}

registerPatternEncoder('activisionPro', () => encodeActivisionProCell);
