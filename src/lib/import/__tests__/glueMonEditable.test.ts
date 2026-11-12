/**
 * GlueMon: one byte per voice per row in contiguous patterns (GlueMonParser layout). An unedited song exports
 * byte-identical; a one-note edit changes only that cell's byte (the note index doubles, the tie bit stays).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseGlueMonFile } from '@/lib/import/formats/GlueMonParser';
import { exportGlueMon } from '@/lib/export/GlueMonExporter';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import { patchModuleByLayout } from '@/lib/export/layoutPatch';
import { getEditableFormat } from '@/lib/formats/EditableFormatRegistry';
import '@/lib/formats/EditableFormatRegistry.builtins';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';

const NAME = 'memphis.glue';
const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats', NAME)));
const load = () => parseGlueMonFile(raw.slice().buffer as ArrayBuffer, NAME);
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe('GlueMon is editable', () => {
  it('is registered with its exporter', () => {
    expect(getEditableFormat('glueMon')?.exporter?.fn).toBe('exportGlueMon');
  });

  it('an unedited song exports byte-identical', async () => {
    expect(Array.from((await exportGlueMon(load())).data)).toEqual(Array.from(raw));
  });

  it('a one-note edit changes only that cell byte', async () => {
    const song = load();
    const layout = song.uadePatternLayout!;
    setGridBaseline(baselineOf(song.patterns));
    expect(layout.formatId).toBe('glueMon');
    let pat = -1, ch = -1, row = -1;
    for (let p = 0; p < song.patterns.length && row < 0; p++) {
      for (let c = 0; c < 4 && row < 0; c++) {
        const r = song.patterns[p].channels[c].rows.findIndex((x) => x.note > 1 && x.note < 40);
        if (r >= 0) { pat = p; ch = c; row = r; }
      }
    }
    expect(row).toBeGreaterThanOrEqual(0);
    const at = getCellFileOffset(layout, pat, row, ch);
    const cell = song.patterns[pat].channels[ch].rows[row];
    expect(raw[at]).toBeLessThanOrEqual(0x60);
    song.patterns[pat].channels[ch].rows[row] = { ...cell, note: cell.note + 1 };

    const viaExporter = (await exportGlueMon(song)).data;
    expect(diffAt(viaExporter, raw)).toEqual([at]);
    expect(viaExporter[at]).toBe(raw[at] + 2);
    expect(diffAt(patchModuleByLayout(raw, layout, song.patterns).bytes, raw)).toEqual([at]);
    setGridBaseline(null);
  });
});
