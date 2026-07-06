/**
 * Leading + trailing throttle.
 *
 * Calls `fn` immediately on the first invocation, then at most once per `intervalMs`.
 * Any calls that arrive during the cool-down are coalesced into a single trailing call at
 * the end of the interval, so the final state is always applied. `fn` should read live
 * state at call time (it receives no arguments) — the coalesced trailing call runs `fn`
 * once with whatever the latest state is.
 *
 * Used to bound expensive, non-incremental recomputes driven by a high-frequency input
 * (e.g. a knob drag re-rendering a synth audition note on the main thread).
 *
 * `now` is injectable for deterministic tests; defaults to performance.now().
 */
export interface TrailingThrottle {
  (): void;
  /** Cancel any pending trailing call. */
  cancel(): void;
}

export function createTrailingThrottle(
  fn: () => void,
  intervalMs: number,
  now: () => number = () => performance.now(),
): TrailingThrottle {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = (): void => {
    last = now();
    timer = null;
    fn();
  };

  const throttled = (() => {
    const elapsed = now() - last;
    if (elapsed >= intervalMs) {
      run();
    } else if (timer === null) {
      timer = setTimeout(run, intervalMs - elapsed);
    }
    // else: a trailing call is already scheduled; fn reads live state when it fires.
  }) as TrailingThrottle;

  throttled.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return throttled;
}
