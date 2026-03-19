/**
 * MadTracker2Encoder — Encodes TrackerCell back to MadTracker 2 (.mt2) format.
 *
 * MT2Command is 7 bytes per cell:
 *   note      uint8 (0=empty, >96=key-off, else note-12)
 *   instr     uint8
 *   vol       uint8 (0x10-0x90 = volume)
 *   pan       uint8
 *   fxcmd     uint8
 *   fxparam1  uint8
 *   fxparam2  uint8
 *
 * Note mapping (reverse of convertMT2Note):
 *   Parser: xmNote = rawNote + 12 (for rawNote 1-96), >96 → 121 (key-off)
 *   Reverse: rawNote = xmNote - 12
 *
 * Volume (reverse of convertMT2Vol):
 *   Parser: vol 0x10-0x90 → 0-64
 *   Reverse: rawVol = vol * 2 + 0x10
 *
 * For packed patterns, this uses UADEVariablePatternLayout.
 * For unpacked patterns, this uses UADEPatternLayout with 7-byte cells.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

const NOTE_KEYOFF = 121;

/**
 * Reverse XM effect → MT2 effect triple (fxcmd, fxparam1, fxparam2).
 */
function reverseMT2Effect(effTyp: number, eff: number): { fxcmd: number; fxparam1: number; fxparam2: number } {
  if (effTyp === 0 && eff === 0) return { fxcmd: 0, fxparam1: 0, fxparam2: 0 };

  // Most common: FastTracker-style (fxcmd=0x00, fxparam2=XM cmd, fxparam1=param)
  switch (effTyp) {
    case 0x0F: return { fxcmd: 0x00, fxparam1: eff, fxparam2: 0x0F }; // speed/tempo
    case 0x0B: return { fxcmd: 0x00, fxparam1: eff, fxparam2: 0x0B }; // position jump
    case 0x0D: return { fxcmd: 0x00, fxparam1: eff, fxparam2: 0x0D }; // pattern break
    case 0x01: return { fxcmd: 0x00, fxparam1: eff, fxparam2: 0x01 }; // porta up
    case 0x02: return { fxcmd: 0x00, fxparam1: eff, fxparam2: 0x02 }; // porta down
    case 0x03: return { fxcmd: 0x00, fxparam1: eff, fxparam2: 0x03 }; // tone porta
    case 0x04: return { fxcmd: 0x00, fxparam1: eff, fxparam2: 0x04 }; // vibrato
    case 0x0A: return { fxcmd: 0x00, fxparam1: eff, fxparam2: 0x0A }; // vol slide
    case 0x08: return { fxcmd: 0x08, fxparam1: eff, fxparam2: 0 };     // panning
    case 0x0C: return { fxcmd: 0x0C, fxparam1: 0, fxparam2: Math.min(0xFF, eff << 1) }; // set volume
    default:   return { fxcmd: 0, fxparam1: 0, fxparam2: 0 };
  }
}

/**
 * Encode a TrackerCell to MT2 binary format (7 bytes, unpacked).
 */
function encodeMT2Cell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(7);
  const note = cell.note ?? 0;

  // Byte 0: note
  if (note === 0) {
    out[0] = 0;
  } else if (note === NOTE_KEYOFF || note === 97) {
    out[0] = 97; // key-off
  } else {
    // Reverse: rawNote = xmNote - 12
    const raw = note - 12;
    out[0] = (raw >= 1 && raw <= 96) ? raw : 0;
  }

  // Byte 1: instrument
  out[1] = cell.instrument ?? 0;

  // Byte 2: volume (0x10-0x90 range)
  const vol = cell.volume ?? 0;
  if (vol > 0) {
    out[2] = Math.min(0x90, Math.max(0x10, vol * 2 + 0x10));
  }

  // Byte 3: panning (stored in effect slot if available)
  out[3] = 0;

  // Bytes 4-6: effect
  const { fxcmd, fxparam1, fxparam2 } = reverseMT2Effect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[4] = fxcmd;
  out[5] = fxparam1;
  out[6] = fxparam2;

  return out;
}

registerPatternEncoder('mt2', () => encodeMT2Cell);

export { encodeMT2Cell };
