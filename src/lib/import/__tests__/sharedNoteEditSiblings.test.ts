/**
 * SidMon II and EMS v6 play one stored track/command stream at several places, so one note byte is shown by several grid cells.
 * An edit of one reaches the others in the store (sharedCellEdits, variable layout), in one undo step, and the export has no
 * shared-byte conflict. Same rule as the Voodoo Supreme test: cells are aliases when offset and base are equal.
 */
import { describe, it, expect, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => { throw new Error('no audio in this test'); },
  peekTrackerReplayer: () => null,
}));

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseSidMon2File } from '@/lib/import/formats/SidMon2Parser';
import { parseEMSv6File } from '@/lib/import/formats/EMSv6Parser';
import { writeSidMon2NoteEdits } from '@/lib/export/SidMon2Exporter';
import { exportEmsV6 } from '@/lib/export/EmsV6Exporter';
import { baselineOf, setGridBaseline, editedCells } from '@/lib/song/gridBaseline';
import { getColumnField } from '@/lib/tracker/noteColumns';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useHistoryStore } from '@/stores/useHistoryStore';

afterAll(() => setGridBaseline(null));

interface Fmt {
  path: string;
  parse: (buf: ArrayBuffer) => Promise<TrackerSong> | TrackerSong;
  save: (song: TrackerSong, original: ArrayBuffer) => Promise<{ data: ArrayBuffer; warnings: string[] }>;
}

const FILES: Fmt[] = [
  {
    path: 'public/data/songs/sidmon-2/ice7-intro.sid2',
    parse: (b) => parseSidMon2File(b, 'x.sid2'),
    save: async (song, original) => writeSidMon2NoteEdits(song, original),
  },
  {
    path: 'public/data/songs/formats/bruno_time.sid2',
    parse: (b) => parseSidMon2File(b, 'x.sid2'),
    save: async (song, original) => writeSidMon2NoteEdits(song, original),
  },
  {
    path: 'public/data/songs/formats/perception.ems',
    parse: (b) => parseEMSv6File(b, 'x.ems'),
    save: async (song) => {
      const r = await exportEmsV6(song);
      return { data: r.data.slice().buffer as ArrayBuffer, warnings: r.warnings };
    },
  },
];

describe.each(FILES)('shared note edit: $path', ({ path, parse, save }) => {
  const raw = readFileSync(path);
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

  it('an edit of a shared note reaches every alias, exports without conflict and undoes as one step', async () => {
    const song = await parse(buf);
    const layout = song.uadeVariableLayout!;
    const nb = layout.noteBytes!;
    expect(layout.propagateSharedCells).toBe(true);
    const groups = new Map<string, typeof nb>();
    nb.forEach((n) => groups.set(`${n.offset}:${n.base ?? 0}`, [...(groups.get(`${n.offset}:${n.base ?? 0}`) ?? []), n]));
    const shared = [...groups.values()].filter((g) => g.length >= 2);
    console.info(`${path}: ${nb.length} note cells, ${shared.length} shared bytes, ${shared.reduce((a, g) => a + g.length, 0)} grid cells`);
    expect(shared.length).toBeGreaterThan(0);
    // Group members are the same stored note.
    for (const g of shared) expect(new Set(g.map((n) => n.note)).size).toBe(1);
    const group = shared.find((g) => g.every((n) => (n.col ?? 0) === 0 && n.note > 20 && n.note < 80))!;
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

    const res = await save({ ...song, patterns: st() }, buf);
    expect(res.warnings).toEqual([]);
    const again = await parse(res.data);
    for (const n of group) expect(getColumnField(again.patterns[n.pattern].channels[n.channel].rows[n.row], n.col ?? 0, 'note')).toBe(pick.note + 2);

    useTrackerStore.getState().undoEdit();
    for (const n of group) expect(noteAt(n)).toBe(pick.note);
    useTrackerStore.getState().redoEdit();
    for (const n of group) expect(noteAt(n)).toBe(pick.note + 2);
    useTrackerStore.getState().undoEdit();
    for (const n of group) expect(noteAt(n)).toBe(pick.note);
  });
});
