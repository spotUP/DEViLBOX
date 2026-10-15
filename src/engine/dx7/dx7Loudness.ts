/**
 * DX7 voice loudness, computed once per voice from its VCED bytes, and the output trim that gives every voice the level
 * of the default voice.
 *
 * Real DX7 voices differ by 15 dB and more in loudness (carrier output levels, how many carriers the algorithm has, how
 * hard the modulators drive them, how fast the envelope dies). The firmware does not even them out, so changing the
 * preset used to change the volume. Rendering every voice through the firmware to measure it runs at about real time (a
 * 246-bank library is hours), so the level is modelled with the same OPS/EGS ports that draw the editor curves:
 *   - each operator's envelope is run (dx7EnvelopeRun) with the key held for the first second,
 *   - at every 25 ms step the OPS pipeline (renderOps) renders the voice at the envelope levels of that moment,
 *   - the level is the RMS of the loudest 100 ms (four steps), the peak the largest sample, both in dB re one full-scale
 *     carrier. That is the same figure the firmware harness measures on the real output (dx7Loudness.ts under __tests__).
 * REFERENCE_OFFSET_DB maps the model's full-scale-carrier dB onto the worklet output's dBFS; it and the velocity law were
 * fitted against the real firmware (see dx7Loudness.test.ts, which re-measures a spread of library voices).
 */
import {
  OPS_FULL_SCALE, dx7EnvelopeRun, egParams, engineNoteHz, operatorFrequencyHz, readOp, renderOps, type SpectrumOp,
} from '@/components/instruments/curves/dx7CurveModels';

export const LOUDNESS_NOTE = 60;
export const LOUDNESS_VELOCITY = 100;
const HOLD_SECONDS = 1.07;
const STEP_SECONDS = 0.025;
const WINDOW_STEPS = 4;
const RENDER_SAMPLES = 1024;
const RENDER_WARMUP = 256;

/** Model dB (re a full-scale carrier) -> dBFS of the worklet output, fitted on the firmware. */
export const REFERENCE_OFFSET_DB = -6.3;

/** msfa/VDX7 velocity law: loudness steps (1/2 EG step each) added to an operator's output by key velocity and its sensitivity. */
const VELOCITY_DATA = [
  0, 70, 86, 97, 106, 114, 121, 126, 132, 138, 142, 148, 152, 156, 160, 163, 166, 170, 173, 174, 178, 181, 184, 186, 189, 190, 194, 196, 198,
  200, 202, 205, 206, 209, 211, 214, 216, 218, 220, 222, 224, 225, 227, 229, 230, 232, 233, 235, 237, 238, 240, 241, 242, 243, 244, 246, 246,
  248, 249, 250, 251, 252, 253, 254,
] as const;
export function velocityLoudnessSteps(velocity: number, sensitivity: number): number {
  const v = Math.max(0, Math.min(127, Math.round(velocity)));
  const value = VELOCITY_DATA[v >> 1] - 239;
  return ((((sensitivity * value + 7) >> 3) << 4)) / 32;
}

export interface VoiceLoudness { rmsDb: number; peakDb: number }

const toDb = (x: number): number => 20 * Math.log10(Math.max(x, 1e-9));

/** The attenuation (EG units) of an envelope run at `t` seconds: the last recorded point at or before t. */
function levelAt(points: ReadonlyArray<{ x: number; level: number }>, t: number, from: number): { level: number; index: number } {
  let i = from;
  while (i + 1 < points.length && points[i + 1].x <= t) i++;
  return { level: points[i].level, index: i };
}

/** Loudness of the 155-byte (or longer) VCED at one note and velocity. */
export function dx7VoiceLoudness(vced: ArrayLike<number>, note = LOUDNESS_NOTE, velocity = LOUDNESS_VELOCITY): VoiceLoudness {
  const get = (n: number) => vced[n] ?? 0;
  const noteHz = engineNoteHz(note);
  const algorithm = get(134);
  const feedback = get(135);
  const hw = [] as Array<{ points: ReadonlyArray<{ x: number; level: number }>; hz: number }>;
  for (let slot = 0; slot < 6; slot++) {
    const o = readOp(get, 6 - slot); // EGS order: slot 0 = operator 6
    const p = egParams(o, note);
    const outputReg = Math.max(0, Math.min(255, p.outputReg - Math.round(2 * velocityLoudnessSteps(velocity, o.velocitySens))));
    hw.push({ points: dx7EnvelopeRun({ ...p, outputReg }, HOLD_SECONDS).points, hz: operatorFrequencyHz(o, noteHz) });
  }
  const cursor = [0, 0, 0, 0, 0, 0];
  const steps = Math.floor(HOLD_SECONDS / STEP_SECONDS);
  const power: number[] = [];
  let peak = 0;
  for (let s = 0; s < steps; s++) {
    const t = s * STEP_SECONDS;
    const ops: SpectrumOp[] = hw.map((h, i) => {
      const at = levelAt(h.points, t, cursor[i]);
      cursor[i] = at.index;
      return { envelopeLevel: at.level, frequencyHz: h.hz };
    });
    const out = renderOps(algorithm, feedback, ops, RENDER_SAMPLES, RENDER_WARMUP);
    let sum = 0;
    for (const x of out) { sum += x * x; peak = Math.max(peak, Math.abs(x)); }
    power.push(sum / out.length);
  }
  let best = 0;
  for (let s = 0; s + WINDOW_STEPS <= power.length; s++) {
    let w = 0;
    for (let k = 0; k < WINDOW_STEPS; k++) w += power[s + k];
    best = Math.max(best, w / WINDOW_STEPS);
  }
  return {
    rmsDb: toDb(Math.sqrt(best) / OPS_FULL_SCALE) + REFERENCE_OFFSET_DB,
    peakDb: toDb(peak / OPS_FULL_SCALE) + REFERENCE_OFFSET_DB,
  };
}

/** The level every voice is trimmed to: the default voice, ROM1A voice 1 "BRASS 1", measured on the firmware at note 60 velocity 100. */
export const TARGET_RMS_DB = -18.6;
/** A trim never boosts the voice's peak above this (dBFS of the worklet output): the trim must not make a loud voice clip. */
export const PEAK_CEILING_DB = -6;
export const MAX_TRIM_DB = 24;
export const MIN_TRIM_DB = -24;

/** The output trim in dB that brings a voice with this loudness to TARGET_RMS_DB, limited by the peak ceiling. */
export function trimDbFor(loudness: VoiceLoudness): number {
  if (loudness.rmsDb < -80) return 0; // a voice that is silent at the reference note has nothing to even out
  const wanted = TARGET_RMS_DB - loudness.rmsDb;
  return Math.max(MIN_TRIM_DB, Math.min(MAX_TRIM_DB, Math.min(wanted, PEAK_CEILING_DB - loudness.peakDb)));
}

const trimCache = new Map<string, number>();
/** Trim of a VCED voice in dB, computed once per distinct voice (the 145 parameter bytes are the key; the name does not change the sound). */
export function dx7VoiceTrimDb(vced: ArrayLike<number>): number {
  let key = '';
  for (let i = 0; i < 145; i++) key += String.fromCharCode(48 + (vced[i] ?? 0));
  const hit = trimCache.get(key);
  if (hit !== undefined) return hit;
  const trim = trimDbFor(dx7VoiceLoudness(vced));
  trimCache.set(key, trim);
  return trim;
}

