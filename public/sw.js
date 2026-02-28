/**
 * Service Worker for DEViLBOX
 * Scope: sample pack audio files only. App assets (JS/CSS/HTML) are never cached
 * here — Vite handles asset versioning; SW caching app chunks causes stale loads.
 */

const SAMPLE_CACHE_NAME = 'sample-packs-v1';

// Install: activate immediately, no asset pre-caching
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate: remove any old app caches left over from the previous SW version
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== SAMPLE_CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for sample packs only; all other requests go straight to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/data/samples/packs/')) {
    event.respondWith(
      caches.open(SAMPLE_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok && response.status === 200) cache.put(event.request, response.clone());
        return response;
      })
    );
  }
  // All other requests (HTML, JS, CSS, WASM, etc.) — network only, no caching
});

// Version check messaging (used by the app to check for updates)
self.addEventListener('message', (event) => {
  if (event.data === 'CHECK_VERSION') {
    checkForUpdates();
  }
});

async function checkForUpdates() {
  try {
    const response = await fetch('/DEViLBOX/version.json?t=' + Date.now(), {
      cache: 'no-cache',
    });
    const versionInfo = await response.json();
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({ type: 'VERSION_INFO', version: versionInfo });
    });
  } catch (error) {
    console.error('[Service Worker] Version check failed:', error);
  }
}
