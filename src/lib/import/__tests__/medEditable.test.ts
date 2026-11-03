import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseModuleToSong } from '../parseModuleToSong';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

// One reachability test: OctaMED songs through the importer's entry point. Each version keeps its module bytes, re-encodes
// every cell to its own stored bytes, and an edit lands in the exported module as exactly its own cell.
describe('OctaMED editable grid', () => {
  it.each([
    ['bounty hunter - outro (remixed).mmd3', 'med_mmd1'],
    ['universal monsters - dracula.mmd0', 'med_mmd0'],
  ])('%s imports with a grid, round-trips byte-exact, and an edit lands in export', async (name, formatId) => {
    const raw = readFileSync(`public/data/songs/formats/${name}`);
    const bytes = new Uint8Array(raw);
    const song = await parseModuleToSong(new File([bytes], name));
    const layout = song.uadePatternLayout!;
    expect(layout.formatId).toBe(formatId); // sentinel: the MED parser ran

    let notes = 0;
    const out = new Uint8Array(bytes);
    song.patterns.forEach((pat, p) => pat.channels.forEach((chan, ch) => chan.rows.forEach((cell, row) => {
      if (cell.note > 0) notes++;
      const off = layout.getCellFileOffset!(p, row, ch);
      out.set(layout.encodeCell(cell, bytes.subarray(off, off + layout.bytesPerCell)), off);
    })));
    expect(notes).toBeGreaterThan(100);
    expect(Buffer.from(out).equals(raw)).toBe(true);

    setGridBaseline(baselineOf(song.patterns));
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    expect(Buffer.from((await exportNativeSong(song))!.data as Uint8Array).equals(raw)).toBe(true);
    const row = song.patterns[0].channels[1].rows[3];
    const cell = { ...row, note: row.note === 40 ? 41 : 40, instrument: row.instrument === 5 ? 6 : 5 };
    const off = layout.getCellFileOffset!(0, 3, 1);
    song.patterns[0].channels[1].rows[3] = cell;
    const changed = (await exportNativeSong(song))!.data as Uint8Array;
    expect(changed.length).toBe(bytes.length);
    const diff = Array.from(bytes, (b, i) => (b !== changed[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.every((i) => i >= off && i < off + layout.bytesPerCell)).toBe(true);
    // Re-import shows the edit.
    const again = await parseModuleToSong(new File([new Uint8Array(changed)], name));
    expect(again.patterns[0].channels[1].rows[3]).toMatchObject({ note: cell.note, instrument: cell.instrument });
  }, 120_000);
});
