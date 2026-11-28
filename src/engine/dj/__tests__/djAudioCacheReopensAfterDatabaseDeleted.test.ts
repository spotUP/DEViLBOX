/**
 * The DJ audio cache kept its IndexedDB connection after the database was
 * deleted under it (another tab, DevTools): every later call failed with
 * "The database connection is closing" until a page reload (2026-11-28). The
 * connection now lets go on versionchange and the next call reopens.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';

const source = (seed: number) => Uint8Array.from({ length: 100 }, (_, i) => (i * 5 + seed) & 255).buffer;

function deleteCacheDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('DEViLBOX_AudioCache');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('delete blocked: the cache kept its connection open'));
  });
}

describe('the DJ audio cache reopens after its database is deleted', () => {
  it('a put and get after the delete work', async () => {
    const { cacheAudio, getCachedAudio } = await import('../DJAudioCache');
    await cacheAudio(source(1), 'before.mod', new ArrayBuffer(400), 1, new Float32Array(0), 44100, 2);
    expect((await getCachedAudio(source(1)))?.filename).toBe('before.mod');

    await deleteCacheDatabase();

    await cacheAudio(source(2), 'after.mod', new ArrayBuffer(400), 1, new Float32Array(0), 44100, 2);
    expect((await getCachedAudio(source(2)))?.filename).toBe('after.mod');
    expect(await getCachedAudio(source(1))).toBeNull();
  });
});
