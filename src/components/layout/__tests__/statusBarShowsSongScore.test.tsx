/**
 * The tracker status bar no longer shows the loaded song's info (score, SID metadata, song database
 * info); the active project tab does (see activeTabSongInfo.test.tsx). The key still travels
 * openSong -> useFormatStore.songSourceKey; unloadSong clears it.
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
  useFormatStore.getState().clearSongInfo();
  useRatingsStore.setState({ ratings: {} });
});

const seed = (key: string): void => {
  useRatingsStore.setState({ ratings: { [ratingId('modland', key)]: { avg: 4.5, count: 7, userRating: 0 } } as never, load: vi.fn(async () => {}) } as never);
};

describe('status bar carries no song info', { timeout: 60000 }, () => {
  it('shows no score, title or authors even when a key, song database info and SID metadata are set', () => {
    seed('X/Y/z.mod');
    const fs = useFormatStore.getState();
    fs.setSongSourceKey('modland:X/Y/z.mod');
    fs.setSongDBInfo({ authors: ['Jogeir'], publishers: [], album: 'Fantasy Album', year: '1991', format: 'MOD', duration_ms: 1 });
    fs.setSidMetadata({ format: 'PSID', version: 2, title: 'Commando', author: 'Rob Hubbard', copyright: '', chipModel: '8580', clockSpeed: 'PAL', subsongs: 3, defaultSubsong: 0, currentSubsong: 1, secondSID: false, thirdSID: false });
    const { container } = render(<StatusBar />);
    const t = container.textContent ?? '';
    for (const s of ['4.5', '(7)', 'Fantasy Album', 'Jogeir', 'Commando', 'Rob Hubbard', 'MOS', 'Sub 2/3']) expect(t).not.toContain(s);
    expect(t).toContain('Row');
  });

  it('openSong of a Modland path sets the key; a plain file clears it', async () => {
    const r = await openSong({ kind: 'modland', path: 'X/Y/z.mod' }, { origin: 'modland' });
    expect(r.ok).toBe(true);
    expect(useFormatStore.getState().songSourceKey).toBe('modland:X/Y/z.mod');
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
