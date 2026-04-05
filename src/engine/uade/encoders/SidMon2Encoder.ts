/**
 * SidMon2Encoder.ts — Variable-length encoder for SidMon II pattern data.
 *
 * SidMon II uses a compact variable-length encoding per row (1-4 bytes):
 *   value=0:           effect + param (3 bytes)
 *   value<0 (signed):  speed change = ~value (1 byte)
 *   value 1-111:       note, then:
 *     next<0:          speed change (2 bytes: note + speed)
 *     next 1-111:      sample, then:
 *       next2<0:       speed change (3 bytes: note + sample + speed)
 *       next2>=0:      effect + param (4 bytes: note + sample + effect + param)
 *     next>=112:       effect + param (3 bytes: note + effect + param)
 *   value>=112:        effect + param (2 bytes)
 *
 * XM effect → SidMon2 effect mapping (reverse of parser):
 *   XM 0x00 (arpeggio)       → S2 0x70
 *   XM 0x01 (porta up)       → S2 0x71
 *   XM 0x02 (porta down)     → S2 0x72
 *   XM 0x03 (tone porta)     → S2 note-as-effect (effect=targetNote, param=speed)
 *   XM 0x0A (vol slide up)   → S2 0x73 (param = high nibble >> 4)
 *   XM 0x0A (vol slide down) → S2 0x74 (param = low nibble)
 *   XM 0x0C (set volume)     → S2 0x7C
 *   XM 0x0F (set speed)      → S2 0x7F
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

/** Convert XM note (1-96) back to SidMon2 note index (1-72). */
function xmNoteToS2(xmNote: number): number {
  if (xmNote <= 0 || xmNote > 96) return 0;
  const s2 = xmNote - 12;
  return (s2 >= 1 && s2 <= 72) ? s2 : 0;
}

/** Convert XM effect to SidMon2 effect + param. Returns [effect, param] or null. */
function xmEffectToS2(effTyp: number, eff: number): [number, number] | null {
  switch (effTyp) {
    case 0x00: return eff !== 0 ? [0x70, eff] : null;          // Arpeggio
    case 0x01: return [0x71, eff];                              // Porta up
    case 0x02: return [0x72, eff];                              // Porta down
    case 0x03: return null;                                     // Tone porta — handled separately as note-slide
    case 0x0A:                                                  // Volume slide
      if ((eff & 0xF0) !== 0) return [0x73, (eff >> 4) & 0x0F]; // Up
      return [0x74, eff & 0x0F];                                 // Down
    case 0x0C: return [0x7C, Math.min(eff, 64)];                // Set volume
    case 0x0F: return [0x7F, eff & 0x0F];                       // Set speed
    default: return null;
  }
}

/** Encode a signed byte as an unsigned byte (two's complement). */
function s8(value: number): number {
  return value < 0 ? value + 256 : value & 0xFF;
}

export const sidMon2Encoder: VariableLengthEncoder = {
  formatId: 'sidMon2',

  encodePattern(rows: TrackerCell[]): Uint8Array {
    const buf: number[] = [];

    for (const cell of rows) {
      const note = xmNoteToS2(cell.note);
      const sample = cell.instrument;
      const s2eff = xmEffectToS2(cell.effTyp, cell.eff);
      // Speed from Fxx effect (speed < 32)
      const isSpeed = cell.effTyp === 0x0F && cell.eff > 0 && cell.eff < 32;
      const speed = isSpeed ? cell.eff : 0;

      if (note > 0) {
        buf.push(s8(note));

        if (speed > 0 && sample === 0 && !s2eff) {
          // note + speed
          buf.push(s8(~speed));
        } else if (sample > 0) {
          buf.push(s8(sample));
          if (speed > 0 && !s2eff) {
            // note + sample + speed
            buf.push(s8(~speed));
          } else if (s2eff) {
            // note + sample + effect + param
            buf.push(s8(s2eff[0]));
            buf.push(s2eff[1] & 0xFF);
          }
          // else: note + sample only (2 bytes) — need a terminator
          // The format expects another byte after sample; emit effect 0 + param 0
          else {
            buf.push(s8(0));   // effect = 0 (no effect, but acts as separator)
            buf.push(0);       // param = 0
          }
        } else if (s2eff && s2eff[0] >= 112) {
          // note + effect (>= 112) + param
          buf.push(s8(s2eff[0]));
          buf.push(s2eff[1] & 0xFF);
        }
        // else: note only — but format requires at least one byte after note
        // Encode as note + speed 0 is invalid; encode as note + effect 0 + param 0
        else {
          buf.push(s8(0));   // effect = 0
          buf.push(0);       // param = 0
        }
      } else if (speed > 0 && !s2eff) {
        // Speed change only (no note)
        buf.push(s8(~speed));
      } else if (s2eff) {
        if (s2eff[0] >= 112) {
          // Effect only (>= 112): 2 bytes
          buf.push(s8(s2eff[0]));
          buf.push(s2eff[1] & 0xFF);
        } else {
          // Effect < 112 with no note: use the 0 + effect + param encoding
          buf.push(s8(0));
          buf.push(s8(s2eff[0]));
          buf.push(s2eff[1] & 0xFF);
        }
      } else {
        // Empty row: encode as 0 + 0 + 0 (no note, no effect)
        buf.push(s8(0));
        buf.push(s8(0));
        buf.push(0);
      }
    }

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(sidMon2Encoder);
