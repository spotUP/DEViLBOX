/**
 * Gate E3 — the performance state machine.
 *
 *   LISTEN → ANTICIPATE → PREPARE → ACT → RIDE → RELEASE → LISTEN
 *
 * One machine, shared by every persona. Personas differ in WHAT they decide
 * (Gate E's policy) and in HOW MUCH they do (weights, budgets); they do not
 * each get their own notion of what performing is.
 *
 * Why a machine at all, when the tick already decides things every 250 ms:
 *
 *  - A tick is not a moment in the music. Firing "when the tick noticed" puts
 *    a throw up to 250 ms away from the hit it was meant to mark; at 140 BPM
 *    that is most of an eighth note. ANTICIPATE and PREPARE exist so the
 *    performer commits to a target EVENT and then waits for it, instead of
 *    acting the instant it has an opinion.
 *  - Holding and releasing are part of the gesture, not paperwork afterwards.
 *    RIDE is where a hold lives while the tail does its work, and RELEASE is a
 *    decision with its own timing — the move that makes dub dub is the one
 *    that lets go at the right moment.
 *
 * The machine is a pure reducer: state plus an input snapshot yields the next
 * state and the reason for it. Nothing in here fires anything; `AutoDub` owns
 * execution, and `DubRouter` stays the single execution path.
 */

import type { Intention } from './performanceContext';

export type PerformanceState =
  | 'LISTEN'      // nothing planned; watching the music
  | 'ANTICIPATE'  // an intention, and something ahead worth aiming at
  | 'PREPARE'     // close enough to the target to commit
  | 'ACT'         // fire this tick
  | 'RIDE'        // a gesture is in flight; let it work
  | 'RELEASE'     // let go now
  | 'RECOVER';    // energy is at the ceiling; nothing new until it decays

export interface PerformanceStateInput {
  /** What the performer wants, from Gate E. */
  intention: Intention;
  /** Absolute row of the event the intention is aimed at, if any. */
  targetRow: number | null;
  /** Current absolute row. */
  row: number;
  /** Rows of lead-in: inside this distance, PREPARE commits. */
  leadRows: number;
  /** Gestures currently in flight. */
  gesturesInFlight: number;
  /** True when the oldest in-flight gesture has reached its intended length. */
  holdExpired: boolean;
  /** True when the safety layer wants energy pulled back. */
  energyCritical: boolean;
  /** True when the performer may fire at all this tick (budgets, cooldowns). */
  canFire: boolean;
}

export interface PerformanceStep {
  state: PerformanceState;
  /** Why this state — carried into the fire log so a tick can be explained. */
  reason: string;
  /** True only in ACT: the tick should fire now. */
  shouldFire: boolean;
  /** True only in RELEASE: the tick should let go of what it holds. */
  shouldRelease: boolean;
}

/**
 * Advance the machine one tick.
 *
 * Ordering is the same principle as the intention layer: safety first, then
 * commitments already made, then new intent. A state is never entered because
 * "the previous one was boring" — every transition below names a condition in
 * the music or in the performer's own hands.
 */
export function nextPerformanceState(
  current: PerformanceState,
  input: PerformanceStateInput,
): PerformanceStep {
  // Safety outranks everything, including a gesture mid-flight: RECOVER is
  // how the machine stops adding while the tail decays. It releases on entry
  // so the energy actually falls rather than being waited out.
  if (input.energyCritical) {
    return step('RECOVER', 'energy at the ceiling — letting go', {
      release: input.gesturesInFlight > 0,
    });
  }
  if (current === 'RECOVER') {
    return input.gesturesInFlight > 0
      ? step('RECOVER', 'waiting for the tail to decay')
      : step('LISTEN', 'energy back under control');
  }

  // A hold that has served its purpose is released before anything new is
  // considered. Dub is as much about when you let go as when you press.
  if (input.holdExpired && input.gesturesInFlight > 0) {
    return step('RELEASE', 'hold has run its length', { release: true });
  }

  // REST is an active decision, not an absence of one — it interrupts an
  // anticipation rather than waiting for it to lapse.
  if (input.intention === 'REST') {
    return input.gesturesInFlight > 0
      ? step('RIDE', 'resting while what is held rings out')
      : step('LISTEN', 'resting');
  }

  // Something is in flight and still wanted: ride it.
  //
  // No exception for the tick that just fired. An earlier version excused
  // `current === 'ACT'` so a layered gesture could stack, and the machine then
  // walked ACT → ACT: it fired, saw its own gesture in flight, and fired
  // again. Layering is Gate G's decision (compatible gestures, accounted
  // energy), not a hole in this transition.
  if (input.gesturesInFlight > 0) {
    return step('RIDE', 'gesture in flight');
  }

  // No target to aim at — act on the intention when allowed, otherwise listen.
  if (input.targetRow === null) {
    if (!input.canFire) return step('LISTEN', 'nothing to aim at, and not free to fire');
    return step('ACT', `acting on ${input.intention} without a specific target`, { fire: true });
  }

  const rowsAway = input.targetRow - input.row;

  // The target has passed. Marking a hit after it has sounded is the timing
  // error this machine exists to avoid, so the performer lets it go.
  if (rowsAway < 0) {
    return step('LISTEN', 'the target has already sounded');
  }

  // Inside the lead-in: commit, then fire on the tick that reaches the target.
  if (rowsAway <= input.leadRows) {
    if (!input.canFire) {
      return step('PREPARE', `holding for the target ${rowsAway.toFixed(2)} rows ahead`);
    }
    // Close enough that the next tick would be late: act now.
    return step('ACT', `firing into the target ${rowsAway.toFixed(2)} rows ahead`, { fire: true });
  }

  return step('ANTICIPATE', `target ${rowsAway.toFixed(2)} rows ahead`);
}

function step(
  state: PerformanceState,
  reason: string,
  opts: { fire?: boolean; release?: boolean } = {},
): PerformanceStep {
  return {
    state,
    reason,
    shouldFire: opts.fire ?? false,
    shouldRelease: opts.release ?? false,
  };
}

/**
 * How far ahead the performer commits, in rows.
 *
 * A quarter of a beat: long enough that PREPARE is a real decision rather than
 * a formality, short enough that the music cannot change underneath it. Scaled
 * from the clock rather than fixed, so it means the same thing at speed 3 and
 * speed 6.
 */
export function defaultLeadRows(rowsPerBeat: number): number {
  return Math.max(0.25, rowsPerBeat / 4);
}
