/**
 * HivelyEncoder.ts — Encodes TrackerCell back to HVL/AHX track step format.
 *
 * AHX track step encoding (3 bytes, bit-packed):
 *   byte[0] bits 7-2: note (6 bits, 0-60)
 *   byte[0] bits 1-0: instrument high 2 bits
 *   byte[1] bits 7-4: instrument low 4 bits
 *   byte[1] bits 3-0: effect command
 *   byte[2]:          effect parameter
 *
 * HVL track step encoding (variable: 1 byte if empty, 5 bytes otherwise):
 *   If byte[0] == 0x3F: empty step (1 byte)
 *   Otherwise:
 *     byte[0]: note (0-60)
 *     byte[1]: instrument
 *     byte[2]: (fx << 4) | (fxb & 0x0F)
 *     byte[3]: fxParam
 *     byte[4]: fxbParam
 *
 * XM note → HVL/AHX note: The parser maps note directly (with transpose applied).
 *   HVL note 1-60 → XM note (after transpose). Reverse: clamp to 0-60.
 *
 * Effect reverse mapping: mapHvlEffect is applied during parsing.
 * We reverse the most common mappings:
 *   XM 0x01 → HVL 0x1 (Portamento Up)
 *   XM 0x02 → HVL 0x2 (Portamento Down)
 *   XM 0x03 → HVL 0x3 (Tone Portamento)
 *   XM 0x05 → HVL 0x5 (Tone Port + Vol Slide)
 *   XM 0x08 → HVL 0x7 (Pan)
 *   XM 0x0A → HVL 0xA (Volume Slide)
 *   XM 0x0B → HVL 0xB (Position Jump)
 *   XM 0x0D → HVL 0xD (Pattern Break)
 *   XM 0x0E → HVL 0xE (Extended)
 *   XM 0x0F → HVL 0xF (Set Speed)
 *   volume column → HVL 0xC (Set Volume)
 *   flag1 → HVL 0x4 (Filter Override)
 *   flag2 → HVL 0x9 (Square Offset)
 *
 * Parser reference: HivelyParser.ts parseAHX lines 176-185, parseHVL lines 358-374
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerPatternEncoder, registerVariableEncoder } from '../UADEPatternEncoder';

/** Reverse XM effect type → HVL effect command */
function xmEffectToHvl(cell: TrackerCell): { fx: number; fxParam: number } {
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  const vol = cell.volume ?? 0;

  // Check flag columns first (HVL-specific effects preserved by parser)
  if (cell.flag1 !== undefined && cell.flag1 !== 0) {
    return { fx: 0x4, fxParam: cell.flag1 };  // Filter Override
  }
  if (cell.flag2 !== undefined && cell.flag2 !== 0) {
    return { fx: 0x9, fxParam: cell.flag2 };  // Square Offset
  }

  // Volume column → HVL 0xC
  if (vol > 0 && effTyp === 0 && eff === 0) {
    return { fx: 0xC, fxParam: vol & 0xFF };
  }

  switch (effTyp) {
    case 0x01: return { fx: 0x1, fxParam: eff };  // Portamento Up
    case 0x02: return { fx: 0x2, fxParam: eff };  // Portamento Down
    case 0x03: return { fx: 0x3, fxParam: eff };  // Tone Portamento
    case 0x05: return { fx: 0x5, fxParam: eff };  // Tone Port + Vol Slide
    case 0x08: return { fx: 0x7, fxParam: eff };  // Pan
    case 0x0A: return { fx: 0xA, fxParam: eff };  // Volume Slide
    case 0x0B: return { fx: 0xB, fxParam: eff };  // Position Jump
    case 0x0D: return { fx: 0xD, fxParam: eff };  // Pattern Break
    case 0x0E: return { fx: 0xE, fxParam: eff };  // Extended
    case 0x0F: return { fx: 0xF, fxParam: eff };  // Set Speed
    default:   return { fx: 0, fxParam: 0 };
  }
}

/** Reverse XM effect type → HVL secondary effect (fxb) */
function xmEffect2ToHvl(cell: TrackerCell): { fxb: number; fxbParam: number } {
  const effTyp2 = cell.effTyp2 ?? 0;
  const eff2 = cell.eff2 ?? 0;
  if (effTyp2 === 0 && eff2 === 0) return { fxb: 0, fxbParam: 0 };

  // Same mapping as primary effect
  switch (effTyp2) {
    case 0x01: return { fxb: 0x1, fxbParam: eff2 };
    case 0x02: return { fxb: 0x2, fxbParam: eff2 };
    case 0x03: return { fxb: 0x3, fxbParam: eff2 };
    case 0x05: return { fxb: 0x5, fxbParam: eff2 };
    case 0x08: return { fxb: 0x7, fxbParam: eff2 };
    case 0x0A: return { fxb: 0xA, fxbParam: eff2 };
    case 0x0B: return { fxb: 0xB, fxbParam: eff2 };
    case 0x0D: return { fxb: 0xD, fxbParam: eff2 };
    case 0x0E: return { fxb: 0xE, fxbParam: eff2 };
    case 0x0F: return { fxb: 0xF, fxbParam: eff2 };
    default:   return { fxb: 0, fxbParam: 0 };
  }
}

/**
 * Encode a TrackerCell to AHX 3-byte track step format.
 * Exact inverse of parseAHX lines 176-185.
 */
export function encodeAHXCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(3);
  const note = Math.max(0, Math.min(63, cell.note ?? 0)) & 0x3F;
  const instr = Math.max(0, Math.min(63, cell.instrument ?? 0)) & 0x3F;
  const { fx, fxParam } = xmEffectToHvl(cell);

  // byte[0]: (note << 2) | (instrument >> 4)
  out[0] = (note << 2) | ((instr >> 4) & 0x03);
  // byte[1]: (instrument_low4 << 4) | (fx & 0x0F)
  out[1] = ((instr & 0x0F) << 4) | (fx & 0x0F);
  // byte[2]: fxParam
  out[2] = fxParam & 0xFF;

  return out;
}

/**
 * HVL variable-length encoder.
 * Encodes all rows of one track into an HVL track byte stream.
 * Exact inverse of parseHVL lines 358-374.
 */
export const hivelyHVLEncoder: VariableLengthEncoder = {
  formatId: 'hivelyHVL',

  encodePattern(rows: TrackerCell[]): Uint8Array {
    const buf: number[] = [];

    for (const cell of rows) {
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const { fx, fxParam } = xmEffectToHvl(cell);
      const { fxb, fxbParam } = xmEffect2ToHvl(cell);

      // Check if step is completely empty
      if (note === 0 && instr === 0 && fx === 0 && fxParam === 0 && fxb === 0 && fxbParam === 0) {
        // Empty step: single 0x3F byte
        buf.push(0x3F);
      } else {
        // Full step: 5 bytes
        buf.push(note & 0xFF);       // byte[0]: note
        buf.push(instr & 0xFF);      // byte[1]: instrument
        buf.push(((fx & 0x0F) << 4) | (fxb & 0x0F)); // byte[2]: (fx << 4) | fxb
        buf.push(fxParam & 0xFF);    // byte[3]: fxParam
        buf.push(fxbParam & 0xFF);   // byte[4]: fxbParam
      }
    }

    return new Uint8Array(buf);
  },
};

registerPatternEncoder('hivelyAHX', () => encodeAHXCell);
registerVariableEncoder(hivelyHVLEncoder);

export { encodeAHXCell as encodeHivelyAHXCell };
