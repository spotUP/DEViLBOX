/**
 * A note scheduled ahead keeps its time on the MAME chip synths. MAMEBaseSynth dropped the `time` of
 * triggerAttack/triggerRelease and the chip worklets keyed the chip on message arrival, so a main-thread stall
 * delivered pattern rows late and bunched (flam). The synth must send the time and the real worklet must hold the
 * note until the frame it is due and key the chip at that frame inside the block.
 *
 * Each case runs the real public/mame/<chip>.worklet.js (its imports of the base class and the shared queue are
 * inlined) in a stand-in AudioWorkletGlobalScope, with a recording stand-in for the WASM synth, driven through the
 * real MAMEBaseSynth subclass trigger methods.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const clock = { now: 0 };
vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ({ get currentTime() { return clock.now; }, createGain: () => ({ connect: () => {}, gain: { value: 1 } }) }),
  timeToSeconds: (d: string | number) => (typeof d === 'number' ? d : parseFloat(d)),
  noteToMidi: (n: string) => (n === 'C4' ? 60 : 62),
}));
import { inlineWorkletImports } from '@/engine/__tests__/workletHarness';
import { TIASynth } from '@/engine/tia/TIASynth';
import { MSM5232Synth } from '@/engine/msm5232/MSM5232Synth';
import { TR707Synth } from '@/engine/tr707/TR707Synth';
import { ES5503Synth } from '@/engine/es5503/ES5503Synth';
import { SN76477Synth } from '@/engine/sn76477/SN76477Synth';
import { S14001ASynth } from '@/engine/s14001a/S14001ASynth';

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
beforeEach(() => {
  clock.now = 0;
  Object.defineProperty(g, 'currentTime', { get: () => clock.now, configurable: true });
  g.sampleRate = RATE;
});
afterEach(() => {
  delete g.currentTime;
  delete g.sampleRate;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Case = { name: string; file: string; Synth: any; chipMsg?: { msg: Record<string, unknown>; call: string } };
const CASES: Case[] = [
  { name: 'TIA', file: 'public/mame/TIA.worklet.js', Synth: TIASynth },
  { name: 'MSM5232 (chip-specific handler)', file: 'public/mame/MSM5232.worklet.js', Synth: MSM5232Synth, chipMsg: { msg: { type: 'setFeetMix', value: 3 }, call: 'setFeetMix' } },
  { name: 'TR707 (key-off is All Notes Off)', file: 'public/mame/TR707.worklet.js', Synth: TR707Synth },
  { name: 'ES5503', file: 'public/mame/ES5503.worklet.js', Synth: ES5503Synth },
  { name: 'SN76477', file: 'public/mame/SN76477.worklet.js', Synth: SN76477Synth },
];

function wired(c: Case) {
  const src = inlineWorkletImports(readFileSync(resolve(ROOT, c.file), 'utf8'), 'mame');
  let Processor!: new (o?: unknown) => Proc;
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
  };
  new Function(...Object.keys(scope), src)(...Object.values(scope));
  const proc = new Processor({});
  const keyed: Keyed[] = [];
  const chipCalls: string[] = [];
  let rendered = 0;
  const at = () => clock.now + rendered / RATE;
  proc.synth = {
    noteOn: (note: number) => keyed.push({ ev: 'on', note, at: at() }),
    noteOff: (note: number) => keyed.push({ ev: 'off', note, at: at() }),
    allNotesOff: () => keyed.push({ ev: 'alloff', at: at() }),
    process: (_l: number, _r: number, n: number) => { rendered += n; },
    setFeetMix: () => chipCalls.push('setFeetMix'),
    setNoiseMode: () => chipCalls.push('setNoiseMode'),
  };
  proc.module = {};
  proc.initialized = true;
  proc.bufferSize = BLOCK;
  proc.outputBufferL = new Float32Array(BLOCK);
  proc.outputBufferR = new Float32Array(BLOCK);
  proc.updateBufferViews = () => {};
  const origProcess = proc.process.bind(proc);
  proc.process = (i, o) => { rendered = 0; return origProcess(i, o); };

  const deliver = (m: object) => (proc.port.onmessage as (e: unknown) => unknown)({ data: m });
  // The synth without its AudioWorkletNode: its posted messages go to the real worklet message handler.
  const synth = Object.create(c.Synth.prototype);
  Object.assign(synth, {
    _disposed: false, _isReady: true, workletNode: { port: { postMessage: deliver } },
    currentNote: 60, noteOnTime: 0, noteStartAudioTime: 0, isNoteOn: false, macros: new Map(), opMacros: [], _pendingCalls: [],
    effectRouter: { resetChannel: () => {} }, capabilities: { numOperators: 0 }, channelIndex: 0,
  });
  return { proc, keyed, synth, deliver, chipCalls };
}

function renderBlocks(proc: Proc, seconds: number) {
  const blocks = Math.ceil((seconds * RATE) / BLOCK);
  for (let b = 0; b < blocks; b++) {
    proc.process([], [[new Float32Array(BLOCK), new Float32Array(BLOCK)]]);
    clock.now += BLOCK / RATE;
  }
}

for (const c of CASES) {
  describe(`note scheduled ahead keeps its time on ${c.name}`, () => {
    it('two rows delivered together as one burst key at their own frames', () => {
      const { proc, keyed, synth } = wired(c);
      renderBlocks(proc, 0.01);
      const t0 = clock.now;
      synth.triggerAttack('D4', t0 + 0.05, 0.8);
      synth.triggerRelease(t0 + 0.17);
      synth.triggerAttack('C4', t0 + 0.2, 0.8);
      expect(keyed).toEqual([]);
      renderBlocks(proc, 0.3);
      const on = keyed.filter((k) => k.ev === 'on');
      expect(on.map((k) => k.note)).toEqual([62, 60]);
      expect(Math.abs(on[0].at - (t0 + 0.05))).toBeLessThanOrEqual(1 / RATE);
      expect(Math.abs(on[1].at - (t0 + 0.2))).toBeLessThanOrEqual(1 / RATE);
      const off = keyed.find((k) => k.ev !== 'on');
      expect(off).toBeDefined();
      expect(Math.abs(off!.at - (t0 + 0.17))).toBeLessThanOrEqual(1 / RATE);
    });

    it('triggerAttackRelease sends the release at time plus duration', () => {
      const { proc, keyed, synth } = wired(c);
      renderBlocks(proc, 0.01);
      const t0 = clock.now;
      synth.triggerAttackRelease('C4', 0.1, t0 + 0.05, 0.8);
      renderBlocks(proc, 0.3);
      expect(keyed.map((k) => k.ev === 'on')).toEqual([true, false]);
      expect(Math.abs(keyed[0].at - (t0 + 0.05))).toBeLessThanOrEqual(1 / RATE);
      expect(Math.abs(keyed[1].at - (t0 + 0.15))).toBeLessThanOrEqual(1 / RATE);
    });

    it('a note with no time keys at once', () => {
      const { proc, keyed, synth } = wired(c);
      renderBlocks(proc, 0.01);
      synth.triggerAttack('C4', undefined, 0.8);
      expect(keyed.map((k) => k.note)).toEqual([60]);
    });

    it('All Notes Off on Stop cancels the rows already sent for later', () => {
      const { proc, keyed, synth } = wired(c);
      renderBlocks(proc, 0.01);
      synth.triggerAttack('C4', clock.now + 0.1, 0.8);
      synth.releaseAll();
      renderBlocks(proc, 0.2);
      expect(keyed.map((k) => k.ev)).toEqual(['alloff']);
    });
  });
}

describe('chip-specific worklet messages still reach the chip', () => {
  it('MSM5232 setFeetMix is handled by the chip subclass', () => {
    const c = CASES[1];
    const { deliver, chipCalls } = wired(c);
    deliver(c.chipMsg!.msg);
    expect(chipCalls).toEqual([c.chipMsg!.call]);
  });
});

describe('a gate release that is All Notes Off keeps later notes (TR707)', () => {
  it('release flag does not cancel the next row', () => {
    const { proc, keyed, synth } = wired(CASES[2]);
    renderBlocks(proc, 0.01);
    const t0 = clock.now;
    synth.triggerAttack('D4', t0 + 0.05, 0.8);
    synth.triggerRelease(t0 + 0.12);
    synth.triggerAttack('C4', t0 + 0.2, 0.8);
    renderBlocks(proc, 0.3);
    expect(keyed.map((k) => k.ev)).toEqual(['on', 'alloff', 'on']);
  });
});

describe('speech chips keep the timed note path on the shared base', () => {
  const TMS = { name: 'TMS5220', file: 'public/mame/TMS5220.worklet.js', Synth: S14001ASynth } as Case;
  const S14 = { name: 'S14001A', file: 'public/mame/S14001A.worklet.js', Synth: S14001ASynth } as Case;

  it('TMS5220 worklet holds a timed noteOn and noteOff until their frames, and handles its own messages', () => {
    const { proc, keyed, deliver, chipCalls } = wired(TMS);
    renderBlocks(proc, 0.01);
    const t0 = clock.now;
    deliver({ type: 'noteOn', note: 60, velocity: 100, time: t0 + 0.05 });
    deliver({ type: 'noteOff', note: 60, time: t0 + 0.1 });
    deliver({ type: 'setNoiseMode', value: 1 });
    expect(keyed).toEqual([]);
    expect(chipCalls).toEqual(['setNoiseMode']);
    renderBlocks(proc, 0.2);
    expect(keyed.map((k) => k.ev)).toEqual(['on', 'off']);
    expect(Math.abs(keyed[0].at - (t0 + 0.05))).toBeLessThanOrEqual(1 / RATE);
    expect(Math.abs(keyed[1].at - (t0 + 0.1))).toBeLessThanOrEqual(1 / RATE);
  });

  it('S14001A synth sends the key-off time and the worklet keys off at that frame', () => {
    const { proc, keyed, synth, deliver } = wired(S14);
    renderBlocks(proc, 0.01);
    const t0 = clock.now;
    deliver({ type: 'noteOn', note: 60, velocity: 100 });
    synth.triggerRelease(t0 + 0.15);
    expect(keyed.filter((k) => k.ev === 'off')).toEqual([]);
    renderBlocks(proc, 0.3);
    const off = keyed.find((k) => k.ev === 'off');
    expect(off).toBeDefined();
    expect(Math.abs(off!.at - (t0 + 0.15))).toBeLessThanOrEqual(1 / RATE);
  });
});
