/**
 * trackerWatchdog — pure decision logic for the pattern-editor worker
 * ready-watchdog.
 *
 * The OffscreenCanvas tracker worker can be slow to finish GL/shader init during
 * heavy app startup (86 MB CED ONNX model load, DSP/WASM compiles, worklet
 * spin-up). A worker that has posted its 'booting' heartbeat is ALIVE — any
 * remaining delay is init work, not a failure, and must not raise the scary
 * "failed to start" dialog. Only a worker that never sent 'booting' (module
 * never loaded) or one that booted but never became ready (GL init hung) is a
 * genuine error.
 *
 * Extracted as a pure function so the false-alarm case is regression-testable
 * without spinning up a real worker.
 */

export type WatchdogVerdict =
  | { action: 'ok' }               // ready arrived — nothing to do
  | { action: 'error-never-loaded' } // no boot heartbeat → worker module failed to load
  | { action: 'wait' }             // booted but not ready → alive-but-slow, extend grace
  | { action: 'error-stalled' };   // booted, grace elapsed, still not ready → GL init hung

/**
 * Below this share of its heartbeats, the main thread was too busy to be
 * believed about what it did or did not receive.
 *
 * 0.7 leaves room for ordinary startup jank while still calling a thread that
 * lost a third of a twelve-second window what it is: stalled.
 */
export const LIVENESS_FLOOR = 0.7;

/**
 * Stage-1 decision, evaluated after the initial timeout from the init post.
 * `ready` / `booting` reflect whether those worker replies have been received.
 *
 * `liveness` is the share of its own heartbeats the MAIN thread managed to run
 * during the window, 0..1. It matters because a worker's 'booting' message is
 * delivered by the main thread's event loop: if that loop was blocked — an
 * 86 MB model load, a WASM compile, a long synchronous import — the heartbeat
 * can be sitting in the queue, already sent, undelivered. The old check could
 * not tell that from a worker that never loaded, and reported a healthy worker
 * as a failure with a message blaming the browser's OffscreenCanvas support.
 * Seen 2026-09-21 in a session whose own report said OffscreenCanvas and WebGL2
 * were both supported.
 *
 * Absent evidence (the default) the main thread is assumed healthy, which keeps
 * the original behaviour for every caller that does not measure.
 */
export function watchdogStage1(
  booting: boolean,
  ready: boolean,
  liveness = 1,
): WatchdogVerdict {
  if (ready) return { action: 'ok' };
  if (booting) return { action: 'wait' };
  // No heartbeat — but only blame the worker if the thread that would have
  // delivered it was actually running.
  if (liveness < LIVENESS_FLOOR) return { action: 'wait' };
  return { action: 'error-never-loaded' };
}

/**
 * How much of the main thread's own time it actually got.
 *
 * A plain interval that counts how often it ran against how often it should
 * have. Cheap enough to leave on during startup, and it answers the only
 * question the watchdog needs: was this thread in a position to receive a
 * message at all?
 */
export class MainThreadLiveness {
  private startedAt = 0;
  private ticks = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;

  // A parameter property would be shorter; `erasableSyntaxOnly` forbids it.
  constructor(intervalMs = 250) {
    this.intervalMs = intervalMs;
  }

  start(now = Date.now()): void {
    this.stop();
    this.startedAt = now;
    this.ticks = 0;
    this.timer = setInterval(() => { this.ticks++; }, this.intervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Share of expected ticks that ran, clamped to 0..1. */
  ratio(now = Date.now()): number {
    const elapsed = now - this.startedAt;
    if (elapsed < this.intervalMs) return 1;   // too early to judge
    const expected = elapsed / this.intervalMs;
    return Math.max(0, Math.min(1, this.ticks / expected));
  }

  /** Test seam: record a tick without waiting for the timer. */
  tickForTest(n = 1): void {
    this.ticks += n;
  }
}

/**
 * Stage-2 decision, evaluated after the extended grace for an alive-but-slow
 * worker. Only reached when stage 1 returned `wait`.
 */
export function watchdogStage2(ready: boolean): WatchdogVerdict {
  return ready ? { action: 'ok' } : { action: 'error-stalled' };
}
