/**
 * StoneTracker: a row's note lives in the first byte of its note word (1-36, bit 7 = end of row). An unedited song exports
 * byte-identical; a one-note edit changes only that byte.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseStoneTrackerFile } from '@/lib/import/formats/StoneTrackerParser';
import { exportStoneTracker } from '@/lib/export/StoneTrackerExporter';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import { getEditableFormat } from '@/lib/formats/EditableFormatRegistry';
import '@/lib/formats/EditableFormatRegistry.builtins';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';

const DIR = join(process.cwd(), 'public/data/songs/stonetracker');
const raw = new Uint8Array(readFileSync(join(DIR, 'hypnosphere.spm')));
const bank = new Uint8Array(readFileSync(join(DIR, 'hypnosphere.sps')));
const load = () => parseStoneTrackerFile(raw.slice(), 'hypnosphere.spm', bank);
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe('StoneTracker is editable', () => {
  it('is registered with its exporter', () => {
    expect(getEditableFormat('stoneTracker')?.exporter?.fn).toBe('exportStoneTracker');
  });

  it('an unedited song exports byte-identical', async () => {
    expect(Array.from((await exportStoneTracker(load())).data)).toEqual(Array.from(raw));
  });

  it('a one-note edit changes only that note byte', async () => {
    const song = load();
    const layout = song.uadePatternLayout!;
    expect(layout).toBeTruthy();
    let found: { p: number; c: number; i: number; at: number } | null = null;
    for (let p = 0; p < song.patterns.length && !found; p++) {
      for (let c = 0; c < 8 && !found; c++) {
        song.patterns[p].channels[c].rows.forEach((r, i) => {
          const at = getCellFileOffset(layout, p, i, c);
          if (!found && r.note > 20 && r.note < 40 && at >= 0) found = { p, c, i, at };
        });
      }
    }
    expect(found).not.toBeNull();
    const { p, c, i, at } = found!;
    setGridBaseline(baselineOf(song.patterns));
    const cell = song.patterns[p].channels[c].rows[i];
    song.patterns[p].channels[c].rows[i] = { ...cell, note: cell.note + 1 };
    const out = (await exportStoneTracker(song)).data;
    expect(diffAt(out, raw)).toEqual([at]);
    expect(out[at] & 0x7f).toBe((raw[at] & 0x7f) + 1);
    expect(out[at] & 0x80).toBe(raw[at] & 0x80);
    setGridBaseline(null);
  });
});
