/**
 * The DJ audio cache filled the disk (2026-10-12: 4.6 GB in Chrome's IndexedDB
 * against a 2000 MB cap): an entry's size counted its WAV only, while the
 * channel stems (about 4x the WAV) and the module source were stored too, so
 * eviction undercounted about 5x. The cap and eviction now count every byte
 * an entry stores, recomputed on read (old entries carry the WAV-only figure).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import type { ChannelScopeTrack } from '../channelScopeTrack';

const track = (stemBytes: number): ChannelScopeTrack => ({
  sampleRate: 11025, channels: [new Int8Array(16)], scales: [1],
  stems: [new Int16Array(stemBytes / 4), new Int16Array(stemBytes / 4)],
});
const source = (seed: number) => Uint8Array.from({ length: 100 }, (_, i) => (i * 7 + seed) & 255).buffer;

describe('the DJ audio cache counts every byte an entry stores', () => {
  afterEach(async () => {
    const { setCacheCapBytes, clearAudioCache } = await import('../DJAudioCache');
    setCacheCapBytes();
    await clearAudioCache();
  });

  it('an entry with stems counts its stem bytes, not only its WAV', async () => {
    const { entryStoredBytes } = await import('../DJAudioCache');
    const bytes = entryStoredBytes({ audioData: new ArrayBuffer(1000), sourceData: new ArrayBuffer(100), channelScopes: track(8000) });
    expect(bytes).toBeGreaterThanOrEqual(1000 + 100 + 8000 + 16);
  });

  it('a put over the cap evicts the oldest entries until the real total fits', async () => {
    const { cacheAudio, getCacheStats, getCachedEntryByHash, setCacheCapBytes, entryStoredBytes } = await import('../DJAudioCache');
    const { hashFile } = await import('../DJAudioCache');
    const cap = 30_000;
    setCacheCapBytes(cap);
    // Each entry: 5000 B of WAV, 10000 B of stems, 100 B of source -> ~15.1 kB stored.
    await cacheAudio(source(1), 'one.mod', new ArrayBuffer(5000), 1, new Float32Array(0), 44100, 2, track(10_000));
    await new Promise((r) => setTimeout(r, 5));
    await cacheAudio(source(2), 'two.mod', new ArrayBuffer(5000), 1, new Float32Array(0), 44100, 2, track(10_000));

    const stats = await getCacheStats();
    expect(stats.sizeMB * 1024 * 1024, `real total ${stats.sizeMB * 1024 * 1024} B over the ${cap} B cap`).toBeLessThanOrEqual(cap);
    expect(await getCachedEntryByHash(await hashFile(source(1))), 'the oldest entry is evicted').toBeNull();
    const kept = await getCachedEntryByHash(await hashFile(source(2)));
    expect(kept, 'the new entry is kept').not.toBeNull();
    expect(kept!.sizeBytes).toBe(entryStoredBytes(kept!));
  });

  it('a cache already over its cap (old WAV-only sizes) trims to the cap', async () => {
    const { cacheAudio, getCacheStats, setCacheCapBytes, trimCacheToCap } = await import('../DJAudioCache');
    setCacheCapBytes(1e9);
    for (let i = 3; i < 6; i++) {
      await cacheAudio(source(i), `n${i}.mod`, new ArrayBuffer(5000), 1, new Float32Array(0), 44100, 2, track(10_000));
      await new Promise((r) => setTimeout(r, 5));
    }
    setCacheCapBytes(20_000);
    await trimCacheToCap();
    const stats = await getCacheStats();
    expect(stats.sizeMB * 1024 * 1024).toBeLessThanOrEqual(20_000);
    expect(stats.entryCount).toBe(1);
  });
});
