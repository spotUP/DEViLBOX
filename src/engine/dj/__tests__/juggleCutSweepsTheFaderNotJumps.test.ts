import { describe, it, expect, vi } from 'vitest';
import { useDJStore } from '@/stores/useDJStore';
import { createDeckJuggleSink } from '../autodj/juggle/juggleDeckSink';
import { createCrossfaderSweeper, JUGGLE_CUT_SWEEP_MS, type SweepClock } from '../autodj/juggle/crossfaderSweep';

function fakeClock() {
  let t = 0; let pending: (() => void) | null = null;
  const clock: SweepClock = { now: () => t, frame: (fn) => { pending = fn; return () => { if (pending === fn) pending = null; }; } };
  const tick = (ms: number): void => { t += ms; const f = pending; pending = null; f?.(); };
  return { clock, tick };
}

describe('a juggle cut sweeps the crossfader through its positions instead of jumping 0 to 1', () => {
  it('writes intermediate positions, rising, and lands exactly on the target', () => {
    const { clock, tick } = fakeClock();
    let pos = 0; const written: number[] = [];
    const sw = createCrossfaderSweeper(() => pos, (v) => { pos = v; written.push(v); }, clock);
    sw.sweepTo(1, JUGGLE_CUT_SWEEP_MS);
    for (let i = 0; i < 6; i++) tick(8);
    expect(written.length).toBeGreaterThan(3);
    expect(written.some((v) => v > 0.05 && v < 0.95)).toBe(true);
    expect([...written].sort((a, b) => a - b)).toEqual(written);
    expect(written[written.length - 1]).toBe(1);
  });

  it('a new sweep replaces one in flight; a zero length jumps (the old behaviour is still reachable)', () => {
    const { clock, tick } = fakeClock();
    let pos = 0;
    const sw = createCrossfaderSweeper(() => pos, (v) => { pos = v; }, clock);
    sw.sweepTo(1, 100); tick(20);
    sw.sweepTo(0, 100); tick(100); tick(10);
    expect(pos).toBe(0);
    sw.sweepTo(1, 0);
    expect(pos).toBe(1);
  });

  it('a stand-alone hand-back that sets the fader while the release sweep runs is never written over (the sweep yields)', () => {
    const { clock, tick } = fakeClock();
    let pos = 0.5; const written: number[] = [];
    const sw = createCrossfaderSweeper(() => pos, (v) => { pos = v; written.push(v); }, clock);
    sw.sweepTo(0, JUGGLE_CUT_SWEEP_MS);
    pos = 0.2; // another writer (the hand-back, the user's hand) moves the fader directly
    for (let i = 0; i < 6; i++) tick(8);
    expect(pos).toBe(0.2);
    expect(written).toEqual([0.5]);
  });
});

describe('no sweep outlives the pattern, and none waits on a frame a hidden tab does not deliver (audit m2)', () => {
  it('finish() lands the sweep in flight on its target at once; a fader another writer moved is left alone', () => {
    const { clock, tick } = fakeClock();
    let pos = 0;
    const sw = createCrossfaderSweeper(() => pos, (v) => { pos = v; }, clock);
    sw.sweepTo(1, 100); tick(20);
    expect(pos).toBeGreaterThan(0); expect(pos).toBeLessThan(1);
    sw.finish();
    expect(pos).toBe(1);
    tick(200);
    expect(pos).toBe(1);
    sw.sweepTo(0, 100); tick(20);
    pos = 0.7; // the user's hand
    sw.finish();
    expect(pos).toBe(0.7);
  });

  it('a hidden tab (no frames) lands the sweep at once instead of stalling at the start position', () => {
    const { clock } = fakeClock();
    let pos = 0;
    const sw = createCrossfaderSweeper(() => pos, (v) => { pos = v; }, { ...clock, hidden: () => true });
    sw.sweepTo(1, JUGGLE_CUT_SWEEP_MS);
    expect(pos).toBe(1);
  });

  it('the juggle sink ends a cut sweep in flight when the executor restores (completed, aborted or handed back)', () => {
    vi.useFakeTimers();
    try {
      useDJStore.getState().setCrossfader(0);
      const sink = createDeckJuggleSink();
      sink.apply({ type: 'CutIn', deck: 'B', executeAtBeat: 0, reason: 'test' }, { beatSec: 0.5, beatNow: 0, patternBeat: 0 });
      expect(useDJStore.getState().crossfaderPosition).toBeLessThan(1);
      sink.restore!();
      expect(useDJStore.getState().crossfaderPosition).toBe(1);
    } finally { vi.useRealTimers(); }
  });
});
