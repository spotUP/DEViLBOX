/**
 * Composer 669: an unedited song exports byte-identical; a one-note edit changes exactly the note bits of the one stored cell
 * (the instrument bits and the other two bytes stay), and the edited note reloads.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse669File } from '@/lib/import/formats/Format669Parser';
import { exportFormat669 } from '@/lib/export/Format669Exporter';
import { getEditableFormat } from '@/lib/formats/EditableFormatRegistry';
import '@/lib/formats/EditableFormatRegistry.builtins';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

afterAll(() => setGridBaseline(null));

const NAME = 'speed fighter.669';
const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/composer-669', NAME)));
const load = () => parse669File(raw.slice().buffer as ArrayBuffer, NAME);

describe('Composer 669 is editable', () => {
  it('is registered with its exporter', () => {
    expect(getEditableFormat('format669')?.exporter?.fn).toBe('exportFormat669');
  });

  it('an unedited song exports byte-identical with no warnings', async () => {
    const song = await load();
    setGridBaseline(baselineOf(song.patterns));
    const res = await exportFormat669(song);
    expect(res.warnings).toEqual([]);
    expect(Array.from(res.data)).toEqual(Array.from(raw));
  });

  it('a one-note edit changes only the note bits of its cell and reloads', async () => {
    const song = await load();
    const layout = song.uadePatternLayout!;
    let found: { p: number; c: number; r: number } | null = null;
    for (let p = 0; p < song.patterns.length && !found; p++) {
      for (let c = 1; c < 8 && !found; c++) {
        const r = song.patterns[p].channels[c].rows.findIndex((x) => x.note > 12 && x.note < 90 && x.instrument > 0);
        if (r >= 0) found = { p, c, r };
      }
    }
    expect(found).not.toBeNull();
    const { p, c, r } = found!;
    setGridBaseline(baselineOf(song.patterns));
    const cell = song.patterns[p].channels[c].rows[r];
    song.patterns[p].channels[c].rows[r] = { ...cell, note: cell.note + 1 };
    const res = await exportFormat669(song);
    expect(res.warnings).toEqual([]);
    const at = getCellFileOffset(layout, p, r, c);
    const diff = res.data.reduce<number[]>((l, v, k) => (v !== raw[k] ? [...l, k] : l), []);
    expect(diff).toEqual([at]);
    expect(res.data[at] >> 2).toBe((raw[at] >> 2) + 1);
    expect(res.data[at] & 3).toBe(raw[at] & 3);
    const again = await parse669File(res.data.slice().buffer as ArrayBuffer, NAME);
    expect(again.patterns[p].channels[c].rows[r].note).toBe(cell.note + 1);
    expect(again.patterns[p].channels[c].rows[r].instrument).toBe(cell.instrument);
  });

  it('a pattern played at several song positions: one edit reaches the file once; two different edits are reported', async () => {
    const song = await load();
    const layout = song.uadePatternLayout!;
    // speed fighter plays file pattern 9 at song positions 0..3 (rawOrders), so those grid patterns share their stored cells
    let found: { c: number; r: number } | null = null;
    for (let c = 1; c < 8 && !found; c++) {
      const r = song.patterns[0].channels[c].rows.findIndex((x) => x.note > 12 && x.note < 90 && x.instrument > 0);
      if (r >= 0) found = { c, r };
    }
    expect(found).not.toBeNull();
    const { c, r } = found!;
    expect(getCellFileOffset(layout, 1, r, c)).toBe(getCellFileOffset(layout, 0, r, c));
    setGridBaseline(baselineOf(song.patterns));
    const cell = song.patterns[0].channels[c].rows[r];
    song.patterns[0].channels[c].rows[r] = { ...cell, note: cell.note + 1 };
    const one = await exportFormat669(song);
    expect(one.warnings).toEqual([]);
    const at = getCellFileOffset(layout, 0, r, c);
    expect(one.data[at] >> 2).toBe((raw[at] >> 2) + 1);
    song.patterns[1].channels[c].rows[r] = { ...cell, note: cell.note + 2 };
    const two = await exportFormat669(song);
    expect(two.warnings.join(' ')).toContain('several song positions');
    expect(two.data[at] >> 2).toBe((raw[at] >> 2) + 2);
  });
});
