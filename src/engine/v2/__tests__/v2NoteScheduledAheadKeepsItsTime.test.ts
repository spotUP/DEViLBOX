/**
 * A note scheduled ahead keeps its time on the V2 synth. The synth dropped the `time` argument of
 * triggerAttack/triggerAttackRelease and released through setTimeout, and the worklet keyed notes on
 * message arrival, so a main-thread stall delivered pattern rows late and bunched. The synth must send
 * the time and the real worklet must hold the note until the host frame it is due, and key it at that
 * frame inside the block.
 *
 * The worklet runs as the real public/V2Synth.worklet.js in a stand-in AudioWorkletGlobalScope (its
 * import of the shared queue is inlined) with a recording stand-in for the WASM exports.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => ({ createGain: () => ({}) }), noteToMidi: (n: string) => (n === 'C4' ? 60 : 62) }));
import { inlineWorkletImports } from '@/engine/__tests__/workletHarness';
import { V2Synth } from '@/engine/v2/V2Synth';

const ROOT = resolve(__dirname, '../../../..');
const RATE = 48000;
const BLOCK = 128;

type Proc = {
  port: { onmessage: ((e: { data: unknown }) => unknown) | null };
  process: (inputs: unknown[], outputs: Float32Array[][]) => boolean;
  [k: string]: unknown;
};
type Keyed = { ev: string; note: number; at: number };

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

function wired() {
  const src = inlineWorkletImports(readFileSync(resolve(ROOT, 'public/V2Synth.worklet.js'), 'utf8'), '.');
  let Processor!: new () => Proc;
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
  };
  new Function(...Object.keys(scope), src)(...Object.values(scope));
  const proc = new Processor();
  const keyed: Keyed[] = [];
  let rendered = 0;
  proc.initialized = true;
  proc.renderBuffer = 16; // a malloc result is never 0: the worklet treats 0 as no buffer
  proc.module = {
    _v2synth_note_on: (_c: number, note: number) => { keyed.push({ ev: 'on', note, at: now + rendered / RATE }); },
    _v2synth_note_off: (_c: number, note: number) => { keyed.push({ ev: 'off', note, at: now + rendered / RATE }); },
    _v2synth_render: (_b: number, n: number) => { rendered += n; },
    HEAPF32: new Float32Array(BLOCK * 2),
  };
  const origProcess = proc.process.bind(proc);
  proc.process = (i, o) => { rendered = 0; return origProcess(i, o); };

  // The synth without its AudioWorkletNode: posted messages go to the real worklet message handler.
  const timers = vi.spyOn(globalThis, 'setTimeout');
  const synth = Object.create(V2Synth.prototype) as V2Synth;
  Object.assign(synth, {
    _initialized: true,
    _activeNotes: new Map(),
    _pendingNotes: [],
    _worklet: {
      context: { get currentTime() { return now; } },
      port: { postMessage: (m: object) => proc.port.onmessage?.({ data: m }) },
    },
  });
  return { proc, keyed, synth, timers };
}

function renderBlocks(proc: Proc, seconds: number) {
  const blocks = Math.ceil((seconds * RATE) / BLOCK);
  for (let b = 0; b < blocks; b++) {
    proc.process([], [[new Float32Array(BLOCK), new Float32Array(BLOCK)]]);
    now += BLOCK / RATE;
  }
}

describe('note scheduled ahead keeps its time on V2Synth', () => {
  it('two rows delivered together as one burst key at their own frames', () => {
    const { proc, keyed, synth } = wired();
    renderBlocks(proc, 0.01);
    const t0 = now;
    synth.triggerAttack(62, t0 + 0.05, 0.8);
    synth.triggerRelease('D4', t0 + 0.17);
    synth.triggerAttack(60, t0 + 0.17, 0.8);
    expect(keyed).toEqual([]);
    renderBlocks(proc, 0.3);
    expect(keyed.map((k) => k.ev)).toEqual(['on', 'off', 'on']);
    expect(Math.abs(keyed[0].at - (t0 + 0.05))).toBeLessThanOrEqual(1 / RATE);
    expect(Math.abs(keyed[2].at - (t0 + 0.17))).toBeLessThanOrEqual(1 / RATE);
  });

  it('a note with no time, a past time or an unusable time keys at once', () => {
    const { proc, keyed, synth } = wired();
    renderBlocks(proc, 0.01);
    synth.triggerAttack(60, undefined, 0.8);
    synth.triggerAttack(62, now - 0.02, 0.8);
    synth.triggerAttack(60, NaN, 0.8);
    expect(keyed).toHaveLength(3);
  });

  it('triggerAttackRelease releases at time + duration through the worklet, with no timer', () => {
    const { proc, keyed, synth, timers } = wired();
    renderBlocks(proc, 0.01);
    const t0 = now;
    synth.triggerAttackRelease(60, 0.1, t0 + 0.05, 0.8);
    expect(keyed).toEqual([]);
    renderBlocks(proc, 0.3);
    expect(keyed.map((k) => k.ev)).toEqual(['on', 'off']);
    expect(Math.abs(keyed[0].at - (t0 + 0.05))).toBeLessThanOrEqual(1 / RATE);
    expect(Math.abs(keyed[1].at - (t0 + 0.15))).toBeLessThanOrEqual(1 / RATE);
    expect(timers).not.toHaveBeenCalled();
  });

  it('a note queued before init keeps its time', () => {
    const { proc, keyed, synth } = wired();
    renderBlocks(proc, 0.01);
    (synth as unknown as { _initialized: boolean })._initialized = false;
    synth.triggerAttack(60, now + 0.05, 0.8);
    const pending = (synth as unknown as { _pendingNotes: Array<{ time?: number }> })._pendingNotes;
    expect(pending[0].time).toBeCloseTo(now + 0.05, 6);
    expect(keyed).toEqual([]);
  });

  it('releaseAll cancels the rows already sent for later', () => {
    const { proc, keyed, synth } = wired();
    renderBlocks(proc, 0.01);
    synth.triggerAttack(60, now + 0.1, 0.8);
    synth.releaseAll();
    renderBlocks(proc, 0.2);
    expect(keyed.filter((k) => k.ev === 'on')).toEqual([]);
  });
});
