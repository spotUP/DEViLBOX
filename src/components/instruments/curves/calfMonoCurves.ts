/**
 * calfMonoCurves.ts - what the Calf Monosynth engine does with the editor's knobs (calf-mono-wasm/src/envelope.h,
 * calf_mono_standalone.cpp, biquad.h, osc.h), as curves. Layout values are the engine's own parameter units (ms, Hz,
 * cents), so no unit conversion is needed except where noted.
 *
 *  - Envelopes are LINEAR, stepped every 64 samples: attack 0 to 1 in A seconds, decay 1 to sustain in D seconds
 *    (the step is (1 - s) / (D * rate), so the decay time does not depend on the sustain level), sustain flat or, with a
 *    fade F, sloping by 1 / F per second (positive falls to 0 and stops, negative rises to 1), release linear from the
 *    level at key off to 0 in R seconds (adsr::set / advance, envelope.h:63-156). Sustain is capped at 0.999.
 *    Used as an amplitude the release is cubic, value^3 / sustain^2 (get_amp_value, envelope.h:158).
 *  - Cutoff: cutoff * 2^((lfo * LFO>Filter + env1 * fltctl * EG1>Cutoff + env2 * fltctl * EG2>Cutoff) / 1200), times
 *    (note / 264 Hz)^keyfollow above 0.01, clipped to 10..18000 Hz (calculate_step, cpp:444-447). Resonance moves toward
 *    0.7 as the envelopes fall when EG>Reso is up (cpp:448-452).
 *  - Filters are RBJ biquads with the resonance as Q; the type picks one or two (cpp:461-503). The second filter sits at
 *    cutoff * 2^(separation / 1200); the "2x" types run them in parallel on the two channels, the others in series.
 *  - LFO 1 is a triangle that starts at zero and rises, faded in over the delay (triangle_lfo::get, osc.h:316).
 *
 * Not modelled (named): the oscillators (wavetables built by FFT with shift, stretch and window), the velocity terms
 * (the curves assume full velocity), the cutoff's 1/30-second inertia, the modulation matrix and LFO 2, which the
 * layout cannot reach: LFO 2 is read only as a matrix source, and its Delay knob (lfo2Delay) is never read at all (the
 * engine delays both LFOs by the LFO 1 delay, cpp:429).
 */
import type { CurveDescriptor } from '@/types/synthPanel';
import {
  audioSampleRate, envelopeDomain, envelopeMarkerX, holdFor, num, rbjCoefficients, voiceMarker, zMagnitudeDb, logGrid, polyMul,
  FILTER_DB_MAX, FILTER_DB_MIN, type StagedEnvelope,
} from './wasmSubtractiveModels';
import { fmtHz, fmtMs } from './commonCurveModels';

export const CALF_MONO_SYNTH_TYPE = 'CalfMono';
export const CALF_STEP = 64;
export const CALF_REFERENCE_NOTE = 60;
type Get = (key: string) => number;

// ---- envelope -------------------------------------------------------------------------------------------

export interface CalfEnvelopeKnobs { attackMs: number; decayMs: number; sustain: number; fadeMs: number; releaseMs: number }

export function calfEnvelope(k: CalfEnvelopeKnobs): StagedEnvelope {
  const a = Math.max(0.001, k.attackMs * 0.001);
  const d = Math.max(0.001, k.decayMs * 0.001);
  const r = Math.max(0.001, k.releaseMs * 0.001);
  const s = Math.min(0.999, Math.max(0, k.sustain));
  const fade = k.fadeMs * 0.001;
  const slope = Math.abs(fade) > 1e-9 ? -1 / fade : 0; // per second; positive fade falls
  const attackEnd = a;
  const decayEnd = a + d;
  const hold = holdFor(a, d);
  // a positive fade runs out at zero, a negative one at one
  const holdSeconds = slope === 0 ? hold : Math.min(hold, slope < 0 ? s / -slope : (1 - s) / slope);
  const releaseAt = decayEnd + holdSeconds;
  const endLevel = Math.min(1, Math.max(0, s + slope * holdSeconds));
  const points: Array<[number, number]> = [[0, 0], [attackEnd, 1], [decayEnd, s], [releaseAt, endLevel]];
  // adsr::note_off: thisrelease = max(sustain, value) / release_time per second, so from `value` it takes R * value / max(sustain, value)
  const releaseSeconds = endLevel > 0 ? (r * endLevel) / Math.max(s, endLevel) : 0;
  const total = releaseAt + releaseSeconds;
  if (releaseSeconds > 0) points.push([total, 0]);
  return { points, attackEnd, decayEnd, releaseAt, total: Math.max(total, releaseAt + 0.001), sustainFrom: s, sustainTo: endLevel };
}

/** The amplitude contour of an envelope used as VCA: the release is cubic, value^3 / sustain^2 below the sustain (get_amp_value). */
export function calfAmpContour(env: StagedEnvelope, sustain: number, samples = 24): Array<[number, number]> {
  const s = Math.min(0.999, Math.max(0, sustain));
  const out = env.points.filter((p) => p[0] <= env.releaseAt);
  const last = out[out.length - 1];
  const end = env.points[env.points.length - 1];
  if (end[0] > env.releaseAt && s > 0) {
    for (let i = 1; i <= samples; i++) {
      const t = env.releaseAt + ((end[0] - env.releaseAt) * i) / samples;
      const v = last[1] * (1 - (t - env.releaseAt) / (end[0] - env.releaseAt));
      out.push([t, v < s ? (v * v * v) / (s * s) : v]);
    }
  }
  return out;
}

export const calfEg1Knobs = (get: Get): CalfEnvelopeKnobs => ({
  attackMs: num(get('adsrA'), 1), decayMs: num(get('adsrD'), 10), sustain: num(get('adsrS')), fadeMs: num(get('adsrF')), releaseMs: num(get('adsrR'), 10),
});
export const calfEg2Knobs = (get: Get): CalfEnvelopeKnobs => ({
  attackMs: num(get('adsr2A'), 1), decayMs: num(get('adsr2D'), 10), sustain: num(get('adsr2S')), fadeMs: num(get('adsr2F')), releaseMs: num(get('adsr2R'), 10),
});

// ---- filter ---------------------------------------------------------------------------------------------

export const CALF_FILTER_TYPES = ['lp12', 'lp24', '2lp12', 'hp12', 'lpbr', 'hpbr', 'bp6', '2bp6'] as const;

/** Effective cutoff in Hz (cpp:444-447) for the envelope levels, LFO value (-1..1), note and filter-velocity control. */
export function calfCutoffHz(get: Get, env1: number, env2: number, lfo = 0, note = CALF_REFERENCE_NOTE, fltctl = 1): number {
  const cents = lfo * num(get('lfo2filter')) + env1 * fltctl * num(get('env2cutoff')) + env2 * fltctl * num(get('adsr2Cutoff'));
  let cutoff = num(get('cutoff'), 2000) * Math.pow(2, cents / 1200);
  const kf = num(get('keyFollow'));
  if (kf > 0.01) cutoff *= Math.pow((440 * Math.pow(2, (note - 69) / 12)) / 264, kf);
  return Math.min(18000, Math.max(10, cutoff));
}

/** Resonance after the envelope terms (cpp:448-452). */
export function calfResonance(get: Get, env1: number, env2: number): number {
  // the engine clamps the parameter to 0.7..8 (calf_mono_set_param), so a reading of 0 is 0.7
  let res = Math.min(8, Math.max(0.7, num(get('res'), 1)));
  const e1 = num(get('env2res'));
  res = res * (1 - e1) + (0.7 + (res - 0.7) * env1 * env1) * e1;
  const e2 = num(get('adsr2Res'));
  return res * (1 - e2) + (0.7 + (res - 0.7) * env2 * env2) * e2;
}

type Coeffs = { b: number[]; a: number[] };
const dbOf = (c: Coeffs, hz: number, fs: number): number => zMagnitudeDb(c.b, c.a, hz, fs);

/** The filter stage(s) of a type as lines: one line for the series types, two for the parallel "2x" types. */
export function calfFilterLines(type: number, cutoff: number, res: number, separation: number, fs: number): Array<{ coeffs: Coeffs; gainDb: number }> {
  const cut2 = Math.min(18000, Math.max(10, cutoff * Math.pow(2, separation / 1200)));
  const g12 = 20 * Math.log10(Math.min(0.7, 0.7 / res));
  const g24 = 20 * Math.log10(Math.min(0.5, 0.5 / res));
  const series = (x: Coeffs, y: Coeffs): Coeffs => ({ b: polyMul(x.b, y.b), a: polyMul(x.a, y.a) });
  switch (Math.round(type)) {
    case 0: return [{ coeffs: rbjCoefficients('lowpass', cutoff, res, fs), gainDb: g12 }];
    case 1: return [{ coeffs: series(rbjCoefficients('lowpass', cutoff, res, fs), rbjCoefficients('lowpass', cut2, res, fs)), gainDb: g24 }];
    case 2: return [
      { coeffs: rbjCoefficients('lowpass', cutoff, res, fs), gainDb: g12 },
      { coeffs: rbjCoefficients('lowpass', cut2, res, fs), gainDb: g12 },
    ];
    case 3: return [{ coeffs: rbjCoefficients('highpass', cutoff, res, fs), gainDb: g12 }];
    case 4: return [{ coeffs: series(rbjCoefficients('lowpass', cutoff, res, fs), rbjCoefficients('notch', cut2, 1 / res, fs)), gainDb: g24 }];
    case 5: return [{ coeffs: series(rbjCoefficients('highpass', cutoff, res, fs), rbjCoefficients('notch', cut2, 1 / res, fs)), gainDb: g24 }];
    case 6: return [{ coeffs: rbjCoefficients('bandpass', cutoff, res, fs), gainDb: 0 }];
    default: return [
      { coeffs: rbjCoefficients('bandpass', cutoff, res, fs), gainDb: 0 },
      { coeffs: rbjCoefficients('bandpass', cut2, res, fs), gainDb: 0 },
    ];
  }
}

export function calfFilterSeries(get: Get, fs: number, env1: number, env2: number): Array<Array<[number, number]>> {
  const cutoff = calfCutoffHz(get, env1, env2);
  const lines = calfFilterLines(num(get('filter')), cutoff, calfResonance(get, env1, env2), num(get('filterSep')), fs);
  return lines.map((l) => logGrid().filter((hz) => hz < fs / 2).map((hz) => [hz, Math.max(FILTER_DB_MIN, dbOf(l.coeffs, hz, fs) + l.gainDb)] as [number, number]));
}

// ---- LFO ------------------------------------------------------------------------------------------------

/** triangle_lfo::get() as a function of the phase in cycles: 0 at phase 0, rising to +1 at a quarter cycle. */
export function calfTriangle(phase: number): number {
  const p = phase - Math.floor(phase);
  const u = (p + 0.25) % 1;
  const folded = u >= 0.5 ? 1 - u : u;
  return 4 * folded - 1;
}
export const calfLfoWindow = (get: Get): number => Math.min(20, Math.max(0.5, num(get('lfoDelay')) + 3 / Math.max(0.01, num(get('lfoRate'), 2))));
/** Depth factor from the modulation wheel at rest: lerp(1, wheel, mwhl2lfo) with the wheel at 0 (cpp:428). */
export const calfLfoWheelFactor = (get: Get): number => 1 - num(get('mwhl2lfo'));

export function calfLfoSeries(get: Get, count = 240): Array<[number, number]> {
  const rate = Math.max(0.01, num(get('lfoRate'), 2));
  const delay = num(get('lfoDelay'));
  const window = calfLfoWindow(get);
  const factor = calfLfoWheelFactor(get);
  return Array.from({ length: count }, (_, i) => {
    const t = (i / (count - 1)) * window;
    const fade = delay > 0 ? Math.min(1, t / delay) : 1;
    return [t, calfTriangle(t * rate) * fade * factor] as [number, number];
  });
}

// ---- curve descriptors ----------------------------------------------------------------------------------

export function calfMonoCurves(sampleRate: () => number = audioSampleRate): Record<'eg1' | 'eg2' | 'filter' | 'lfo', CurveDescriptor> {
  const readout = (k: CalfEnvelopeKnobs): string =>
    `A ${fmtMs(k.attackMs)}  D ${fmtMs(k.decayMs)}  S ${Math.round(Math.min(0.999, k.sustain) * 100)}%${k.fadeMs !== 0 ? `  fade ${fmtMs(Math.abs(k.fadeMs))}` : ''}  R ${fmtMs(k.releaseMs)}`;
  const eg = (knobs: (get: Get) => CalfEnvelopeKnobs, ampKey: string, level: 'level' | 'filterLevel'): CurveDescriptor => ({
    label: level === 'level' ? 'EG1 Filter Envelope' : 'EG2 Modulation Envelope',
    xUnit: 's', yDomain: [0, 1],
    xDomain: (get) => envelopeDomain(calfEnvelope(knobs(get))),
    series: (get) => {
      const env = calfEnvelope(knobs(get));
      const lines: Array<{ points: Array<[number, number]>; fill?: boolean; color?: string }> = [{ points: env.points, fill: true }];
      if (num(get(ampKey)) > 0) lines.push({ points: calfAmpContour(env, knobs(get).sustain), color: 'rgba(255,255,255,0.55)' });
      return lines;
    },
    readout: (get) => readout(knobs(get)),
    marker: voiceMarker(CALF_MONO_SYNTH_TYPE, (v, get) => {
      const env = calfEnvelope(knobs(get));
      return level === 'level' ? envelopeMarkerX(env, v.stage, v.level) : envelopeMarkerX(env, v.filterStage, v.filterLevel);
    }),
  });
  return {
    eg1: eg(calfEg1Knobs, 'env2amp', 'level'),
    eg2: eg(calfEg2Knobs, 'adsr2Amp', 'filterLevel'),
    filter: {
      label: 'Filter Response (middle C)', xScale: 'log', xDomain: [20, 20000], yDomain: [FILTER_DB_MIN, FILTER_DB_MAX], xUnit: 'Hz', yUnit: 'dB',
      series: (get) => {
        const fs = sampleRate();
        const closed = calfFilterSeries(get, fs, 0, 0);
        const open = calfFilterSeries(get, fs, 1, 1);
        return [...closed.map((points) => ({ points, color: 'rgba(255,255,255,0.35)' })), ...open.map((points) => ({ points, fill: true }))];
      },
      readout: (get) => `${fmtHz(calfCutoffHz(get, 0, 0))} to ${fmtHz(calfCutoffHz(get, 1, 1))}`,
      marker: voiceMarker(CALF_MONO_SYNTH_TYPE, (v) => (v.cutoff > 0 ? v.cutoff : null)),
    },
    lfo: {
      label: 'LFO 1', xUnit: 's', yDomain: [-1, 1], xDomain: (get) => [0, calfLfoWindow(get)],
      series: (get) => [{ points: calfLfoSeries(get) }],
      readout: (get) => `${num(get('lfoRate'), 2).toFixed(2)} Hz  filter +-${Math.round(num(get('lfo2filter')))} ct  pitch ${Math.round(num(get('lfo2pitch')))} ct  pulse width ${Math.round(num(get('lfo2pw')) * 100)}%`,
      marker: voiceMarker(CALF_MONO_SYNTH_TYPE, (v, get) => {
        const window = calfLfoWindow(get);
        // retriggered LFO: the note's age is the curve's x; free-running: only the phase is known
        const x = num(get('lfo1Trig')) <= 0 ? v.elapsedSeconds : v.lfoPhase / Math.max(0.01, num(get('lfoRate'), 2));
        return x <= window ? x : window;
      }),
    },
  };
}
