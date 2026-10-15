/**
 * ONE reachability test: the 'Edit behaviour' setting and the active keymap drive a real
 * effect-column keystroke through the editor entry point (useEffectInput.handleKeyDown).
 * Owner bug: ProTracker keymap, typing C in the effect column moved the cursor right to the
 * parameter; ProTracker moves DOWN in the same column.
 * Per-profile numbers live in src/lib/tracker/__tests__/nibbleAdvance.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => ({ isPlaying: () => false, getCurrentPosition: () => 0, seekTo: () => {} }),
  peekTrackerReplayer: () => null,
}));

import { useTrackerStore, useCursorStore } from '@stores';
import { useEditorStore } from '@stores/useEditorStore';
import { useKeyboardStore } from '@stores/useKeyboardStore';
import { useEffectInput } from '../useEffectInput';

function press(handle: (e: KeyboardEvent) => boolean, key: string) {
  const e = new KeyboardEvent('keydown', { key });
  expect(handle(e)).toBe(true);
}

function setup(scheme: string, choice: 'follow-keymap' | 'devilbox' | 'protracker') {
  useEditorStore.getState().setActiveBehavior(scheme);
  useEditorStore.setState({ recordMode: true, editStep: 1 });
  useKeyboardStore.getState().setEditBehaviour(choice);
  useCursorStore.setState({
    cursor: { channelIndex: 0, rowIndex: 4, noteColumnIndex: 0, columnType: 'effTyp', digitIndex: 0 },
  });
  const cursorRef = { current: useCursorStore.getState().cursor };
  const sel = { current: null };
  const { result } = renderHook(() => useEffectInput({ cursorRef, selectionRef: sel } as never));
  return { handle: result.current.handleKeyDown, cursorRef };
}

describe('Edit behaviour reaches real effect-column key input', () => {
  beforeEach(() => {
    useTrackerStore.getState().setCell(0, 4, { effTyp: 0, eff: 0, effect: '000' });
  });

  it('ProTracker keymap + Follow keymap: C in the effect column writes the command and lands one row down in the SAME column', () => {
    const { handle } = setup('protracker', 'follow-keymap');
    press(handle, 'c');
    const st = useTrackerStore.getState();
    expect(st.patterns[st.currentPatternIndex].channels[0].rows[4].effTyp).toBe(0xC);
    expect(useCursorStore.getState().cursor).toMatchObject({ rowIndex: 5, columnType: 'effTyp', digitIndex: 0 });
  });

  it('explicit DEViLBOX default under the ProTracker keymap: C jumps to the parameter on the same row', () => {
    const { handle } = setup('protracker', 'devilbox');
    press(handle, 'c');
    expect(useCursorStore.getState().cursor).toMatchObject({ rowIndex: 4, columnType: 'effParam', digitIndex: 0 });
  });

  it('explicit ProTracker under the FT2 keymap: behaves like ProTracker', () => {
    const { handle } = setup('fasttracker2', 'protracker');
    press(handle, 'c');
    expect(useCursorStore.getState().cursor).toMatchObject({ rowIndex: 5, columnType: 'effTyp' });
  });
});
