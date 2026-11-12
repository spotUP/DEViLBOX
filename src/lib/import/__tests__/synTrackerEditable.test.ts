/**
 * SynTracker: the module's 4-byte cells (note, instrument, ASCII effect, value) sit in 32-row pattern blocks that each
 * channel's position list picks. An unedited song exports byte-identical; a one-note edit changes only that cell's note byte.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSynTrackerFile } from '@/lib/import/formats/SynTrackerParser';
import { exportSynTrackerFile } from '@/lib/export/SynTrackerExporter';
import { patchModuleByLayout } from '@/lib/export/layoutPatch';
import { getEditableFormat } from '@/lib/formats/EditableFormatRegistry';
import '@/lib/formats/EditableFormatRegistry.builtins';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';

const NAME = 'autumn melodies.synmod';
const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/syntracker', NAME)));
const load = () => parseSynTrackerFile(raw.slice().buffer as ArrayBuffer, NAME);
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe('SynTracker is editable', () => {
  it('is registered with its exporter', () => {
    expect(getEditableFormat('synTracker')?.exporter?.fn).toBe('exportSynTrackerFile');
  });

  it('an unedited song exports byte-identical', () => {
    expect(Array.from(exportSynTrackerFile(load()))).toEqual(Array.from(raw));
  });

  it('a one-note edit changes only that cell note byte, through the layout and the exporter alike', () => {
    const song = load();
    const layout = song.uadePatternLayout!;
    setGridBaseline(baselineOf(song.patterns));
    expect(layout.formatId).toBe('synTracker');
    let pos = -1, ch = -1, row = -1;
    for (let p = 0; p < song.patterns.length && row < 0; p++) {
      for (let c = 0; c < 4 && row < 0; c++) {
        const r = song.patterns[p].channels[c].rows.findIndex((x) => x.note > 0 && x.note < 70);
        if (r >= 0) { pos = p; ch = c; row = r; }
      }
    }
    expect(row).toBeGreaterThanOrEqual(0);
    const at = layout.getCellFileOffset!(pos, row, ch);
    expect(raw[at]).toBe(song.patterns[pos].channels[ch].rows[row].note);
    song.patterns[pos].channels[ch].rows[row] = { ...song.patterns[pos].channels[ch].rows[row], note: raw[at] + 1 };

    const viaExporter = exportSynTrackerFile(song);
    expect(diffAt(viaExporter, raw)).toEqual([at]);
    expect(viaExporter[at]).toBe(raw[at] + 1);
    // the layout writer agrees (it only writes cells that differ from the loaded baseline)
    const viaLayout = patchModuleByLayout(raw, layout, song.patterns);
    expect(diffAt(viaLayout.bytes, raw)).toEqual([at]);
    setGridBaseline(null);
  });
});
