/**
 * The mixer's solo and mute reach an MDX song.
 *
 * MdxminiEngine had no mute API, so the mixer's registry never registered
 * it and solo/mute did nothing on an MDX (ledger F25). The wasm now takes a
 * track mask: bits 0-7 gate the YM2151 FM tracks at key-on, bits 8-15 the
 * PCM8 tracks in the mix, in the order the grid shows them.
 *
 * Drives the real bundle (public/mdxmini/Mdxmini.js + .wasm) on a real song
 * from Modland (1943 Kai, FM only - no PDX beside it).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInThisContext } from 'node:vm';

const ROOT = resolve(__dirname, '../../..');
const SONG = resolve(ROOT, 'public/data/songs/mdx/1943kaia.mdx');

interface Mod {
  _malloc(n: number): number; _free(p: number): void;
  _mdxmini_wasm_init(sr: number): void;
  _mdxmini_wasm_load(p: number, n: number): number;
  _mdxmini_wasm_render(out: number, frames: number): number;
  _mdxmini_wasm_set_mute_mask(mask: number): void;
  _mdxmini_wasm_stop(): void;
}
let mod: Mod;
// The bundle exports no heap views (EXPORTED_RUNTIME_METHODS is cwrap,ccall);
// the worklet captures the memory at instantiation, and so does this.
let memory: WebAssembly.Memory | null = null;
const u8 = () => new Uint8Array(memory!.buffer);
const f32 = () => new Float32Array(memory!.buffer);

async function loadBundle(): Promise<Mod> {
  const jsPath = resolve(ROOT, 'public/mdxmini/Mdxmini.js');
  const g = globalThis as Record<string, unknown>;
  if (typeof g.self === 'undefined') g.self = globalThis;
  (g.self as Record<string, unknown>).location ??= { href: jsPath };
  if (typeof g.WorkerGlobalScope === 'undefined') g.WorkerGlobalScope = class {};
  runInThisContext(readFileSync(jsPath, 'utf8') + '\nglobalThis.__createMdxmini = createMdxmini;');
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  const origInstantiate = WebAssembly.instantiate;
  (WebAssembly as { instantiate: unknown }).instantiate = async (src: BufferSource, imports: WebAssembly.Imports) => {
    const result = await origInstantiate(src as BufferSource, imports);
    const inst = ('instance' in result ? result.instance : result) as WebAssembly.Instance;
    if (inst.exports.memory) memory = inst.exports.memory as WebAssembly.Memory;
    return result;
  };
  try {
    return await (g.__createMdxmini as (o: object) => Promise<Mod>)({
      wasmBinary: readFileSync(resolve(ROOT, 'public/mdxmini/Mdxmini.wasm')),
      locateFile: (p: string) => (p.endsWith('.wasm') ? resolve(ROOT, 'public/mdxmini/Mdxmini.wasm') : p),
      print: () => {}, printErr: () => {},
    });
  } finally {
    Object.defineProperty(process, 'versions', versions);
    WebAssembly.instantiate = origInstantiate;
  }
}

function loadSong(): void {
  const bytes = readFileSync(SONG);
  mod._mdxmini_wasm_stop();
  mod._mdxmini_wasm_init(44100);
  const p = mod._malloc(bytes.length); u8().set(bytes, p);
  expect(mod._mdxmini_wasm_load(p, bytes.length)).toBe(0);
  mod._free(p);
}

/** Stereo RMS of `seconds` rendered with `mask`, after a fresh load. */
function rmsWith(mask: number, seconds = 3): number {
  loadSong();
  mod._mdxmini_wasm_set_mute_mask(mask);
  const frames = 1024; const buf = mod._malloc(frames * 8);
  let e = 0, n = 0;
  for (let b = 0; b < Math.ceil(44100 * seconds / frames); b++) {
    mod._mdxmini_wasm_render(buf, frames);
    const f = f32().subarray(buf >> 2, (buf >> 2) + frames * 2);
    for (const v of f) { e += v * v; n++; }
  }
  mod._free(buf);
  return Math.sqrt(e / n);
}

describe('an MDX song under the mixer mask', { timeout: 120000 }, () => {
  beforeAll(async () => { mod = await loadBundle(); });

  it('plays with every track on and goes silent with every track off', () => {
    const all = rmsWith(0xffff);
    const none = rmsWith(0);
    expect(all).toBeGreaterThan(0.005);
    expect(none).toBeLessThan(all / 100);
  });

  it('a solo on one FM track leaves less than the whole song', () => {
    const all = rmsWith(0xffff);
    const first = rmsWith(0x0001);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(all);
  });

  it('the mask outlives a reload', () => {
    loadSong();
    mod._mdxmini_wasm_set_mute_mask(0);
    loadSong();
    const frames = 1024; const buf = mod._malloc(frames * 8);
    let e = 0, n = 0;
    for (let b = 0; b < 60; b++) { mod._mdxmini_wasm_render(buf, frames); const f = f32().subarray(buf >> 2, (buf >> 2) + frames * 2); for (const v of f) { e += v * v; n++; } }
    mod._free(buf);
    expect(Math.sqrt(e / n)).toBeLessThan(0.0005);
    mod._mdxmini_wasm_set_mute_mask(0xffff);
  });

  it('the engine class carries setMuteMask for the mixer registry', async () => {
    const { MdxminiEngine } = await import('../mdxmini/MdxminiEngine');
    expect(typeof MdxminiEngine.prototype.setMuteMask).toBe('function');
    expect(typeof (MdxminiEngine as unknown as { hasInstance?: unknown }).hasInstance).toBe('function');
  });
});
