/**
 * gmSoundFont.ts - the General MIDI SoundFont (GeneralUser GS) for FluidSynth.
 *
 * About 32 MB, so it is fetched lazily by the first FluidSynth host that
 * needs it and kept in the Cache API bucket devilbox-soundfonts-v1. Later
 * loads, in this page or the next session, read it from the cache with no
 * network request. The bytes are not held in memory between loads: each
 * host gets its own copy (the host transfers it to the worklet).
 *
 * Served from the devilbox-presets repo at /data/presets/soundfonts/.
 */

import { useUIStore } from '@/stores/useUIStore';

export const GM_SOUNDFONT_CACHE = 'devilbox-soundfonts-v1';
export const GM_SOUNDFONT_FILE = 'GeneralUser-GS.sf2';

const baseUrl = (): string => import.meta.env.BASE_URL || '/';
export const gmSoundFontUrl = (): string => `${baseUrl()}data/presets/soundfonts/${GM_SOUNDFONT_FILE}`;

function status(msg: string, timeout: number): void {
  useUIStore.getState().setStatusMessage(msg, false, timeout);
}

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches === 'undefined' ? null : await caches.open(GM_SOUNDFONT_CACHE);
  } catch {
    return null;
  }
}

/** Read the body with a progress status; the size comes from Content-Length. */
async function readWithProgress(res: Response): Promise<ArrayBuffer> {
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body?.getReader();
  if (!reader || !total) return res.arrayBuffer();
  const out = new Uint8Array(total);
  let received = 0;
  let lastPercent = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (received + value.length > total) {
      // Content-Length lied (compression): fall back to a growing buffer.
      const chunks: Uint8Array[] = [out.subarray(0, received), value];
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        chunks.push(next.value);
      }
      const size = chunks.reduce((n, c) => n + c.length, 0);
      const all = new Uint8Array(size);
      let at = 0;
      for (const c of chunks) { all.set(c, at); at += c.length; }
      return all.buffer;
    }
    out.set(value, received);
    received += value.length;
    const percent = Math.floor((received / total) * 100);
    if (percent !== lastPercent && percent % 5 === 0) {
      lastPercent = percent;
      status(`Loading General MIDI SoundFont... ${percent}%`, 0);
    }
  }
  return received === total ? out.buffer : out.slice(0, received).buffer;
}

let inFlight: Promise<ArrayBuffer | null> | null = null;
let waiters = 0;

/**
 * The GM SoundFont bytes, from the cache or the network. Null when it cannot
 * be loaded (a status message says why). Concurrent callers share one fetch
 * and each gets its own buffer, since the host transfers it to the worklet.
 */
export function loadGMSoundFont(): Promise<ArrayBuffer | null> {
  if (!inFlight) {
    waiters = 0;
    inFlight = (async () => {
      const url = gmSoundFontUrl();
      const cache = await openCache();
      try {
        const hit = await cache?.match(url);
        if (hit) return await hit.arrayBuffer();
      } catch { /* unreadable entry: fetch again */ }

      status('Loading General MIDI SoundFont...', 0);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bytes = await readWithProgress(res);
        try {
          await cache?.put(url, new Response(bytes.slice(0), {
            headers: { 'content-type': 'application/octet-stream', 'content-length': String(bytes.byteLength) },
          }));
        } catch { /* quota or private mode: next session fetches again */ }
        status('General MIDI SoundFont loaded', 3000);
        return bytes;
      } catch (err) {
        console.warn('[FluidSynth] GM SoundFont load failed:', err);
        status('General MIDI SoundFont failed to load; using the built-in SoundFont', 5000);
        return null;
      }
    })();
    void inFlight.finally(() => { inFlight = null; });
  }
  const first = waiters++ === 0;
  return inFlight.then((bytes) => (bytes && !first ? bytes.slice(0) : bytes));
}
