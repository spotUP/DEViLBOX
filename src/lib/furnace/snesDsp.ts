/**
 * SNES S-DSP maths for the instrument editor: envelope curves, echo FIR response and the
 * per-song chip flags. One place, read by the editor panels and the format store.
 *
 * Envelope behaviour follows SPC_DSP::run_envelope and the register writes of Furnace's
 * DivPlatformSNES::writeEnv (third-party/furnace-master/src/engine/platform).
 */

export const SNES_SAMPLE_RATE = 32000;

/** Samples between envelope steps for each of the 32 rates (SPC_DSP counter_rates). 0 = never. */
export const SNES_RATE_PERIODS: readonly number[] = [
  0, 2048, 1536, 1280, 1024, 768, 640, 512, 384, 320, 256, 192, 160, 128, 96, 80,
  64, 48, 40, 32, 24, 20, 16, 12, 10, 8, 6, 5, 4, 3, 2, 1,
];

const ENV_MAX = 0x7ff;

export interface EnvelopePoint {
  /** Seconds from key-on. */
  t: number;
  /** 0..1 of full level. */
  level: number;
}

export interface EnvelopeCurve {
  points: EnvelopePoint[];
  /** Seconds at which the key is released; undefined when the curve has no key-off. */
  keyOff?: number;
  /** Seconds each phase takes; Infinity when the phase never ends. */
  attackTime: number;
  decayTime: number;
  releaseTime: number;
}

type Step = (env: number) => number;

const expDown: Step = (env) => { const e = env - 1; return e - (e >> 8); };
const linDown: Step = (env) => env - 0x20;
const linUp: Step = (env) => env + 0x20;
// GAIN mode 7: the slope drops to a quarter above 0x600.
const bentUp: Step = (env) => env + (env >= 0x600 ? 0x8 : 0x20);

interface Tracer {
  env: number;
  t: number;
  points: EnvelopePoint[];
}

/** Step the envelope at `rate` until `done`, the level limit or `maxSeconds`; returns the seconds spent. */
function run(tr: Tracer, rate: number, step: Step, done: (env: number) => boolean, maxSeconds: number): number {
  const period = SNES_RATE_PERIODS[rate & 31];
  const start = tr.t;
  if (period === 0) {
    tr.t += maxSeconds;
    tr.points.push({ t: tr.t, level: tr.env / ENV_MAX });
    return Infinity;
  }
  const dt = period / SNES_SAMPLE_RATE;
  while (!done(tr.env)) {
    if (tr.t - start >= maxSeconds) {
      return Infinity;
    }
    tr.env = Math.max(0, Math.min(ENV_MAX, step(tr.env)));
    tr.t += dt;
    tr.points.push({ t: tr.t, level: tr.env / ENV_MAX });
  }
  return tr.t - start;
}

export interface SnesAdsr {
  a: number;
  d: number;
  s: number;
  r: number;
  d2: number;
  /** Furnace sustain/release mode 0-3. */
  sus: number;
}

/** Seconds the curve shows the key held after the decay ends, and the longest release it draws. */
const HOLD_SECONDS = 0.4;
const MAX_PHASE_SECONDS = 4;

/**
 * The level over time of an ADSR instrument: key held, then released.
 *
 * sus 0: the sustain phase falls at rate R and key-off is the chip's fast release (8 ms).
 * sus 1-3: the sustain phase falls at rate D2; key-off falls at rate R, linear (1) or
 * exponential (2, 3).
 */
export function snesAdsrCurve(p: SnesAdsr): EnvelopeCurve {
  const tr: Tracer = { env: 0, t: 0, points: [{ t: 0, level: 0 }] };
  const attackRate = (p.a & 15) * 2 + 1;
  const attackTime = run(tr, attackRate, (env) => env + (attackRate < 31 ? 0x20 : 0x400), (env) => env >= ENV_MAX, Infinity);
  const sustain = p.s & 7;
  const decayTime = run(tr, (p.d & 7) * 2 + 16, expDown, (env) => (env >> 8) <= sustain, Infinity);

  const sus = p.sus & 3;
  const sustainRate = (sus === 0 ? p.r : p.d2) & 31;
  run(tr, sustainRate, expDown, (env) => env === 0, HOLD_SECONDS);
  const keyOff = tr.t;

  let releaseTime: number;
  if (sus === 0) {
    // KOFF: 8 per sample, whatever the rates say.
    releaseTime = run(tr, 31, (env) => env - 8, (env) => env === 0, MAX_PHASE_SECONDS);
  } else {
    releaseTime = run(tr, p.r & 31, sus === 1 ? linDown : expDown, (env) => env === 0, MAX_PHASE_SECONDS);
  }
  return { points: tr.points, keyOff, attackTime, decayTime, releaseTime };
}

/** Furnace's raw GAIN mode values (DivInstrumentSNES::GainMode). */
export const SNES_GAIN_MODE = { DIRECT: 0, DEC_LINEAR: 4, DEC_LOG: 5, INC_LINEAR: 6, INC_INVLOG: 7 } as const;

/** Largest gain value a mode takes: 127 for direct, 31 (a rate) for the others. */
export function snesGainMax(gainMode: number): number {
  return gainMode === SNES_GAIN_MODE.DIRECT ? 127 : 31;
}

/**
 * The level over time of a GAIN instrument. The decrease modes are drawn from full level to
 * show their shape; on the chip a fresh note starts at zero, so they stay silent.
 */
export function snesGainCurve(gainMode: number, gain: number): EnvelopeCurve {
  if (gainMode === SNES_GAIN_MODE.DIRECT) {
    const level = (gain & 127) / 127;
    return { points: [{ t: 0, level }, { t: HOLD_SECONDS, level }], attackTime: 0, decayTime: 0, releaseTime: 0 };
  }
  const rising = gainMode === SNES_GAIN_MODE.INC_LINEAR || gainMode === SNES_GAIN_MODE.INC_INVLOG;
  const tr: Tracer = { env: rising ? 0 : ENV_MAX, t: 0, points: [{ t: 0, level: rising ? 0 : 1 }] };
  const step = gainMode === SNES_GAIN_MODE.DEC_LINEAR ? linDown
    : gainMode === SNES_GAIN_MODE.DEC_LOG ? expDown
    : gainMode === SNES_GAIN_MODE.INC_LINEAR ? linUp : bentUp;
  const time = run(tr, gain & 31, step, (env) => (rising ? env >= ENV_MAX : env === 0), MAX_PHASE_SECONDS);
  return { points: tr.points, attackTime: rising ? time : 0, decayTime: rising ? 0 : time, releaseTime: 0 };
}

// ── Echo ────────────────────────────────────────────────────────────────────────

export const SNES_AUDIO_RAM_BYTES = 65536;

/** Bytes of Audio-RAM the echo buffer takes (snes.cpp initEcho: delay * 2048). */
export function snesEchoBufferBytes(delay: number): number {
  return (delay & 15) * 2048;
}

/** Echo delay in milliseconds: 16 ms per step. */
export function snesEchoDelayMs(delay: number): number {
  return (delay & 15) * 16;
}

/** Sum of the 8 taps and whether it leaves -128..127, where the filter can overflow (Furnace sysConf.cpp). */
export function snesFirSum(taps: readonly number[]): { sum: number; overflow: boolean } {
  const sum = taps.reduce((a, b) => a + b, 0);
  return { sum, overflow: sum < -128 || sum > 127 };
}

/** Gain in dB of the echo FIR at `points` frequencies from 0 Hz to 16 kHz. Taps are -128..127; 128 = unity. */
export function snesFirResponseDb(taps: readonly number[], points = 64): number[] {
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const w = (Math.PI * i) / (points - 1);
    let re = 0;
    let im = 0;
    taps.forEach((c, k) => { re += (c / 128) * Math.cos(w * k); im -= (c / 128) * Math.sin(w * k); });
    out.push(20 * Math.log10(Math.max(Math.hypot(re, im), 1e-4)));
  }
  return out;
}

/** Scale to integers whose absolute values sum to at most 127, so no input can overflow the filter. */
function scaleTaps(raw: number[]): number[] {
  const total = raw.reduce((a, b) => a + Math.abs(b), 0);
  return raw.map((v) => Math.trunc((v / total) * 127));
}

const HAMMING = Array.from({ length: 8 }, (_, k) => 0.54 - 0.46 * Math.cos((2 * Math.PI * k) / 7));
// Hamming windowed sinc, cutoff a quarter of the sample rate (4 kHz).
const LOW_PASS_SHAPE = HAMMING.map((w, k) => {
  const x = k - 3.5;
  return (w * Math.sin(Math.PI * 0.25 * x)) / (Math.PI * 0.25 * x);
});

export interface SnesFirPreset {
  name: string;
  taps: number[];
}

/** Flat is Furnace's default filter (snes.cpp setFlags); the other three are computed. Band Pass is the window moved to 8 kHz. */
export const SNES_FIR_PRESETS: readonly SnesFirPreset[] = [
  { name: 'Flat', taps: [127, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Low Pass', taps: scaleTaps(LOW_PASS_SHAPE) },
  { name: 'High Pass', taps: scaleTaps(LOW_PASS_SHAPE.map((v, k) => (k % 2 ? -v : v))) },
  { name: 'Band Pass', taps: scaleTaps(HAMMING.map((w, k) => w * Math.cos((Math.PI / 2) * (k - 3.5)))) },
];

// ── Chip flags ──────────────────────────────────────────────────────────────────

export interface SnesChipFlags {
  /** Dry output volume 0-127 per side (Furnace stores 127 - volume as volScaleL/R). */
  dryVolL: number;
  dryVolR: number;
  echo: boolean;
  echoDelay: number;
  echoFeedback: number;
  echoVolL: number;
  echoVolR: number;
  echoFilter: number[];
  /** Bit n set = channel n+1 starts with echo on. */
  echoMask: number;
  interpolationOff: boolean;
  antiClick: boolean;
}

/** Parse a Furnace chip flag string ("key=value" per line). */
export function parseChipFlags(flags: string | undefined): Map<string, string> {
  const kv = new Map<string, string>();
  for (const line of (flags ?? '').split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) kv.set(line.slice(0, eq), line.slice(eq + 1));
  }
  return kv;
}

export function serializeChipFlags(kv: ReadonlyMap<string, string>): string {
  return [...kv].map(([k, v]) => `${k}=${v}\n`).join('');
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
const s8 = (v: number) => clamp(v, -128, 127);

/** The SNES chip flags of a song, with Furnace's defaults (snes.cpp setFlags) for missing keys. */
export function readSnesChipFlags(flags: string | undefined): SnesChipFlags {
  const kv = parseChipFlags(flags);
  const int = (key: string, fallback: number) => {
    const n = parseInt(kv.get(key) ?? '', 10);
    return Number.isNaN(n) ? fallback : n;
  };
  const bool = (key: string, fallback: boolean) => (kv.has(key) ? kv.get(key) === 'true' : fallback);
  return {
    dryVolL: 127 - clamp(int('volScaleL', 0), 0, 127),
    dryVolR: 127 - clamp(int('volScaleR', 0), 0, 127),
    echo: bool('echo', false),
    echoDelay: clamp(int('echoDelay', 0), 0, 15),
    echoFeedback: s8(int('echoFeedback', 0)),
    echoVolL: s8(int('echoVolL', 127)),
    echoVolR: s8(int('echoVolR', 127)),
    echoFilter: [127, 0, 0, 0, 0, 0, 0, 0].map((d, i) => s8(int(`echoFilter${i}`, d))),
    echoMask: int('echoMask', 0) & 0xff,
    interpolationOff: bool('interpolationOff', false),
    antiClick: bool('antiClick', true),
  };
}

/** Write changed SNES flags into a flag string; keys of other settings are kept. */
export function writeSnesChipFlags(flags: string | undefined, updates: Partial<SnesChipFlags>): string {
  const kv = parseChipFlags(flags);
  const set = (key: string, value: number | boolean | undefined) => {
    if (value !== undefined) kv.set(key, String(value));
  };
  if (updates.dryVolL !== undefined) set('volScaleL', 127 - clamp(updates.dryVolL, 0, 127));
  if (updates.dryVolR !== undefined) set('volScaleR', 127 - clamp(updates.dryVolR, 0, 127));
  set('echo', updates.echo);
  if (updates.echoDelay !== undefined) set('echoDelay', clamp(updates.echoDelay, 0, 15));
  if (updates.echoFeedback !== undefined) set('echoFeedback', s8(updates.echoFeedback));
  if (updates.echoVolL !== undefined) set('echoVolL', s8(updates.echoVolL));
  if (updates.echoVolR !== undefined) set('echoVolR', s8(updates.echoVolR));
  updates.echoFilter?.forEach((v, i) => set(`echoFilter${i}`, s8(v)));
  if (updates.echoMask !== undefined) set('echoMask', updates.echoMask & 0xff);
  set('interpolationOff', updates.interpolationOff);
  set('antiClick', updates.antiClick);
  return serializeChipFlags(kv);
}

/** Macro names on the SNES, by Furnace macro code (insEdit SNES macro list). */
export const SNES_MACRO_LABELS: Readonly<Record<number, string>> = {
  0: 'Volume',
  1: 'Arpeggio',
  2: 'Noise Frequency',
  3: 'Waveform',
  4: 'Pitch',
  5: 'Special (noise, echo, pitch modulation, invert)',
  6: 'Gain',
  12: 'Pan Left',
  13: 'Pan Right',
};
