/**
 * Loudness of DX7 voices through the real firmware (see dx7Harness.ts): the same note and velocity on a loaded voice,
 * measured as the RMS of the loudest 100 ms of the first second of a held key (a pad that swells slowly and a pluck that
 * dies away are both judged by their loudest part), and the peak of the same second.
 */
import type { DX7Rig } from './dx7Harness';

export const LOUDNESS_NOTE = 60;
export const LOUDNESS_VELOCITY = 100;
const HOLD_BLOCKS = 400;      // 1.07 s at 48 kHz
const WINDOW = 4800;          // 100 ms
const SILENT_LEVEL = 4000;    // EGS attenuation units: 0xFF0 = silent

export interface Loudness { rmsDb: number; peakDb: number }

const toDb = (x: number): number => 20 * Math.log10(Math.max(x, 1e-9));

export function loudestWindowRmsDb(a: Float32Array): number {
  let sum = 0;
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * a[i];
    if (i >= WINDOW) sum -= a[i - WINDOW] * a[i - WINDOW];
    if (i >= WINDOW - 1 && sum > best) best = sum;
  }
  return toDb(Math.sqrt(best / WINDOW));
}

/** Select `program` of the loaded bank, hold the reference note, measure, release and let every voice fall silent. */
export async function measureProgram(rig: DX7Rig, program: number, note = LOUDNESS_NOTE, velocity = LOUDNESS_VELOCITY): Promise<Loudness> {
  await rig.program(program);
  await rig.send({ type: 'noteOn', note, velocity });
  const out = rig.run(HOLD_BLOCKS);
  await rig.send({ type: 'noteOff', note });
  await rig.send({ type: 'allNotesOff' });
  for (let i = 0; i < 15; i++) {
    rig.run(100);
    if (rig.envelopeState().every(v => v.every(o => o.level >= SILENT_LEVEL))) break;
  }
  let peak = 0;
  for (const x of out) peak = Math.max(peak, Math.abs(x));
  return { rmsDb: loudestWindowRmsDb(out), peakDb: toDb(peak) };
}
