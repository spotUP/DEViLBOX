/**
 * Test rig for the WASM subtractive synths: runs an engine's real worklet and WASM in Node (workletHarness), turns the
 * voice watch on, and renders block by block, collecting the audio and each voice report with the time it arrived.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, inlineWorkletImports, startWorklet, stereoOutputs, type WorkletMsg, type WorkletProc } from '@/engine/__tests__/workletHarness';
import { decodeVoices, type WasmVoice } from '@/engine/voiceStatus/wasmVoiceStatus';

export const SAMPLE_RATE = 48000;
export const BLOCK = 128;

/** The Synth classes patch the Emscripten loader text before handing it to the worklet; this does the same two edits. */
export const emscriptenTransform = (code: string): string =>
  code.replace(/import\.meta\.url/g, '""').replace(/export\s+default\s+\w+;?\s*$/, '');

export interface VoiceSample { t: number; voices: WasmVoice[] }

export interface Rig {
  proc: WorkletProc;
  send: (m: unknown) => Promise<void>;
  posted: WorkletMsg[];
  /** Render `seconds`; `at(t)` runs before each block (to send note messages). Returns the mono samples and the voice reports. */
  render: (seconds: number, at?: (t: number) => Promise<void> | void) => Promise<{ audio: Float32Array; reports: VoiceSample[] }>;
}

/** Render loop shared by the rigs: block by block, collecting audio and voice reports. */
function rigFrom(proc: WorkletProc, send: (m: unknown) => Promise<void>, posted: WorkletMsg[]): Rig {
  let now = 0;
  const out = stereoOutputs(1);
  return {
    proc, send, posted,
    render: async (seconds, at) => {
      const blocks = Math.ceil((seconds * SAMPLE_RATE) / BLOCK);
      const audio = new Float32Array(blocks * BLOCK);
      const reports: VoiceSample[] = [];
      for (let b = 0; b < blocks; b++) {
        if (at) await at(now);
        proc.process([], out);
        audio.set(out[0][0], b * BLOCK);
        now += BLOCK / SAMPLE_RATE;
        while (posted.length > 0) {
          const m = posted.shift()!;
          if (m.type === 'voiceStatus') {
            const msg = m as unknown as { voices: Float32Array; stride?: number };
            reports.push({ t: now, voices: decodeVoices(msg.voices, msg.stride) });
          }
        }
      }
      return { audio, reports };
    },
  };
}

/** Level of the Goertzel bin at `hz` over `x` (Hann windowed), linear amplitude. */
export function toneLevel(x: Float32Array, hz: number, fs = SAMPLE_RATE): number {
  let re = 0, im = 0;
  const n = x.length;
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    const ph = (2 * Math.PI * hz * i) / fs;
    re += x[i] * w * Math.cos(ph);
    im -= x[i] * w * Math.sin(ph);
  }
  return (2 * Math.hypot(re, im)) / (n * 0.5);
}

export const db = (x: number): number => 20 * Math.log10(Math.max(1e-12, x));
export const relErr = (measured: number, modelled: number): number => Math.abs(measured - modelled) / Math.max(1e-9, Math.abs(measured));

export async function makeRig(
  dir: string, stem: string, options: { wasmStem?: string; transform?: (code: string) => string } = {},
): Promise<Rig> {
  const { proc, send, posted } = await startWorklet(dir, stem, options.transform ?? emscriptenTransform, options.wasmStem ?? stem);
  return rigFrom(proc, send, posted);
}

/**
 * For worklets that load their WASM through their own message (not the harness's `init` shape): the processor is built
 * in the same minimal AudioWorkletGlobalScope, `init` is sent by the caller's `start`, and messages go to port.onmessage.
 */
export async function makeCustomRig(
  workletFile: string,
  start: (deliver: (m: unknown) => void) => Promise<void> | void,
  ready: (posted: WorkletMsg[]) => boolean,
  delivery: 'port' | 'handleMessage' = 'port',
): Promise<Rig> {
  let Processor!: new () => WorkletProc;
  const posted: WorkletMsg[] = [];
  const port = { postMessage: (m: WorkletMsg) => posted.push(m), onmessage: null as ((e: { data: unknown }) => void) | null };
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = port; },
    registerProcessor: (_n: string, cls: new () => WorkletProc) => { Processor = cls; },
    sampleRate: SAMPLE_RATE, currentTime: 0,
  };
  new Function(...Object.keys(scope), inlineWorkletImports(readFileSync(resolve(ROOT, workletFile), 'utf8'), workletFile.split('/')[1]))(...Object.values(scope));
  const proc = new Processor();
  const send = async (m: unknown): Promise<void> => {
    if (delivery === 'handleMessage') await (proc.handleMessage as (d: unknown) => Promise<void>).call(proc, m);
    else port.onmessage?.({ data: m });
  };
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  try {
    await start((m) => { void send(m); });
    for (let i = 0; i < 400 && !ready(posted); i++) await new Promise((r) => setTimeout(r, 10));
  } finally { Object.defineProperty(process, 'versions', versions); }
  if (!ready(posted)) throw new Error(`${workletFile}: not ready (${JSON.stringify(posted.slice(0, 3))})`);
  return rigFrom(proc, send, posted);
}

/** In-place radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
}

/** Welch power spectrum (Hann, 50 % overlap) of a noise-like signal, then the mean power in each band [c / ratio, c * ratio], in dB. */
export function bandPowersDb(x: Float32Array, centres: readonly number[], ratio = 1.15, size = 4096, fs = SAMPLE_RATE): number[] {
  const power = new Float64Array(size / 2);
  let frames = 0;
  for (let at = 0; at + size <= x.length; at += size / 2) {
    const re = new Float64Array(size), im = new Float64Array(size);
    for (let i = 0; i < size; i++) re[i] = x[at + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
    fft(re, im);
    for (let k = 0; k < size / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  return centres.map((c) => {
    const lo = Math.max(1, Math.floor((c / ratio / fs) * size)), hi = Math.min(size / 2 - 1, Math.ceil(((c * ratio) / fs) * size));
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += power[k];
    return 10 * Math.log10(Math.max(1e-30, sum / ((hi - lo + 1) * Math.max(1, frames))));
  });
}
