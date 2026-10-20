/**
 * tools/hiphop.py render_drum_bar (plan 2026-10-19 O6e): one bar of drums, bit-exact. Event order, skip-before-draw,
 * the three RNG streams and the float32 / float64 mixing of the host are kept (see the notes at each step).
 *
 * dtype of `gain * smp` (the O6e map said float64; it is float32 for hats): `gain` is a python float, so numpy 2 (NEP 50)
 * rounds it to the array's dtype. Hats are float32 arrays, so each sample is fround(fround(gain) * s), then added to the
 * float64 buffer. Non-hat hits are float64 unless _vary_hit resampled without an attack ramp (varyHitTyped.float32).
 *
 * Seeds: `seed` is the BAR seed (song seed + bar index). `hatPool` / `hatPm` are built once per song section with the
 * SECTION seed by _render_song and passed to every bar; omitted, the pool is built from the bar seed (standalone call).
 */
import { type DrumBank, type HipHopStyle } from './drumBank';
import { drumBarContext, drumHitPlacement, performanceProfile, type DrumEvent } from './hitPlacement';
import { varyHitTyped } from './humanize';
import {
  ProbabilityMemory, applyHatVary, barHatRng, buildHatPool, drawHatVary, pickHatIndex, renderOpenHatChoke,
} from './hatPath';
import type { PyRandom } from './pyRandom';

const f32 = Math.fround;

/** A bar event as songFileToBarEvents delivers it: the host's tuple, or a phrase_engine Note as JSON. */
export type BarEventInput =
  | readonly [string, number, number, string]
  | { voice: string; step: number; vel: number; kind: string; micro_ms?: number; sub?: readonly (readonly unknown[])[] };

/** hiphop._note_fields: tuples keep their 0..1 vel; Notes carry vel 0..127 (/127.0), kind -> role, micro_ms, sub. */
export function normaliseBarEvent(item: BarEventInput): Required<DrumEvent> {
  if (Array.isArray(item)) {
    const t = item as readonly [string, number, number, string];
    return { voice: t[0], step: t[1], vel: t[2], role: t[3], microMs: 0.0, isNote: false, sub: [] };
  }
  const n = item as Exclude<BarEventInput, readonly unknown[]>;
  return { voice: n.voice, step: n.step, vel: n.vel / 127.0, role: n.kind, microMs: n.micro_ms ?? 0.0, isNote: true, sub: n.sub ?? [] };
}

export interface RenderedDrumBar {
  /** exactly barLen samples (the 1 s tail is dropped) */
  buf: Float64Array;
  /** events skipped because the bank lacks their voice (skipped before any draw) */
  skipped: number;
  /** the bar's hat stream, left where the bar ended (draw `random()` to read its position) */
  hatRng: PyRandom;
  hatPm: ProbabilityMemory;
}

/** buf[o:e] += gain * smp[:e-o]; `f32gain` = the array is float32 (python float gain is rounded to float32 first). */
function mixHit(buf: Float64Array, o: number, smp: Float64Array, gain: number, f32gain: boolean): void {
  const e = Math.min(buf.length, o + smp.length);
  if (e < o) throw new Error('render_drum_bar: hit starts past the buffer end (numpy shape error on the host)');
  if (f32gain) {
    const g = f32(gain);
    for (let i = 0; i < e - o; i++) buf[o + i] = buf[o + i]! + f32(g * smp[i]!);
  } else {
    for (let i = 0; i < e - o; i++) buf[o + i] = buf[o + i]! + gain * smp[i]!;
  }
}

export function renderDrumBar(
  style: HipHopStyle, events: readonly BarEventInput[], bpm: number, rate: number, bank: DrumBank, seed = 0,
  hatPool?: Float64Array[], hatPm?: ProbabilityMemory,
): RenderedDrumBar {
  const stepSamp = Math.trunc(rate * 60.0 / (bpm * 4));
  const barLen = stepSamp * 16;
  const buf = new Float64Array(barLen + Math.trunc(1.0 * rate));
  const perf = performanceProfile(style);
  const pool = hatPool ?? buildHatPool(style, rate, seed);
  const pm = hatPm ?? new ProbabilityMemory(pool.length);
  const hatRng = barHatRng(seed);
  const evs = events.map(normaliseBarEvent);
  const { swingAmt, kickSteps, rnd } = drumBarContext(style, evs, seed);
  let skipped = 0;
  for (const ev of evs) {
    const { voice, step, vel, role, microMs, isNote, sub } = ev as Required<DrumEvent>;
    const smp = bank[voice];
    if (smp === undefined) { skipped++; continue; } // before any draw
    const anchor = role === 'downbeat' || role === 'backbeat';
    const { offset: o, gain, h } = drumHitPlacement(style, voice, step, vel, role, microMs, isNote, stepSamp, rate, kickSteps, swingAmt, rnd, seed);
    if (voice === 'ch' || voice === 'oh') {
      const src = voice === 'oh' && bank.oh !== undefined ? bank.oh : pool[pickHatIndex(pm, hatRng)]!;
      const hv = drawHatVary(hatRng);
      let hs = applyHatVary(src, hv, rate);
      let chokeDt: number | null = null;
      let chokePartial = false;
      if (isNote) {
        for (const entry of sub) {
          if (Array.isArray(entry) && entry.length >= 2 && entry[0] === 'choke_at_ms') {
            chokeDt = Number(entry[1]);
            chokePartial = entry.length >= 3 ? Boolean(entry[2]) : false;
            break;
          }
        }
      }
      if (voice === 'oh' && chokeDt !== null) hs = renderOpenHatChoke(hs, chokeDt, chokePartial, rate);
      mixHit(buf, o, hs, gain, true);
      if (isNote) {
        for (const entry of sub) {
          if (Array.isArray(entry) && entry.length === 2 && entry[0] !== 'choke_at_ms') {
            const dtMs = Number(entry[0]);
            const vf = Number(entry[1]);
            const so = o + Math.trunc(dtMs * 1e-3 * rate);
            const subSmp = applyHatVary(pool[pickHatIndex(pm, hatRng)]!, drawHatVary(hatRng), rate);
            const e2 = Math.min(buf.length, so + subSmp.length);
            if (e2 > so) {
              if (so < 0) throw new Error('render_drum_bar: negative sub-hit start (python negative index)');
              mixHit(buf, so, subSmp, gain * vf, true);
            }
          }
        }
      }
    } else {
      const tight = (anchor ? 0.5 : 1.0) * perf.velocityVariance;
      const v = varyHitTyped(smp, h!, tight); // the host's literal 22050: never pass `rate`
      mixHit(buf, o, v.out, gain, v.float32);
    }
  }
  return { buf: buf.slice(0, barLen), skipped, hatRng, hatPm: pm };
}
