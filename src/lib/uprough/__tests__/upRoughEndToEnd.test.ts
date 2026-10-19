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
 *
 * The route runs in the server's own process (server/, its tsx and express, as
 * `npm run dev` does), not imported here: the server is its own TypeScript
 * project with its own express, and the app type-check must not compile it.
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import type { ChildProcess } from 'child_process';

vi.mock('@engine/ToneEngine', () => {
  const engine: unknown = new Proxy({}, { get: (_t, k) => () => (k === 'preloadInstruments' ? Promise.resolve() : undefined) });
  return { getToneEngine: () => engine, ToneEngine: { getInstance: () => engine } };
});

vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => undefined, classifyInstruments: () => undefined }) },
}));

import * as songFile from '../songFile';
import * as applySongModule from '@/lib/song/applySong';
import { openUpRoughSong } from '@/lib/uprough/openUpRoughSong';
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

// Mounts the real route on the server's express, as server/src/index.ts does.
const SERVE = `
import express from 'express';
import routes from './src/routes/uprough';
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/uprough', routes);
const s = app.listen(0, '127.0.0.1', () => {
  const a = s.address();
  console.log('PORT ' + (a && typeof a === 'object' ? a.port : ''));
});
`;

/** Starts the route in server/ and resolves its port. */
function serve(): Promise<{ proc: ChildProcess; port: number }> {
  const server = path.resolve(__dirname, '../../../../server');
  const proc = spawn(path.join(server, 'node_modules/.bin/tsx'), ['--eval', SERVE],
    { cwd: server, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    let out = '';
    proc.stdout!.setEncoding('utf8').on('data', (c: string) => {
      out += c;
      const m = /PORT (\d+)/.exec(out);
      if (m) resolve({ proc, port: Number(m[1]) });
    });
    proc.stderr!.setEncoding('utf8').on('data', (c: string) => { out += c; });
    proc.on('exit', (code) => reject(new Error(`route server exited ${code}: ${out.slice(-2000)}`)));
  });
}

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

/** Like post, but returns the raw response bytes (the render route sends a WAV). */
function postBytes(port: number, route: string, body: unknown): Promise<{ status: number; bytes: Buffer }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: route, method: 'POST',
      agent: false, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, bytes: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

describe.skipIf(!ROOT)('Up Rough generate -> import -> export renders 1:1 on the host', () => {
  it(`${STYLE}/${SEED}: render of the exported file equals render_track`, async () => {
    const { proc, port } = await serve();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uprough-f4-'));
    try {
      const gen = await post(port, '/api/uprough/generate', { style: STYLE, seed: SEED });
      expect(gen.status, gen.text.slice(0, 2000)).toBe(200);

      const apply = vi.spyOn(applySongModule, 'applySong');
      const serialize = vi.spyOn(songFile, 'songToSongFile');
      await openUpRoughSong(gen.text);
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
      proc.kill();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 900_000);
});

describe.skipIf(!ROOT)('Up Rough server render equals running synth_song.py directly', () => {
  it('16-bar trap/1: the route sends the same WAV bytes as the command line', async () => {
    const { proc, port } = await serve();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uprough-render-parity-'));
    try {
      const gen = await post(port, '/api/uprough/generate', { style: STYLE, seed: SEED, bars: 16 });
      expect(gen.status, gen.text.slice(0, 2000)).toBe(200);
      const file = path.join(dir, `p${songFile.SONG_FILE_EXTENSION}`);
      fs.writeFileSync(file, gen.text);
      const out = path.join(dir, 'direct');
      fs.mkdirSync(out);
      const r = spawnSync(PYTHON, ['tools/synth_song.py', '--out-dir', out, '--engine', 'hiphop', '--tier', '64k',
        '--acid-source', 'auto', '--prebaked', '1', '--song-file', file],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      expect(r.status, (r.stderr || '').slice(-3000)).toBe(0);
      const want = fs.readFileSync(path.join(out, 'synth_preview.wav'));

      const got = await postBytes(port, '/api/uprough/render', { song: gen.text });
      expect(got.status, got.bytes.toString('utf8', 0, 500)).toBe(200);
      expect(got.bytes.equals(want)).toBe(true);
    } finally {
      proc.kill();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 900_000);
});
