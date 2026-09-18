import { describe, it, expect } from 'vitest';
import {
  EnergyLedger,
  MOVE_ENERGY,
  energyCostOf,
  scaleBudget,
  DEFAULT_ENERGY_BUDGET,
} from '../moveEnergy';
import { MOVES_FOR_TEST } from './moveIntentions.fixtures';

describe('move energy costs', () => {
  it('prices every move the router can fire', () => {
    const unpriced = MOVES_FOR_TEST.filter(id => !(id in MOVE_ENERGY));
    expect(unpriced).toEqual([]);
  });

  it('gives an unknown move a middling cost rather than a free ride', () => {
    const cost = energyCostOf('someFutureMove');
    expect(cost.wet).toBeGreaterThan(0);
    expect(cost.decaySec).toBeGreaterThan(0);
  });

  it('prices a wash far above a ping — the distinction the wet flag could not make', () => {
    expect(MOVE_ENERGY.springSlam.wet).toBeGreaterThan(MOVE_ENERGY.sonarPing.wet * 3);
  });

  it('charges nothing for moves that take sound away', () => {
    for (const moveId of ['channelMute', 'masterDrop', 'versionDrop', 'riddimSection']) {
      const cost = energyCostOf(moveId);
      expect(cost.wet, moveId).toBe(0);
      expect(cost.feedback, moveId).toBe(0);
    }
  });

  it('charges the low end where the headroom actually is', () => {
    expect(MOVE_ENERGY.subHarmonic.lowFrequencyRisk).toBeGreaterThan(0.5);
    expect(MOVE_ENERGY.subHarmonic.wet).toBeLessThan(0.3);
  });
});

describe('EnergyLedger — what is in the air', () => {
  it('counts a held move at full cost for as long as it is held', () => {
    const ledger = new EnergyLedger();
    ledger.add('g1', 'echoThrow', 0, true);
    expect(ledger.read(0).wet).toBeCloseTo(MOVE_ENERGY.echoThrow.wet, 6);
    // Still held ten seconds later: a hold does not fade.
    expect(ledger.read(10).wet).toBeCloseTo(MOVE_ENERGY.echoThrow.wet, 6);
  });

  it('fades a released move across its own decay, and reaches zero', () => {
    const ledger = new EnergyLedger();
    ledger.add('g1', 'echoThrow', 0, true);      // decaySec 4
    ledger.release('g1', 0);
    expect(ledger.read(0).wet).toBeCloseTo(0.55, 6);
    expect(ledger.read(2).wet).toBeCloseTo(0.275, 6);
    expect(ledger.read(4).wet).toBe(0);
    expect(ledger.activeIds()).toEqual([]);      // and is forgotten
  });

  it('starts a one-shot decaying at once', () => {
    const ledger = new EnergyLedger();
    ledger.add('g1', 'sonarPing', 0, false);     // decaySec 2
    expect(ledger.read(1).wet).toBeCloseTo(MOVE_ENERGY.sonarPing.wet / 2, 6);
    expect(ledger.read(2).wet).toBe(0);
  });

  it('sums what is in the air across several moves', () => {
    const ledger = new EnergyLedger();
    ledger.add('a', 'echoThrow', 0, true);
    ledger.add('b', 'sonarPing', 0, true);
    expect(ledger.read(0).wet).toBeCloseTo(
      MOVE_ENERGY.echoThrow.wet + MOVE_ENERGY.sonarPing.wet, 6,
    );
  });

  it('ignores a release for a move it never saw', () => {
    const ledger = new EnergyLedger();
    expect(() => ledger.release('ghost', 1)).not.toThrow();
    expect(ledger.read(1).wet).toBe(0);
  });

  it('only starts the fade once — a second release does not restart it', () => {
    const ledger = new EnergyLedger();
    ledger.add('g1', 'echoThrow', 0, true);
    ledger.release('g1', 0);
    ledger.release('g1', 3);
    expect(ledger.read(4).wet).toBe(0);
  });
});

describe('EnergyLedger — layering', () => {
  it('lets two cheap moves sit together, which the one-wet-per-bar rule refused', () => {
    const ledger = new EnergyLedger();
    ledger.add('a', 'sonarPing', 0, true);
    expect(ledger.admits('stereoDoubler', 0).ok).toBe(true);
  });

  it('refuses a dense combination and names the axis that refused it', () => {
    const ledger = new EnergyLedger();
    ledger.add('a', 'springSlam', 0, true);      // wet 0.80
    ledger.add('b', 'ghostReverb', 0, true);     // wet 0.75 — already over
    const verdict = ledger.admits('echoThrow', 0);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.axis).toBe('wet');
      expect(verdict.would).toBeGreaterThan(verdict.budget);
    }
  });

  it('refuses on the low end even when the wet budget is untouched', () => {
    const ledger = new EnergyLedger();
    ledger.add('a', 'subHarmonic', 0, true);     // lowFrequencyRisk 0.80
    const verdict = ledger.admits('subSwell', 0); // +0.75 → over 0.9
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.axis).toBe('lowFrequencyRisk');
  });

  it('admits again once the tail has decayed', () => {
    const ledger = new EnergyLedger();
    ledger.add('a', 'springSlam', 0, true);
    ledger.add('b', 'ghostReverb', 0, true);
    ledger.release('a', 0);
    ledger.release('b', 0);
    expect(ledger.admits('echoThrow', 0).ok).toBe(false);
    expect(ledger.admits('echoThrow', 6).ok).toBe(true);   // both fully decayed
  });

  it('always admits a move that takes sound away', () => {
    const ledger = new EnergyLedger();
    for (let i = 0; i < 5; i++) ledger.add(`x${i}`, 'springSlam', 0, true);
    expect(ledger.admits('channelMute', 0).ok).toBe(true);
    expect(ledger.admits('versionDrop', 0).ok).toBe(true);
  });

  it('is cleared outright on a song change', () => {
    const ledger = new EnergyLedger();
    ledger.add('a', 'springSlam', 0, true);
    ledger.clear();
    expect(ledger.read(0).wet).toBe(0);
  });
});

describe('budget scaling — personas differ in appetite, not in ceilings', () => {
  it('scales every axis together', () => {
    const tight = scaleBudget(DEFAULT_ENERGY_BUDGET, 0.5);
    expect(tight.wet).toBeCloseTo(DEFAULT_ENERGY_BUDGET.wet * 0.5, 6);
    expect(tight.feedback).toBeCloseTo(DEFAULT_ENERGY_BUDGET.feedback * 0.5, 6);
  });

  it('clamps so no persona can grant itself an unbounded budget', () => {
    expect(scaleBudget(DEFAULT_ENERGY_BUDGET, 99).wet)
      .toBeCloseTo(DEFAULT_ENERGY_BUDGET.wet * 1.5, 6);
    expect(scaleBudget(DEFAULT_ENERGY_BUDGET, 0).wet)
      .toBeCloseTo(DEFAULT_ENERGY_BUDGET.wet * 0.25, 6);
    expect(scaleBudget(DEFAULT_ENERGY_BUDGET, NaN).wet).toBe(DEFAULT_ENERGY_BUDGET.wet);
  });
});
