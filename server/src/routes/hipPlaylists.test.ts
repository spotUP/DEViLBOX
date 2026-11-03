import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createHipPlaylistsRouter } from './hipPlaylists';
import { createHippoPlaylistService } from '../services/hippoPlaylists';

describe('GET /api/hip/playlists', () => {
  const real = createHippoPlaylistService();
  const sentinel = vi.fn();
  let server: Server;
  let base = '';

  beforeAll(async () => {
    const app = express();
    app.use('/api/hip/playlists', createHipPlaylistsRouter({ ...real, get: (id) => { sentinel(id); return real.get(id); } }));
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/hip/playlists`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('lists the 74 shipped playlists with summary fields and an ETag', async () => {
    const r = await fetch(`${base}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('etag')).toBeTruthy();
    expect(r.headers.get('cache-control')).toContain('max-age');
    const list = await r.json() as Array<Record<string, unknown>>;
    expect(list).toHaveLength(74);
    expect(Object.keys(list[0]).sort()).toEqual(['id', 'name', 'revision', 'trackCount']);
    expect(list.reduce((n, p) => n + (p.trackCount as number), 0)).toBeGreaterThan(1000);
  });

  it('answers 304 to a matching If-None-Match', async () => {
    const first = await fetch(`${base}`);
    const again = await fetch(`${base}`, { headers: { 'If-None-Match': first.headers.get('etag')! } });
    expect(again.status).toBe(304);
  });

  it('serves one playlist with its tracks, and 404 for an unknown id', async () => {
    const id = 'playlist-prg-anathema-imbasille-3';
    const r = await fetch(`${base}/${id}`);
    const p = await r.json() as { id: string; tracks: Array<{ fileName: string }> };
    expect(p.id).toBe(id);
    expect(p.tracks.length).toBeGreaterThan(2);
    expect(sentinel).toHaveBeenCalledWith(id);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });

  it('?tracks=1 returns every playlist with its tracks', async () => {
    const all = await (await fetch(`${base}?tracks=1`)).json() as Array<{ tracks: unknown[] }>;
    expect(all).toHaveLength(74);
    expect(all.every((p) => Array.isArray(p.tracks))).toBe(true);
  });
});
