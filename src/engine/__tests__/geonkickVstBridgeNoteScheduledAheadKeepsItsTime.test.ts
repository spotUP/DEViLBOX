/**
 * A note scheduled ahead keeps its time on Geonkick and VSTBridge. Their synths dropped the `time` argument of
 * triggerAttack/triggerRelease and the worklets keyed the engine on message arrival, so a main-thread stall
 * delivered pattern rows late and bunched (flam). The real worklet runs in a stand-in AudioWorkletGlobalScope
 * (shared queue import inlined) with a recording stand-in for the WASM exports.
 * VSTBridge caveat: the queue fixes the worklet arrival only; the synth is a WASM class inside the worklet.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => ({}), noteToMidi: (n: string) => (n === 'C4' ? 60 : 62) }));
import { inlineWorkletImports } from '@/engine/__tests__/workletHarness';
import { GeonkickSynth } from '@/engine/geonkick/GeonkickSynth';
import { GeonkickEngine } from '@/engine/geonkick/GeonkickEngine';
import { VSTBridgeSynth } from '@/engine/vstbridge/VSTBridgeSynth';

const ROOT = resolve(__dirname, '../../..');
const RATE = 48000;
const BLOCK = 128;

type Proc = {
  port: { onmessage: ((e: { data: unknown }) => unknown) | null };
  process: (inputs: unknown[], outputs: Float32Array[][]) => boolean;
  [k: string]: unknown;
};
type Keyed = { ev: string; note?: number; at: number };

const g = globalThis as Record<string, unknown>;
let now = 0;
beforeEach(() => {
  now = 0;
  Object.defineProperty(g, 'currentTime', { get: () => now, configurable: true });
  g.sampleRate = RATE;
});
afterEach(() => {
  delete g.currentTime;
  delete g.sampleRate;
});

function load(file: string, options?: unknown) {
  const src = inlineWorkletImports(readFileSync(resolve(ROOT, file), 'utf8'), file.split('/')[1]);
  let Processor!: new (o?: unknown) => Proc;
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (_n: string, cls: new (o?: unknown) => Proc) => { Processor = cls; },
  };
  new Function(...Object.keys(scope), src)(...Object.values(scope));
  const proc = new Processor(options);
  const keyed: Keyed[] = [];
  let rendered = 0;
  const at = () => now + rendered / RATE;
  const origProcess = proc.process.bind(proc);
  proc.process = (i, o) => { rendered = 0; return origProcess(i, o); };
  const send = (m: object) => (proc.port.onmessage as (e: unknown) => unknown)({ data: m });
  return { proc, keyed, send, at, addRendered: (n: number) => { rendered += n; } };
}

function blocks(proc: Proc, seconds: number) {
  for (let b = 0; b < Math.ceil((seconds * RATE) / BLOCK); b++) {
    proc.process([], [[new Float32Array(BLOCK), new Float32Array(BLOCK)]]);
    now += BLOCK / RATE;
  }
}

function wiredGeonkick() {
  const { proc, keyed, send, at, addRendered } = load('public/geonkick/Geonkick.worklet.js');
  const renders: { ptr: number; n: number }[] = [];
  proc.wasm = {
    HEAPF32: new Float32Array(4096),
    _gk_wasm_key_pressed: (_h: number, down: number, note: number) => keyed.push({ ev: down ? 'on' : 'off', note, at: at() }),
    _gk_wasm_render_mono: (_h: number, ptr: number, n: number) => { renders.push({ ptr, n }); addRendered(n); },
  };
  Object.assign(proc, { handle: 1, initialized: true, outPtr: 1024 });
  const engine = Object.create(GeonkickEngine.prototype);
  engine.workletNode = { port: { postMessage: send } };
  const synth = Object.create(GeonkickSynth.prototype);
  Object.assign(synth, { engine, _disposed: false });
  return { proc, keyed, renders, synth };
}

function wiredVstBridge() {
  const { proc, keyed, send, at, addRendered } = load('public/vstbridge/VSTBridge.worklet.js', { processorOptions: {} });
  const renders: { ptr: number; n: number }[] = [];
  proc.synth = {
    noteOn: (note: number) => keyed.push({ ev: 'on', note, at: at() }),
    noteOff: (note: number) => keyed.push({ ev: 'off', note, at: at() }),
    allNotesOff: () => keyed.push({ ev: 'alloff', at: at() }),
    process: (l: number, _r: number, n: number) => { renders.push({ ptr: l, n }); addRendered(n); },
  };
  Object.assign(proc, {
    isInitialized: true, outputPtrL: 0, outputPtrR: 512,
    outputBufferL: new Float32Array(BLOCK), outputBufferR: new Float32Array(BLOCK), _wasmMemory: null, Module: {},
  });
  const synth = Object.create(VSTBridgeSynth.prototype);
  Object.assign(synth, { _worklet: { port: { postMessage: send } }, _isReady: true, _pendingNotes: [] });
  return { proc, keyed, renders, synth };
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1 / RATE;

for (const [name, wired] of [['Geonkick', wiredGeonkick], ['VSTBridge', wiredVstBridge]] as const) {
  describe(`note scheduled ahead keeps its time on ${name}`, () => {
    it('two rows delivered together as one burst key at their own frames and split the render there', () => {
      const { proc, keyed, renders, synth } = wired();
      blocks(proc, 0.01);
      const t0 = now;
      synth.triggerAttack('D4', t0 + 0.05, 0.8);
      synth.triggerRelease('D4', t0 + 0.17);
      synth.triggerAttack('C4', t0 + 0.17, 0.8);
      expect(keyed).toEqual([]);
      blocks(proc, 0.3);
      expect(keyed.map((k) => k.ev + (k.note ?? ''))).toEqual(['on62', 'off62', 'on60']);
      expect(near(keyed[0].at, t0 + 0.05)).toBe(true);
      expect(near(keyed[2].at, t0 + 0.17)).toBe(true);
      // a shorter render moved on inside the block: the output pointer advanced past the block start
      expect(renders.some((r) => r.n < BLOCK && r.ptr % (BLOCK * 4) !== 0 && r.ptr > 0)).toBe(true);
    });

    it('a note with no time, a past time or an unusable time keys at once', () => {
      const { proc, keyed, synth } = wired();
      blocks(proc, 0.01);
      synth.triggerAttack('C4', undefined, 0.8);
      synth.triggerAttack('D4', now - 0.02, 0.8);
      synth.triggerAttack('C4', NaN, 0.8);
      expect(keyed.map((k) => k.note)).toEqual([60, 62, 60]);
    });
  });
}

describe('All Notes Off on VSTBridge cancels the rows already sent for later', () => {
  it('drops the queued note and keys All Notes Off', () => {
    const { proc, keyed, synth } = wiredVstBridge();
    blocks(proc, 0.01);
    synth.triggerAttack('C4', now + 0.1, 0.8);
    synth.triggerRelease(undefined, now);
    blocks(proc, 0.2);
    expect(keyed.map((k) => k.ev)).toEqual(['alloff']);
  });
});
