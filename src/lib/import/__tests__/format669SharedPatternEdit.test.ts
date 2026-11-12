/**
 * Composer 669 plays one stored pattern at several song positions. An edit at one position reaches every position of
 * the same stored pattern in the store (sharedCellEdits), in one undo step, so the exporter never sees two versions.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => { throw new Error('no audio in this test'); },
  peekTrackerReplayer: () => null,
}));

import { parse669File } from '@/lib/import/formats/Format669Parser';
import { exportFormat669 } from '@/lib/export/Format669Exporter';
import { baselineOf, setGridBaseline, editedCells } from '@/lib/song/gridBaseline';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useHistoryStore } from '@/stores/useHistoryStore';

afterAll(() => setGridBaseline(null));

const NAME = 'speed fighter.669';
const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/composer-669', NAME)));

describe('Composer 669 shared stored pattern edit', () => {
  it('an edit at one position shows at the others, exports without conflict, and undoes as one step', async () => {
    const song = await parse669File(raw.slice().buffer as ArrayBuffer, NAME);
    const layout = song.uadePatternLayout!;
    // the stored pattern played at song positions 0..3
    let found: { c: number; r: number } | null = null;
    for (let c = 1; c < 8 && !found; c++) {
      const r = song.patterns[0].channels[c].rows.findIndex((x) => x.note > 12 && x.note < 90 && x.instrument > 0);
      if (r >= 0) found = { c, r };
    }
    expect(found).not.toBeNull();
    const { c, r } = found!;
    const at = getCellFileOffset(layout, 0, r, c);
    const sharing = song.patterns.map((_, p) => p).filter((p) => getCellFileOffset(layout, p, r, c) === at);
    expect(sharing.length).toBeGreaterThanOrEqual(2);

    useFormatStore.setState({ uadePatternLayout: layout });
    useTrackerStore.setState({ patterns: song.patterns });
    useHistoryStore.getState().clearHistory();
    setGridBaseline(baselineOf(song.patterns));
    const old = song.patterns[0].channels[c].rows[r].note;
    const stepsBefore = useHistoryStore.getState().undoStack.length;

    useTrackerStore.getState().setCell(c, r, { note: old + 1 }, 0);

    const st = () => useTrackerStore.getState().patterns;
    for (const p of sharing) expect(st()[p].channels[c].rows[r].note).toBe(old + 1);
    expect(useHistoryStore.getState().undoStack.length).toBe(stepsBefore + 1);
    // every copy counts as edited
    const edited = editedCells(st()).filter((e) => e.row === r && e.channel === c).map((e) => e.pattern);
    expect(edited.sort()).toEqual([...sharing].sort());

    const res = await exportFormat669({ ...song, patterns: st() });
    expect(res.warnings).toEqual([]);
    const again = await parse669File(res.data.slice().buffer as ArrayBuffer, NAME);
    for (const p of sharing) expect(again.patterns[p].channels[c].rows[r].note).toBe(old + 1);

    useTrackerStore.getState().undoEdit();
    for (const p of sharing) expect(st()[p].channels[c].rows[r].note).toBe(old);
    useTrackerStore.getState().redoEdit();
    for (const p of sharing) expect(st()[p].channels[c].rows[r].note).toBe(old + 1);
    useTrackerStore.getState().undoEdit();
    for (const p of sharing) expect(st()[p].channels[c].rows[r].note).toBe(old);
  });
});
