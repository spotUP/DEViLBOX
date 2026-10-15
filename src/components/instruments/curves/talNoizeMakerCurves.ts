/**
 * talNoizeMakerCurves.ts - what the TAL-NoiseMaker engine does with the editor's knobs (tal-noisemaker-wasm/src/Engine:
 * Adsr.h, SynthVoice.h, FilterHandler.h, FilterLp24db.h and siblings, Lfo.cpp, LfoHandler*.h, Osc*.h, AudioUtils.h), as
 * curves. Layout values are the engine's own normalised 0..1 parameters.
 *
 * Laws, verified against the code:
 *  - Choice parameters (filter type, waveforms, LFO and envelope destinations) are NORMALISED: item k of n sits at
 *    (k - 1) / (n - 1) and the engine reads floor(value * (n - 1) + 1.5) (AudioUtils::calcComboBoxValue). Filter type has
 *    12 items, OSC 1 waveform 3 (Saw, Pulse, Noise), OSC 2 waveform 5, LFO destinations 8, free AD destinations 6.
 *  - Envelopes (Adsr::tick) run per sample with k = 0.004 * 44100 / fs: attack moves the level toward 1.04 + 0.5 * attack
 *    by a fraction a * k * 200 per sample (a = 0.0003 k + k (1 - attack / 2)^24 * 7); decay subtracts d * (level + k)
 *    (d with exponent 23) until the sustain level; release subtracts r * (level + k) * (1 - declick) (r = 8 * (0.0003 k + 2 k
 *    (1 - release / 2)^22)) with the declick ramp falling from 1 to 0 over 1 / k samples. The filter envelope reads 1 for the
 *    whole attack when its attack knob is 0 (getValueFasterAttack) and its sustain knob goes through exp(20) scaling.
 *  - Filter cutoff (SynthVoice::processFilter): ((base + keyfollow^2 (note - 72) / 512 + velocity terms + LFO + contour * envelope
 *    + free AD)^2) clamped to 0..1, base = (8^cutoff - 1) / 7, contour = (2 (knob - 0.5))^3. The curves assume full velocity.
 *  - Filters (FilterHandler): 4x oversampled Huovilainen ladders. Types 1-7 share one structure: four one-pole stages
 *    P = k / (1 - (1 - k) z^-1) at 4 fs with k = 1 - exp(-2 pi kfcr kfc) (5-term series), a one-sample feedback of
 *    4.2 * resonance * kacr around stage 4, taps combined per type. Types 8-10 (state variable) are not drawn, type 11 is the
 *    TPT Moog ladder, type 12 bypasses the filter. The ladder's tanh clip, the 0.99 factor on its feedback and the
 *    oversampling filters are not modelled (the tests give the measured error).
 *  - LFOs (Lfo::tick): table index advances 256 * Hz / fs per sample and wraps at 255, so the true rate is Hz * 256 / 255;
 *    Hz = (exp(0.2 + 3 rate ln 20) - 1) / 19; the output goes through a one-pole smoother y = (19 y + x) / 20.
 *
 * Not modelled (named): Random Step and Noise LFO shapes (random), Noise oscillator, the state variable filters, the
 * envelope editor, the tempo-synced LFO rates, ring modulation and FM in the oscillator curves, the pitch wheel.
 */
import type { CurveDescriptor } from '@/types/synthPanel';
import { VOICE_STAGES, type WasmVoice } from '@/engine/voiceStatus/wasmVoiceStatus';
import {
  audioSampleRate, envelopeDomain, envelopeMarkerX, num, voiceMarker, logGrid, FILTER_DB_MAX, FILTER_DB_MIN, type StagedEnvelope,
} from './wasmSubtractiveModels';
import { fmtHz, fmtMs } from './commonCurveModels';

export const TAL_SYNTH_TYPE = 'TalNoizeMaker';
type Get = (key: string) => number;

// ---- choice parameters -------------------------------------------------------------------------------------

export const TAL_FILTER_TYPES = [
  'Low Pass 24', 'Low Pass 18', 'Low Pass 12', 'Low Pass 6', 'High Pass', 'Band Pass', 'Notch', 'State Variable Low Pass 12',
  'State Variable High Pass 12', 'State Variable Band Pass 12', 'Moog Ladder 24', 'Bypass',
] as const;
export const TAL_OSC1_WAVES = ['Saw', 'Pulse', 'Noise'] as const;
export const TAL_OSC2_WAVES = ['Saw', 'Pulse', 'Triangle', 'Sine', 'Noise'] as const;
export const TAL_LFO_WAVES = ['Sine', 'Triangle', 'Saw', 'Square', 'Random Step', 'Noise'] as const;
export const TAL_LFO1_DESTINATIONS = ['Off', 'Filter', 'Osc 1 Pitch', 'Osc 2 Pitch', 'Pulse Width', 'FM', 'LFO 2 Rate', 'Osc 1+2 Pitch'] as const;
export const TAL_LFO2_DESTINATIONS = ['Off', 'Filter', 'Osc 1 Pitch', 'Osc 2 Pitch', 'Pan', 'Volume', 'LFO 1 Rate', 'Osc 1+2 Pitch'] as const;
export const TAL_FREE_AD_DESTINATIONS = ['Off', 'Filter', 'Osc 1 Pitch', 'Osc 2 Pitch', 'Pulse Width', 'FM'] as const;

/** AudioUtils::calcComboBoxValue: the 1-based item the engine reads from a normalised value. */
export const talComboItem = (value: number, items: number): number => Math.floor(num(value) * (items - 1) + 1.5);
/** The normalised value of 1-based item `item` of `items` (4 decimals: the engine's floor() has a half-step margin). */
export const talComboValue = (item: number, items: number): number => Math.round(((item - 1) / (items - 1)) * 10000) / 10000;
/** Options for a layout select: the value strings are the normalised numbers the engine expects. */
export const talComboOptions = (labels: readonly string[]): Array<{ value: string; label: string }> =>
  labels.map((label, i) => ({ value: String(talComboValue(i + 1, labels.length)), label }));

// ---- envelopes ---------------------------------------------------------------------------------------------

/** AudioUtils::getLogScaledVolume(v, 1): the filter sustain knob's scaling (setFilterSustain). */
export const talLogScaledVolume = (v: number): number => (Math.exp(v * Math.log(20)) - 1) / 19;

export interface TalAdsrKnobs { attack: number; decay: number; sustain: number; release: number }

const srf = (fs: number): number => (0.004 * 44100) / fs;
const attackRate = (v: number, k: number): number => 0.0003 * k + k * Math.pow(1 - v * 0.5, 24) * 7;
const decayRate = (v: number, k: number): number => 0.0003 * k + k * Math.pow(1 - v * 0.5, 23) * 7;
const releaseRate = (v: number, k: number): number => (0.0003 * k + k * Math.pow(1 - v * 0.5, 22) * 2) * 8;

export interface TalAdsrRun { env: StagedEnvelope; levelAt: (seconds: number) => number }

/**
 * Run Adsr::tick sample by sample: the key goes down at 0 and is released at `releaseAt` seconds (or once the decay
 * has settled plus `hold`). `fasterAttack` is the filter envelope's reading (1 for the whole attack when the attack knob is 0).
 */
export function talAdsr(k: TalAdsrKnobs, fs: number, o: { fasterAttack?: boolean; hold?: number; capSeconds?: number } = {}): TalAdsrRun {
  const kk = srf(fs);
  const attack = attackRate(k.attack, kk);
  const decay = decayRate(k.decay, kk);
  const release = releaseRate(k.release, kk);
  const sustain = Math.min(1, Math.max(0, k.sustain));
  const cap = Math.round((o.capSeconds ?? 12) * fs);
  const every = Math.max(1, Math.round(fs * 0.004));
  const points: Array<[number, number]> = [[0, 0]];
  let state = 0;
  let value = 0;
  let declick = 1;
  let n = 0;
  let attackEnd = -1;
  let decayEnd = -1;
  let releaseAt = -1;
  let held = 0;
  const hold = Math.round((o.hold ?? 0) * fs);
  const reported = (): number => (o.fasterAttack && state === 0 && k.attack === 0 ? 1 : value);
  while (n < cap) {
    n++;
    const noteOn = releaseAt < 0;
    if (!noteOn && value > 0 && state !== 3) { state = 3; declick = 1; }
    if (!noteOn && value <= 0) state = 4;
    switch (state) {
      case 0:
        value += attack * kk * 200 * (1.04 + k.attack * 0.5 - value);
        if (value > 1) { value = 1; state = 1; attackEnd = n; }
        break;
      case 1:
        value -= decay * (value + kk);
        if (value <= sustain) { value = sustain; state = 2; decayEnd = n; }
        break;
      case 2:
        value = sustain;
        held++;
        break;
      case 3:
        declick = Math.max(0, declick - kk);
        value -= release * ((value + kk) * (1 - declick));
        if (value < 0) { value = 0; state = 4; }
        break;
      default:
        break;
    }
    if (n % every === 0 || state === 4) points.push([n / fs, reported()]);
    if (state === 4) break;
    if (releaseAt < 0 && ((state === 2 && held >= hold) || n >= cap - 1)) releaseAt = n;
  }
  const total = n / fs;
  const a = attackEnd < 0 ? total : attackEnd / fs;
  const d = decayEnd < 0 ? a : decayEnd / fs;
  const env: StagedEnvelope = { points, attackEnd: a, decayEnd: Math.max(a, d), releaseAt: releaseAt < 0 ? total : releaseAt / fs, total };
  const levelAt = (t: number): number => {
    for (let i = 1; i < points.length; i++) {
      if (points[i][0] >= t) { const [x0, y0] = points[i - 1], [x1, y1] = points[i]; return x1 === x0 ? y1 : y0 + ((y1 - y0) * (t - x0)) / (x1 - x0); }
    }
    return points[points.length - 1][1];
  };
  return { env, levelAt };
}

const ampKnobs = (get: Get): TalAdsrKnobs => ({ attack: num(get('ampAttack')), decay: num(get('ampDecay')), sustain: num(get('ampSustain'), 1), release: num(get('ampRelease')) });
const filterKnobs = (get: Get): TalAdsrKnobs => ({ attack: num(get('filterAttack')), decay: num(get('filterDecay')), sustain: talLogScaledVolume(num(get('filterSustain'), 1)), release: num(get('filterRelease')) });
/** The free AD envelope: sustain 0, release 1 fixed in SynthVoice::initialize. */
const freeKnobs = (get: Get): TalAdsrKnobs => ({ attack: num(get('freeAdAttack')), decay: num(get('freeAdDecay')), sustain: 0, release: 1 });

// ---- filter ------------------------------------------------------------------------------------------------

/** The cutoff the filter receives for a voice (SynthVoice::processFilter), full velocity, no LFO, no pitch wheel. */
export function talFinalCutoff(get: Get, o: { note: number; envelope: number; free?: number }): number {
  const base = (Math.exp(num(get('cutoff'), 1) * Math.log(8)) - 1) / 7;
  const keyfollow = num(get('keyFollow')) ** 2;
  const log8 = (v: number): number => (Math.exp(v * Math.log(8)) - 1) / 7;
  const velocityCutoff = log8(num(get('velocityCutoff'), 0.5));
  const contour = (2 * (num(get('filterContour'), 0.5) - 0.5)) ** 3 + log8(num(get('velocityContour'), 0.5));
  let c = base + velocityCutoff + (keyfollow * (o.note - 72)) / 512 + contour * o.envelope + (o.free ?? 0);
  c *= c;
  return Math.min(1, Math.max(0, c));
}

type C = [number, number];
const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cs = (a: C, k: number): C => [a[0] * k, a[1] * k];
const cdiv = (a: C, b: C): C => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const ONE: C = [1, 0];

interface LadderSpec { kfcr0: number; kacr: (c: number) => number; preExp: number | null; preGain?: number; taps: number[]; post: ((c: number, r: number) => number) | null }
const postOf = (cut: number) => (c: number, r: number): number => 1 + r * 1.1 + c * r * cut;
/** Per-type constants of FilterLp24db.h, FilterLp18db.h, ..., FilterN24db.h. `taps` are the polynomial in P applied to W (index = power of P). */
const LADDERS: Record<number, LadderSpec> = {
  1: { kfcr0: 1.4, kacr: (c) => 1.05 + 1.4 * c, preExp: 2, taps: [0, 0, 0, 0, 1], post: postOf(2.5) },
  2: { kfcr0: 0.9988, kacr: (c) => 1 + c, preExp: 4, taps: [0, 0, 0, 1], post: postOf(1.5) },
  3: { kfcr0: 0.9988, kacr: (c) => 1 + 0.9 * c, preExp: 2, taps: [0, 0, 1], post: postOf(1.5) },
  4: { kfcr0: 0.9988, kacr: (c) => 1 + 0.8 * c, preExp: 2, taps: [0, 1], post: postOf(1.5) },
  5: { kfcr0: 0.9988, kacr: (c) => 1 + c, preExp: null, taps: [1, -2, 1], post: null },
  6: { kfcr0: 0.9988, kacr: (c) => 1 + c, preExp: null, preGain: 4, taps: [0, 0, 2, -4, 2], post: postOf(1.0) },
  7: { kfcr0: 0.9988, kacr: (c) => 1 + c, preExp: 2, taps: [1, -2, 4, -4], post: postOf(1.0) },
};

/** The one-pole coefficient the ladder uses at cutoff `c` (kfc, kfcr and the 5-term exponential series). */
export function talLadderK(c: number, kfcr0: number, fs: number): number {
  const srf4 = Math.min(1, 44100 / (4 * fs));
  const kfc = c * srf4 * 0.5;
  const kfcr = 1.873 * kfc ** 3 + 0.4955 * kfc ** 2 - 0.649 * kfc + kfcr0;
  const t = -2 * Math.PI * kfcr * kfc;
  return 1 - (1 + t + (t * t) / 2 + (t * t * t) / 6 + (t * t * t * t) / 24 + (t * t * t * t * t) / 120);
}

function ladderResponse(type: number, c: number, r: number, hz: number, fs: number): C {
  const spec = LADDERS[type];
  const k = talLadderK(c, spec.kfcr0, fs);
  const w = (2 * Math.PI * hz) / (4 * fs);
  const zi: C = [Math.cos(w), -Math.sin(w)];
  const P = cdiv([k, 0], cadd(ONE, cs(zi, -(1 - k))));
  const powers: C[] = [ONE];
  for (let i = 1; i <= 4; i++) powers.push(cmul(powers[i - 1], P));
  const g = 4.2 * r * spec.kacr(c);
  const W = cdiv(ONE, cadd(ONE, cs(cmul(zi, powers[4]), g)));
  let tap: C = [0, 0];
  spec.taps.forEach((coef, i) => { if (coef !== 0) tap = cadd(tap, cs(powers[i], coef)); });
  let out = cmul(tap, W);
  if (spec.preExp !== null) out = cs(out, 1 + (1 - (1 - r) ** spec.preExp));
  if (spec.preGain !== undefined) out = cs(out, spec.preGain);
  if (spec.post) out = cs(out, spec.post(c, r));
  return out;
}

/** FilterMoog24 (type 11): TPT ladder at fs, k = 4 r (+ drive below cutoff 0.25), input scaled by 1 + 2 r and the handler's 3x. */
function moogResponse(c: number, r: number, hz: number, fs: number): C {
  const srfM = Math.min(1, 44100 / fs);
  const freq = srfM * c * fs * 0.5 * 0.999;
  const twcd = 2 * Math.tan(Math.PI * freq / fs);
  const b0 = twcd / (twcd + 2);
  const a1 = (twcd - 2) / (twcd + 2);
  let kk = r * 4;
  if (c <= 0.25) kk += ((0.25 - c) * 4) ** 2;
  const w = (2 * Math.PI * hz) / fs;
  const zi: C = [Math.cos(w), -Math.sin(w)];
  const G = cdiv(cs(cadd(ONE, zi), b0), cadd(ONE, cs(zi, a1)));
  const G2 = cmul(G, G);
  const G4 = cmul(G2, G2);
  const H = cdiv(G4, cadd(ONE, cs(G4, kk)));
  return cs(H, 0.5 * (1 + r * 2) * 3);
}

/** |H| in dB at `hz`, or null for the state variable types (not modelled). `drive` is the 0..1 filter drive knob. */
export function talFilterDb(type: number, c: number, r: number, hz: number, fs: number, drive = 0): number | null {
  if (type === 12) return 0;
  if (type >= 8 && type <= 10) return null;
  const h = type === 11 ? moogResponse(c, r, hz, fs) : ladderResponse(type, c, r, hz, fs);
  const D = drive * 10;
  const mag = (Math.hypot(h[0], h[1]) * (D + 1)) / (D * 0.5 + 1);
  return mag <= 1e-12 ? FILTER_DB_MIN : Math.max(FILTER_DB_MIN, 20 * Math.log10(mag));
}

export const talFilterTypeOf = (get: Get): number => talComboItem(num(get('filterType'), 0), 12);

export function talFilterSeries(get: Get, fs: number, note: number): Array<Array<[number, number]>> {
  const type = talFilterTypeOf(get);
  const res = num(get('resonance'));
  const drive = num(get('filterDrive'));
  const sustain = talLogScaledVolume(num(get('filterSustain'), 1));
  return [0, sustain, 1].map((env) => {
    const c = talFinalCutoff(get, { note, envelope: env });
    return logGrid().filter((hz) => hz < fs / 2).map((hz): [number, number] => [hz, talFilterDb(type, c, res, hz, fs, drive) ?? 0]);
  });
}

/** Where the filter sits in Hz for a cutoff value: used by the live marker and the readout. */
export function talCutoffHz(type: number, c: number, fs: number): number {
  if (type === 11) return Math.min(1, 44100 / fs) * c * fs * 0.5;
  const spec = LADDERS[type] ?? LADDERS[1];
  const k = talLadderK(c, spec.kfcr0, fs);
  return (-Math.log(Math.max(1e-9, 1 - k)) * 4 * fs) / (2 * Math.PI);
}

// ---- oscillators ---------------------------------------------------------------------------------------------

/** One cycle of an oscillator as it starts (Osc*.h): Saw rises -0.5..0.5, Pulse is high for 1 - pw, Triangle and Sine are 0..1 shapes. */
export function talWaveValue(wave: 'Saw' | 'Pulse' | 'Triangle' | 'Sine' | 'Noise', phase: number, pw = 0.5): number {
  const f = phase - Math.floor(phase);
  switch (wave) {
    case 'Saw': return f - 0.5;
    case 'Pulse': return f >= pw ? 0.5 : -0.5;
    case 'Triangle': return f < 0.5 ? 2 * f - 0.5 : 1.5 - 2 * f;
    case 'Sine': return -0.5 * Math.cos(f * 2 * Math.PI) + 0.5;
    default: return 0;
  }
}

export function talOscillatorPoints(wave: string, pw: number, count = 360): Array<[number, number]> {
  const w = wave as 'Saw';
  const pts = Array.from({ length: count }, (_, i): [number, number] => {
    const x = i / (count - 1);
    return [x, talWaveValue(w, x, pw) * 2];
  });
  return pts;
}

// ---- LFOs ----------------------------------------------------------------------------------------------------

/** AudioUtils::getLogScaledRate. */
export const talLfoHz = (rate: number): number => (Math.exp(0.2 + rate * 3 * Math.log(20)) - 1) / 19;
/** The oscillator wraps at 255 of its 256 table steps, so it runs 256 / 255 fast. */
export const talLfoTrueHz = (rate: number): number => (talLfoHz(rate) * 256) / 255;
/** LfoHandler::setWaveform: int(value * 5.000001). */
export const talLfoWaveIndex = (value: number): number => Math.floor(num(value) * 5.000001);
/** AudioUtils::getLogScaledValueCentered: -1..1. */
export const talCentered = (v: number): number => (2 * (v - 0.5)) ** 3;

function lfoTable(index: number, phase256: number): number {
  const p = phase256 % 256;
  const i = Math.floor(p);
  const f = p - i;
  const t = (n: number): number => {
    const q = n % 256;
    switch (index) {
      case 0: return Math.sin(2 * Math.PI * (q / 256));
      case 1: return q < 64 ? q / 64 : q < 128 ? (128 - q) / 64 : q < 192 ? -(q - 128) / 64 : -(256 - q) / 64;
      case 2: return n >= 256 ? -1 : 2 * (q / 255) - 1;
      case 3: return q < 128 ? 1 : -1;
      default: return 0;
    }
  };
  return t(i) * (1 - f) + t(i + 1) * f;
}

/** One cycle of an LFO (waveform index 0..3), through the engine's one-pole smoother at `fs` for the given rate. */
export function talLfoPoints(index: number, hz: number, fs: number, amount = 1, count = 240): Array<[number, number]> {
  const inc = (256 * hz) / fs;
  const samplesPerCycle = 255 / inc;
  if (index > 3) return [[0, 0], [1, 0]];
  const out: Array<[number, number]> = [];
  if (samplesPerCycle > 6000 || !Number.isFinite(samplesPerCycle)) {
    for (let i = 0; i < count; i++) { const x = i / (count - 1); out.push([x, lfoTable(index, x * 255) * amount]); }
    return out;
  }
  // simulate the smoother over a few cycles and keep the last
  let smooth = 0;
  const total = Math.ceil(samplesPerCycle * 4);
  const lastStart = total - Math.ceil(samplesPerCycle);
  let phase = 0;
  const recorded: number[] = [];
  for (let n = 0; n < total; n++) {
    if (phase > 255) phase -= 255;
    smooth = (smooth * 19 + lfoTable(index, phase)) * 0.05;
    phase += inc;
    if (n >= lastStart) recorded.push(smooth);
  }
  for (let i = 0; i < count; i++) {
    const at = (i / (count - 1)) * (recorded.length - 1);
    const i0 = Math.floor(at);
    const f = at - i0;
    out.push([i / (count - 1), (recorded[i0] * (1 - f) + recorded[Math.min(recorded.length - 1, i0 + 1)] * f) * amount]);
  }
  return out;
}

// ---- voice report --------------------------------------------------------------------------------------------

export const TAL_VOICE_STRIDE = 12;
export interface TalVoice { note: number; ampStage: WasmVoice['stage']; ampLevel: number; cutoff: number; filterLevel: number; filterStage: WasmVoice['stage']; lfo1Phase: number; lfo2Phase: number; freeLevel: number; freeStage: WasmVoice['stage'] }
export function talVoice(v: WasmVoice): TalVoice {
  const e = v.extra;
  return {
    note: v.note, ampStage: v.stage, ampLevel: v.level, cutoff: v.cutoff, filterLevel: v.filterLevel, filterStage: v.filterStage,
    lfo1Phase: v.lfoPhase, lfo2Phase: e[0] ?? 0, freeLevel: e[1] ?? 0, freeStage: VOICE_STAGES[Math.round(e[2] ?? 4)] ?? 'off',
  };
}

// ---- curve descriptors ------------------------------------------------------------------------------------------

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const REFERENCE_NOTE = 60;

export interface TalCurves {
  amp: CurveDescriptor; filterEnv: CurveDescriptor; freeEnv: CurveDescriptor; filter: CurveDescriptor;
  osc1: CurveDescriptor; osc2: CurveDescriptor; lfo1: CurveDescriptor; lfo2: CurveDescriptor;
}

export function talNoizeMakerCurves(sampleRate: () => number = audioSampleRate): TalCurves {
  const fs = (): number => sampleRate();
  const readout = (k: TalAdsrKnobs, run: TalAdsrRun): string =>
    `A ${fmtMs(run.env.attackEnd * 1000)}  D ${fmtMs((run.env.decayEnd - run.env.attackEnd) * 1000)}  S ${pct(k.sustain)}`;
  const envCurve = (label: string, knobs: (get: Get) => TalAdsrKnobs, fast: boolean, stage: (v: TalVoice) => [WasmVoice['stage'], number], note?: string): CurveDescriptor => {
    const run = (get: Get): TalAdsrRun => {
      const k = knobs(get);
      const probe = talAdsr(k, fs(), { fasterAttack: fast, hold: 0 });
      const hold = Math.max(0.05, 0.25 * probe.env.decayEnd);
      return talAdsr(k, fs(), { fasterAttack: fast, hold, capSeconds: 12 });
    };
    return {
      label, xUnit: 's', yDomain: [0, 1], xDomain: (get) => envelopeDomain(run(get).env),
      series: (get) => [{ points: run(get).env.points, fill: true }],
      readout: (get) => `${readout(knobs(get), run(get))}${note ?? ''}`,
      marker: voiceMarker(TAL_SYNTH_TYPE, (v, get) => { const [s, lvl] = stage(talVoice(v)); return envelopeMarkerX(run(get).env, s, lvl); }),
    };
  };
  const lfoCurve = (n: 1 | 2): CurveDescriptor => {
    const p = `lfo${n}`;
    const dests = n === 1 ? TAL_LFO1_DESTINATIONS : TAL_LFO2_DESTINATIONS;
    const hzOf = (get: Get): number => talLfoTrueHz(num(get(`${p}Rate`)));
    return {
      label: `LFO ${n} (one cycle)`, xDomain: [0, 1], yDomain: [-1, 1],
      series: (get) => [{ points: talLfoPoints(talLfoWaveIndex(num(get(`${p}Waveform`))), talLfoHz(num(get(`${p}Rate`))), fs(), talCentered(num(get(`${p}Amount`), 0.5))) }],
      readout: (get) => {
        const wave = talLfoWaveIndex(num(get(`${p}Waveform`)));
        const sync = num(get(`${p}Sync`)) > 0;
        const hz = hzOf(get);
        return `${TAL_LFO_WAVES[wave] ?? ''}  ${sync ? 'tempo synced' : hz >= 100 ? `${hz.toFixed(0)} Hz` : `${hz.toFixed(hz < 1 ? 3 : 1)} Hz`}  amount ${pct(talCentered(num(get(`${p}Amount`), 0.5)))}  to ${dests[talComboItem(num(get(`${p}Destination`)), 8) - 1] ?? ''}${wave >= 4 ? '  random, no fixed shape' : ''}`;
      },
      marker: voiceMarker(TAL_SYNTH_TYPE, (v) => { const t = talVoice(v); const ph = n === 1 ? t.lfo1Phase : t.lfo2Phase; return ((ph % 1) + 1) % 1; }),
    };
  };
  const osc = (n: 1 | 2): CurveDescriptor => {
    const names = n === 1 ? TAL_OSC1_WAVES : TAL_OSC2_WAVES;
    const nameOf = (get: Get): string => names[talComboItem(num(get(`osc${n}Waveform`)), names.length) - 1] ?? 'Saw';
    return {
      label: `Oscillator ${n} (one cycle)`, xDomain: [0, 1], yDomain: [-1, 1],
      series: (get) => [{ points: talOscillatorPoints(nameOf(get), n === 1 ? num(get('osc1PW'), 0.5) : 0.5) }],
      readout: (get) => `${nameOf(get)}${nameOf(get) === 'Pulse' && n === 1 ? `  width ${pct(num(get('osc1PW'), 0.5))}` : ''}${nameOf(get) === 'Noise' ? '  random, no fixed shape' : ''}`,
    };
  };
  return {
    amp: envCurve('Amplitude Envelope', ampKnobs, false, (v) => [v.ampStage, v.ampLevel]),
    filterEnv: envCurve('Filter Envelope', filterKnobs, true, (v) => [v.filterStage, v.filterLevel]),
    freeEnv: envCurve('Free AD Envelope', freeKnobs, true, (v) => [v.freeStage, v.freeLevel]),
    filter: {
      label: 'Filter Response (middle C, full velocity)', xScale: 'log', xDomain: [20, 20000], yDomain: [FILTER_DB_MIN, FILTER_DB_MAX], xUnit: 'Hz', yUnit: 'dB',
      series: (get) => {
        const [rest, sustain, open] = talFilterSeries(get, fs(), REFERENCE_NOTE);
        return [{ points: rest, color: 'rgba(255,255,255,0.25)' }, { points: sustain, color: 'rgba(255,255,255,0.45)' }, { points: open, fill: true }];
      },
      readout: (get) => {
        const type = talFilterTypeOf(get);
        const lo = talFinalCutoff(get, { note: REFERENCE_NOTE, envelope: 0 });
        const hi = talFinalCutoff(get, { note: REFERENCE_NOTE, envelope: 1 });
        const name = TAL_FILTER_TYPES[type - 1] ?? '';
        if (type === 12) return `${name}  the filter is off`;
        if (type >= 8 && type <= 10) return `${name}  response not drawn`;
        return `${name}  ${fmtHz(talCutoffHz(type, lo, fs()))} to ${fmtHz(talCutoffHz(type, hi, fs()))}`;
      },
      marker: voiceMarker(TAL_SYNTH_TYPE, (v, get) => {
        const t = talVoice(v);
        const type = talFilterTypeOf(get);
        return t.ampStage === 'off' || type >= 8 && type <= 10 || type === 12 ? null : talCutoffHz(type, t.cutoff, fs());
      }),
    },
    osc1: osc(1),
    osc2: osc(2),
    lfo1: lfoCurve(1),
    lfo2: lfoCurve(2),
  };
}
