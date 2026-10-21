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
    open(__file__ + ".styles-calls", "a").write("x")
    print(json.dumps(["golden_era", "trap"]))
elif "--crash" in a:
    sys.exit(3)
elif "--events" in a:
    # R2 stream mode: NDJSON on stdout, one flushed line each. seed 13 dies after the first line, seed 14 before any.
    seed = int(a[a.index("--seed") + 1])
    assert a[a.index("--events") + 1] == "-"
    if seed == 14:
        sys.stderr.write("early boom")
        sys.exit(4)
    print(json.dumps({"seq": 0, "type": "start", "mode": "generate"}), flush=True)
    if seed == 13:
        sys.stdout.write('{"seq": 1, "type": "sec')  # a cut-off line must never reach the client
        sys.stdout.flush()
        sys.exit(5)
    print(json.dumps({"seq": 1, "type": "done", "mode": "generate", "samples": 0, "song": {"args": a}}), flush=True)
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

describe('style list cache', () => {
  const callFile = () => path.join(root, 'tools', 'song_file.py.styles-calls');
  const spawns = () => (fs.existsSync(callFile()) ? fs.readFileSync(callFile(), 'utf8').length : 0);
  const hiphop = () => path.join(root, 'tools', 'hiphop.py');

  it('spawns python once for repeated GET /styles, again after hiphop.py changes, and /generate reuses it', async () => {
    fs.writeFileSync(hiphop(), '# styles');
    fs.rmSync(callFile(), { force: true });
    const [a, b] = await Promise.all([fetch(`${base}/api/uprough/styles`), fetch(`${base}/api/uprough/styles`)]);
    expect(await a.json()).toEqual({ styles: ['golden_era', 'trap'] });
    expect(b.status).toBe(200);
    await fetch(`${base}/api/uprough/styles`);
    expect(spawns()).toBe(1);

    expect((await post({ style: 'trap', seed: 1 })).status).toBe(200);
    expect(spawns()).toBe(1);

    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(hiphop(), later, later);
    await fetch(`${base}/api/uprough/styles`);
    expect(spawns()).toBe(2);
    await fetch(`${base}/api/uprough/styles`);
    expect(spawns()).toBe(2);
    fs.rmSync(hiphop());
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

describe('POST /api/uprough/generate with events (R2c NDJSON stream)', () => {
  const ndjson = async (r: Response) => (await r.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);

  it('streams the host lines as application/x-ndjson and passes --events -', async () => {
    const r = await post({ style: 'trap', seed: 7, events: true });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/x-ndjson');
    const lines = await ndjson(r);
    expect(lines.map((l) => l.type)).toEqual(['start', 'done']);
    expect((lines[1]!.song as { args: string[] }).args).toEqual(['new', '--style', 'trap', '--seed', '7', '--events', '-']);
  });

  it('without events the response is unchanged (no --events argument)', async () => {
    const r = await post({ style: 'trap', seed: 7 });
    expect(((await r.json()) as { args: string[] }).args).not.toContain('--events');
  });

  it('400 when events is not a boolean', async () => {
    const r = await post({ style: 'trap', seed: 7, events: 'yes' });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toContain('events');
  });

  it('a failure after the first line ends the stream with an error line and drops the cut-off line', async () => {
    const r = await post({ style: 'trap', seed: 13, events: true });
    const lines = await ndjson(r);
    expect(lines.map((l) => l.type)).toEqual(['start', 'error']);
    expect(lines[1]!.error).toBeTruthy();
  });

  it('a failure before any line is a plain 500 JSON error', async () => {
    const r = await post({ style: 'trap', seed: 14, events: true });
    expect(r.status).toBe(500);
    const body = (await r.json()) as { error: string; detail?: string };
    expect(body.error).toBeTruthy();
    expect(body.detail).toContain('early boom');
  });
});
