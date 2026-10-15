/**
 * zynCurves.ts - what the ZynAddSubFX engine does with the editor's knobs (the vendored source: Synth/Envelope.cpp,
 * Params/EnvelopeParams.cpp, Synth/ModFilter.cpp, DSP/AnalogFilter.cpp, Synth/OscilGen.cpp; the bridge: zynaddsubfx-wasm/
 * zasfx_bridge.cpp, public/zynaddsubfx/ZynAddSubFX.worklet.js), as curves. Layout values are the editor's 0..1 knobs; the worklet
 * scales them to 0..127 and the bridge turns that into the engine's units.
 *
 * Laws, verified against the code and the measurements in zynCurves.test.ts:
 *  - Envelope times are Zyn's own dT law, seconds = (2^(v / 127 * 12) - 1) / 100 with v = knob * 127 (0 to 41 s), then multiplied by
 *    the envelope's stretch: (440 / note frequency)^(stretch / 64), stretch 64 for the amplitude envelope (so the same knob is
 *    shorter on a high note) and 0 for the filter envelope. Times shorter than one 256-sample buffer jump (Envelope::Envelope).
 *  - Amplitude envelope (ADSR_dB, Envelope::envout_dB): four points 0 -> 127 -> sustain -> 0 on a -40 dB to 0 dB scale
 *    (value (1 - v / 127) * -40 dB); the attack is LINEAR in amplitude (the first segment), decay and release are linear in dB, and
 *    -40 dB is silence (env_dB2rap = max(10^(dB / 20) - 0.01, 0) / 0.99). The release is forced (Envelope forcedrelease).
 *  - Filter envelope (ADSR_filter): octaves = (value - 64) / 64 * 6 through four points A_val -> D_val -> 64 -> R_val; the sustain is
 *    fixed at the centre, which left the SUS knob nothing to write: the bridge switches the envelope to free mode with the same four
 *    points and puts the sustain point at 64 + (D_val - 64) * SUS. ENV AMT sets D_val, the peak. The cutoff is
 *    baseFreq * 2^(envelope + velocity sense + key tracking) (ModFilter::update, Filter::getrealfreq).
 *  - Filter (AnalogFilter::computeCoeff): types 0 LPF 1 pole, 1 HPF 1 pole, 2 LPF 2 poles, 3 HPF 2 poles, 4 BPF 2 poles, 5 NOTCH,
 *    6 PEAK, 7 LOW SHELF, 8 HIGH SHELF, cascaded (stages + 1) times; Q is Zyn's own law exp((v / 127)^2 ln 1000) - 0.9.
 *  - Oscillator (OscilGen::getbasefunction): the base function IS the waveform at the default harmonics; index 0 is a sine and
 *    1..15 are the functions below, parameter 0.5.
 *
 * Not modelled (named): the LFOs (the layout has no LFO control), the SUB and PAD synth spectra, unison, FM, the formant, state
 * variable, Moog and comb filter categories (the layout only sets the analog category), controllers.
 */
import type { CurveDescriptor } from '@/types/synthPanel';
import {
  audioSampleRate, envelopeDomain, envelopeMarkerX, holdFor, num, voiceMarker, logGrid, FILTER_DB_MAX, FILTER_DB_MIN, type StagedEnvelope,
} from './wasmSubtractiveModels';
import { fmtHz, fmtMs } from './commonCurveModels';

export const ZYN_SYNTH_TYPE = 'ZynAddSubFX';
type Get = (key: string) => number;

/** Samples per engine buffer (the bridge's synth.buffersize): envelopes advance once per buffer. */
export const ZYN_BUFFER = 256;
export const ZYN_REFERENCE_NOTE = 60;
export const zynNoteHz = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);

/** The dT law: seconds for a 0..127 time value (EnvelopeParams dTREAL). */
export const zynEnvSeconds = (v: number): number => (Math.pow(2, (Math.min(127, Math.max(0, v)) / 127) * 12) - 1) / 100;
/** (440 / f)^(stretch / 64): the envelope time multiplier of a note. */
export const zynEnvStretch = (stretch: number, noteHz: number): number => Math.pow(440 / noteHz, stretch / 64);
/** EnvelopeParams::env_dB2rap. */
export const zynDbToAmp = (db: number): number => Math.max(Math.pow(10, db / 20) - 0.01, 0) / 0.99;

// ---- envelopes -----------------------------------------------------------------------------------------------

export interface ZynEnvKnobs { attack: number; decay: number; sustain: number; release: number }

/** The editor's knob -> the engine's 0..127 (the worklet's 'uni' transform: value * 127, then the bridge clamps and rounds integers). */
const to127 = (knob: number): number => Math.min(1, Math.max(0, num(knob))) * 127;

/** Amplitude envelope drawing at `note` (full velocity); `hold` seconds is how long the key stays down after the decay. */
export function zynAmpEnvelope(k: ZynEnvKnobs, note = ZYN_REFERENCE_NOTE, fs = 48000, hold?: number, stretch = 64): StagedEnvelope {
  const st = zynEnvStretch(stretch, zynNoteHz(note));
  const bufferDt = ZYN_BUFFER / fs;
  const dt = (knob: number): number => { const s = zynEnvSeconds(to127(knob)) * st; return s > bufferDt ? s : 0; };
  const a = dt(k.attack), d = dt(k.decay), r = dt(k.release);
  const sustainDb = (1 - Math.round(to127(k.sustain)) / 127) * -40;
  const attackEnd = a;
  const decayEnd = a + d;
  const releaseAt = decayEnd + (hold ?? holdFor(a, d));
  const total = releaseAt + r;
  const points: Array<[number, number]> = [];
  const steps = 40;
  if (a > 0) for (let i = 0; i <= steps; i++) points.push([(a * i) / steps, i / steps]);
  else points.push([0, 1]);
  if (d > 0) for (let i = 1; i <= steps; i++) points.push([a + (d * i) / steps, zynDbToAmp((sustainDb * i) / steps)]);
  else points.push([a, zynDbToAmp(sustainDb)]);
  points.push([releaseAt, zynDbToAmp(sustainDb)]);
  if (r > 0) for (let i = 1; i <= steps; i++) points.push([releaseAt + (r * i) / steps, zynDbToAmp(sustainDb + ((-40 - sustainDb) * i) / steps)]);
  else points.push([releaseAt, 0]);
  return { points, attackEnd, decayEnd, releaseAt, total: Math.max(total, releaseAt + 0.001) };
}

export interface ZynFilterEnvKnobs { attack: number; decay: number; sustain: number; release: number; amount: number }

/** The octaves a Penvval value stands for (ADSR_filter). */
export const zynValueOctaves = (value: number): number => ((value - 64) / 64) * 6;
/** The engine's own 0..1 scale for the filter envelope, (octaves + 6) / 12 (Envelope::watch). */
export const zynOctavesLevel = (octaves: number): number => (octaves + 6) / 12;
/** ENV AMT 0..1 -> the peak D_val the bridge writes: 64 + knob * 63 (rounded), in octaves. */
export const zynFilterPeakValue = (amount: number): number => Math.round(64 + Math.min(1, Math.max(0, num(amount))) * 63);
export const zynFilterPeakOctaves = (amount: number): number => zynValueOctaves(zynFilterPeakValue(amount));

/** Filter envelope drawing as the engine's level (octaves + 6) / 12; 0.5 is the centre. */
export function zynFilterEnvelope(k: ZynFilterEnvKnobs, fs = 48000, hold?: number): StagedEnvelope {
  const bufferDt = ZYN_BUFFER / fs;
  const dt = (knob: number): number => { const s = zynEnvSeconds(to127(knob)); return s > bufferDt ? s : 0; }; // stretch 0: no note scaling
  const a = dt(k.attack), d = dt(k.decay), r = dt(k.release);
  const peak = zynOctavesLevel(zynFilterPeakOctaves(k.amount));
  const centre = zynOctavesLevel(0);
  const attackEnd = a;
  const decayEnd = a + d;
  const releaseAt = decayEnd + (hold ?? holdFor(a, d));
  const total = releaseAt + r;
  // the bridge puts the sustain point at 64 + (peak - 64) * SUS (round to the engine's integer value)
  const sustainValue = Math.round(64 + (zynFilterPeakValue(k.amount) - 64) * Math.round(to127(k.sustain)) / 127);
  const sustain = zynOctavesLevel(zynValueOctaves(sustainValue));
  const points: Array<[number, number]> = [[0, centre]];
  points.push([a, peak]);
  if (d > 0) points.push([decayEnd, sustain]);
  else points.push([a, sustain]);
  points.push([releaseAt, sustain]);
  points.push([Math.max(total, releaseAt + 0.001), centre]);
  return { points, attackEnd, decayEnd, releaseAt, total: Math.max(total, releaseAt + 0.001) };
}

// ---- filter --------------------------------------------------------------------------------------------------

export const ZYN_FILTER_TYPES = ['Low Pass 1 Pole', 'High Pass 1 Pole', 'Low Pass 2 Poles', 'High Pass 2 Poles', 'Band Pass', 'Notch', 'Peak', 'Low Shelf', 'High Shelf'] as const;

/** Q = exp((v / 127)^2 ln 1000) - 0.9 (FilterParams::baseqFromOldPq), v = the resonance knob * 127 rounded. */
export const zynResonanceQ = (knob: number): number => Math.exp(Math.pow(Math.round(to127(knob)) / 127, 2) * Math.log(1000)) - 0.9;
/** The base cutoff in Hz: the bridge maps the 0..127 value to 20 Hz * 1000^(v / 127). */
export const zynCutoffHz = (knob: number): number => 20 * Math.pow(1000, to127(knob) / 127);
/** Key tracking in octaves per octave of note: the bridge sets freqtracking = (v - 64) / 64 * 100 percent. */
export const zynKeyTracking = (knob: number): number => ((to127(knob) - 64) / 64);

/** AnalogFilter::computeCoeff with the cascade count; returns |H| at `hz`. `stages` is Pstages (the filter runs stages + 1 times). */
export function zynFilterAmplitude(type: number, cutoffHz: number, q: number, hz: number, fs = 48000, stages = 0, gainDb = 0): number {
  const half = fs / 2;
  let zeroCoefs = false;
  let freq = cutoffHz;
  if (freq > half - 500) { freq = half - 500; zeroCoefs = true; }
  if (freq < 0.1) freq = 0.1;
  q = Math.max(0, q);
  let tmpq = q, tmpgain = Math.pow(10, gainDb / 20);
  if (stages !== 0) { tmpq = q > 1 ? Math.pow(q, 1 / (stages + 1)) : q; tmpgain = Math.pow(tmpgain, 1 / (stages + 1)); }
  const omega = (2 * Math.PI * freq) / fs;
  const sn = Math.sin(omega), cs = Math.cos(omega);
  const c = [0, 0, 0], d = [0, 0, 0];
  let alpha: number, tmp: number, beta: number, tgp1: number, tgm1: number;
  switch (type) {
    case 0: tmp = zeroCoefs ? 0 : Math.exp((-2 * Math.PI * freq) / fs); c[0] = 1 - tmp; d[1] = tmp; break;
    case 1: tmp = zeroCoefs ? 0 : Math.exp((-2 * Math.PI * freq) / fs); c[0] = (1 + tmp) / 2; c[1] = -(1 + tmp) / 2; d[1] = tmp; break;
    case 2:
      if (!zeroCoefs) { alpha = sn / (2 * tmpq); tmp = 1 + alpha; c[1] = (1 - cs) / tmp; c[0] = c[2] = c[1] / 2; d[1] = (2 * cs) / tmp; d[2] = -(1 - alpha) / tmp; } else c[0] = 1;
      break;
    case 3:
      if (!zeroCoefs) { alpha = sn / (2 * tmpq); tmp = 1 + alpha; c[0] = (1 + cs) / 2 / tmp; c[1] = -(1 + cs) / tmp; c[2] = (1 + cs) / 2 / tmp; d[1] = (2 * cs) / tmp; d[2] = -(1 - alpha) / tmp; }
      break;
    case 4:
      if (!zeroCoefs) { alpha = sn / (2 * tmpq); tmp = 1 + alpha; c[0] = (alpha / tmp) * Math.sqrt(tmpq + 1); c[2] = -c[0]; d[1] = (2 * cs) / tmp; d[2] = -(1 - alpha) / tmp; }
      break;
    case 5:
      if (!zeroCoefs) { alpha = sn / (2 * Math.sqrt(tmpq)); tmp = 1 + alpha; c[0] = 1 / tmp; c[1] = (-2 * cs) / tmp; c[2] = 1 / tmp; d[1] = (2 * cs) / tmp; d[2] = -(1 - alpha) / tmp; } else c[0] = 1;
      break;
    case 6:
      if (!zeroCoefs) {
        const tq = tmpq * 3;
        alpha = sn / (2 * tq); tmp = 1 + alpha / tmpgain;
        c[0] = (1 + alpha * tmpgain) / tmp; c[1] = (-2 * cs) / tmp; c[2] = (1 - alpha * tmpgain) / tmp; d[1] = (2 * cs) / tmp; d[2] = -(1 - alpha / tmpgain) / tmp;
      } else c[0] = 1;
      break;
    case 7:
      if (!zeroCoefs) {
        const tq = Math.sqrt(tmpq);
        beta = Math.sqrt(tmpgain) / tq; tgp1 = tmpgain + 1; tgm1 = tmpgain - 1; tmp = tgp1 + tgm1 * cs + beta * sn;
        c[0] = (tmpgain * (tgp1 - tgm1 * cs + beta * sn)) / tmp; c[1] = (2 * tmpgain * (tgm1 - tgp1 * cs)) / tmp; c[2] = (tmpgain * (tgp1 - tgm1 * cs - beta * sn)) / tmp;
        d[1] = (2 * (tgm1 + tgp1 * cs)) / tmp; d[2] = -(tgp1 + tgm1 * cs - beta * sn) / tmp;
      } else c[0] = tmpgain;
      break;
    default:
      if (!zeroCoefs) {
        const tq = Math.sqrt(tmpq);
        beta = Math.sqrt(tmpgain) / tq; tgp1 = tmpgain + 1; tgm1 = tmpgain - 1; tmp = tgp1 - tgm1 * cs + beta * sn;
        c[0] = (tmpgain * (tgp1 + tgm1 * cs + beta * sn)) / tmp; c[1] = (-2 * tmpgain * (tgm1 + tgp1 * cs)) / tmp; c[2] = (tmpgain * (tgp1 + tgm1 * cs - beta * sn)) / tmp;
        d[1] = (-2 * (tgm1 - tgp1 * cs)) / tmp; d[2] = -(tgp1 - tgm1 * cs - beta * sn) / tmp;
      } else c[0] = 1;
  }
  // AnalogFilter::H
  const fr = (hz / fs) * Math.PI * 2;
  let x = c[0], y = 0;
  for (let n = 1; n < 3; n++) { x += Math.cos(n * fr) * c[n]; y -= Math.sin(n * fr) * c[n]; }
  let h = x * x + y * y;
  x = 1; y = 0;
  for (let n = 1; n < 3; n++) { x -= Math.cos(n * fr) * d[n]; y += Math.sin(n * fr) * d[n]; }
  h /= x * x + y * y;
  return Math.pow(h, (stages + 1) / 2);
}

export const zynFilterDb = (type: number, cutoffHz: number, q: number, hz: number, fs = 48000, stages = 0, gainDb = 0): number => {
  const a = zynFilterAmplitude(type, cutoffHz, q, hz, fs, stages, gainDb);
  return a <= 1e-12 ? FILTER_DB_MIN : Math.max(FILTER_DB_MIN, 20 * Math.log10(a));
};

/** The cutoff in Hz a note gets at envelope level `octaves` (ModFilter::update with no controller and no LFO). */
export function zynNoteCutoffHz(get: Get, note: number, envelopeOctaves: number): number {
  const base = zynCutoffHz(num(get('filterCutoff'), 0.8));
  const tracking = Math.log2(zynNoteHz(note) / 440) * zynKeyTracking(num(get('filterKeyTrack'), 0.5));
  return Math.min(20000, Math.max(0.1, base * Math.pow(2, envelopeOctaves + tracking)));
}

export function zynFilterSeries(get: Get, fs: number, note: number): Array<Array<[number, number]>> {
  const type = Math.round(num(get('filterType')));
  const q = zynResonanceQ(num(get('filterResonance'), 0.2));
  const peak = zynFilterPeakOctaves(num(get('filterEnvAmount')));
  return [0, peak].map((oct) => {
    const c = zynNoteCutoffHz(get, note, oct);
    return logGrid().filter((hz) => hz < fs / 2).map((hz): [number, number] => [hz, zynFilterDb(type, c, q, hz, fs)]);
  });
}

// ---- oscillator ------------------------------------------------------------------------------------------------

export const ZYN_BASE_FUNCTIONS = [
  'Sine', 'Triangle', 'Pulse', 'Saw', 'Power', 'Gauss', 'Diode', 'Absolute Sine', 'Pulse Sine', 'Stretch Sine', 'Chirp',
  'Absolute Stretch Sine', 'Chebyshev', 'Square', 'Spike', 'Circle',
] as const;

const fmod1 = (x: number): number => x - Math.floor(x);

/** OscilGen base functions (index 0 is the -sin special case, 1..15 are getBaseFunction's table), parameter a = 0.5. */
export function zynBaseFunction(index: number, x0: number, a = 0.5): number {
  const i = Math.round(index);
  let x = x0;
  const clampA = (lo: number, hi: number): number => Math.min(hi, Math.max(lo, a));
  switch (i) {
    case 0: return -Math.sin(2 * Math.PI * x);
    case 1: { x = fmod1(x + 0.25); const aa = Math.max(0.00001, 1 - a); x = x < 0.5 ? x * 4 - 1 : (1 - x) * 4 - 1; x /= -aa; return Math.min(1, Math.max(-1, x)); }
    case 2: return fmod1(x) < a ? -1 : 1;
    case 3: { const aa = clampA(0.00001, 0.99999); x = fmod1(x); return x < aa ? (x / aa) * 2 - 1 : ((1 - x) / (1 - aa)) * 2 - 1; }
    case 4: { const aa = clampA(0.00001, 0.99999); return Math.pow(fmod1(x), Math.exp((aa - 0.5) * 10)) * 2 - 1; }
    case 5: { x = fmod1(x) * 2 - 1; const aa = Math.max(0.00001, a); return Math.exp(-x * x * (Math.exp(aa * 8) + 5)) * 2 - 1; }
    case 6: { const aa = clampA(0.00001, 0.99999) * 2 - 1; let v = Math.cos((x + 0.5) * 2 * Math.PI) - aa; if (v < 0) v = 0; return (v / (1 - aa)) * 2 - 1; }
    case 7: { x = fmod1(x); const aa = clampA(0.00001, 0.99999); return Math.sin(Math.pow(x, Math.exp((aa - 0.5) * 5)) * Math.PI) * 2 - 1; }
    case 8: { const aa = Math.max(0.00001, a); let v = (fmod1(x) - 0.5) * Math.exp((aa - 0.5) * Math.log(128)); v = Math.min(0.5, Math.max(-0.5, v)); return Math.sin(v * Math.PI * 2); }
    case 9: { x = fmod1(x + 0.5) * 2 - 1; let aa = (a - 0.5) * 4; if (aa > 0) aa *= 2; aa = Math.pow(3, aa); let b = Math.pow(Math.abs(x), aa); if (x < 0) b = -b; return -Math.sin(b * Math.PI); }
    case 10: { x = fmod1(x) * 2 * Math.PI; let aa = (a - 0.5) * 4; if (aa < 0) aa *= 2; aa = Math.pow(3, aa); return Math.sin(x / 2) * Math.sin(aa * x * x); }
    case 11: { x = fmod1(x + 0.5) * 2 - 1; const aa = Math.pow(3, (a - 0.5) * 9); let b = Math.pow(Math.abs(x), aa); if (x < 0) b = -b; return -Math.pow(Math.sin(b * Math.PI), 2); }
    case 12: { const aa = a * a * a * 30 + 1; return Math.cos(Math.acos(x * 2 - 1) * aa); }
    case 13: { const aa = a * a * a * a * 160 + 0.001; return -Math.atan(Math.sin(x * 2 * Math.PI) * aa); }
    case 14: {
      const b = a * 0.66666;
      if (x < 0.5) { if (x < 0.5 - b / 2) return 0; const u = (x + b / 2 - 0.5) * (2 / b); return u * (2 / b); }
      if (x > 0.5 + b / 2) return 0;
      const u = (x - 0.5) * (2 / b);
      return (1 - u) * (2 / b);
    }
    default: {
      const b = 2 - a * 2;
      x *= 4;
      if (x < 2) { x -= 1; return x < -b || x > b ? 0 : Math.sqrt(1 - (x * x) / (b * b)); }
      x -= 3;
      return x < -b || x > b ? 0 : -Math.sqrt(1 - (x * x) / (b * b));
    }
  }
}

/** One cycle of a voice's oscillator, scaled to +-1 (the engine normalises the waveform). */
export function zynOscillatorPoints(index: number, count = 360): Array<[number, number]> {
  const raw = Array.from({ length: count }, (_, i) => zynBaseFunction(index, i / (count - 1)));
  const peak = Math.max(1e-6, ...raw.map(Math.abs));
  return raw.map((y, i) => [i / (count - 1), y / peak]);
}

// ---- curve descriptors -------------------------------------------------------------------------------------------

const pct = (v: number): string => `${Math.round(v * 100)}%`;

export interface ZynCurves { amp: CurveDescriptor; filterEnv: CurveDescriptor; filter: CurveDescriptor; voice: (n: 1 | 2 | 3 | 4) => CurveDescriptor }

export function zynCurves(sampleRate: () => number = audioSampleRate): ZynCurves {
  const fs = (): number => sampleRate();
  const ampKnobs = (get: Get): ZynEnvKnobs => ({ attack: num(get('ampAttack'), 0.01), decay: num(get('ampDecay'), 0.1), sustain: num(get('ampSustain'), 1), release: num(get('ampRelease'), 0.2) });
  const filtKnobs = (get: Get): ZynFilterEnvKnobs => ({ attack: num(get('filterAttack'), 0.01), decay: num(get('filterDecay'), 0.3), sustain: num(get('filterSustain'), 0.7), release: num(get('filterRelease'), 0.3), amount: num(get('filterEnvAmount')) });
  const amp = (get: Get): StagedEnvelope => zynAmpEnvelope(ampKnobs(get), ZYN_REFERENCE_NOTE, fs());
  const fenv = (get: Get): StagedEnvelope => zynFilterEnvelope(filtKnobs(get), fs());
  return {
    amp: {
      label: 'Amplitude Envelope (middle C)', xUnit: 's', yDomain: [0, 1], xDomain: (get) => envelopeDomain(amp(get)),
      series: (get) => [{ points: amp(get).points, fill: true }],
      readout: (get) => {
        const e = amp(get);
        const k = ampKnobs(get);
        return `A ${fmtMs(e.attackEnd * 1000)}  D ${fmtMs((e.decayEnd - e.attackEnd) * 1000)}  S ${Math.round((1 - Math.round(to127(k.sustain)) / 127) * -40)} dB  R ${fmtMs((e.total - e.releaseAt) * 1000)}`;
      },
      marker: voiceMarker(ZYN_SYNTH_TYPE, (v, get) => envelopeMarkerX(amp(get), v.stage, v.level)),
    },
    filterEnv: {
      label: 'Filter Envelope', xUnit: 's', yDomain: [0, 1], xDomain: (get) => envelopeDomain(fenv(get)),
      series: (get) => [{ points: fenv(get).points, fill: true }],
      readout: (get) => {
        const e = fenv(get);
        return `A ${fmtMs(e.attackEnd * 1000)}  D ${fmtMs((e.decayEnd - e.attackEnd) * 1000)}  peak +${zynFilterPeakOctaves(num(get('filterEnvAmount'))).toFixed(1)} octaves  sustain ${pct(num(get('filterSustain'), 0.7))} of the peak`;
      },
      marker: voiceMarker(ZYN_SYNTH_TYPE, (v, get) => envelopeMarkerX(fenv(get), v.filterStage, v.filterLevel)),
    },
    filter: {
      label: 'Filter Response (middle C)', xScale: 'log', xDomain: [20, 20000], yDomain: [FILTER_DB_MIN, FILTER_DB_MAX], xUnit: 'Hz', yUnit: 'dB',
      series: (get) => {
        const [rest, open] = zynFilterSeries(get, fs(), ZYN_REFERENCE_NOTE);
        return [{ points: rest, color: 'rgba(255,255,255,0.35)' }, { points: open, fill: true }];
      },
      readout: (get) => {
        const type = Math.round(num(get('filterType')));
        const lo = zynNoteCutoffHz(get, ZYN_REFERENCE_NOTE, 0);
        const hi = zynNoteCutoffHz(get, ZYN_REFERENCE_NOTE, zynFilterPeakOctaves(num(get('filterEnvAmount'))));
        return `${ZYN_FILTER_TYPES[type] ?? ''}  ${fmtHz(lo)}${hi > lo * 1.01 ? ` to ${fmtHz(hi)}` : ''}  Q ${zynResonanceQ(num(get('filterResonance'), 0.2)).toFixed(1)}`;
      },
      marker: voiceMarker(ZYN_SYNTH_TYPE, (v) => (v.cutoff > 0 ? v.cutoff : null)),
    },
    voice: (n) => ({
      label: `Voice ${n} Waveform`, xDomain: [0, 1], yDomain: [-1, 1],
      series: (get) => [{ points: zynOscillatorPoints(num(get(`addVoice${n}Wave`))) }],
      readout: (get) => `${ZYN_BASE_FUNCTIONS[Math.round(num(get(`addVoice${n}Wave`)))] ?? ''}  volume ${pct(num(get(`addVoice${n}Volume`), n === 1 ? 1 : 0))}`,
    }),
  };
}

export { pct as zynPercent };
