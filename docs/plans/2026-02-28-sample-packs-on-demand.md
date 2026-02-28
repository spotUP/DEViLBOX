# Sample Packs On-Demand Download — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move 73 MB of factory sample files out of the initial app bundle by downloading and caching them on first run via the Service Worker Cache API, with background progress shown in the status bar.

**Architecture:** A `SamplePackPrefetcher` runs on app mount, checks `localStorage` for a cached flag, and if absent fetches all 555 sample files into a dedicated `sample-packs-v1` Cache API bucket. The existing `public/sw.js` is extended to serve those requests cache-first and to preserve the sample cache across app updates. The rest of the app is unchanged — all sample URLs stay the same.

**Tech Stack:** Cache API (browser), Service Worker, `SAMPLE_PACKS` constant (already enumerates all URLs), `useUIStore.setStatusMessage` (status bar), `notify` (toast), React `useEffect` in `App.tsx`

---

## Context

- Factory packs live in `public/data/samples/packs/` — 555 files, ~73 MB
- All URLs are already enumerated in `src/constants/samplePacks.ts` as `sample.url` values (e.g. `/data/samples/packs/drumnibus/kicks/BD_808A1200.wav`)
- `public/sw.js` already exists and is **NOT** yet registered anywhere in the app — registration must be added
- `useUIStore.setStatusMessage(msg, carry, timeout)` — timeout `0` means "stay until replaced"
- `notify.warning(msg)` for toasts (from `src/stores/useNotificationStore.ts`)
- The existing SW's `activate` handler deletes all caches except `devilbox-v1` — we must preserve `sample-packs-v1` there

---

## Task 1: Update the Service Worker to add a sample-packs cache

**Files:**
- Modify: `public/sw.js`

The existing SW caches everything in `devilbox-v1`. We need a second cache `sample-packs-v1` that:
1. Is never deleted when the app cache is cleared
2. Serves `/data/samples/packs/**` requests cache-first

**Step 1: Add `SAMPLE_CACHE_NAME` constant and update activate to preserve it**

Replace the top of `public/sw.js` (the `CACHE_NAME` constant and the `activate` handler) with this:

```js
const CACHE_NAME = 'devilbox-v1';
const SAMPLE_CACHE_NAME = 'sample-packs-v1';
const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
```

And update the `activate` handler's filter line from:
```js
.filter((name) => name !== CACHE_NAME)
```
to:
```js
.filter((name) => name !== CACHE_NAME && name !== SAMPLE_CACHE_NAME)
```

**Step 2: Add cache-first handling for sample pack requests in the fetch handler**

In the `fetch` event listener, add this block **before** the existing `version.json` check:

```js
// Cache-first for sample pack audio files — served from dedicated cache
if (url.pathname.startsWith('/data/samples/packs/')) {
  event.respondWith(
    caches.open(SAMPLE_CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      // Not cached yet — fetch from network and store
      const response = await fetch(event.request);
      if (response.ok) {
        cache.put(event.request, response.clone());
      }
      return response;
    })
  );
  return;
}
```

**Step 3: Verify manually**

Open DevTools → Application → Service Workers and confirm `sw.js` (once registered in Task 2) activates without errors. Confirm in Application → Cache Storage that `sample-packs-v1` appears after the first sample fetch.

**Step 4: Commit**

```bash
git add public/sw.js
git commit -m "feat(sw): add sample-packs-v1 cache with cache-first strategy"
```

---

## Task 2: Register the Service Worker on app startup

**Files:**
- Modify: `src/main.tsx`

The SW exists but is not registered. Add registration in `main.tsx` after the existing imports.

**Step 1: Add SW registration at the end of `src/main.tsx`**

```typescript
// Register service worker for sample pack caching
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.warn('[SW] Registration failed:', err);
  });
}
```

**Step 2: Verify**

Run `npm run dev`, open DevTools → Application → Service Workers. Confirm `sw.js` shows as "activated and is running".

**Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "feat(sw): register service worker on app startup"
```

---

## Task 3: Create `SamplePackPrefetcher`

**Files:**
- Create: `src/lib/SamplePackPrefetcher.ts`

This module collects all factory sample URLs from `SAMPLE_PACKS`, checks which are already cached, fetches the rest in batches of 4, and reports progress.

**Step 1: Create `src/lib/SamplePackPrefetcher.ts`**

```typescript
/**
 * SamplePackPrefetcher — Downloads all factory sample pack files into the
 * 'sample-packs-v1' Cache API bucket on first run.
 *
 * Uses `localStorage.samplePacksCached = 'v1'` as a flag to skip on
 * subsequent boots. Supports resume: already-cached files are skipped.
 */

import { SAMPLE_PACKS } from '@/constants/samplePacks';

const CACHE_NAME = 'sample-packs-v1';
const STORAGE_KEY = 'samplePacksCached';
const CACHE_VERSION = 'v1';
const BATCH_SIZE = 4;

/** Collect all unique sample URLs from the factory pack registry. */
function getAllSampleUrls(): string[] {
  const urls: string[] = [];
  for (const pack of SAMPLE_PACKS) {
    for (const samples of Object.values(pack.samples)) {
      for (const sample of samples) {
        if (sample.url && !urls.includes(sample.url)) {
          urls.push(sample.url);
        }
      }
    }
  }
  return urls;
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

  // Fetch in batches
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (url) => {
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
          }
        } catch (err) {
          // Individual failures are non-fatal — skip silently
          console.warn('[SamplePackPrefetcher] Failed to cache:', url, err);
        }
        completed++;
        onProgress(completed, total);
      })
    );
  }

  localStorage.setItem(STORAGE_KEY, CACHE_VERSION);
}

/** Clear the sample pack cache and flag (forces re-download on next boot). */
export async function clearSamplePackCache(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);
  await caches.delete(CACHE_NAME);
}
```

**Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit**

```bash
git add src/lib/SamplePackPrefetcher.ts
git commit -m "feat(samples): add SamplePackPrefetcher for background cache population"
```

---

## Task 4: Wire prefetcher into App.tsx with status bar progress

**Files:**
- Modify: `src/App.tsx`

On mount, run the prefetcher and feed progress to the status bar. The status message shows `SAMPLES 47/555`. On completion it clears automatically (by setting a short-lived final message).

**Step 1: Find the App component's mount effect in `src/App.tsx`**

Look for the top-level `useEffect(() => { ... }, [])` or the early import area. Add these imports near the top of the file:

```typescript
import { runPrefetchIfNeeded } from '@/lib/SamplePackPrefetcher';
import { useUIStore } from '@stores/useUIStore';
```

**Step 2: Add the prefetch effect inside the `App` component**

Add inside `App` (alongside other mount effects):

```typescript
// Background sample pack download on first run
useEffect(() => {
  runPrefetchIfNeeded((completed, total) => {
    if (completed === total) {
      // Done — let the status bar revert naturally
      useUIStore.getState().setStatusMessage('SAMPLES READY', false, 2000);
    } else {
      // Persistent message until complete (timeout = 0)
      useUIStore.getState().setStatusMessage(
        `SAMPLES ${completed}/${total}`,
        false,
        0
      );
    }
  });
}, []);
```

**Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 4: Verify manually**

1. Open DevTools → Application → Storage → Clear all site data (to reset `localStorage` flag and Cache API)
2. Reload the app
3. Watch the status bar — it should show `SAMPLES 0/555` then increment to `SAMPLES 555/555`, then briefly `SAMPLES READY`
4. Reload again — status bar should NOT show any download progress (flag is set)

**Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(samples): run background sample pack prefetch on first boot"
```

---

## Task 5: Show a toast when a sample is played before the cache is ready

**Files:**
- Modify: `src/components/instruments/SamplePackBrowser.tsx`

Find the sample preview function (it uses `Tone.Player`). When preview fails because the file isn't available yet, show a toast.

**Step 1: Find the preview function**

Search for `Tone.Player` or `previewSample` in `SamplePackBrowser.tsx`. The preview likely does something like:

```typescript
const player = new Tone.Player(sample.url).toDestination();
await Tone.loaded();
player.start();
```

**Step 2: Wrap the preview in a try/catch and add a cache check**

Import `notify` at the top of the file if not already imported:
```typescript
import { notify } from '@stores/useNotificationStore';
```

Then wrap the sample preview/load call (wherever `sample.url` is fetched or a `Tone.Player` is created) to handle failures:

```typescript
// Before attempting preview, check if the sample is cached
const isCached = await caches.open('sample-packs-v1')
  .then(cache => cache.match(sample.url))
  .then(r => !!r)
  .catch(() => true); // If Cache API unavailable, assume cached

if (!isCached && localStorage.getItem('samplePacksCached') !== 'v1') {
  notify.warning('Sample packs are still downloading — try again in a moment');
  return;
}
```

Add this check at the start of the preview handler (before `new Tone.Player(...)`), and also at the start of the "Load sample" handler.

**Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

**Step 4: Verify manually**

1. Clear site data to reset cache flag
2. Reload — prefetch starts in background
3. Immediately open the Sample Pack Browser and click a sample preview
4. Confirm a toast appears: "Sample packs are still downloading — try again in a moment"
5. Wait for download to complete (watch status bar)
6. Preview a sample — it should play normally

**Step 5: Commit**

```bash
git add src/components/instruments/SamplePackBrowser.tsx
git commit -m "feat(samples): show toast when previewing uncached sample during download"
```

---

## Manual Verification Checklist

After all tasks complete:

- [ ] First boot: status bar shows `SAMPLES 0/555` then counts up to `SAMPLES 555/555`
- [ ] First boot: no `.wav` files appear in Network tab on initial page load (only fetched during prefetch)
- [ ] Reload after first boot: zero download activity, no status bar progress
- [ ] DevTools → Cache Storage → `sample-packs-v1` contains 555 entries
- [ ] Clearing site data + reload triggers the download again
- [ ] Interrupting mid-download (reload before complete): next boot resumes from where it left off (count starts > 0)
- [ ] Previewing a sample during download shows the warning toast
- [ ] Previewing a sample after download completes plays audio normally
- [ ] App works normally in all other respects (presets, drum pads, user uploads)
