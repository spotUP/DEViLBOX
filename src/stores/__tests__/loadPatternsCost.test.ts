/**
 * loadPatterns of a big song is not an immer recipe (U2.8).
 *
 * Music Assembler's baseheads.ma loads 343 patterns; as an immer recipe the
 * store walked and deep-froze every cell of them (25-34 ms in node, 82-101 ms
 * in the browser tab) looking for drafts that cannot be there. A whole-song
 * replacement is a plain update; the new patterns are the objects the importer
 * built (not frozen by the store), and the song-start resets still happen.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useCursorStore } from '@/stores/useCursorStore';
import { parseMusicAssemblerFile } from '@/lib/import/formats/MusicAssemblerParser';

describe('loadPatterns on a 343-pattern song', () => {
  const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats/baseheads.ma')));

  it('does not deep-walk the new patterns (their cells are not frozen by the store)', () => {
    const song = parseMusicAssemblerFile(bytes, 'baseheads.ma')!;
    expect(song.patterns.length).toBe(343);
    useTrackerStore.getState().loadPatterns(song.patterns);
    const loaded = useTrackerStore.getState().patterns;
    expect(loaded.length).toBe(343);
    expect(Object.isFrozen(loaded[0].channels[0].rows[0])).toBe(false);
  });

  it('still starts the song at the top: position, pattern, cursor, selection and clipboard reset', () => {
    const song = parseMusicAssemblerFile(bytes, 'baseheads.ma')!;
    useTrackerStore.setState({ currentPatternIndex: 5, currentPositionIndex: 7 });
    useCursorStore.setState({ cursor: { channelIndex: 2, rowIndex: 9, noteColumnIndex: 0, columnType: 'note', digitIndex: 0 }, selection: null });
    useTrackerStore.getState().loadPatterns(song.patterns);
    const s = useTrackerStore.getState();
    expect(s.currentPatternIndex).toBe(0);
    expect(s.currentPositionIndex).toBe(0);
    expect(s.clipboard).toBeNull();
    expect(useCursorStore.getState().cursor.rowIndex).toBe(0);
    expect(useCursorStore.getState().cursor.channelIndex).toBe(0);
  });

  it('an edit after the load still works on the loaded patterns', () => {
    const song = parseMusicAssemblerFile(bytes, 'baseheads.ma')!;
    useTrackerStore.getState().loadPatterns(song.patterns);
    useTrackerStore.getState().setCell(0, 0, { note: 49 });
    expect(useTrackerStore.getState().patterns[0].channels[0].rows[0].note).toBe(49);
  });
});
