/**
 * A hand on a fader.
 *
 * The first cut of the master trim ride attacked by the full overshoot on
 * every 250 ms tick and released at 2 dB a second. Measured, it held the
 * clipper idle; heard, "it sounds very artificially sidechained"
 * (2026-09-22): every loud bar ducked the mix and every quiet bar let it
 * back. That is a slow sidechain, not a level set.
 *
 * A rider that behaves like an engineer settles over about a second, then
 * HOLDS — a loud bar is a reason to sit at the new level, not to come back
 * up the moment it ends — and only then releases, slowly enough that the
 * creep is not heard as movement. Attack is a fraction of the overshoot
 * per tick so the gain change is spread over a few ticks and the param
 * ramp between them is continuous.
 *
 * Pure. State and an overshoot in, next state out. Both the master trim
 * ride and the return governor step through this.
 */

export interface RiderState {
  /** Current depth, dB, at or below zero. */
  db: number;
  /** Ticks left before release may begin. Reset on every attack. */
  hold: number;
}

export interface RiderConfig {
  /** Share of the overshoot taken per tick. 0.5 reaches 94 % in four ticks. */
  attackFraction: number;
  /** Ticks to sit at the new depth after an attack before releasing. */
  holdTicks: number;
  /** Release per tick, dB. */
  releaseDb: number;
  /** Deepest the rider can go, dB. */
  maxDb: number;
}

export const RIDER_REST: RiderState = { db: 0, hold: 0 };

export function stepRider(state: RiderState, overDb: number, cfg: RiderConfig): RiderState {
  const prev = Number.isFinite(state.db) ? Math.min(0, Math.max(-cfg.maxDb, state.db)) : 0;
  const hold = Number.isFinite(state.hold) ? Math.max(0, Math.floor(state.hold)) : 0;
  if (Number.isFinite(overDb) && overDb > 0) {
    return {
      db: Math.max(-cfg.maxDb, prev - overDb * cfg.attackFraction),
      hold: cfg.holdTicks,
    };
  }
  if (hold > 0) return { db: prev, hold: hold - 1 };
  return { db: Math.min(0, prev + cfg.releaseDb), hold: 0 };
}
