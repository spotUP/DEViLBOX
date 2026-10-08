/**
 * Runs a real AudioWorklet processor file (public/<engine>/<Engine>.worklet.js) under node, with its real WASM, so a test
 * drives the engine through the messages the engine class posts and reads the audio `process()` produces.
 *
 *   const h = await openWorklet({ dir: 'davidwhittaker', name: 'DavidWhittaker', factory: 'createDavidWhittaker' });
 *   await h.send({ type: 'loadModule', moduleData, subsong: 0 });
 *   await h.send({ type: 'play' });
 *   const blocks = h.render(300);        // 300 blocks of 128 frames, [left, right] interleaved per block
 *
 * The worklet scope is faked as far as the processors use it: AudioWorkletProcessor (a port that records what the
 * processor posts back), registerProcessor, sampleRate. Nothing of the processor is replaced.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
export const BLOCK = 128;
export const SAMPLE_RATE = 44100;

interface Processor {
  port: { onmessage: ((e: { data: unknown }) => void) | null; postMessage(m: unknown): void };
  handleMessage?(data: unknown): Promise<void> | void;
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

export interface WorkletHarness {
  /** Post a message to the processor, as the engine class's port does, and wait for it to be handled. */
  send(data: Record<string, unknown>): Promise<void>;
  /** Messages the processor posted back, in order. */
  posted: Array<Record<string, unknown>>;
  /** Render `blocks` blocks of 128 frames; each block is the left then the right channel. */
  render(blocks: number): Float32Array[];
}

export async function openWorklet(opts: { dir: string; name: string; factory: string; worklet?: string }): Promise<WorkletHarness> {
  const g = globalThis as Record<string, unknown>;
  g.self ??= globalThis;
  (g.self as Record<string, unknown>).location ??= { href: `file:///${opts.dir}/${opts.name}.js` };
  g.WorkerGlobalScope ??= class {};
  g.sampleRate = SAMPLE_RATE;
  const posted: Array<Record<string, unknown>> = [];
  class FakeProcessor {
    port = { onmessage: null as ((e: { data: unknown }) => void) | null, postMessage: (m: unknown) => { posted.push(m as Record<string, unknown>); } };
  }
  let Registered: (new () => Processor) | null = null;
  const source = readFileSync(resolve(ROOT, 'public', opts.dir, opts.worklet ?? `${opts.name}.worklet.js`), 'utf8');
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', source)(
    FakeProcessor, (_n: string, cls: new () => Processor) => { Registered = cls; }, SAMPLE_RATE,
  );
  if (!Registered) throw new Error('the worklet registered no processor');
  const proc = new (Registered as new () => Processor)();
  const send = async (data: Record<string, unknown>): Promise<void> => {
    if (proc.handleMessage) await proc.handleMessage(data);
    else if (proc.port.onmessage) { await proc.port.onmessage({ data }); }
    await new Promise((r) => setTimeout(r, 0));
  };
  await send({
    type: 'init', sampleRate: SAMPLE_RATE,
    wasmBinary: readFileSync(resolve(ROOT, 'public', opts.dir, `${opts.name}.wasm`)).buffer.slice(0),
    jsCode: readFileSync(resolve(ROOT, 'public', opts.dir, `${opts.name}.js`), 'utf8'),
  });
  const render = (blocks: number): Float32Array[] => {
    const out: Float32Array[] = [];
    for (let b = 0; b < blocks; b++) {
      const l = new Float32Array(BLOCK), r = new Float32Array(BLOCK);
      proc.process([], [[l, r]]);
      const both = new Float32Array(BLOCK * 2);
      both.set(l); both.set(r, BLOCK);
      out.push(both);
    }
    return out;
  };
  return { send, posted, render };
}

/** True when two rendered runs are sample-for-sample the same. */
export function sameAudio(a: Float32Array[], b: Float32Array[]): boolean {
  return a.length === b.length && a.every((blk, i) => blk.every((v, k) => v === b[i][k]));
}

export function peak(blocks: Float32Array[]): number {
  let m = 0;
  for (const blk of blocks) for (const v of blk) m = Math.max(m, Math.abs(v));
  return m;
}
