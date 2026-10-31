import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import http from 'http';
import type { Server } from 'http';

const cache = new Map<string, Buffer>();
vi.mock('../services/modlandIndexer', () => ({
  getCachedFile: (k: string) => cache.get(k) ?? null,
  cacheFile: (k: string, b: Buffer) => { cache.set(k, b); },
}));

import mirrorRoutes from './mirror';

let server: Server;
let base: string;

/** Raw request: fetch() would collapse literal dot segments before sending. */
function rawStatus(p: string): Promise<number> {
  const { port } = server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: `/api/mirror/${p}` }, (r) => { r.resume(); resolve(r.statusCode ?? 0); }).on('error', reject);
  });
}
const realFetch = globalThis.fetch;
const upstream = vi.fn();

beforeAll(async () => {
  const app = express();
  app.use('/api/mirror', mirrorRoutes);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/mirror`;
});
afterAll(() => { server.close(); });
beforeEach(() => {
  cache.clear();
  upstream.mockReset();
  upstream.mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }));
  // Only upstream calls are faked; calls to the local test server go through.
  globalThis.fetch = ((url: string | URL, init?: RequestInit) =>
    String(url).startsWith('http://127.0.0.1') ? realFetch(url, init) : upstream(String(url))) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

describe('GET /api/mirror/:source/*', () => {
  it('serves a known source body from the right upstream URL', async () => {
    const res = await fetch(`${base}/modland/pub/modules/Protracker/a%20b/x.mod`);
    expect(res.status).toBe(200);
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3, 4]);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream).toHaveBeenCalledWith('https://ftp.modland.com/pub/modules/Protracker/a%20b/x.mod');
  });

  it('maps another source to its root', async () => {
    const res = await fetch(`${base}/aminet/mus/mod/x.lha`);
    expect(res.status).toBe(200);
    expect(upstream).toHaveBeenCalledWith('https://aminet.net/mus/mod/x.lha');
  });

  it('answers a second request from the cache', async () => {
    await fetch(`${base}/asma/Composers/a.sap`);
    await fetch(`${base}/asma/Composers/a.sap`);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('404s an unknown source', async () => {
    expect((await fetch(`${base}/nope/pub/modules/x.mod`)).status).toBe(404);
    expect((await fetch(`${base}/constructor/x`)).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ['dot-dot', 'modland/pub/modules/../../etc/passwd'],
    ['encoded dot-dot', 'modland/pub/modules/%2e%2e/%2e%2e/x'],
    ['encoded slash dot-dot', 'aminet/mus/..%2f..%2fx'],
    ['double-encoded dot-dot', 'aminet/mus/%252e%252e/x'],
    ['absolute path', 'aminet//etc/passwd'],
    ['backslash', 'aminet/mus%5C..%5Cx'],
    ['bad escape', 'aminet/mus/%zz'],
  ])('400s traversal: %s', async (_n, p) => {
    expect(await rawStatus(p)).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('400s a modland path outside pub/modules/', async () => {
    expect((await fetch(`${base}/modland/pub/other/x.mod`)).status).toBe(400);
    expect((await fetch(`${base}/modland/README`)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});
