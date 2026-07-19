import { describe, it, expect, beforeEach } from 'vitest';
import { useTrackerStore } from '../useTrackerStore';
import { useTransportStore } from '../useTransportStore';
import { useHistoryStore } from '../useHistoryStore';
import { useCursorStore } from '../useCursorStore';
import { resetStore } from './_harness';

describe('useTrackerStore — pattern lifecycle', () => {
  beforeEach(() => resetStore(useTrackerStore));

  it('has at least one initial pattern with channels', () => {
    const s = useTrackerStore.getState();
    expect(Array.isArray(s.patterns)).toBe(true);
    expect(s.patterns.length).toBeGreaterThan(0);
    expect(s.patterns[0].channels.length).toBeGreaterThan(0);
  });

  it('addPattern appends a new pattern with the current channel count', () => {
    const before = useTrackerStore.getState().patterns.length;
    const channels = useTrackerStore.getState().patterns[0].channels.length;
    useTrackerStore.getState().addPattern();
    const s = useTrackerStore.getState();
    expect(s.patterns.length).toBe(before + 1);
    expect(s.patterns[s.patterns.length - 1].channels.length).toBe(channels);
  });

  it('deletePattern removes the pattern at an index but never the last survivor', () => {
    useTrackerStore.getState().addPattern();
    useTrackerStore.getState().addPattern();
    const startCount = useTrackerStore.getState().patterns.length;

    useTrackerStore.getState().deletePattern(1);
    expect(useTrackerStore.getState().patterns.length).toBe(startCount - 1);

    // Drain down to 1 and then try to delete — should be a no-op.
    while (useTrackerStore.getState().patterns.length > 1) {
      useTrackerStore.getState().deletePattern(0);
    }
    useTrackerStore.getState().deletePattern(0);
    expect(useTrackerStore.getState().patterns.length).toBe(1);
  });

  it('clonePattern with an out-of-range index is a no-op', () => {
    const before = useTrackerStore.getState().patterns.length;
    useTrackerStore.getState().clonePattern(999);
    expect(useTrackerStore.getState().patterns.length).toBe(before);
  });

  it('loadPatterns resets the song-order position and row (fresh load starts at song start, not the previous song pos)', () => {
    const store = useTrackerStore.getState();
    // Simulate leftover playback cursor from a previously-loaded song.
    useTrackerStore.setState({ currentPositionIndex: 8 });
    useTransportStore.getState().setCurrentRow(5);
    expect(useTrackerStore.getState().currentPositionIndex).toBe(8);

    // Loading a new module must snap back to the song start.
    const patterns = store.patterns.map((p) => ({ ...p }));
    store.loadPatterns(patterns);

    expect(useTrackerStore.getState().currentPositionIndex).toBe(0);
    expect(useTransportStore.getState().currentRow).toBe(0);
  });

  // Note: the happy-path clonePattern test is covered by the Puppeteer UI
  // smoke suite (Phase 3) — happy-dom's structuredClone can't unwrap immer
  // Proxy drafts, so running it here would only test the test environment.
});

describe('useTrackerStore — bulkBlockEdit atomic undo', () => {
  beforeEach(() => resetStore(useTrackerStore));

  it('records exactly ONE undo entry for a multi-cell block op (not one per cell)', () => {
    const rows = useTrackerStore.getState().patterns[0].channels[0].rows.length;
    const editRows = Math.min(16, rows);

    const before = useHistoryStore.getState().undoStack.length;
    useTrackerStore.getState().bulkBlockEdit('Test block edit', (pattern) => {
      for (let r = 0; r < editRows; r++) {
        pattern.channels[0].rows[r].note = 40 + r;
      }
    });
    const after = useHistoryStore.getState().undoStack.length;

    // A single Reverse/Expand/etc. must be one Ctrl+Z, not `editRows` of them.
    expect(after - before).toBe(1);
    // The edit actually landed.
    expect(useTrackerStore.getState().patterns[0].channels[0].rows[0].note).toBe(40);
  });

  it('undo of a bulkBlockEdit restores every mutated cell in one step', () => {
    const originalNote = useTrackerStore.getState().patterns[0].channels[0].rows[0].note;

    useTrackerStore.getState().bulkBlockEdit('Test block edit', (pattern) => {
      for (let r = 0; r < 8 && r < pattern.channels[0].rows.length; r++) {
        pattern.channels[0].rows[r].note = 55 + r;
      }
    });

    const restored = useHistoryStore.getState().undo();
    expect(restored).not.toBeNull();
    // Single undo returns the whole pre-edit pattern, not just the last cell.
    expect(restored!.channels[0].rows[0].note).toBe(originalNote);
    expect(restored!.channels[0].rows[7].note).toBe(originalNote);
  });
});

describe('useTrackerStore — resizePattern undo + cursor clamp', () => {
  beforeEach(() => resetStore(useTrackerStore));

  it('shrinking a pattern is a single undoable action that restores the discarded rows', () => {
    const startLen = useTrackerStore.getState().patterns[0].length;
    expect(startLen).toBeGreaterThan(8);

    // Put a marker note in a row that a shrink to 8 rows would discard.
    useTrackerStore.getState().bulkBlockEdit('seed', (pattern) => {
      pattern.channels[0].rows[startLen - 1].note = 61;
    });

    const before = useHistoryStore.getState().undoStack.length;
    useTrackerStore.getState().resizePattern(0, 8);
    const after = useHistoryStore.getState().undoStack.length;

    // Exactly one undo entry — not a silent, non-undoable splice.
    expect(after - before).toBe(1);
    expect(useTrackerStore.getState().patterns[0].length).toBe(8);

    // Undo must give back the pre-shrink pattern with the discarded row intact.
    const restored = useHistoryStore.getState().undo();
    expect(restored).not.toBeNull();
    expect(restored!.length).toBe(startLen);
    expect(restored!.channels[0].rows[startLen - 1].note).toBe(61);
  });

  it('clamps the edit cursor when a shrink leaves it past the new pattern end', () => {
    const startLen = useTrackerStore.getState().patterns[0].length;
    // Park the cursor on the last row.
    useCursorStore.setState({
      cursor: { ...useCursorStore.getState().cursor, rowIndex: startLen - 1 },
    });

    useTrackerStore.getState().resizePattern(0, 8);

    // Cursor may not dangle past the end — FT2 clamps to the last valid row.
    expect(useCursorStore.getState().cursor.rowIndex).toBe(7);
  });
});
