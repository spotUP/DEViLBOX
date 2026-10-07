/**
 * P14 reachability, through the real window key handler (useTrackerInput): with record mode on, a piano key
 *  - in a store-drawn mode (classic) writes the tracker pattern at the cursor and moves the cursor by the edit step;
 *  - in a canvas-owned mode (hively) writes NOTHING into the tracker pattern and leaves the global cursor alone:
 *    the view's own handler writes its native data (hivelyEditOneStore.test.ts, formatEditEntry.test.ts);
 *  - with record mode off writes nothing in either (jam only).
 * Before, the window handler wrote the tracker pattern in every mode: pattern 0 channel 0 rows 0-13 held the
 * typed notes of an AHX song the Hively view never drew (owner 2026-10-07, amanda.ahx).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/TrackerReplayer', () => {
  const replayer = new Proxy({}, { get: (_t, k) => (k === 'isPlaying' ? () => false : () => undefined) });
  return { getTrackerReplayer: () => replayer, peekTrackerReplayer: () => null };
});

import { useTrackerInput } from '@/hooks/tracker/useTrackerInput';
import { useTrackerStore, useCursorStore } from '@stores';
import { useEditorStore } from '@stores/useEditorStore';
import { useFormatStore } from '@stores/useFormatStore';
import type { EditorMode } from '@/types/tracker';

const noteAt = (row: number) => useTrackerStore.getState().patterns[0].channels[0].rows[row].note;
const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

function setup(mode: EditorMode, recordMode: boolean) {
  useFormatStore.setState({ editorMode: mode });
  useEditorStore.setState({ recordMode, editStep: 2, currentOctave: 3 });
  useTrackerStore.setState({ currentPatternIndex: 0 });
  useCursorStore.getState().moveCursorToRow(0);
  useCursorStore.getState().moveCursorToChannel(0);
  return renderHook(() => useTrackerInput());
}

describe('window key handler writes the tracker grid only where the view draws it', () => {
  beforeEach(() => {
    const t = useTrackerStore.getState();
    t.patterns[0]?.channels[0]?.rows.forEach((_, r) => t.setCell(0, r, { note: 0 }));
  });

  it('classic + record on: the note lands at the cursor row and the cursor moves by the edit step', () => {
    const { unmount } = setup('classic', true);
    press('z');
    expect(noteAt(0)).toBeGreaterThan(0);
    expect(useCursorStore.getState().cursor.rowIndex).toBe(2);
    unmount();
  });

  it('hively + record on: nothing is written into the tracker grid and the cursor does not move', () => {
    const { unmount } = setup('hively', true);
    press('z');
    expect(noteAt(0)).toBe(0);
    expect(useCursorStore.getState().cursor.rowIndex).toBe(0);
    unmount();
  });

  it('record off: nothing is written in any mode (jam only)', () => {
    for (const mode of ['classic', 'hively'] as const) {
      const { unmount } = setup(mode, false);
      press('z');
      expect(noteAt(0), mode).toBe(0);
      unmount();
    }
  });
});
