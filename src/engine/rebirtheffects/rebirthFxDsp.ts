/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * Pure parameter maths of the ReBirth effects (re-rebirth src/audio/effects.js and the effect parts of
 * src/audio/engine.js). All knobs are normalised 0..1, as in the original.
 */
export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Index of a 0..1 knob over `n` choices (engine.js `choice`). */
export const choiceIndex = (v: number, n: number): number => Math.round(clamp01(v) * (n - 1));

// ---------- distortion ----------
export const DIST = {
  ref: 0.2, driveDb: 24.25, clip: 1.97, foldClip: 3.446, foldGain: 6.267, foldPow: 1.661,
  foldAmp: 2.505, foldDry: 0.691, foldDryPow: 0.82, foldLowpass: 4881,
} as const;

export const distDrive = (amount: number): number => 10 ** ((DIST.driveDb * amount * amount) / 20);

export function curve(fn: (x: number) => number, n = 2048): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
  return c;
}

/** Wave-folder transfer curve for a shape 0..1. */
export const foldCurve = (shape: number): Float32Array<ArrayBuffer> => {
  const g = DIST.foldGain * shape ** DIST.foldPow;
  const dry = DIST.foldDry * (1 - shape) ** DIST.foldDryPow;
  return curve((z) => {
    const v = z * DIST.foldClip;
    return DIST.foldAmp * Math.sin(g * v) + dry * v;
  }, 4096);
};

export interface DistSettings { driveClip: number; driveFold: number; mixClip: number; mixFold: number; folds: boolean }

export function distSettings(amount: number, shapeKnob: number): DistSettings {
  const drive = distDrive(amount);
  const shape = Math.round(clamp01(shapeKnob) * 127) / 127;
  const folds = shape > 0;
  return {
    driveClip: drive / (DIST.clip * DIST.ref),
    driveFold: drive / (DIST.foldClip * DIST.ref),
    mixClip: folds ? 0 : DIST.clip * DIST.ref,
    mixFold: folds ? DIST.ref : 0,
    folds,
  };
}

// ---------- delay ----------
export const DELAY_STEPS = 32;
export const panPos = (k: number): number => Math.min(1, Math.max(-1, (k - 0.5) * 2 * 1.2));

/** Echo time in seconds for the steps knob at a tempo (engine.js: steps * 1/16 note, or 1/8 triplet). */
export function delayTime(stepsKnob: number, triplet: boolean, bpm: number): number {
  const steps = choiceIndex(stepsKnob, DELAY_STEPS) + 1;
  const unit = (60 / bpm / 4) * (triplet ? 4 / 3 : 1);
  return Math.min(11.9, steps * unit);
}

// ---------- compressor ----------
export const COMP_TOP_DB = -14.94;
export const COMP_KNEE_DB = 7.1;
export const COMP_OFFSET_DB = { master: -6.64, channel: -13.64 } as const;

export function compCurve(threshold: number, amount: number): { thresholdDb: number; slope: number; makeupDb: number } {
  const thresholdDb = Math.max(-48.94, 20 * Math.log10(Math.max(threshold, 1e-6)) + COMP_TOP_DB);
  return {
    thresholdDb,
    slope: 0.978 * amount ** 1.34,
    makeupDb: amount * (0.077 * (COMP_TOP_DB - thresholdDb) ** 1.57 - 2.31),
  };
}

// ---------- pattern controlled filter ----------
export const PCF_Q = [0.7, 1.11, 2.06, 4.7, 7.5];
export const PCF_HZ_SHIFT = [0.99, 0.94, 1, 1.11, 1.17];
export const PCF_LP_DB = [4.5, 2, -1.6, -4.1, -4.1];
export const PCF_BP_DB = [5, 6.5, 8.2, 12.8, 16.9];
export const PCF_ENV_OCTAVES = 9.5;
export const PCF_DECAY = [0.01, 0.025, 0.18, 0.9, 1e5];
export const MAX_FILTER_HZ = 14000;

export function lerpTable(table: readonly number[], v: number, log = false): number {
  const x = clamp01(v) * (table.length - 1);
  const i = Math.min(table.length - 2, Math.floor(x));
  const a = table[i];
  const b = table[i + 1];
  const t = x - i;
  return log ? a * (b / a) ** t : lerp(a, b, t);
}

export const pcfDecay = (decayKnob: number): number => lerpTable(PCF_DECAY, decayKnob, true);

export interface PcfShape { hz: number; q: number; lpGainDb: number; bpGainDb: number }

export function pcfShape(freq: number, reso: number): PcfShape {
  const octaves = (freq * 127 - 64) / 32;
  const r = Math.min(1, reso / 0.5);
  const up = r * Math.min(1, Math.max(0, octaves));
  const down = r * Math.min(1, Math.max(0, -octaves));
  return {
    hz: Math.min(MAX_FILTER_HZ, 379 * 2 ** (octaves * 2.65) * lerpTable(PCF_HZ_SHIFT, reso)),
    q: lerpTable(PCF_Q, reso, true) * Math.exp(0.82 * up - 0.5 * down),
    lpGainDb: lerpTable(PCF_LP_DB, reso) - 2.4 * up + 4 * down,
    bpGainDb: lerpTable(PCF_BP_DB, reso) + 4.7 * up - 1.4 * down,
  };
}
