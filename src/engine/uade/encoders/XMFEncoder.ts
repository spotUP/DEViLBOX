/**
 * XMFEncoder — Encodes TrackerCell back to XMF format (6 bytes per cell).
 *
 * Cell encoding (6 bytes):
 *   byte[0]: note (XM note - 36; 0 = empty)
 *   byte[1]: instrument
 *   byte[2]: effect1 type
 *   byte[3]: effect2 type
 *   byte[4]: effect2 parameter
 *   byte[5]: effect1 parameter
 *
 * Note mapping: XM note → XMF note = xmNote - 36 (1-77 range)
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function reverseXMFEffect(effTyp: number, eff: number): { xmfEff: number; param: number } {
  if (effTyp === 0 && eff === 0) return { xmfEff: 0, param: 0 };

  switch (effTyp) {
    case 0x0B: return { xmfEff: 0x0B, param: Math.max(0, eff - 1) }; // position jump (parser incremented)
    case 0x0E: return { xmfEff: (eff >> 4) | 0xE0, param: eff & 0x0F }; // extended: 0xExy
    default:   return { xmfEff: effTyp, param: eff };
  }
}

function encodeXMFCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(6);
  const note = cell.note ?? 0;

  // Byte 0: note
  if (note > 0 && note >= 37) {
    out[0] = note - 36;
  } else {
    out[0] = 0;
  }

  // Byte 1: instrument
  out[1] = (cell.instrument ?? 0) & 0xFF;

  // Effect 1 (primary): bytes 2 + 5
  const eff1 = reverseXMFEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[2] = eff1.xmfEff & 0xFF;
  out[5] = eff1.param & 0xFF;

  // Effect 2: bytes 3 + 4
  const eff2 = reverseXMFEffect(cell.effTyp2 ?? 0, cell.eff2 ?? 0);
  out[3] = eff2.xmfEff & 0xFF;
  out[4] = eff2.param & 0xFF;

  return out;
}

registerPatternEncoder('xmf', () => encodeXMFCell);

export { encodeXMFCell };
