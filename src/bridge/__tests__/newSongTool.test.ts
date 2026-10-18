import { describe, it, expect, vi } from 'vitest';

/**
 * An MCP precheck agent built its test instruments inside the owner's open
 * song (flo boarding, 2026-10-18): it deleted samples 1-30 to make room. The
 * MCP had no way to start a blank song. `new_song` runs the New Song wizard's
 * empty-song path: the open song moves to its own tab, untouched.
 */

vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => new Proxy({ stop: () => undefined, hasReplacedInstruments: false, replacedInstrumentIds: [] }, {
    get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => undefined),
  }),
}));
vi.mock('@engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => {
  const state = new Proxy({}, { get: () => () => Promise.resolve() });
  return { useInstrumentTypeStore: { getState: () => state } };
});

import '@stores/useCursorStore';
import { useTabsStore } from '@stores/useTabsStore';
import { useUIStore } from '@stores/useUIStore';
import { newSong } from '../handlers/writeHandlers';

describe('new_song MCP tool', () => {
  it('opens a new tab and keeps the open song in its own tab', async () => {
    const before = useTabsStore.getState().tabs.length;
    useUIStore.setState({ statusMessage: '' });
    expect(await newSong()).toEqual({ ok: true });
    expect(useTabsStore.getState().tabs.length).toBe(before + 1);
    // Sentinel: the shared startNewSong ran to its end.
    expect(useUIStore.getState().statusMessage).toBe('New project');
  });
});
