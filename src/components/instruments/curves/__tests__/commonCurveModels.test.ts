import { describe, it, expect } from 'vitest';
import {
  makeBiquad, magnitudeDb, normalisedFilterParams, webAudioLinearQ, filterResponsePoints, toneApproach, adsrPoints,
  msEnvelopeLayout, lfoValue, lfoPoints, adsrCurve, filterCurve, lfoCurve, cutoffEnvelopeCurve, asFilterType,
} from '../commonCurveModels';

const getter = (values: Record<string, number>) => (key: string): number => values[key] ?? NaN;
const text = (values: Record<string, string>) => (key: string): string => values[key] ?? '';

describe('filter response math', () => {
  it('a Butterworth lowpass (Q 0.7071) is 3.01 dB down at the cutoff and flat well below it', () => {
    const c = makeBiquad('lowpass', 1000, Math.SQRT1_2);
    expect(magnitudeDb(c, 1000, 2)).toBeCloseTo(-3.01, 1);
    expect(magnitudeDb(c, 50, 2)).toBeCloseTo(0, 1);
    expect(magnitudeDb(c, 10000, 2)).toBeLessThan(-35); // 12 dB/oct: 40 dB at 10x
  });

  it('a resonant lowpass peaks at the cutoff by exactly Q in dB, and 4 poles double the dB', () => {
    const c = makeBiquad('lowpass', 2000, 4);
    expect(magnitudeDb(c, 2000, 2)).toBeCloseTo(20 * Math.log10(4), 3);
    expect(magnitudeDb(c, 2000, 4)).toBeCloseTo(40 * Math.log10(4), 3);
  });

  it('highpass mirrors lowpass; bandpass peaks at 0 dB at the centre; notch dips at the centre', () => {
    expect(magnitudeDb(makeBiquad('highpass', 1000, Math.SQRT1_2), 1000, 2)).toBeCloseTo(-3.01, 1);
    expect(magnitudeDb(makeBiquad('highpass', 1000, Math.SQRT1_2), 20, 2)).toBeLessThan(-60);
    expect(magnitudeDb(makeBiquad('bandpass', 1000, 3, true), 1000, 2), 'Web Audio bandpass: 0 dB peak').toBeCloseTo(0, 1);
    expect(magnitudeDb(makeBiquad('bandpass', 1000, 3), 1000, 2), 'cookbook constant skirt: peak = Q').toBeCloseTo(20 * Math.log10(3), 1);
    expect(magnitudeDb(makeBiquad('notch', 1000, 3), 1000, 2)).toBeLessThan(-60);
  });

  it('normalised 0..1 cutoff and resonance map to Hz on a log scale and to Q linearly', () => {
    expect(normalisedFilterParams(0, 0)).toEqual({ fc: 20, Q: 0.5 });
    const top = normalisedFilterParams(1, 1);
    expect(top.fc).toBeCloseTo(20000, 6);
    expect(top.Q).toBeCloseTo(20, 9);
    expect(normalisedFilterParams(0.5, 0.5).fc).toBeCloseTo(Math.sqrt(20 * 20000), 6);
  });

  it('Web Audio lowpass/highpass Q is a dB value (10 dB = 3.162), bandpass/notch Q is linear', () => {
    expect(webAudioLinearQ('lowpass', 10)).toBeCloseTo(3.1623, 3);
    expect(webAudioLinearQ('highpass', 0)).toBe(1);
    expect(webAudioLinearQ('bandpass', 10)).toBe(10);
    expect(webAudioLinearQ('notch', 2)).toBe(2);
  });

  it('the response points run 20 Hz to 20 kHz on a log grid', () => {
    const pts = filterResponsePoints('lowpass', 1000, 1, 2, 50);
    expect(pts).toHaveLength(50);
    expect(pts[0][0]).toBeCloseTo(20, 6);
    expect(pts[49][0]).toBeCloseTo(20000, 3);
    expect(pts[1][0] / pts[0][0]).toBeCloseTo(pts[49][0] / pts[48][0], 6);
  });
});

describe('envelope shapes', () => {
  it('the ms layout holds the sustain for a fifth of the ADSR time, at least 50 ms (what EnvelopeVisualization draws)', () => {
    expect(msEnvelopeLayout(100, 200, 50, 300)).toMatchObject({ holdMs: 120, totalMs: 720, sus: 0.5 });
    expect(msEnvelopeLayout(0, 0, 100, 0)).toMatchObject({ holdMs: 50, totalMs: 50 });
    expect(msEnvelopeLayout(10, 10, 250, -5).sus).toBe(1); // sustain clamps to 100 %
  });

  it('Tone ramp: exponential approach to 90% of the time, then linear to the target (Param.exponentialApproachValueAtTime)', () => {
    const D = 0.5;
    const tc = Math.log(D + 1) / Math.log(200); // Param.js:278
    expect(toneApproach(1, 0.2, D, 0)).toBe(1);
    expect(toneApproach(1, 0.2, D, 0.1)).toBeCloseTo(0.2 + 0.8 * Math.exp(-0.1 / tc), 12);
    const at90 = 0.2 + 0.8 * Math.exp(-(D * 0.9) / tc);
    expect(toneApproach(1, 0.2, D, D * 0.9)).toBeCloseTo(at90, 12);
    expect(toneApproach(1, 0.2, D, D * 0.95)).toBeCloseTo((at90 + 0.2) / 2, 12);
    expect(toneApproach(1, 0.2, D, D)).toBe(0.2);
    expect(toneApproach(1, 0.2, D, D * 2)).toBe(0.2);
  });

  it('Tone ADSR: linear attack to 1, decay to the sustain level, held, released to 0', () => {
    const pts = adsrPoints(100, 400, 30, 200, 'tone');
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[1]).toEqual([100, 1]);
    const hold = msEnvelopeLayout(100, 400, 30, 200);
    const gateEnd = 100 + 400 + hold.holdMs;
    const atGate = pts.find((p) => p[0] === gateEnd)!;
    expect(atGate[1]).toBeCloseTo(0.3, 12);
    expect(pts[pts.length - 1]).toEqual([hold.totalMs, 0]);
    // the decay is exponential, not a straight line: at half the decay time it is below the linear midpoint
    const mid = pts.filter((p) => p[0] > 100 && p[0] < 500).reduce((a, b) => (Math.abs(a[0] - 300) < Math.abs(b[0] - 300) ? a : b));
    expect(mid[1]).toBeLessThan(1 - 0.7 * ((mid[0] - 100) / 400));
  });

  it('an instant attack starts at full level; sustain 100% has no decay stage; zero release drops at the gate end', () => {
    const pts = adsrPoints(0, 300, 100, 0, 'tone');
    expect(pts[0]).toEqual([0, 1]);
    expect(pts.every((p) => p[1] === 1 || p[1] === 0)).toBe(true);
    expect(pts[pts.length - 1][1]).toBe(0);
  });

  it('linear shape is the five-point polyline', () => {
    expect(adsrPoints(100, 200, 50, 300, 'linear')).toEqual([[0, 0], [100, 1], [300, 0.5], [420, 0.5], [720, 0]]);
  });
});

describe('LFO shapes', () => {
  it('sine, triangle, square and sawtooth hit their known values', () => {
    expect(lfoValue('sine', 0.25)).toBeCloseTo(1, 12);
    expect(lfoValue('triangle', 0)).toBe(-1);
    expect(lfoValue('triangle', 0.5)).toBe(1);
    expect(lfoValue('square', 0.1)).toBe(1);
    expect(lfoValue('square', 0.6)).toBe(-1);
    expect(lfoValue('sawtooth', 0.5)).toBe(0);
  });

  it('the number of cycles drawn in the window equals rate x window, scaled by depth', () => {
    const pts = lfoPoints('sine', 3, 0.5, 1, 400);
    let crossings = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i - 1][1] < 0 && pts[i][1] >= 0) crossings++;
    expect(crossings).toBe(3);
    expect(Math.max(...pts.map((p) => p[1]))).toBeCloseTo(0.5, 2);
  });
});

describe('curve builders', () => {
  it('adsrCurve reads its keys: a longer attack moves the attack peak right; the readout names the real times', () => {
    const c = adsrCurve({ attack: 'a', decay: 'd', sustain: 's', release: 'r' });
    const peakX = (a: number) => c.series(getter({ a, d: 500, s: 0, r: 100 }), text({}))[0].points.find((p) => p[1] === 1 && p[0] > 0)![0];
    expect(peakX(900)).toBeGreaterThan(peakX(10));
    expect(c.readout!(getter({ a: 50, d: 500, s: 0, r: 1500 }), text({}))).toBe('A 50 ms  D 500 ms  S 0%  R 1.5 s');
  });

  it('adsrCurve accepts constants and unit scales, and survives a missing key', () => {
    const c = adsrCurve({ attack: 's1', decay: 200, sustain: 0.9, sustainUnit: 'unit', release: 'r', timeUnit: 's' });
    expect(c.readout!(getter({ s1: 0.5, r: 1 }), text({}))).toBe('A 500 ms  D 200 s  S 90%  R 1.0 s');
    expect(() => adsrCurve({ attack: 'x', decay: 'x', sustain: 'x', release: 'x' }).series(getter({}), text({}))).not.toThrow();
  });

  it('filterCurve: cutoff moves the corner, resonance raises the peak, the type key switches lowpass to highpass', () => {
    const c = filterCurve({ cutoff: 'c', resonance: 'q', typeKey: 't' });
    const at = (v: Record<string, number>, t: string, hz: number) => {
      const pts = c.series(getter(v), text({ t }))[0].points;
      return pts.reduce((a, b) => (Math.abs(Math.log(a[0] / hz)) < Math.abs(Math.log(b[0] / hz)) ? a : b))[1];
    };
    expect(at({ c: 500, q: 0 }, 'lowpass', 5000)).toBeLessThan(at({ c: 8000, q: 0 }, 'lowpass', 5000));
    expect(at({ c: 1000, q: 100 }, 'lowpass', 1000)).toBeGreaterThan(at({ c: 1000, q: 0 }, 'lowpass', 1000));
    expect(at({ c: 1000, q: 0 }, 'highpass', 50)).toBeLessThan(at({ c: 1000, q: 0 }, 'lowpass', 50));
    expect(c.readout!(getter({ c: 1500, q: 0 }), text({ t: 'highpass' }))).toBe('highpass  1.5 kHz');
  });

  it('filterCurve resonance 100 on a Tone lowpass peaks +10 dB at the cutoff (Q param 10 = dB) and 4 poles make it +20 dB', () => {
    const peak = (poles: 2 | 4) => {
      const pts = filterCurve({ cutoff: 'c', resonance: 'q', poles }).series(getter({ c: 1000, q: 100 }), text({}))[0].points;
      return Math.max(...pts.map((p) => p[1]));
    };
    expect(peak(2)).toBeGreaterThan(9.5);
    expect(peak(2)).toBeLessThan(10.5);
    expect(peak(4)).toBeGreaterThan(19);
  });

  it('filterCurve maps a non-Hz cutoff through cutoffToHz, and an unknown type text falls back', () => {
    const c = filterCurve({ cutoff: 'b', cutoffToHz: (b) => 2000 + b * 80, resonance: 5 });
    expect(c.readout!(getter({ b: 50 }), text({}))).toBe('lowpass  6.0 kHz');
    expect(asFilterType('allpass')).toBe('lowpass');
    expect(asFilterType('notch')).toBe('notch');
  });

  it('lfoCurve: rate sets the cycles in the window, depth the amplitude', () => {
    const c = lfoCurve({ rate: 'r', depth: 'd' });
    const peak = (d: number) => Math.max(...c.series(getter({ r: 2, d }), text({}))[0].points.map((p) => p[1]));
    expect(peak(100)).toBeCloseTo(1, 2);
    expect(peak(40)).toBeCloseTo(0.4, 2);
    expect(c.readout!(getter({ r: 2.5, d: 60 }), text({}))).toBe('2.5 Hz  depth 60%');
  });

  it('cutoffEnvelopeCurve follows WavetableSynth: base to base + amount x (20k - base), then to the sustain point', () => {
    const c = cutoffEnvelopeCurve({ cutoff: 'c', amount: 'a', attack: 'at', decay: 'dc', sustain: 's' });
    const pts = c.series(getter({ c: 4000, a: 50, at: 100, dc: 300, s: 50 }), text({}))[0].points;
    expect(pts[0][1]).toBe(4000);
    expect(pts[1][1]).toBe(4000 + 0.5 * 16000); // 12000
    expect(pts[2][1]).toBe(12000 - 0.5 * 8000);   // sustain 50% of the way back
    expect(pts[3]).toEqual([1, pts[2][1]]);
    expect(c.series(getter({ c: 4000, a: 0, at: 100, dc: 300, s: 50 }), text({}))[0].points.every((p) => p[1] === 4000)).toBe(true);
    const neg = c.series(getter({ c: 4000, a: -50, at: 100, dc: 300, s: 0 }), text({}))[0].points;
    expect(neg[1][1], 'a negative amount below 0 Hz clamps at 0').toBe(0);
  });
});
