/**
 * A note scheduled ahead keeps its time on the MDA JX10, DX10 and ePiano synths. The synths dropped the
 * `time` argument of triggerAttack/triggerRelease and their worklets keyed the engine on message arrival,
 * so a main-thread stall delivered pattern rows late and bunched (flam). The synth must send the time and
 * the real worklet must hold the note until the host frame it is due, and key it at that frame inside the block.
 *
 * Each worklet runs as the real public/*.worklet.js in a stand-in AudioWorkletGlobalScope (its import of the
 * shared queue is inlined) with a recording stand-in for the WASM exports.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => ({}), noteToMidi: (n: string) => (n === 'C4' ? 60 : 62) }));
import { inlineWorkletImports } from '@/engine/__tests__/workletHarness';
import { MdaJX10Synth } from '@/engine/mda-jx10/MdaJX10Synth';
import { MdaDX10Synth } from '@/engine/mda-dx10/MdaDX10Synth';
import { MdaEPianoSynth } from '@/engine/mda-epiano/MdaEPianoSynth';

const ROOT = resolve(__dirname, '../../../..');
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

const CASES = [
  { name: 'JX10', prefix: 'jx10', file: 'public/mda-jx10/MdaJX10.worklet.js', Synth: MdaJX10Synth },
  { name: 'DX10', prefix: 'dx10', file: 'public/mda-dx10/MdaDX10.worklet.js', Synth: MdaDX10Synth },
  { name: 'ePiano', prefix: 'epiano', file: 'public/mda-epiano/MdaEPiano.worklet.js', Synth: MdaEPianoSynth },
] as const;

function loadWorklet(file: string, prefix: string) {
  const src = inlineWorkletImports(readFileSync(resolve(ROOT, file), 'utf8'), file.split('/')[1]);
  let Processor!: new () => Proc;
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
  };
  new Function(...Object.keys(scope), src)(...Object.values(scope));
  const proc = new Processor();
  const keyed: Keyed[] = [];
  // The engine renders `n` samples starting at the current frame: record the frame each key lands on.
  let renderedInBlock = 0;
  proc.engine = 1;
  proc.initialized = true;
  proc.bufferSize = BLOCK;
  proc.outputBufferL = new Float32Array(BLOCK);
  proc.outputBufferR = new Float32Array(BLOCK);
  proc.updateBufferViews = () => {};
  proc.reportVoices = () => {};
  proc.module = {
    [`_${prefix}_note_on`]: (_e: number, note: number) => keyed.push({ ev: 'on', note, at: now + renderedInBlock / RATE }),
    [`_${prefix}_note_off`]: (_e: number, note: number) => keyed.push({ ev: 'off', note, at: now + renderedInBlock / RATE }),
    [`_${prefix}_all_notes_off`]: () => keyed.push({ ev: 'alloff', at: now + renderedInBlock / RATE }),
    [`_${prefix}_process`]: (_e: number, _l: number, _r: number, n: number) => { renderedInBlock += n; },
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

for (const c of CASES) {
  describe(`note scheduled ahead keeps its time on ${c.name}`, () => {
    function wired() {
      const { proc, keyed } = loadWorklet(c.file, c.prefix);
      // The synth without its AudioWorkletNode: its posted messages go to the real worklet message handler.
      const synth = Object.create(c.Synth.prototype) as InstanceType<typeof c.Synth>;
      Object.assign(synth, { isInitialized: true, _worklet: { port: { postMessage: (m: object) => proc.port.onmessage?.({ data: m }) } } });
      return { proc, keyed, synth };
    }

    it('two rows delivered together as one burst key at their own frames', () => {
      const { proc, keyed, synth } = wired();
      renderBlocks(proc, 0.01);
      const t0 = now;
      synth.triggerAttack('D4', t0 + 0.05, 0.8);
      synth.triggerRelease('D4', t0 + 0.17);
      synth.triggerAttack('C4', t0 + 0.17, 0.8);
      expect(keyed).toEqual([]);
      renderBlocks(proc, 0.3);
      expect(keyed.map((k) => k.ev + (k.note ?? ''))).toEqual(['on62', 'off62', 'on60']);
      expect(Math.abs(keyed[0].at - (t0 + 0.05))).toBeLessThanOrEqual(1 / RATE);
      expect(Math.abs(keyed[2].at - (t0 + 0.17))).toBeLessThanOrEqual(1 / RATE);
    });

    it('a note with no time, a past time or an unusable time keys at once', () => {
      const { proc, keyed, synth } = wired();
      renderBlocks(proc, 0.01);
      synth.triggerAttack('C4', undefined, 0.8);
      synth.triggerAttack('D4', now - 0.02, 0.8);
      synth.triggerAttack('C4', NaN, 0.8);
      expect(keyed.map((k) => k.note)).toEqual([60, 62, 60]);
    });

    it('All Notes Off on Stop cancels the rows already sent for later', () => {
      const { proc, keyed, synth } = wired();
      renderBlocks(proc, 0.01);
      synth.triggerAttack('C4', now + 0.1, 0.8);
      synth.triggerRelease(undefined, now);
      renderBlocks(proc, 0.2);
      expect(keyed.map((k) => k.ev)).toEqual(['alloff']);
    });
  });
}
