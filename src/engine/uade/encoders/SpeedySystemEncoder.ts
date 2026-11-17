/**
 * SpeedySystemEncoder - Speedy System (.ss) pattern codec (third-party/nuade/players/speedysystem/ss_module.c).
 *
 * A stored pattern is 16 rows of one voice, each a 3 byte cell [first, second, third] packed with two run codes:
 * 0x90 n = n cells of FF FF FF (song end), 0x92 n = n empty cells (00 00 00); every other cell is literal.
 * Note cell: first = (octave << 4) | note nibble (octave 1..4, nibble 1..12): grid note = (octave - 1) * 12 + nibble;
 * second = attack/release delay nibbles (kept in eff, 0xFF = no sound); third = sample number (instrument = third + 1,
 * a third above 0x30 is kept in effTyp2). Every other triple is carried raw: effTyp = first, eff = second, effTyp2 = third.
 * The octave is the player's table octave, not measured against Paula output.
 */

import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';

export const SS_ROWS = 16;
const FILL_END = 0x90;
const FILL_EMPTY = 0x92;
const SAMPLE_LAST = 0x30;

export function decodeSpeedySystemCell(b: ArrayLike<number>): TrackerCell {
  const octave = b[0] >> 4;
  const nibble = b[0] & 15;
  if (octave >= 1 && octave <= 4 && nibble >= 1 && nibble <= 12) {
    const sample = b[2] <= SAMPLE_LAST;
    return { note: (octave - 1) * 12 + nibble, instrument: sample ? b[2] + 1 : 0, volume: 0, effTyp: 0, eff: b[1], effTyp2: sample ? 0 : b[2], eff2: 0 };
  }
  return { note: 0, instrument: 0, volume: 0, effTyp: b[0], eff: b[1], effTyp2: b[2], eff2: 0 };
}

export function encodeSpeedySystemCell(c: TrackerCell): Uint8Array {
  const note = c.note ?? 0;
  if (note >= 1 && note <= 48) {
    return Uint8Array.of((Math.floor((note - 1) / 12) + 1) << 4 | ((note - 1) % 12 + 1), (c.eff ?? 0) & 0xff,
      (c.effTyp2 ?? 0) || Math.max(0, (c.instrument ?? 0) - 1) & 0xff);
  }
  return Uint8Array.of((c.effTyp ?? 0) & 0xff, (c.eff ?? 0) & 0xff, (c.effTyp2 ?? 0) & 0xff);
}

/** Pack 16 rows: a run of identical empty or end cells becomes one run code, anything else is literal. */
export function packSpeedySystemRows(rows: TrackerCell[]): Uint8Array {
  const out: number[] = [];
  for (let r = 0; r < SS_ROWS; ) {
    const cell = encodeSpeedySystemCell(rows[r] ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
    const fill = cell[0] === cell[1] && cell[1] === cell[2] && (cell[0] === 0 || cell[0] === 0xff) ? cell[0] : -1;
    if (fill < 0) { out.push(cell[0], cell[1], cell[2]); r++; continue; }
    let n = 1;
    while (r + n < SS_ROWS) {
      const next = encodeSpeedySystemCell(rows[r + n] ?? { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      if (next[0] !== fill || next[1] !== fill || next[2] !== fill) break;
      n++;
    }
    out.push(fill === 0 ? FILL_EMPTY : FILL_END, n);
    r += n;
  }
  return Uint8Array.from(out);
}

/** The cells of the pattern stored at `offset` and the bytes it occupies, or null when it runs past the file. */
export function unpackSpeedySystemPattern(buf: Uint8Array, offset: number): { rows: TrackerCell[]; size: number } | null {
  const rows: TrackerCell[] = [];
  let at = offset;
  while (rows.length < SS_ROWS) {
    if (at < 0 || at + 3 > buf.length) return null;
    if (buf[at] === FILL_END || buf[at] === FILL_EMPTY) {
      const fill = buf[at] === FILL_END ? 0xff : 0;
      for (let n = buf[at + 1]; n > 0 && rows.length < SS_ROWS; n--) rows.push(decodeSpeedySystemCell([fill, fill, fill]));
      at += 2;
    } else {
      rows.push(decodeSpeedySystemCell(buf.subarray(at, at + 3)));
      at += 3;
    }
  }
  return { rows, size: at - offset };
}

export const speedySystemEncoder: VariableLengthEncoder = {
  formatId: 'speedySystem',
  encodePattern: (rows) => packSpeedySystemRows(rows),
};

registerVariableEncoder(speedySystemEncoder);
