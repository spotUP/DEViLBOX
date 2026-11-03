import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseModuleToSong } from '../parseModuleToSong';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';
import { liveEditRoute } from '@/engine/replayer/liveCellEdits';
import { gridOpensInScopeView } from '@/lib/tracker/gridOpensInScopeView';

const PATH = 'public/data/songs/formats/je taime.ems';

// One reachability test: real corpus song through the importer's entry point.
describe('EMS editable grid', () => {
  it('imports with a grid, round-trips byte-exact, and an edit changes the module bytes', async () => {
    const raw = readFileSync(PATH);
    const bytes = new Uint8Array(raw);
    const song = await parseModuleToSong(new File([bytes], 'je taime.ems'));

    // The new parser ran (sentinel: its layout id) and the grid is not the scope-only fallback.
    const layout = song.uadePatternLayout!;
    expect(layout.formatId).toBe('ems');
    expect(gridOpensInScopeView(song)).toBe(false);
    expect(song.songLength).toBe(bytes[3]);
    expect(song.patterns[0].length).toBe(64);

    // The edit leaves the grid through a route that places it in the playing module (not 'none').
    expect(liveEditRoute(song)).toEqual({ route: 'engine-swap', engine: 'Nuade' });
    let notes = 0;
    const out = new Uint8Array(bytes);
    song.patterns.forEach((pat, p) => {
      pat.channels.forEach((chan, ch) => chan.rows.forEach((cell, row) => {
        if (cell.note > 0) notes++;
        const off = layout.getCellFileOffset!(p, row, ch);
        out.set(layout.encodeCell(cell, bytes.subarray(off, off + 4)), off);
      }));
    });
    expect(notes).toBeGreaterThan(20);
    expect(Buffer.from(out).equals(raw)).toBe(true);

    // An edited cell changes the bytes the module (and so the engine) receives, at the cell's own offset.
    const cell = { ...song.patterns[0].channels[1].rows[3], note: 25, instrument: 7, effTyp: 0xe, eff: 0x20 };
    const off = layout.getCellFileOffset!(0, 3, 1);
    const edited = layout.encodeCell(cell, bytes.subarray(off, off + 4));
    expect(Array.from(edited)).toEqual([0x01, 0xac, 0x7e, 0x20]);
    expect(Array.from(bytes.subarray(off, off + 4))).not.toEqual(Array.from(edited));

    // Through the router the engine swap uses: unedited song exports the file unchanged, edited song exports the edit.
    setGridBaseline(baselineOf(song.patterns));
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    const same = await exportNativeSong(song);
    expect(Buffer.from(same!.data as Uint8Array).equals(raw)).toBe(true);
    song.patterns[0].channels[1].rows[3] = cell;
    const changed = (await exportNativeSong(song))!.data as Uint8Array;
    expect(Array.from(changed.subarray(off, off + 4))).toEqual([0x01, 0xac, 0x7e, 0x20]);
  });
});
