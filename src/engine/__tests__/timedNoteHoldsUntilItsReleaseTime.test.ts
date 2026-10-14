/**
 * RH-TRIGGER-RELEASE (2026-10-14): MCP trigger_note with a duration was silent on Rob Hubbard.
 *
 * ToneEngine calls triggerRelease(note, now + duration); RobHubbardSynth ignored the time and posted noteOff at once,
 * so the note was cut the moment it started. The release must reach the worklet at the requested audio time.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sent: Array<{ type: string }> = [];
let clock = 10;

vi.mock('@/utils/audio-context', async (orig) => {
  const actual = await orig<typeof import('@/utils/audio-context')>();
  const gain = () => ({ gain: { value: 1 }, connect() {}, disconnect() {} });
  return { ...actual, getDevilboxAudioContext: () => ({ createGain: gain }), audioNow: () => clock };
});
vi.mock('../robhubbard/RobHubbardEngine', () => ({
  RobHubbardEngine: {
    getInstance: () => ({
      output: { connect() {}, disconnect() {} },
      ready: async () => {},
      sendMessage: (m: { type: string }) => { sent.push(m); },
      waitForPlayerHandle: async () => 0,
    }),
  },
}));

import { RobHubbardSynth } from '../robhubbard/RobHubbardSynth';

const noteOffs = () => sent.filter((m) => m.type === 'noteOff').length;

describe('Rob Hubbard timed notes', () => {
  beforeEach(() => { sent.length = 0; clock = 10; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  async function synth() {
    const s = new RobHubbardSynth();
    await s.setInstrument({ sampleLen: 2, loopOffset: -1, sampleVolume: 64, relative: 1, divider: 0, vibratoIdx: 0, hiPos: 0, loPos: 0, vibTable: [], sampleData: [1, 2] });
    sent.length = 0;
    return s;
  }

  it('does not cut a note with a duration at once', async () => {
    const s = await synth();
    s.triggerAttack('C-3', 10, 1);
    s.triggerRelease('C-3', 12);          // two seconds from now
    expect(noteOffs()).toBe(0);
    vi.advanceTimersByTime(1900);
    expect(noteOffs()).toBe(0);
    vi.advanceTimersByTime(200);
    expect(noteOffs()).toBe(1);
  });

  it('still releases at once without a time or with a time already past', async () => {
    const s = await synth();
    s.triggerRelease('C-3');
    s.triggerRelease('C-3', 9);
    expect(noteOffs()).toBe(2);
  });

  it('a new note cancels the release left over from the previous one', async () => {
    const s = await synth();
    s.triggerAttack('C-3', 10, 1);
    s.triggerRelease('C-3', 11);
    s.triggerAttack('D-3', 10.5, 1);
    vi.advanceTimersByTime(5000);
    expect(noteOffs()).toBe(0);
  });
});
