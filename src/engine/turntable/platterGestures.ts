/**
 * The DJ deck's platter gestures as hand input to the ported two-body turntable model
 * (`turntableSim.ts`, owner decision O1; ledger SPINBACK-REWIND-LIVE-FAIL). The demo has no
 * spinback or rewind model, so each is what a DJ's hand does to the record - the hand path below -
 * and the model's platter servo, slipmat friction and record inertia shape everything the
 * listener hears: the catch, the turnaround through 0, the release, the motor taking the record
 * back. Hand angles are seconds of record at the reference rate (22,050 Hz samples).
 *
 * - Spinback: the hand catches the record and flicks it back 0.22 s of record in 0.1 s, lets go;
 *   the slipmat and the motor bring it round: about 0.6 s heard backward (down to about -2.3 x),
 *   back at speed by 1 s.
 * - Rewind: the selector catches the record (it slows), pulls it back one revolution of a 33 1/3
 *   record (1.8 s) in two uneven strokes with a re-grip between them, then holds it still until
 *   the restart. Nothing is a constant rate.
 */
import { simulate, trackAt, TT_RATE, type TtHandPoint, type TtSimResult } from './turntableSim';

const S = (sec: number): number => sec * TT_RATE;

export interface PlatterTrack {
  readonly sim: TtSimResult;
  readonly durSec: number;
  /** The record's speed (playback rate) at a time in the gesture. */
  rateAt(sec: number): number;
}

function track(hand: readonly TtHandPoint[], durSec: number, seed: number): PlatterTrack {
  const sim = simulate(hand, durSec, TT_RATE, { seed });
  return { sim, durSec, rateAt: (sec) => trackAt(sim, sim.recordVel, Math.max(0, Math.min(durSec, sec))) };
}

/** Spinback: 2 s of model time (the record is back at speed well before the end). */
export const SPINBACK_SEC = 2.0;
/** The hand's flick: catch at 60 ms, 0.22 s of record back by 160 ms, let go at 170 ms. */
export const SPINBACK_HAND = { catchSec: 0.06, flickEndSec: 0.16, releaseSec: 0.17, backSec: 0.22 } as const;

export function spinbackTrack(seed = 0): PlatterTrack {
  const D = SPINBACK_SEC, h = SPINBACK_HAND;
  return track([
    [0, 0, 1],
    [h.catchSec / D, 0, 1],
    [h.flickEndSec / D, S(-h.backSec), 1],
    [h.releaseSec / D, S(-h.backSec - 0.01), 0],
    [1, S(-h.backSec - 0.01), 0],
  ], D, seed);
}

/** The rewind pull: one revolution of record (1.8 s at 33 1/3), two strokes, a re-grip at 50-60 % of the pull. */
export const REWIND_HAND = { catchFrac: 0.15, catchSec: 0.05, firstStrokeFrac: 0.5, firstStrokeSec: 0.75, regripFrac: 0.6, regripSec: 0.82, pullBackSec: 1.8 } as const;

/** Rewind over `waitSec` (until the restart); the pull takes `pullSec` of it, then the hand holds the record. */
export function rewindTrack(pullSec: number, waitSec: number, seed = 0): PlatterTrack {
  const W = Math.max(waitSec, pullSec), P = pullSec, h = REWIND_HAND;
  return track([
    [0, 0, 1],
    [h.catchFrac * P / W, S(h.catchSec), 1],
    [h.firstStrokeFrac * P / W, S(-h.firstStrokeSec), 1],
    [h.regripFrac * P / W, S(-h.regripSec), 1],
    [P / W, S(-h.pullBackSec), 1],
    [1, S(-h.pullBackSec), 1],
  ], W, seed);
}
