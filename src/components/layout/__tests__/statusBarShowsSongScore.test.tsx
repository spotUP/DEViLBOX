/**
 * The tracker status bar shows the loaded song's community score (star, average, count)
 * the way the DJ deck info bar does. The key travels openSong -> useFormatStore.songSourceKey
 * -> StatusBar -> SongScore -> useRatingsStore; unloadSong clears it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { StatusBar } from '../StatusBar';
import { useFormatStore } from '@/stores/useFormatStore';
import { useRatingsStore, ratingId } from '@/stores/useRatingsStore';
import { openSong } from '@/lib/song/openSong';
import { unloadSong } from '@/lib/song/songLifecycle';

vi.mock('@/lib/song/acquireSource', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/song/acquireSource')>();
  return { ...real, acquire: vi.fn(async () => ({ file: new File([new Uint8Array(8)], 'z.mod') })) };
});
vi.mock('@/lib/song/songBranches', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/song/songBranches')>();
  return { ...real, importModuleFile: vi.fn(async () => {}) };
});
vi.mock('@/engine/ToneEngine', () => {
  const engine = { releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}), invalidateInstrument: vi.fn(), setBPM: vi.fn() };
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/TrackerReplayer', () => ({ getTrackerReplayer: () => ({ stop: () => {}, releaseSong: () => {} }) }));

afterEach(() => {
  cleanup();
  useFormatStore.getState().setSongSourceKey(null);
  useRatingsStore.setState({ ratings: {} });
});

const seed = (key: string): void => {
  useRatingsStore.setState({ ratings: { [ratingId('modland', key)]: { avg: 4.5, count: 7, userRating: 0 } } as never, load: vi.fn(async () => {}) } as never);
};

describe('status bar song score', { timeout: 60000 }, () => {
  it('renders "avg (count)" for a loaded song that has a rating key', () => {
    seed('X/Y/z.mod');
    useFormatStore.getState().setSongSourceKey('modland:X/Y/z.mod');
    const { container } = render(<StatusBar />);
    expect(container.textContent).toContain('4.5');
    expect(container.textContent).toContain('(7)');
  });

  it('shows nothing for a song without a key', () => {
    seed('X/Y/z.mod');
    const { container } = render(<StatusBar />);
    expect(container.textContent).not.toContain('(7)');
  });

  it('openSong of a Modland path sets the key, so the bar shows the score; a plain file clears it', async () => {
    seed('X/Y/z.mod');
    const r = await openSong({ kind: 'modland', path: 'X/Y/z.mod' }, { origin: 'modland' });
    expect(r.ok).toBe(true);
    expect(useFormatStore.getState().songSourceKey).toBe('modland:X/Y/z.mod');
    const { container } = render(<StatusBar />);
    expect(container.textContent).toContain('4.5');
    expect(container.textContent).toContain('(7)');
    await openSong({ kind: 'file', file: new File([new Uint8Array(8)], 'local.mod') }, { origin: 'dialog', askForChoices: false });
    expect(useFormatStore.getState().songSourceKey).toBeNull();
  });

  it('openSong passes an explicit sourceKey (HVSC) through', async () => {
    await openSong({ kind: 'file', file: new File([new Uint8Array(8)], 't.sid') }, { origin: 'dialog', askForChoices: false, sourceKey: 'hvsc:A/B/t.sid' });
    expect(useFormatStore.getState().songSourceKey).toBe('hvsc:A/B/t.sid');
  });

  it('unloadSong clears the key', async () => {
    useFormatStore.getState().setSongSourceKey('modland:X/Y/z.mod');
    await unloadSong();
    expect(useFormatStore.getState().songSourceKey).toBeNull();
  });
});
