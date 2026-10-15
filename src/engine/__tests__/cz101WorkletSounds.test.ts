/**
 * The CZ-101 was silent in the browser (2026-10-15):
 *  - the worklet instantiated the minified Emscripten WASM with a hand-made
 *    {env} import object and looked for `_upd933_*` raw exports, so
 *    WebAssembly.instantiate threw "Import #0 "a"" every time;
 *  - the "JavaScript fallback" it then fell into never ran a voice (an
 *    active voice with dcaLevel 0 was skipped before its envelope could rise);
 *  - even loaded correctly, the chip wrapper indexed its volume table with a
 *    7-bit index instead of 9-bit (about -60 dB) and kept the cosine DC.
 * This drives the real CZ101Synth -> the real worklet -> the real WASM and
 * asserts a played note reaches the output.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, startWorklet, stereoOutputs, type WorkletProc } from './workletHarness';
import { cz101Transform } from '../cz101/cz101Transform';

const fakeCtx = {
  audioWorklet: { addModule: async () => {} },
  createGain: () => ({ gain: { value: 1 }, connect: () => {} }),
  destination: {},
};
vi.mock('@utils/audio-context', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getDevilboxAudioContext: () => fakeCtx,
}));

let proc!: WorkletProc;
let toWorklet!: (m: unknown) => Promise<void>;
const posted: { type?: string; message?: string }[] = [];
const seenMessages: { type: string }[] = [];
const origFetch = globalThis.fetch;
const origNode = (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode;

beforeAll(async () => {
  const h = await startWorklet('cz101', 'CZ101', cz101Transform);
  proc = h.proc;
  // The worklet is already initialised by the harness; the synth re-inits it through the
  // real message path below, as it would in the browser.
  toWorklet = async (m) => {
    const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
    Object.defineProperty(process, 'versions', { value: {}, configurable: true });
    try { await h.send(m); } finally { Object.defineProperty(process, 'versions', versions); }
  };
  globalThis.fetch = (async (url: string) => {
    const file = resolve(ROOT, 'public', String(url).replace(/^\//, ''));
    const buf = readFileSync(file);
    return {
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      text: async () => buf.toString('utf8'),
    };
  }) as unknown as typeof fetch;
  (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = class {
    private listeners: ((e: MessageEvent) => void)[] = [];
    port = {
      addEventListener: (_: string, l: (e: MessageEvent) => void) => { this.listeners.push(l); },
      removeEventListener: () => {},
      start: () => {},
      postMessage: (m: { type: string }) => {
        seenMessages.push(m);
        void toWorklet(m).then(() => {
          // What the worklet posts back (ready / error) reaches the synth's listener
          for (const p of h.posted.splice(0)) { posted.push(p); this.listeners.forEach((l) => l({ data: p } as MessageEvent)); }
        });
      },
    };
    connect() {}
    disconnect() {}
  };
});

afterAll(() => {
  globalThis.fetch = origFetch;
  (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = origNode;
});

function render(blocks: number): number {
  let sum = 0, n = 0;
  for (let b = 0; b < blocks; b++) {
    const out = stereoOutputs(1);
    proc.process([], out);
    for (const s of out[0][0]) { sum += s * s; n++; }
  }
  return Math.sqrt(sum / n);
}

describe('CZ-101 worklet', () => {
  it('plays a note the synth triggers: the real worklet and WASM render audible output', async () => {
    const { CZ101Synth } = await import('../cz101/CZ101Synth');
    const synth = new CZ101Synth();
    await synth.init();
    expect(posted.some((p) => p.type === 'error'), 'worklet init error').toBe(false);
    expect(posted.some((p) => p.type === 'ready')).toBe(true);

    expect(render(8)).toBeLessThan(0.0005); // silent before a note

    synth.triggerAttack(60, undefined, 0.8);
    await new Promise((r) => setTimeout(r, 20)); // writeReg messages are async hops
    // the synth's register writes really went out
    expect(seenMessages.filter((m) => m.type === 'writeReg').length).toBeGreaterThan(4);

    const rms = render(200); // ~0.5 s at 48 kHz
    expect(rms).toBeGreaterThan(0.001);
  });
});
