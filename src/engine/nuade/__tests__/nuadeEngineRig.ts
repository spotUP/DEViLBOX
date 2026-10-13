/**
 * A headless AudioContext for NuadeEngine tests: the engine is the real class, it loads the real Nuade.js / Nuade.wasm
 * through the real WASM loader (fetch served from public/), and its AudioWorkletNode is the real
 * public/nuade/Nuade.worklet.js running in-process. Messages cross the "port" both ways; the test pulls audio with
 * `render()`. Only the browser (context, node, fetch) is faked.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSharedWorkletScripts, ROOT, stereoOutputs, type WorkletProc } from '../../__tests__/workletHarness';
import { setDevilboxAudioContext } from '@/utils/audio-context';

type Port = { postMessage(m: unknown, t?: unknown): void; onmessage: ((e: { data: unknown }) => void) | null };

export interface Rig {
  /** The worklet processor behind the engine's node. */
  proc: () => WorkletProc;
  /** The fake AudioContext (outputLatency can be set). */
  ctx: { outputLatency: number; baseLatency: number };
  /** The options of every AudioWorkletNode the engine created, in order (a resized node is a second entry). */
  nodeOptions: { numberOfOutputs?: number }[];
  /** Everything the worklet posted to the main thread, in order. */
  posted: { type?: string; [k: string]: unknown }[];
  /** Pull `quanta` render quanta (128 frames); peaks per output over the run. */
  render(quanta: number, outputs?: number): { peaks: number[]; frames: number };
  uninstall(): void;
}

export function installNuadeRig(): Rig {
  loadSharedWorkletScripts();
  const posted: Rig['posted'] = [];
  const nodeOptions: Rig['nodeOptions'] = [];
  let proc: WorkletProc | null = null;
  const processorSource = readFileSync(resolve(ROOT, 'public/nuade/Nuade.worklet.js'), 'utf8');

  const gain = (): Record<string, unknown> => ({ context: ctx, gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} });
  const ctx: Record<string, unknown> & { outputLatency: number; baseLatency: number } = {
    sampleRate: 48000, outputLatency: 0, baseLatency: 0, currentTime: 0, state: 'running',
    audioWorklet: { addModule: async () => undefined },
    createGain: gain,
    createAnalyser: () => ({ fftSize: 2048, context: ctx, getFloatTimeDomainData(b: Float32Array) { b.fill(0); }, connect() {}, disconnect() {} }),
    destination: {},
  };
  setDevilboxAudioContext(ctx as unknown as AudioContext);

  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  // Emscripten would take the Node path inside the worklet; it must see a browser.
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });

  class FakeNode {
    port: Port;
    onprocessorerror: unknown = null;
    constructor(_ctx: unknown, _name: string, _opts: { numberOfOutputs?: number }) {
      nodeOptions.push(_opts);
      let Processor!: new () => WorkletProc;
      const scope: Record<string, unknown> = {
        AudioWorkletProcessor: class {
          port = { postMessage: (m: { type?: string }) => { posted.push(m); this_.port.onmessage?.({ data: m }); }, onmessage: null as unknown };
        },
        registerProcessor: (_n: string, cls: new () => WorkletProc) => { Processor = cls; },
        sampleRate: 48000, currentTime: 0,
      };
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const this_ = this;
      new Function(...Object.keys(scope), processorSource)(...Object.values(scope));
      proc = new Processor();
      this.port = {
        onmessage: null,
        postMessage: (m: unknown) => { void (proc!.handleMessage as (d: unknown) => Promise<void>)(m); },
      };
    }
    connect() {}
    disconnect() {}
  }
  const g = globalThis as Record<string, unknown>;
  const saved = { AudioWorkletNode: g.AudioWorkletNode, fetch: g.fetch };
  g.AudioWorkletNode = FakeNode;
  g.fetch = async (url: string) => {
    const file = String(url).replace(/^.*\/(nuade\/[^?]+)$/, 'public/$1');
    const body = readFileSync(resolve(ROOT, file));
    return {
      ok: true,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
      text: async () => body.toString('utf8'),
    };
  };

  return {
    ctx,
    proc: () => proc!,
    posted,
    nodeOptions,
    render(quanta, outputs = 9) {
      const peaks = new Array<number>(outputs).fill(0);
      let frames = 0;
      for (let q = 0; q < quanta; q++) {
        const out = stereoOutputs(outputs);
        proc!.process([], out);
        frames += 128;
        out.forEach((o, i) => { for (const ch of o) for (const v of ch) peaks[i] = Math.max(peaks[i]!, Math.abs(v)); });
      }
      return { peaks, frames };
    },
    uninstall() {
      Object.defineProperty(process, 'versions', versions);
      g.AudioWorkletNode = saved.AudioWorkletNode;
      g.fetch = saved.fetch;
    },
  };
}

/** Wait until `cond` holds (the worklet answers asynchronously), up to `ms`. */
export async function until(cond: () => boolean, ms = 5000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting for the worklet');
    await new Promise((r) => setTimeout(r, 5));
  }
}
