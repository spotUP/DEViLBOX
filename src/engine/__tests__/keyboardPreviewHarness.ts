/**
 * Shared measurement helpers for the "keyboard preview sounds like the song"
 * tests: render a per-note synth worklet (the preview voice) and a song
 * replayer worklet with one voice isolated, and compare what is heard (rising
 * edges per second for pitch, RMS per 50 Hz tick for level and envelope).
 */
import { startWorklet, stereoOutputs, type WorkletProc, type JsTransform } from './workletHarness';

export const SR = 48000;
export const FPT = 960; // frames per 50 Hz tick at 48 kHz

export function risingEdges(x: Float32Array): number {
  let n = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1] <= 0 && x[i] > 0) n++;
  return n;
}
export function rmsPerTick(x: Float32Array, ticks: number): number[] {
  return Array.from({ length: ticks }, (_, t) => {
    let s = 0;
    for (let i = t * FPT; i < (t + 1) * FPT && i < x.length; i++) s += x[i] * x[i];
    return Math.sqrt(s / FPT);
  });
}
export const db = (a: number, b: number) => 20 * Math.log10(a / b);
export const totalRms = (a: number[]) => Math.sqrt(a.reduce((x, y) => x + y * y, 0) / Math.max(1, a.length));

/** Render `ticks` 50 Hz ticks of a started worklet; returns the channel `side` of the stereo output. */
export function renderTicks(proc: WorkletProc, ticks: number, side = 0, skipTicks = 0): Float32Array {
  const frames = Math.ceil(((ticks + skipTicks) * FPT) / 128) * 128;
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f += 128) {
    const o = stereoOutputs(1);
    proc.process([], o);
    out.set(o[0][side], f);
  }
  return out;
}

/** A per-note synth worklet (createPlayer / loadInstrument / noteOn protocol) with one note playing. */
export async function previewVoice(dir: string, stem: string, blob: ArrayBuffer, key: number, velocity = 100, transform?: JsTransform) {
  const { proc, send, posted } = await startWorklet(dir, stem, transform);
  await send({ type: 'createPlayer' });
  const handle = (posted.find((p) => (p as { type?: string }).type === 'playerCreated') as unknown as { handle: number }).handle;
  await send({ type: 'loadInstrument', handle, buffer: blob });
  await send({ type: 'noteOn', handle, note: key, velocity });
  return { proc, send, handle };
}
export async function previewRender(dir: string, stem: string, blob: ArrayBuffer, key: number, ticks: number, velocity = 100, transform?: JsTransform): Promise<Float32Array> {
  const v = await previewVoice(dir, stem, blob, key, velocity, transform);
  return renderTicks(v.proc, ticks, 0);
}

/** First audible sample at or after `from` ticks, then `ticks` ticks from there. */
export function fromOnset(out: Float32Array, fromTick: number, ticks: number, thr = 1e-4): Float32Array {
  let on = Math.max(0, (fromTick - 1) * FPT);
  while (on < out.length && Math.abs(out[on]) < thr) on++;
  return out.subarray(on, on + ticks * FPT);
}

/** The engines' shared "chained HEAP" JS transform (WASMLoaderConfig.transformJS) for node. */
export function chainedHeapTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

/** What a song replayer says one of its voices plays: the audio of the voice from each new pattern row to the next. */
export interface VoiceEvent { startFrame: number; endFrame: number; row: number; note: number }

/** The JS transform the per-note synth engines apply (SidMon, SidMon 1, ...): module-scope WASM and heap views exposed on Module. */
export function exposeHeapTransform(code: string): string {
  return code
    .replace(/import\.meta\.url/g, "'.'")
    .replace(/export\s+default\s+\w+;?/g, '')
    .replace(/var\s+wasmBinary;/, 'var wasmBinary = Module["wasmBinary"];')
    .replace('HEAPU8=new Uint8Array(b);', 'HEAPU8=Module["HEAPU8"]=new Uint8Array(b);')
    .replace('HEAPF32=new Float32Array(b);', 'HEAPF32=Module["HEAPF32"]=new Float32Array(b);');
}

/**
 * Fundamental frequency (Hz) by normalised autocorrelation: the first lag whose
 * correlation is within 90 % of the best, so a wave with many zero crossings
 * (which rising edges over-count) still reads as its pitch.
 */
export function fundamentalHz(x: Float32Array, minHz = 30, maxHz = 4000): number {
  const lo = Math.floor(SR / maxHz), hi = Math.min(Math.floor(SR / minHz), Math.floor(x.length / 2));
  const n = x.length - hi;
  if (n < 64) return 0;
  const r = new Float64Array(hi + 1);
  let e0 = 0;
  for (let i = 0; i < n; i++) e0 += x[i] * x[i];
  if (e0 < 1e-9) return 0;
  let best = -1;
  for (let l = lo; l <= hi; l++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += x[i] * x[i + l];
    r[l] = s / e0;
    if (r[l] > best) best = r[l];
  }
  for (let l = lo + 1; l < hi; l++) if (r[l] >= 0.9 * best && r[l] >= r[l - 1] && r[l] >= r[l + 1]) return SR / l;
  return 0;
}
