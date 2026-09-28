/**
 * Playback rows do not re-render App through its MIDI button hook.
 *
 * useButtonMappings runs in App. It subscribed to the whole transport store,
 * so every playback row re-rendered App (and with it the whole tracker tree)
 * and re-registered every MIDI button action: ~40 commits/s while a song
 * played, tens of MB/s of garbage, playback slowing until it halted
 * (2026-09-28). The actions now read the stores when pressed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';

const registered = new Map<string, () => void>();
const registerAction = vi.fn((name: string, cb: () => void) => { registered.set(name, cb); return () => registered.delete(name); });
vi.mock('../../midi/ButtonMapManager', () => ({
  getButtonMapManager: () => ({ init: () => {}, registerAction }),
}));
vi.mock('../../engine/dj/DJEngine', () => ({ getDJEngine: () => { throw new Error('not in this test'); } }));

import { useButtonMappings } from '../midi/useButtonMappings';
import { useTransportStore, useTrackerStore } from '../../stores';

afterEach(() => { cleanup(); registerAction.mockClear(); registered.clear(); });

describe('useButtonMappings during playback', () => {
  it('neither re-renders nor re-registers its actions when the playback row moves', () => {
    let renders = 0;
    renderHook(() => { renders++; useButtonMappings(); });
    const rendersAfterMount = renders;
    const registrations = registerAction.mock.calls.length;
    expect(registrations).toBeGreaterThan(0);

    act(() => {
      for (let row = 1; row <= 16; row++) useTransportStore.setState({ currentRow: row, continuousRow: row });
    });

    expect(renders).toBe(rendersAfterMount);
    expect(registerAction.mock.calls.length).toBe(registrations);
  });

  it('acts on the state at the moment the button is pressed', () => {
    renderHook(() => useButtonMappings());
    const setCurrentPattern = vi.fn();
    useTrackerStore.setState({ currentPatternIndex: 2, patterns: new Array(5).fill({ channels: [] }), setCurrentPattern } as never);
    registered.get('pattern.next')!();
    expect(setCurrentPattern).toHaveBeenCalledWith(3);
    useTrackerStore.setState({ currentPatternIndex: 4 } as never);
    registered.get('pattern.next')!();
    expect(setCurrentPattern).toHaveBeenCalledTimes(1);   // already on the last pattern
  });
});

describe('useMobileTrackerInput during playback', () => {
  it('does not re-render TrackerView when the cursor follows the playback row', async () => {
    const { useMobileTrackerInput } = await import('../../components/tracker/mobile/useMobileTrackerInput');
    const { useCursorStore } = await import('../../stores');
    let renders = 0;
    renderHook(() => { renders++; useMobileTrackerInput(false); });
    const rendersAfterMount = renders;
    act(() => {
      for (let row = 1; row <= 16; row++) {
        useCursorStore.setState((s) => ({ cursor: { ...s.cursor, rowIndex: row } }));
      }
    });
    expect(renders).toBe(rendersAfterMount);
  });
});
