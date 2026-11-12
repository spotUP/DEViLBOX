/**
 * Voodoo Supreme plays a gosub track at several places, so one file byte is shown by several grid cells. An edit of one reaches
 * the others in the store (sharedCellEdits, variable layout), in one undo step, and the exporter sees no shared-byte conflict.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => { throw new Error('no audio in this test'); },
  peekTrackerReplayer: () => null,
}));

import { parseVoodooSupremeSynthesizerFile } from '@/lib/import/formats/VoodooSupremeSynthesizerParser';
import { exportVoodooSupreme } from '@/lib/export/VoodooSupremeExporter';
import { baselineOf, setGridBaseline, editedCells } from '@/lib/song/gridBaseline';
import { getColumnField } from '@/lib/tracker/noteColumns';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useHistoryStore } from '@/stores/useHistoryStore';

afterAll(() => setGridBaseline(null));

const FILES = ['public/data/songs/voodoo/voo8.vss', 'public/data/songs/voodoo-supreme/silkworm.vss'];

describe.each(FILES)('Voodoo Supreme shared note edit: %s', (path) => {
  const raw = readFileSync(path);
  const load = () => parseVoodooSupremeSynthesizerFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, 'x.vss');

  it('an edit of a shared note reaches every alias, exports without conflict and undoes as one step', async () => {
    const song = load();
    const layout = song.uadeVariableLayout!;
    const nb = layout.noteBytes!;
    const groups = new Map<string, typeof nb>();
    nb.forEach((n) => groups.set(`${n.offset}:${n.base ?? 0}`, [...(groups.get(`${n.offset}:${n.base ?? 0}`) ?? []), n]));
    const shared = [...groups.values()].filter((g) => g.length >= 2);
    console.info(`${path}: ${shared.length} shared notes, ${shared.reduce((a, g) => a + g.length, 0)} grid cells`);
    const group = shared.find((g) => g.every((n) => !n.cut && !n.porta && (n.col ?? 0) === 0 && n.note > 12 && n.note < 90))!;
    expect(group.length).toBeGreaterThanOrEqual(2);
    const pick = group[0];

    useFormatStore.setState({ uadeVariableLayout: layout, uadePatternLayout: null });
    useTrackerStore.setState({ patterns: song.patterns });
    useHistoryStore.getState().clearHistory();
    setGridBaseline(baselineOf(song.patterns));
    const stepsBefore = useHistoryStore.getState().undoStack.length;

    useTrackerStore.getState().setCell(pick.channel, pick.row, { note: pick.note + 2 }, pick.pattern);

    const st = () => useTrackerStore.getState().patterns;
    const noteAt = (n: (typeof nb)[number]) => getColumnField(st()[n.pattern].channels[n.channel].rows[n.row], n.col ?? 0, 'note');
    for (const n of group) expect(noteAt(n)).toBe(pick.note + 2);
    expect(useHistoryStore.getState().undoStack.length).toBe(stepsBefore + 1);
    const edited = editedCells(st()).map((e) => `${e.pattern}:${e.channel}:${e.row}`);
    for (const n of group) expect(edited).toContain(`${n.pattern}:${n.channel}:${n.row}`);

    const res = await exportVoodooSupreme({ ...song, patterns: st() });
    expect(res.warnings).toEqual([]);
    const again = parseVoodooSupremeSynthesizerFile(res.data.slice().buffer as ArrayBuffer, 'x.vss');
    for (const n of group) expect(getColumnField(again.patterns[n.pattern].channels[n.channel].rows[n.row], n.col ?? 0, 'note')).toBe(pick.note + 2);

    useTrackerStore.getState().undoEdit();
    for (const n of group) expect(noteAt(n)).toBe(pick.note);
    useTrackerStore.getState().redoEdit();
    for (const n of group) expect(noteAt(n)).toBe(pick.note + 2);
    useTrackerStore.getState().undoEdit();
    for (const n of group) expect(noteAt(n)).toBe(pick.note);
  });
});
