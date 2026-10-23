import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  // database.ts opens its file at import: keep it out of the real data directory.
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  process.env.DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-route-'));
});

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import Database from 'better-sqlite3';
import { createLyricsTables } from '../db/database';
import { generateToken } from '../middleware/auth';
import { createLyricsRouter, MAX_LYRICS_BYTES } from './lyrics';

const M = 'd53461365cef8e858993e12b8fcaf1ee';
const LRC = '[ti:Test]\n[00:01.00]First line\n[00:05.50]Zweite Zeile åäö\n';

describe('/api/lyrics/:md5', () => {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  database.exec('CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, last_login INTEGER)');
  database.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, 0)').run('user-a', 'user-a', 'x');
  createLyricsTables(database);
  const token = generateToken('user-a');
  let server: Server;
  let base = '';

  const post = (md5: string, text: string, tok?: string) =>
    fetch(`${base}/${md5}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain; charset=utf-8', ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
      body: text,
    });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/lyrics', createLyricsRouter(database));
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/lyrics`;
  });
  afterAll(() => { server.close(); });

  it('POST then GET round trip returns the raw LRC as text/plain utf-8; a second POST overwrites', async () => {
    expect((await post(M, LRC, token)).status).toBe(204);
    const res = await fetch(`${base}/${M}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe(LRC);
    expect((await post(M, '[00:00.00]Replaced', token)).status).toBe(204);
    expect(await (await fetch(`${base}/${M}`)).text()).toBe('[00:00.00]Replaced');
  });

  it('GET unknown md5 is 404', async () => {
    expect((await fetch(`${base}/${'0'.repeat(32)}`)).status).toBe(404);
  });

  it.each(['abc', 'D53461365CEF8E858993E12B8FCAF1EE', 'g'.repeat(32)])('malformed md5 %s is 400 on GET and POST', async (m) => {
    expect((await fetch(`${base}/${m}`)).status).toBe(400);
    expect((await post(m, LRC, token)).status).toBe(400);
  });

  it('POST without auth or with a bad token is 401 and stores nothing', async () => {
    const m = '1'.repeat(32);
    expect((await post(m, LRC)).status).toBe(401);
    expect([401, 403]).toContain((await post(m, LRC, 'garbage')).status);
    expect((await fetch(`${base}/${m}`)).status).toBe(404);
  });

  it('POST with an empty, blank or oversized body is 400', async () => {
    const m = '2'.repeat(32);
    expect((await post(m, '', token)).status).toBe(400);
    expect((await post(m, '  \n', token)).status).toBe(400);
    expect((await post(m, 'x'.repeat(MAX_LYRICS_BYTES + 1), token)).status).toBe(400);
    expect((await post(m, 'x'.repeat(MAX_LYRICS_BYTES), token)).status).toBe(204);
  });
});
