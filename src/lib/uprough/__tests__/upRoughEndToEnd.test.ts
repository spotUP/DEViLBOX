/**
 * F4 (Up Rough plan 2026-10-19-softsynth-devilbox-port): generate -> import ->
 * export must give a file the Up Rough host renders to the same bytes as its
 * own render_track(style, seed). This is the owner's 1:1 rule end to end: the
 * real server route runs the host generator, the tracker store imports and
 * exports the song, and the host renders the exported file.
 *
 * Needs the Up Rough checkout (UPROUGH_ROOT) and python3.11 with its deps, so
 * it is skipped when UPROUGH_ROOT is not set. Run it with:
 *   UPROUGH_ROOT=~/Code/UpRough/Up_Rough_Demo_System npx vitest run src/lib/uprough/__tests__/upRoughEndToEnd.test.ts
 * Sentinels: applySong ran once as an import, songToSongFile ran once, and the
 * host check prints "F4 OK" only after comparing the renders.
 */
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import type { AddressInfo } from 'net';

vi.mock('@engine/ToneEngine', () => {
  const engine: unknown = new Proxy({}, { get: (_t, k) => () => (k === 'preloadInstruments' ? Promise.resolve() : undefined) });
  return { getToneEngine: () => engine, ToneEngine: { getInstance: () => engine } };
});

vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => undefined, classifyInstruments: () => undefined }) },
}));

import uproughRoutes from '../../../../server/src/routes/uprough';
import * as songFile from '../songFile';
import * as applySongModule from '@/lib/song/applySong';
import { useTrackerStore } from '@stores/useTrackerStore';

const ROOT = process.env.UPROUGH_ROOT;
const PYTHON = process.env.UPROUGH_PYTHON || 'python3.11';
const STYLE = 'trap';
const SEED = 1;

// Renders the exported file and the host's own song; exits non-zero on a mismatch.
const CHECK = `
import sys
sys.path.insert(0, "tools")
import numpy as np
import hiphop as hh
import song_file as sf
got = sf.render_doc(sf.load(sys.argv[1]))
want = hh.render_track(sys.argv[2], seed=int(sys.argv[3]))
assert got.shape == want.shape, (got.shape, want.shape)
assert np.array_equal(got, want), "render differs"
print("F4 OK %d samples" % len(got))
`;

/** POST through node's http: the test DOM's fetch applies browser CORS rules. */
function post(port: number, route: string, body: unknown): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: route, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

describe.skipIf(!ROOT)('Up Rough generate -> import -> export renders 1:1 on the host', () => {
  it(`${STYLE}/${SEED}: render of the exported file equals render_track`, async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/uprough', uproughRoutes);
    const server = app.listen(0);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uprough-f4-'));
    try {
      const port = (server.address() as AddressInfo).port;
      const gen = await post(port, '/api/uprough/generate', { style: STYLE, seed: SEED });
      expect(gen.status, gen.text.slice(0, 2000)).toBe(200);

      const apply = vi.spyOn(applySongModule, 'applySong');
      const serialize = vi.spyOn(songFile, 'songToSongFile');
      await useTrackerStore.getState().importUpRoughSong(gen.text);
      expect(apply).toHaveBeenCalledTimes(1);
      expect(apply.mock.calls[0]![1]).toBe('import');
      const exported = useTrackerStore.getState().exportUpRoughSong();
      expect(serialize).toHaveBeenCalledTimes(1);

      const file = path.join(dir, `f4${songFile.SONG_FILE_EXTENSION}`);
      fs.writeFileSync(file, exported);
      const r = spawnSync(PYTHON, ['-c', CHECK, file, STYLE, String(SEED)],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      expect(r.status, (r.stderr || '').slice(-3000)).toBe(0);
      expect(r.stdout).toMatch(/^F4 OK \d+ samples/m);
    } finally {
      server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 900_000);
});
