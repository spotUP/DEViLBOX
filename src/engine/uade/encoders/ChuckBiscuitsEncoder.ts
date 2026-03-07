/**
 * ChuckBiscuitsEncoder — Encodes TrackerCell back to CBA binary format.
 *
 * Cell encoding: 5 bytes [instr, note, vol, command, param]
 *   instr:   instrument number (1-based; 0 = no instrument)
 *   note:    0 = no note; 255 = note cut; 1-96 → pitch = 12 + note
 *   vol:     0 = no volume; 1-65 → volume = vol-1 (0-64)
 *   command: CBA effect byte (see reverseEffect)
 *   param:   effect parameter
 *
 * This is the exact reverse of ChuckBiscuitsParser's decode logic.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

// Constants matching ChuckBiscuitsParser
const CMD_NOTE_CUT = 254;    // DEViLBOX internal note-cut value
const CMD_SET_SPEED = 0x0F;  // XM/MOD set speed/tempo effect
const CMD_RETRIG = 0x1B;     // XM retrigger effect (Qxx)

/**
 * Reverse-translate DEViLBOX effect (effTyp/eff) → CBA (command, param).
 */
function reverseEffect(effTyp: number, eff: number): { command: number; param: number } {
  if (effTyp === 0 && eff === 0) return { command: 0, param: 0 };

  // Extended effects (Exy) → CBA 0x10-0x1E
  if (effTyp === 0x0E) {
    const subCmd = (eff >> 4) & 0x0F;
    const subParam = eff & 0x0F;
    return { command: 0x10 + subCmd, param: subParam };
  }

  // Retrigger (Qxx) → CBA 0x18
  if (effTyp === CMD_RETRIG) {
    return { command: 0x18, param: eff };
  }

  // Set speed/tempo (Fxx) → CBA 0x1F (speed) or 0x20 (tempo)
  if (effTyp === CMD_SET_SPEED) {
    if (eff >= 20) {
      return { command: 0x20, param: eff }; // tempo
    }
    return { command: 0x1F, param: eff }; // speed
  }

  // Standard MOD commands 0-13 → CBA 1-14
  if (effTyp >= 0 && effTyp <= 0x0D) {
    return { command: effTyp + 1, param: eff };
  }

  // Unknown effect — pass through as no-op
  return { command: 0, param: 0 };
}

/**
 * Encode a TrackerCell to CBA binary format (5 bytes).
 */
function encodeCBACell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(5);

  // Byte 0: instrument (1-based, 0 = none)
  out[0] = cell.instrument ?? 0;

  // Byte 1: note
  //   DEViLBOX note 0 = no note → CBA 0
  //   DEViLBOX note 254 (CMD_NOTE_CUT) → CBA 255
  //   DEViLBOX note N (1-96 range, stored as 12+note) → CBA = N - 12
  const note = cell.note ?? 0;
  if (note === 0) {
    out[1] = 0;
  } else if (note === CMD_NOTE_CUT) {
    out[1] = 255;
  } else {
    // Reverse: parser does cell.note = 12 + cbaNote, so cbaNote = cell.note - 12
    const cbaNote = note - 12;
    out[1] = (cbaNote >= 1 && cbaNote <= 96) ? cbaNote : 0;
  }

  // Byte 2: volume
  //   DEViLBOX volume 0 + no volume flag → CBA 0
  //   DEViLBOX volume V (0-64) → CBA V + 1 (1-65)
  //   Parser does: if (vol > 0) cell.volume = min(vol, 65) - 1
  //   So reverse: CBA vol = cell.volume + 1 if volume was set
  //   Problem: how to distinguish "volume 0" from "no volume set"?
  //   In XM/MOD, volume 0 is valid. CBA uses vol=0 for "no volume".
  //   We'll encode volume > 0 as vol+1, and volume 0 as 0 (no volume).
  //   This loses the ability to explicitly set volume to 0, but matches
  //   the original format's semantics.
  const vol = cell.volume ?? 0;
  out[2] = vol > 0 ? Math.min(vol + 1, 65) : 0;

  // Bytes 3-4: effect
  const { command, param } = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[3] = command;
  out[4] = param;

  return out;
}

// Register in the encoder registry
registerPatternEncoder('chuckBiscuits', () => encodeCBACell);

export { encodeCBACell };
