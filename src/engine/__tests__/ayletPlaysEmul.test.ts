/**
 * A ZXAY EMUL file plays through aylet.
 *
 * `.ay` / `.emul` never produced sound: the TypeScript parser read the song
 * data at the wrong offsets, its Z80 never ran, and the grid was an empty
 * stub (ledger F15). The owner asked for an existing player rather than new
 * emulation code, so aylet 0.5 (GPL-2, third-party/aylet-0.5) is compiled
 * to wasm and fed the whole file: its Z80 runs the tune's own code, its
 * sound.c renders the AY.
 *
 * Drives the real bundle (public/aylet/Aylet.js + .wasm) on the corpus song
 * `spring.emul`, and proves the two sibling payloads are refused, not
 * misplayed: STRC and AMAD are host-side replayer structures no player in
 * reach implements (thoughts/shared/research/2026-10-04_ay-strc-amad.md).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInThisContext } from 'node:vm';

const ROOT = resolve(__dirname, '../../..');
const EMUL = resolve(ROOT, 'public/data/songs/ay-emul/spring.emul');
const STRC = resolve(ROOT, 'public/data/songs/ay-strc/mega mix 1.strc');
const AMAD = resolve(ROOT, 'public/data/songs/ay-amadeus/aztec theme.amad');

interface Mod {
  _malloc(n: number): number; _free(p: number): void;
  _aylet_wasm_init(sr: number): void;
  _aylet_wasm_load(p: number, n: number, track: number): number;
  _aylet_wasm_render(out: number, frames: number): number;
  _aylet_wasm_set_mute_mask(mask: number): void;
  _aylet_wasm_stop(): void;
  _aylet_wasm_get_num_tracks(): number;
  _aylet_wasm_get_track_name(t: number): number;
  UTF8ToString(p: number): string;
}
let mod: Mod;
let memory: WebAssembly.Memory | null = null;
const u8 = () => new Uint8Array(memory!.buffer);
const f32 = () => new Float32Array(memory!.buffer);

async function loadBundle(): Promise<Mod> {
  const jsPath = resolve(ROOT, 'public/aylet/Aylet.js');
  const g = globalThis as Record<string, unknown>;
  if (typeof g.self === 'undefined') g.self = globalThis;
  (g.self as Record<string, unknown>).location ??= { href: jsPath };
  if (typeof g.WorkerGlobalScope === 'undefined') g.WorkerGlobalScope = class {};
  runInThisContext(readFileSync(jsPath, 'utf8') + '\nglobalThis.__createAylet = createAylet;');
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
    return await (g.__createAylet as (o: object) => Promise<Mod>)({
      wasmBinary: readFileSync(resolve(ROOT, 'public/aylet/Aylet.wasm')),
      locateFile: (p: string) => (p.endsWith('.wasm') ? resolve(ROOT, 'public/aylet/Aylet.wasm') : p),
      print: () => {}, printErr: () => {},
    });
  } finally {
    Object.defineProperty(process, 'versions', versions);
    WebAssembly.instantiate = origInstantiate;
  }
}

/** Load `path`; the engine's answer (0 = playing). */
function load(path: string): number {
  const bytes = readFileSync(path);
  mod._aylet_wasm_init(44100);
  const p = mod._malloc(bytes.length); u8().set(bytes, p);
  const r = mod._aylet_wasm_load(p, bytes.length, -1);
  mod._free(p);
  return r;
}

/** Stereo RMS of `seconds` rendered after a fresh load with `mask`. */
function rmsWith(mask: number, seconds = 3): number {
  expect(load(EMUL)).toBe(0);
  mod._aylet_wasm_set_mute_mask(mask);
  const frames = 1024; const buf = mod._malloc(frames * 8);
  let e = 0, n = 0;
  for (let b = 0; b < Math.ceil(44100 * seconds / frames); b++) {
    mod._aylet_wasm_render(buf, frames);
    const f = f32().subarray(buf >> 2, (buf >> 2) + frames * 2);
    for (const v of f) { e += v * v; n++; }
  }
  mod._free(buf);
  return Math.sqrt(e / n);
}

describe('aylet plays a ZXAY EMUL file', { timeout: 120000 }, () => {
  beforeAll(async () => { mod = await loadBundle(); });

  it('spring.emul makes sound, and reports its one song', () => {
    const all = rmsWith(0xffff);
    expect(all).toBeGreaterThan(0.005);
    expect(mod._aylet_wasm_get_num_tracks()).toBe(1);
    expect(mod.UTF8ToString(mod._aylet_wasm_get_track_name(0))).toBe('Spring');
  });

  it('the mixer mask silences all three channels and thins one', () => {
    const all = rmsWith(0x7);
    const none = rmsWith(0);
    const a = rmsWith(0x1);
    expect(none).toBeLessThan(all / 100);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(all);
  });

  it('refuses the STRC and AMAD payloads instead of misplaying them', () => {
    expect(load(STRC)).toBe(-2);
    expect(load(AMAD)).toBe(-2);
    mod._aylet_wasm_stop();
  });

  it('the engine class carries setMuteMask for the mixer registry', async () => {
    const { AyletEngine } = await import('../aylet/AyletEngine');
    expect(typeof AyletEngine.prototype.setMuteMask).toBe('function');
    expect(typeof (AyletEngine as unknown as { hasInstance?: unknown }).hasInstance).toBe('function');
  });
});
