/**
 * NRUEncoder — Encodes TrackerCell back to NoiseRunner (.nru) binary format.
 *
 * Cell encoding (4 bytes):
 *   byte[0] (d0): effect bits [5:2] (6-bit field with special mapping)
 *   byte[1] (d1): effect parameter
 *   byte[2] (d2): note encoded (xmNote - 36) * 2 (must be even)
 *   byte[3] (d3): instrument << 3 (upper 5 bits)
 *
 * Note mapping: XM note → NRU = (xmNote - 36) * 2
 *
 * Effect mapping (reverse of parser):
 *   The parser has a special mapping: d0==0x00 → effTyp 0x03, d0==0x0C → effTyp 0x00
 *   Reverse: effTyp 0x03 → d0=0x00, effTyp 0x00 → d0=0x0C, else d0 = effTyp << 2
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function reverseNRUEffect(effTyp: number, eff: number): { d0: number; d1: number } {
  if (effTyp === 0 && eff === 0) return { d0: 0, d1: 0 };

  let d0: number;
  switch (effTyp) {
    case 0x03: d0 = 0x00; break;   // tone portamento → d0=0
    case 0x00: d0 = 0x0C; break;   // arpeggio → d0=0x0C
    default:   d0 = (effTyp << 2) & 0xFC; break;
  }

  return { d0, d1: eff & 0xFF };
}

function encodeNRUCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  const { d0, d1 } = reverseNRUEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[0] = d0;
  out[1] = d1;

  // d2: note encoded as (xmNote - 36) * 2
  if (note > 0 && note >= 36) {
    out[2] = ((note - 36) * 2) & 0xFF;
  } else {
    out[2] = 0;
  }

  // d3: instrument in upper 5 bits
  out[3] = ((cell.instrument ?? 0) << 3) & 0xFF;

  // Byte-exact carrier restore. Every NRU byte is lossy in the XM view (d0's
  // effect map is many-to-one and drops its low 2 bits, d1 is remapped by
  // convertModEffect, d2's odd bit is lost to /2, d3 keeps only the upper 5 bits).
  // decodeCell stashes the exact source bytes in the invisible period/pan/cutoff
  // carriers (fields the NRU grid loop never sets); reproduce all 4 bytes verbatim.
  // Edited grid cells lack the carriers and keep the canonical derivation above.
  if (cell.period !== undefined && cell.pan !== undefined && cell.cutoff !== undefined) {
    out[0] = (cell.period >> 8) & 0xFF;
    out[1] = cell.period & 0xFF;
    out[2] = cell.pan & 0xFF;
    out[3] = cell.cutoff & 0xFF;
  }

  return out;
}

registerPatternEncoder('nru', () => encodeNRUCell);

export { encodeNRUCell };
