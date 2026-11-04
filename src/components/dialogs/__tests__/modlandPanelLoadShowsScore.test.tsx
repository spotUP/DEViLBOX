/**
 * Loading a song from the tracker's Modland browser ends with the active project tab showing its
 * community score: ModlandPanel -> onLoadTrackerModule(..., sourceKey) -> openUserSong -> openSong
 * -> useFormatStore.songSourceKey -> the active project tab (NavBar). The key is the same ratingId the panel's own stars use.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { ModlandPanel } from '../FilePreviewPanel';
import { NavBar } from '@/components/layout/NavBar';
import { openUserSong } from '@/lib/song/openUserSong';
import { useFormatStore } from '@/stores/useFormatStore';
import { useRatingsStore, ratingId } from '@/stores/useRatingsStore';

const modBytes = (): ArrayBuffer => {
  const b = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../public/data/songs/formats/a sleep so deep.mod'));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

vi.mock('@/lib/modlandApi', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/modlandApi')>();
  return {
    ...real,
    searchModland: vi.fn(async () => ({ results: [{ full_path: 'Pro/Art/z.mod', filename: 'z.mod', format: 'ProTracker', author: 'Art' }] })),
    getModlandFormats: vi.fn(async () => []),
    getModlandStatus: vi.fn(async () => ({})),
    downloadModlandFile: vi.fn(async () => modBytes()),
  };
});
vi.mock('@/lib/song/acquireSource', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/song/acquireSource')>();
  return { ...real, acquireModlandCompanions: vi.fn(async () => undefined) };
});
vi.mock('@/lib/song/songBranches', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/song/songBranches')>();
  return { ...real, importModuleFile: vi.fn(async () => {}), prepareModuleFile: vi.fn(async () => ({ info: { metadata: {}, arrayBuffer: new ArrayBuffer(8), file: new File([], 'z.mod') } }) as never) };
});
vi.mock('@/engine/ToneEngine', () => {
  const engine = { releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}), invalidateInstrument: vi.fn(), setBPM: vi.fn() };
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })), markKnownSource: vi.fn(), isKnownSource: () => true }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));
vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => ({ state: 'running', resume: async () => {} }) }));
vi.mock('@/engine/TrackerReplayer', () => ({ getTrackerReplayer: () => ({ stop: () => {}, releaseSong: () => {} }) }));

afterEach(() => {
  cleanup();
  useFormatStore.getState().setSongSourceKey(null);
  useRatingsStore.setState({ ratings: {} });
});

describe('Modland browser load shows the score in the active tab', { timeout: 60000 }, () => {
  it('passes modland:<full_path> through openUserSong, and the active tab shows the score', async () => {
    useRatingsStore.setState({ ratings: { [ratingId('modland', 'Pro/Art/z.mod')]: { avg: 4.5, count: 7, userRating: 0 } } as never, loadMany: vi.fn(async () => {}), load: vi.fn(async () => {}) } as never);
    const onLoad = vi.fn(async (buffer: ArrayBuffer, filename: string, companions?: Map<string, ArrayBuffer>, sourceKey?: string) => {
      await openUserSong(new File([buffer], filename), 'filebrowser', companions, (m) => { throw new Error(m); }, sourceKey);
    });
    render(<ModlandPanel isOpen onLoadTrackerModule={onLoad} onClose={() => {}} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'z' } });
    fireEvent.click(await screen.findByText('Load', {}, { timeout: 5000 }));
    await waitFor(() => expect(useFormatStore.getState().songSourceKey).toBe('modland:Pro/Art/z.mod'), { timeout: 10000 });
    const bar = render(<NavBar />);
    expect(bar.container.textContent).toContain('4.5');
    expect(bar.container.textContent).toContain('(7)');
  });
});
