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
/** Per processor: [processMs, processCalls, worstProcessMs, messageMs, messageCalls, worstMessageMs]. */
const SLOTS = 6;

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
  if (stack.includes('/tone')) return 'tone.js';
  // A built bundle has no source paths: name the first app frame by its asset
  // and position, which the build's source maps (or the bundle) resolve.
  // Frames: Error, creator, countNode, the create/constructor wrapper, then the caller.
  for (const line of stack.split('\n').slice(4)) {
    const m = line.match(/\/assets\/([^/?:)]+):(\d+):(\d+)/);
    if (m && !line.includes('workletProfiler')) return `${m[1]}:${m[3]}`;
  }
  return '?';
}

/** Who made each live node, and its edges: enough to say what keeps a part of the graph running. */
const nodeKey = new WeakMap<object, string>();
const nodeRefs = new Set<WeakRef<AudioNode>>();
const outEdges = new WeakMap<AudioNode, Set<AudioNode>>();
const inEdges = new WeakMap<AudioNode, Set<AudioNode>>();

function countNode(type: string, node: object): void {
  const key = `${type} ${creator()}`;
  nodeKey.set(node, key);
  if (typeof WeakRef !== 'undefined' && node instanceof AudioNode) nodeRefs.add(new WeakRef(node));
  created.set(key, (created.get(key) ?? 0) + 1);
  alive.set(key, (alive.get(key) ?? 0) + 1);
  finalizer?.register(node, key);
}

function edgeSet(map: WeakMap<AudioNode, Set<AudioNode>>, n: AudioNode): Set<AudioNode> {
  let set = map.get(n);
  if (!set) { set = new Set(); map.set(n, set); }
  return set;
}

/** Record node-to-node edges (AudioParam targets are not tracked). */
function installEdgeCensus(): void {
  const proto = AudioNode.prototype as unknown as Record<string, unknown>;
  const connect = proto.connect as (this: AudioNode, ...a: unknown[]) => unknown;
  const disconnect = proto.disconnect as (this: AudioNode, ...a: unknown[]) => unknown;
  proto.connect = function (this: AudioNode, ...args: unknown[]) {
    const r = connect.apply(this, args);
    const dst = args[0];
    if (dst instanceof AudioNode) { edgeSet(outEdges, this).add(dst); edgeSet(inEdges, dst).add(this); }
    return r;
  };
  proto.disconnect = function (this: AudioNode, ...args: unknown[]) {
    const r = disconnect.apply(this, args);
    const dst = args[0];
    const outs = outEdges.get(this);
    if (dst instanceof AudioNode) {
      // A connection with output/input indices may remain; good enough for a census.
      outs?.delete(dst); inEdges.get(dst)?.delete(this);
    } else if (dst === undefined || typeof dst === 'number') {
      for (const d of outs ?? []) inEdges.get(d)?.delete(this);
      outs?.clear();
    }
    return r;
  };
}

/** Who created `n` (type and first project source file), when the census saw it made. */
export function nodeCreatorOf(n: object): string | undefined {
  return nodeKey.get(n);
}

function upstream(from: AudioNode, into: Set<AudioNode>): void {
  const stack = [from];
  while (stack.length) {
    const n = stack.pop()!;
    for (const src of inEdges.get(n) ?? []) {
      if (!into.has(src)) { into.add(src); stack.push(src); }
    }
  }
}

/**
 * What keeps the audio thread busy besides the output: Chrome processes
 * every AnalyserNode and every AudioWorkletNode with inputs each quantum,
 * with everything upstream of it, whether or not the output hears it. For
 * each such node, how many nodes it alone keeps running (not already pulled
 * by the destination), by creator, largest first.
 */
export function readPullCensus(): { pulledByDestination: number; extraPullers: Array<{ node: string; keepsRunning: number }> } {
  const live: AudioNode[] = [];
  for (const ref of nodeRefs) { const n = ref.deref(); if (n) live.push(n); else nodeRefs.delete(ref); }
  const destPulled = new Set<AudioNode>();
  for (const n of live) {
    for (const d of outEdges.get(n) ?? []) if (d instanceof AudioDestinationNode) { destPulled.add(n); upstream(n, destPulled); }
  }
  const pullers: Array<{ node: string; keepsRunning: number }> = [];
  for (const n of live) {
    if (destPulled.has(n)) continue;
    const auto = n instanceof AnalyserNode || (n instanceof AudioWorkletNode && (inEdges.get(n)?.size ?? 0) > 0);
    if (!auto) continue;
    const up = new Set<AudioNode>();
    upstream(n, up);
    let extra = 1;
    for (const u of up) if (!destPulled.has(u)) extra++;
    pullers.push({ node: nodeKey.get(n) ?? n.constructor.name, keepsRunning: extra });
  }
  pullers.sort((a, b) => b.keepsRunning - a.keepsRunning);
  return { pulledByDestination: destPulled.size, extraPullers: pullers.slice(0, 25) };
}

export function installNodeCensus(): void {
  if (finalizer || typeof FinalizationRegistry === 'undefined') return;
  installEdgeCensus();
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
    buffer = new SharedArrayBuffer(MAX_PROCESSORS * SLOTS * Float64Array.BYTES_PER_ELEMENT);
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
  /** Longest single process() call in the window, whole milliseconds. */
  worstProcessMs: number;
  /** Milliseconds per second spent in the processor's port message handler. */
  messageMsPerSecond: number;
  /** Longest single message handler call in the window, whole milliseconds. */
  worstMessageMs: number;
  /**
   * Longest single call in the window per message kind (`cmd` or `type`) and
   * for the processor constructor, longest first: which message blocked.
   */
  worstCalls: Array<{ kind: string; ms: number }>;
}

interface WorstCall { processor: string; kind: string; ms: number }

/** Processor names, and the worst calls since the last reset (then reset them). */
function names(): Promise<{ names: string[]; worstCalls: WorstCall[] }> {
  return new Promise((resolve) => {
    const none = { names: [], worstCalls: [] };
    if (!node) { resolve(none); return; }
    const port = node.port;
    const timer = setTimeout(() => resolve(none), 2000);
    port.onmessage = (e) => {
      if (e.data?.type === 'names') {
        clearTimeout(timer);
        resolve({ names: e.data.names as string[], worstCalls: (e.data.worstCalls ?? []) as WorstCall[] });
      }
    };
    port.postMessage({ type: 'names', resetWorst: true });
  });
}

/**
 * Audio-thread time per processor over `windowMs`, most expensive first.
 * Null when the profiler is not installed.
 */
export async function readWorkletProfile(windowMs = 2000): Promise<WorkletProfileEntry[] | null> {
  if (!buffer) return null;
  const view = new Float64Array(buffer);
  // The worst-call slots hold a maximum since the last read: clear them so
  // they cover this window only.
  for (let i = 0; i < MAX_PROCESSORS; i++) { view[i * SLOTS + 2] = 0; view[i * SLOTS + 5] = 0; }
  await names();
  const before = Float64Array.from(view);
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, windowMs));
  const seconds = (performance.now() - t0) / 1000;
  const { names: list, worstCalls } = await names();
  const out: WorkletProfileEntry[] = [];
  for (let i = 0; i < list.length; i++) {
    const b = i * SLOTS;
    const ms = view[b] - before[b];
    const calls = view[b + 1] - before[b + 1];
    const messageMs = view[b + 3] - before[b + 3];
    const messages = view[b + 4] - before[b + 4];
    if (calls === 0 && messages === 0 && !worstCalls.some((w) => w.processor === list[i])) continue;
    out.push({
      processor: list[i],
      msPerSecond: +(ms / seconds).toFixed(1),
      callsPerSecond: Math.round(calls / seconds),
      worstProcessMs: view[b + 2],
      messageMsPerSecond: +(messageMs / seconds).toFixed(1),
      worstMessageMs: view[b + 5],
      worstCalls: worstCalls.filter((w) => w.processor === list[i])
        .map(({ kind, ms }) => ({ kind, ms })).sort((a, b) => b.ms - a.ms),
    });
  }
  return out.sort((a, b) => b.msPerSecond - a.msPerSecond);
}
