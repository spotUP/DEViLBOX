/**
 * klysCurveModels.ts - pure model of what the klystrack engine does with an instrument's knobs, as plain point
 * arrays for the instrument editor's curves (no React, no DOM). Inputs are the raw instrument field values
 * (KlysInstrument members: adsr.a/d/s/r, cutoff, resonance, flttype, vibratoSpeed, ...). Every formula is the C
 * engine's own; the file:line of each is named at the function. The tests compare against numbers measured from the
 * real WASM worklet, not against these functions.
 *
 * Approximations (named, not hidden): integer truncation inside the per-sample filter update is not replayed; the
 * filter's +-32767 clip is not modelled (linear response); the wavetable, FM and POKEY LFSR oscillators are not
 * modelled (oscillatorCycle reports modelled:false).
 */

/** cyddefs.h */
export const CYD_BASE_FREQ = 22050;
export const ENVELOPE_SCALE = 2;
export const ENVELOPE_MAX = 0xff0000;
export const WAVE_AMP = 1 << 16;
export const ACC_LENGTH = 1 << 24; // 1 << (ACC_BITS - 1), ACC_BITS = 25
export const LUT_SIZE = 1024; // cyd.h:128
export const CUTOFF_MAX = 2047;
export const FILTER_FULL_SCALE = 2048;
/** Default tick rate (klystrack song_rate) of a song; the real value is the song's songRate. */
export const DEFAULT_TICK_HZ = 50;
const VIB_TAB_SIZE = 128; // music.c:43

/** music.c:76 sine_table (Sint8). */
const SINE_TABLE: readonly number[] = [
  0, 6, 12, 18, 24, 31, 37, 43, 48, 54, 60, 65, 71, 76, 81, 85,
  90, 94, 98, 102, 106, 109, 112, 115, 118, 120, 122, 124, 125, 126, 127, 127,
  127, 127, 127, 126, 125, 124, 122, 120, 118, 115, 112, 109, 106, 102, 98, 94,
  90, 85, 81, 76, 71, 65, 60, 54, 48, 43, 37, 31, 24, 18, 12, 6,
  0, -6, -12, -18, -24, -31, -37, -43, -48, -54, -60, -65, -71, -76, -81, -85,
  -90, -94, -98, -102, -106, -109, -112, -115, -118, -120, -122, -124, -125, -126, -127, -127,
  -128, -127, -127, -126, -125, -124, -122, -120, -118, -115, -112, -109, -106, -102, -98, -94,
  -90, -85, -81, -76, -71, -65, -60, -54, -48, -43, -37, -31, -24, -18, -12, -6,
];
/** music.c:47 rnd_table (Sint8). */
const RND_TABLE: readonly number[] = [
  110, -1, 88, -31, 64, -13, 29, -70, -113, 71, 99, -71, 74, 82, 52, -82,
  -58, 37, 20, -76, 46, -97, -69, 41, 31, -62, -5, 99, -2, -48, -89, 17,
  -19, 4, -27, -43, -20, 25, 112, -34, 78, 26, -56, -54, 72, -75, 22, 72,
  -119, 115, 56, -66, 25, 87, 93, 14, 82, 127, 79, -40, -100, 21, 17, 17,
  -116, -110, 61, -99, 105, 73, 116, 53, -9, 105, 91, 120, -73, 112, -10, 66,
  -10, -30, 99, -67, 60, 84, 110, 87, -27, -46, 114, 77, -27, -46, 75, -78,
  83, -110, 92, -9, 107, -64, 31, 77, -39, 115, 126, -7, 121, -2, 66, 116,
  -45, 91, 1, -96, -27, 17, 76, -82, 58, -7, 75, -35, 49, 3, -52, 40,
];

export interface CurvePoint { x: number; y: number }

// ---------------------------------------------------------------------------------------------------------
// (e) unit helpers
// ---------------------------------------------------------------------------------------------------------

/** Log-frequency axis position 0..1 of a frequency between lo and hi (default 20 Hz..20 kHz). */
export function hzToLogX(hz: number, lo = 20, hi = 20000): number {
  return Math.log(hz / lo) / Math.log(hi / lo);
}
export function logXToHz(x: number, lo = 20, hi = 20000): number {
  return lo * Math.pow(hi / lo, x);
}
export function linearToDb(gain: number, floorDb = -120): number {
  return gain <= 0 ? floorDb : Math.max(floorDb, 20 * Math.log10(gain));
}

/**
 * Envelope accumulator step per output sample for a stage slope (adsr.a/d/r, 0..63): the `envspd` macro, cyd.c:82.
 * Slope 0 is the fastest stage. Integer division as in C.
 */
export function envelopeStep(slope: number, sampleRate: number): number {
  const sr = Math.trunc(sampleRate);
  if (slope === 0) return Math.trunc(ENVELOPE_MAX * CYD_BASE_FREQ / sr);
  const per = Math.trunc(slope * slope * 256 / (ENVELOPE_SCALE * ENVELOPE_SCALE));
  return Math.trunc(Math.trunc(ENVELOPE_MAX / per) * CYD_BASE_FREQ / sr);
}
/**
 * The tick rate the engine really runs: the callback period is the integer sample count sampleRate / songRate
 * (cyd.c:1085), so 55 Hz at 48 kHz is 48000 / 872 = 55.05 Hz.
 */
export function engineTickHz(songRate: number, sampleRate: number): number {
  return sampleRate / Math.floor(sampleRate / songRate);
}
/** Ticks (the song clock) to seconds. */
export function ticksToSeconds(ticks: number, tickHz = DEFAULT_TICK_HZ): number { return ticks / tickHz; }
/** Seconds of one LFO cycle: the position advances `speed` per tick and the 128-entry table spans 256 positions (music.c:1399). */
export function lfoCycleSeconds(speed: number, tickHz = DEFAULT_TICK_HZ): number {
  return speed <= 0 ? Infinity : (2 * VIB_TAB_SIZE / speed) / tickHz;
}

// ---------------------------------------------------------------------------------------------------------
// (a) volume envelope
// ---------------------------------------------------------------------------------------------------------

/** cyd_env_output (cyd.c:566): attack is linear in the accumulator, decay and release go through the squared LUT (cyd.c:124). */
export function envelopeGain(envelope: number, attacking: boolean): number {
  if (attacking) return Math.trunc(envelope / 0x10000) / 256;
  const idx = Math.trunc(envelope / (65536 * 256 / LUT_SIZE)) & (LUT_SIZE - 1);
  const lut = Math.trunc(idx * Math.trunc(idx / 2) / ((LUT_SIZE * LUT_SIZE / 65536) / 2));
  return lut / 65536;
}

/** Output samples the accumulator needs to rise from 0 to the top at `step` (cyd.c:293: += until >= 0xff0000). */
function attackSamples(step: number): number { return Math.ceil(ENVELOPE_MAX / step); }
/** Output samples to fall from `from` to `to` at `step` (cyd.c:307 decay, cyd.c:322 release: subtract while above, then land). */
function fallSamples(from: number, to: number, step: number): number {
  const steps = from > to + step ? Math.ceil((from - to - step) / step) : 0;
  return steps + 1;
}

export interface AdsrStages {
  attackSeconds: number;
  decaySeconds: number;
  /** Release time from the sustain level. */
  releaseSeconds: number;
  /** Release time from a full-level note-off. */
  releaseFromFullSeconds: number;
  /** Linear gain the note holds at (0..1, relative to a full-scale oscillator). */
  sustainGain: number;
  /** Gain at the end of the attack (0.996: the accumulator stops at 0xff0000 of 2^24). */
  peakGain: number;
}
export interface AdsrEnvelope extends AdsrStages {
  /** x = seconds, y = linear gain. */
  points: CurvePoint[];
  /** Time of the note-off in the points. */
  releaseAtSeconds: number;
  totalSeconds: number;
}

/** cyd_cycle_adsr (cyd.c:283): stage durations. A sustain of 0 goes from decay straight to release. */
export function adsrStages(a: number, d: number, s: number, r: number, sampleRate: number): AdsrStages {
  const sus = s * (1 << 19);
  const rStep = envelopeStep(r, sampleRate);
  return {
    attackSeconds: attackSamples(envelopeStep(a, sampleRate)) / sampleRate,
    decaySeconds: fallSamples(ENVELOPE_MAX, sus, envelopeStep(d, sampleRate)) / sampleRate,
    releaseSeconds: (sus === 0 ? 0 : fallSamples(sus, 0, rStep)) / sampleRate,
    releaseFromFullSeconds: fallSamples(ENVELOPE_MAX, 0, rStep) / sampleRate,
    sustainGain: envelopeGain(sus, false),
    peakGain: envelopeGain(ENVELOPE_MAX, true),
  };
}

/**
 * The volume envelope over time for a note held `holdSeconds` after its decay, then released: one accumulator
 * update per output sample, gain from envelopeGain. `pointsPerStage` thins the output (stage ends are always points).
 */
export function adsrEnvelope(a: number, d: number, s: number, r: number, sampleRate: number, holdSeconds = 0.25, pointsPerStage = 48): AdsrEnvelope {
  const stages = adsrStages(a, d, s, r, sampleRate);
  const sus = s * (1 << 19);
  const points: CurvePoint[] = [];
  let n = 0;
  const stage = (count: number, from: number, step: number, dir: 1 | -1, to: number, attacking: boolean): void => {
    const every = Math.max(1, Math.floor(count / pointsPerStage));
    for (let i = 0; i < count; i++, n++) {
      const env = i === count - 1 ? to : from + dir * step * i;
      if (i % every === 0 || i === count - 1) points.push({ x: n / sampleRate, y: envelopeGain(env, attacking) });
    }
  };
  const aStep = envelopeStep(a, sampleRate), dStep = envelopeStep(d, sampleRate), rStep = envelopeStep(r, sampleRate);
  stage(attackSamples(aStep), 0, aStep, 1, ENVELOPE_MAX, true);
  stage(fallSamples(ENVELOPE_MAX, sus, dStep), ENVELOPE_MAX, dStep, -1, sus, false);
  if (sus > 0) {
    n += Math.round(holdSeconds * sampleRate);
    points.push({ x: n / sampleRate, y: envelopeGain(sus, false) });
  }
  const releaseAt = n / sampleRate;
  if (sus > 0) stage(fallSamples(sus, 0, rStep), sus, rStep, -1, 0, false);
  return { ...stages, points, releaseAtSeconds: releaseAt, totalSeconds: n / sampleRate };
}

// ---------------------------------------------------------------------------------------------------------
// (b) filter
// ---------------------------------------------------------------------------------------------------------

/** cyd_set_filter_coeffs resonance table (cyd.c:1378). */
export const FILTER_RESONANCE_TABLE = [10, 512, 1300, 1950] as const;
/** Filter type order of KLYS_FILTER_TYPES / cyd.h FLT_LP, FLT_HP, FLT_BP. */
export type KlysFilterKind = 0 | 1 | 2;

export interface FilterCoeffs { p: number; f: number; q: number }

/** cydflt_set_coeff (cydflt.c:31), integer arithmetic as in C. */
export function filterCoeffs(cutoff: number, resonance: number): FilterCoeffs {
  const c = Math.max(0, Math.min(CUTOFF_MAX, Math.trunc(cutoff)));
  const q = 2048 - c;
  const p = c + Math.trunc(Math.trunc(Math.trunc(1638 * c / 2048) * q) / 2048);
  return { p, f: p + p - 2048, q: FILTER_RESONANCE_TABLE[resonance & 3] };
}

interface Cx { re: number; im: number }
const cmul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cdiv = (a: Cx, b: Cx): Cx => {
  const m = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / m, im: (a.im * b.re - a.re * b.im) / m };
};

/**
 * Linear gain of the cyd filter at `hz`: the four bilinear one-pole stages b1..b4 with the feedback of the previous
 * output (cydflt_cycle, cydflt.c:39). With w = z^-1, H1 = P (1+w) / (1 + F w), H = H1^4 and
 * LP = H / (1+Q w H), HP = (1-H) / (1+Q w H), BP = 3 (H1^3 - H) / (1+Q w H); P = p/2048, F = f/2048, Q = q/2048
 * (outputs: cyd.c:667 cydflt_output_lp/hp/bp).
 */
export function filterGain(cutoff: number, resonance: number, type: KlysFilterKind, hz: number, sampleRate: number): number {
  const { p, f, q } = filterCoeffs(cutoff, resonance);
  const P = p / FILTER_FULL_SCALE, F = f / FILTER_FULL_SCALE, Q = q / FILTER_FULL_SCALE;
  const om = 2 * Math.PI * hz / sampleRate;
  const w: Cx = { re: Math.cos(om), im: -Math.sin(om) };
  const h1 = cdiv({ re: P * (1 + w.re), im: P * w.im }, { re: 1 + F * w.re, im: F * w.im });
  const h2 = cmul(h1, h1), h3 = cmul(h2, h1), h4 = cmul(h3, h1);
  const qw = cmul({ re: Q * w.re, im: Q * w.im }, h4);
  const den: Cx = { re: 1 + qw.re, im: qw.im };
  let num: Cx;
  if (type === 1) num = { re: 1 - h4.re, im: -h4.im };
  else if (type === 2) num = { re: 3 * (h3.re - h4.re), im: 3 * (h3.im - h4.im) };
  else num = h4;
  const r = cdiv(num, den);
  const g = Math.hypot(r.re, r.im);
  return Number.isFinite(g) ? g : 0;
}

/** Magnitude in dB over a log frequency axis (default 20 Hz..20 kHz, capped at Nyquist), nPoints points; x = Hz. */
export function filterResponse(cutoff: number, resonance: number, type: KlysFilterKind, sampleRate: number, nPoints = 128, loHz = 20, hiHz = 20000): CurvePoint[] {
  const out: CurvePoint[] = [];
  const top = Math.min(hiHz, sampleRate / 2 * 0.999);
  for (let i = 0; i < nPoints; i++) {
    const hz = logXToHz(nPoints === 1 ? 0 : i / (nPoints - 1), loHz, top);
    out.push({ x: hz, y: linearToDb(filterGain(cutoff, resonance, type, hz, sampleRate)) });
  }
  return out;
}

/** Frequency of the response peak (highest dB) on a fine log grid; the resonance peak for the low pass. */
export function filterPeakHz(cutoff: number, resonance: number, type: KlysFilterKind, sampleRate: number): number {
  let best = 20, bestDb = -Infinity;
  const top = sampleRate / 2 * 0.999;
  for (let i = 0; i <= 512; i++) {
    const hz = logXToHz(i / 512, 20, top);
    const db = linearToDb(filterGain(cutoff, resonance, type, hz, sampleRate));
    if (db > bestDb) { bestDb = db; best = hz; }
  }
  return best;
}

/** The -3 dB corner of one filter stage at this cutoff (bilinear: g = P / (1-P), corner = sr atan(g) / pi). */
export function filterStageCornerHz(cutoff: number, sampleRate: number): number {
  const P = filterCoeffs(cutoff, 0).p / FILTER_FULL_SCALE;
  if (P <= 0) return 0;
  if (P >= 1) return sampleRate / 2;
  return sampleRate * Math.atan(P / (1 - P)) / Math.PI;
}

// ---------------------------------------------------------------------------------------------------------
// (c) vibrato / PWM LFO
// ---------------------------------------------------------------------------------------------------------

/** mus_shape (music.c:1084): Sint8 -128..127 at a table position. Shape order = KLYS_SHAPES (music.h MUS_SHAPE_*). */
export function lfoShapeValue(position: number, shape: number): number {
  const pos = Math.trunc(position) & 0xffff;
  switch (shape) {
    case 0: return SINE_TABLE[pos % VIB_TAB_SIZE];
    case 4: return ((pos % VIB_TAB_SIZE) & (VIB_TAB_SIZE / 2)) ? -128 : 127;
    case 1: return (pos % VIB_TAB_SIZE) * 2 - 128;
    case 2: return 127 - (pos % VIB_TAB_SIZE) * 2;
    default: return RND_TABLE[Math.trunc(pos / 8) % VIB_TAB_SIZE];
  }
}

export type LfoKind = 'vibrato' | 'pwm';
export interface LfoCurve {
  /** x = seconds, y = effect in its own unit (vibrato: semitones, pwm: pulse width units of the 0..2047 field). */
  points: CurvePoint[];
  cycleSeconds: number;
  /** Peak of |y|. */
  peak: number;
  unit: 'semitones' | 'pulse width';
}

/**
 * `cycles` cycles of the LFO, one point per tick (the engine updates the LFO once per tick, music.c:1399 and do_pwm
 * music.c:1121): position += speed, value = mus_shape(position >> 1, shape).
 * Vibrato = shape * depth / 64 in 1/256 semitone (music.c:1400, the note is 8.8 fixed point). PWM = shape * depth / 32
 * added to the pulse width (music.c:1121). `vibratoDelay` (vibrato only) shrinks the depth by one per tick (music.c:1361).
 * A speed of 0 never moves: a single flat point.
 */
export function lfoShape(shape: number, speed: number, depth: number, cycles = 2, kind: LfoKind = 'vibrato', tickHz = DEFAULT_TICK_HZ, vibratoDelay = 0): LfoCurve {
  const unit = kind === 'vibrato' ? 'semitones' : 'pulse width';
  if (speed <= 0) return { points: [{ x: 0, y: 0 }], cycleSeconds: Infinity, peak: 0, unit };
  const ticks = Math.ceil(cycles * 2 * VIB_TAB_SIZE / speed);
  const points: CurvePoint[] = [];
  let position = 0, peak = 0;
  for (let t = 0; t <= ticks; t++) {
    position += speed; // the engine adds before it reads (music.c:1399)
    const dep = kind === 'vibrato' ? Math.max(0, depth - Math.max(0, vibratoDelay - t)) : depth;
    const v = lfoShapeValue(position >> 1, shape);
    const y = kind === 'vibrato' ? Math.trunc(v * dep / 64) / 256 : Math.trunc(v * dep / 32);
    peak = Math.max(peak, Math.abs(y));
    points.push({ x: t / tickHz, y });
  }
  return { points, cycleSeconds: lfoCycleSeconds(speed, tickHz), peak, unit };
}

// ---------------------------------------------------------------------------------------------------------
// (d) oscillator
// ---------------------------------------------------------------------------------------------------------

/** cyd.h CYD_CHN_ENABLE_* bits that select the oscillator (cydflags). */
export const OSC_NOISE = 1, OSC_PULSE = 2, OSC_TRIANGLE = 4, OSC_SAW = 8, OSC_WAVETABLE = 4096, OSC_LFSR = 16384;

/** cyd_pulse (cydosc.c:5): high from pw/4096 of the cycle to its end (pw 0..2047 gives 100 percent..50 percent high). */
export function pulseDutyHigh(pw: number): number {
  const thr = Math.min(Math.trunc(pw) << 4, 65536);
  return (65536 - thr) / 65536;
}
/** One cycle of the pulse wave, -1..1, x = phase 0..1. */
export function pulseWave(pw: number, nPoints = 128): CurvePoint[] {
  const thr = Math.trunc(pw) << 4;
  const out: CurvePoint[] = [];
  for (let i = 0; i < nPoints; i++) {
    const acc = Math.trunc(i / nPoints * ACC_LENGTH);
    out.push({ x: i / nPoints, y: ((acc >> 8) >= thr ? WAVE_AMP - 1 : 0) / (WAVE_AMP / 2) - 1 });
  }
  return out;
}

export interface OscillatorCycle {
  /** x = phase 0..1, y = -1..1. */
  points: CurvePoint[];
  /** False when noise is in the mix: noise is replaced by its mean so the AND shows the waveform it gates. */
  deterministic: boolean;
  /** False for wavetable and POKEY LFSR: not drawn from the engine's formula. */
  modelled: boolean;
}

/**
 * One cycle of the oscillator selected by the cydflags waveform bits, as cyd_osc (cydosc.c:35) combines them: the
 * selected 16-bit waves are ANDed. Output is centred (minus WAVE_AMP/2, cyd.c:551) and scaled to -1..1.
 */
export function oscillatorCycle(cydflags: number, pw: number, nPoints = 128): OscillatorCycle {
  const modelled = (cydflags & (OSC_WAVETABLE | OSC_LFSR)) === 0;
  const bits = cydflags & (OSC_NOISE | OSC_PULSE | OSC_TRIANGLE | OSC_SAW);
  const points: CurvePoint[] = [];
  for (let i = 0; i < nPoints; i++) {
    const acc = Math.trunc(i / nPoints * ACC_LENGTH);
    let v = WAVE_AMP / 2;
    if (bits !== 0) {
      v = 0xffff;
      if (bits & OSC_PULSE) v &= (acc >> 8) >= (Math.trunc(pw) << 4) ? WAVE_AMP - 1 : 0;
      if (bits & OSC_SAW) v &= (acc >> 8) & (WAVE_AMP - 1);
      if (bits & OSC_TRIANGLE) v &= ((((acc & (ACC_LENGTH / 2)) ? ~acc : acc) >> 7) & (WAVE_AMP * 2 - 1));
      if (bits & OSC_NOISE) v &= 0x7fff;
    }
    points.push({ x: i / nPoints, y: (v - WAVE_AMP / 2) / (WAVE_AMP / 2) });
  }
  return { points, deterministic: (bits & OSC_NOISE) === 0, modelled };
}
