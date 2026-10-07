/**
 * P14 (owner 2026-10-07, amanda.ahx): in the Hively editor with record mode on, a typed note wrote the tracker pattern
 * while the view kept drawing hivelyNative.tracks - "the view shows none of them".
 *
 * The cells the Hively view draws are hivelyNative.tracks; the view's edit (onFormatCellChange = hivelyCellChangeFor)
 * must land THERE and in the grid the engine and export read (tracker patterns, every position that plays the track).
 * Real song: public/data/songs/ahx/amanda.ahx through parseHivelyFile.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/TrackerReplayer', () => {
  const replayer = new Proxy({}, { get: (_t, k) => (k === 'isPlaying' ? () => false : () => undefined) });
  return { getTrackerReplayer: () => replayer, peekTrackerReplayer: () => null };
});

import { parseHivelyFile } from '@/lib/import/formats/HivelyParser';
import { useFormatStore } from '@stores/useFormatStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { editHivelyCell, undoHively, insertHivelyRow } from '@/components/hively/hivelyEdit';
import { hivelyToFormatChannels, HIVELY_COLUMNS } from '@/components/hively/hivelyAdapter';
import { typedNoteValue } from '@/components/shared/format-editor-types';
import { typedPitch } from '@/lib/tracker/formatEntryPlan';

function load() {
  const bytes = readFileSync('public/data/songs/ahx/amanda.ahx');
  const song = parseHivelyFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'amanda.ahx');
  useFormatStore.setState({ hivelyNative: structuredClone(song.hivelyNative!) });
  useTrackerStore.setState({ patterns: structuredClone(song.patterns), currentPatternIndex: 0 });
  return song;
}

describe('Hively: one edit, every copy of the cell', () => {
  beforeEach(() => { load(); });

  it('a typed note shows in the rendered data of the view and in the grid the engine reads, at the cursor row', () => {
    const native = useFormatStore.getState().hivelyNative!;
    const col = HIVELY_COLUMNS.find((c) => c.type === 'note')!;
    const row = 5;
    const value = typedNoteValue(col, typedPitch('z', 2)!)!; // C-2
    editHivelyCell(0, 0, row, 'note', value);

    // what the view draws: hivelyToFormatChannels(hivelyNative, position)
    const drawn = hivelyToFormatChannels(useFormatStore.getState().hivelyNative!, 0)[0].rows[row].note;
    expect(drawn).toBe(value);
    expect(col.formatter(drawn)).toBe('C-2');

    // what the engine's grid holds: the tracker pattern of every position that plays that track, transpose folded in
    const trackIdx = native.positions[0].track[0];
    const patterns = useTrackerStore.getState().patterns;
    native.positions.forEach((pos, p) => {
      pos.track.forEach((t, ch) => {
        if (t !== trackIdx) return;
        expect(patterns[p].channels[ch].rows[row].note, `position ${p} channel ${ch}`).toBe(value + (pos.transpose[ch] ?? 0));
      });
    });
  });

  it('an effect typed into the fx column reaches the native step and the grid', () => {
    editHivelyCell(0, 1, 3, 'fx1', 0x105); // portamento up 05
    const step = useFormatStore.getState().hivelyNative!.tracks[useFormatStore.getState().hivelyNative!.positions[0].track[1]].steps[3];
    expect([step.fx, step.fxParam]).toEqual([1, 5]);
    expect(useTrackerStore.getState().patterns[0].channels[1].rows[3]).toMatchObject({ effTyp: 1, eff: 5 });
  });

  it('undo takes the note out of the view and the grid again; insert row moves both', () => {
    const before = structuredClone(useTrackerStore.getState().patterns[0].channels[0].rows.slice(0, 4));
    editHivelyCell(0, 0, 1, 'note', 13);
    expect(useTrackerStore.getState().patterns[0].channels[0].rows[1].note).not.toBe(before[1].note);
    expect(undoHively()).toBe(true);
    expect(useTrackerStore.getState().patterns[0].channels[0].rows[1].note).toBe(before[1].note);
    expect(hivelyToFormatChannels(useFormatStore.getState().hivelyNative!, 0)[0].rows[1].note).toBe(
      useFormatStore.getState().hivelyNative!.tracks[useFormatStore.getState().hivelyNative!.positions[0].track[0]].steps[1].note);

    editHivelyCell(0, 0, 0, 'note', 20);
    insertHivelyRow(useFormatStore.getState().hivelyNative!.positions[0].track[0], 0);
    expect(useTrackerStore.getState().patterns[0].channels[0].rows[0].note).toBe(0);
    expect(useTrackerStore.getState().patterns[0].channels[0].rows[1].note).toBeGreaterThan(0);
  });

  it('an edit to a track used by several positions is shown in all of them (the grid shows what plays)', () => {
    const native = useFormatStore.getState().hivelyNative!;
    const counts = new Map<number, number>();
    native.positions.forEach((p) => p.track.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    const shared = [...counts.entries()].find(([, n]) => n > 1);
    expect(shared, 'amanda.ahx shares a track between positions').toBeDefined();
    const [trackIdx] = shared!;
    const pos = native.positions.findIndex((p) => p.track.includes(trackIdx));
    const ch = native.positions[pos].track.indexOf(trackIdx);
    editHivelyCell(pos, ch, 2, 'instrument', 7);
    const patterns = useTrackerStore.getState().patterns;
    let seen = 0;
    native.positions.forEach((p, i) => p.track.forEach((t, c) => { if (t === trackIdx) { expect(patterns[i].channels[c].rows[2].instrument).toBe(7); seen++; } }));
    expect(seen).toBeGreaterThan(1);
  });
});
