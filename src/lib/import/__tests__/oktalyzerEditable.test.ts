import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseModuleToSong } from '../parseModuleToSong';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';
import { liveEditRoute, sendCellEditsToEngine } from '@/engine/replayer/liveCellEdits';
import { gridOpensInScopeView } from '@/lib/tracker/gridOpensInScopeView';
import { OktalyzerEngine } from '@/engine/oktalyzer/OktalyzerEngine';

const PATH = 'public/data/songs/formats/45.okta';

// One reachability test: the corpus song through the importer's entry point, for every extension the format registry routes.
describe('Oktalyzer editable grid', () => {
  it.each(['45.okta', '45.okt', 'okt.45'])('%s imports with a grid, round-trips byte-exact, and an edit lands in export and playback', async (name) => {
    const raw = readFileSync(PATH);
    const bytes = new Uint8Array(raw);
    const song = await parseModuleToSong(new File([bytes], name));

    // The Oktalyzer parser ran (sentinel: its layout id) and the grid is not the scope-only fallback.
    const layout = song.uadePatternLayout!;
    expect(layout.formatId).toBe('oktalyzer');
    expect(gridOpensInScopeView(song)).toBe(false);
    expect(liveEditRoute(song)).toEqual({ route: 'grid-cell', engine: 'OktalyzerReplayer' });

    // Every cell re-encodes to its own stored bytes (unmapped effect commands included).
    let notes = 0;
    const out = new Uint8Array(bytes);
    song.patterns.forEach((pat, p) => pat.channels.forEach((chan, ch) => chan.rows.forEach((cell, row) => {
      if (cell.note > 0) notes++;
      const off = layout.getCellFileOffset!(p, row, ch);
      out.set(layout.encodeCell(cell, bytes.subarray(off, off + 4)), off);
    })));
    expect(notes).toBeGreaterThan(1000);
    expect(Buffer.from(out).equals(raw)).toBe(true);

    // Export: unedited song is the file unchanged, an edit changes exactly its cell.
    setGridBaseline(baselineOf(song.patterns));
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    expect(Buffer.from((await exportNativeSong(song))!.data as Uint8Array).equals(raw)).toBe(true);
    const cell = { ...song.patterns[0].channels[1].rows[3], note: 37, instrument: 7, effTyp: 0x0C, eff: 0x20 };
    const off = layout.getCellFileOffset!(0, 3, 1);
    song.patterns[0].channels[1].rows[3] = cell;
    const changed = (await exportNativeSong(song))!.data as Uint8Array;
    expect(Array.from(changed.subarray(off, off + 4))).toEqual([25, 7, 10, 0x20]);
    expect(changed.length).toBe(bytes.length);

    // Playback: the live edit reaches the replayer as the module's own note and command, not the grid's.
    const setCell = vi.fn();
    vi.spyOn(OktalyzerEngine, 'hasInstance').mockReturnValue(true);
    vi.spyOn(OktalyzerEngine, 'getInstance').mockReturnValue({ setCell: OktalyzerEngine.prototype.setCell, workletNode: { port: { postMessage: setCell } } } as never);
    await sendCellEditsToEngine(song, [{ pattern: 0, row: 3, channel: 1, cell }]);
    expect(setCell).toHaveBeenCalledWith(expect.objectContaining({ type: 'setCell', note: 25, instrument: 7, effect: 10, effectArg: 0x20 }));
    vi.restoreAllMocks();
  }, 120_000);
});
