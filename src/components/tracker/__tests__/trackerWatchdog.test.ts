import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { watchdogStage1, watchdogStage2, MainThreadLiveness, LIVENESS_FLOOR } from '../trackerWatchdog';

describe('trackerWatchdog — pattern editor worker ready-watchdog', () => {
  // The bug: a worker that booted but was still finishing GL/shader init under
  // heavy startup contention got the scary "failed to start" dialog at the
  // deadline, even though it renders fine moments later. This asserts the
  // false-alarm no longer fires.
  it('does NOT report failure when the worker has booted but is not ready yet', () => {
    expect(watchdogStage1(/* booting */ true, /* ready */ false)).toEqual({ action: 'wait' });
  });

  it('reports a real failure when the worker never even booted', () => {
    expect(watchdogStage1(false, false)).toEqual({ action: 'error-never-loaded' });
  });

  it('does nothing once the worker is ready', () => {
    expect(watchdogStage1(true, true)).toEqual({ action: 'ok' });
    expect(watchdogStage1(false, true)).toEqual({ action: 'ok' });
  });

  it('stage 2: escalates to a stall error only if a booted worker never becomes ready', () => {
    expect(watchdogStage2(false)).toEqual({ action: 'error-stalled' });
    expect(watchdogStage2(true)).toEqual({ action: 'ok' });
  });
});

/**
 * The main thread cannot be believed about what it did not receive while it
 * was not running.
 *
 * Reported 2026-09-21: "Pattern editor failed to start (worker never loaded
 * after 12 s)", in a session whose own report said OffscreenCanvas and WebGL2
 * were both supported — while the message blamed exactly those. The worker's
 * 'booting' heartbeat is delivered by the main thread's event loop, so a thread
 * blocked by an 86 MB model load or a WASM compile sees no heartbeat whether
 * or not one was sent.
 */
describe('stage 1 with a stalled main thread', () => {
  it('still blames the worker when the main thread was running', () => {
    expect(watchdogStage1(false, false, 1)).toEqual({ action: 'error-never-loaded' });
  });

  it('waits instead of accusing when the main thread lost its own time', () => {
    expect(watchdogStage1(false, false, 0.2)).toEqual({ action: 'wait' });
  });

  it('holds the line exactly at the floor', () => {
    expect(watchdogStage1(false, false, LIVENESS_FLOOR)).toEqual({ action: 'error-never-loaded' });
    expect(watchdogStage1(false, false, LIVENESS_FLOOR - 0.01)).toEqual({ action: 'wait' });
  });

  it('assumes a healthy thread when nothing measured it', () => {
    // Keeps the original behaviour for every caller that passes two arguments.
    expect(watchdogStage1(false, false)).toEqual({ action: 'error-never-loaded' });
  });

  it('never overrides a worker that did answer', () => {
    // A stalled thread is not a reason to doubt a reply already in hand.
    expect(watchdogStage1(false, true, 0.1)).toEqual({ action: 'ok' });
    expect(watchdogStage1(true, false, 0.1)).toEqual({ action: 'wait' });
  });
});

describe('MainThreadLiveness', () => {
  it('reports a full share before the first tick is even due', () => {
    const live = new MainThreadLiveness(250);
    live.start(1000);
    expect(live.ratio(1100)).toBe(1);
  });

  it('reports the share of ticks that actually ran', () => {
    const live = new MainThreadLiveness(250);
    live.start(0);
    live.tickForTest(24);             // 24 of the 48 due in 12 s
    expect(live.ratio(12_000)).toBeCloseTo(0.5, 6);
  });

  it('calls a thread that ran everything healthy', () => {
    const live = new MainThreadLiveness(250);
    live.start(0);
    live.tickForTest(48);
    expect(live.ratio(12_000)).toBe(1);
    expect(watchdogStage1(false, false, live.ratio(12_000)))
      .toEqual({ action: 'error-never-loaded' });
  });

  it('never reports more than everything, however many ticks land', () => {
    const live = new MainThreadLiveness(250);
    live.start(0);
    live.tickForTest(500);
    expect(live.ratio(12_000)).toBe(1);
  });

  it('starts over on a restart', () => {
    const live = new MainThreadLiveness(250);
    live.start(0);
    live.tickForTest(48);
    live.start(0);
    expect(live.ratio(12_000)).toBe(0);
    live.stop();
  });

  it('stops cleanly, twice if asked', () => {
    const live = new MainThreadLiveness(250);
    live.start();
    expect(() => { live.stop(); live.stop(); }).not.toThrow();
  });
});

describe('the canvas measures it', () => {
  it('starts the meter with the timer and stops it on every way out', () => {
    const src = readFileSync(
      join(__dirname, '..', 'PatternEditorCanvas.tsx'), 'utf8',
    );
    expect(src).toContain('new MainThreadLiveness()');
    expect(src).toContain('liveness.start();');
    expect(src).toMatch(/watchdogStage1\(bootingReceived, readyReceived, mainThreadShare\)/);
    // ready, webgl-unsupported, worker error, onError, init throw, stage 1 ok,
    // stage 1 error, stage 2, unmount.
    expect((src.match(/liveness\.stop\(\)/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  it('records what the thread was doing, so the next report says which fault it was', () => {
    const src = readFileSync(
      join(__dirname, '..', 'PatternEditorCanvas.tsx'), 'utf8',
    );
    expect(src).toContain('mainThreadShare:');
  });
});
