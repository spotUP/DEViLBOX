/**
 * The executors' injectable clock (tests pass a fake; production uses `realTimers`). Kept in its
 * own module with no imports: it used to live in transitionExecutor, whose imports pull the whole
 * app (DJActions, the pad router, the dub engine), so importing a timer type loaded ~700 modules
 * (scratch audit SA-M7).
 */

export interface ExecutorTimers {
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export const realTimers: ExecutorTimers = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};
