import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import AdmZip from 'adm-zip';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

vi.hoisted(() => {
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modland-companions-'));
  fs.mkdirSync(path.join(dir, 'modland-cache', 'files'), { recursive: true });
  process.env.DB_DIR = dir;
});

import db from '../db/database';
import { forceReindex } from '../services/modlandIndexer';
import modlandRoutes from './modland';

const LISTING = [
  '1000\tTFMX/Chris Huelsbeck/mdat.rocknroll',
  '2000\tTFMX/Chris Huelsbeck/smpl.rocknroll',
  '3000\tTFMX/Chris Huelsbeck/mdat.otherscore',
  '4000\tTFMX/Chris Huelsbeck/smpl.otherscore',
].join('\n');

let server: Server;
let base: string;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  const zip = new AdmZip();
  zip.addFile('allmods.txt', Buffer.from(LISTING));
  const body = zip.toBuffer();
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) =>
    String(url).includes('allmods.zip')
      ? new Response(new Uint8Array(body), { status: 200 })
      : realFetch(url as string, init));
  await forceReindex();
  const app = express();
  app.use('/api/modland', modlandRoutes);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/modland`;
}, 60_000);

afterAll(() => { server?.close(); vi.unstubAllGlobals(); });

describe('GET /api/modland/search (reachability: index build -> flag -> query)', () => {
  it('returns the song row and never the smpl.<tune> companion beside it', async () => {
    // Sentinel: the index build ran the companion rule and flagged the sample halves.
    const flagged = db.prepare('SELECT filename FROM modland_files WHERE is_companion = 1 ORDER BY filename').all();
    expect(flagged).toEqual([{ filename: 'smpl.otherscore' }, { filename: 'smpl.rocknroll' }]);

    for (const url of [`${base}/search?q=rocknroll`, `${base}/search?format=TFMX`]) {
      const res = await (await realFetch(url)).json() as { results: Array<{ filename: string }> };
      const names = res.results.map((r) => r.filename);
      expect(names).toContain('mdat.rocknroll');
      expect(names.some((n) => n.startsWith('smpl.'))).toBe(false);
    }
    const all = await (await realFetch(`${base}/search?format=TFMX`)).json() as { results: unknown[] };
    expect(all.results).toHaveLength(2);
  });

  it('keeps the companion reachable through /list (the resolver fetches it from there)', async () => {
    const res = await (await realFetch(`${base}/list?dir=pub/modules/TFMX/Chris Huelsbeck`)).json() as { files: Array<{ filename: string }> };
    expect(res.files.map((x) => x.filename)).toContain('smpl.rocknroll');
  });
});
