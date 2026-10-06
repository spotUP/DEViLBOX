/**
 * eagleCompare.ts - render a module through the generic eagleplayer runner
 * (public/eagleplayer/EaglePlayer.wasm, UADE's score on the Musashi host)
 * headless, and measure it against UADE: the one comparison the format
 * table's `uadeEnvelopeCorrelation`, the render test and the scaffold
 * generator all use.
 *
 * Metric: 100 ms loudness envelope of the MONO sum (UADE's wasm renders with
 * panning 1.0, i.e. mono), Pearson correlation, up to the player's own song
 * end (after it UADE's frontend moves to another subsong - its policy).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import { renderFileToSamples, type Companion } from '../uade-audit/uadeRenderCore';

export type { Companion };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** 100 ms loudness envelope of the mono sum (L + R) of interleaved stereo. */
export function monoEnvelope(stereo: Float32Array, sampleRate: number): number[] {
  const w = Math.round(sampleRate / 10), out: number[] = [];
  for (let k = 0; (k + 1) * w * 2 <= stereo.length; k++) {
    let s = 0;
    for (let i = k * w; i < (k + 1) * w; i++) { const m = stereo[2 * i] + stereo[2 * i + 1]; s += m * m; }
    out.push(Math.sqrt(s / w));
  }
  return out;
}

/** Pearson correlation over the common length. */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; }
  return ab / Math.sqrt(aa * bb);
}

/** Windows to compare: to half a second before our song end, or all. */
export function comparedWindows(seconds: number, songEndAt: number): number {
  return Math.floor((songEndAt > 0 ? Math.min(seconds, songEndAt - 0.5) : seconds) * 10);
}

interface EpModule {
  _malloc(n: number): number; _free(p: number): void;
  _ep_wasm_init(sr: number): void;
  _ep_wasm_add_file(name: number, data: number, len: number): number;
  _ep_wasm_clear_files(): void;
  _ep_wasm_load(pl: number, plLen: number, mod: number, modLen: number, name: number, sub: number, opt: number): number;
  _ep_wasm_render(out: number, frames: number): number;
  _ep_wasm_song_ended(): number;
  _ep_wasm_player_name(): number;
  _ep_wasm_log(): number;
}

let cached: { mod: EpModule; mem: () => WebAssembly.Memory } | null = null;

async function loadEaglePlayer(): Promise<{ mod: EpModule; mem: () => WebAssembly.Memory }> {
  if (cached) return cached;
  const jsPath = join(ROOT, 'public/eagleplayer/EaglePlayer.js');
  const g = globalThis as Record<string, unknown>;
  if (typeof g.self === 'undefined') g.self = globalThis;
  (g.self as Record<string, unknown>).location ??= { href: jsPath };
  if (typeof g.WorkerGlobalScope === 'undefined') g.WorkerGlobalScope = class {};
  runInThisContext(readFileSync(jsPath, 'utf8') + '\nglobalThis.__createEaglePlayer = createEaglePlayer;');
  let memory: WebAssembly.Memory | null = null;
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  const orig = WebAssembly.instantiate;
  (WebAssembly as { instantiate: unknown }).instantiate = async (src: BufferSource, imports: WebAssembly.Imports) => {
    const r = await orig(src, imports);
    const inst = ('instance' in r ? r.instance : r) as WebAssembly.Instance;
    for (const v of Object.values(inst.exports)) if (v instanceof WebAssembly.Memory) memory = v;
    return r;
  };
  try {
    const mod = await (g.__createEaglePlayer as (o: object) => Promise<EpModule>)({
      wasmBinary: readFileSync(join(ROOT, 'public/eagleplayer/EaglePlayer.wasm')), print: () => {}, printErr: () => {},
    });
    cached = { mod, mem: () => memory! };
    return cached;
  } finally {
    Object.defineProperty(process, 'versions', versions);
    WebAssembly.instantiate = orig;
  }
}

export interface EagleRender { samples: Float32Array; songEndAt: number; loadResult: number; player: string; log: string }

/**
 * Render `module` with the eagleplayer binary `player` for `seconds` at 48 kHz.
 * `companions`: the files the player opens beside the module (smp.<tune>,
 * SMPL.<tune>, ...), as the app passes them (companionResolver).
 */
export async function renderEaglePlayer(player: Uint8Array, module: Uint8Array, moduleName: string, seconds: number, companions: Companion[] = []): Promise<EagleRender> {
  const { mod, mem } = await loadEaglePlayer();
  const SR = 48000, CHUNK = 4800;
  const put = (b: Uint8Array) => { const p = mod._malloc(b.length + 1); const u = new Uint8Array(mem().buffer); u.set(b, p); u[p + b.length] = 0; return p; };
  const str = (p: number) => { const u = new Uint8Array(mem().buffer); let s = ''; while (u[p]) s += String.fromCharCode(u[p++]); return s; };
  mod._ep_wasm_init(SR);
  mod._ep_wasm_clear_files();
  for (const c of companions) {
    const np = put(new TextEncoder().encode(c.name)), dp = put(c.data);
    mod._ep_wasm_add_file(np, dp, c.data.length);
    mod._free(np); mod._free(dp);
  }
  const pp = put(player), mp = put(module), np = put(new TextEncoder().encode(moduleName));
  const loadResult = mod._ep_wasm_load(pp, player.length, mp, module.length, np, -1, 0);
  mod._free(pp); mod._free(mp); mod._free(np);
  const frames = SR * seconds, samples = new Float32Array(frames * 2), buf = mod._malloc(CHUNK * 8);
  let songEndAt = -1;
  for (let f = 0; f < frames; f += CHUNK) {
    const n = Math.min(CHUNK, frames - f);
    mod._ep_wasm_render(buf, n);
    samples.set(new Float32Array(mem().buffer, buf, n * 2), f * 2);
    if (songEndAt < 0 && mod._ep_wasm_song_ended()) songEndAt = (f + n) / SR;
  }
  mod._free(buf);
  return { samples, songEndAt, loadResult, player: str(mod._ep_wasm_player_name()), log: str(mod._ep_wasm_log()) };
}

export interface UadeComparison { correlation: number; seconds: number; songEndAt: number; oursRms: number; uadeRms: number; loadResult: number; player: string; log: string }

/** Ours vs UADE for one module (the module name is what both players see). */
export async function compareWithUade(player: Uint8Array, module: Uint8Array, moduleName: string, seconds = 30, companions: Companion[] = []): Promise<UadeComparison> {
  const ours = await renderEaglePlayer(player, module, moduleName, seconds, companions);
  const uade = await renderFileToSamples(module, moduleName, { sampleRate: 48000, seconds, companions });
  const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / Math.max(1, x.length));
  const w = comparedWindows(seconds, ours.songEndAt);
  return {
    correlation: correlation(monoEnvelope(ours.samples, 48000).slice(0, w), monoEnvelope(uade.samples, 48000).slice(0, w)),
    seconds: w / 10, songEndAt: ours.songEndAt, oursRms: rms(ours.samples), uadeRms: rms(uade.samples),
    loadResult: ours.loadResult, player: ours.player, log: ours.log,
  };
}
