/**
 * The file-subsong reopen runs the import path with origin 'subsong' and must not say "Imported ...";
 * a normal file open (origin 'filebrowser') still says it exactly once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const toasts = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock('@stores/useNotificationStore', () => ({ notify: toasts }));
vi.mock('@/stores/useNotificationStore', () => ({ notify: toasts }));

const applied = vi.hoisted(() => ({ applySong: vi.fn(async () => undefined) }));
vi.mock('@/lib/song/applySong', () => applied);
vi.mock('@lib/import/parseModuleToSong', () => ({
  parseModuleToSong: vi.fn(async () => ({
    name: 'Tune', format: 'UNKNOWN', instruments: [], songPositions: [0], initialBPM: 125, initialSpeed: 6,
    patterns: [{ id: 'p', name: 'p', length: 1, channels: [] }],
  })),
}));

// The unload half of a song load needs a real audio engine; the toast is decided after it.
vi.mock('@/lib/song/songLifecycle', async (orig) => ({
  ...(await orig<object>()),
  withSongLoad: async (_name: string, fn: () => Promise<unknown>) => fn(),
}));

import { importTrackerModule } from '@/lib/song/songBranches';

const info = () => ({
  metadata: { title: 'x.dw', type: 'Amiga', channels: 4, patterns: 0, orders: 0, instruments: 0, samples: 0, duration: 0 },
  arrayBuffer: new ArrayBuffer(8),
  file: new File([new ArrayBuffer(8)], 'x.dw'),
}) as never;

beforeEach(() => vi.clearAllMocks());

describe('reopening a file at another subsong is not an import', () => {
  it('origin subsong applies the tune and raises no success toast', async () => {
    await importTrackerModule(info(), { useLibopenmpt: false, subsong: 1, origin: 'subsong' });
    expect(applied.applySong).toHaveBeenCalledTimes(1);
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it('a normal file open still says Imported exactly once', async () => {
    await importTrackerModule(info(), { useLibopenmpt: false, origin: 'filebrowser' });
    expect(applied.applySong).toHaveBeenCalledTimes(1);
    expect(toasts.success).toHaveBeenCalledTimes(1);
    expect(toasts.success.mock.calls[0][0]).toMatch(/^Imported "Tune"/);
  });
});
