/**
 * S3MEncoder — Variable-length encoder for ScreamTracker 3 (.s3m) pattern data.
 *
 * S3M uses packed pattern data where each row is terminated by 0x00.
 * Each channel entry is:
 *   flagByte: channel (bits 0-4) + flags (bits 5-7)
 *     bit 5: note + instrument follow (2 bytes)
 *     bit 6: volume follows (1 byte)
 *     bit 7: command + param follow (2 bytes)
 *
 * Note encoding (S3M native):
 *   high nibble = octave, low nibble = semitone (0=C)
 *   0xFE = note cut, 0xFF = no note
 *
 * This encodes a single channel's rows. The trackMap maps all channels of the
 * same pattern to the same file-pattern index, so the chip editor re-assembles
 * all channels when writing back.
 *
 * Effect reverse mapping: XM effTyp → S3M command letter (A=1..Z=26).
 * Must reverse the mapS3MEffect() from S3MParser.
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

const XM_NOTE_OFF = 97;
const S3M_NOTE_OFF = 0xFE;
const S3M_NOTE_NONE = 0xFF;

/**
 * Convert XM note to S3M note byte.
 * XM note 1 = C-0, parser: octave * 12 + semitone + 1
 * Reverse: semitone = (xmNote - 1) % 12, octave = floor((xmNote - 1) / 12)
 * S3M byte: (octave << 4) | semitone
 */
function xmNoteToS3M(xmNote: number): number {
  if (xmNote === XM_NOTE_OFF) return S3M_NOTE_OFF;
  if (xmNote <= 0) return S3M_NOTE_NONE;
  const semi = (xmNote - 1) % 12;
  const octave = Math.floor((xmNote - 1) / 12);
  return (octave << 4) | semi;
}

/**
 * Reverse XM volume column to S3M raw volume.
 * XM 0x10-0x50 = set volume 0-64; XM 0 = no volume.
 * S3M: 0-64 = set volume; >64 = no volume.
 */
function xmVolToS3M(xmVol: number): { hasVol: boolean; vol: number } {
  if (xmVol >= 0x10 && xmVol <= 0x50) {
    return { hasVol: true, vol: xmVol - 0x10 };
  }
  return { hasVol: false, vol: 0xFF };
}

/**
 * Reverse XM effect to S3M command + param.
 * Returns { cmd: S3M command 1-26 (A-Z), param }.
 * cmd=0 means no effect.
 */
function reverseS3MEffect(effTyp: number, eff: number): { cmd: number; param: number } {
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
    case 0x08: return { cmd: 24, param: Math.min(127, eff >> 1) }; // X: set pan 0-255 → 0-127
    case 0x09: return { cmd: 15, param: eff };  // O: sample offset
    case 0x0A: return { cmd: 4, param: eff };   // D: volume slide
    case 0x0B: return { cmd: 2, param: eff };   // B: position jump
    case 0x0D: return { cmd: 3, param: eff };   // C: pattern break
    case 0x0E: {
      // Extended effects: reverse the sub-command mapping
      const sub = (eff >> 4) & 0x0F;
      const val = eff & 0x0F;
      switch (sub) {
        case 0x1: return { cmd: 6, param: 0xF0 | val };  // Fine porta up → FFx
        case 0x2: return { cmd: 5, param: 0xF0 | val };  // Fine porta dn → EFx
        case 0x3: return { cmd: 19, param: 0x30 | val };  // S3x
        case 0x4: return { cmd: 19, param: 0x40 | val };  // S4x
        case 0x5: return { cmd: 19, param: 0x50 | val };  // S5x
        case 0x6: return { cmd: 19, param: 0x60 | val };  // S6x
        case 0x8: return { cmd: 19, param: 0x80 | val };  // S8x
        case 0x9: return { cmd: 17, param: val };          // Q: retrig
        case 0xC: return { cmd: 19, param: 0xC0 | val };  // SCx
        case 0xD: return { cmd: 19, param: 0xD0 | val };  // SDx
        case 0xE: return { cmd: 19, param: 0xE0 | val };  // SEx
        default:  return { cmd: 0, param: 0 };
      }
    }
    case 0x0F: {
      // Speed or tempo
      if (eff < 0x20) return { cmd: 1, param: eff };  // A: set speed
      return { cmd: 20, param: eff };                   // T: set tempo
    }
    case 0x10: return { cmd: 22, param: eff };  // V: global volume
    case 0x11: return { cmd: 23, param: eff };  // W: global vol slide
    case 0x19: return { cmd: 25, param: eff };  // Y: panbrello
    case 0x1D: return { cmd: 9, param: eff };   // I: tremor
    case 0x21: {
      // Extra fine portamento
      const sub = (eff >> 4) & 0x0F;
      const val = eff & 0x0F;
      if (sub === 0x1) return { cmd: 6, param: 0xE0 | val }; // FEx
      if (sub === 0x2) return { cmd: 5, param: 0xE0 | val }; // EEx
      return { cmd: 0, param: 0 };
    }
    default: return { cmd: 0, param: 0 };
  }
}

export const s3mEncoder: VariableLengthEncoder = {
  formatId: 's3m',

  encodePattern(rows: TrackerCell[], channel: number): Uint8Array {
    const buf: number[] = [];
    const ch = channel & 0x1F;

    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;
      const vol = cell.volume ?? 0;

      const hasNote = note !== 0 || instr !== 0;
      const { hasVol, vol: s3mVol } = xmVolToS3M(vol);
      const fx = reverseS3MEffect(effTyp, eff);
      const hasFx = fx.cmd !== 0 || fx.param !== 0;

      // Skip completely empty cells (no channel entry for this row)
      if (!hasNote && !hasVol && !hasFx) {
        buf.push(0x00); // end of row
        continue;
      }

      let flagByte = ch;
      if (hasNote) flagByte |= 0x20;
      if (hasVol) flagByte |= 0x40;
      if (hasFx) flagByte |= 0x80;

      buf.push(flagByte);

      if (hasNote) {
        buf.push(xmNoteToS3M(note));
        buf.push(instr & 0xFF);
      }

      if (hasVol) {
        buf.push(s3mVol);
      }

      if (hasFx) {
        buf.push(fx.cmd & 0xFF);
        buf.push(fx.param & 0xFF);
      }

      buf.push(0x00); // end of row
    }

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(s3mEncoder);
