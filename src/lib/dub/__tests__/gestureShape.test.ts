/**
 * Gate F4 — the shapes a held gesture can trace.
 *
 * `ramp` and `sweep` were left unimplemented rather than faked when the
 * gesture engine shipped: they describe a parameter moving under the player's
 * hand, and no move could accept a parameter mid-flight. These pin the curve
 * itself, which is the part that has nothing to do with audio.
 */

import { describe, it, expect } from 'vitest';
import {
  shapePosition,
  shapeValue,
  shapeProgress,
  shapeProgressFrom,
  SHAPE_TICK_MS,
} from '../gestureShape';

describe('ramp — travels once and stays at the far end', () => {
  it('starts where it started and ends where it was aimed', () => {
    expect(shapePosition('ramp', 0)).toBe(0);
    expect(shapePosition('ramp', 1)).toBe(1);
  });

  it('is halfway across at halfway through', () => {
    expect(shapePosition('ramp', 0.5)).toBeCloseTo(0.5, 6);
  });
});

describe('sweep — travels and comes back', () => {
  it('turns at the halfway point', () => {
    expect(shapePosition('sweep', 0.5)).toBeCloseTo(1, 6);
  });

  it('ends where it started, which is what makes it a sweep and not a ramp', () => {
    expect(shapePosition('sweep', 0)).toBeCloseTo(0, 6);
    expect(shapePosition('sweep', 1)).toBeCloseTo(0, 6);
  });

  it('is symmetric about the turn', () => {
    for (const d of [0.1, 0.2, 0.35]) {
      expect(shapePosition('sweep', 0.5 - d)).toBeCloseTo(shapePosition('sweep', 0.5 + d), 6);
    }
  });
});

describe('progress outside the hold is clamped, never extrapolated', () => {
  it('a late tick does not push the value past the target', () => {
    expect(shapePosition('ramp', 1.4)).toBe(1);
    expect(shapePosition('ramp', -0.2)).toBe(0);
  });

  it('a nonsense progress reads as the start rather than NaN', () => {
    expect(shapePosition('ramp', NaN)).toBe(0);
    expect(shapePosition('sweep', NaN)).toBe(0);
  });

  it('an overdue tick lands at the END of the shape, not back at its start', () => {
    // A late timer must not snap a finished ramp back open. For a sweep, the
    // end and the start are the same value by definition — that is the shape,
    // not a clamp failure.
    expect(shapePosition('ramp', Infinity)).toBe(1);
    expect(shapeValue('ramp', Infinity, 20000, 200)).toBe(200);
  });
});

describe('shapeValue — the number handed to the move', () => {
  it('maps a ramp across the range', () => {
    expect(shapeValue('ramp', 0, 20000, 200)).toBe(20000);
    expect(shapeValue('ramp', 1, 20000, 200)).toBe(200);
  });

  it('a sweep returns to the value it left', () => {
    expect(shapeValue('sweep', 1, 20000, 200)).toBeCloseTo(20000, 6);
  });

  it('exponential puts the midpoint at the geometric mean, where the ear puts it', () => {
    // 20 kHz down to 200 Hz: linear says 10.1 kHz, which is barely a change to
    // listen to. Exponential says 2 kHz — three octaves down, half the travel.
    expect(shapeValue('ramp', 0.5, 20000, 200, 'linear')).toBeCloseTo(10100, 0);
    expect(shapeValue('ramp', 0.5, 20000, 200, 'exponential')).toBeCloseTo(2000, 0);
  });

  it('falls back to linear rather than producing NaN when an end is zero', () => {
    const v = shapeValue('ramp', 0.5, 1, 0, 'exponential');
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeCloseTo(0.5, 6);
  });

  it('handles a range that travels upward', () => {
    expect(shapeValue('ramp', 1, 200, 20000, 'exponential')).toBeCloseTo(20000, 0);
  });
});

describe('shapeProgress — a hold whose end is not known has no progress', () => {
  it('refuses to invent one', () => {
    expect(shapeProgress(500, 0)).toBeNull();
    expect(shapeProgress(500, -1)).toBeNull();
  });

  it('reports the fraction of the hold elapsed', () => {
    expect(shapeProgress(500, 2000)).toBeCloseTo(0.25, 6);
    expect(shapeProgress(4000, 2000)).toBe(1);
  });
});

describe('tick rate', () => {
  it('is a knob, not an LFO — fine enough to sound continuous, cheap enough to run', () => {
    expect(SHAPE_TICK_MS).toBeGreaterThanOrEqual(10);
    expect(SHAPE_TICK_MS).toBeLessThanOrEqual(40);
  });
});

describe('shapeProgressFrom — extending a hold slows the travel, never reverses it', () => {
  it('stays where it was at the moment of the change', () => {
    expect(shapeProgressFrom(0.5, 0, 1500)).toBeCloseTo(0.5, 6);
  });

  it('spreads what is left over the time that is left', () => {
    // Half done, 1500 ms remaining: 750 ms later it should be three quarters
    // through, not half of the new total.
    expect(shapeProgressFrom(0.5, 750, 1500)).toBeCloseTo(0.75, 6);
  });

  it('still lands exactly on 1 at the new end', () => {
    expect(shapeProgressFrom(0.5, 1500, 1500)).toBe(1);
    expect(shapeProgressFrom(0.9, 200, 200)).toBe(1);
  });

  it('never goes backwards, whatever the new duration', () => {
    for (const remaining of [1, 100, 5000, 60000]) {
      expect(shapeProgressFrom(0.6, 0, remaining)).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('has no progress to report when no time remains', () => {
    expect(shapeProgressFrom(0.5, 100, 0)).toBeNull();
  });
});
