/**
 * workletHost.ts - run a real AudioWorklet processor script in Node, offline.
 *
 * Evaluates the processor file in a vm context that provides the
 * AudioWorkletGlobalScope pieces a processor touches (sampleRate, currentTime,
 * AudioWorkletProcessor with a message port, registerProcessor), then drives
 * `process()` block by block. No AudioContext, nothing reaches the speakers.
 *
 * Used by the regression test keyLockKeepsTransientsSharp to exercise the
 * exact Key Lock processor code the browser runs.
 */
import { readFileSync } from 'fs';
import { runInContext, createContext } from 'vm';

export const RENDER_QUANTUM = 128;

export interface HostedPort {
  /** Messages the processor posted to the main thread, oldest first. */
  received: unknown[];
  /** Deliver a message to the processor as the main thread would. */
  send(data: unknown): void;
}

export interface HostedProcessor {
  port: HostedPort;
  process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean;
}

interface WorkletScope {
  sampleRate: number;
  currentTime: number;
  currentFrame: number;
}

export interface WorkletHost {
  scope: WorkletScope;
  create(name: string, options?: Record<string, unknown>): HostedProcessor;
}

/**
 * Load processor scripts into one fresh worklet-like scope, evaluated in the
 * given order (the order a worklet module's static imports evaluate in).
 */
export function loadWorklet(paths: string | string[], sampleRate: number): WorkletHost {
  const files = Array.isArray(paths) ? paths : [paths];
  const path = files.join(' + ');
  const registered = new Map<string, new (opts: Record<string, unknown>) => HostedProcessor>();

  class Port {
    received: unknown[] = [];
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    postMessage(data: unknown): void { this.received.push(data); }
    send(data: unknown): void { this.onmessage?.({ data }); }
  }
  class AudioWorkletProcessor {
    port = new Port();
  }
  const scope: Record<string, unknown> = {
    sampleRate,
    currentTime: 0,
    currentFrame: 0,
    console,
    AudioWorkletProcessor,
    registerProcessor: (name: string, cls: new (opts: Record<string, unknown>) => HostedProcessor) => { registered.set(name, cls); },
    WebAssembly,
    TextDecoder,
    TextEncoder,
    setTimeout,
    queueMicrotask,
    atob,
    Promise,
  };
  scope.globalThis = scope;
  const ctx = createContext(scope);
  for (const file of files) {
    // ES module syntax is not valid in a vm.Script; a processor file only uses
    // it for the main-thread export, which the worklet side never reads.
    const code = readFileSync(file, 'utf8').replace(/^\s*(let _export=[^\n]*)?export default[^\n]*$/m, '');
    runInContext(code, ctx, { filename: file });
  }

  return {
    scope: scope as unknown as WorkletScope,
    create(name, options = {}) {
      const cls = registered.get(name);
      if (!cls) throw new Error(`processor '${name}' not registered by ${path} (have: ${[...registered.keys()].join(', ')})`);
      return new cls(options);
    },
  };
}

/** Let the processor's async start-up (WASM instantiation) settle. */
export async function settle(ms = 20): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export interface StreamResult {
  left: Float32Array;
  right: Float32Array;
  /** Wall-clock milliseconds spent inside process(), one entry per render quantum. */
  blockMs: Float64Array;
}

/**
 * Stream stereo audio through a processor quantum by quantum, advancing the
 * scope's clock like an AudioContext would. Output length equals input length.
 */
export function streamThrough(host: WorkletHost, proc: HostedProcessor, left: Float32Array, right: Float32Array): StreamResult {
  const n = Math.floor(left.length / RENDER_QUANTUM) * RENDER_QUANTUM;
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  const blocks = n / RENDER_QUANTUM;
  const blockMs = new Float64Array(blocks);
  const inL = new Float32Array(RENDER_QUANTUM);
  const inR = new Float32Array(RENDER_QUANTUM);
  const oL = new Float32Array(RENDER_QUANTUM);
  const oR = new Float32Array(RENDER_QUANTUM);
  for (let b = 0; b < blocks; b++) {
    const off = b * RENDER_QUANTUM;
    inL.set(left.subarray(off, off + RENDER_QUANTUM));
    inR.set(right.subarray(off, off + RENDER_QUANTUM));
    host.scope.currentFrame = off;
    host.scope.currentTime = off / host.scope.sampleRate;
    const t0 = performance.now();
    proc.process([[inL, inR]], [[oL, oR]], {});
    blockMs[b] = performance.now() - t0;
    outL.set(oL, off);
    outR.set(oR, off);
  }
  return { left: outL, right: outR, blockMs };
}
