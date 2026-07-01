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
 * Stage-1 decision, evaluated after the initial timeout from the init post.
 * `ready` / `booting` reflect whether those worker replies have been received.
 */
export function watchdogStage1(booting: boolean, ready: boolean): WatchdogVerdict {
  if (ready) return { action: 'ok' };
  if (!booting) return { action: 'error-never-loaded' };
  return { action: 'wait' };
}

/**
 * Stage-2 decision, evaluated after the extended grace for an alive-but-slow
 * worker. Only reached when stage 1 returned `wait`.
 */
export function watchdogStage2(ready: boolean): WatchdogVerdict {
  return ready ? { action: 'ok' } : { action: 'error-stalled' };
}
