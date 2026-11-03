/**
 * RH-TRIGGER-RELEASE (2026-10-14): MCP trigger_note with a duration was silent on Rob Hubbard.
 *
 * ToneEngine calls triggerRelease(note, now + duration); RobHubbardSynth ignored the time and posted noteOff at once,
 * so the note was cut the moment it started. The release now rides the shared scheduled-messages layer: the noteOff
 * message carries `atTime` and the worklet holds it until that audio time.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('Rob Hubbard timed notes', () => {
  beforeEach(() => { sent.length = 0; clock = 10; });

  async function synth() {
    const s = new RobHubbardSynth();
    await s.setInstrument({ sampleLen: 2, loopOffset: -1, sampleVolume: 64, relative: 1, divider: 0, vibratoIdx: 0, hiPos: 0, loPos: 0, vibTable: [], sampleData: [1, 2] });
    sent.length = 0;
    return s;
  }

  it('hands the release time to the worklet, which holds the noteOff until then', async () => {
    const s = await synth();
    s.triggerAttack('C-3', 10, 1);
    s.triggerRelease('C-3', 12);          // two seconds from now
    const offs = sent.filter((m) => m.type === 'noteOff') as Array<{ atTime?: number }>;
    expect(offs.map((m) => m.atTime)).toEqual([12]);
  });

  it('a release without a time carries no atTime, so it applies at once', async () => {
    const s = await synth();
    s.triggerRelease('C-3');
    const offs = sent.filter((m) => m.type === 'noteOff') as Array<{ atTime?: number }>;
    expect(offs.map((m) => m.atTime)).toEqual([undefined]);
  });
});
