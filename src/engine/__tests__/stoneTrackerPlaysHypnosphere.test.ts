/**
 * A StoneTracker song (.spm + .sps) plays through the StoneTracker wasm.
 *
 * `.spm` was refused with "no replayer yet" (2026-10-05 broken-formats
 * sweep). stonetracker-wasm runs the authors' StonePlayer_Hard.bin on
 * Musashi's 68020 with a register-level Paula and CIA-B, and depacks the
 * DeltaHuffman sample bank first
 * (thoughts/shared/research/2026-10-05_stonetracker-replayer.md).
 *
 * Drives the real bundle (public/stonetracker/StoneTracker.js + .wasm) on the
 * corpus pair hypnosphere.spm + hypnosphere.sps (Aminet stonefree2's
 * SPM./SPS.Hypnosphere, 8 tracks, packed bank).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInThisContext } from 'node:vm';

const ROOT = resolve(__dirname, '../../..');
const SPM = resolve(ROOT, 'public/data/songs/stonetracker/hypnosphere.spm');
const SPS = resolve(ROOT, 'public/data/songs/stonetracker/hypnosphere.sps');
const SR = 48000;

interface Mod {
  _malloc(n: number): number; _free(p: number): void;
  _st_wasm_init(sr: number): void;
  _st_wasm_load(spm: number, spmLen: number, sps: number, spsLen: number): number;
  _st_wasm_render(out: number, frames: number): number;
  _st_wasm_set_mute_mask(mask: number): void;
  _st_wasm_stop(): void;
  _st_wasm_get_position(): number;
  _st_wasm_get_line(): number;
  _st_wasm_crashed(): number;
}
let mod: Mod;
let memory: WebAssembly.Memory | null = null;
const u8 = () => new Uint8Array(memory!.buffer);
const f32 = () => new Float32Array(memory!.buffer);

async function loadBundle(): Promise<Mod> {
  const jsPath = resolve(ROOT, 'public/stonetracker/StoneTracker.js');
  const g = globalThis as Record<string, unknown>;
  if (typeof g.self === 'undefined') g.self = globalThis;
  (g.self as Record<string, unknown>).location ??= { href: jsPath };
  if (typeof g.WorkerGlobalScope === 'undefined') g.WorkerGlobalScope = class {};
  runInThisContext(readFileSync(jsPath, 'utf8') + '\nglobalThis.__createStoneTracker = createStoneTracker;');
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
    return await (g.__createStoneTracker as (o: object) => Promise<Mod>)({
      wasmBinary: readFileSync(resolve(ROOT, 'public/stonetracker/StoneTracker.wasm')),
      locateFile: (p: string) => (p.endsWith('.wasm') ? resolve(ROOT, 'public/stonetracker/StoneTracker.wasm') : p),
      print: () => {}, printErr: () => {},
    });
  } finally {
    Object.defineProperty(process, 'versions', versions);
    WebAssembly.instantiate = origInstantiate;
  }
}

function load(song: Uint8Array, bank: Uint8Array): number {
  mod._st_wasm_init(SR);
  const a = mod._malloc(song.length); u8().set(song, a);
  const b = mod._malloc(Math.max(1, bank.length)); u8().set(bank, b);
  const r = mod._st_wasm_load(a, song.length, b, bank.length);
  mod._free(a); mod._free(b);
  return r;
}

/** Render `seconds` and return the RMS of each `windowSec` window. */
function render(seconds: number, windowSec = 0.5): number[] {
  const frames = 1200; const buf = mod._malloc(frames * 8);
  const perWindow = Math.round(SR * windowSec / frames);
  const out: number[] = [];
  let e = 0, n = 0;
  for (let b = 0; b < Math.ceil(SR * seconds / frames); b++) {
    mod._st_wasm_render(buf, frames);
    const f = f32().subarray(buf >> 2, (buf >> 2) + frames * 2);
    for (const v of f) { e += v * v; n++; }
    if ((b + 1) % perWindow === 0) { out.push(Math.sqrt(e / n)); e = 0; n = 0; }
  }
  mod._free(buf);
  return out;
}

function windowsWith(mask: number, seconds: number): number[] {
  expect(load(readFileSync(SPM), readFileSync(SPS))).toBe(0);
  mod._st_wasm_set_mute_mask(mask);
  return render(seconds);
}
const rms = (w: number[]): number => Math.sqrt(w.reduce((s, v) => s + v * v, 0) / w.length);

describe('the StoneTracker wasm plays a StoneTracker song', { timeout: 180000 }, () => {
  beforeAll(async () => { mod = await loadBundle(); });

  it('hypnosphere makes sound in its first seconds and its lines advance', () => {
    const w = windowsWith(0xff, 4);
    console.log('[stonetracker] hypnosphere RMS per 0.5 s:', w.map((v) => v.toFixed(4)).join(' '));
    expect(mod._st_wasm_crashed()).toBe(0);
    expect(w.filter((v) => v > 0.005).length).toBeGreaterThanOrEqual(7);
    expect(rms(w)).toBeGreaterThan(0.05);
    // BPM 123, speed 6: 8.2 lines a second - 4 s is past line 30.
    expect(mod._st_wasm_get_position()).toBe(0);
    expect(mod._st_wasm_get_line()).toBeGreaterThan(30);
  });

  it('the mixer mask silences all eight tracks and thins one', () => {
    const all = rms(windowsWith(0xff, 3));
    const none = rms(windowsWith(0x00, 3));
    const noTrack4 = rms(windowsWith(0xf7, 3));   // track 4 plays from line 0 (mixed into Paula 3)
    const noTrack2 = rms(windowsWith(0xfd, 3));   // track 2 enters at line 12 (Paula 1, direct)
    console.log('[stonetracker] all / none / without track 4 / without track 2:',
      all.toFixed(4), none.toFixed(6), noTrack4.toFixed(4), noTrack2.toFixed(4));
    expect(none).toBeLessThan(all / 100);
    expect(noTrack4).toBeGreaterThan(0);
    expect(noTrack4).toBeLessThan(all * 0.9);
    expect(noTrack2).toBeLessThan(all * 0.99);
  });

  it('keeps advancing past the SOFT-interrupt race that froze it at position 13 line 53 (108 s)', () => {
    // Before st_machine.c reordered the player's handler tail ($F3E), a CIA-B
    // tick taken at $F42 lost the SOFT request: the tick never ran again.
    windowsWith(0xff, 112);
    const pos = mod._st_wasm_get_position(), line = mod._st_wasm_get_line();
    console.log('[stonetracker] at 112 s: position', pos, 'line', line);
    expect(pos * 64 + line).toBeGreaterThan(13 * 64 + 53);
    expect(mod._st_wasm_crashed()).toBe(0);
  });

  it('refuses a file that is not an SPM song, and a bank that is not SPS', () => {
    expect(load(new Uint8Array(4096).fill(0x11), readFileSync(SPS))).toBe(-2);
    expect(load(readFileSync(SPM), new Uint8Array(4096).fill(0x11))).toBe(-3);
    mod._st_wasm_stop();
  });

  it('the engine class carries setMuteMask for the mixer registry', async () => {
    const { StoneTrackerEngine } = await import('../stonetracker/StoneTrackerEngine');
    expect(typeof StoneTrackerEngine.prototype.setMuteMask).toBe('function');
    expect(typeof (StoneTrackerEngine as unknown as { hasInstance?: unknown }).hasInstance).toBe('function');
  });
});
