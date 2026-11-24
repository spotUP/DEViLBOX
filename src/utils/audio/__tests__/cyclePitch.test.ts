import { describe, it, expect } from 'vitest';
import * as Tone from 'tone';
import { cyclePitch } from '../cyclePitch';

const freqOf = (p: { baseNote: string; detune: number }) => Tone.Frequency(p.baseNote).toFrequency() * 2 ** (p.detune / 1200);

describe('cyclePitch', () => {
  it('cycle 64 at 48000 Hz (750 Hz) is F#5 plus cents', () => {
    const p = cyclePitch(48000, 64);
    expect(p.baseNote).toBe('F#5');
    expect(freqOf(p)).toBeCloseTo(750, -0.5);
  });
  it('cycle 128 and 256 are one and two octaves lower with the same cents', () => {
    const a = cyclePitch(48000, 64), b = cyclePitch(48000, 128), c = cyclePitch(48000, 256);
    expect([b.baseNote, c.baseNote]).toEqual(['F#4', 'F#3']);
    expect([b.detune, c.detune]).toEqual([a.detune, a.detune]);
  });
  it('Sampler rate for C4 (C4 / baseNote) is within the stored cents of C4 / cycle freq', () => {
    const p = cyclePitch(48000, 64);
    const rate = Tone.Frequency('C4').toFrequency() / Tone.Frequency(p.baseNote).toFrequency();
    expect(rate * 2 ** (-p.detune / 1200)).toBeCloseTo(Tone.Frequency('C4').toFrequency() / 750, 3);
  });
});
