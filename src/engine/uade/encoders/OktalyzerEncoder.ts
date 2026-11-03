/**
 * OktalyzerEncoder — Encodes TrackerCell back to Oktalyzer (.okt) format.
 *
 * Cell encoding (4 bytes in PBOD chunk):
 *   byte[0]: note (Amiga note index via amigaNoteToXM reverse)
 *   byte[1]: sample index
 *   byte[2]: effect command
 *   byte[3]: effect data
 *
 * Note mapping: amigaNoteToXM(x) = x + 12 -> reverse: xmNote - 12
 *
 * Effect mapping (reverse of mapOKTEffect):
 *   XM 0x0F → OKT 1 (set speed)
 *   XM 0x0B → OKT 2 (position jump)
 *   XM 0x0C → OKT 10 (set volume)
 *   XM 0x01 → OKT 11 (portamento up)
 *   XM 0x02 → OKT 12 (portamento down)
 *   XM 0x03 → OKT 13 (tone portamento)
 *   XM 0x0A → OKT 17 (volume slide)
 *   XM 0x0E (EC) → OKT 30 (note cut)
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

/** Oktalyzer effect command to the grid's effect (the one table the parser and the encoder both read). */
export function mapOKTEffect(cmd: number, data: number): { effTyp: number; eff: number } {
  switch (cmd) {
    case 1:  return { effTyp: 0x0F, eff: data };      // Set speed
    case 2:  return { effTyp: 0x0B, eff: data };      // Position jump
    case 10: return { effTyp: 0x0C, eff: data };      // Set volume
    case 11: return { effTyp: 0x01, eff: data };      // Portamento up
    case 12: return { effTyp: 0x02, eff: data };      // Portamento down
    case 13: return { effTyp: 0x03, eff: data };      // Tone portamento
    case 17: return { effTyp: 0x0A, eff: data };      // Volume slide
    case 30: return { effTyp: 0x0E, eff: (0xC << 4) | (data & 0xF) }; // Cut note (EC)
    default: return { effTyp: 0, eff: 0 };
  }
}

function reverseOKTEffect(effTyp: number, eff: number): { cmd: number; data: number } {
  if (effTyp === 0 && eff === 0) return { cmd: 0, data: 0 };
  switch (effTyp) {
    case 0x0F: return { cmd: 1, data: eff };
    case 0x0B: return { cmd: 2, data: eff };
    case 0x0C: return { cmd: 10, data: eff };
    case 0x01: return { cmd: 11, data: eff };
    case 0x02: return { cmd: 12, data: eff };
    case 0x03: return { cmd: 13, data: eff };
    case 0x0A: return { cmd: 17, data: eff };
    case 0x0E: {
      if ((eff & 0xF0) === 0xC0) return { cmd: 30, data: eff & 0x0F }; // note cut
      return { cmd: 0, data: 0 };
    }
    default: return { cmd: 0, data: 0 };
  }
}

/** Stored 4 bytes to the grid cell: the grid note is the stored note index + 12 (amigaNoteToXM). */
export function decodeOktalyzerCell(bytes: Uint8Array): TrackerCell {
  const { effTyp, eff } = mapOKTEffect(bytes[2], bytes[3]);
  return { note: bytes[0] === 0 ? 0 : bytes[0] + 12, instrument: bytes[1], volume: 0, effTyp, eff, effTyp2: 0, eff2: 0 };
}

/**
 * Grid cell to the stored 4 bytes. `stored` (the cell's current bytes, layout.encodeOverStored) keeps what the grid
 * cannot show: an effect command the grid has no code for survives an edit of the note, and an unedited cell
 * re-encodes to its own bytes.
 */
function encodeOktalyzerCell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const out = new Uint8Array(4);
  const was = stored && stored.length >= 4 ? decodeOktalyzerCell(stored) : null;
  const note = cell.note ?? 0;
  const eff = reverseOKTEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[0] = was && was.note === note ? stored![0] : (note > 12 ? (note - 12) & 0xFF : 0);
  out[1] = (cell.instrument ?? 0) & 0xFF;
  if (was && was.effTyp === (cell.effTyp ?? 0) && was.eff === (cell.eff ?? 0)) {
    out[2] = stored![2]; out[3] = stored![3];
  } else {
    out[2] = eff.cmd & 0xFF; out[3] = eff.data & 0xFF;
  }
  return out;
}

registerPatternEncoder('oktalyzer', () => encodeOktalyzerCell);

export { encodeOktalyzerCell };
