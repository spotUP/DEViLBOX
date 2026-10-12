/**
 * Physics-driven gestures (owner decisions O1 + O2, 2026-10-12; scratch ledger SCR-PG-B1): a
 * catalogue gesture becomes a hand on the record in the ported two-body turntable model
 * (`engine/turntable/turntableSim.ts`), exactly as the reference `render_gesture` builds it
 * (`tools/scratch.py` :226-302):
 * - the hand path's angles x A (1500 samples at 22,050 Hz) x amp, amp = 0.55 + 0.70 x velocity
 *   (velocity drives the stroke length, O2), grip per point;
 * - a glide gesture (transformer, crab, hydroplane) is the reference accelerating glide (G5): the
 *   hand carries the record 0.32 of `glide x duration` by half way and 1.35 of it by the end;
 * - the style's turntable (deck, slipmat, performer, record, cartridge) from the reference
 *   profiles (`PROFILES[...].deck`, scratch.py :353-391); warp 0.4, eccentricity 0.3;
 * - unphysical motion is repaired once (`simulateRepaired`, physics s.57/58, T16).
 * The record velocity is the stroke's rate curve; throws (natural speed) and record flourishes
 * (brake / spin-up, the reference `deck_motion`) are not simulated.
 */
import { deckMotionAt, simulateRepaired, TT_A, TT_RATE, type TtHandPoint, type TtSimOptions, type TtSimResult } from '@/engine/turntable/turntableSim';
import type { ScratchDJStyle, ScratchGesture, ScratchVelocityPoint } from './scratchTypes';

/** Reference `VEL` amp (scratch.py :211): stroke energy = amp_base + amp_span x velocity. */
export const STROKE_AMP = { base: 0.55, span: 0.70 } as const;

/** The reference style profiles' turntables (scratch.py :353-391), for the five DEViLBOX styles. */
export const STYLE_TURNTABLE: Readonly<Record<ScratchDJStyle, Required<Pick<TtSimOptions, 'deck' | 'slipmat' | 'performer' | 'record' | 'cartridge'>>>> = {
  oldSchool: { deck: 'worn_club_deck', slipmat: 'felt_standard', performer: 'loose_old_school', record: 'light_battle', cartridge: 'battle' },
  boomBap: { deck: 'classic_sl1200', slipmat: 'thin_battle', performer: 'tight_battle', record: 'light_battle', cartridge: 'battle' },
  electro: { deck: 'tight_direct_drive', slipmat: 'thin_battle', performer: 'electro_grid', record: 'light_battle', cartridge: 'battle' },
  battle: { deck: 'tight_direct_drive', slipmat: 'thin_battle', performer: 'tight_battle', record: 'light_battle', cartridge: 'battle' },
  loFi: { deck: 'worn_club_deck', slipmat: 'worn_felt', performer: 'lofi_drag', record: 'light_battle', cartridge: 'worn_stylus' },
};

/** The reference default turntable (`render_gesture` with no profile). */
export const DEFAULT_TURNTABLE = STYLE_TURNTABLE.boomBap;

/** Reachability sentinel: gestures the model performed. */
/** Reachability sentinels: model runs (any caller), gestures performed through the model (a voice or a deck), repairs. */
export const scratchPhysicsStats = { simulations: 0, performed: 0, repaired: 0 };

export function strokeAmp(velocity: number | undefined): number {
  const v = velocity === undefined || !Number.isFinite(velocity) ? 0.7 : Math.max(0, Math.min(1, velocity));
  return STROKE_AMP.base + STROKE_AMP.span * v;
}

/** Whether the model performs this gesture (a hand path or a glide; not a throw, not a flourish). */
export function isPhysical(gesture: Pick<ScratchGesture, 'id' | 'handPath' | 'glide' | 'flourish' | 'deckAction'>): boolean {
  if (gesture.id === 'drop' || gesture.id === 'dropPhrase' || gesture.flourish || gesture.deckAction) return false;
  return !!gesture.glide || !!gesture.handPath?.length;
}

/** The hand the reference builds for a gesture of `durSec` at `velocity` (record samples at 22,050 Hz). */
export function gestureHand(gesture: Pick<ScratchGesture, 'handPath' | 'glide'>, durSec: number, velocity?: number): TtHandPoint[] {
  if (gesture.glide) {
    const dist = gesture.glide.ratio * durSec * TT_RATE;
    const g = gesture.glide.grip;
    const profile = gesture.glide.profile;
    if (!profile) return [[0, 0, g], [0.5, 0.32 * dist, g], [1, 1.35 * dist, g]];
    // a speed profile: the hand carries the record by its integral (trapezoids between the knots)
    const out: TtHandPoint[] = [[profile[0]![0], 0, g]];
    let pos = 0;
    for (let k = 1; k < profile.length; k++) {
      const [t0, v0] = profile[k - 1]!, [t1, v1] = profile[k]!;
      pos += (t1 - t0) * (v0 + v1) / 2;
      out.push([t1, pos * dist, g]);
    }
    return out;
  }
  const amp = strokeAmp(velocity);
  return (gesture.handPath ?? []).map((p) => [p.t, p.position * TT_A * amp, p.grip] as const);
}

export interface SimulatedGesture {
  sim: TtSimResult;
  /** The record's speed over the gesture, `t` = fraction (interpolate linearly). */
  curve: ScratchVelocityPoint[];
  repaired: boolean;
}

/**
 * The one motion path (O1): the record's speed over a gesture, `t` = fraction (interpolate
 * linearly). Hand paths and glides through the turntable model; a deck action is the reference
 * `deck_motion` (the motor's own curve); a throw rides at natural speed.
 */
export function gestureMotion(gesture: Pick<ScratchGesture, 'id' | 'handPath' | 'glide' | 'flourish' | 'deckAction'>, durSec: number, opts: { velocity?: number; style?: ScratchDJStyle; seed?: number; perform?: boolean } = {}): ScratchVelocityPoint[] {
  if (opts.perform && isPhysical(gesture)) scratchPhysicsStats.performed++;
  if (gesture.deckAction) {
    const action = gesture.deckAction;
    return Array.from({ length: 33 }, (_, k) => ({ t: k / 32, velocity: deckMotionAt(action, k / 32) }));
  }
  if (!isPhysical(gesture)) return [{ t: 0, velocity: 1 }, { t: 1, velocity: 1 }];
  return simulateGesture(gesture, durSec, opts).curve;
}

/** The fastest the record moves in a gesture at a velocity (the safety governor's peak). */
export function motionPeak(gesture: Pick<ScratchGesture, 'id' | 'handPath' | 'glide' | 'flourish' | 'deckAction'>, durSec: number, velocity?: number): number {
  return Math.max(0, ...gestureMotion(gesture, durSec, { velocity }).map((p) => Math.abs(p.velocity)));
}

/** One gesture through the turntable model: its rate curve at ~1 kHz. */
export function simulateGesture(gesture: Pick<ScratchGesture, 'id' | 'handPath' | 'glide' | 'flourish'>, durSec: number, opts: { velocity?: number; style?: ScratchDJStyle; seed?: number } = {}): SimulatedGesture {
  scratchPhysicsStats.simulations++;
  const turntable = opts.style ? STYLE_TURNTABLE[opts.style] : DEFAULT_TURNTABLE;
  const sim = simulateRepaired(gestureHand(gesture, durSec, opts.velocity), durSec, TT_RATE, { ...turntable, warp: 0.4, eccentricity: 0.3, seed: opts.seed ?? 0 });
  if (sim.repaired) scratchPhysicsStats.repaired++;
  const step = Math.max(1, Math.round(sim.controlRate / 1000));
  const curve: ScratchVelocityPoint[] = [];
  for (let k = 0; k < sim.recordVel.length; k += step) curve.push({ t: sim.t[k]!, velocity: sim.recordVel[k]! });
  const last = sim.recordVel.length - 1;
  if (curve[curve.length - 1]!.t < sim.t[last]!) curve.push({ t: sim.t[last]!, velocity: sim.recordVel[last]! });
  return { sim, curve, repaired: sim.repaired };
}
