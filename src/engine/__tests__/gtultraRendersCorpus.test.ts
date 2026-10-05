/**
 * The GTUltra WASM core plays the corpus's GoatTracker songs.
 *
 * The jukebox marked four Goat Tracker Ultra keys "Silent" (2026-10-02).
 * Headless, the core loads each .sng, starts song 0 and renders audio from
 * the first frames, so a silent browser is the routing around the engine,
 * not the engine (2026-10-05 broken-formats sweep, B1).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadWebBundle, type WebBundle } from '@/test/wasm/webBundle';

const ROOT = process.cwd();
const GT_DIR = join(ROOT, 'public/gtultra');
const SONGS = join(ROOT, 'public/data/songs/Goat Tracker Ultra');

interface GTModule {
  cwrap: (name: string, ret: string | null, args: string[]) => (...a: number[]) => number;
  _malloc: (n: number) => number;
  _free: (p: number) => void;
}

let b: WebBundle<GTModule>;
let api: Record<string, (...a: number[]) => number>;

beforeAll(async () => {
  b = await loadWebBundle<GTModule>(join(GT_DIR, 'GTUltra.js'), join(GT_DIR, 'GTUltra.wasm'), 'createGTUltra');
  const gt = b.module;
  api = {
    init: gt.cwrap('gt_init', null, ['number', 'number']),
    load: gt.cwrap('gt_load_sng', 'number', ['number', 'number']),
    play: gt.cwrap('gt_play', null, ['number', 'number', 'number']),
    stop: gt.cwrap('gt_stop', null, []),
    render: gt.cwrap('gt_render_audio', null, ['number', 'number', 'number']),
  };
  api.init(44100, 0);
}, 60_000);

/** Peak of the first `seconds` of song 0. */
function peakOf(data: Uint8Array, seconds: number): number {
  const gt = b.module;
  const ptr = gt._malloc(data.length);
  b.heap().set(data, ptr);
  const ok = api.load(ptr, data.length);
  gt._free(ptr);
  if (!ok) throw new Error('gt_load_sng refused the file');
  api.stop();
  api.play(0, 0, 0);
  const frames = 128;
  const pL = gt._malloc(frames * 4);
  const pR = gt._malloc(frames * 4);
  let peak = 0;
  for (let done = 0; done < 44100 * seconds; done += frames) {
    api.render(pL, pR, frames);
    const h = new Float32Array(b.heap().buffer, pL, frames);
    for (let i = 0; i < frames; i++) { const a = Math.abs(h[i]); if (a > peak) peak = a; }
  }
  gt._free(pL);
  gt._free(pR);
  api.stop();
  return peak;
}

const files: string[] = [];
for (const author of readdirSync(SONGS)) {
  if (!statSync(join(SONGS, author)).isDirectory()) continue;
  for (const name of readdirSync(join(SONGS, author))) if (/\.sng$/i.test(name)) files.push(join(author, name));
}

describe('GTUltra core', () => {
  it('finds the corpus', () => { expect(files.length).toBeGreaterThanOrEqual(16); });
  for (const rel of files.sort()) {
    it(`${rel} renders audio in its first two seconds`, () => {
      expect(peakOf(new Uint8Array(readFileSync(join(SONGS, rel))), 2)).toBeGreaterThan(0.05);
    }, 30_000);
  }
});
