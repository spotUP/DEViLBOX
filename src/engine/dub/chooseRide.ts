/**
 * Deciding when the performer puts a hand on a fader and moves it.
 *
 * AutoDub could fire and hold, but it could not move a value OVER TIME — "the
 * autodub doesn't move any sliders only buttons" (2026-09-23). For a dub
 * performer that is the missing gesture, not a missing feature: the effects
 * live on aux sends, so the work is riding the sends and the return, and a
 * performer who only presses buttons is playing the desk like a drum machine.
 *
 * This is the fourth beat of the phrase the master plan already writes out:
 *
 *     snare -> echoThrow -> short send gesture -> FEEDBACK RIDE -> release
 *
 * Pure and seeded, exactly like `chooseMove`, so a test can drive it without a
 * bus, a transport or a browser.
 *
 * Plan: thoughts/shared/plans/2026-09-23-autodub-rides-the-faders.md
 * Specified by: 2026-09-17-dub-studio-master-implementation-plan.md (AI-03,
 * P7, DSP-08).
 */

import type { AutoDubPersonaId } from '@/stores/useDubStore';
import type { AutoDubPersona } from './AutoDubPersonas';

/** The shape a hand makes between one value and another. */
export type RideCurve = 'step' | 'linear' | 'ease';

/** What a ride may take hold of. */
export type RideTarget =
  | 'channelSend'
  | 'returnGain'
  | 'echoIntensity'
  | 'hpfCutoff'
  | 'springWet';

export interface AutoDubRide {
  /** Full parameter path, e.g. `dub.channelSend.ch3` or `dub.returnGain`. */
  param: string;
  /** Where to take it, normalised 0..1. */
  target: number;
  /** How long the journey takes, in BARS — musical, because everything else
   *  in this engine is, and a ride in milliseconds is wrong at every tempo
   *  but one. */
  bars: number;
  curve: RideCurve;
  /**
   * Does the hand come BACK?
   *
   * Almost always yes, and the first version got this wrong. A ride that only
   * travels leaves its parameter wherever the journey ended, and a few minutes
   * of that walks the whole desk into a corner — measured 2026-09-23 with the
   * high-pass parked at 410 Hz, which takes the entire low end out of the dub
   * send and leaves the bus sounding dead.
   *
   * The master plan's own phrase says so: `snare -> echoThrow -> short send
   * gesture -> feedback ride -> RELEASE`. A dub gesture is an excursion. You
   * sweep the filter up and you bring it back.
   */
  returns: boolean;
}

/**
 * How each persona rides.
 *
 * The curve comes from the master plan's DSP-08 character matrix, which
 * already assigns HPF as `stepped` for Tubby and `continuous` for Scientist,
 * Perry and Mad Professor. Extending that same distinction is better than
 * writing a second personality table that can disagree with the first.
 *
 * What is deliberately NOT here: cadence and depth. Those are derived below
 * from `minBarsBetweenFires`, `variance` and `intensityDefault`, which the
 * personas already carry. Perry's `variance: 0.35` and `minBarsBetweenFires:
 * 0.25` already say "erratic and frequent"; Jammy's `3.0` already says
 * "sparse". Restating that here would be a second source of truth for one
 * fact.
 */
const RIDE_TARGETS: Record<AutoDubPersonaId, { targets: RideTarget[]; curve: RideCurve }> = {
  // Decisive and precise — `variance: 0`. The Big Knob, in positions.
  tubby: { targets: ['hpfCutoff', 'channelSend'], curve: 'step' },
  // Long builds; `densityBias: 0.5` — comes alive as notes pile up.
  scientist: { targets: ['returnGain', 'echoIntensity'], curve: 'ease' },
  // Erratic. Short, frequent, and reaching for the spring.
  perry: { targets: ['channelSend', 'springWet'], curve: 'ease' },
  // Lush swells.
  madProfessor: { targets: ['returnGain', 'springWet'], curve: 'ease' },
  // Sparse — `minBarsBetweenFires: 3`, `densityBias: -0.6`.
  jammy: { targets: ['channelSend'], curve: 'ease' },
  // Whatever the user has dialled in. Rides gently, but it still reaches for
  // the return: a persona whose only target is the send can never move a
  // control the performer can SEE, which is how the default persona went a
  // whole session without twisting a knob (2026-09-23).
  custom: { targets: ['channelSend', 'returnGain'], curve: 'linear' },
};

/** Bars between rides, from the persona's own firing cadence. */
function rideCadence(persona: AutoDubPersona): number {
  // A ride occupies the hand for longer than a stab, so it is rarer than a
  // fire. Twice the persona's own gap, floored so nothing rides every bar.
  const fireGap = persona.minBarsBetweenFires ?? 1.0;
  return Math.max(2, fireGap * 2);
}

/** How long a ride takes, from how settled the persona is. */
function rideLength(persona: AutoDubPersona): number {
  // A steady hand travels further before it arrives; a jittery one does not
  // commit. `variance` is exactly that number and already tuned.
  const variance = persona.variance ?? 0;
  return Math.max(1, Math.round(8 - variance * 16));
}

/** How far from the resting value a ride may travel. */
function rideDepth(persona: AutoDubPersona, intensity: number): number {
  // Intensity is the performer's own "how busy am I" control, so it scales
  // the reach rather than a separate depth knob.
  const base = persona.intensityDefault ?? 0.5;
  return Math.max(0.15, Math.min(0.9, (base + intensity) / 2));
}

export interface RideTickCtx {
  bar: number;
  isNewBar: boolean;
  intensity: number;
  persona: AutoDubPersona;
  /** Bar the last ride started on, or null if none yet. */
  lastRideBar: number | null;
  /** Channels that exist, for a `channelSend` ride to pick from. */
  channelCount: number;
  /** Parameters the performer's own hand is on. A ride never fights it. */
  heldParams: ReadonlySet<string>;
  /** Current value per parameter, 0..1, for deciding where to ride TO. */
  currentValue: (param: string) => number | null;
}

/**
 * Decide whether to start a ride this tick, and what it should be.
 *
 * Returns null far more often than not — a performer whose hands are always
 * moving is not a performer, and REST is a real decision in this engine
 * (master plan, AI-05).
 */
export function chooseRide(ctx: RideTickCtx, rng: () => number): AutoDubRide | null {
  // Rides begin on a bar line. Starting one mid-bar is how a gesture ends up
  // arriving at a musically meaningless moment.
  if (!ctx.isNewBar) return null;

  const { persona } = ctx;
  const cadence = rideCadence(persona);
  if (ctx.lastRideBar !== null && ctx.bar - ctx.lastRideBar < cadence) return null;

  // Intensity is the throttle: at zero the performer rests.
  if (rng() > ctx.intensity) return null;

  const config = RIDE_TARGETS[persona.id as AutoDubPersonaId] ?? RIDE_TARGETS.custom;
  const choice = config.targets[Math.floor(rng() * config.targets.length)] ?? config.targets[0];
  const param = resolveParam(choice, ctx, rng);
  if (!param) return null;

  // Never take a control the performer has a hand on.
  if (ctx.heldParams.has(param)) return null;

  const current = ctx.currentValue(param);
  if (current === null) return null;

  const depth = rideDepth(persona, ctx.intensity);
  return {
    param,
    target: rideDestination(current, depth, rng, param),
    bars: rideLength(persona),
    curve: config.curve,
    // Everything comes back except one case: a send that started nearly
    // CLOSED. Opening a silent channel into the echo and leaving it open is a
    // real dub decision, and the performer's own fader is what undoes it.
    //
    // A send that was already open does NOT get left wherever the ride ended.
    // That was the first version's rule for every send, and it is how the desk
    // walked itself quiet: each ride nudged a send and kept the new position,
    // so the sends drifted and never came home.
    returns: !param.startsWith('dub.channelSend.') || current >= SEND_LEAVE_OPEN_BELOW,
  };
}

/** A ride target becomes a concrete parameter path. */
function resolveParam(target: RideTarget, ctx: RideTickCtx, rng: () => number): string | null {
  if (target !== 'channelSend') return `dub.${target}`;
  if (ctx.channelCount <= 0) return null;
  return `dub.channelSend.ch${Math.floor(rng() * ctx.channelCount)}`;
}

/**
 * Where to ride to.
 *
 * Away from where it is, by up to `depth`, and always somewhere reachable.
 * A ride that lands on the value it started from is a hand that moved for
 * nothing.
 */
function rideDestination(current: number, depth: number, rng: () => number, param?: string): number {
  const headroomUp = 1 - current;
  const headroomDown = current;
  // Travel in whichever direction has room; prefer the roomier side so a
  // parameter already at an extreme rides back rather than pressing against
  // the rail.
  let up = headroomUp >= headroomDown ? rng() < 0.75 : rng() < 0.25;

  // A dub SEND is not symmetric, and it only ever rides UP.
  //
  // The send is the bus's INPUT. Riding it down does not make a gesture — it
  // takes away the signal the echo and the spring are working on, so every
  // move fired afterwards lands on less and less material. Measured twice on
  // 2026-09-23: `dub.channelSend.ch0 0.567 -> 0.129` and `ch2 0.567 -> 0.163`,
  // after which the owner reported hearing no throws at all and called the
  // personas passive. Turning a channel DOWN is a performer's decision with
  // its own moves (channelMute, versionDrop); it is not something a background
  // ride does to the input it depends on.
  //
  // The first fix only caught sends already below 0.35, which is why it did
  // not hold: 0.567 is a perfectly ordinary resting position and rode straight
  // down through it.
  if (param?.startsWith('dub.channelSend.')) up = true;
  const room = up ? headroomUp : headroomDown;
  const distance = Math.min(depth, room) * (0.5 + rng() * 0.5);
  const next = up ? current + distance : current - distance;
  return Math.max(0, Math.min(1, next));
}

/**
 * The ceiling a MACHINE-driven ride may take a parameter to.
 *
 * Lower than the performer's own reach on the wet return. Removing the return
 * governor on 2026-09-23 was right — it was holding the wet 18 dB down and
 * making every move inaudible — but nothing downstream now catches a return
 * ridden to 1.0 against an already-saturating bus. The machine should be more
 * cautious than the hand, not less.
 */
/**
 * Below this, a send counts as CLOSED, and a ride that opens it may leave it
 * open. At or above it the send is part of the current mix, and a ride
 * borrows it rather than resetting where it rests.
 */
const SEND_LEAVE_OPEN_BELOW = 0.2;

export const MACHINE_RIDE_CEILING: Readonly<Record<string, number>> = {
  'dub.returnGain': 0.85,
  'dub.echoIntensity': 0.9,
  // 20 + 0.25 * 980 = 265 Hz. The high-pass is the Big Knob, and sweeping it
  // up is the gesture — but the dub send exists to put LOW END into the echo,
  // so parking it high guts the bus. Measured at 410 Hz on 2026-09-23 with the
  // owner reporting "the desk is almost dead". Tubby's own position in the
  // character matrix is 100 Hz.
  'dub.hpfCutoff': 0.25,
};

/** Apply the machine's own ceiling to a ride target. */
export function clampRide(ride: AutoDubRide): AutoDubRide {
  const ceiling = MACHINE_RIDE_CEILING[ride.param];
  if (ceiling === undefined || ride.target <= ceiling) return ride;
  return { ...ride, target: ceiling };
}
