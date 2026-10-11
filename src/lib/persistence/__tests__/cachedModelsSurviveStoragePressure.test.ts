/**
 * Cached models survive storage pressure: the app asks the browser to keep
 * its storage. Owner 2026-10-11 (bad wifi): the stem model loaded slowly; the
 * origin's storage was best-effort (navigator.storage.persisted() false), so
 * the browser may evict the 84 MB model and the next separation downloads it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestPersistentStorage, resetPersistentStorageRequestForTests } from '../persistentStorage';

describe('persistent storage request', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'storage');
  let persist: ReturnType<typeof vi.fn>;
  let persisted: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetPersistentStorageRequestForTests();
    persist = vi.fn(async () => true);
    persisted = vi.fn(async () => false);
    Object.defineProperty(globalThis.navigator, 'storage', { configurable: true, value: { persist, persisted } });
  });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis.navigator, 'storage', original);
  });

  it('asks the browser to keep storage once, however many caches write', async () => {
    expect(await requestPersistentStorage()).toBe(true);
    await requestPersistentStorage();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does not ask again when storage is already persistent', async () => {
    persisted.mockResolvedValue(true);
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('caching the stem model asks for persistent storage', async () => {
    const src = (await import('node:fs')).readFileSync(
      (await import('node:path')).resolve(__dirname, '../../../engine/demucs/DemucsEngine.ts'), 'utf8');
    const save = src.slice(src.indexOf('private async saveModelToCache'));
    expect(save.slice(0, 200)).toContain('requestPersistentStorage()');
  });
});
