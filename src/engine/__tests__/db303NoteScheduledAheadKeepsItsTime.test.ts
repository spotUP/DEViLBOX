/**
 * DB303 keeps the time the replayer scheduled a note for. triggerAttack dropped its time argument (the note
 * message carried the current clock), so every row keyed on arrival. The worklet's noteOn also cancelled
 * EVERY queued gate-off, including the previous note's, which is due before the new note. Runs the real
 * public/db303/DB303.worklet.js with a recording stand-in for the WASM engine; the synth posts into it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/utils/audio-context', async (orig) => ({
  ...(await orig<object>()),
  getDevilboxAudioContext: () => ({}),
  audioNow: () => now,
  noteToMidi: (n: string) => (n === 'C4' ? 60 : 62),
}));
import { DB303Synth } from '@/engine/db303/DB303Synth';

const ROOT = resolve(__dirname, '../../..');
const RATE = 48000;
const BLOCK = 128;

type Proc = {
  port: { onmessage: ((e: { data: unknown }) => unknown) | null };
  process: (inputs: unknown[], outputs: Float32Array[][]) => boolean;
  [k: string]: unknown;
};
type Keyed = { ev: string; note: number; vel?: number; at: number };

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
  const src = readFileSync(resolve(ROOT, 'public/db303/DB303.worklet.js'), 'utf8');
  let Processor!: new (o?: unknown) => Proc;
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
  };
  new Function(...Object.keys(scope), src)(...Object.values(scope));
  const proc = new Processor({});
  const keyed: Keyed[] = [];
  let rendered = 0;
  const at = () => now + rendered / RATE;
  proc.initialized = true;
  proc.module = { HEAPF32: new Float32Array(4096) };
  proc.synth = {
    noteOn: (note: number, vel: number) => keyed.push({ ev: 'on', note, vel, at: at() }),
    noteOff: (note: number) => keyed.push({ ev: 'off', note, at: at() }),
    allNotesOff: () => {},
    process: (n: number) => { rendered += n; },
    getOutputBufferPtr: () => 0,
  };
  const origProcess = proc.process.bind(proc);
  proc.process = (i, o) => { rendered = 0; return origProcess(i, o); };
  const onmessage = (m: object) => (proc.port.onmessage as (e: unknown) => unknown)({ data: m });
  const synth = Object.create(DB303Synth.prototype);
  Object.assign(synth, { workletNode: { port: { postMessage: onmessage } }, _disposed: false, _releaseTimeout: null });
  return { proc, keyed, synth: synth as DB303Synth };
}

function renderBlocks(proc: Proc, seconds: number) {
  const blocks = Math.ceil((seconds * RATE) / BLOCK);
  for (let b = 0; b < blocks; b++) {
    proc.process([], [[new Float32Array(BLOCK), new Float32Array(BLOCK)]]);
    now += BLOCK / RATE;
  }
}

const frame = (t: number) => Math.ceil(t * RATE) / RATE;

describe('note scheduled ahead keeps its time on DB303', () => {
  it('two rows delivered together key at their own frames; accent and slide survive the queue', () => {
    const { proc, keyed, synth } = wired();
    synth.triggerAttack('C4', 0.1, 1, true, false);
    synth.triggerAttack('D4', 0.2, 0.5, false, true);
    renderBlocks(proc, 0.05);
    expect(keyed).toEqual([]);
    renderBlocks(proc, 0.3);
    const ons = keyed.filter((k) => k.ev === 'on');
    expect(ons.map((k) => k.note)).toEqual([60, 62]);
    expect(ons[0].at).toBeCloseTo(frame(0.1), 6);
    expect(ons[1].at).toBeCloseTo(frame(0.2), 6);
    expect(ons[0].vel).toBe(127);
    // slide: the first note is held (no noteOff of 60 before the second noteOn)
    expect(keyed.some((k) => k.ev === 'off')).toBe(false);
    expect(ons[1].vel).toBeLessThan(100);
  });

  it('a gate-off due before the next scheduled note is not cancelled by that note', () => {
    const { proc, keyed, synth } = wired();
    synth.triggerAttack('C4', 0.1, 1, false, false);
    synth.triggerRelease(0.15);
    synth.triggerAttack('D4', 0.2, 1, false, false);
    renderBlocks(proc, 0.4);
    const offs = keyed.filter((k) => k.ev === 'off' && k.note === 60);
    expect(offs.length).toBeGreaterThan(0);
    expect(offs[0].at).toBeCloseTo(frame(0.15), 6);
  });
});
