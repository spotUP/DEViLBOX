/**
 * "the transistion from the jingle to the restored song is jumpy still"
 * (2026-10-18).
 *
 * The silent boot restore went through the one song-load path, which raised the
 * song-load panel over the editor for the length of the open: a panel flashed up
 * between the jingle's lips and the restored song. A restore asked for with
 * `silent` now covers the editor (the render worker holds the fade-in) without
 * the panel; every other open still shows it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(), ensureInstrumentReady: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));

import { setDevilboxAudioContext } from '@/utils/audio-context';
setDevilboxAudioContext({ sampleRate: 44100, currentTime: 0 } as unknown as AudioContext);

afterEach(cleanup);

/** Restores a saved 6-channel song and records every (depth, silent) the song-load store passes through. */
async function restore(opts: { silent?: boolean }) {
  const { snapshotSong } = await import('@/lib/song/snapshotSong');
  const { applySavedProject } = await import('@hooks/useProjectPersistence');
  const { CURRENT_SCHEMA } = await import('@/lib/persistence/migrations');
  const { useTrackerStore } = await import('@/stores/useTrackerStore');
  const { useSongLoadStore } = await import('@/stores/useSongLoadStore');
  useTrackerStore.getState().addOverlayChannels(6);
  const saved = structuredClone({ version: '1.0.0', schemaVersion: CURRENT_SCHEMA, savedAt: '', ...snapshotSong() });
  const seen: { depth: number; silent: boolean }[] = [];
  const unsubscribe = useSongLoadStore.subscribe((s) => seen.push({ depth: s.depth, silent: s.silent }));
  expect(await applySavedProject(saved as never, opts)).toBe(true);
  unsubscribe();
  return { loading: seen.filter((s) => s.depth > 0), end: useSongLoadStore.getState() };
}

describe('the silent boot restore shows no loading panel', () => {
  it('a silent restore covers the editor without the panel, and the flag clears when it ends', async () => {
    const { loading, end } = await restore({ silent: true });
    expect(loading.length).toBeGreaterThan(0);
    expect(loading.every((s) => s.silent)).toBe(true);
    expect(end.depth).toBe(0);
    expect(end.silent).toBe(false);
  });

  it('any other restore shows the panel', async () => {
    const { loading } = await restore({});
    expect(loading.length).toBeGreaterThan(0);
    expect(loading.some((s) => s.silent)).toBe(false);
  });

  it('the panel renders for a load in progress, and not for a silent one', async () => {
    const { SongLoadPanel } = await import('@/components/tracker/SongLoadPanel');
    const { useSongLoadStore } = await import('@/stores/useSongLoadStore');
    act(() => { useSongLoadStore.setState({ depth: 1, silent: true, label: 'saved.mod' }); });
    const { queryByTestId } = render(<SongLoadPanel />);
    expect(queryByTestId('song-load-panel')).toBeNull();
    act(() => { useSongLoadStore.setState({ silent: false }); });
    expect(queryByTestId('song-load-panel')).not.toBeNull();
    act(() => { useSongLoadStore.setState({ depth: 0 }); });
  });
});
