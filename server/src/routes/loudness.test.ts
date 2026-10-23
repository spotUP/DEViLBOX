import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  // database.ts opens its file at import: keep it out of the real data directory.
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  process.env.DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'loudness-route-'));
});

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import Database from 'better-sqlite3';
import { createLoudnessTables } from '../db/database';
import { generateToken } from '../middleware/auth';
import { createLoudnessRouter } from './loudness';

const H = 'a'.repeat(32);
const body = (o: object = {}) => ({ lufs: -14, peakDb: -1, method: 'r128', ...o });

describe('/api/loudness/:hash', () => {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  // Same shape as the users table in initDatabase: song_loudness rows belong to a user.
  database.exec('CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, last_login INTEGER)');
  for (const id of ['user-a', 'user-b', 'user-gone']) {
    database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, 0)').run(id, id, 'x');
  }
  createLoudnessTables(database);
  let server: Server;
  let base = '';
  const tokenA = generateToken('user-a');
  const tokenB = generateToken('user-b');

  const put = (hash: string, b: unknown, token?: string) =>
    fetch(`${base}/${hash}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(b),
    });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/loudness', createLoudnessRouter(database));
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/loudness`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('404 for an unknown hash, 400 for a bad hash', async () => {
    expect((await fetch(`${base}/${'0'.repeat(32)}`)).status).toBe(404);
    expect((await fetch(`${base}/xyz`)).status).toBe(400);
    expect((await fetch(`${base}/${'A'.repeat(32)}`)).status).toBe(400);
  });

  it('PUT without a token is 401', async () => {
    expect((await put(H, body())).status).toBe(401);
  });

  it('PUT then GET returns the submission; resubmitting replaces it', async () => {
    const res = await put(H, body({ lufs: -12.5, peakDb: -0.5, durationMs: 1000, analyser: 'selecta-1' }), tokenA);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hash: H, lufs: -12.5, peakDb: -0.5, method: 'r128', count: 1 });
    expect(await (await fetch(`${base}/${H}`)).json()).toEqual({ hash: H, lufs: -12.5, peakDb: -0.5, method: 'r128', count: 1 });
    await put(H, body({ lufs: -13 }), tokenA);
    expect((await (await fetch(`${base}/${H}`)).json()).count).toBe(1);
  });

  it('returns the median across two users', async () => {
    const h = 'b'.repeat(32);
    await put(h, body({ lufs: -20, peakDb: -10 }), tokenA);
    const res = await put(h, body({ lufs: -10, peakDb: -2 }), tokenB);
    expect(await res.json()).toEqual({ hash: h, lufs: -15, peakDb: -6, method: 'r128', count: 2 });
  });

  it('prefers r128 rows over rms, and falls back to rms alone', async () => {
    const h = 'c'.repeat(32);
    await put(h, body({ method: 'rms', lufs: -30 }), tokenA);
    expect((await (await fetch(`${base}/${h}`)).json()).method).toBe('rms');
    await put(h, body({ method: 'r128', lufs: -9 }), tokenB);
    expect(await (await fetch(`${base}/${h}`)).json()).toEqual({ hash: h, lufs: -9, peakDb: -1, method: 'r128', count: 1 });
  });

  it.each([
    ['lufs high', { lufs: 1 }],
    ['lufs low', { lufs: -71 }],
    ['lufs string', { lufs: '-14' }],
    ['peak high', { peakDb: 7 }],
    ['peak low', { peakDb: -121 }],
    ['bad method', { method: 'peak' }],
    ['long analyser', { analyser: 'x'.repeat(65) }],
  ])('rejects %s', async (_n, o) => {
    expect((await put('d'.repeat(32), body(o), tokenA)).status).toBe(400);
    expect((await fetch(`${base}/${'d'.repeat(32)}`)).status).toBe(404);
  });

  it('drops a user\'s submissions when the user is deleted', async () => {
    const h = 'e'.repeat(32);
    expect((await put(h, body({ lufs: -20 }), generateToken('user-gone'))).status).toBe(200);
    database.prepare('DELETE FROM users WHERE id = ?').run('user-gone');
    expect((await fetch(`${base}/${h}`)).status).toBe(404);
  });
});
