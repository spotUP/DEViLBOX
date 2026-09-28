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
 * Native node census: every AudioNode the page creates, by type, and how many
 * are still alive (FinalizationRegistry). Chrome runs its own nodes - filters,
 * convolvers, gains - on the same audio thread as the worklets, and measured
 * 2026-09-28 they were most of its load; the worklet timer cannot see them.
 */
const created = new Map<string, number>();
const alive = new Map<string, number>();
let finalizer: FinalizationRegistry<string> | null = null;

/** The first project source file on the stack: who asked for this node. */
function creator(): string {
  const stack = new Error().stack ?? '';
  for (const line of stack.split('\n').slice(2)) {
    const m = line.match(/\/src\/([^?:)]+)/);
    if (m && !m[1].includes('workletProfiler')) return m[1];
  }
  const tone = stack.includes('/tone') ? 'tone.js' : '?';
  return tone;
}

function countNode(type: string, node: object): void {
  const key = `${type} ${creator()}`;
  created.set(key, (created.get(key) ?? 0) + 1);
  alive.set(key, (alive.get(key) ?? 0) + 1);
  finalizer?.register(node, key);
}

function installNodeCensus(): void {
  if (finalizer || typeof FinalizationRegistry === 'undefined') return;
  finalizer = new FinalizationRegistry((type: string) => alive.set(type, (alive.get(type) ?? 1) - 1));
  const proto = BaseAudioContext.prototype as unknown as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (!key.startsWith('create') || typeof proto[key] !== 'function' || key === 'createBuffer' || key === 'createPeriodicWave') continue;
    const original = proto[key] as (...a: unknown[]) => object;
    const type = key.slice(6);
    proto[key] = function (this: BaseAudioContext, ...args: unknown[]) {
      const node = original.apply(this, args);
      countNode(type, node);
      return node;
    };
  }
  // Nodes made with constructors (new GainNode(ctx), new AudioWorkletNode(...)).
  const g = globalThis as unknown as Record<string, unknown>;
  for (const name of Object.getOwnPropertyNames(globalThis)) {
    if (!name.endsWith('Node') || name === 'AudioNode' || name === 'Node') continue;
    const C = g[name] as { prototype?: unknown } | undefined;
    if (typeof C !== 'function' || !(C.prototype instanceof AudioNode)) continue;
    const Original = C as unknown as new (...a: unknown[]) => object;
    const type = name.replace(/Node$/, '');
    const Wrapped = function (this: unknown, ...args: unknown[]) {
      const node = Reflect.construct(Original, args, new.target ?? Wrapped);
      countNode(type, node);
      return node;
    } as unknown as { prototype: unknown };
    Wrapped.prototype = Original.prototype;
    Object.setPrototypeOf(Wrapped, Original);
    g[name] = Wrapped;
  }
}

/** Nodes created and still alive, by type and creating source file, most alive first. */
export function readNodeCensus(): Array<{ type: string; alive: number; created: number }> {
  return [...created.keys()]
    .map((type) => ({ type, alive: alive.get(type) ?? 0, created: created.get(type) ?? 0 }))
    .sort((a, b) => b.alive - a.alive);
}

/**
 * Load the profiler into the context. Call right after the context exists,
 * before any other audioWorklet.addModule, so every processor is wrapped.
 * No-op without SharedArrayBuffer (page not cross-origin isolated).
 */
export function installWorkletProfiler(ctx: AudioContext): Promise<void> {
  if (installing) return installing;
  installNodeCensus();
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
