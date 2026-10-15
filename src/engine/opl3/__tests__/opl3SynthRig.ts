/**
 * Test rig for the REAL OPL3Synth class: its real worklet and WASM (public/opl3) run in Node behind a minimal fake
 * AudioContext / AudioWorkletNode, so a test drives the same triggerAttack / applyPatch / applyConfig calls the engine
 * makes and renders the audio the chip produces. Use with `vi.mock('@/utils/audio-context', ...)` from `opl3RigMock`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, stereoOutputs, type WorkletProc } from '@/engine/__tests__/workletHarness';

export const SAMPLE_RATE = 48000;

interface FakeNode { port: { postMessage: (m: unknown) => void; onmessage: ((e: { data: unknown }) => void) | null }; proc: WorkletProc }

let lastNode: FakeNode | null = null;
let pending: () => Promise<void> = async () => {};

/** The fake context OPL3Synth gets from getDevilboxAudioContext(). */
export function makeFakeContext(): unknown {
  return {
    sampleRate: SAMPLE_RATE,
    audioWorklet: { addModule: async () => {} },
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
  };
}

/** Install the fake AudioWorkletNode and the fetch of the OPL3 assets; call once before constructing an OPL3Synth. */
export function installOpl3Globals(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  g.fetch = async (url: string) => {
    const file = resolve(ROOT, 'public', url.replace(/^\//, ''));
    const buf = readFileSync(file);
    return { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), text: async () => buf.toString('utf8') };
  };
  g.AudioWorkletNode = class {
    port: FakeNode['port'] = { postMessage: () => {}, onmessage: null };
    proc: WorkletProc;
    constructor() {
      let Processor!: new () => WorkletProc;
      const node = this;
      const scope: Record<string, unknown> = {
        // the worklet's port: replies go to the main-thread side (node.port.onmessage)
        AudioWorkletProcessor: class { port = { postMessage: (m: unknown) => { setTimeout(() => node.port.onmessage?.({ data: m }), 0); }, onmessage: null }; },
        registerProcessor: (_n: string, cls: new () => WorkletProc) => { Processor = cls; },
        sampleRate: SAMPLE_RATE, currentTime: 0,
      };
      new Function(...Object.keys(scope), readFileSync(resolve(ROOT, 'public/opl3/OPL3.worklet.js'), 'utf8'))(...Object.values(scope));
      this.proc = new Processor();
      // main thread -> worklet: serialised, with process.versions hidden so Emscripten takes its browser path
      let chain: Promise<void> = Promise.resolve();
      this.port.postMessage = (m: unknown) => {
        chain = chain.then(async () => {
          const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
          Object.defineProperty(process, 'versions', { value: {}, configurable: true });
          try { await (this.proc as unknown as { handleMessage(d: unknown): Promise<void> }).handleMessage(m); }
          finally { Object.defineProperty(process, 'versions', versions); }
        });
      };
      pending = () => chain;
      lastNode = this as unknown as FakeNode;
    }
    connect() {}
    disconnect() {}
  };
}

/** Render `seconds` of the synth's worklet; returns the left channel. */
export function render(seconds: number): Float32Array {
  const proc = lastNode!.proc;
  const blocks = Math.ceil((seconds * SAMPLE_RATE) / 128);
  const out = new Float32Array(blocks * 128);
  for (let b = 0; b < blocks; b++) {
    const o = stereoOutputs(1);
    proc.process([], o);
    out.set(o[0][0], b * 128);
  }
  return out;
}

/** Let queued port messages reach the worklet (the synth sends through a microtask/timeout chain). */
export const settle = async (): Promise<void> => { await pending(); await new Promise((r) => setTimeout(r, 5)); await pending(); };

export const peakDb = (x: Float32Array): number => { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return 20 * Math.log10(Math.max(p, 1e-9)); };
export const rmsDb = (x: Float32Array): number => { let s = 0; for (const v of x) s += v * v; return 10 * Math.log10(Math.max(s / x.length, 1e-18)); };
