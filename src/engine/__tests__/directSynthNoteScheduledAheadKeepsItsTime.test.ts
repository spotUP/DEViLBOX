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
import { ZynAddSubFXSynthEngine } from '@/engine/zynaddsubfx/ZynAddSubFXSynth';

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
