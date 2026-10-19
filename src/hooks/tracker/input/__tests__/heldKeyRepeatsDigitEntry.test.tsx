/**
 * ONE reachability test: a held key's auto-repeat (KeyboardEvent.repeat) reaches
 * the data-column entry point (useEffectInput.handleKeyDown) and writes again.
 * Owner bug (2026-10-19): holding `0` in the pattern editor wrote one digit; the
 * handler dropped every repeat event. FT2 repeats data-column keys while editing
 * and the song is stopped; while the song plays, repeats are still ignored.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => ({ isPlaying: () => false, getCurrentPosition: () => 0, seekTo: () => {} }),
  peekTrackerReplayer: () => null,
}));

import { useTrackerStore, useCursorStore, useTransportStore } from '@stores';
import { useEditorStore } from '@stores/useEditorStore';
import { useEffectInput } from '../useEffectInput';

function setup() {
  useEditorStore.getState().setActiveBehavior('fasttracker2');
  useEditorStore.setState({ recordMode: true, editStep: 1 });
  useCursorStore.setState({
    cursor: { channelIndex: 0, rowIndex: 4, noteColumnIndex: 0, columnType: 'instrument', digitIndex: 0 },
  });
  const cursorRef = { current: useCursorStore.getState().cursor };
  const sel = { current: null };
  const { result } = renderHook(() => useEffectInput({ cursorRef, selectionRef: sel } as never));
  return result.current.handleKeyDown;
}

function cellAt(row: number) {
  const st = useTrackerStore.getState();
  return st.patterns[st.currentPatternIndex].channels[0].rows[row];
}

describe('Held-key auto-repeat reaches data-column entry', () => {
  beforeEach(() => {
    useTransportStore.setState({ isPlaying: false });
    useTrackerStore.getState().setCell(0, 4, { instrument: 0 });
  });

  it('a repeat keydown on the instrument column writes the digit while the song is stopped', () => {
    const handle = setup();
    const e = new KeyboardEvent('keydown', { key: '1', repeat: true });
    expect(handle(e)).toBe(true);
    expect(cellAt(4).instrument).toBe(0x10);
  });

  it('a repeat keydown is ignored while the song plays', () => {
    useTransportStore.setState({ isPlaying: true });
    const handle = setup();
    const e = new KeyboardEvent('keydown', { key: '1', repeat: true });
    expect(handle(e)).toBe(false);
    expect(cellAt(4).instrument).toBe(0);
  });
});
