/**
 * The sc68 WASM core plays the corpus's .sc68 / .sndh files.
 *
 * The jukebox marked sc68 "Silent" (`aprentice title.sc68`). Headless, the
 * core takes the file, renders audio from the first frame (peak 0.34), so a
 * silent browser is the routing around the engine, not the engine
 * (2026-10-05 broken-formats sweep, B16). The bundle exports no heap view;
 * the wasm memory is captured at instantiation.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const DIR = join(ROOT, 'public/sc68');
const SONGS = join(ROOT, 'public/data/songs/sc68');

interface Sc68Module {
  _malloc: (n: number) => number;
  _free: (p: number) => void;
  _sc68_wasm_init: (ptr: number, len: number) => number;
  _sc68_wasm_render: (ptr: number, frames: number) => number;
  _sc68_wasm_stop: () => void;
}

let m: Sc68Module;
let memory: WebAssembly.Memory | null = null;

beforeAll(async () => {
  const js = readFileSync(join(DIR, 'Sc68.js'), 'utf8');
  const wasmBinary = readFileSync(join(DIR, 'Sc68.wasm'));
  const original = WebAssembly.instantiate;
  (WebAssembly as unknown as { instantiate: unknown }).instantiate = async (...args: unknown[]) => {
    const result = await (original as (...a: unknown[]) => Promise<unknown>)(...args);
    const inst = (result as { instance?: WebAssembly.Instance }).instance ?? (result as WebAssembly.Instance);
    const exported = (inst as WebAssembly.Instance).exports?.memory;
    if (exported instanceof WebAssembly.Memory) memory = exported;
    return result;
  };
  try {
    const require = createRequire(import.meta.url);
    const factory = new Function('require', '__dirname', '__filename', `${js}\nreturn createSc68;`)(require, DIR, join(DIR, 'Sc68.js'));
    m = await factory({ wasmBinary, print: () => {}, printErr: () => {} });
  } finally {
    (WebAssembly as unknown as { instantiate: unknown }).instantiate = original;
  }
  if (!memory) throw new Error('wasm memory not captured');
}, 60_000);

function peakOf(data: Uint8Array, seconds: number): number {
  const heap = () => new Uint8Array(memory!.buffer);
  const ptr = m._malloc(data.length);
  heap().set(data, ptr);
  const ret = m._sc68_wasm_init(ptr, data.length);
  m._free(ptr);
  if (ret !== 0) throw new Error(`_sc68_wasm_init returned ${ret}`);
  const frames = 1024;
  const buf = m._malloc(frames * 2 * 4);
  let peak = 0;
  for (let done = 0; done < 44100 * seconds;) {
    const got = m._sc68_wasm_render(buf, frames);
    if (got <= 0) break;
    const h = new Float32Array(heap().buffer, buf, got * 2);
    for (let i = 0; i < got * 2; i++) { const a = Math.abs(h[i]); if (a > peak) peak = a; }
    done += got;
  }
  m._free(buf);
  m._sc68_wasm_stop();
  return peak;
}

const files = readdirSync(SONGS).filter((n) => /\.(sc68|sndh)$/i.test(n)).sort();

describe('sc68 core', () => {
  it('finds the corpus', () => { expect(files.length).toBeGreaterThanOrEqual(1); });
  for (const name of files) {
    it(`${name} renders audio in its first two seconds`, () => {
      expect(peakOf(new Uint8Array(readFileSync(join(SONGS, name))), 2)).toBeGreaterThan(0.05);
    }, 30_000);
  }
});
