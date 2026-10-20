// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import fs from 'fs';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import uproughRoutes from '../../../../server/src/routes/uprough';
import { parseSongFile } from '../songFile';
import { readNdjson } from '../generateClient';

// Runs the route against the REAL host generator (tools/song_file.py --events -).
// Set UPROUGH_HOST_ROOT to an Up Rough checkout that has the R2b emitter; skipped otherwise.
const HOST = process.env.UPROUGH_HOST_ROOT;
const present = !!HOST && fs.existsSync(`${HOST}/tools/song_file.py`);

describe.skipIf(!present)('POST /api/uprough/generate events:true against the real host', () => {
  let server: Server;
  let base: string;
  beforeAll(() => {
    process.env.UPROUGH_ROOT = HOST;
    const app = express();
    app.use(express.json());
    app.use('/api/uprough', uproughRoutes);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.close(); });

  it('streams NDJSON incrementally and ends with a done line carrying a parseable song file', async () => {
    const style = (await (await fetch(`${base}/api/uprough/styles`)).json() as { styles: string[] }).styles[0];
    const res = await fetch(`${base}/api/uprough/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ style, seed: 1, events: true }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const t0 = Date.now();
    const lines: { at: number; ev: { type: string; song?: unknown } }[] = [];
    await readNdjson(res.body!, (l) => lines.push({ at: Date.now() - t0, ev: JSON.parse(l) }));
    const kinds: Record<string, number> = {};
    for (const l of lines) kinds[l.ev.type] = (kinds[l.ev.type] ?? 0) + 1;
    console.log('R2C10', JSON.stringify({ n: lines.length, kinds, firstMs: lines[0].at, lastMs: lines.at(-1)!.at }));
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.at(-1)!.at).toBeGreaterThan(lines[0].at);
    const last = lines.at(-1)!.ev;
    expect(last.type).toBe('done');
    expect(last.song).toBeDefined();
    expect(() => parseSongFile(JSON.stringify(last.song))).not.toThrow();
  }, 180_000);
});
