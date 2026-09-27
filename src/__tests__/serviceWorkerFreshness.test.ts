/**
 * The service worker served every app-shell file stale-while-revalidate, so
 * the first load after a deploy (or a local rebuild of an engine) ran the
 * previous build's .wasm: a fixed DefleMask file was refused by the old
 * FurnaceFileOps.wasm with "incomplete file" until a second reload.
 * Files that keep their name across builds now come from the network first;
 * only content-hashed /assets/ files are served from the cache first.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type FetchHandler = (e: { request: { url: string; method: string }; respondWith(p: Promise<Response>): void }) => void;

function loadServiceWorker(network: (url: string, init?: RequestInit) => Promise<Response>) {
  const store = new Map<string, Response>();
  const cache = {
    match: async (req: { url: string }) => store.get(req.url)?.clone(),
    put: async (req: { url: string }, res: Response) => { store.set(req.url, res); },
  };
  let onFetch: FetchHandler | undefined;
  const self = {
    location: { origin: 'https://devilbox.test' },
    addEventListener: (type: string, fn: FetchHandler) => { if (type === 'fetch') onFetch = fn; },
    skipWaiting: () => {},
    clients: { claim: () => {} },
  };
  const caches = { open: async () => cache, keys: async () => [], delete: async () => true };
  const src = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');
  new Function('self', 'caches', 'fetch', src)(self, caches, (req: { url: string }, init?: RequestInit) => network(req.url, init));

  const get = (path: string) => new Promise<string>((done) => {
    onFetch!({
      request: { url: `https://devilbox.test${path}`, method: 'GET' },
      respondWith: (p) => { p.then((r) => r.text()).then(done); },
    });
  });
  return { get, store };
}

describe('the service worker after a deploy', () => {
  it('serves the new build of an engine file, not the cached one', async () => {
    let build = 'old build';
    const sw = loadServiceWorker(async () => new Response(build));
    expect(await sw.get('/furnace-fileops/FurnaceFileOps.wasm')).toBe('old build');
    build = 'new build';
    expect(await sw.get('/furnace-fileops/FurnaceFileOps.wasm')).toBe('new build');
  });

  it('makes the browser revalidate an engine file instead of trusting its HTTP cache', async () => {
    const seen: Array<RequestInit | undefined> = [];
    const sw = loadServiceWorker(async (_url, init) => { seen.push(init); return new Response('engine'); });
    await sw.get('/furnace-fileops/FurnaceFileOps.wasm');
    expect(seen[0]?.cache).toBe('no-cache');
  });

  it('still serves a content-hashed asset from the cache', async () => {
    let calls = 0;
    const sw = loadServiceWorker(async () => { calls++; return new Response('bundle'); });
    await sw.get('/assets/index-DeAdBeEf12.js');
    await sw.get('/assets/index-DeAdBeEf12.js');
    expect(calls).toBe(1);
  });

  it('falls back to the cached engine file offline', async () => {
    let online = true;
    const sw = loadServiceWorker(async () => { if (!online) throw new Error('offline'); return new Response('engine'); });
    await sw.get('/furnace-fileops/FurnaceFileOps.wasm');
    online = false;
    expect(await sw.get('/furnace-fileops/FurnaceFileOps.wasm')).toBe('engine');
  });
});
