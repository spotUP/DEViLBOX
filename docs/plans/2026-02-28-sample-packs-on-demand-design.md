---
date: 2026-02-28
topic: sample-packs-on-demand
tags: [samples, service-worker, cache-api, performance]
status: final
---

# Sample Packs On-Demand Download — Design

## Goal

Move the 73 MB factory sample pack library out of the initial app bundle. On first run, download all sample files in the background while the app is already usable. Cache them in the browser's Cache API via a Service Worker. Subsequent launches serve entirely from cache.

## Architecture

**Cache API + Service Worker (Option A).**

The Service Worker intercepts every request matching `/data/samples/packs/**`. Once the cache is populated, all sample requests are served offline-first from the SW cache. No URLs change anywhere in the app — `SamplePackBrowser`, presets, instrument configs, drum pad kits all keep their existing paths.

## Data Flow

1. App boots → checks `localStorage` for `samplePacksCached: 'v1'`
2. If not set → `SamplePackPrefetcher` starts in the background
3. Prefetcher fetches `GET /api/sample-pack-manifest` → JSON array of all sample file paths (551 files across 5 packs)
4. Files are fetched sequentially in small batches (e.g. 4 concurrent) and stored via `caches.open('sample-packs-v1').put()`
5. Progress (`completed / total`) is reported to the status indicator store: `Downloading sample packs… 47 / 551`
6. On completion → `localStorage.samplePacksCached = 'v1'` set, status cleared
7. **Service Worker** — cache-first for `/data/samples/packs/**`:
   - Cache hit → return cached response
   - Cache miss (pack not yet downloaded) → pass through to network AND trigger a toast notification: *"Sample packs are still downloading — try again in a moment"*
8. On subsequent boots with `samplePacksCached = 'v1'` set → skip prefetch entirely

## Components

### Server

| File | Change |
|------|--------|
| `server/index.ts` (or `server/routes/`) | Add `GET /api/sample-pack-manifest` — returns `{ version: 'v1', files: string[] }` with all 551 sample file paths |

The server already serves static files from `public/`. The sample files stay in `public/data/samples/packs/` — no file moves required.

### Service Worker

| File | Change |
|------|--------|
| `public/sw.js` | New file. Registers cache `sample-packs-v1`. On `fetch` event: if URL matches `/data/samples/packs/**` and is in cache → return cached response. On cache miss → fetch from network, cache the response, return it. On `install` → skip waiting. On `activate` → claim clients, delete old cache versions. |
| `src/main.tsx` or `src/App.tsx` | Register `sw.js` on app mount (`navigator.serviceWorker.register('/sw.js')`) |
| `vite.config.ts` | Ensure `sw.js` is not processed by Vite (add to `publicDir` exclusions or mark as entry point if using vite-plugin-pwa) |

### Prefetcher

| File | Change |
|------|--------|
| `src/lib/SamplePackPrefetcher.ts` | New file. Exports `runPrefetchIfNeeded()`. Checks `localStorage.samplePacksCached`. If needed: fetches manifest, batch-fetches all files into `caches.open('sample-packs-v1')`, reports progress via callback. Sets flag on completion. |

### App Integration

| File | Change |
|------|--------|
| `src/App.tsx` | On mount: register SW, then call `runPrefetchIfNeeded(progress => setDownloadProgress(progress))` |
| Status indicator store | Add optional `downloadProgress: { current: number; total: number } \| null` field. Displayed as `Downloading sample packs… 47 / 551` in the status bar. Cleared when null. |

### Sample Browser

| File | Change |
|------|--------|
| `src/components/instruments/SamplePackBrowser.tsx` | On sample preview or load: if fetch returns non-200 or cache miss event → show toast: *"Sample packs are still downloading — try again in a moment"* |

## Cache Versioning

Cache name: `sample-packs-v1`. If sample files change in a future release:
- Bump to `sample-packs-v2`
- Service worker `activate` handler deletes old cache versions
- `localStorage` key changes to `samplePacksCached: 'v2'` → triggers re-download

## Error Handling

- Individual file fetch failures: retry once, then log and skip (don't block progress)
- Manifest fetch failure: show status bar error, retry after 30s
- User navigates away mid-download: progress is not persisted; next boot re-starts from 0 (Cache API `put` is atomic per file, so already-cached files are skipped on re-check)

## What Does NOT Change

- All sample URLs (`/data/samples/packs/{packId}/{category}/{file}`)
- `constants/samplePacks.ts` — factory pack registry unchanged
- `SamplePackBrowser` — aside from the cache-miss toast
- Preset files, instrument configs, drum pad kits
- User-uploaded pack flow (blob URLs, JSZip)

## Success Criteria

- App initial load does NOT download sample files (network tab shows no `.wav` requests on boot)
- After first run, sample browser works offline
- Status bar shows live progress during first-run download
- If user previews a sample before download completes, a toast appears
- Subsequent app launches show no download activity
