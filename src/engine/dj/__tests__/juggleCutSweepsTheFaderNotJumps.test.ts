import { describe, it, expect } from 'vitest';
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
});
