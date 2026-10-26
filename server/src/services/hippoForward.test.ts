import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  // database.ts opens its file and fileSystem.ts writes user dirs at import/use: keep both in a temp dir.
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hip-forward-'));
  process.env.DB_DIR = path.join(dir, 'db');
  process.env.DATA_ROOT = path.join(dir, 'data');
  process.env.JWT_SECRET = 'forward-test-secret';
  process.env.TRUST_PROXY_HOPS = '1';
  process.env.HIPPO_FORWARD_SECRET = 'fwd-secret';
});

import http from 'http';
import type { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';

interface Seen {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

const USER = { id: 'a'.repeat(32), username: 'forwarded', createdAt: 1700000000000 };
const seen: Seen[] = [];

function startUpstream(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) });
      if (req.url?.startsWith('/api/hip/votes')) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('7 5\n');
      } else if (req.url === '/api/auth/login') {
        const token = jwt.sign({ userId: USER.id }, process.env.JWT_SECRET as string);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token, user: USER }));
      } else if (req.url === '/api/ratings') {
        res.writeHead(418, { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=5', 'RateLimit-Remaining': '3' });
        res.end('{"teapot":true}');
      } else {
        res.writeHead(204);
        res.end();
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

describe('DEViLBOX app forwarding to hippoplayer.se', () => {
  let upstream: http.Server;
  let app: import('express').Express;
  let appServer: http.Server;
  let base = '';

  beforeAll(async () => {
    upstream = await startUpstream();
    process.env.HIPPO_FORWARD_BASE = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    // The real app, imported (not listening): index.ts only starts the server when run as main.
    app = (await import('../index')).app;
    appServer = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    appServer?.close();
    upstream?.close();
  });

  it('passes the upstream vote reply through byte-equal and sends the client IP and secret', async () => {
    seen.length = 0;
    const r = await fetch(`${base}/api/hip/votes?m=0123456789ab`, { headers: { 'X-Forwarded-For': '203.0.113.9' } });
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('7 5\n'); // sentinel only the upstream produces
    expect(r.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('/api/hip/votes?m=0123456789ab');
    expect(seen[0].headers['x-hippo-client-ip']).toBe('203.0.113.9');
    expect(seen[0].headers['x-hippo-forward']).toBe('fwd-secret');
  });

  it('passes status, headers and body of a non-200 reply through', async () => {
    const r = await fetch(`${base}/api/ratings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' });
    expect(r.status).toBe(418);
    expect(await r.text()).toBe('{"teapot":true}');
    expect(r.headers.get('cache-control')).toBe('private, max-age=5');
    expect(r.headers.get('ratelimit-remaining')).toBe('3');
  });

  it('delivers a JSON POST body to the upstream as the exact bytes (JSON parser bypassed)', async () => {
    seen.length = 0;
    const raw = '{ "lrc" :  "[00:01.00]x",\n  "k":1 }';
    const r = await fetch(`${base}/api/songdb/anything`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw });
    expect(r.status).toBe(204);
    expect(seen[0].method).toBe('POST');
    expect(seen[0].body.toString('utf8')).toBe(raw);
    expect(seen[0].headers['content-type']).toBe('application/json');
  });

  it('login writes the shadow row, then a local route that needs the users FK succeeds', async () => {
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER.username, password: 'secret1' }),
    });
    expect(login.status).toBe(200);
    const { token } = (await login.json()) as { token: string };

    const db = (await import('../db/database')).default;
    const row = db.prepare('SELECT username, password_hash, created_at FROM users WHERE id = ?').get(USER.id) as
      | { username: string; password_hash: string; created_at: number }
      | undefined;
    expect(row).toEqual({ username: USER.username, password_hash: '!hippoplayer.se', created_at: USER.createdAt });

    const set = await fetch(`${base}/api/djsets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'shadow set', events: [] }),
    });
    expect(set.status).toBe(200);
    expect(((await set.json()) as { author?: string }).author ?? USER.username).toBe(USER.username);
  });

  it('answers 500 ERR server on hip and 502 JSON elsewhere when the upstream is down', async () => {
    await new Promise<void>((resolve) => {
      upstream.closeAllConnections();
      upstream.close(() => resolve());
    });
    const hip = await fetch(`${base}/api/hip/votes?m=0123456789ab`);
    expect(hip.status).toBe(500);
    expect(await hip.text()).toBe('ERR server\n');
    expect(hip.headers.get('content-type')).toContain('text/plain');
    expect(hip.headers.get('cache-control')).toBe('no-store');
    const other = await fetch(`${base}/api/genre/abc`);
    expect(other.status).toBe(502);
    expect(await other.json()).toEqual({ error: 'Upstream unavailable' });
  });
});
