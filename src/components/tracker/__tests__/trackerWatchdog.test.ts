import { describe, it, expect } from 'vitest';
import { watchdogStage1, watchdogStage2 } from '../trackerWatchdog';

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
