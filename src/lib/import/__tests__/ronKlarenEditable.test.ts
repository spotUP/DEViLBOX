/**
 * Ron Klaren: a note command is 2 bytes (period index, wait). An unedited song exports byte-identical; a one-note edit
 * changes only that command's period-index byte and keeps its wait byte.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRonKlarenFile } from '@/lib/import/formats/RonKlarenParser';
import { exportRonKlaren } from '@/lib/export/RonKlarenExporter';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import { getEditableFormat } from '@/lib/formats/EditableFormatRegistry';
import '@/lib/formats/EditableFormatRegistry.builtins';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';

const NAME = 'astra 2.rk';
const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/ron-klaren', NAME)));
const load = () => parseRonKlarenFile(raw.slice(), NAME)!;
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe('Ron Klaren is editable', () => {
  it('is registered with its exporter', () => {
    expect(getEditableFormat('ronKlaren')?.exporter?.fn).toBe('exportRonKlaren');
  });

  it('an unedited song exports byte-identical', async () => {
    expect(Array.from((await exportRonKlaren(load())).data)).toEqual(Array.from(raw));
  });

  // Finds a placed note cell; `transposed` picks one whose stored period index differs from the grid note (track transpose).
  function findCell(song: ReturnType<typeof load>, transposed: boolean) {
    const layout = song.uadePatternLayout!;
    for (let p = 0; p < song.patterns.length; p++) {
      for (let c = 0; c < 4; c++) {
        for (let i = 0; i < song.patterns[p].channels[c].rows.length; i++) {
          const n = song.patterns[p].channels[c].rows[i].note;
          const at = getCellFileOffset(layout, p, i, c);
          if (n > 14 && n < 60 && at >= 0 && (raw[at] !== n + 23) === transposed) return { p, c, i, at };
        }
      }
    }
    return null;
  }

  for (const transposed of [false, true]) {
    it(`a one-note edit on a ${transposed ? 'transposed' : 'plain'} track changes only that command period-index byte`, async () => {
      const song = load();
      const found = findCell(song, transposed);
      if (!found) { expect(transposed).toBe(false); return; } // astra 2 transposes every track (-24): no plain one to find
      setGridBaseline(baselineOf(song.patterns));
      const { p, c, i, at } = found;
      const cell = song.patterns[p].channels[c].rows[i];
      song.patterns[p].channels[c].rows[i] = { ...cell, note: cell.note + 1 };
      const out = (await exportRonKlaren(song)).data;
      expect(diffAt(out, raw)).toEqual([at]);
      expect(out[at]).toBe(raw[at] + 1);
      setGridBaseline(null);
    });
  }
});
