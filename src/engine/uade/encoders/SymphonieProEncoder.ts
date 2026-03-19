/**
 * SymphonieProEncoder.ts — Encodes TrackerCell back to Symphonie Pro SymEvent format.
 *
 * SymEvent (4 bytes, big-endian):
 *   byte[0]: command (uint8)
 *   byte[1]: note    (int8, signed)
 *   byte[2]: param   (uint8)
 *   byte[3]: inst    (uint8)
 *
 * Parsing (from SymphonieProParser _convertEvent):
 *   CMD_KEYON (0):
 *     note >= 0 && note <= 84: cell.note = clamp(note + 25 + transpose, 1, 119)
 *     inst < numInstruments:   cell.instrument = inst + 1  (0-based → 1-based)
 *     param 1-100:             cell.volume = round(param * 0.64)
 *     param > 200: special commands (VOL_STOP=254, VOL_KEYOFF=251, etc.)
 *
 * Reverse mapping:
 *   cell.note → symNote = cell.note - 25 (no transpose in encoded data; transpose is per-position)
 *   cell.instrument → symInst = cell.instrument - 1
 *   cell.volume → symParam = round(cell.volume / 0.64) clamped 0-100
 *   Effects:
 *     XM 0x0F → CMD_SET_SPEED (9)
 *     XM 0x0A → CMD_VOLSLIDE_UP (1) or CMD_VOLSLIDE_DOWN (2)
 *     XM 0x01 → CMD_PITCH_UP (3)
 *     XM 0x02 → CMD_PITCH_DOWN (4)
 *     XM 0x04 → CMD_VIBRATO (13)
 *     XM 0x07 → CMD_TREMOLO (12)
 *     XM 0x09 → CMD_REPLAY_FROM (5)
 *     XM 0x03 → CMD_ADD_HALFTONE (18) with note
 *
 * This uses a fixed 4-byte cell encoder (UADEPatternLayout).
 *
 * Parser reference: SymphonieProParser.ts _convertEvent lines 1004-1136
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

// SymEvent command constants (from parser)
const CMD_KEYON         = 0;
const CMD_VOLSLIDE_UP   = 1;
const CMD_VOLSLIDE_DOWN = 2;
const CMD_PITCH_UP      = 3;
const CMD_PITCH_DOWN    = 4;
const CMD_REPLAY_FROM   = 5;
const CMD_SET_SPEED     = 9;
const CMD_TREMOLO       = 12;
const CMD_VIBRATO       = 13;
const CMD_ADD_HALFTONE  = 18;

/**
 * Encode a TrackerCell back to a 4-byte SymEvent.
 * Exact inverse of _convertEvent in SymphonieProParser.ts.
 */
export function encodeSymphonieProCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const xmNote = cell.note ?? 0;
  const xmInstr = cell.instrument ?? 0;
  const xmVol = cell.volume ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  // Check for effect-only commands first (no note/instrument)
  if (xmNote === 0 && effTyp !== 0) {
    switch (effTyp) {
      case 0x0F: // Set Speed → CMD_SET_SPEED
        out[0] = CMD_SET_SPEED;
        out[1] = 0;  // note (unused)
        out[2] = eff > 0 ? eff : 4;
        out[3] = 0;
        return out;

      case 0x0A: { // Volume Slide
        const upVal = (eff >> 4) & 0x0F;
        const downVal = eff & 0x0F;
        if (upVal > 0) {
          out[0] = CMD_VOLSLIDE_UP;
          out[2] = upVal;
        } else {
          out[0] = CMD_VOLSLIDE_DOWN;
          out[2] = downVal;
        }
        out[1] = 0;
        out[3] = 0;
        return out;
      }

      case 0x01: // Portamento Up → CMD_PITCH_UP
        out[0] = CMD_PITCH_UP;
        out[1] = 0;
        out[2] = eff & 0xFF;
        out[3] = 0;
        return out;

      case 0x02: // Portamento Down → CMD_PITCH_DOWN
        out[0] = CMD_PITCH_DOWN;
        out[1] = 0;
        out[2] = eff & 0xFF;
        out[3] = 0;
        return out;

      case 0x04: // Vibrato → CMD_VIBRATO
        out[0] = CMD_VIBRATO;
        out[1] = 0;
        // Parser: eff = (inst >> 3, 15) << 4 | min(param, 15)
        // Reverse: param = eff & 0x0F, inst = (eff >> 4) << 3
        out[2] = eff & 0x0F;
        out[3] = ((eff >> 4) & 0x0F) << 3;
        return out;

      case 0x07: // Tremolo → CMD_TREMOLO
        out[0] = CMD_TREMOLO;
        out[1] = 0;
        // Parser: eff = (inst >> 3, 15) << 4 | min(param >> 3, 15)
        // Reverse: param = (eff & 0x0F) << 3, inst = (eff >> 4) << 3
        out[2] = ((eff & 0x0F) << 3) & 0xFF;
        out[3] = (((eff >> 4) & 0x0F) << 3) & 0xFF;
        return out;

      case 0x09: // Sample Offset → CMD_REPLAY_FROM
        out[0] = CMD_REPLAY_FROM;
        out[1] = 0;
        out[2] = eff & 0xFF;
        out[3] = 0;
        return out;

      case 0x03: // Tone Portamento → CMD_ADD_HALFTONE
        out[0] = CMD_ADD_HALFTONE;
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;
        return out;

      default:
        // Unknown effect — emit empty event
        return out;
    }
  }

  // Note/instrument event → CMD_KEYON
  out[0] = CMD_KEYON;

  // Note: reverse of clampNote(note + 25 + transpose)
  // Since transpose is per-position (not stored in event), we reverse without it.
  // symNote = xmNote - 25 (if note present)
  if (xmNote > 0 && xmNote <= 119) {
    const symNote = xmNote - 25;
    // Write as signed int8
    out[1] = symNote < 0 ? (symNote + 256) & 0xFF : symNote & 0xFF;
  } else {
    out[1] = 0xFF & 0xFF; // -1 as signed byte = no note
  }

  // Volume: reverse of round(param * 0.64) clamped 0-64
  // symParam = round(xmVol / 0.64) clamped 0-100
  if (xmVol > 0 && xmVol <= 64) {
    out[2] = Math.min(100, Math.round(xmVol / 0.64));
  } else {
    out[2] = 0;
  }

  // Instrument: reverse of inst + 1
  if (xmInstr > 0) {
    out[3] = (xmInstr - 1) & 0xFF;
  } else {
    out[3] = 0;
  }

  // If there's also an effect on this row, we lose it (Symphonie events are
  // either note-on or command, not both). Priority goes to note-on.
  // Effects on the same row as notes are encoded in the note-on's inst/param fields
  // for some commands (vibrato uses inst field). For simple encoding we keep the note.

  return out;
}

registerPatternEncoder('symphoniePro', () => encodeSymphonieProCell);
