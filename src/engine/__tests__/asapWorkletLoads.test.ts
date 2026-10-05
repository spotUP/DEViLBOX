/**
 * The ASAP worklet itself, run in a stand-in AudioWorkletGlobalScope (no
 * TextEncoder, like the real one).
 *
 * In the browser ASAP played silence and then froze the page (2026-10-05):
 *  - the worklet encoded the file name with TextEncoder, which the worklet
 *    scope does not have, so the tune never loaded;
 *  - a loadModule that arrived while the WASM module was initialising was
 *    dropped, again leaving no tune;
 *  - 'play' with no tune made ASAP_Generate spin forever on the audio thread;
 *  - 'stop' (and pause, which sends it) deleted the tune, so the transport's
 *    stop-then-play gave a few bleeps and then silence.
 * src/engine/__tests__/asapRendersCorpus.test.ts covers the bundle alone.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInThisContext } from 'node:vm';

const ROOT = resolve(__dirname, '../../..');
const SAP = resolve(ROOT, 'public/data/songs/sap/chop suey.sap');

type Msg = { type: string; message?: string };
interface Processor {
  handleMessage(m: object): Promise<void>;
  process(i: unknown[], o: Float32Array[][], p: object): boolean;
}

const g = globalThis as Record<string, unknown>;
let Cls: new () => Processor;
const saved = { te: g.TextEncoder, td: g.TextDecoder };

beforeAll(() => {
  g.AudioWorkletProcessor = class { port = { postMessage: (m: Msg) => (this as unknown as { sent: Msg[] }).sent.push(m), onmessage: null }; sent: Msg[] = []; };
  g.registerProcessor = (_n: string, c: new () => Processor) => { Cls = c; };
  g.sampleRate = 48000;
  runInThisContext(readFileSync(resolve(ROOT, 'public/asap/Asap.worklet.js'), 'utf8'));
});
afterAll(() => { g.TextEncoder = saved.te; g.TextDecoder = saved.td; });

/** Start init (not awaited) the way the engine posts it, with node's own env hidden. */
function startInit(p: Processor): Promise<void> {
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  g.self ??= globalThis;
  const done = p.handleMessage({
    type: 'init', sampleRate: 48000,
    wasmBinary: readFileSync(resolve(ROOT, 'public/asap/Asap.wasm')),
    jsCode: readFileSync(resolve(ROOT, 'public/asap/Asap.js'), 'utf8'),
  });
  return done.finally(() => Object.defineProperty(process, 'versions', versions));
}

function peakOver(p: Processor, seconds: number): number {
  const L = new Float32Array(128), R = new Float32Array(128);
  let peak = 0;
  for (let i = 0; i < (48000 * seconds) / 128; i++) {
    p.process([], [[L, R]], {});
    for (const v of L) peak = Math.max(peak, Math.abs(v));
  }
  return peak;
}

const sapBytes = () => { const b = readFileSync(SAP); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

describe('ASAP worklet in a worklet-like scope', () => {
  it('plays a tune whose load arrives while the module is still initialising, with no TextEncoder', async () => {
    delete g.TextEncoder; delete g.TextDecoder;
    const p = new Cls();
    const init = startInit(p);
    void p.handleMessage({ type: 'loadModule', moduleData: sapBytes(), filename: 'chop suey.sap' });
    void p.handleMessage({ type: 'play' });
    await init;
    const sent = (p as unknown as { sent: Msg[] }).sent;
    expect(sent.filter((m) => m.type === 'error')).toEqual([]);
    expect(sent.map((m) => m.type)).toContain('moduleLoaded');
    expect(peakOver(p, 2)).toBeGreaterThan(0.05);
  }, 60_000);

  it('renders silence, and returns, when told to play with no tune loaded', async () => {
    const p = new Cls();
    await startInit(p);
    await p.handleMessage({ type: 'play' });
    expect(peakOver(p, 0.5)).toBe(0);
  }, 60_000);

  it('plays again after stop then play, from the top', async () => {
    const p = new Cls();
    await startInit(p);
    await p.handleMessage({ type: 'loadModule', moduleData: sapBytes(), filename: 'chop suey.sap' });
    await p.handleMessage({ type: 'play' });
    expect(peakOver(p, 0.5)).toBeGreaterThan(0.05);
    await p.handleMessage({ type: 'stop' });
    expect(peakOver(p, 0.2)).toBe(0);
    await p.handleMessage({ type: 'play' });
    expect(peakOver(p, 2)).toBeGreaterThan(0.05);
  }, 60_000);

  it("follows the mixer's mask: bit set = channel audible", async () => {
    const p = new Cls();
    await startInit(p);
    await p.handleMessage({ type: 'loadModule', moduleData: sapBytes(), filename: 'chop suey.sap' });
    await p.handleMessage({ type: 'play' });
    // The mixer's all-channels-on mask muted every POKEY channel: bleeps, then silence.
    await p.handleMessage({ type: 'setMuteMask', mask: 0xffffffff });
    expect(peakOver(p, 1)).toBeGreaterThan(0.05);
    await p.handleMessage({ type: 'setMuteMask', mask: 0 });
    peakOver(p, 0.1);
    expect(peakOver(p, 0.5)).toBe(0);
  }, 60_000);
});
