import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
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

// A fake tools/synth_song.py: records its args, writes a known WAV, or fails like the 64k tier.
const FAKE_SYNTH = `
import json, os, sys
a = sys.argv[1:]
out = a[a.index("--out-dir") + 1]
if "32 bars" in open(a[a.index("--song-file") + 1]).read():
    sys.stderr.write("noise\\nthe song file has 32 bars; tier 64k holds 16\\n")
    sys.exit(1)
json.dump({"args": a, "cwd": os.getcwd()}, open(os.path.join(os.path.dirname(out), "args.json"), "w"))
open(os.path.join(out, "synth_preview.wav"), "wb").write(b"RIFF\\x00\\x01\\x02WAVEfake")
`;

let root: string;
let server: Server;

/** The fakes use only the standard library, so any python3 on PATH runs them (CI has no python3.11). */
function findPython(): string {
  for (const name of ['python3.11', 'python3']) {
    try {
      execFileSync(name, ['--version'], { stdio: 'ignore' });
      return name;
    } catch { /* not on PATH */ }
  }
  throw new Error('uprough.test.ts needs a python3 on PATH');
}
let base: string;

const post = (body: unknown) =>
  fetch(`${base}/api/uprough/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  process.env.UPROUGH_PYTHON = findPython();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'uprough-fake-'));
  fs.mkdirSync(path.join(root, 'tools'));
  fs.writeFileSync(path.join(root, 'tools', 'song_file.py'), FAKE);
  fs.writeFileSync(path.join(root, 'tools', 'synth_song.py'), FAKE_SYNTH);
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

  it('passes bars to song_file.py new as --bars', async () => {
    const r = await post({ style: 'trap', seed: 1, bars: 16 });
    expect(((await r.json()) as { args: string[] }).args).toEqual(['new', '--style', 'trap', '--seed', '1', '--bars', '16']);
  });

  it('400 for a bars count below 1 or not a whole number', async () => {
    expect((await post({ style: 'trap', seed: 1, bars: 0 })).status).toBe(400);
    expect((await post({ style: 'trap', seed: 1, bars: 2.5 })).status).toBe(400);
    expect((await post({ style: 'trap', seed: 1, bars: '16' })).status).toBe(400);
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

describe('POST /api/uprough/render', () => {
  const render = (body: unknown) =>
    fetch(`${base}/api/uprough/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const renderDirs = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('uprough-render-')).sort();

  it('runs synth_song.py with the maker flags on the posted text and returns its WAV', async () => {
    const before = renderDirs();
    const song = JSON.stringify({ schema: 2, note: 'exact text' }, null, 1);
    const r = await render({ song });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('audio/wav');
    expect(Buffer.from(await r.arrayBuffer())).toEqual(Buffer.from('RIFF\x00\x01\x02WAVEfake', 'latin1'));
    expect(renderDirs()).toEqual(before);
  });

  it('passes the flags and a --song-file whose content is the posted text', async () => {
    // The fake leaves no trace once the temp dir is removed, so make it copy what it saw.
    fs.writeFileSync(path.join(root, 'tools', 'synth_song.py'), FAKE_SYNTH + `
import shutil
shutil.copy(a[a.index("--song-file") + 1], os.path.join(${JSON.stringify(root)}, "seen_song.json"))
json.dump(a, open(os.path.join(${JSON.stringify(root)}, "seen_args.json"), "w"))
`);
    const song = JSON.stringify({ schema: 2, bars: 4 });
    expect((await render({ song })).status).toBe(200);
    const args = JSON.parse(fs.readFileSync(path.join(root, 'seen_args.json'), 'utf8')) as string[];
    const val = (f: string) => args[args.indexOf(f) + 1];
    expect(val('--engine')).toBe('hiphop');
    expect(val('--tier')).toBe('64k');
    expect(val('--acid-source')).toBe('auto');
    expect(val('--prebaked')).toBe('1');
    expect(path.basename(val('--song-file'))).toBe('song.uprough-song.json');
    expect(path.basename(val('--out-dir'))).toBe('out');
    expect(fs.readFileSync(path.join(root, 'seen_song.json'), 'utf8')).toBe(song);
    fs.writeFileSync(path.join(root, 'tools', 'synth_song.py'), FAKE_SYNTH);
  });

  it('400 for text that is not JSON or has no schema field', async () => {
    expect((await render({ song: 'not json' })).status).toBe(400);
    expect((await render({ song: '{"a":1}' })).status).toBe(400);
    expect((await render({})).status).toBe(400);
  });

  it('400 with the synth\'s last stderr line, and removes the temp dir', async () => {
    const before = renderDirs();
    const r = await render({ song: JSON.stringify({ schema: 2, note: '32 bars' }) });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toBe('the song file has 32 bars; tier 64k holds 16');
    expect(renderDirs()).toEqual(before);
  });
});
