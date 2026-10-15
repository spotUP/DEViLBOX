/**
 * Wiring: loading a voice into DX7Synth (selectVoice / programChange / loadSysex) reads the voice the firmware now plays and sets the
 * output trim from dx7Loudness; a parameter edit (setVcedParam) does not touch it. The audio context and the worklet are stubs;
 * the sentinel is the trim gain node's value.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const makeGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });
vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ({ createGain: makeGain, sampleRate: 48000 }),
  noteToMidi: (n: number) => n,
}));

import { DX7Synth } from '../DX7Synth';
import { dx7VoiceTrimDb } from '../dx7Loudness';
import { inspectDX7Sysex } from '../dx7sysex';

const LIB = resolve(__dirname, '../../../../public/data/sysex/dx7');
const patches = inspectDX7Sysex(new Uint8Array(readFileSync(resolve(LIB, 'dexed-dexed-01.syx')))).patches;

type Peek = { trim: { gain: { value: number } }; _ready: boolean; workletNode: unknown; send: (m: unknown) => void };
let synth: DX7Synth;
let firmwareVoice: Uint8Array;
let sent: unknown[];

beforeEach(() => {
  vi.useFakeTimers();
  (vi.spyOn(DX7Synth.prototype as unknown as { initWorklet: () => void }, 'initWorklet')).mockImplementation(() => {});
  synth = new DX7Synth();
  sent = [];
  const peek = synth as unknown as Peek;
  peek._ready = true;
  peek.workletNode = { port: { postMessage: (m: unknown) => sent.push(m) }, disconnect: () => {} };
  firmwareVoice = patches[0].data;
  vi.spyOn(synth, 'readVoice').mockImplementation(async () => firmwareVoice);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const trimGain = () => (synth as unknown as Peek).trim.gain.value;

describe('DX7Synth output trim', () => {
  it('selecting a voice sets the trim of the voice the firmware reports, and a different voice gets a different trim', async () => {
    const loud = patches.map(p => dx7VoiceTrimDb(p.data));
    const a = loud.findIndex(t => t < -2);
    const b = loud.findIndex(t => t > 2);
    expect(a, 'the bank has a loud and a quiet voice').toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
    firmwareVoice = patches[a].data;
    synth.selectVoice(a);
    await vi.advanceTimersByTimeAsync(300);
    expect(20 * Math.log10(trimGain())).toBeCloseTo(loud[a], 4);
    firmwareVoice = patches[b].data;
    synth.selectVoice(b);
    await vi.advanceTimersByTimeAsync(300);
    expect(20 * Math.log10(trimGain())).toBeCloseTo(loud[b], 4);
  });

  it('a bulk load and a program change reach the trim too; a knob edit does not move it', async () => {
    const quiet = patches.findIndex(p => dx7VoiceTrimDb(p.data) > 2);
    firmwareVoice = patches[quiet].data;
    synth.loadSysex(new ArrayBuffer(4104));
    await vi.advanceTimersByTimeAsync(300);
    const afterLoad = trimGain();
    expect(afterLoad).toBeGreaterThan(1.2);
    firmwareVoice = patches.find(p => dx7VoiceTrimDb(p.data) < -2)!.data;
    synth.setVcedParam(16, 50);
    await vi.advanceTimersByTimeAsync(600);
    expect(trimGain()).toBe(afterLoad);
    synth.programChange(2);
    await vi.advanceTimersByTimeAsync(300);
    expect(trimGain()).toBeLessThan(afterLoad);
  });
});
