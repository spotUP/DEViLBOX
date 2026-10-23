/**
 * A note scheduled ahead keeps its time on the plain-worklet synths (AMSynth, Calf Mono, Raffo, SynthV1, TAL
 * NoiseMaker, Aeolus, setBfree, sfizz, ZynAddSubFX). Their synths dropped the `time` argument of
 * triggerAttack/triggerRelease and the worklets keyed the engine on message arrival, so a main-thread stall
 * delivered pattern rows late and bunched (flam). The synth must send the time and the real worklet must hold
 * the note until the host frame it is due, and key it at that frame inside the block.
 *
 * Each worklet runs as the real public/*.worklet.js in a stand-in AudioWorkletGlobalScope (its import of the
 * shared queue is inlined) with a recording stand-in for the WASM exports.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => ({}), noteToMidi: (n: string) => (n === 'C4' ? 60 : 62) }));
import { inlineWorkletImports } from '@/engine/__tests__/workletHarness';
import { AMSynthSynth } from '@/engine/amsynth/AMSynthSynth';
import { CalfMonoSynthImpl } from '@/engine/calf-mono/CalfMonoSynth';
import { RaffoSynthEngine } from '@/engine/raffo/RaffoSynth';
import { SynthV1Engine } from '@/engine/synthv1/SynthV1Synth';
import { TalNoizeMakerEngine } from '@/engine/tal-noizemaker/TalNoizeMakerSynth';
import { AeolusSynthEngine } from '@/engine/aeolus/AeolusSynth';
import { SetBfreeSynthEngine } from '@/engine/setbfree/SetBfreeSynth';
import { SfizzSynthEngine } from '@/engine/sfizz/SfizzSynth';
import { FluidSynthSynthEngine } from '@/engine/fluidsynth/FluidSynthSynth';
import { ZynAddSubFXSynthEngine } from '@/engine/zynaddsubfx/ZynAddSubFXSynth';
import { VL1SynthEngine } from '@/engine/vl1/VL1Synth';
import { PinkTromboneSynth } from '@/engine/pinktrombone/PinkTromboneSynth';
import { CZ101Synth } from '@/engine/cz101/CZ101Synth';
import { CZ101_PRESET_BANK } from '@/engine/cz101/cz101Presets';
import { MoniqueSynthEngine } from '@/engine/monique/MoniqueSynth';
import { OidosSynth } from '@/engine/oidos/OidosSynth';
import { RdPianoSynth } from '@/engine/rdpiano/RdPianoSynth';
import { TunefishSynth } from '@/engine/tunefish/TunefishSynth';
import { WaveSabreSynth } from '@/engine/wavesabre/WaveSabreSynth';
import { OpenWurliSynth } from '@/engine/openwurli/OpenWurliSynth';
import { OPL3Synth } from '@/engine/opl3/OPL3Synth';

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

// fn: WASM export names; noteAt: index of the note among the export's arguments (after the engine handle)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Case = { name: string; file: string; Synth: any; mod: 'module' | 'Module'; handle: string; ready: string; on: string; off: string; alloff: string | null; proc: string; noteAt: number; synthState: object; mono?: boolean };
const CASES: Case[] = [
  { name: 'AMSynth', file: 'public/amsynth/AMSynth.worklet.js', Synth: AMSynthSynth, mod: 'module', handle: 'engine', ready: 'initialized', on: '_amsynth_note_on', off: '_amsynth_note_off', alloff: '_amsynth_all_notes_off', proc: '_amsynth_process', noteAt: 0, mono: true, synthState: { isInitialized: true, _currentNote: -1, pendingNotes: [] } },
  { name: 'Calf Mono', file: 'public/calf-mono/CalfMonoSynth.worklet.js', Synth: CalfMonoSynthImpl, mod: 'module', handle: 'engine', ready: 'initialized', on: '_calf_mono_note_on', off: '_calf_mono_note_off', alloff: '_calf_mono_all_notes_off', proc: '_calf_mono_process', noteAt: 0, synthState: { ready: true } },
  { name: 'Raffo', file: 'public/raffo/RaffoSynth.worklet.js', Synth: RaffoSynthEngine, mod: 'module', handle: 'engine', ready: 'initialized', on: '_raffo_note_on', off: '_raffo_note_off', alloff: '_raffo_all_notes_off', proc: '_raffo_process', noteAt: 0, mono: true, synthState: { isInitialized: true, _currentNote: -1, pendingNotes: [] } },
  { name: 'SynthV1', file: 'public/synthv1/SynthV1.worklet.js', Synth: SynthV1Engine, mod: 'module', handle: 'engine', ready: 'initialized', on: '_synthv1_note_on', off: '_synthv1_note_off', alloff: '_synthv1_all_notes_off', proc: '_synthv1_process', noteAt: 0, synthState: { isInitialized: true, pendingNotes: [] } },
  { name: 'TAL NoiseMaker', file: 'public/tal-noisemaker/TalNoizeMaker.worklet.js', Synth: TalNoizeMakerEngine, mod: 'module', handle: 'engine', ready: 'initialized', on: '_tal_nm_note_on', off: '_tal_nm_note_off', alloff: '_tal_nm_all_notes_off', proc: '_tal_nm_process', noteAt: 0, synthState: { isInitialized: true, pendingNotes: [] } },
  { name: 'Aeolus', file: 'public/aeolus/Aeolus.worklet.js', Synth: AeolusSynthEngine, mod: 'Module', handle: 'synth', ready: 'isInitialized', on: '_aeolus_note_on', off: '_aeolus_note_off', alloff: '_aeolus_all_notes_off', proc: '_aeolus_process', noteAt: 0, synthState: { isInitialized: true, pendingNotes: [] } },
  { name: 'setBfree', file: 'public/setbfree/SetBfree.worklet.js', Synth: SetBfreeSynthEngine, mod: 'Module', handle: 'synth', ready: 'isInitialized', on: '_setbfree_note_on', off: '_setbfree_note_off', alloff: '_setbfree_all_notes_off', proc: '_setbfree_process', noteAt: 0, synthState: { isInitialized: true, pendingNotes: [] } },
  // sfizz has no All Notes Off export: the worklet only drops the queued events
  { name: 'sfizz', file: 'public/sfizz/Sfizz.worklet.js', Synth: SfizzSynthEngine, mod: 'module', handle: 'engine', ready: 'initialized', on: '_sfizz_bridge_note_on', off: '_sfizz_bridge_note_off', alloff: null, proc: '_sfizz_bridge_render', noteAt: 1, synthState: { isInitialized: true, pendingNotes: [] } },
  { name: 'ZynAddSubFX', file: 'public/zynaddsubfx/ZynAddSubFX.worklet.js', Synth: ZynAddSubFXSynthEngine, mod: 'module', handle: 'instance', ready: 'ready', on: '_zasfx_note_on', off: '_zasfx_note_off', alloff: '_zasfx_all_notes_off', proc: '_zasfx_process', noteAt: 0, synthState: { isInitialized: true, pendingNotes: [] } },
];

function loadWorklet(c: Case) {
  const src = inlineWorkletImports(readFileSync(resolve(ROOT, c.file), 'utf8'), c.file.split('/')[1]);
  let Processor!: new (o?: unknown) => Proc;
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
  };
  new Function(...Object.keys(scope), src)(...Object.values(scope));
  const proc = new Processor({});
  const keyed: Keyed[] = [];
  // The engine renders `n` samples starting at the current frame: record the frame each key lands on.
  let renderedInBlock = 0;
  const at = () => now + renderedInBlock / RATE;
  const heap = new Float32Array(4096);
  proc[c.handle] = 1;
  proc[c.ready] = true;
  proc.initializing = false;
  proc.bufferSize = BLOCK;
  proc.outputBufferL = new Float32Array(BLOCK);
  proc.outputBufferR = new Float32Array(BLOCK);
  Object.assign(proc, { outputPtrL: 0, outputPtrR: 512, leftPtr: 0, rightPtr: 512 });
  proc.updateBufferViews = () => {};
  proc.reportVoices = () => {};
  const arg = (a: number[]) => a[c.noteAt];
  proc[c.mod] = {
    HEAPF32: heap,
    [c.on]: (_e: number, ...a: number[]) => keyed.push({ ev: 'on', note: arg(a), at: at() }),
    [c.off]: (_e: number, ...a: number[]) => keyed.push({ ev: 'off', note: arg(a), at: at() }),
    ...(c.alloff ? { [c.alloff]: () => keyed.push({ ev: 'alloff', at: at() }) } : {}),
    [c.proc]: (_e: number, _l: number, _r: number, n: number) => { renderedInBlock += n; },
  };
  const origProcess = proc.process.bind(proc);
  proc.process = (i, o) => { renderedInBlock = 0; return origProcess(i, o); };
  return { proc, keyed };
}

function renderBlocks(proc: Proc, seconds: number) {
  const blocks = Math.ceil((seconds * RATE) / BLOCK);
  for (let b = 0; b < blocks; b++) {
    proc.process([], [[new Float32Array(BLOCK), new Float32Array(BLOCK)]]);
    now += BLOCK / RATE;
  }
}

// AMSynth and Raffo are monophonic: their triggerRelease takes only the time and has no All Notes Off
function release(c: Case, synth: { triggerRelease: (...a: unknown[]) => void }, note: string | undefined, t: number) {
  if (c.mono) synth.triggerRelease(t); else synth.triggerRelease(note, t);
}

function wired(c: Case) {
  const { proc, keyed } = loadWorklet(c);
  const onmessage = (m: object) => (proc.port.onmessage as (e: unknown) => unknown)({ data: m });
  // The synth without its AudioWorkletNode: its posted messages go to the real worklet message handler.
  const synth = Object.create(c.Synth.prototype);
  const port = { postMessage: onmessage };
  Object.assign(synth, c.synthState, { _worklet: { port }, node: { port } });
  return { proc, keyed, synth };
}

for (const c of CASES) {
  describe(`note scheduled ahead keeps its time on ${c.name}`, () => {
    it('two rows delivered together as one burst key at their own frames', () => {
      const { proc, keyed, synth } = wired(c);
      renderBlocks(proc, 0.01);
      const t0 = now;
      synth.triggerAttack('D4', t0 + 0.05, 0.8);
      release(c, synth, 'D4', t0 + 0.17);
      synth.triggerAttack('C4', t0 + 0.17, 0.8);
      expect(keyed).toEqual([]);
      renderBlocks(proc, 0.3);
      expect(keyed.map((k) => k.ev + (k.note ?? ''))).toEqual(['on62', 'off62', 'on60']);
      expect(Math.abs(keyed[0].at - (t0 + 0.05))).toBeLessThanOrEqual(1 / RATE);
      expect(Math.abs(keyed[2].at - (t0 + 0.17))).toBeLessThanOrEqual(1 / RATE);
    });

    it('a note with no time, a past time or an unusable time keys at once', () => {
      const { proc, keyed, synth } = wired(c);
      renderBlocks(proc, 0.01);
      synth.triggerAttack('C4', undefined, 0.8);
      synth.triggerAttack('D4', now - 0.02, 0.8);
      synth.triggerAttack('C4', NaN, 0.8);
      expect(keyed.map((k) => k.note)).toEqual([60, 62, 60]);
    });

    it.skipIf(c.mono)('All Notes Off on Stop cancels the rows already sent for later', () => {
      const { proc, keyed, synth } = wired(c);
      renderBlocks(proc, 0.01);
      synth.triggerAttack('C4', now + 0.1, 0.8);
      synth.triggerRelease(undefined, now);
      renderBlocks(proc, 0.2);
      expect(keyed.map((k) => k.ev)).toEqual(c.alloff ? ['alloff'] : []);
    });
  });
}

// FluidSynth: shared host worklet, channel-first exports and a render export that takes (left, right, frames)
// buffer pointers; a segment is the same buffers moved on by the frames already rendered.
describe('note scheduled ahead keeps its time on FluidSynth', () => {
  function wiredFluid(multi: boolean) {
    const src = inlineWorkletImports(readFileSync(resolve(ROOT, 'public/fluidsynth/FluidSynth.worklet.js'), 'utf8'), 'fluidsynth');
    let Processor!: new (o?: unknown) => Proc;
    const scope: Record<string, unknown> = {
      AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
      registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
    };
    new Function(...Object.keys(scope), src)(...Object.values(scope));
    const proc = new Processor({});
    const keyed: (Keyed & { channel: number })[] = [];
    const renders: { ptr: number; n: number }[] = [];
    let rendered = 0;
    const at = () => now + rendered / RATE;
    const heap = new Float32Array(8192);
    proc.module = {
      HEAPF32: heap,
      _fluidsynth_note_on: (ch: number, key: number) => keyed.push({ ev: 'on', note: key, at: at(), channel: ch }),
      _fluidsynth_note_off: (ch: number, key: number) => keyed.push({ ev: 'off', note: key, at: at(), channel: ch }),
      _fluidsynth_all_notes_off: (ch: number) => keyed.push({ ev: 'alloff', at: at(), channel: ch }),
      _fluidsynth_process: (l: number, _r: number, n: number) => { renders.push({ ptr: l, n }); rendered += n; },
      _fluidsynth_process_multi: (table: number, _l: number, _r: number, n: number) => {
        renders.push({ ptr: new Uint32Array(heap.buffer, table, 2)[0], n });
        rendered += n;
      },
    };
    Object.assign(proc, {
      initialized: true, _multi: multi, _groups: 1, _midiChannels: 16, _leftPtr: 1024, _rightPtr: 2048,
      _outPtrsPtr: 4096, _groupPtrs: [1024, 2048], _fxLPtr: 3072, _fxRPtr: 3584,
    });
    const origProcess = proc.process.bind(proc);
    proc.process = (i, o) => { rendered = 0; return origProcess(i, o); };
    const onmessage = (m: object) => (proc.port.onmessage as (e: unknown) => unknown)({ data: m });
    const synth = Object.create(FluidSynthSynthEngine.prototype);
    Object.assign(synth, { host: { post: onmessage }, slot: 3, held: new Map(), config: {} });
    return { proc, keyed, renders, synth };
  }
  const blocks = (proc: Proc, seconds: number, outs: () => Float32Array[][]) => {
    for (let b = 0; b < Math.ceil((seconds * RATE) / BLOCK); b++) { proc.process([], outs()); now += BLOCK / RATE; }
  };

  for (const multi of [false, true]) {
    const outs = () => (multi ? [[new Float32Array(BLOCK), new Float32Array(BLOCK)], [new Float32Array(BLOCK)]] : [[new Float32Array(BLOCK), new Float32Array(BLOCK)]]);
    describe(multi ? 'multi-output host' : 'stereo host', () => {
      it('two rows delivered together as one burst key at their own frames and split the render there', () => {
        const { proc, keyed, renders, synth } = wiredFluid(multi);
        blocks(proc, 0.01, outs);
        const t0 = now;
        synth.triggerAttack('D4', t0 + 0.05, 0.8);
        synth.triggerRelease('D4', t0 + 0.17);
        synth.triggerAttack('C4', t0 + 0.17, 0.8);
        expect(keyed).toEqual([]);
        renders.length = 0;
        blocks(proc, 0.3, outs);
        expect(keyed.map((k) => k.ev + (k.note ?? ''))).toEqual(['on62', 'off62', 'on60']);
        expect(keyed.every((k) => k.channel === 3)).toBe(true);
        expect(Math.abs(keyed[0].at - (t0 + 0.05))).toBeLessThanOrEqual(1 / RATE);
        expect(Math.abs(keyed[2].at - (t0 + 0.17))).toBeLessThanOrEqual(1 / RATE);
        // a shorter render moved on inside the block: the output pointer advanced past the block start
        expect(renders.some((r) => r.n < BLOCK && r.ptr > 1024 && r.ptr < 1024 + BLOCK * 4)).toBe(true);
      });

      it('a note with no time, a past time or an unusable time keys at once', () => {
        const { proc, keyed, synth } = wiredFluid(multi);
        blocks(proc, 0.01, outs);
        synth.triggerAttack('C4', undefined, 0.8);
        synth.triggerAttack('D4', now - 0.02, 0.8);
        synth.triggerAttack('C4', NaN, 0.8);
        expect(keyed.map((k) => k.note)).toEqual([60, 62, 60]);
      });

      it('All Notes Off cancels this channel only', () => {
        const { proc, keyed, synth } = wiredFluid(multi);
        blocks(proc, 0.01, outs);
        proc.port.onmessage!({ data: { type: 'noteOn', channel: 5, key: 70, velocity: 90, time: now + 0.1 } });
        synth.triggerAttack('C4', now + 0.1, 0.8);
        synth.triggerRelease(undefined, now);
        blocks(proc, 0.2, outs);
        expect(keyed.map((k) => `${k.ev}${k.note ?? ''}@${k.channel}`)).toEqual(['alloff@3', 'on70@5']);
      });
    });
  }
});

// Synths whose voices are JS classes (or a chip behind a hook): the worklet's own render-a-range method is replaced by a
// counter, so the frame a voice is keyed at is the frames rendered before it in the block.
describe('note scheduled ahead keeps its time on JS-voice synths', () => {
  type Rec = { ev: string; at: number };
  function loadJs(file: string, patchSrc?: (src: string) => string) {
    const dir = file.split('/')[1];
    let src = inlineWorkletImports(readFileSync(resolve(ROOT, file), 'utf8'), dir);
    if (patchSrc) src = patchSrc(src);
    let Processor!: new (o?: unknown) => Proc;
    const scope: Record<string, unknown> = {
      AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
      registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
    };
    new Function(...Object.keys(scope), src)(...Object.values(scope));
    const proc = new Processor({});
    const keyed: Rec[] = [];
    let rendered = 0;
    const at = () => now + rendered / RATE;
    const hookRange = (name: string, lenArg: (a: number[]) => number) => {
      proc[name] = (...a: number[]) => { rendered += lenArg(a); };
    };
    const origProcess = proc.process.bind(proc);
    proc.process = (i, o) => { rendered = 0; return origProcess(i, o); };
    const send = (m: object) => (proc.port.onmessage as (e: unknown) => unknown)({ data: m });
    return { proc, keyed, at, hookRange, send };
  }
  const names = (k: Rec[]) => k.map((r) => r.ev);
  const near = (a: number, b: number) => Math.abs(a - b) <= 1 / RATE;

  function burst(keyed: Rec[], proc: Proc, attackOff: () => void, evs: string[]) {
    renderBlocks(proc, 0.01);
    const t0 = now;
    attackOff();
    expect(keyed).toEqual([]);
    renderBlocks(proc, 0.3);
    expect(names(keyed)).toEqual(evs);
    expect(near(keyed[0].at, t0 + 0.05)).toBe(true);
    expect(near(keyed[keyed.length - 1].at, t0 + 0.17)).toBe(true);
  }

  describe('VL1', () => {
    function wiredVl1() {
      const { proc, keyed, at, hookRange, send } = loadJs('public/vl1/VL1.worklet.js');
      hookRange('renderRange', (a) => a[3] - a[2]);
      proc.voice = {
        noteOn: (f: number) => keyed.push({ ev: 'on' + (proc.freqTable as number[]).indexOf(f), at: at() }),
        noteOff: () => keyed.push({ ev: 'off', at: at() }),
      };
      const synth = Object.create(VL1SynthEngine.prototype);
      Object.assign(synth, { isInitialized: true, pendingNotes: [], _worklet: { port: { postMessage: send } } });
      return { proc, keyed, synth };
    }
    it('two rows delivered together as one burst key at their own frames', () => {
      const { proc, keyed, synth } = wiredVl1();
      burst(keyed, proc, () => {
        synth.triggerAttack('D4', now + 0.05, 0.8);
        synth.triggerRelease('D4', now + 0.17);
        synth.triggerAttack('C4', now + 0.17, 0.8);
      }, ['on62', 'off', 'on60']);
    });
    it('a note with no time, a past time or an unusable time keys at once', () => {
      const { proc, keyed, synth } = wiredVl1();
      renderBlocks(proc, 0.01);
      synth.triggerAttack('C4', undefined, 0.8);
      synth.triggerAttack('D4', now - 0.02, 0.8);
      synth.triggerAttack('C4', NaN, 0.8);
      expect(names(keyed)).toEqual(['on60', 'on62', 'on60']);
    });
  });

  describe('Pink Trombone', () => {
    function wiredPt() {
      const { proc, keyed, at, hookRange, send } = loadJs('public/pinktrombone/PinkTrombone.worklet.js');
      hookRange('renderSegment', (a) => a[3]);
      proc.voices = [];
      proc.allocateVoice = (note: number) => {
        const v = {
          active: true, note,
          applyParams: () => {},
          noteOn: () => keyed.push({ ev: 'on' + note, at: at() }),
          noteOff: () => { keyed.push({ ev: 'off' + note, at: at() }); v.active = false; },
        };
        (proc.voices as unknown[]).push(v);
        return v;
      };
      const synth = Object.create(PinkTromboneSynth.prototype);
      Object.assign(synth, { _workletNode: { port: { postMessage: send } }, _config: { tenseness: 0.6 } });
      return { proc, keyed, synth };
    }
    it('two rows delivered together as one burst key at their own frames', () => {
      const { proc, keyed, synth } = wiredPt();
      // The synth releases every voice at once (All Notes Off), which also cancels later rows: release first, then the next row
      burst(keyed, proc, () => {
        synth.triggerAttack('D4', now + 0.05, 0.8);
        synth.triggerRelease(now + 0.17);
        synth.triggerAttack('C4', now + 0.17, 0.8);
      }, ['on62', 'off62', 'on60']);
    });
    it('a note with no time, a past time or an unusable time keys at once', () => {
      const { proc, keyed, synth } = wiredPt();
      renderBlocks(proc, 0.01);
      synth.triggerAttack('C4', undefined, 0.8);
      synth.triggerAttack('D4', now - 0.02, 0.8);
      synth.triggerAttack('C4', NaN, 0.8);
      expect(names(keyed)).toEqual(['on60', 'on62', 'on60']);
    });
  });

  describe('CZ-101', () => {
    function wiredCz() {
      const { proc, keyed, at, hookRange, send } = loadJs('public/cz101/CZ101.worklet.js');
      hookRange('renderRange', (a) => a[3] - a[2]);
      proc.isInitialized = true;
      // Only the DCA envelope start (a note on) and the key-off are recorded; register writes ride the same queue
      proc.startEnvelope = (kind: number) => { if (kind === 0) keyed.push({ ev: 'on', at: at() }); };
      proc.keyOff = () => keyed.push({ ev: 'off', at: at() });
      proc.writeRegister = () => {};
      const synth = Object.create(CZ101Synth.prototype);
      Object.assign(synth, {
        workletNode: { port: { postMessage: send } }, isInitialized: true, allocationCounter: 0, knobs: {},
        basePatch: CZ101_PRESET_BANK[0].patch,
        voices: Array.from({ length: 8 }, () => ({ note: -1, velocity: 0, active: false, age: 0 })),
        waveBits: new Array(8).fill(0), modBits: new Array(8).fill(0), voiceLine: new Array(8).fill(0),
      });
      return { proc, keyed, synth };
    }
    it('two rows delivered together as one burst key at their own frames', () => {
      const { proc, keyed, synth } = wiredCz();
      renderBlocks(proc, 0.01);
      const t0 = now;
      synth.triggerAttack('D4', t0 + 0.05, 0.8);
      synth.triggerRelease('D4', t0 + 0.17);
      synth.triggerAttack('C4', t0 + 0.17, 0.8);
      expect(keyed).toEqual([]);
      renderBlocks(proc, 0.3);
      // A two-line patch keys two voices per note: compare the first and last event frames and the order of kinds
      expect(keyed[0].ev).toBe('on');
      expect(near(keyed[0].at, t0 + 0.05)).toBe(true);
      const firstOff = keyed.findIndex((k) => k.ev === 'off');
      expect(near(keyed[firstOff].at, t0 + 0.17)).toBe(true);
      expect(near(keyed[keyed.length - 1].at, t0 + 0.17)).toBe(true);
      expect(keyed[keyed.length - 1].ev).toBe('on');
    });
    it('a note with no time, a past time or an unusable time keys at once', () => {
      const { proc, keyed, synth } = wiredCz();
      renderBlocks(proc, 0.01);
      synth.triggerAttack('C4', undefined, 0.8);
      synth.triggerAttack('D4', now - 0.02, 0.8);
      synth.triggerAttack('C4', NaN, 0.8);
      renderBlocks(proc, 0.01);
      expect(keyed.filter((k) => k.ev === 'on').length).toBeGreaterThanOrEqual(3);
      expect(keyed.every((k) => k.at <= now)).toBe(true);
    });
  });

  describe('Monique', () => {
    function wiredMonique() {
      const { proc, keyed, at, send } = loadJs('public/monique/Monique.worklet.js');
      let rendered = 0;
      const base = at;
      void base;
      proc.synth = {
        noteOn: (n: number) => keyed.push({ ev: 'on' + n, at: now + rendered / RATE }),
        noteOff: (n: number) => keyed.push({ ev: 'off' + n, at: now + rendered / RATE }),
        allNotesOff: () => keyed.push({ ev: 'alloff', at: now + rendered / RATE }),
        process: (_l: number, _r: number, n: number) => { rendered += n; },
      };
      const origProcess = proc.process.bind(proc);
      proc.process = (i, o) => { rendered = 0; return origProcess(i, o); };
      Object.assign(proc, {
        isInitialized: true, outputPtrL: 0, outputPtrR: 512, _bufferSize: BLOCK,
        outputBufferL: new Float32Array(BLOCK), outputBufferR: new Float32Array(BLOCK),
        _wasmMemory: null, Module: { HEAPF32: { buffer: null } },
      });
      const synth = Object.create(MoniqueSynthEngine.prototype);
      Object.assign(synth, { isInitialized: true, pendingNotes: [], _currentNote: -1, _worklet: { port: { postMessage: send } } });
      return { proc, keyed, synth };
    }
    it('two rows delivered together as one burst key at their own frames', () => {
      const { proc, keyed, synth } = wiredMonique();
      renderBlocks(proc, 0.01);
      const t0 = now;
      synth.triggerAttack('D4', t0 + 0.05, 0.8);
      synth.triggerRelease(t0 + 0.17);
      synth.triggerAttack('C4', t0 + 0.17, 0.8);
      expect(keyed).toEqual([]);
      renderBlocks(proc, 0.3);
      // The synth sends noteOff and allNotesOff for the same time; allNotesOff cancels events at or after its time,
      // so the noteOff is dropped and allNotesOff alone releases the voice
      expect(names(keyed)).toEqual(['on62', 'alloff', 'on60']);
      expect(near(keyed[0].at, t0 + 0.05)).toBe(true);
      expect(near(keyed[1].at, t0 + 0.17)).toBe(true);
      expect(near(keyed[2].at, t0 + 0.17)).toBe(true);
    });
    it('a note with no time, a past time or an unusable time keys at once', () => {
      const { proc, keyed, synth } = wiredMonique();
      renderBlocks(proc, 0.01);
      synth.triggerAttack('C4', undefined, 0.8);
      synth.triggerAttack('D4', now - 0.02, 0.8);
      synth.triggerAttack('C4', NaN, 0.8);
      expect(names(keyed)).toEqual(['on60', 'on62', 'on60']);
    });
  });

  describe('Oidos', () => {
    function wiredOidos() {
      const keyed: Rec[] = [];
      let rendered = 0;
      const fake = {
        noteOn: (n: number) => keyed.push({ ev: 'on' + n, at: now + rendered / RATE }),
        noteOff: (n: number) => keyed.push({ ev: 'off' + n, at: now + rendered / RATE }),
      };
      (g as Record<string, unknown>).__oidosSynth = fake;
      const { proc, send } = loadJs('public/oidos/Oidos.worklet.js', (src) =>
        src.replace('let synth = null;', 'let synth = globalThis.__oidosSynth;').replace('let ready = false;', 'let ready = true;'));
      proc.renderSegment = (_from: number, len: number) => { rendered += len; };
      const origProcess = proc.process.bind(proc);
      proc.process = (i, o) => { rendered = 0; return origProcess(i, o); };
      const synth = Object.create(OidosSynth.prototype);
      Object.assign(synth, { workletNode: { port: { postMessage: send } } });
      return { proc, keyed, synth };
    }
    afterEach(() => { delete (g as Record<string, unknown>).__oidosSynth; });
    it('two rows delivered together as one burst key at their own frames', () => {
      const { proc, keyed, synth } = wiredOidos();
      burst(keyed, proc, () => {
        synth.triggerAttack('D4', now + 0.05, 0.8);
        synth.triggerRelease('D4', now + 0.17);
        synth.triggerAttack('C4', now + 0.17, 0.8);
      }, ['on62', 'off62', 'on60']);
    });
    it('a note with no time, a past time or an unusable time keys at once', () => {
      const { proc, keyed, synth } = wiredOidos();
      renderBlocks(proc, 0.01);
      synth.triggerAttack('C4', undefined, 0.8);
      synth.triggerAttack('D4', now - 0.02, 0.8);
      synth.triggerAttack('C4', NaN, 0.8);
      expect(names(keyed)).toEqual(['on60', 'on62', 'on60']);
    });
  });

  // The four WASM-backed worklets below render [from, from + len) by offsetting the output pointers
  const wasmHeap = () => ({ buffer: new ArrayBuffer(4096) });
  const bothCases = (wired: () => { proc: Proc; keyed: Rec[]; synth: { triggerAttack: (...a: unknown[]) => void; triggerRelease: (...a: unknown[]) => void } }, evs: string[]) => {
    it('two rows delivered together as one burst key at their own frames', () => {
      const { proc, keyed, synth } = wired();
      burst(keyed, proc, () => {
        synth.triggerAttack('D4', now + 0.05, 0.8);
        synth.triggerRelease('D4', now + 0.17);
        synth.triggerAttack('C4', now + 0.17, 0.8);
      }, evs);
    });
    it('a note with no time, a past time or an unusable time keys at once', () => {
      const { proc, keyed, synth } = wired();
      renderBlocks(proc, 0.01);
      synth.triggerAttack('C4', undefined, 0.8);
      synth.triggerAttack('D4', now - 0.02, 0.8);
      synth.triggerAttack('C4', NaN, 0.8);
      expect(names(keyed).filter((n) => n.startsWith('on'))).toEqual(['on60', 'on62', 'on60']);
    });
  };

  describe('RD Piano', () => {
    function wiredRdPiano() {
      const { proc, keyed, send } = loadJs('public/rdpiano/RdPiano.worklet.js');
      let rendered = 0;
      const heap = wasmHeap();
      proc.synth = {
        noteOn: (n: number) => keyed.push({ ev: 'on' + n, at: now + rendered / RATE }),
        noteOff: (n: number) => keyed.push({ ev: 'off' + n, at: now + rendered / RATE }),
        processJS: (_l: number, _r: number, len: number) => { rendered += len; },
      };
      proc.Module = { HEAPF32: heap };
      proc.outputBufferL = new Float32Array(heap.buffer, 0, 128);
      proc.outputBufferR = new Float32Array(heap.buffer, 512, 128);
      proc.isInitialized = true;
      const origProcess = proc.process.bind(proc);
      proc.process = (i, o) => { rendered = 0; return origProcess(i, o); };
      const synth = Object.create(RdPianoSynth.prototype);
      Object.assign(synth, { isInitialized: true, romLoadError: null, pendingNotes: [], _worklet: { port: { postMessage: send } } });
      return { proc, keyed, synth };
    }
    bothCases(wiredRdPiano, ['on62', 'off62', 'on60']);
  });

  function wiredGlobals(file: string, prefix: string, onName: string, offName: string, renderName: string, Synth: { prototype: object }, synthState: object) {
    const keyed: Rec[] = [];
    let rendered = 0;
    const at = () => now + rendered / RATE;
    (g as Record<string, unknown>).__wasmFake = {
      on: (_s: unknown, n: number) => keyed.push({ ev: 'on' + n, at: at() }),
      off: (_s: unknown, n: number) => keyed.push({ ev: 'off' + n, at: at() }),
      render: (_s: unknown, _l: number, _r: number, len: number) => { rendered += len; },
      Module: { HEAPF32: new Float32Array(2048) },
    };
    const { proc, send } = loadJs(file, (src) =>
      src.replace('let ready = false;', 'let ready = true;').replace('let synth = null;', 'let synth = {};')
        .replace('let Module = null;', 'let Module = globalThis.__wasmFake.Module;')
        .replace(`let ${prefix}${onName} = null;`, `let ${prefix}${onName} = globalThis.__wasmFake.on;`)
        .replace(`let ${prefix}${offName} = null;`, `let ${prefix}${offName} = globalThis.__wasmFake.off;`)
        .replace(`let ${prefix}${renderName} = null;`, `let ${prefix}${renderName} = globalThis.__wasmFake.render;`));
    const origProcess = proc.process.bind(proc);
    proc.process = (i, o) => { rendered = 0; return origProcess(i, o); };
    const synth = Object.create(Synth.prototype);
    Object.assign(synth, { workletNode: { port: { postMessage: send } }, ...synthState });
    return { proc, keyed, synth };
  }
  afterEach(() => { delete (g as Record<string, unknown>).__wasmFake; });

  describe('Tunefish', () => {
    bothCases(() => wiredGlobals('public/tunefish/Tunefish.worklet.js', 'tunefish_', 'note_on', 'note_off', 'render', TunefishSynth, {}), ['on62', 'off62', 'on60']);
  });

  describe('WaveSabre', () => {
    bothCases(() => wiredGlobals('public/wavesabre/WaveSabre.worklet.js', 'wavesabre_', 'note_on', 'note_off', 'render', WaveSabreSynth, {}), ['on62', 'off62', 'on60']);
  });

  describe('OpenWurli', () => {
    function wiredOpenWurli() {
      const { proc, keyed, send } = loadJs('public/openwurli/OpenWurli.worklet.js');
      let rendered = 0;
      proc.ready = true;
      proc.module = {
        HEAPF32: new Float32Array(2048),
        _owNoteOn: (n: number) => keyed.push({ ev: 'on' + n, at: now + rendered / RATE }),
        _owNoteOff: (n: number) => keyed.push({ ev: 'off' + n, at: now + rendered / RATE }),
        _owProcess: (_l: number, _r: number, len: number) => { rendered += len; },
      };
      const origProcess = proc.process.bind(proc);
      proc.process = (i, o) => { rendered = 0; return origProcess(i, o); };
      const synth = Object.create(OpenWurliSynth.prototype);
      Object.assign(synth, { _disposed: false, post: send });
      return { proc, keyed, synth };
    }
    bothCases(wiredOpenWurli, ['on62', 'off62', 'on60']);
  });

  describe('OPL3', () => {
    function wiredOpl3() {
      const { proc, keyed, send } = loadJs('public/opl3/OPL3.worklet.js');
      let rendered = 0;
      proc.ready = true;
      proc.module = {
        HEAPF32: new Float32Array(2048),
        _oplNoteOn: (n: number) => keyed.push({ ev: 'on' + n, at: now + rendered / RATE }),
        _oplNoteOff: (n: number) => keyed.push({ ev: 'off' + n, at: now + rendered / RATE }),
        _oplProcess: (_l: number, _r: number, len: number) => { rendered += len; },
      };
      const origProcess = proc.process.bind(proc);
      proc.process = (i, o) => { rendered = 0; return origProcess(i, o); };
      const synth = Object.create(OPL3Synth.prototype);
      Object.assign(synth, { _unmuted: true, _channelIndex: -1, output: { gain: { value: 1 } }, send });
      return { proc, keyed, synth };
    }
    bothCases(wiredOpl3, ['on62', 'off62', 'on60']);
  });
});
