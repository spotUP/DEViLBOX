/**
 * Service Worker for DEViLBOX
 * Provides better cache control and automatic updates
 */

const CACHE_NAME = 'devilbox-v1';
const SAMPLE_CACHE_NAME = 'sample-packs-v1';
const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== SAMPLE_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - network-first strategy for HTML, cache-first for assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

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

  // Always bypass cache for version.json
  if (url.pathname.includes('version.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
    );
    return;
  }

  // Network-first for HTML files
  if (event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for other assets (JS, CSS, images)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version and update in background
        fetch(event.request).then((response) => {
          if (response.ok && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, response);
            });
          }
        });
        return cachedResponse;
      }

      // Fetch and cache new resources
      return fetch(event.request).then((response) => {
        if (response.ok && response.status === 200 && event.request.method === 'GET') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      });
    })
  );
});

// Periodic version check
let versionCheckTimer;

self.addEventListener('message', (event) => {
  if (event.data === 'CHECK_VERSION') {
    checkForUpdates();
  }
});

async function checkForUpdates() {
  try {
    const response = await fetch('/DEViLBOX/version.json?t=' + Date.now(), {
      cache: 'no-cache'
    });
    const versionInfo = await response.json();

    // Notify all clients about the version
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'VERSION_INFO',
        version: versionInfo
      });
    });
  } catch (error) {
    console.error('[Service Worker] Version check failed:', error);
  }
}
