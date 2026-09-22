import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A new song left the old one playing.
 *
 * Reported 2026-09-22: creating a new empty song while amanda.ahx was loaded
 * left amanda playing underneath an empty pattern grid.
 *
 * `restoreState` — which every tab switch and the New Song wizard go through —
 * called `getToneEngine().stop()` and reset every store. That reaches the
 * Tone.js graph only. A song played by a WASM replayer lives in its own
 * worklet, which holds the tune and keeps rendering whatever the stores say,
 * and `useFormatStore` still held the file data that selected it. So the grid
 * emptied and the music carried on.
 */

const stopNativeEngines = vi.fn();
const formatReset = vi.fn();

vi.mock('@engine/replayer/NativeEngineRouting', () => ({
  stopNativeEngines: (...args: unknown[]) => stopNativeEngines(...args),
}));

vi.mock('../useFormatStore', () => ({
  useFormatStore: { getState: () => ({ reset: formatReset }) },
}));

// The real engine opens an AudioContext, which node has no notion of.
vi.mock('@engine/ToneEngine', () => {
  // Enough of the engine for the tab reset to run. A Proxy rather than a
  // hand-written stub, so a new call added to `restoreState` later does not
  // fail this test for the wrong reason.
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});

// Restoring instruments kicks off CED classification, which spawns a Worker
// that node has no notion of. Not what this test is about.
vi.mock('@stores/useInstrumentTypeStore', () => {
  const state = new Proxy({}, { get: () => () => Promise.resolve() });
  return { useInstrumentTypeStore: { getState: () => state } };
});

import { useTabsStore } from '../useTabsStore';

beforeEach(() => {
  stopNativeEngines.mockClear();
  formatReset.mockClear();
});

/** `restoreState` is module-private; `addTab` is the product path that runs it. */
async function newTab(): Promise<void> {
  useTabsStore.getState().addTab();
  // The teardown is fire-and-forget so a tab switch never blocks on a worklet,
  // and it resolves two dynamic imports on the way. A macrotask covers both.
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

describe('opening a new tab', () => {
  it('stops the native replayer, not just the Tone.js graph', async () => {
    await newTab();
    expect(stopNativeEngines).toHaveBeenCalled();
  });

  it('clears the format data that selected the replayer', async () => {
    // Without this the stores are blank while `editorMode` still says 'hively'
    // and `hivelyFileData` still holds the tune.
    await newTab();
    expect(formatReset).toHaveBeenCalled();
  });
});
