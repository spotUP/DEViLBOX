/**
 * Hippel ST octave. The format plays on the Atari ST YM2149 (no Paula), so the oracle is the
 * YM period table inside the song file ($EEE = 3822 first; f = 2 MHz / (16 * period), 32.7 Hz = C-1).
 * The grid shows table index i as note i + 13 (HST_NOTE_BASE); that must equal the grid note of
 * the frequency the chip plays. hstRowFromCell inverts hstCellFromRow (edit path, same constant).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hstCellFromRow, hstRowFromCell, HST_NOTE_BASE } from '@/lib/import/formats/JochenHippelSTSong';

const FILE = join(process.cwd(), 'public/data/songs/hippel-st/crown england.hst');
const C1_HZ = 32.7032;

describe('Hippel ST octave', () => {
  it('table index i shows the grid note of the YM frequency it plays (C-1 = 13)', () => {
    const b = new Uint8Array(readFileSync(FILE));
    let at = -1;
    for (let i = 0; i + 4 < b.length; i++) if (b[i] === 0x0e && b[i + 1] === 0xee && b[i + 2] === 0x0e && b[i + 3] === 0x17) { at = i; break; }
    expect(at, 'YM period table found in the file').toBeGreaterThan(0);
    const sv = { pattern: 0, transpose: 0, soundTranspose: 0 };
    let n = 0;
    for (let i = 0; i < 84; i++) {
      const period = (b[at + 2 * i] << 8) | b[at + 2 * i + 1];
      const hz = 2_000_000 / (16 * period);
      const grid = Math.round(12 * Math.log2(hz / C1_HZ)) + 13;
      const cell = hstCellFromRow({ note: i, info: 0, extra: null }, sv as never, 4);
      expect(cell.note, `index ${i} period ${period}`).toBe(grid);
      expect(hstRowFromCell(cell, { note: i, info: 0, extra: null }, sv as never, false)?.note, 'encode inverts decode').toBe(i);
      n++;
    }
    expect(n).toBe(84);
    expect(HST_NOTE_BASE).toBe(13);
  });
});
