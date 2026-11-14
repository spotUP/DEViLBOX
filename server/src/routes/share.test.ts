import crypto from 'crypto';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  // database.ts opens its file at import: keep it out of the real data directory.
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  process.env.DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'share-route-'));
});

import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import Database from 'better-sqlite3';
import { createShareTables } from '../db/database';
import { createShareRouter, sweepExpiredShares, SHARE_MAX_BYTES, SHARE_TTL_MS } from './share';

describe('/api/share', () => {
  const database = new Database(':memory:');
  createShareTables(database);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'share-blobs-'));
  let clock = 1_000_000;
  let server: Server;
  let base = '';
  const post = (bytes: Uint8Array) => fetch(base, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: bytes as BodyInit });

  beforeAll(async () => {
    const app = express();
    app.use('/api/share', createShareRouter({ database, dir: () => dir, now: () => clock, perHour: 100 }));
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/share`;
  });
  afterAll(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  it('stores bytes, and returns them unchanged', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const { id } = await (await post(bytes)).json() as { id: string };
    expect(id).toMatch(/^[0-9A-Za-z]{8}$/);
    const got = await fetch(`${base}/${id}`);
    expect(got.status).toBe(200);
    expect(got.headers.get('x-content-type-options')).toBe('nosniff');
    expect([...new Uint8Array(await got.arrayBuffer())]).toEqual([1, 2, 3, 4, 5]);
  });

  it('stores parent_id and only the sha256 of the owner key', async () => {
    const first = await (await post(new Uint8Array([7, 7]))).json() as { id: string; ownerKey: string };
    const res = await fetch(`${base}?parent=${first.id}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: new Uint8Array([7, 8]) as BodyInit });
    const child = await res.json() as { id: string; ownerKey: string };
    expect(child.id).not.toBe(first.id);
    expect(child.ownerKey).not.toBe(first.ownerKey);
    const row = database.prepare('SELECT * FROM share_links WHERE id = ?').get(child.id) as Record<string, unknown>;
    expect(row.parent_id).toBe(first.id);
    expect(row.owner_key_sha256).toBe(crypto.createHash('sha256').update(child.ownerKey).digest('hex'));
    expect(JSON.stringify(Object.values(row))).not.toContain(child.ownerKey);
    expect((database.prepare('SELECT parent_id FROM share_links WHERE id = ?').get(first.id) as { parent_id: unknown }).parent_id).toBeNull();
    // A malformed parent is ignored, not stored.
    const bad = await (await fetch(`${base}?parent=../x`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: new Uint8Array([7, 9]) as BodyInit })).json() as { id: string };
    expect((database.prepare('SELECT parent_id FROM share_links WHERE id = ?').get(bad.id) as { parent_id: unknown }).parent_id).toBeNull();
  });

  it('refuses a body over the cap with 413, and an empty body with 400', async () => {
    expect((await post(new Uint8Array(SHARE_MAX_BYTES + 1))).status).toBe(413);
    expect((await post(new Uint8Array(0))).status).toBe(400);
  });

  it('answers 404 for a bad or unknown id', async () => {
    expect((await fetch(`${base}/..%2Fx`)).status).toBe(404);
    expect((await fetch(`${base}/ZZZZZZZZ`)).status).toBe(404);
  });

  it('expires 5 days after the last open, and an open slides the expiry', async () => {
    const { id } = await (await post(new Uint8Array([9, 9, 9]))).json() as { id: string };
    clock += SHARE_TTL_MS - 1000;
    expect((await fetch(`${base}/${id}`)).status).toBe(200); // slides to clock + 5 days
    clock += SHARE_TTL_MS - 1000;
    expect((await fetch(`${base}/${id}`)).status).toBe(200);
    clock += SHARE_TTL_MS + 1;
    expect((await fetch(`${base}/${id}`)).status).toBe(404);
    expect(sweepExpiredShares({ database, dir: () => dir, now: () => clock })).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(dir, `${id}.bin`))).toBe(false);
  });

  describe('replies', () => {
    const OCT = { 'content-type': 'application/octet-stream' };
    const make = async () => (await (await post(new Uint8Array([1, 1]))).json()) as { id: string; ownerKey: string };
    const reply = (id: string, bytes: number[]) => fetch(`${base}/${id}/replies`, { method: 'POST', headers: OCT, body: new Uint8Array(bytes) as BodyInit });
    const owner = (key: string) => ({ 'x-share-owner-key': key });

    it('stores a reply, lists it for the owner only, returns and dismisses it', async () => {
      const { id, ownerKey } = await make();
      const { id: rid } = await (await reply(id, [4, 5, 6])).json() as { id: string };
      expect((await fetch(`${base}/${id}/replies`)).status).toBe(403);
      expect((await fetch(`${base}/${id}/replies`, { headers: owner('wrong') })).status).toBe(403);
      const list = await (await fetch(`${base}/${id}/replies`, { headers: owner(ownerKey) })).json() as { replies: Array<{ id: string }> };
      expect(list.replies.map((r) => r.id)).toEqual([rid]);
      const got = await fetch(`${base}/${id}/replies/${rid}`, { headers: owner(ownerKey) });
      expect([...new Uint8Array(await got.arrayBuffer())]).toEqual([4, 5, 6]);
      expect((await fetch(`${base}/${id}/replies/${rid}`)).status).toBe(403);
      expect((await fetch(`${base}/${id}/replies/${rid}`, { method: 'DELETE', headers: owner(ownerKey) })).status).toBe(200);
      expect((await fetch(`${base}/${id}/replies/${rid}`, { headers: owner(ownerKey) })).status).toBe(404);
      expect(fs.existsSync(path.join(dir, `r-${rid}.bin`))).toBe(false);
    });

    it('refuses a reply to an unknown share, an empty body and one over the cap', async () => {
      expect((await reply('ZZZZZZZZ', [1])).status).toBe(404);
      const { id } = await make();
      expect((await reply(id, [])).status).toBe(400);
      expect((await fetch(`${base}/${id}/replies`, { method: 'POST', headers: OCT, body: new Uint8Array(SHARE_MAX_BYTES + 1) as BodyInit })).status).toBe(413);
    });

    it('a reply resets the lifetime of the share and its replies, and replies are swept with the share', async () => {
      const { id, ownerKey } = await make();
      const { id: first } = await (await reply(id, [1])).json() as { id: string };
      clock += SHARE_TTL_MS - 1000;
      const { id: second } = await (await reply(id, [2])).json() as { id: string };
      clock += SHARE_TTL_MS - 1000; // past the first reply's original expiry
      const list = await (await fetch(`${base}/${id}/replies`, { headers: owner(ownerKey) })).json() as { replies: Array<{ id: string }> };
      expect(list.replies.map((r) => r.id).sort()).toEqual([first, second].sort());
      clock += SHARE_TTL_MS + 1;
      sweepExpiredShares({ database, dir: () => dir, now: () => clock });
      expect(fs.existsSync(path.join(dir, `r-${first}.bin`))).toBe(false);
      expect(database.prepare('SELECT COUNT(*) AS n FROM share_replies WHERE share_id = ?').get(id)).toEqual({ n: 0 });
    });
  });
});
