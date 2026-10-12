/**
 * SA-m4: a hidden tab clamps the page's own setInterval/setTimeout to >= 1 s, which started
 * scratch strokes, Auto DJ transitions and juggles up to a second late. The DJ executors' one
 * timer layer (`realTimers`) must keep its requested period while the page timers are clamped.
 *
 * The page timers are replaced by clamped ones (what a hidden tab does); the Worker global is a
 * double that runs the real TIMER_WORKER_SOURCE on unclamped timers (what a worker keeps).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TimerFn = (fn: () => void, ms: number) => unknown;

describe('DJ timers in a hidden tab', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function loadUnderHiddenTab() {
    // The worker's own clock: the timers as they are before the page clamps them.
    const workerClock = {
      setInterval: globalThis.setInterval.bind(globalThis) as unknown as TimerFn,
      setTimeout: globalThis.setTimeout.bind(globalThis) as unknown as TimerFn,
      clearInterval: globalThis.clearInterval.bind(globalThis) as (id: unknown) => void,
      clearTimeout: globalThis.clearTimeout.bind(globalThis) as (id: unknown) => void,
    };
    const clamp = (f: TimerFn): TimerFn => (fn, ms) => f(fn, Math.max(1000, ms));
    vi.stubGlobal('setInterval', clamp(workerClock.setInterval));
    vi.stubGlobal('setTimeout', clamp(workerClock.setTimeout));

    const { TIMER_WORKER_SOURCE } = await import('../executorTimers');
    let workersOpened = 0;
    class FakeWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      private readonly deliver: (e: { data: unknown }) => void;
      constructor() {
        workersOpened++;
        const post = (data: unknown): void => { this.onmessage?.({ data }); };
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const boot = new Function('postMessage', 'setInterval', 'setTimeout', 'clearInterval', 'clearTimeout',
          `let onmessage; ${TIMER_WORKER_SOURCE}; return onmessage;`);
        this.deliver = boot(post, workerClock.setInterval, workerClock.setTimeout,
          workerClock.clearInterval, workerClock.clearTimeout) as (e: { data: unknown }) => void;
      }
      postMessage(data: unknown): void { this.deliver({ data }); }
    }
    vi.stubGlobal('Worker', FakeWorker);
    if (typeof URL.createObjectURL !== 'function') {
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:dj-timers' }));
    }
    const mod = await import('../executorTimers');
    return { realTimers: mod.realTimers, workersOpened: () => workersOpened };
  }

  it('a 5 ms executor tick keeps ticking every 5 ms while the page timers are clamped to 1 s', async () => {
    const { realTimers, workersOpened } = await loadUnderHiddenTab();
    let ticks = 0;
    const id = realTimers.setInterval(() => { ticks++; }, 5);
    vi.advanceTimersByTime(100);
    expect(ticks).toBe(20);
    realTimers.clearInterval(id);
    vi.advanceTimersByTime(100);
    expect(ticks).toBe(20);
    expect(workersOpened()).toBe(1);
  });

  it('a 15 ms wait (Auto DJ waits for the grid moment) resolves in 15 ms, not 1 s', async () => {
    const { realTimers } = await loadUnderHiddenTab();
    let fired = 0;
    realTimers.setTimeout(() => { fired++; }, 15);
    vi.advanceTimersByTime(14);
    expect(fired).toBe(0);
    vi.advanceTimersByTime(1);
    expect(fired).toBe(1);
    vi.advanceTimersByTime(100);
    expect(fired).toBe(1);
  });

  it('a cleared wait never fires', async () => {
    const { realTimers } = await loadUnderHiddenTab();
    let fired = 0;
    const id = realTimers.setTimeout(() => { fired++; }, 15);
    realTimers.clearTimeout(id);
    vi.advanceTimersByTime(100);
    expect(fired).toBe(0);
  });

  it('without a Worker the page timers are used (tests, SSR), looked up at call time', async () => {
    vi.stubGlobal('Worker', undefined);
    const { realTimers } = await import('../executorTimers');
    let ticks = 0;
    const id = realTimers.setInterval(() => { ticks++; }, 10);
    vi.advanceTimersByTime(50);
    expect(ticks).toBe(5);
    realTimers.clearInterval(id);
  });
});
