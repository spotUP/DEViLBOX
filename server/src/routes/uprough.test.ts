import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import uproughRoutes from './uprough';

// A fake UPROUGH_ROOT whose tools/song_file.py echoes its arguments.
const FAKE = `
import json, sys
a = sys.argv[1:]
if a[0] == "styles":
    print(json.dumps(["golden_era", "trap"]))
elif "--crash" in a:
    sys.exit(3)
else:
    print(json.dumps({"args": a}))
`;

let root: string;
let server: Server;
let base: string;

const post = (body: unknown) =>
  fetch(`${base}/api/uprough/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'uprough-fake-'));
  fs.mkdirSync(path.join(root, 'tools'));
  fs.writeFileSync(path.join(root, 'tools', 'song_file.py'), FAKE);
  const app = express();
  app.use(express.json());
  app.use('/api/uprough', uproughRoutes);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => { process.env.UPROUGH_ROOT = root; });

describe('POST /api/uprough/generate', () => {
  it('passes style, seed and key to song_file.py new and returns its output', async () => {
    const r = await post({ style: 'trap', seed: 7, key: 'Cm' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ args: ['new', '--style', 'trap', '--seed', '7', '--key', 'Cm'] });
  });

  it('omits --key when none is given', async () => {
    const r = await post({ style: 'golden_era', seed: 0 });
    expect(((await r.json()) as { args: string[] }).args).toEqual(['new', '--style', 'golden_era', '--seed', '0']);
  });

  it('503 with a clear message when UPROUGH_ROOT is unset', async () => {
    delete process.env.UPROUGH_ROOT;
    const r = await post({ style: 'trap', seed: 1 });
    expect(r.status).toBe(503);
    expect(((await r.json()) as { error: string }).error).toContain('UPROUGH_ROOT is not set');
  });

  it('503 when UPROUGH_ROOT has no song_file.py', async () => {
    process.env.UPROUGH_ROOT = path.join(root, 'nowhere');
    const r = await post({ style: 'trap', seed: 1 });
    expect(r.status).toBe(503);
    expect(((await r.json()) as { error: string }).error).toContain('song_file.py');
  });

  it('400 for a style the generator does not list', async () => {
    const r = await post({ style: 'polka', seed: 1 });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { styles: string[] }).styles).toEqual(['golden_era', 'trap']);
  });

  it('400 for a non-integer seed or a bad key', async () => {
    expect((await post({ style: 'trap', seed: 'x' })).status).toBe(400);
    expect((await post({ style: 'trap', seed: 1, key: '; rm' })).status).toBe(400);
  });
});

describe('GET /api/uprough/styles', () => {
  it('returns the generator\'s own style list', async () => {
    const r = await fetch(`${base}/api/uprough/styles`);
    expect(await r.json()).toEqual({ styles: ['golden_era', 'trap'] });
  });
});
