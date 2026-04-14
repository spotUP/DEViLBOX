/**
 * Service Worker for DEViLBOX
 *
 * Caching strategy:
 * 1. Sample packs (/data/samples/packs/*) — CACHE-FIRST (existing)
 * 2. App shell (HTML, JS, CSS, WASM, fonts) — STALE-WHILE-REVALIDATE
 *    Serves cached version immediately for offline/fast load, then
 *    updates the cache in the background. Next load gets the fresh version.
 * 3. WAM plugins (mainline.i3s.unice.fr, webaudiomodules.com) — CACHE-FIRST
 *    Once downloaded, WAM plugins never change. Cache-first for instant offline load.
 * 4. API calls, Modland downloads — NETWORK-ONLY (data goes through IndexedDB)
 */

const SAMPLE_CACHE_NAME = 'sample-packs-v1';
const APP_CACHE_NAME = 'app-shell-v1';
const WAM_CACHE_NAME = 'wam-plugins-v1';

// WAM plugin host domains to cache
const WAM_HOSTS = [
  'mainline.i3s.unice.fr',
  'webaudiomodules.com',
  'www.webaudiomodules.com',
];

// App shell file patterns to cache
const APP_SHELL_PATTERNS = [
  /\.(js|css|wasm|html)(\?.*)?$/,
  /\/assets\//,
  /\/(uade|db303|ft2|pt2|furnace|vocoder|sc|chiptune3)\//,  // WASM engines
  /\/fonts\//,
  /\/manifest\.json$/,
];

function isAppShellRequest(url) {
  // Skip API calls and external requests
  if (url.pathname.startsWith('/api/')) return false;
  if (url.origin !== self.location.origin) return false;
  // Match app shell patterns
  return APP_SHELL_PATTERNS.some(p => p.test(url.pathname));
}

function isWAMRequest(url) {
  return WAM_HOSTS.some(host => url.hostname === host || url.hostname.endsWith('.' + host));
}

// Install: activate immediately
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate: claim clients, clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== SAMPLE_CACHE_NAME && name !== APP_CACHE_NAME && name !== WAM_CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Sample packs: cache-first
  if (url.pathname.startsWith('/data/samples/packs/')) {
    event.respondWith(
      caches.open(SAMPLE_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      })
    );
    return;
  }

  // 2. WAM plugins: cache-first (cross-origin, never change once published)
  if (isWAMRequest(url) && event.request.method === 'GET') {
    event.respondWith(
      caches.open(WAM_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        } catch {
          return new Response('WAM plugin unavailable offline', { status: 503 });
        }
      })
    );
    return;
  }

  // 3. App shell: stale-while-revalidate
  if (isAppShellRequest(url) && event.request.method === 'GET') {
    event.respondWith(
      caches.open(APP_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);

        // Fetch in background (update cache for next time)
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => {
          // Network failed — cached version is all we have
          return cached || new Response('Offline', { status: 503 });
        });

        // Return cached immediately if available, otherwise wait for network
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 4. Everything else (API, Modland, etc.): network only
});

// Version check messaging + WAM prefetch
self.addEventListener('message', (event) => {
  if (event.data === 'CHECK_VERSION') {
    checkForUpdates();
  }
  if (event.data?.type === 'PREFETCH_WAMS') {
    prefetchWAMs(event.data.urls);
  }
});

/**
 * Prefetch WAM plugin entry points and cache them.
 * The real caching happens via the fetch interceptor above — when the app
 * loads each WAM plugin, all sub-resources (WASM, worklets, JSON) are
 * automatically cached by the service worker. This pre-warms the entry points.
 */
async function prefetchWAMs(urls) {
  const cache = await caches.open(WAM_CACHE_NAME);
  let cached = 0;
  let failed = 0;

  for (const url of urls) {
    try {
      const existing = await cache.match(url);
      if (existing) { cached++; continue; }
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) {
        await cache.put(url, response);
        cached++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  // Notify clients of completion
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'WAM_PREFETCH_DONE', cached, failed, total: urls.length });
  });
}

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
