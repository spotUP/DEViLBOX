import { describe, it, expect } from 'vitest';
import {
  bassEmphasisShape,
  bassEmphasisHeadroom,
  bassEmphasisEase,
  BASS_EMPHASIS_MIN_DB,
  BASS_EMPHASIS_MAX_DB,
  UNMEASURED_HEADROOM,
  type BassEmphasisInput,
} from '../bassEmphasisShape';
import { DEFAULT_ENERGY_BUDGET, MOVE_ENERGY } from '../moveEnergy';

const input = (over: Partial<BassEmphasisInput> = {}): BassEmphasisInput => ({
  register: 'sub',
  bassEmphasisTarget: 0.95,
  headroom: 1,
  ...over,
});

describe('bassEmphasisShape — how much', () => {
  it('stays inside the plan\'s +2 to +4 dB, whatever it is handed', () => {
    for (const headroom of [-5, 0, 0.3, 1, 99, Number.NaN]) {
      for (const target of [0, 0.6, 0.8, 1]) {
        const s = bassEmphasisShape(input({ headroom, bassEmphasisTarget: target }));
        expect(s.gainDb, `headroom ${headroom} target ${target}`)
          .toBeGreaterThanOrEqual(BASS_EMPHASIS_MIN_DB);
        expect(s.gainDb).toBeLessThanOrEqual(BASS_EMPHASIS_MAX_DB);
      }
    }
  });

  it('asks for less when the low end is already spent — the budget sets the amount', () => {
    const roomy = bassEmphasisShape(input({ headroom: 1 })).gainDb;
    const tight = bassEmphasisShape(input({ headroom: 0.1 })).gainDb;
    expect(tight).toBeLessThan(roomy);
  });

  it('is not a constant — two different budgets give two different lifts', () => {
    const a = bassEmphasisShape(input({ headroom: 0.2 })).gainDb;
    const b = bassEmphasisShape(input({ headroom: 0.8 })).gainDb;
    expect(Math.abs(a - b)).toBeGreaterThan(0.5);
  });

  it('lifts a channel that barely reads as bass least of all', () => {
    const certain = bassEmphasisShape(input({ bassEmphasisTarget: 1 })).gainDb;
    const marginal = bassEmphasisShape(input({ bassEmphasisTarget: 0.61 })).gainDb;
    expect(marginal).toBeLessThan(certain);
    expect(marginal).toBeCloseTo(BASS_EMPHASIS_MIN_DB, 1);
  });
});

describe('bassEmphasisShape — how low', () => {
  it('puts the corner where the material is', () => {
    expect(bassEmphasisShape(input({ register: 'sub' })).freqHz).toBe(80);
    expect(bassEmphasisShape(input({ register: 'low' })).freqHz).toBe(95);
    expect(bassEmphasisShape(input({ register: 'lowMid' })).freqHz).toBe(120);
  });

  it('sits in the middle of the plan\'s range when the register is a guess', () => {
    const hz = bassEmphasisShape(input({ register: null })).freqHz;
    expect(hz).toBeGreaterThanOrEqual(80);
    expect(hz).toBeLessThanOrEqual(120);
  });

  it('never leaves the 80 to 120 Hz range, even for a register that is not low', () => {
    for (const register of ['mid', 'highMid', 'high'] as const) {
      const hz = bassEmphasisShape(input({ register })).freqHz;
      expect(hz, register).toBeGreaterThanOrEqual(80);
      expect(hz, register).toBeLessThanOrEqual(120);
    }
  });
});

describe('bassEmphasisShape — the low-mid cleanup', () => {
  it('takes out less than it puts in, so the gesture is a lift and not a tilt', () => {
    const s = bassEmphasisShape(input());
    expect(s.cleanupDb).toBeGreaterThan(0);
    expect(s.cleanupDb).toBeLessThan(s.gainDb);
  });

  it('is capped, so a big lift cannot hollow the mix out', () => {
    const s = bassEmphasisShape(input({ headroom: 1, bassEmphasisTarget: 1 }));
    expect(s.cleanupDb).toBeLessThanOrEqual(2.5);
  });
});

describe('bassEmphasisShape — how long', () => {
  it('keeps the gesture inside the plan\'s one to two bars', () => {
    for (const bars of [-3, 0, 1, 1.5, 2, 40]) {
      const s = bassEmphasisShape(input({ holdBars: bars }));
      expect(s.holdBars, `${bars}`).toBeGreaterThanOrEqual(1);
      expect(s.holdBars, `${bars}`).toBeLessThanOrEqual(2);
    }
  });

  it('leaves a sustain between the two eases rather than easing the whole time', () => {
    const s = bassEmphasisShape(input({ holdBars: 2 }));
    expect(s.attackBars + s.releaseBars).toBeLessThan(s.holdBars);
  });
});

describe('bassEmphasisHeadroom — the amount comes from the energy budget', () => {
  it('reads full with nothing in the air, less the move\'s own cost', () => {
    const free = bassEmphasisHeadroom({ lowFrequencyRisk: 0 });
    const expected = (DEFAULT_ENERGY_BUDGET.lowFrequencyRisk - MOVE_ENERGY.bassEmphasis.lowFrequencyRisk)
      / DEFAULT_ENERGY_BUDGET.lowFrequencyRisk;
    expect(free).toBeCloseTo(expected, 6);
  });

  it('reads zero once the low end is full', () => {
    expect(bassEmphasisHeadroom({ lowFrequencyRisk: DEFAULT_ENERGY_BUDGET.lowFrequencyRisk })).toBe(0);
  });

  it('never assumes an empty low end when it cannot see the ledger', () => {
    expect(UNMEASURED_HEADROOM).toBeLessThan(1);
    expect(UNMEASURED_HEADROOM).toBeGreaterThan(0);
  });

  it('falls as a subSwell decays into it', () => {
    const before = bassEmphasisHeadroom({ lowFrequencyRisk: 0 });
    const during = bassEmphasisHeadroom({ lowFrequencyRisk: MOVE_ENERGY.subSwell.lowFrequencyRisk });
    expect(during).toBeLessThan(before);
  });
});

describe('bassEmphasisEase', () => {
  it('starts at rest and arrives at rest — no corner at either end', () => {
    expect(bassEmphasisEase(0)).toBe(0);
    expect(bassEmphasisEase(1)).toBe(1);
    expect(bassEmphasisEase(0.5)).toBeCloseTo(0.5, 6);
    // Slope near the ends is shallower than in the middle.
    const nearStart = bassEmphasisEase(0.05) - bassEmphasisEase(0);
    const middle = bassEmphasisEase(0.55) - bassEmphasisEase(0.5);
    expect(nearStart).toBeLessThan(middle);
  });

  it('clamps rather than overshooting', () => {
    expect(bassEmphasisEase(-1)).toBe(0);
    expect(bassEmphasisEase(4)).toBe(1);
  });
});
