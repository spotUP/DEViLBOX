/**
 * The pitch rule Sub Harmonic uses to decide which note its pulse lands on.
 * Pure, so it is covered without an AudioContext.
 */

import { describe, it, expect } from 'vitest';
import { detectLowFundamental, SubPitchTracker, SUB_MIN_HZ, SUB_MAX_HZ } from '../lowFundamental';

const RATE = 48000;
const FFT = 8192;
const BIN_HZ = RATE / FFT; // 5.859 Hz

/** A spectrum with one strong partial at `hz` and -80 dB elsewhere. */
function spectrumAt(hz: number, peakDb = -20): Float32Array {
  const bins = FFT / 2;
  const out = new Float32Array(bins).fill(-100);
  const bin = Math.round(hz / BIN_HZ);
  for (let i = Math.max(0, bin - 1); i <= Math.min(bins - 1, bin + 1); i++) out[i] = -80;
  out[bin] = peakDb;
  return out;
}

describe('detectLowFundamental', () => {
  it('finds the pitch of the low content it is given', () => {
    // Deliberately off-bin: 43.65 Hz is F1, not a multiple of the 5.859 Hz bin.
    const hz = detectLowFundamental(spectrumAt(43.65), RATE, FFT);
    expect(hz).not.toBeNull();
    expect(hz!).toBeGreaterThan(41);
    expect(hz!).toBeLessThan(46);
  });

  it('resolves a half-semitone apart — finer than one bin, so the pulse cannot slide', () => {
    // The whole point of the parabolic refinement. Without it both of these
    // land on the same integer bin and the sub wobbles between notes.
    const low = detectLowFundamental(spectrumAt(55), RATE, FFT)!;
    const high = detectLowFundamental(spectrumAt(58.27), RATE, FFT)!;
    expect(Math.abs(high - low)).toBeGreaterThan(2);
  });

  it('returns null when the band is silent, rather than inventing a pitch', () => {
    expect(detectLowFundamental(new Float32Array(FFT / 2).fill(-120), RATE, FFT)).toBeNull();
  });

  it('returns null when the band is merely quiet, not silent', () => {
    expect(detectLowFundamental(new Float32Array(FFT / 2).fill(-86), RATE, FFT)).toBeNull();
  });

  it('ignores energy above the band — a hat must not become the fundamental', () => {
    const bins = FFT / 2;
    const out = new Float32Array(bins).fill(-100);
    // A loud hi-hat at 8 kHz, nothing at all in the sub band.
    out[Math.round(8000 / BIN_HZ)] = -5;
    expect(detectLowFundamental(out, RATE, FFT)).toBeNull();
  });

  it('clamps a detection that lands outside the sub range', () => {
    // A partial just under the ceiling should not be reported above it.
    const hz = detectLowFundamental(spectrumAt(SUB_MAX_HZ + 2), RATE, FFT)!;
    expect(hz).toBeLessThanOrEqual(SUB_MAX_HZ);
  });

  it('reads the sub range rather than the whole spectrum', () => {
    const hz = detectLowFundamental(spectrumAt(44), RATE, FFT)!;
    expect(hz).toBeGreaterThanOrEqual(SUB_MIN_HZ);
  });

  it('survives a degenerate spectrum without throwing', () => {
    expect(() => detectLowFundamental(new Float32Array(4), RATE, FFT)).not.toThrow();
    expect(detectLowFundamental(new Float32Array(0), RATE, FFT)).toBeNull();
    expect(detectLowFundamental(spectrumAt(50), 0, FFT)).toBeNull();
  });
});

describe('SubPitchTracker', () => {
  it('has no pitch before it has heard one', () => {
    expect(new SubPitchTracker().read(0)).toBeNull();
  });

  it('adopts the first pitch it is offered', () => {
    const t = new SubPitchTracker();
    t.offer(55);
    expect(t.read(0)).toBeCloseTo(55, 1);
  });

  it('holds the pitch through the gap between bass notes', () => {
    const t = new SubPitchTracker(0.6);
    t.offer(55);
    expect(t.read(0.4)).toBeCloseTo(55, 1); // detection returned nothing here
  });

  it('releases the pitch once the hold expires', () => {
    const t = new SubPitchTracker(0.6);
    t.offer(55);
    expect(t.read(1.5)).toBeNull();
  });

  it('does not chase small wobbles within a third of an octave', () => {
    const t = new SubPitchTracker();
    t.offer(55);
    t.offer(56.2); // a partial moving, not a new note
    expect(t.read(0.1)).toBeCloseTo(55, 1);
  });

  it('follows a real note change', () => {
    const t = new SubPitchTracker();
    t.offer(55);
    t.offer(41.2); // down a minor third — a different note
    expect(t.read(0.1)).toBeCloseTo(41.2, 1);
  });
});
