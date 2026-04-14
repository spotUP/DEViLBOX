/**
 * WAMPrefetch — Auto-prefetch all WAM plugins at startup.
 *
 * Called from main.tsx after service worker registration.
 * Uses fetch() (NOT import()) to cache WAM entry points without executing them.
 * This is critical — import() registers AudioWorklet processors, and some WAM
 * plugins (BigMuff, TS9, StonePhaser) can't handle re-registration when the
 * actual effect is created later, causing them to fail entirely.
 *
 * The service worker intercepts all requests to WAM hosts (i3s.unice.fr) and
 * caches responses automatically. Sub-resources (worklets, WASM) are cached
 * on first use of each effect. Entry points are cached here upfront.
 */

import { WAM_SYNTH_PLUGINS } from '@/constants/wamPlugins';
import { useUIStore } from '@/stores/useUIStore';

const WAM_CACHE = 'wam-plugins-v1';

/** Check how many WAM entry points are already in the service worker cache. */
async function countCached(): Promise<number> {
  try {
    const cache = await caches.open(WAM_CACHE);
    let n = 0;
    for (const p of WAM_SYNTH_PLUGINS) {
      if (await cache.match(p.url)) n++;
    }
    return n;
  } catch {
    return 0;
  }
}

function status(msg: string, timeout = 3000): void {
  useUIStore.getState().setStatusMessage(msg, false, timeout);
}

/**
 * Prefetch all registered WAM plugins in the background.
 * Skips entirely if everything is already cached.
 */
export async function prefetchWAMPlugins(): Promise<void> {
  const plugins = WAM_SYNTH_PLUGINS;
  const total = plugins.length;

  // Fast path: all already cached — no network needed
  const alreadyCached = await countCached();
  if (alreadyCached >= total) {
    console.log(`[WAMPrefetch] All ${total} WAM plugins already cached`);
    status(`WAM plugins cached (${total}/${total}) — offline ready`, 4000);
    return;
  }

  status(`Caching WAM plugins (${alreadyCached}/${total})...`, 0);

  // Tell service worker to fetch and cache entry point URLs.
  // The SW also caches all sub-resources (worklets, WASM) on first use
  // via its cache-first interceptor for WAM host domains.
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'PREFETCH_WAMS',
      urls: plugins.map(p => p.url),
    });
  }

  // Also fetch entry points directly to ensure they're cached even if
  // the SW message doesn't arrive (e.g. SW not yet controlling the page).
  // Using fetch() instead of import() avoids executing the modules, which
  // would register AudioWorklet processors and break later WAM loading.
  let cached = 0;
  let failed = 0;

  for (const plugin of plugins) {
    try {
      const resp = await fetch(plugin.url, { mode: 'cors' });
      if (resp.ok) {
        // Put in cache manually in case SW hasn't intercepted
        try {
          const cache = await caches.open(WAM_CACHE);
          await cache.put(plugin.url, resp);
        } catch { /* Cache API not available */ }
        cached++;
      } else {
        failed++;
      }
      status(`Caching WAM plugins (${alreadyCached + cached}/${total})...`, 0);
    } catch {
      failed++;
    }
  }

  if (failed > 0) {
    console.warn(`[WAMPrefetch] ${cached}/${total} cached, ${failed} failed`);
    status(`WAM plugins: ${alreadyCached + cached}/${total} cached, ${failed} failed`, 5000);
  } else {
    console.log(`[WAMPrefetch] All ${total} WAM plugins cached`);
    status(`WAM plugins cached (${total}/${total}) — offline ready`, 4000);
  }
}
