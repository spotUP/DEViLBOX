/**
 * A TFM Music Maker (.tfe) song plays through the TFM wasm.
 *
 * `.tfe` was refused with "no replayer yet" (2026-10-05 broken-formats
 * sweep, B8). ZXTune's TFM Music Maker parser + player (GPL-3) is extracted
 * into tfm-wasm/src/tfm_player.cpp and drives two ymfm YM2203 at 3.5 MHz
 * (thoughts/shared/research/2026-10-05_tfm-music-maker-port.md).
 *
 * Drives the real bundle (public/tfm/TFM.js + .wasm) on the corpus song
 * `rainstorm.tfe` (TFM Music Maker 0.5 layout, no signature).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInThisContext } from 'node:vm';

const ROOT = resolve(__dirname, '../../..');
const TFE = resolve(ROOT, 'public/data/songs/tfm-music-maker/rainstorm.tfe');
const SR = 48000;

interface Mod {
  _malloc(n: number): number; _free(p: number): void;
  _tfm_wasm_init(sr: number): void;
  _tfm_wasm_load(p: number, n: number): number;
  _tfm_wasm_render(out: number, frames: number): number;
  _tfm_wasm_set_mute_mask(mask: number): void;
  _tfm_wasm_stop(): void;
  _tfm_wasm_get_position(): number;
}
let mod: Mod;
let memory: WebAssembly.Memory | null = null;
const u8 = () => new Uint8Array(memory!.buffer);
const f32 = () => new Float32Array(memory!.buffer);

async function loadBundle(): Promise<Mod> {
  const jsPath = resolve(ROOT, 'public/tfm/TFM.js');
  const g = globalThis as Record<string, unknown>;
  if (typeof g.self === 'undefined') g.self = globalThis;
  (g.self as Record<string, unknown>).location ??= { href: jsPath };
  if (typeof g.WorkerGlobalScope === 'undefined') g.WorkerGlobalScope = class {};
  runInThisContext(readFileSync(jsPath, 'utf8') + '\nglobalThis.__createTFM = createTFM;');
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  const origInstantiate = WebAssembly.instantiate;
  (WebAssembly as { instantiate: unknown }).instantiate = async (src: BufferSource, imports: WebAssembly.Imports) => {
    const result = await origInstantiate(src as BufferSource, imports);
    const inst = ('instance' in result ? result.instance : result) as WebAssembly.Instance;
    for (const v of Object.values(inst.exports)) if (v instanceof WebAssembly.Memory) memory = v;
    return result;
  };
  try {
    return await (g.__createTFM as (o: object) => Promise<Mod>)({
      wasmBinary: readFileSync(resolve(ROOT, 'public/tfm/TFM.wasm')),
      locateFile: (p: string) => (p.endsWith('.wasm') ? resolve(ROOT, 'public/tfm/TFM.wasm') : p),
      print: () => {}, printErr: () => {},
    });
  } finally {
    Object.defineProperty(process, 'versions', versions);
    WebAssembly.instantiate = origInstantiate;
  }
}

function load(bytes: Uint8Array): number {
  mod._tfm_wasm_init(SR);
  const p = mod._malloc(bytes.length); u8().set(bytes, p);
  const r = mod._tfm_wasm_load(p, bytes.length);
  mod._free(p);
  return r;
}

/** RMS of each `windowSec` window over `seconds` rendered after a fresh load with `mask`. */
function windowsWith(mask: number, seconds = 4, windowSec = 0.5): number[] {
  expect(load(readFileSync(TFE))).toBe(0);
  mod._tfm_wasm_set_mute_mask(mask);
  const frames = 1200; const buf = mod._malloc(frames * 8);
  const perWindow = Math.round(SR * windowSec / frames);
  const out: number[] = [];
  let e = 0, n = 0;
  for (let b = 0; b < Math.ceil(SR * seconds / frames); b++) {
    mod._tfm_wasm_render(buf, frames);
    const f = f32().subarray(buf >> 2, (buf >> 2) + frames * 2);
    for (const v of f) { e += v * v; n++; }
    if ((b + 1) % perWindow === 0) { out.push(Math.sqrt(e / n)); e = 0; n = 0; }
  }
  mod._free(buf);
  return out;
}
const rms = (w: number[]): number => Math.sqrt(w.reduce((s, v) => s + v * v, 0) / w.length);

describe('the TFM wasm plays a TFM Music Maker song', { timeout: 120000 }, () => {
  beforeAll(async () => { mod = await loadBundle(); });

  it('rainstorm.tfe makes sound in its first seconds and moves through the order list', () => {
    const w = windowsWith(0x3f, 4);
    console.log('[tfm] rainstorm RMS per 0.5 s:', w.map((v) => v.toFixed(4)).join(' '));
    expect(w.filter((v) => v > 0.005).length).toBeGreaterThanOrEqual(4);
    expect(rms(w)).toBeGreaterThan(0.01);
  });

  it('the mixer mask silences all six channels and thins one', () => {
    const all = rms(windowsWith(0x3f, 3));
    const none = rms(windowsWith(0, 3));
    const noFirst = rms(windowsWith(0x3e, 3));   // channel 1 (chip 0) muted; it plays from row 0
    console.log('[tfm] all / none / without channel 1:', all.toFixed(4), none.toFixed(6), noFirst.toFixed(4));
    expect(none).toBeLessThan(all / 100);
    expect(noFirst).toBeGreaterThan(0);
    expect(noFirst).toBeLessThan(all * 0.95);
  });

  it('the second chip (channels 4-6) enters at order position 2 and its mask bits reach it', () => {
    // rainstorm's channels 4-6 first key on at frame 384 (7.7 s); 9 s covers it.
    const all = windowsWith(0x3f, 10).slice(16);
    const chip0Only = windowsWith(0x07, 10).slice(16);
    console.log('[tfm] 8-10 s all / chip 0 only:', rms(all).toFixed(4), rms(chip0Only).toFixed(4));
    expect(rms(chip0Only)).toBeLessThan(rms(all) * 0.95);
  });

  it('refuses a file that is not TFM Music Maker', () => {
    expect(load(new Uint8Array(4096).fill(0x11))).toBe(-2);
    mod._tfm_wasm_stop();
  });

  it('the engine class carries setMuteMask for the mixer registry', async () => {
    const { TFMEngine } = await import('../tfm/TFMEngine');
    expect(typeof TFMEngine.prototype.setMuteMask).toBe('function');
    expect(typeof (TFMEngine as unknown as { hasInstance?: unknown }).hasInstance).toBe('function');
  });
});
