import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A new song left the old one playing.
 *
 * Reported 2026-09-22: creating a new empty song while amanda.ahx was loaded
 * left amanda playing underneath an empty pattern grid. The tab reset reached
 * the Tone.js graph only; the WASM replayer kept the tune, and the format
 * store still held the file data that selected it.
 *
 * A tab's song is applied with applySong now (2026-09-29, the single load
 * path): it stops the outgoing song through the replayer - which stops the
 * native engines - and applies the new song's editor mode, clearing the old
 * native data. Checked here on the real format store.
 */

const replayerStop = vi.fn();
vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => new Proxy({ stop: replayerStop, hasReplacedInstruments: false, replacedInstrumentIds: [] }, {
    get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => undefined),
  }),
}));

// The real engine opens an AudioContext, which node has no notion of.
vi.mock('@engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});

// Restoring instruments kicks off CED classification, which spawns a Worker
// that node has no notion of. Not what this test is about.
vi.mock('@stores/useInstrumentTypeStore', () => {
  const state = new Proxy({}, { get: () => () => Promise.resolve() });
  return { useInstrumentTypeStore: { getState: () => state } };
});

// Registers itself with storeAccess, which loading a song goes through (the
// app imports every store at boot).
import '../useCursorStore';
import { useTabsStore } from '../useTabsStore';
import { useFormatStore } from '../useFormatStore';

beforeEach(() => {
  replayerStop.mockClear();
  useFormatStore.getState().applyEditorMode({
    hivelyNative: { song: {} } as never,
    hivelyFileData: new ArrayBuffer(16),
  });
});

/** `restoreState` is module-private; `addTab` is the product path that runs it. */
async function newTab(): Promise<void> {
  useTabsStore.getState().addTab();
  // The apply is fire-and-forget so a tab switch never blocks on a worklet.
  await vi.waitFor(() => expect(useFormatStore.getState().editorMode).toBe('classic'));
}

describe('opening a new tab over an AHX', () => {
  it('stops the replayer (and with it the native engines), not just the Tone.js graph', async () => {
    await newTab();
    expect(replayerStop).toHaveBeenCalled();
  });

  it('clears the format data that selected the replayer', async () => {
    await newTab();
    expect(useFormatStore.getState().hivelyFileData).toBeNull();
    expect(useFormatStore.getState().hivelyNative).toBeNull();
  });
});

describe('switching back to an AHX tab', () => {
  it('restores the AHX: its editor mode and file data', async () => {
    // A tab kept only patterns, instruments, automation, metadata and BPM,
    // so the AHX came back as an empty classic song (2026-09-29 audit).
    const bytes = new Uint8Array([0x54, 0x48, 0x58, 0x00, 1, 2, 3, 4]).buffer;
    useFormatStore.getState().applyEditorMode({ hivelyFileData: bytes, hivelyNative: { song: {} } as never });
    const ahxTab = useTabsStore.getState().activeTabId;

    useTabsStore.getState().addTab();
    await vi.waitFor(() => expect(useFormatStore.getState().editorMode).toBe('classic'));

    useTabsStore.getState().setActiveTab(ahxTab);
    await vi.waitFor(() => expect(useFormatStore.getState().editorMode).toBe('hively'));
    expect(new Uint8Array(useFormatStore.getState().hivelyFileData!)).toEqual(new Uint8Array(bytes));
  });
});

