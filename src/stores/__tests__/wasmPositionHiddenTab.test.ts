/**
 * The engine's playback position reaches the store while the tab is hidden.
 *
 * Position writes were batched into requestAnimationFrame, which browsers do
 * not run for hidden tabs, so get_playback_state and other background reads
 * reported enginePosition.active false during playback.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useWasmPositionStore } from '../useWasmPositionStore';

describe('the playback position in a hidden tab', () => {
  beforeEach(() => {
    useWasmPositionStore.getState().clear();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    // Hidden tabs run no animation frames.
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    useWasmPositionStore.getState().clear();
  });

  it('is stored as soon as the engine reports it', () => {
    useWasmPositionStore.getState().setPosition(12, 3);
    expect(useWasmPositionStore.getState()).toMatchObject({ active: true, row: 12, songPos: 3 });
  });

  it('follows each report, the latest one winning', () => {
    const s = useWasmPositionStore.getState();
    s.setPosition(1, 0);
    s.setPosition(2, 0);
    expect(useWasmPositionStore.getState().row).toBe(2);
  });
});
