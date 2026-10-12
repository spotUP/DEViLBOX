/**
 * The executors' injectable clock (tests pass a fake; production uses `realTimers`). Kept in its
 * own module with no imports: it used to live in transitionExecutor, whose imports pull the whole
 * app (DJActions, the pad router, the dub engine), so importing a timer type loaded ~700 modules
 * (scratch audit SA-M7).
 *
 * `realTimers` ticks from a dedicated worker, not the page's own timers: a hidden tab's main-thread
 * setInterval/setTimeout are clamped to >= 1 s (Chrome intensive throttling), which started scratch
 * strokes, Auto DJ transitions and juggles up to a second late whenever the DJ switched tabs
 * (scratch audit SA-m4). A worker's timers are not clamped, and the message it posts back is a
 * plain task the hidden page still runs. Where no Worker exists (tests, SSR) the page timers are
 * used, looked up at call time so fake timers keep working.
 */

export interface ExecutorTimers {
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

/** What the timer worker receives. */
export type TimerWorkerRequest =
  | { op: 'set'; id: number; ms: number; repeat: boolean }
  | { op: 'clear'; id: number };

/** The worker side: runs the timers the page asks for and posts each due id back. */
export const TIMER_WORKER_SOURCE = `
const timers = new Map();
onmessage = (e) => {
  const d = e.data;
  if (d.op === 'set') {
    const run = () => { postMessage(d.id); if (!d.repeat) timers.delete(d.id); };
    timers.set(d.id, { h: d.repeat ? setInterval(run, d.ms) : setTimeout(run, d.ms), repeat: d.repeat });
  } else {
    const t = timers.get(d.id);
    if (t) { if (t.repeat) clearInterval(t.h); else clearTimeout(t.h); timers.delete(d.id); }
  }
};
`;

/** The page's handle on the timer worker (a Worker, or a test double). */
export interface TimerPort {
  postMessage(msg: TimerWorkerRequest): void;
  onmessage: ((e: { data: unknown }) => void) | null;
}

const pageNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const pageTimers: ExecutorTimers = {
  now: pageNow,
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (id) => globalThis.clearInterval(id as ReturnType<typeof setInterval>),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

function openTimerWorker(): TimerPort | null {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined'
    || typeof URL.createObjectURL !== 'function') return null;
  try {
    const url = URL.createObjectURL(new Blob([TIMER_WORKER_SOURCE], { type: 'text/javascript' }));
    return new Worker(url) as unknown as TimerPort;
  } catch {
    return null;
  }
}

/** Ids handed out by worker timers, so they never collide with a page timer's id. */
class WorkerTimerId {
  readonly n: number;
  constructor(n: number) { this.n = n; }
}

/**
 * Timers driven by the port `open` returns (opened on first use); when it returns null, the
 * page's own timers.
 */
export function createWorkerTimers(open: () => TimerPort | null): ExecutorTimers {
  let port: TimerPort | null | undefined;
  let nextId = 1;
  const pending = new Map<number, { fn: () => void; repeat: boolean }>();

  const getPort = (): TimerPort | null => {
    if (port !== undefined) return port;
    port = open();
    if (port) {
      port.onmessage = (e) => {
        const id = e.data as number;
        const t = pending.get(id);
        if (!t) return; // cleared after the worker fired
        if (!t.repeat) pending.delete(id);
        t.fn();
      };
    }
    return port;
  };

  const set = (fn: () => void, ms: number, repeat: boolean): unknown => {
    const p = getPort();
    if (!p) return repeat ? pageTimers.setInterval(fn, ms) : pageTimers.setTimeout(fn, ms);
    const id = nextId++;
    pending.set(id, { fn, repeat });
    p.postMessage({ op: 'set', id, ms: Math.max(0, ms), repeat });
    return new WorkerTimerId(id);
  };

  const clear = (handle: unknown, repeat: boolean): void => {
    if (handle instanceof WorkerTimerId) {
      if (!pending.delete(handle.n)) return;
      port?.postMessage({ op: 'clear', id: handle.n });
      return;
    }
    if (handle == null) return;
    if (repeat) pageTimers.clearInterval(handle); else pageTimers.clearTimeout(handle);
  };

  return {
    now: pageNow,
    setInterval: (fn, ms) => set(fn, ms, true),
    clearInterval: (id) => clear(id, true),
    setTimeout: (fn, ms) => set(fn, ms, false),
    clearTimeout: (id) => clear(id, false),
  };
}

/** The one timer layer every DJ executor (scratch, Auto DJ transitions, juggles) runs on. */
export const realTimers: ExecutorTimers = createWorkerTimers(openTimerWorker);
