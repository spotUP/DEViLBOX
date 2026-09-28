/**
 * Audio-thread profile per worklet processor.
 *
 * The audio thread runs every processor in the context, playing or not, and
 * nothing said which of them costs what: measured 2026-09-28, the thread was
 * ~62 % busy with the song stopped. public/worklets/worklet-profiler.js times
 * each processor's process() into a SharedArrayBuffer; this installs it as
 * the context's first module and reads it back.
 */

const MAX_PROCESSORS = 1024;

let buffer: SharedArrayBuffer | null = null;
let node: AudioWorkletNode | null = null;
let installing: Promise<void> | null = null;

/**
 * Load the profiler into the context. Call right after the context exists,
 * before any other audioWorklet.addModule, so every processor is wrapped.
 * No-op without SharedArrayBuffer (page not cross-origin isolated).
 */
export function installWorkletProfiler(ctx: AudioContext): Promise<void> {
  if (installing) return installing;
  if (typeof SharedArrayBuffer === 'undefined') return Promise.resolve();
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  installing = ctx.audioWorklet.addModule(`${base}worklets/worklet-profiler.js`).then(() => {
    buffer = new SharedArrayBuffer(MAX_PROCESSORS * 2 * Float64Array.BYTES_PER_ELEMENT);
    node = new AudioWorkletNode(ctx, 'dbx-worklet-profiler', { numberOfInputs: 0, numberOfOutputs: 1 });
    node.port.postMessage({ type: 'attach', buffer });
  }).catch(() => { /* profiling is diagnostics only */ });
  return installing;
}

export interface WorkletProfileEntry {
  processor: string;
  /** Milliseconds of audio-thread time per second of wall time, over the window. */
  msPerSecond: number;
  /** process() calls per second over the window. */
  callsPerSecond: number;
}

function names(): Promise<string[]> {
  return new Promise((resolve) => {
    if (!node) { resolve([]); return; }
    const port = node.port;
    const timer = setTimeout(() => resolve([]), 2000);
    port.onmessage = (e) => {
      if (e.data?.type === 'names') { clearTimeout(timer); resolve(e.data.names as string[]); }
    };
    port.postMessage({ type: 'names' });
  });
}

/**
 * Audio-thread time per processor over `windowMs`, most expensive first.
 * Null when the profiler is not installed.
 */
export async function readWorkletProfile(windowMs = 2000): Promise<WorkletProfileEntry[] | null> {
  if (!buffer) return null;
  const view = new Float64Array(buffer);
  const before = Float64Array.from(view);
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, windowMs));
  const seconds = (performance.now() - t0) / 1000;
  const list = await names();
  const out: WorkletProfileEntry[] = [];
  for (let i = 0; i < list.length; i++) {
    const ms = view[i * 2] - before[i * 2];
    const calls = view[i * 2 + 1] - before[i * 2 + 1];
    if (calls === 0) continue;
    out.push({ processor: list[i], msPerSecond: +(ms / seconds).toFixed(1), callsPerSecond: Math.round(calls / seconds) });
  }
  return out.sort((a, b) => b.msPerSecond - a.msPerSecond);
}
