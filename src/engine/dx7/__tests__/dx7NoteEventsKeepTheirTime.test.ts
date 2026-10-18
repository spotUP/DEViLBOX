/**
 * DX7 notes sounded when their message arrived, not at the time the replayer
 * scheduled them. DX7Synth.triggerAttack/triggerRelease dropped `time`, and
 * public/dx7/DX7.worklet.js keyed the firmware on arrival. A main-thread stall
 * delivered pattern rows 4 and 6 about 30 ms apart, so they flammed (heard as a
 * double trigger). The synth must send the time and the worklet must hold a
 * note sent ahead until the host frame it is due.
 *
 * The worklet runs as the real public/dx7/DX7.worklet.js in a stand-in
 * AudioWorkletGlobalScope with a recording stand-in for the firmware exports.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/utils/audio-context', () => ({ getDevilboxAudioContext: () => ({}), noteToMidi: () => 60 }));
import { DX7Synth } from '@/engine/dx7/DX7Synth';

const ROOT = resolve(__dirname, '../../../..');
const RATE = 48000;
const BLOCK = 128;

type Proc = {
  port: { onmessage: ((e: { data: unknown }) => unknown) | null };
  process: (inputs: unknown[], outputs: Float32Array[][]) => boolean;
  [k: string]: unknown;
};

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

function loadWorklet(): { proc: Proc; keyed: Array<{ ev: string; note?: number; at: number }> } {
  let Processor!: new () => Proc;
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: () => {}, onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
  };
  new Function(...Object.keys(scope), readFileSync(resolve(ROOT, 'public/dx7/DX7.worklet.js'), 'utf8'))(...Object.values(scope));
  const proc = new Processor();
  const keyed: Array<{ ev: string; note?: number; at: number }> = [];
  proc.ready = true;
  proc.module = {
    _dx7NoteOn: (note: number) => keyed.push({ ev: 'on', note, at: now }),
    _dx7NoteOff: (note: number) => keyed.push({ ev: 'off', note, at: now }),
    _dx7AllNotesOff: () => keyed.push({ ev: 'alloff', at: now }),
  };
  // Silent native buffer; the resampler only needs samples to read.
  proc.nativeBufL = new Float32Array(BLOCK);
  proc.nativeBufR = new Float32Array(BLOCK);
  proc.fillNativeBuffer = () => { proc.nativeBufFilled = BLOCK; proc.nativeReadIdx = 0; };
  return { proc, keyed };
}

/** Render one host frame per process() call, so a keyed event's `now` is its frame time. */
function renderSeconds(proc: Proc, seconds: number) {
  const frames = Math.ceil(seconds * RATE);
  for (let f = 0; f < frames; f++) {
    proc.process([], [[new Float32Array(1), new Float32Array(1)]]);
    now += 1 / RATE;
  }
}

const post = (p: Proc, msg: object) => p.port.onmessage?.({ data: msg });

describe('DX7 note events keep their scheduled time', () => {
  it('a note-on delivered early waits for its frame; two rows delivered together stay apart', () => {
    const { proc, keyed } = loadWorklet();
    renderSeconds(proc, 0.01);
    const t0 = now;
    // A stall delivers row 4 and row 6 in one burst, 120 ms apart in song time.
    post(proc, { type: 'noteOn', note: 62, velocity: 100, time: t0 + 0.05 });
    post(proc, { type: 'noteOff', note: 62, time: t0 + 0.17 });
    post(proc, { type: 'noteOn', note: 60, velocity: 100, time: t0 + 0.17 });
    expect(keyed).toEqual([]);
    renderSeconds(proc, 0.3);
    expect(keyed.map((k) => k.ev + (k.note ?? ''))).toEqual(['on62', 'off62', 'on60']);
    const frame = 1 / RATE;
    expect(Math.abs(keyed[0].at - (t0 + 0.05))).toBeLessThanOrEqual(frame);
    expect(Math.abs(keyed[2].at - (t0 + 0.17))).toBeLessThanOrEqual(frame);
  });

  it('a note whose time has passed or that has no time keys at once', () => {
    const { proc, keyed } = loadWorklet();
    renderSeconds(proc, 0.01);
    post(proc, { type: 'noteOn', note: 60, velocity: 100, time: now - 0.02 });
    post(proc, { type: 'noteOn', note: 64, velocity: 100 });
    expect(keyed.map((k) => k.ev + k.note)).toEqual(['on60', 'on64']);
  });

  it('All Notes Off on Stop cancels the rows already sent for later', () => {
    const { proc, keyed } = loadWorklet();
    renderSeconds(proc, 0.01);
    post(proc, { type: 'noteOn', note: 60, velocity: 100, time: now + 0.1 });
    post(proc, { type: 'allNotesOff' });
    renderSeconds(proc, 0.2);
    expect(keyed.map((k) => k.ev)).toEqual(['alloff']);
  });

  it('a note with no usable time keys at once and never blocks the notes after it', () => {
    const { proc, keyed } = loadWorklet();
    renderSeconds(proc, 0.01);
    post(proc, { type: 'noteOn', note: 60, velocity: 100, time: NaN });
    post(proc, { type: 'noteOn', note: 62, velocity: 100, time: Infinity });
    post(proc, { type: 'noteOn', note: 64, velocity: 100, time: now + 0.05 });
    renderSeconds(proc, 0.1);
    expect(keyed.map((k) => k.note)).toEqual([60, 62, 64]);
  });

  it('DX7Synth sends the scheduled time with note-on, note-off and All Notes Off', () => {
    const sent: Array<Record<string, unknown>> = [];
    // A DX7Synth without its worklet: only the messages it sends matter here.
    const synth = Object.create(DX7Synth.prototype) as DX7Synth;
    Object.assign(synth, {
      send: (m: Record<string, unknown>) => sent.push(m), audioContext: { currentTime: 1 },
    });
    synth.triggerAttack(60, 2.5, 1);
    synth.triggerRelease(60, 3);
    synth.triggerRelease(undefined, 4);
    synth.triggerAttackRelease(60, 0.5, 5);
    expect(sent.map((m) => [m.type, m.time])).toEqual([
      ['noteOn', 2.5], ['noteOff', 3], ['allNotesOff', 4], ['noteOn', 5], ['noteOff', 5.5],
    ]);
  });
});
