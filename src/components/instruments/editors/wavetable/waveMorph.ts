/**
 * Wave morph (Waveform Studio P4): blend wave A into wave B over N steps and
 * lay the result out as a Furnace wave macro (FurnaceMacroType.WAVE), whose
 * values are indices into the instrument's wavetable list.
 */
import { snapLength, WAVE_LIST_MAX, type ChipTarget } from './chipTargets';
import { resample } from './waveformOps';

export interface MorphSourceWave {
  id: number;
  data: number[];
  len?: number;
  max?: number;
}

/**
 * `steps` waves from A to B inclusive, wave i the linear blend at t = i / (steps - 1),
 * each at the chip target's length (A's length snapped to the target) and depth.
 */
export function morphWaves(a: MorphSourceWave, b: MorphSourceWave, steps: number, target: ChipTarget): number[][] {
  const n = Math.max(2, Math.round(steps));
  const len = snapLength(target, a.data.length || target.defaultLen);
  const unit = (w: MorphSourceWave) => {
    const max = w.max ?? Math.max(1, ...w.data);
    return resample(w.data, len).map((v) => v / max);
  };
  const ua = unit(a);
  const ub = unit(b);
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return ua.map((va, k) => Math.max(0, Math.min(target.maxValue, Math.round((va + (ub[k] - va) * t) * target.maxValue))));
  });
}

/**
 * Most morph steps (A and B included) whose in-between waves still fit when the list
 * already holds `waveCount` waves and may hold `waveLimit` (list cap or the chip's playable count).
 * 2 means no in-between wave fits.
 */
export function maxMorphSteps(waveCount: number, waveLimit: number): number {
  return Math.max(2, waveLimit - waveCount + 2);
}

/**
 * Append the in-between waves of an A-to-B morph to `wavetables` and return the
 * wave-macro sequence (list indices): A, the new waves, B. A and B stay as they are.
 * Steps are clamped so the list never grows past `waveLimit`.
 */
export function appendMorphSequence(
  wavetables: readonly MorphSourceWave[],
  a: number,
  b: number,
  steps: number,
  target: ChipTarget,
  waveLimit: number = WAVE_LIST_MAX,
): { wavetables: MorphSourceWave[]; sequence: number[] } {
  const n = Math.min(Math.max(2, Math.round(steps)), maxMorphSteps(wavetables.length, waveLimit));
  const frames = n > 2 ? morphWaves(wavetables[a], wavetables[b], n, target).slice(1, -1) : [];
  let nextId = wavetables.reduce((m, w) => Math.max(m, w.id), -1) + 1;
  const added = frames.map((data) => ({ id: nextId++, data, len: data.length, max: target.maxValue }));
  const sequence = [a, ...added.map((_, i) => wavetables.length + i), b];
  return { wavetables: [...wavetables, ...added], sequence };
}
