import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  // database.ts opens its file at import: keep it out of the real data directory.
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  process.env.DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hip-route-'));
});

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import Database from 'better-sqlite3';
import { createHipVoteTables } from '../db/database';
import { createHipVoteService } from '../services/hipVotes';
import { createHipRouter } from './hip';

const K = 'c'.repeat(32);
const M = '0123456789ab';

describe('GET /api/hip/vote and /api/hip/votes', () => {
  const database = new Database(':memory:');
  createHipVoteTables(database);
  const real = createHipVoteService({ db: database });
  const sentinel = vi.fn();
  let server: Server;
  let base = '';

  beforeAll(async () => {
    const app = express();
    app.use('/api/hip', createHipRouter({
      vote: (r) => { sentinel(r.key); return real.vote(r); },
      read: (k, t) => real.read(k, t),
    }));
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/hip`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('votes through the mounted router, reads it back, removes it, never logs the token', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a) => { logs.push(a.join(' ')); });
    const err = vi.spyOn(console, 'error').mockImplementation((...a) => { logs.push(a.join(' ')); });

    const like = await fetch(`${base}/vote?k=${K}&m=${M}&r=5&n=a.mod&p=ProTracker`);
    expect(like.status).toBe(200);
    expect(like.headers.get('content-type')).toContain('text/plain');
    expect(await like.text()).toBe('1 5\n');
    expect(sentinel).toHaveBeenCalledTimes(1);
    expect(sentinel).toHaveBeenCalledWith(M);

    expect(await (await fetch(`${base}/votes?m=${M}&k=${K}`)).text()).toBe('1 5\n');
    expect(await (await fetch(`${base}/votes?m=${M}`)).text()).toBe('1 0\n');
    expect(await (await fetch(`${base}/vote?k=${K}&m=${M}&r=0`)).text()).toBe('0 0\n');
    expect(sentinel).toHaveBeenCalledTimes(2);

    spy.mockRestore();
    err.mockRestore();
    expect(logs.join('\n')).not.toContain(K);
  });

  it.each([
    ['short token', `/vote?k=abc&m=${M}&r=5`],
    ['bad key', `/vote?k=${K}&m=zz&r=5`],
    ['bad rating', `/vote?k=${K}&m=${M}&r=3`],
    ['no rating', `/vote?k=${K}&m=${M}`],
    ['long name', `/vote?k=${K}&m=${M}&r=5&n=${'x'.repeat(256)}`],
    ['votes without key', '/votes'],
    ['votes bad token', `/votes?m=${M}&k=nothex`],
  ])('%s is 400 ERR bad', async (_label, path) => {
    const res = await fetch(base + path);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('ERR bad\n');
  });

  it('answers 429 ERR rate past 60 votes per hour per token', async () => {
    const tok = 'd'.repeat(32);
    let last = 200;
    for (let i = 0; i < 61; i++) last = (await fetch(`${base}/vote?k=${tok}&m=${M}&r=5`)).status;
    expect(last).toBe(429);
    expect(await (await fetch(`${base}/vote?k=${tok}&m=${M}&r=5`)).text()).toBe('ERR rate\n');
  });
});
