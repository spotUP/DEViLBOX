/**
 * commonCurveModels.ts - pure curve math shared by the instrument editors, and the builders that turn a few layout
 * keys into a CurveDescriptor (no React, no DOM).
 *
 * Three layers:
 *  1. biquad filter response (Audio EQ Cookbook / Web Audio BiquadFilterNode) - the math FilterFrequencyResponse draws.
 *  2. envelope shapes: the millisecond ADSR layout EnvelopeVisualization draws, plus the Tone.js Envelope shape
 *     (linear attack, exponential-approach decay and release) that Tone-based synths really play.
 *  3. LFO shapes.
 * Builders (adsrCurve, filterCurve, lfoCurve) bind layout keys to those models; units are explicit options, defaulting
 * to the DEViLBOX Tone/Web Audio layouts (milliseconds, sustain in percent, cutoff in Hz, resonance 0..100 = Q x 10).
 */
import type { CurveDescriptor, CurveSeries } from '@/types/synthPanel';

// ---------------------------------------------------------------------------------------------------------
// 1. Filter response
// ---------------------------------------------------------------------------------------------------------

export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch';

/** Sample rate the response is evaluated at (matches the 44.1 kHz the editors' filter drawing always used). */
export const FILTER_SAMPLE_RATE = 44100;
export const FILTER_DB_MIN = -60;
export const FILTER_DB_MAX = 18;

export interface BiquadCoeffs {
  b0: number; b1: number; b2: number;
  /** a0 is normalised out. */
  a1: number; a2: number;
}

/**
 * Audio EQ Cookbook biquad. `Q` is the linear quality factor (alpha = sin(w0) / 2Q). The bandpass is the cookbook's
 * constant-skirt-gain one (peak gain Q) unless `unityBandpass`, which is the Web Audio BiquadFilterNode bandpass
 * (0 dB peak).
 */
export function makeBiquad(type: FilterType, fc: number, Q: number, unityBandpass = false): BiquadCoeffs {
  const f = Math.max(20, Math.min(fc, FILTER_SAMPLE_RATE * 0.499));
  const w0 = (2 * Math.PI * f) / FILTER_SAMPLE_RATE;
  const cosw = Math.cos(w0);
  const sinw = Math.sin(w0);
  const alpha = sinw / (2 * Math.max(Q, 0.01));
  const a0 = 1 + alpha;
  const a1 = -2 * cosw;
  const a2 = 1 - alpha;
  let b0: number, b1: number, b2: number;
  switch (type) {
    case 'highpass':
      b0 = (1 + cosw) / 2; b1 = -(1 + cosw); b2 = (1 + cosw) / 2; break;
    case 'bandpass':
      b0 = unityBandpass ? alpha : sinw / 2; b1 = 0; b2 = unityBandpass ? -alpha : -sinw / 2; break;
    case 'notch':
      b0 = 1; b1 = -2 * cosw; b2 = 1; break;
    default: // lowpass
      b0 = (1 - cosw) / 2; b1 = 1 - cosw; b2 = (1 - cosw) / 2;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Magnitude response in dB at one frequency. 4 poles = two identical cascaded biquads = double the dB. */
export function magnitudeDb(c: BiquadCoeffs, freq: number, poles: 2 | 4): number {
  const w = (2 * Math.PI * freq) / FILTER_SAMPLE_RATE;
  const cosw = Math.cos(w);
  const sinw = Math.sin(w);
  const cos2w = Math.cos(2 * w);
  const sin2w = Math.sin(2 * w);
  const bRe = c.b0 + c.b1 * cosw + c.b2 * cos2w;
  const bIm = -c.b1 * sinw - c.b2 * sin2w;
  const aRe = 1 + c.a1 * cosw + c.a2 * cos2w;
  const aIm = -c.a1 * sinw - c.a2 * sin2w;
  const denom = aRe * aRe + aIm * aIm;
  const mag = Math.sqrt((bRe * bRe + bIm * bIm) / Math.max(denom, 1e-30));
  const db = 20 * Math.log10(Math.max(mag, 1e-10));
  return poles === 4 ? db * 2 : db;
}

/** Normalised 0..1 cutoff and resonance to Hz and Q (the FilterFrequencyResponse props convention). */
export function normalisedFilterParams(
  cutoff: number, resonance: number, freqMin = 20, freqMax = 20000, qMin = 0.5, qMax = 20,
): { fc: number; Q: number } {
  const c = Math.max(0, Math.min(1, cutoff));
  const r = Math.max(0, Math.min(1, resonance));
  return { fc: freqMin * Math.pow(freqMax / freqMin, c), Q: qMin + r * (qMax - qMin) };
}

/**
 * The Q a Web Audio BiquadFilterNode (and so Tone.Filter) really uses. For lowpass and highpass the node's Q is the
 * resonance peak in dB (spec: alpha = sin(w0) / (2 * 10^(Q/20))); for bandpass and notch it is the plain quality factor.
 */
export function webAudioLinearQ(type: FilterType, qParam: number): number {
  return type === 'lowpass' || type === 'highpass' ? Math.pow(10, qParam / 20) : qParam;
}

/** Log-spaced frequencies from lo to hi. */
export function logFrequencies(count: number, lo = 20, hi = 20000): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(lo * Math.pow(hi / lo, i / (count - 1)));
  return out;
}

/** The response as [Hz, dB] points on a log frequency grid. */
export function filterResponsePoints(
  type: FilterType, fc: number, Q: number, poles: 2 | 4, count = 160, lo = 20, hi = 20000, unityBandpass = false,
): Array<[number, number]> {
  const coeffs = makeBiquad(type, fc, Q, unityBandpass);
  return logFrequencies(count, lo, hi).map((f) => [f, magnitudeDb(coeffs, f, poles)]);
}

// ---------------------------------------------------------------------------------------------------------
// 2. Envelope shapes
// ---------------------------------------------------------------------------------------------------------

export interface MsEnvelopeLayout {
  atkMs: number; decMs: number; relMs: number;
  /** Sustain level 0..1. */
  sus: number;
  /** Time the sustain is drawn for (a fifth of the ADSR time, at least 50 ms). */
  holdMs: number;
  totalMs: number;
}

/** The timeline EnvelopeVisualization mode "ms" lays out: A, D, a sustain hold, then R. */
export function msEnvelopeLayout(attackMs: number, decayMs: number, sustainPercent: number, releaseMs: number): MsEnvelopeLayout {
  const atkMs = Math.max(0, attackMs);
  const decMs = Math.max(0, decayMs);
  const relMs = Math.max(0, releaseMs);
  const sus = Math.max(0, Math.min(100, sustainPercent)) / 100;
  const adsr = atkMs + decMs + relMs;
  const holdMs = Math.max(adsr * 0.2, 50);
  return { atkMs, decMs, relMs, sus, holdMs, totalMs: adsr + holdMs };
}

export type EnvelopeShape = 'linear' | 'tone';

/** Tone.Param.exponentialApproachValueAtTime time constant (Param.js): ln(seconds + 1) / ln(200). */
function toneTimeConstant(seconds: number): number {
  return Math.log(seconds + 1) / Math.log(200);
}

/**
 * Value of a Tone ramp from v0 to v1 over `seconds`, `t` seconds after it starts: a setTarget exponential approach
 * until 90% of the time, then a linear ramp to v1 (Tone Param.exponentialApproachValueAtTime).
 */
export function toneApproach(v0: number, v1: number, seconds: number, t: number): number {
  if (t <= 0) return v0;
  if (t >= seconds) return v1;
  const tc = toneTimeConstant(seconds);
  if (t <= seconds * 0.9) return v1 + (v0 - v1) * Math.exp(-t / tc);
  const at90 = v1 + (v0 - v1) * Math.exp(-(seconds * 0.9) / tc);
  return at90 + (v1 - at90) * ((t - seconds * 0.9) / (seconds * 0.1));
}

/**
 * ADSR as [milliseconds, level 0..1] points, with the gate held for the layout's sustain hold and then released.
 * 'linear' is the polyline EnvelopeVisualization draws (and a manual linear ADSR such as WavetableSynth plays).
 * 'tone' is Tone.Envelope's real shape: linear attack, then exponential-approach decay and release; an attack
 * shorter than a sample is instant, a decay of 0 or a sustain of 1 has no decay stage.
 */
export function adsrPoints(
  attackMs: number, decayMs: number, sustainPercent: number, releaseMs: number, shape: EnvelopeShape = 'tone',
  perSegment = 48,
): Array<[number, number]> {
  const e = msEnvelopeLayout(attackMs, decayMs, sustainPercent, releaseMs);
  const gateEnd = e.atkMs + e.decMs + e.holdMs;
  if (shape === 'linear') {
    return [[0, 0], [e.atkMs, 1], [e.atkMs + e.decMs, e.sus], [gateEnd, e.sus], [e.totalMs, 0]];
  }
  const pts: Array<[number, number]> = [];
  const instantAttack = e.atkMs < 0.02; // Tone: attack < one sample is a step
  pts.push([0, instantAttack ? 1 : 0]);
  if (!instantAttack) pts.push([e.atkMs, 1]);
  const hasDecay = e.decMs > 0 && e.sus < 1;
  const decaySecs = e.decMs / 1000;
  const holdLevel = hasDecay ? e.sus : 1;
  if (hasDecay) {
    for (let i = 1; i <= perSegment; i++) {
      const ms = (e.decMs * i) / perSegment;
      pts.push([e.atkMs + ms, toneApproach(1, e.sus, decaySecs, ms / 1000)]);
    }
  }
  pts.push([gateEnd, holdLevel]);
  if (e.relMs <= 0) {
    pts.push([gateEnd, 0]);
  } else {
    const relSecs = e.relMs / 1000;
    for (let i = 1; i <= perSegment; i++) {
      const ms = (e.relMs * i) / perSegment;
      pts.push([gateEnd + ms, toneApproach(holdLevel, 0, relSecs, ms / 1000)]);
    }
  }
  return pts;
}

// ---------------------------------------------------------------------------------------------------------
// 3. LFO shapes
// ---------------------------------------------------------------------------------------------------------

export type LfoShape = 'sine' | 'triangle' | 'square' | 'sawtooth';

/** One LFO sample, phase in cycles, output -1..1. */
export function lfoValue(shape: LfoShape, phase: number): number {
  const p = phase - Math.floor(phase);
  switch (shape) {
    case 'triangle': return p < 0.5 ? -1 + 4 * p : 3 - 4 * p;
    case 'square': return p < 0.5 ? 1 : -1;
    case 'sawtooth': return -1 + 2 * p;
    default: return Math.sin(2 * Math.PI * p);
  }
}

/** [seconds, -depth..depth] over `windowSec`. */
export function lfoPoints(shape: LfoShape, rateHz: number, depth01: number, windowSec = 1, count = 200): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const t = (windowSec * i) / (count - 1);
    out.push([t, lfoValue(shape, t * rateHz) * depth01]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Builders: layout keys in, CurveDescriptor out
// ---------------------------------------------------------------------------------------------------------

type Get = (key: string) => number;
type GetText = (key: string) => string;
/** A layout key to read, or a constant. */
export type Source = string | number;

const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);
const read = (get: Get, src: Source, fallback: number): number => (typeof src === 'number' ? src : finite(get(src), fallback));

const FILTER_TYPES: readonly FilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch'];
export const asFilterType = (text: string, fallback: FilterType = 'lowpass'): FilterType =>
  (FILTER_TYPES as readonly string[]).includes(text) ? (text as FilterType) : fallback;

export interface AdsrCurveOptions {
  label?: string;
  attack: Source; decay: Source; sustain: Source; release: Source;
  /** 'tone' for Tone.Envelope synths (default), 'linear' for a manual linear ADSR. */
  shape?: EnvelopeShape;
  /** Unit of the sustain source: 'percent' (0..100, default) or 'unit' (0..1). */
  sustainUnit?: 'percent' | 'unit';
  /** Unit of the time sources: 'ms' (default) or 's'. */
  timeUnit?: 'ms' | 's';
  height?: number;
}

/**
 * An amplitude envelope curve. X is the fraction (0..1) of the drawn timeline (the real times change with the knobs;
 * the readout names them), Y the level 0..1.
 */
export function adsrCurve(o: AdsrCurveOptions): CurveDescriptor {
  const toMs = o.timeUnit === 's' ? 1000 : 1;
  const sustainPercent = (get: Get): number => {
    const s = read(get, o.sustain, 0);
    return o.sustainUnit === 'unit' ? s * 100 : s;
  };
  const times = (get: Get) => ({
    a: read(get, o.attack, 0) * toMs, d: read(get, o.decay, 0) * toMs, r: read(get, o.release, 0) * toMs,
  });
  return {
    label: o.label ?? 'Envelope',
    height: o.height,
    xDomain: [0, 1],
    yDomain: [0, 1],
    series: (get): CurveSeries[] => {
      const { a, d, r } = times(get);
      const pts = adsrPoints(a, d, sustainPercent(get), r, o.shape ?? 'tone');
      const total = pts[pts.length - 1][0] || 1;
      return [{ points: pts.map(([ms, level]) => [ms / total, level] as const), fill: true }];
    },
    readout: (get) => {
      const { a, d, r } = times(get);
      return `A ${fmtMs(a)}  D ${fmtMs(d)}  S ${Math.round(sustainPercent(get))}%  R ${fmtMs(r)}`;
    },
  };
}

export const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s` : `${Math.round(ms)} ms`);

export interface FilterCurveOptions {
  label?: string;
  cutoff: Source;
  /** Maps the cutoff source value to Hz when the layout value is not Hz itself (StringMachine brightness). */
  cutoffToHz?: (value: number) => number;
  /** Source of the resonance value; mapped to the Q of the filter by `resonanceToQ`. */
  resonance: Source;
  /** Layout key holding the type string ('lowpass' ...); falls back to `type`. */
  typeKey?: string;
  type?: FilterType;
  /** Resonance source value to the Q parameter handed to the filter node (default: value / 10, the Tone factories). */
  resonanceToQ?: (value: number) => number;
  /**
   * 'webaudio' (default): the Q is a BiquadFilterNode Q parameter (dB for lowpass and highpass).
   * 'linear': the Q is already the plain quality factor.
   */
  qMode?: 'webaudio' | 'linear';
  /** 2 = 12 dB/oct (one biquad), 4 = 24 dB/oct (Tone.Filter rolloff -24). */
  poles?: 2 | 4;
  height?: number;
}

/** A filter response curve (Hz on a log axis, dB) that follows the cutoff, resonance and type knobs. */
export function filterCurve(o: FilterCurveOptions): CurveDescriptor {
  const cutoffHz = (get: Get): number => Math.max(20, (o.cutoffToHz ?? ((v: number) => v))(read(get, o.cutoff, 1000)));
  const typeOf = (getText?: GetText): FilterType =>
    o.typeKey && getText ? asFilterType(getText(o.typeKey), o.type ?? 'lowpass') : (o.type ?? 'lowpass');
  const qOf = (get: Get, type: FilterType): number => {
    const q = (o.resonanceToQ ?? ((v: number) => v / 10))(read(get, o.resonance, 0));
    return o.qMode === 'linear' ? q : webAudioLinearQ(type, q);
  };
  return {
    label: o.label ?? 'Filter response',
    height: o.height,
    xScale: 'log',
    xDomain: [20, 20000],
    yDomain: [FILTER_DB_MIN, FILTER_DB_MAX],
    xUnit: 'Hz',
    yUnit: 'dB',
    series: (get, getText): CurveSeries[] => {
      const type = typeOf(getText);
      return [{ points: filterResponsePoints(type, cutoffHz(get), qOf(get, type), o.poles ?? 2, 160, 20, 20000, o.qMode !== 'linear'), fill: true }];
    },
    readout: (get, getText) => `${typeOf(getText)}  ${fmtHz(cutoffHz(get))}`,
  };
}

export const fmtHz = (hz: number): string => (hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz` : `${Math.round(hz)} Hz`);

export interface LfoCurveOptions {
  label?: string;
  rate: Source;
  /** Depth source, scaled to 0..1 by `depthScale` (default 1 / 100, a percent knob). */
  depth: Source;
  depthScale?: number;
  shape?: LfoShape;
  windowSec?: number;
  height?: number;
}

/** An LFO shape curve: seconds on x (so the rate shows as the number of cycles), -1..1 on y. */
export function lfoCurve(o: LfoCurveOptions): CurveDescriptor {
  const windowSec = o.windowSec ?? 1;
  const depthOf = (get: Get): number => Math.max(0, Math.min(1, read(get, o.depth, 0) * (o.depthScale ?? 0.01)));
  return {
    label: o.label ?? 'LFO',
    height: o.height,
    xDomain: [0, windowSec],
    yDomain: [-1, 1],
    xUnit: 's',
    series: (get): CurveSeries[] => [{ points: lfoPoints(o.shape ?? 'sine', Math.max(0, read(get, o.rate, 1)), depthOf(get), windowSec) }],
    readout: (get) => `${read(get, o.rate, 1).toFixed(1)} Hz  depth ${Math.round(depthOf(get) * 100)}%`,
  };
}

export interface CutoffEnvelopeCurveOptions {
  label?: string;
  /** Base cutoff in Hz, envelope amount in percent (-100..100), and the filter envelope's attack/decay (ms) and sustain (percent). */
  cutoff: Source; amount: Source; attack: Source; decay: Source; sustain: Source;
  height?: number;
}

/**
 * The cutoff over time of a filter envelope that ramps linearly in Hz (WavetableSynth.triggerAttack): base to
 * base + amount * (20 kHz - base) over the attack, then to the sustain point over the decay. X is the fraction of the
 * drawn timeline, Y is Hz. No release stage: the engine does not move the filter on release.
 */
export function cutoffEnvelopeCurve(o: CutoffEnvelopeCurveOptions): CurveDescriptor {
  const model = (get: Get) => {
    const base = Math.max(20, read(get, o.cutoff, 1000));
    const amt = read(get, o.amount, 0) / 100;
    const peak = Math.max(0, Math.min(20000, base + amt * (20000 - base))); // Web Audio clamps a frequency to >= 0
    const sus = Math.max(0, Math.min(100, read(get, o.sustain, 0))) / 100;
    const a = Math.max(0, read(get, o.attack, 0));
    const d = Math.max(0, read(get, o.decay, 0));
    return { base, peak, sustainHz: base + (peak - base) * sus, a, d, hold: Math.max((a + d) * 0.25, 50) };
  };
  return {
    label: o.label ?? 'Filter cutoff envelope',
    height: o.height,
    xDomain: [0, 1],
    yDomain: [0, 20000],
    yUnit: 'Hz',
    series: (get): CurveSeries[] => {
      const m = model(get);
      const total = m.a + m.d + m.hold;
      const x = (ms: number) => ms / total;
      return [{ points: [[0, m.base], [x(m.a), m.peak], [x(m.a + m.d), m.sustainHz], [1, m.sustainHz]], fill: true }];
    },
    readout: (get) => {
      const m = model(get);
      return `${fmtHz(m.base)} to ${fmtHz(m.peak)} to ${fmtHz(m.sustainHz)}`;
    },
  };
}
