/**
 * ONE reachability test: Tab and Shift+Tab through the real entry points (the pattern
 * editor's useNavigationInput.handleKeyDown, and the cursor.nextChannel / prevChannel
 * commands the keymap binds to Tab) step only through the channels the grid shows.
 * Owner 2026-10-20: "i cant tab longer than to channel 4", then "zoom scale changes when
 * i use tab". Tab landed on empty, hidden channels; the cursor reveals the channel it
 * stands on, so the visible set and with it the fit-all-channels scale changed on every
 * press. The step rule itself lives in src/lib/tracker/__tests__/tabNavigation.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => ({ isPlaying: () => false, getCurrentPosition: () => 0, seekTo: () => {} }),
  peekTrackerReplayer: () => null,
}));

import { useTrackerStore, useCursorStore } from '@stores';
import { useEditorStore } from '@stores/useEditorStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { visibleChannelMask, channelMaskKey } from '@/lib/tracker/visibleChannels';
import { nextChannel, prevChannel } from '@/engine/keyboard/commands/cursor';
import { useNavigationInput } from '../useNavigationInput';

/** 7 channels; 2, 4 and 5 hold no data and are hidden. */
const WITH_DATA = [0, 1, 3, 6];

function sevenChannelSong() {
  const base = useTrackerStore.getState().patterns[0];
  const empty = base.channels[0].rows.map((r) => ({ ...r, note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 }));
  const channels = Array.from({ length: 7 }, (_, i) => ({
    ...base.channels[0],
    id: `ch${i}`,
    channelMeta: undefined,
    rows: WITH_DATA.includes(i) ? empty.map((r, row) => (row === 0 ? { ...r, note: 49, instrument: 1 } : r)) : empty,
  }));
  useTrackerStore.setState({ patterns: [{ ...base, channels }], currentPatternIndex: 0 });
  useSettingsStore.setState({ showUnusedChannels: false });
  useCursorStore.setState({ cursor: { channelIndex: 0, rowIndex: 0, noteColumnIndex: 0, columnType: 'note', digitIndex: 0 } });
}

/** The set the grid draws, including the cursor's reveal: it decides the fit scale. */
function drawnChannels(): string {
  return channelMaskKey(visibleChannelMask(useTrackerStore.getState().patterns, {
    revealChannel: useCursorStore.getState().cursor.channelIndex,
  }));
}

describe('Tab steps only through the shown channels', () => {
  beforeEach(sevenChannelSong);

  it('pattern editor Tab (FT2) visits 1, 3, 6, 0 and Shift+Tab goes back, with the drawn set unchanged', () => {
    useEditorStore.getState().setActiveBehavior('fasttracker2');
    const cursorRef = { current: useCursorStore.getState().cursor };
    const { result } = renderHook(() => useNavigationInput({ cursorRef, selectionRef: { current: null } } as never));
    const drawn = drawnChannels();
    expect(drawn).toBe('1101001');

    const press = (shiftKey: boolean) => {
      expect(result.current.handleKeyDown(new KeyboardEvent('keydown', { key: 'Tab', shiftKey }))).toBe(true);
      cursorRef.current = useCursorStore.getState().cursor;
      expect(drawnChannels()).toBe(drawn);
      return useCursorStore.getState().cursor.channelIndex;
    };
    expect([press(false), press(false), press(false), press(false)]).toEqual([1, 3, 6, 0]);
    expect([press(true), press(true)]).toEqual([6, 3]);
  });

  it('the keymap commands bound to Tab and Shift+Tab skip the same channels', () => {
    const steps: number[] = [];
    for (let i = 0; i < 4; i++) { nextChannel(); steps.push(useCursorStore.getState().cursor.channelIndex); }
    expect(steps).toEqual([1, 3, 6, 0]);
    prevChannel();
    expect(useCursorStore.getState().cursor.channelIndex).toBe(6);
    expect(drawnChannels()).toBe('1101001');
  });
});
