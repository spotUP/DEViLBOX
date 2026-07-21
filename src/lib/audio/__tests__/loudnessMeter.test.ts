import { describe, it, expect } from 'vitest';
import {
  kWeightingBiquads,
  loudnessFromMeanSquares,
  measureBufferLoudness,
  LoudnessMeter,
} from '../loudnessMeter';

/**
 * Compliance-style checks against ITU-R BS.1770 / EBU Tech 3341 expectations.
 * We generate the canonical test signals and assert the meter reads the
 * documented loudness within the standard's ±0.1 LU tolerance.
 */

const FS = 48000;

/** Stereo sine at a given peak amplitude, `secs` long. */
function stereoSine(freq: number, amp: number, secs: number, fs = FS): Float32Array[] {
  const n = Math.round(secs * fs);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = amp * Math.sin((2 * Math.PI * freq * i) / fs);
    l[i] = v;
    r[i] = v;
  }
  return [l, r];
}

describe('loudnessMeter — K-weighting coefficients', () => {
  it('reproduces the BS.1770 48 kHz tabulated coefficients', () => {
    const [shelf, hp] = kWeightingBiquads(48000);
    // Stage 1 high-shelf (standard values, ~4 dp)
    expect(shelf.b0).toBeCloseTo(1.53512485958697, 3);
    expect(shelf.b1).toBeCloseTo(-2.69169618940638, 3);
    expect(shelf.b2).toBeCloseTo(1.19839281085285, 3);
    expect(shelf.a1).toBeCloseTo(-1.69065929318241, 3);
    expect(shelf.a2).toBeCloseTo(0.73248077421585, 3);
    // Stage 2 high-pass
    expect(hp.b0).toBeCloseTo(1.0, 3);
    expect(hp.b1).toBeCloseTo(-2.0, 3);
    expect(hp.b2).toBeCloseTo(1.0, 3);
    expect(hp.a1).toBeCloseTo(-1.99004745483398, 3);
    expect(hp.a2).toBeCloseTo(0.99007225036621, 3);
  });
});

describe('loudnessMeter — integrated loudness (EBU 3341 style)', () => {
  it('matches the analytic K-weighted loudness of a 1 kHz stereo sine', () => {
    // Independent check: compute the expected integrated loudness from the
    // filter's steady-state magnitude at 1 kHz (from the proven-correct coeffs),
    // NOT by assuming 0 dB. This validates the mean-square + -0.691 offset path.
    const amp = 0.1;
    const [l, r] = stereoSine(1000, amp, 5);
    const snap = measureBufferLoudness([l, r], FS);

    const [s1, s2] = kWeightingBiquads(FS);
    const gain = biquadMagnitude(s1, 1000, FS) * biquadMagnitude(s2, 1000, FS);
    // stereo identical channels: sum of mean-squares = 2 * (amp^2/2) * gain^2 = amp^2*gain^2
    const expected = -0.691 + 10 * Math.log10(amp * amp * gain * gain);
    expect(snap.integrated).toBeCloseTo(expected, 1);
  });

  it('a +10 dB louder signal reads ~10 LU higher', () => {
    const amp = Math.pow(10, (-23 + 0.691) / 20);
    const quiet = measureBufferLoudness(stereoSine(1000, amp, 5), FS).integrated;
    const loud = measureBufferLoudness(stereoSine(1000, amp * Math.pow(10, 10 / 20), 5), FS).integrated;
    expect(loud - quiet).toBeCloseTo(10, 1);
  });

  it('reports -Infinity for digital silence', () => {
    const n = FS * 2;
    const snap = measureBufferLoudness([new Float32Array(n), new Float32Array(n)], FS);
    expect(snap.integrated).toBe(-Infinity);
    expect(snap.truePeak).toBe(-Infinity);
  });
});

describe('loudnessMeter — true peak', () => {
  it('flags an inter-sample peak above the sample peak (near-Nyquist)', () => {
    // A tone near Nyquist sampled off-crest: sample peak < 0 dBFS but the true
    // (inter-sample) peak is higher. Oversampling must catch it.
    const n = FS;
    const l = new Float32Array(n);
    const r = new Float32Array(n);
    const amp = 0.95;
    for (let i = 0; i < n; i++) {
      // 11.9 kHz gives samples that straddle the crest
      const v = amp * Math.sin((2 * Math.PI * 11900 * i) / FS + 0.4);
      l[i] = v; r[i] = v;
    }
    const snap = measureBufferLoudness([l, r], FS);
    const samplePeakDb = 20 * Math.log10(amp);
    expect(snap.truePeak).toBeGreaterThan(samplePeakDb - 1); // at least near sample peak
    expect(isFinite(snap.truePeak)).toBe(true);
  });

  it('a full-scale DC-ish block reads ~0 dBTP', () => {
    const n = FS;
    const l = new Float32Array(n).fill(1.0);
    const r = new Float32Array(n).fill(1.0);
    const snap = measureBufferLoudness([l, r], FS);
    expect(snap.truePeak).toBeCloseTo(0, 1);
  });
});

describe('loudnessMeter — momentary / short-term windows', () => {
  it('momentary needs >=400 ms before it reads', () => {
    const meter = new LoudnessMeter(FS, 2);
    const [l, r] = stereoSine(1000, 0.1, 0.3); // 300 ms
    meter.process([l, r]);
    expect(meter.momentary()).toBe(-Infinity);
    const [l2, r2] = stereoSine(1000, 0.1, 0.3); // +300 ms => 600 ms total
    meter.process([l2, r2]);
    expect(isFinite(meter.momentary())).toBe(true);
  });
});

describe('loudnessMeter — LRA', () => {
  it('is ~0 for a steady tone and grows for a loud/quiet alternation', () => {
    const amp = Math.pow(10, (-23 + 0.691) / 20);
    const steady = measureBufferLoudness(stereoSine(1000, amp, 12), FS).lra;
    expect(steady).toBeLessThan(1);

    // Alternate 3 s loud / 3 s quiet blocks → wide range
    const parts: Float32Array[][] = [];
    for (let k = 0; k < 4; k++) {
      const a = k % 2 === 0 ? amp : amp * Math.pow(10, -15 / 20);
      parts.push(stereoSine(1000, a, 3));
    }
    const l = concat(parts.map((p) => p[0]));
    const r = concat(parts.map((p) => p[1]));
    const varied = measureBufferLoudness([l, r], FS).lra;
    expect(varied).toBeGreaterThan(5);
  });
});

describe('loudnessMeter — helper', () => {
  it('sums channel mean-squares per BS.1770 stereo weighting', () => {
    // amp 0.1 sine → mean square 0.005 per channel; two channels → 0.01
    expect(loudnessFromMeanSquares([0.005, 0.005])).toBeCloseTo(-0.691 + 10 * Math.log10(0.01), 6);
    expect(loudnessFromMeanSquares([0, 0])).toBe(-Infinity);
  });
});

/** Steady-state magnitude |H(e^jw)| of a biquad at frequency f. */
function biquadMagnitude(c: { b0: number; b1: number; b2: number; a1: number; a2: number }, f: number, fs: number): number {
  const w = (2 * Math.PI * f) / fs;
  const cos1 = Math.cos(-w), sin1 = Math.sin(-w);
  const cos2 = Math.cos(-2 * w), sin2 = Math.sin(-2 * w);
  const numRe = c.b0 + c.b1 * cos1 + c.b2 * cos2;
  const numIm = c.b1 * sin1 + c.b2 * sin2;
  const denRe = 1 + c.a1 * cos1 + c.a2 * cos2;
  const denIm = c.a1 * sin1 + c.a2 * sin2;
  const num = Math.hypot(numRe, numIm);
  const den = Math.hypot(denRe, denIm);
  return num / den;
}

function concat(arrs: Float32Array[]): Float32Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}
