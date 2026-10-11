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
  /** True while frames do not run (a hidden tab): a sweep nobody sees is not animated, it lands at once. */
  hidden?(): boolean;
}

export const browserSweepClock: SweepClock = {
  now: () => performance.now(),
  // A frame is the next animation frame, or 50 ms on the wall clock, whichever comes first: a sweep
  // never waits on a frame that a hidden or busy tab does not deliver.
  frame: (fn) => {
    let done = false;
    const run = (): void => { if (done) return; done = true; cancelAnimationFrame(raf); clearTimeout(timer); fn(); };
    const raf = requestAnimationFrame(run);
    const timer = setTimeout(run, 50);
    return () => { done = true; cancelAnimationFrame(raf); clearTimeout(timer); };
  },
  hidden: () => typeof document !== 'undefined' && document.hidden,
};

export interface CrossfaderSweeper {
  /** Sweeps from the last position written to `to` over `ms`; a sweep in flight is replaced. ms <= 0 jumps. */
  sweepTo(to: number, ms: number): void;
  cancel(): void;
  /**
   * Ends the sweep in flight: the fader lands on its target now (unless another writer moved it
   * since the sweep's last write, which is left alone). No sweep outlives the pattern that started it.
   */
  finish(): void;
}

export function createCrossfaderSweeper(read: () => number, write: (v: number) => void, clock: SweepClock = browserSweepClock): CrossfaderSweeper {
  let cancelFrame: (() => void) | null = null;
  let live: { to: number; written: () => number } | null = null;
  const cancel = (): void => { cancelFrame?.(); cancelFrame = null; live = null; };
  return {
    cancel,
    finish() {
      const sweep = live;
      cancel();
      if (sweep && Math.abs(read() - sweep.written()) <= 1e-6) write(sweep.to);
    },
    sweepTo(to, ms) {
      cancel();
      const from = read();
      if (!(ms > 0) || from === to || clock.hidden?.()) { write(to); return; }
      const start = clock.now();
      let written = from;
      const put = (v: number): void => { written = v; write(v); };
      const step = (): void => {
        // Another writer moved the fader since this sweep's last frame (the user's hand, a hand-back):
        // the sweep yields and never writes over it.
        if (Math.abs(read() - written) > 1e-6) { cancelFrame = null; live = null; return; }
        const t = Math.min(1, (clock.now() - start) / ms);
        if (t >= 1) { cancelFrame = null; live = null; put(to); return; }
        put(from + (to - from) * t);
        cancelFrame = clock.frame(step);
      };
      live = { to, written: () => written };
      put(from);
      cancelFrame = clock.frame(step);
    },
  };
}
