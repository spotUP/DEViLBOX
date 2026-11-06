import { describe, it, expect } from 'vitest';
import { makeRowClock, exactStepFromOnsets } from '../stepRowClock';

describe('stepRowClock', () => {
  it('round-trips every tick across two speed changes', () => {
    const clock = makeRowClock([{ tick: 0, speed: 10 }, { tick: 47, speed: 3 }, { tick: 100, speed: 7 }]);
    for (let t = 0; t < 400; t++) {
      const { row, offset } = clock.tickToRow(t);
      expect(clock.rowToTick(row, offset)).toBe(t);
      expect(offset).toBeLessThan(clock.speedAtTick(t));
    }
  });

  it('puts a speed change on its own row start', () => {
    const clock = makeRowClock([{ tick: 0, speed: 10 }, { tick: 47, speed: 3 }]);
    // rows 0..3 cover ticks 0..39, row 4 is the short row 40..46, the new speed starts row 5 at tick 47
    expect(clock.tickToRow(46)).toEqual({ row: 4, offset: 6 });
    expect(clock.tickToRow(47)).toEqual({ row: 5, offset: 0 });
    expect(clock.rowToTick(6)).toBe(50);
  });

  it('maps ticks at the row speed to whole rows and keeps remainders as offsets', () => {
    const clock = makeRowClock([{ tick: 0, speed: 10 }]);
    expect(clock.tickToRow(30)).toEqual({ row: 3, offset: 0 });
    expect(clock.tickToRow(34)).toEqual({ row: 3, offset: 4 });
    expect(clock.rowsForTicks(12161)).toBe(1217);
  });

  it('lets the last change at a tick win and ignores a repeat of the speed in force', () => {
    const clock = makeRowClock([{ tick: 0, speed: 6 }, { tick: 0, speed: 4 }, { tick: 8, speed: 4 }]);
    expect(clock.tickToRow(8)).toEqual({ row: 2, offset: 0 });
  });

  it('refuses a missing origin and a speed below 1', () => {
    expect(() => makeRowClock([])).toThrow();
    expect(() => makeRowClock([{ tick: 5, speed: 3 }])).toThrow();
    expect(() => makeRowClock([{ tick: 0, speed: 0 }])).toThrow();
  });
});

describe('exactStepFromOnsets (plan R4)', () => {
  it('is the GCD of every onset gap and of each voice first onset', () => {
    expect(exactStepFromOnsets([[0, 6, 18, 24], [12, 36]])).toBe(6);
    expect(exactStepFromOnsets([[6, 12]])).toBe(6);
  });
  it('is 1 when the gaps share no unit, and for no onsets', () => {
    expect(exactStepFromOnsets([[0, 6, 7]])).toBe(1);
    expect(exactStepFromOnsets([[]])).toBe(1);
  });
});
