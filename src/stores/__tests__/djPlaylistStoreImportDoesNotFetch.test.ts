/**
 * Importing the DJ playlist store fetched the bundled seed playlists 100 ms later (a module-level
 * setTimeout): every unit test that reached the store printed ECONNREFUSED localhost:3000 (happy-dom's
 * base URL). The seed sync runs once at app start (main.tsx) now, never on import.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('the DJ playlist store', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('importing the store fetches nothing', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => new Response('[]'));
    vi.stubGlobal('fetch', fetchSpy);
    await import('../useDJPlaylistStore');
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
