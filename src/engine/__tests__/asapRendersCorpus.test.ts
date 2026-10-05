/**
 * The ASAP core (Atari 8-bit POKEY) plays the corpus's .sap files.
 *
 * The tracker carried "POKEY WASM emulation known silent" with no corpus
 * file to show it. `sap/chop suey.sap` (modland, Adam Billyard) renders
 * from the first frame headless (peak 0.63), so a silent browser is the
 * routing around the engine (2026-10-05 broken-formats sweep, B17).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadWebBundle, type WebBundle } from '@/test/wasm/webBundle';

const ROOT = process.cwd();
const SONGS = join(ROOT, 'public/data/songs/sap');

interface AsapModule {
  _malloc: (n: number) => number;
  _free: (p: number) => void;
  _asap_wasm_init: (sampleRate: number) => void;
  _asap_wasm_load: (ptr: number, len: number, namePtr: number) => number;
  _asap_wasm_play_song: (song: number) => number;
  _asap_wasm_render: (ptr: number, frames: number) => number;
  _asap_wasm_stop: () => void;
}

let b: WebBundle<AsapModule>;
beforeAll(async () => {
  b = await loadWebBundle<AsapModule>(join(ROOT, 'public/asap/Asap.js'), join(ROOT, 'public/asap/Asap.wasm'), 'createAsap');
  b.module._asap_wasm_init(44100);
}, 60_000);

/** Peak of the first `seconds` of song 0; ASAP renders interleaved S16. */
function peakOf(data: Uint8Array, name: string, seconds: number): number {
  const m = b.module;
  // _asap_wasm_stop (below) deletes the ASAP object: every song starts from
  // a fresh init, as the worklet does on load.
  m._asap_wasm_init(44100);
  const ptr = m._malloc(data.length);
  b.heap().set(data, ptr);
  const nameBytes = new TextEncoder().encode(`${name}\0`);
  const namePtr = m._malloc(nameBytes.length);
  b.heap().set(nameBytes, namePtr);
  const loaded = m._asap_wasm_load(ptr, data.length, namePtr);
  m._free(ptr);
  m._free(namePtr);
  if (!loaded) throw new Error('_asap_wasm_load refused the file');
  if (!m._asap_wasm_play_song(0)) throw new Error('_asap_wasm_play_song(0) failed');
  const frames = 1024;
  const buf = m._malloc(frames * 4);
  let peak = 0;
  for (let done = 0; done < 44100 * seconds;) {
    const got = m._asap_wasm_render(buf, frames);
    if (got <= 0) break;
    const h = new Int16Array(b.heap().buffer, buf, got * 2);
    for (let i = 0; i < got * 2; i++) { const a = Math.abs(h[i]) / 32768; if (a > peak) peak = a; }
    done += got;
  }
  m._free(buf);
  m._asap_wasm_stop();
  return peak;
}

const files = readdirSync(SONGS).filter((n) => /\.sap$/i.test(n)).sort();

describe('ASAP core', () => {
  it('finds the corpus', () => { expect(files.length).toBeGreaterThanOrEqual(1); });
  for (const name of files) {
    it(`${name} renders audio in its first two seconds`, () => {
      expect(peakOf(new Uint8Array(readFileSync(join(SONGS, name))), name, 2)).toBeGreaterThan(0.05);
    }, 30_000);
  }
});
