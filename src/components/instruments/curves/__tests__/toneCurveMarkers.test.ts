import { describe, it, expect } from 'vitest';
import { cutoffEnvelopeMarkerX, filterMarkerHz, lfoMarkerSeconds, pitchEnvelopeMarkerX, toneEnvelopeMarkerX } from '../toneCurveMarkers';
import { adsrCurve, cutoffEnvelopeCurve } from '../commonCurveModels';
import { duoVibratoAmount, monoSynthFilterCurve, duoVibratoCurve, monoFilterSweep, tonePitchEnvelopeCurve, besselJ, fmSpectrum, amSpectrum } from '../toneCurves';

const stage = (s: 'attack' | 'decay' | 'sustain' | 'release' | 'off', stageElapsedMs: number) => ({ stage: s, stageElapsedMs });

describe('envelope marker lands on the vertices of the drawn amp envelope', () => {
  // The marker's x is judged against the curve it rides on, not against its own formula.
  const keys: Record<string, number> = { a: 100, d: 400, s: 40, r: 800 };
  const get = (k: string) => keys[k];
  const curve = adsrCurve({ attack: 'a', decay: 'd', sustain: 's', release: 'r' });
  const pts = curve.series(get)[0].points;
  const peak = pts.find(([, y]) => y === 1)!; // the attack's end
  const gateEnd = pts.filter(([, y]) => Math.abs(y - 0.4) < 1e-9).pop()!; // last point still at the sustain level

  it('at the end of the attack it sits on the peak', () => {
    expect(toneEnvelopeMarkerX(100, 400, 40, 800, stage('attack', 100))).toBeCloseTo(peak[0], 9);
  });
  it('inside the decay it sits on the decay curve between the peak and the sustain', () => {
    const x = toneEnvelopeMarkerX(100, 400, 40, 800, stage('decay', 200))!;
    expect(x).toBeGreaterThan(peak[0]);
    expect(x).toBeLessThan(gateEnd[0]);
  });
  it('after a long hold it parks at the gate end, and the release runs to the end of the timeline', () => {
    expect(toneEnvelopeMarkerX(100, 400, 40, 800, stage('sustain', 60000))).toBeCloseTo(gateEnd[0], 9);
    expect(toneEnvelopeMarkerX(100, 400, 40, 800, stage('release', 0))).toBeCloseTo(gateEnd[0], 9);
    expect(toneEnvelopeMarkerX(100, 400, 40, 800, stage('release', 800))).toBeCloseTo(1, 9);
    expect(toneEnvelopeMarkerX(100, 400, 40, 800, stage('release', 99999))).toBeCloseTo(1, 9);
  });
  it('moves forward through the stages, and is absent without a voice or when it is over', () => {
    const at = (s: Parameters<typeof stage>[0], t: number) => toneEnvelopeMarkerX(100, 400, 40, 800, stage(s, t))!;
    expect(at('attack', 50)).toBeLessThan(at('decay', 50));
    expect(at('decay', 50)).toBeLessThan(at('sustain', 50));
    expect(at('sustain', 50)).toBeLessThan(at('release', 50));
    expect(toneEnvelopeMarkerX(100, 400, 40, 800, null)).toBeNull();
    expect(toneEnvelopeMarkerX(100, 400, 40, 800, stage('off', 0))).toBeNull();
  });
  it('a sustain of 100% has no decay segment: the sustain starts at the attack end', () => {
    const flat = adsrCurve({ attack: 'a', decay: 'd', sustain: 100, release: 'r' }).series(get)[0].points;
    const peakX = flat.find(([, y]) => y === 1)![0];
    expect(toneEnvelopeMarkerX(100, 400, 100, 800, stage('sustain', 0))).toBeCloseTo(peakX, 9);
  });
  it('the linear shape (WavetableSynth) keeps its decay segment even at 100% sustain', () => {
    expect(toneEnvelopeMarkerX(100, 400, 100, 800, stage('sustain', 0), 'linear')).toBeGreaterThan(
      toneEnvelopeMarkerX(100, 400, 100, 800, stage('sustain', 0), 'tone')!,
    );
  });
});

describe('filter, LFO and cutoff-envelope markers', () => {
  it('the filter marker is the reported cutoff clamped to the axis, and absent without one', () => {
    expect(filterMarkerHz({ cutoffHz: 1600 })).toBe(1600);
    expect(filterMarkerHz({ cutoffHz: 5 })).toBe(20);
    expect(filterMarkerHz({ cutoffHz: 1e6 })).toBe(20000);
    expect(filterMarkerHz({})).toBeNull();
    expect(filterMarkerHz(null)).toBeNull();
  });
  it('the LFO marker is the phase inside the first cycle of the window; nothing for a first cycle longer than the window', () => {
    expect(lfoMarkerSeconds(4, 1, { lfoPhase: 0.5 })).toBeCloseTo(0.125, 9);
    expect(lfoMarkerSeconds(0.5, 1, { lfoPhase: 0.9 })).toBeNull();
    expect(lfoMarkerSeconds(0, 1, { lfoPhase: 0.5 })).toBeNull();
    expect(lfoMarkerSeconds(4, 1, {})).toBeNull();
  });
  it('the cutoff envelope marker runs over the curve timeline and is absent when the envelope amount is 0', () => {
    const keys: Record<string, number> = { c: 1000, amt: 50, a: 200, d: 600, s: 30 };
    const curve = cutoffEnvelopeCurve({ cutoff: 'c', amount: 'amt', attack: 'a', decay: 'd', sustain: 's' });
    const pts = curve.series((k) => keys[k])[0].points;
    const decayEnd = pts[2][0]; // [x(a + d), sustainHz]
    expect(cutoffEnvelopeMarkerX(200, 600, 50, { elapsedMs: 800 })).toBeCloseTo(decayEnd, 9);
    expect(cutoffEnvelopeMarkerX(200, 600, 50, { elapsedMs: 1e6 })).toBe(1);
    expect(cutoffEnvelopeMarkerX(200, 600, 0, { elapsedMs: 100 })).toBeNull();
  });
});

describe('MonoSynth swept filter and DuoSynth vibrato models', () => {
  it('draws the response at the sweep start and peak the Base Cutoff and Sweep Octaves knobs name, and follows them', () => {
    const curve = monoSynthFilterCurve();
    const keys = (base: number, octaves: number) => (k: string) => ({ 'filter.Q': 1, 'filterEnvelope.baseFrequency': base, 'filterEnvelope.octaves': octaves }[k] ?? 0);
    const text = (set: boolean) => (k: string) => (k === 'filter.type' ? 'lowpass' : set ? '1' : '');
    expect(monoFilterSweep(keys(200, 3), text(true))).toEqual({ baseHz: 200, octaves: 3 });
    // keys the config does not hold read as Tone's MonoSynth defaults
    expect(monoFilterSweep(keys(0, 0), text(false))).toEqual({ baseHz: 200, octaves: 3 });
    const series = (base: number, octaves: number) => curve.series(keys(base, octaves), text(true));
    expect(series(800, 2)).not.toEqual(series(200, 3));
    const [low, high] = series(200, 3);
    const dbAt = (s: typeof low, hz: number) => s.points.reduce((best, p) => (Math.abs(p[0] - hz) < Math.abs(best[0] - hz) ? p : best))[1];
    expect(dbAt(low, 1000)).toBeLessThan(dbAt(high, 1000)); // the 200 Hz corner has cut 1 kHz more than the 1.6 kHz one
  });
  it('the Q knob changes the drawn peak and the type changes the shape', () => {
    const curve = monoSynthFilterCurve();
    const lp = (q: number) => curve.series((k) => (k === 'filter.Q' ? q : 0), (k) => (k === 'filter.type' ? 'lowpass' : ''))[1].points;
    const peak = (pts: ReadonlyArray<readonly [number, number]>) => Math.max(...pts.map((p) => p[1]));
    expect(peak(lp(12))).toBeGreaterThan(peak(lp(1)) + 5);
    const hp = curve.series((k) => (k === 'filter.Q' ? 1 : 0), (k) => (k === 'filter.type' ? 'highpass' : ''))[1].points;
    expect(hp[0][1]).not.toBeCloseTo(lp(1)[0][1], 0);
  });
  it('DuoSynth vibrato amount follows the engine: detune / 100, and 0.5 when the detune is 0', () => {
    expect(duoVibratoAmount(0)).toBe(0.5);
    expect(duoVibratoAmount(80)).toBe(0.8);
    expect(duoVibratoAmount(-50)).toBe(-0.5);
    const curve = duoVibratoCurve();
    const peak = (detune: number) => Math.max(...curve.series((k) => (k === 'oscillator.detune' ? detune : 0))[0].points.map((p) => Math.abs(p[1])));
    expect(peak(100)).toBeCloseTo(50, 0);
    expect(peak(0)).toBeCloseTo(25, 0);
  });
});

describe('pitch envelope marker lands on the drawn pitch envelope', () => {
  const keys: Record<string, number> = {
    'pitchEnvelope.enabled': 1, 'pitchEnvelope.amount': 12, 'pitchEnvelope.attack': 100, 'pitchEnvelope.decay': 400, 'pitchEnvelope.sustain': 0, 'pitchEnvelope.release': 800,
  };
  const get = (k: string) => keys[k] ?? 0;
  const curve = tonePitchEnvelopeCurve();
  const pts = curve.series(get)[0].points;
  const peak = pts.reduce((best, p) => (p[1] > best[1] ? p : best));
  const at = (ms: number, stage: 'attack' | 'decay' | 'sustain' | 'release' | 'off', stageMs: number) => pitchEnvelopeMarkerX(100, 400, 800, { stage, elapsedMs: ms, stageElapsedMs: stageMs });

  it('the curve is the semitone offset the engine schedules: 12 st at the end of the attack, back to 0 after the decay and the release', () => {
    expect(peak[1]).toBeCloseTo(12, 0); // sampled on a 200-point grid
    expect(pts[pts.length - 1][1]).toBe(0);
    expect(curve.yDomain).toBeDefined();
  });
  it('the marker sits on the peak when the attack ends and on the release segment after the note is released', () => {
    expect(at(100, 'decay', 0)).toBeCloseTo(peak[0], 2);
    expect(at(60000, 'sustain', 59000)!).toBeLessThan(at(60000, 'release', 0)! + 1e-9);
    expect(at(0, 'release', 800)).toBeCloseTo(1, 9);
    expect(at(10, 'off', 0)).toBeNull();
    expect(pitchEnvelopeMarkerX(100, 400, 800, null)).toBeNull();
  });
});

describe('spectrum models', () => {
  it('besselJ matches known values', () => {
    expect(besselJ(0, 0)).toBeCloseTo(1, 9);
    expect(besselJ(1, 1)).toBeCloseTo(0.44005059, 6);
    expect(besselJ(2, 5)).toBeCloseTo(0.04656512, 6);
    expect(besselJ(0, 30)).toBeCloseTo(-0.08636798, 5);
    expect(besselJ(-1, 1)).toBeCloseTo(-0.44005059, 6);
  });
  it('an FM index of 0 is a bare carrier; the AM carrier stays at 1 with a sideband pair', () => {
    expect(fmSpectrum(0, 3)).toEqual([{ ratio: 1, amplitude: 1 }]);
    const am = amSpectrum(2);
    expect(am.map((l) => l.ratio)).toEqual([1, 3]); // 1 - 2 folds onto the carrier
    expect(amSpectrum(0.5).map((l) => l.ratio)).toEqual([0.5, 1, 1.5]);
  });
});
