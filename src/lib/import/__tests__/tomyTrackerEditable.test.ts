/**
 * Tomy Tracker: 4-byte cells (effect, argument, sample*7, note*2) in 1024-byte pattern blocks from file offset 704.
 * An unedited song exports byte-identical; a one-note edit changes only that cell's note byte.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTomyTrackerFile } from '@/lib/import/formats/TomyTrackerParser';
import { exportTomyTracker } from '@/lib/export/TomyTrackerExporter';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import { patchModuleByLayout } from '@/lib/export/layoutPatch';
import { getEditableFormat } from '@/lib/formats/EditableFormatRegistry';
import '@/lib/formats/EditableFormatRegistry.builtins';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';

const NAME = 'irrepressible intro.sg';
const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats', NAME)));
const load = () => parseTomyTrackerFile(raw.slice().buffer as ArrayBuffer, NAME);
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe('Tomy Tracker is editable', () => {
  it('is registered with its exporter', () => {
    expect(getEditableFormat('tomyTracker')?.exporter?.fn).toBe('exportTomyTracker');
  });

  it('an unedited song exports byte-identical', async () => {
    expect(Array.from((await exportTomyTracker(load())).data)).toEqual(Array.from(raw));
  });

  it('a one-note edit changes only that cell note byte', async () => {
    const song = load();
    const layout = song.uadePatternLayout!;
    setGridBaseline(baselineOf(song.patterns));
    expect(layout.formatId).toBe('tomyTracker');
    let pat = -1, ch = -1, row = -1;
    for (let p = 0; p < song.patterns.length && row < 0; p++) {
      for (let c = 0; c < 4 && row < 0; c++) {
        const r = song.patterns[p].channels[c].rows.findIndex((x) => x.note > 13 && x.note < 45);
        if (r >= 0) { pat = p; ch = c; row = r; }
      }
    }
    expect(row).toBeGreaterThanOrEqual(0);
    const at = getCellFileOffset(layout, pat, row, ch) + 3;
    const cell = song.patterns[pat].channels[ch].rows[row];
    expect(raw[at]).toBe((cell.note - 12) * 2);
    song.patterns[pat].channels[ch].rows[row] = { ...cell, note: cell.note + 1 };

    const viaExporter = (await exportTomyTracker(song)).data;
    expect(diffAt(viaExporter, raw)).toEqual([at]);
    expect(viaExporter[at]).toBe(raw[at] + 2);
    expect(diffAt(patchModuleByLayout(raw, layout, song.patterns).bytes, raw)).toEqual([at]);
    setGridBaseline(null);
  });
});
