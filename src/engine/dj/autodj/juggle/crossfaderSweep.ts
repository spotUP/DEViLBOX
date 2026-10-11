/**
 * A juggle crossfader move is a sweep of the fader, not a jump.
 *
 * A hand cutting a deck in moves the fader fast through every position between
 * the two ends; a 0/1 jump sounds like a switch and shows nothing on the
 * on-screen fader. The sweep writes the intermediate positions to the one
 * crossfader path (the store, which the mixer follows, so the fader is seen to
 * move and the active curve shapes the gains). Scratch fader cuts are a
 * separate path (their 2 ms mixer ramp) and are untouched.
 */

/** A cut, a cut-in or a hold: one fast hand. Owner-tunable by ear. */
export const JUGGLE_CUT_SWEEP_MS = 30;

export interface SweepClock {
  now(): number;
  /** Calls fn on the next frame; returns a cancel function. */
  frame(fn: () => void): () => void;
}

export const browserSweepClock: SweepClock = {
  now: () => performance.now(),
  frame: (fn) => { const id = requestAnimationFrame(fn); return () => cancelAnimationFrame(id); },
};

export interface CrossfaderSweeper {
  /** Sweeps from the last position written to `to` over `ms`; a sweep in flight is replaced. ms <= 0 jumps. */
  sweepTo(to: number, ms: number): void;
  cancel(): void;
}

export function createCrossfaderSweeper(read: () => number, write: (v: number) => void, clock: SweepClock = browserSweepClock): CrossfaderSweeper {
  let cancelFrame: (() => void) | null = null;
  const cancel = (): void => { cancelFrame?.(); cancelFrame = null; };
  return {
    cancel,
    sweepTo(to, ms) {
      cancel();
      const from = read();
      if (!(ms > 0) || from === to) { write(to); return; }
      const start = clock.now();
      const step = (): void => {
        const t = Math.min(1, (clock.now() - start) / ms);
        if (t >= 1) { cancelFrame = null; write(to); return; }
        write(from + (to - from) * t);
        cancelFrame = clock.frame(step);
      };
      write(from);
      cancelFrame = clock.frame(step);
    },
  };
}
