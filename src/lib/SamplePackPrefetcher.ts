/**
 * SamplePackPrefetcher — Downloads all factory sample pack files into the
 * 'sample-packs-v1' Cache API bucket on first run.
 *
 * Uses `localStorage.samplePacksCached = 'v1'` as a flag to skip on
 * subsequent boots. Supports resume: already-cached files are skipped.
 */

import { SAMPLE_PACKS } from '@/constants/samplePacks';

export const CACHE_NAME = 'sample-packs-v1';
export const STORAGE_KEY = 'samplePacksCached';
const CACHE_VERSION = 'v1';
const BATCH_SIZE = 4;

/** Collect all unique sample URLs from the factory pack registry. */
function getAllSampleUrls(): string[] {
  const seen = new Set<string>();
  for (const pack of SAMPLE_PACKS) {
    for (const samples of Object.values(pack.samples)) {
      for (const sample of samples) {
        if (sample.url) seen.add(sample.url);
      }
    }
  }
  return Array.from(seen);
}

/**
 * Run the sample pack prefetch if not already cached.
 * @param onProgress Called with (completed, total) after each file.
 */
export async function runPrefetchIfNeeded(
  onProgress: (completed: number, total: number) => void
): Promise<void> {
  // Skip if already cached
  if (localStorage.getItem(STORAGE_KEY) === CACHE_VERSION) return;

  // Cache API must be available (HTTPS or localhost)
  if (!('caches' in window)) {
    console.warn('[SamplePackPrefetcher] Cache API not available');
    return;
  }

  const allUrls = getAllSampleUrls();
  const total = allUrls.length;

  // Check which files are already cached (resume support)
  const cache = await caches.open(CACHE_NAME);
  const alreadyCached = await Promise.all(
    allUrls.map((url) => cache.match(url).then((r) => !!r))
  );
  const pending = allUrls.filter((_, i) => !alreadyCached[i]);
  let completed = total - pending.length;

  if (pending.length === 0) {
    // All files already in cache from a previous partial run
    localStorage.setItem(STORAGE_KEY, CACHE_VERSION);
    onProgress(total, total);
    return;
  }

  onProgress(completed, total);

  let errorCount = 0;

  // Fetch in batches
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (url) => {
        try {
          const response = await fetch(url);
          if (response.ok && response.status === 200) {
            await cache.put(url, response);
          }
        } catch (err) {
          errorCount++;
          console.warn('[SamplePackPrefetcher] Failed to cache:', url, err);
        }
        completed++;
        onProgress(completed, total);
      })
    );
  }

  if (errorCount === 0) {
    localStorage.setItem(STORAGE_KEY, CACHE_VERSION);
  }
}

/** Clear the sample pack cache and flag (forces re-download on next boot). */
export async function clearSamplePackCache(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);
  await caches.delete(CACHE_NAME);
}
