/**
 * ITEncoder — Variable-length encoder for Impulse Tracker (.it) pattern data.
 *
 * IT uses packed pattern data with mask-based compression:
 *   channelByte: 0 = end of row
 *     channel = (byte - 1) & 63
 *     if byte & 0x80: mask byte follows; else reuse lastmask[channel]
 *     mask bits:
 *       0x01: note follows
 *       0x02: instrument follows
 *       0x04: volume command follows
 *       0x08: command + param follow
 *       0x10-0x80: recall last values (not used in encoder — always write fresh)
 *
 * Note encoding:
 *   0-119 = note (IT note 0 = C-0; XM note 1 = C-0 → IT note = xmNote - 1)
 *   254 = note cut, 255 = no note
 *
 * Volume column reverse mapping: XM vol → IT volume byte.
 * Effect reverse mapping: same as S3M (A=1..Z=26).
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

const XM_NOTE_OFF = 97;
const IT_NOTE_CUT = 254;
const IT_NOTE_NONE = 255;

/**
 * Convert XM note to IT note byte.
 * XM 1 = C-0 → IT 0 = C-0
 */
function xmNoteToIT(xmNote: number): number {
  if (xmNote === XM_NOTE_OFF) return IT_NOTE_CUT;
  if (xmNote <= 0) return IT_NOTE_NONE;
  return xmNote - 1;
}

/**
 * Reverse XM volume column to IT volume byte.
 *
 * XM → IT mappings (reverse of mapITVolume in ITParser):
 *   0x10-0x50 → 0-64 (set volume)
 *   0x60-0x69 → 95-104 (volume slide down)
 *   0x70-0x79 → 85-94 (volume slide up)
 *   0x80-0x89 → 75-84 (fine volume down)
 *   0x90-0x99 → 65-74 (fine volume up)
 *   0xA0-0xA9 → 193-202 (vibrato speed)
 *   0xB0-0xB9 → 203-212 (vibrato depth)
 *   0xC0-0xCF → 128-192 (set panning)
 *   0 → no volume
 */
function xmVolToIT(xmVol: number): { hasVol: boolean; vol: number } {
  if (xmVol === 0) return { hasVol: false, vol: 0 };
  if (xmVol >= 0x10 && xmVol <= 0x50) return { hasVol: true, vol: xmVol - 0x10 };
  if (xmVol >= 0x60 && xmVol <= 0x69) return { hasVol: true, vol: 95 + (xmVol & 0x0F) };
  if (xmVol >= 0x70 && xmVol <= 0x79) return { hasVol: true, vol: 85 + (xmVol & 0x0F) };
  if (xmVol >= 0x80 && xmVol <= 0x89) return { hasVol: true, vol: 75 + (xmVol & 0x0F) };
  if (xmVol >= 0x90 && xmVol <= 0x99) return { hasVol: true, vol: 65 + (xmVol & 0x0F) };
  if (xmVol >= 0xA0 && xmVol <= 0xA9) return { hasVol: true, vol: 193 + (xmVol & 0x0F) };
  if (xmVol >= 0xB0 && xmVol <= 0xB9) return { hasVol: true, vol: 203 + (xmVol & 0x0F) };
  if (xmVol >= 0xC0 && xmVol <= 0xCF) {
    return { hasVol: true, vol: 128 + Math.round((xmVol & 0x0F) * 64 / 15) };
  }
  return { hasVol: false, vol: 0 };
}

/**
 * Reverse XM effect to IT/S3M command + param.
 * Same command set as S3M (A=1..Z=26).
 */
function reverseITEffect(effTyp: number, eff: number): { cmd: number; param: number } {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };

  switch (effTyp) {
    case 0x00: return { cmd: 10, param: eff };  // J: arpeggio
    case 0x01: return { cmd: 6, param: eff };   // F: portamento up
    case 0x02: return { cmd: 5, param: eff };   // E: portamento down
    case 0x03: return { cmd: 7, param: eff };   // G: tone portamento
    case 0x04: return { cmd: 8, param: eff };   // H: vibrato
    case 0x05: return { cmd: 12, param: eff };  // L: tone porta + vol slide
    case 0x06: return { cmd: 11, param: eff };  // K: vibrato + vol slide
    case 0x07: return { cmd: 18, param: eff };  // R: tremolo
    case 0x08: return { cmd: 24, param: Math.min(127, eff >> 1) }; // X: set pan
    case 0x09: return { cmd: 15, param: eff };  // O: sample offset
    case 0x0A: return { cmd: 4, param: eff };   // D: volume slide
    case 0x0B: return { cmd: 2, param: eff };   // B: position jump
    case 0x0D: return { cmd: 3, param: eff };   // C: pattern break
    case 0x0E: {
      const sub = (eff >> 4) & 0x0F;
      const val = eff & 0x0F;
      switch (sub) {
        case 0x1: return { cmd: 6, param: 0xF0 | val };
        case 0x2: return { cmd: 5, param: 0xF0 | val };
        case 0x3: return { cmd: 19, param: 0x30 | val };
        case 0x4: return { cmd: 19, param: 0x40 | val };
        case 0x5: return { cmd: 19, param: 0x50 | val };
        case 0x6: return { cmd: 19, param: 0x60 | val };
        case 0x8: return { cmd: 19, param: 0x80 | val };
        case 0x9: return { cmd: 17, param: val };
        case 0xC: return { cmd: 19, param: 0xC0 | val };
        case 0xD: return { cmd: 19, param: 0xD0 | val };
        case 0xE: return { cmd: 19, param: 0xE0 | val };
        default:  return { cmd: 0, param: 0 };
      }
    }
    case 0x0F: {
      if (eff < 0x20) return { cmd: 1, param: eff };
      return { cmd: 20, param: eff };
    }
    case 0x10: return { cmd: 22, param: eff };
    case 0x11: return { cmd: 23, param: eff };
    case 0x19: return { cmd: 25, param: eff };
    case 0x1D: return { cmd: 9, param: eff };
    case 0x21: {
      const sub = (eff >> 4) & 0x0F;
      const val = eff & 0x0F;
      if (sub === 0x1) return { cmd: 6, param: 0xE0 | val };
      if (sub === 0x2) return { cmd: 5, param: 0xE0 | val };
      return { cmd: 0, param: 0 };
    }
    default: return { cmd: 0, param: 0 };
  }
}

export const itEncoder: VariableLengthEncoder = {
  formatId: 'it',

  encodePattern(rows: TrackerCell[], channel: number): Uint8Array {
    const buf: number[] = [];
    const ch = channel & 63;

    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const vol = cell.volume ?? 0;
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;

      const hasNote = note !== 0;
      const hasInstr = instr !== 0;
      const { hasVol, vol: itVol } = xmVolToIT(vol);
      const fx = reverseITEffect(effTyp, eff);
      const hasFx = fx.cmd !== 0 || fx.param !== 0;

      // Skip completely empty cells
      if (!hasNote && !hasInstr && !hasVol && !hasFx) {
        buf.push(0x00); // end of row
        continue;
      }

      // Channel byte: (ch + 1) | 0x80 (always write mask)
      const channelByte = ((ch + 1) & 0x7F) | 0x80;
      buf.push(channelByte);

      // Build mask
      let mask = 0;
      if (hasNote) mask |= 0x01;
      if (hasInstr) mask |= 0x02;
      if (hasVol) mask |= 0x04;
      if (hasFx) mask |= 0x08;

      buf.push(mask);

      if (hasNote) buf.push(xmNoteToIT(note));
      if (hasInstr) buf.push(instr & 0xFF);
      if (hasVol) buf.push(itVol & 0xFF);
      if (hasFx) {
        buf.push(fx.cmd & 0xFF);
        buf.push(fx.param & 0xFF);
      }

      buf.push(0x00); // end of row
    }

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(itEncoder);
