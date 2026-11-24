/**
 * trackerWatchdog — pure decision logic for the pattern-editor worker start.
 *
 * A worker that is still loading is not a failed worker. In dev, Vite
 * transforms the worker's whole module graph on demand; with the machine under
 * load that took longer than the old fixed 12 s clock (2026-11-25: page
 * DOMContentLoaded at 34.7 s, warm worker boot 0.66 s), and the clock raised
 * "worker never loaded" for a worker that was only slow. The main-thread
 * liveness meter could not see it: the slow process was Vite, not this tab.
 *
 * So failure is declared only on a real signal: the Worker `error` event
 * (also fired when the module script fetch fails), `messageerror`, or an
 * `error` reply from the worker. While the module loads the editor shows
 * "starting". The one clock left runs after the 'booting' heartbeat, when the
 * module is proven loaded and only GL init remains.
 */

export type WorkerStartState = 'loading' | 'booted' | 'ready' | 'failed';

export type WorkerStartEvent =
  | 'booting'   // worker module loaded and ran its top level
  | 'ready'     // GL/Canvas2D init done
  | 'error'     // Worker error event, messageerror, or an 'error' reply
  | 'deadline'; // the post-boot GL-init grace ran out

/** Grace for GL init after the worker has booted. */
export const GL_INIT_GRACE_MS = 30_000;

export function nextWorkerStartState(
  state: WorkerStartState,
  event: WorkerStartEvent,
): WorkerStartState {
  if (state === 'ready' || state === 'failed') return state;
  switch (event) {
    case 'ready': return 'ready';
    case 'error': return 'failed';
    case 'booting': return 'booted';
    // A clock is no failure signal while the module is still loading.
    case 'deadline': return state === 'booted' ? 'failed' : state;
  }
}
