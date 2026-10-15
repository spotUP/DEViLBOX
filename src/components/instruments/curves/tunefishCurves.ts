/**
 * tunefishCurves.ts - the four voice filters of the Tunefish 4 engine (third-party/tunefish/src/tunefish4/Source/synth/
 * tf4.cpp, eTfFilterUpdate / eTfFilterProcess) as response curves. Layout values are the 0..1 engine parameters.
 *
 *  - Cutoff mapping: low-pass and notch f = c^2 * 20000 + 30 Hz, high-pass and band-pass f = c^2 * 10000 + 30 Hz. The
 *    resonance / Q parameter is clamped to 0..0.85.
 *  - Low-pass: four one-pole sections G(z) = p (1 + z^-1) / (1 + k z^-1) in series with feedback r * y4 delayed one
 *    sample, so H(z) = G^4 / (1 + r z^-1 G^4), with k = 3.6 f' - 1.6 f'^2 - 1 (f' = 2 f / fs), p = (k + 1) / 2 and
 *    r = q e^((1 - p) 1.386249). The output stage y - y^3 / 6 is a soft clip; the curve is its small-signal response.
 *  - High-pass, band-pass: the biquad of eTfFilterUpdate, alpha = sin(w0) sinh(log10(2) / 2 (1 - q) w0 / sin(w0)) (the
 *    engine uses log10 where the Audio EQ Cookbook has ln, which is why its Q law differs from a textbook one).
 *  - Notch: b0 = (1 - q)^2 / (2 (|cos w0| + 1)) + q, b1 = -2 cos(w0) b0, b2 = b0, a1 = -2 cos(w0) q, a2 = q^2.
 *  - The engine multiplies each cutoff by the voice's modulation-matrix output (default 1); the live marker reports the
 *    product, the curve shows the knob.
 *
 * Not drawn (named, with why): the generator spectrum (built per note from the note's frequency range and a random
 * table), and the amplitude and filter envelopes, LFOs and modulation matrix, whose parameters (TF_ADSR*, TF_LFO*,
 * TF_MOD*) are not in the layout or in TunefishInstrumentConfig, so no knob drives a curve for them.
 */
import type { CurveDescriptor } from '@/types/synthPanel';
import { audioSampleRate, num, polyMul, voiceMarker, zMagnitudeDb, logGrid, FILTER_DB_MAX, FILTER_DB_MIN } from './wasmSubtractiveModels';
import { fmtHz } from './commonCurveModels';

export const TUNEFISH_SYNTH_TYPE = 'TunefishSynth';
type Get = (key: string) => number;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const EXPONE = 2.718281828459;

export type TunefishFilterKind = 'lp' | 'hp' | 'bp' | 'nt';

/** eTfFilterUpdate: normalised cutoff parameter to Hz. */
export function tunefishCutoffHz(kind: TunefishFilterKind, cutoffParam: number): number {
  const c = clamp01(cutoffParam);
  return c * c * (kind === 'lp' || kind === 'nt' ? 20000 : 10000) + 30;
}
/** The cutoff parameter that gives `hz` (the inverse, for placing the marker). */
export function tunefishCutoffParamFromHz(kind: TunefishFilterKind, hz: number): number {
  return Math.sqrt(Math.max(0, hz - 30) / (kind === 'lp' || kind === 'nt' ? 20000 : 10000));
}

export function tunefishFilterCoefficients(kind: TunefishFilterKind, cutoffParam: number, qParam: number, fs: number): { b: number[]; a: number[] } {
  const q = Math.min(0.85, Math.max(0, qParam));
  const f = tunefishCutoffHz(kind, cutoffParam);
  if (kind === 'lp') {
    const fn = (2 * f) / fs;
    const k = 3.6 * fn - 1.6 * fn * fn - 1;
    const p = (k + 1) * 0.5;
    const r = q * Math.pow(EXPONE, (1 - p) * 1.386249);
    const gb = [p, p];
    const ga = [1, k];
    let nb: number[] = [1];
    let na: number[] = [1];
    for (let i = 0; i < 4; i++) { nb = polyMul(nb, gb); na = polyMul(na, ga); }
    // H = nb / (na + r z^-1 nb)
    const fb = [0, ...nb.map((v) => r * v)];
    const den = Array.from({ length: Math.max(na.length, fb.length) }, (_, i) => (na[i] ?? 0) + (fb[i] ?? 0));
    return { b: nb, a: den };
  }
  if (kind === 'nt') {
    const z1x = Math.cos((2 * Math.PI * f) / fs);
    const b0 = ((1 - q) * (1 - q)) / (2 * (Math.abs(z1x) + 1)) + q;
    return { b: [b0, -2 * z1x * b0, b0], a: [1, -2 * z1x * q, q * q] };
  }
  const w0 = (2 * Math.PI * f) / fs;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin * Math.sinh(((Math.log10(2) / 2) * (1 - q) * w0) / sin);
  const a0 = 1 + alpha;
  const b = kind === 'hp' ? [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2] : [sin / 2, 0, -sin / 2];
  return { b: b.map((v) => v / a0), a: [1, (-2 * cos) / a0, (1 - alpha) / a0] };
}

export function tunefishResponse(kind: TunefishFilterKind, cutoffParam: number, qParam: number, fs: number): Array<[number, number]> {
  const c = tunefishFilterCoefficients(kind, cutoffParam, qParam, fs);
  return logGrid().filter((hz) => hz < fs / 2).map((hz) => [hz, zMagnitudeDb(c.b, c.a, hz, fs)] as [number, number]);
}

const KEYS: Record<TunefishFilterKind, { on: string; cutoff: string; q: string; name: string }> = {
  lp: { on: 'lpFilterOn', cutoff: 'lpFilterCutoff', q: 'lpFilterResonance', name: 'Low-pass' },
  hp: { on: 'hpFilterOn', cutoff: 'hpFilterCutoff', q: 'hpFilterResonance', name: 'High-pass' },
  bp: { on: 'bpFilterOn', cutoff: 'bpFilterCutoff', q: 'bpFilterQ', name: 'Band-pass' },
  nt: { on: 'ntFilterOn', cutoff: 'ntFilterCutoff', q: 'ntFilterQ', name: 'Notch' },
};

/** Position of the filter's effective cutoff parameter in a voice report: the standard cutoff slot (low-pass), then extra[0..2]. */
export const tunefishVoiceCutoffParam = (kind: TunefishFilterKind, voice: { cutoff: number; extra: number[] }): number =>
  kind === 'lp' ? voice.cutoff : voice.extra[kind === 'hp' ? 0 : kind === 'bp' ? 1 : 2] ?? 0;

export function tunefishCurves(sampleRate: () => number = audioSampleRate): Record<TunefishFilterKind, CurveDescriptor> {
  const make = (kind: TunefishFilterKind): CurveDescriptor => {
    const k = KEYS[kind];
    return {
      label: `${k.name} Filter Response`, xScale: 'log', xDomain: [20, 20000], yDomain: [FILTER_DB_MIN, FILTER_DB_MAX], xUnit: 'Hz', yUnit: 'dB',
      series: (get: Get) => {
        const on = num(get(k.on)) > 0.5;
        const points = tunefishResponse(kind, num(get(k.cutoff)), num(get(k.q)), sampleRate());
        return [{ points, fill: on, color: on ? undefined : 'rgba(255,255,255,0.35)' }];
      },
      readout: (get: Get) => `${num(get(k.on)) > 0.5 ? 'on' : 'off'}  ${fmtHz(tunefishCutoffHz(kind, num(get(k.cutoff))))}`,
      marker: voiceMarker(TUNEFISH_SYNTH_TYPE, (v, get) => (num(get(k.on)) > 0.5 ? tunefishCutoffHz(kind, tunefishVoiceCutoffParam(kind, v)) : null)),
    };
  };
  return { lp: make('lp'), hp: make('hp'), bp: make('bp'), nt: make('nt') };
}
