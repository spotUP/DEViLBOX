/**
 * Dave Lowe New: an unedited song exports byte-identical; a one-note edit rewrites only the section its cell lives in, and the
 * edited note reloads.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDaveLoweNewFile } from '@/lib/import/formats/DaveLoweNewParser';
import { exportDaveLowe } from '@/lib/export/DaveLoweExporter';
import { getEditableFormat } from '@/lib/formats/EditableFormatRegistry';
import '@/lib/formats/EditableFormatRegistry.builtins';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';

afterAll(() => setGridBaseline(null));

const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/dave-lowe-new/m-bison.dln')));
const load = () => parseDaveLoweNewFile(raw.slice().buffer as ArrayBuffer, 'm-bison.dln');

describe('Dave Lowe is editable', () => {
  it('is registered with its exporter', () => {
    expect(getEditableFormat('daveLowe')?.exporter?.fn).toBe('exportDaveLowe');
  });

  it('an unedited song exports byte-identical', async () => {
    const song = await load();
    setGridBaseline(baselineOf(song.patterns));
    expect(Array.from((await exportDaveLowe(song)).data)).toEqual(Array.from(raw));
  });

  it('a one-note edit changes only bytes inside its section and reloads', async () => {
    const song = await load();
    const layout = song.uadeVariableLayout!;
    let found: { p: number; c: number; r: number } | null = null;
    for (let p = 0; p < song.patterns.length && !found; p++) {
      for (let c = 0; c < 4 && !found; c++) {
        const rows = song.patterns[p].channels[c].rows;
        const r = rows.findIndex((x) => x.note > 12 && x.note < 80);
        if (r >= 0 && layout.trackMap[p][c] >= 0) found = { p, c, r };
      }
    }
    expect(found).not.toBeNull();
    const { p, c, r } = found!;
    setGridBaseline(baselineOf(song.patterns));
    const cell = song.patterns[p].channels[c].rows[r];
    const was = cell.note;
    song.patterns[p].channels[c].rows[r] = { ...cell, note: was + 1 };
    const res = await exportDaveLowe(song);
    expect(res.warnings).toEqual([]);
    const fp = layout.trackMap[p][c];
    const lo = layout.filePatternAddrs[fp], hi = lo + layout.filePatternSizes[fp];
    const diff = res.data.reduce<number[]>((l, v, k) => (v !== raw[k] ? [...l, k] : l), []);
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.every((k) => k >= lo && k < hi)).toBe(true);
    expect(diff.length).toBeLessThanOrEqual(2);
    const again = await parseDaveLoweNewFile(res.data.slice().buffer as ArrayBuffer, 'm-bison.dln');
    expect(again.patterns[p].channels[c].rows[r].note).toBe(was + 1);
  });
});
