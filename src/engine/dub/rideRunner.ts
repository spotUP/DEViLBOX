/**
 * Executing a ride — moving a parameter from where it is to where the
 * performer decided it should go.
 *
 * `chooseRide` decides; this carries it out. Split because the decision is the
 * interesting, testable part and the execution is a clock and a curve.
 *
 * Plan: thoughts/shared/plans/2026-09-23-autodub-rides-the-faders.md
 */

import type { AutoDubRide, RideCurve } from './chooseRide';

/**
 * How far along a ride is, 0..1, shaped by the persona's hand.
 *
 * `step` is not a slider at all — it is a hand that puts a control in a new
 * POSITION, which is what Tubby's Big Knob does and what the master plan's
 * DSP-08 matrix calls "stepped". It jumps at the halfway point rather than at
 * the start, so a stepped ride still occupies its bars and can still be
 * abandoned part-way.
 */
export function rideProgress(curve: RideCurve, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (curve) {
    case 'linear': return clamped;
    // Smoothstep: leaves slowly, arrives slowly. A hand does not start at
    // full speed.
    case 'ease': return clamped * clamped * (3 - 2 * clamped);
    case 'step': return clamped < 0.5 ? 0 : 1;
  }
}

/**
 * The value a ride should be at, given how far through it is.
 *
 * A RETURNING ride is an excursion: out for the first half, back for the
 * second, so it ends where it began. Without this a ride leaves its parameter
 * wherever the journey stopped, and a few minutes of that walks the desk into
 * a corner — the high-pass measured parked at 410 Hz on 2026-09-23, which
 * takes the whole low end out of the dub send.
 */
export function rideValueAt(from: number, ride: AutoDubRide, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  // Out and back: 0 → 1 → 0 across the ride's own length.
  const journey = ride.returns
    ? (clamped <= 0.5 ? clamped * 2 : (1 - clamped) * 2)
    : clamped;
  const p = rideProgress(ride.curve, journey);
  return from + (ride.target - from) * p;
}

/**
 * A ride in flight.
 *
 * Carries where it started, because a ride is a journey from a value rather
 * than to one — reading the current value each tick would make a ride chase
 * its own output.
 */
export interface ActiveRide {
  ride: AutoDubRide;
  /** The value when the hand landed. */
  from: number;
  /** Musical start, for the bars this ride is measured in. */
  startBar: number;
  /** Wall-clock start, for the ceiling below. */
  startedAtMs: number;
}

/**
 * The longest a ride may last in real time, whatever the bars say.
 *
 * Bars stop advancing when the transport stops, so a ride measured only in
 * bars never ends — the same failure that left `transportTapeStop` holding the
 * transport in slow motion indefinitely (measured 2026-09-22 on jennipha.ahx),
 * which is why `DUB_CURVE_HOLD_CEILING_MS` exists. Sixteen bars at 60 BPM is
 * 64 seconds, so this is generous enough never to cut a musical ride short.
 */
export const RIDE_CEILING_MS = 90_000;

export interface RideTickInputs {
  /** Musical position now, in bars, fractional. */
  bar: number;
  nowMs: number;
  /** Parameters the performer has a hand on right now. */
  heldParams: ReadonlySet<string>;
}

export type RideOutcome =
  | { kind: 'move'; param: string; value: number }
  | { kind: 'done'; param: string; value: number }
  | { kind: 'abandoned'; param: string; why: 'hand' | 'timeout' };

/**
 * Advance one ride.
 *
 * Returns what should happen to its parameter, and nothing else — no writing,
 * no store, so the whole behaviour is testable without an engine.
 */
export function tickRide(active: ActiveRide, inputs: RideTickInputs): RideOutcome {
  const { ride, from, startBar, startedAtMs } = active;

  // A hand on the control ends the ride outright. Pausing and resuming under
  // a hand that has moved on is a fight, and the machine loses it noisily.
  if (inputs.heldParams.has(ride.param)) {
    return { kind: 'abandoned', param: ride.param, why: 'hand' };
  }

  if (inputs.nowMs - startedAtMs > RIDE_CEILING_MS) {
    return { kind: 'abandoned', param: ride.param, why: 'timeout' };
  }

  const elapsed = inputs.bar - startBar;
  const t = ride.bars <= 0 ? 1 : elapsed / ride.bars;
  const value = rideValueAt(from, ride, t);

  // A returning ride ends where it STARTED; a one-way ride ends on its target.
  return t >= 1
    ? { kind: 'done', param: ride.param, value: ride.returns ? from : ride.target }
    : { kind: 'move', param: ride.param, value };
}

/**
 * Every ride currently in flight, and the rule that one parameter has one hand.
 *
 * A second ride on a parameter already being ridden would have two journeys
 * writing the same value from different starting points, which reads as a
 * fight rather than a performance.
 */
export class RideBook {
  private rides = new Map<string, ActiveRide>();

  /** Begin a ride, unless that parameter is already being ridden. */
  start(ride: AutoDubRide, from: number, bar: number, nowMs: number): boolean {
    if (this.rides.has(ride.param)) return false;
    this.rides.set(ride.param, { ride, from, startBar: bar, startedAtMs: nowMs });
    return true;
  }

  /** Advance everything, and drop whatever finished or was abandoned. */
  tick(inputs: RideTickInputs): RideOutcome[] {
    const outcomes: RideOutcome[] = [];
    for (const [param, active] of this.rides) {
      const outcome = tickRide(active, inputs);
      outcomes.push(outcome);
      if (outcome.kind !== 'move') this.rides.delete(param);
    }
    return outcomes;
  }

  /** Is this parameter being ridden right now? */
  isRiding(param: string): boolean {
    return this.rides.has(param);
  }

  /** What is in flight — the master plan's `active rides`. */
  get active(): readonly ActiveRide[] {
    return [...this.rides.values()];
  }

  /**
   * Stop everything and PUT BACK what was borrowed.
   *
   * Dropping rides on the floor is not enough. A ride interrupted mid-journey
   * leaves its parameter wherever it had got to, and that value is persisted —
   * a one-way high-pass ride wrote 410 Hz into the saved settings and the next
   * song booted with no low end at all (2026-09-23). Worse, a ride that had
   * opened a channel send left that channel routed into a bus that was then
   * unwired, and the audio went silent.
   *
   * So an interrupted ride hands its parameter back to where the hand found
   * it. Returns the restores for the caller to apply.
   */
  releaseAll(): Array<{ param: string; value: number }> {
    const restores = [...this.rides.values()].map((active) => ({
      param: active.ride.param,
      value: active.from,
    }));
    this.rides.clear();
    return restores;
  }

  /** Drop everything WITHOUT restoring — only when the values no longer matter. */
  clear(): void {
    this.rides.clear();
  }
}
