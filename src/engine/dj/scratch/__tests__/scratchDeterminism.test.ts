/** Deterministic planner (owner scratch plan section 66; SCR-P4.13). */
import { describe, it, expect } from 'vitest';
import { planScratch } from '../scratchPlanner';
import { validatePhrase } from '../scratchPlacement';
import { getGesture } from '../scratchGestureCatalog';
import { scenarioContext } from './fixtures/scenarioContext';

const base = { style: 'battle' as const, kind: 'instrumental' as const, bpm: 100, energy: 0.8 };
const run = (ctxOver: Partial<Parameters<typeof scenarioContext>[0]>, seed: number, mode: 'MUSICAL' | 'BATTLE' = 'BATTLE', bars = 16, routines = true) =>
  planScratch(scenarioContext({ ...base, ...ctxOver }), { mode, seed, fromBar: 16, bars, routines });
const level = (events: { gesture: Parameters<typeof getGesture>[0] }[]) => Math.max(0, ...events.map((e) => getGesture(e.gesture).difficulty));

describe('the planner is deterministic and conservative (SCR-P4.13)', () => {
  it('the same seed and context give identical events; a different seed gives valid but different ones', () => {
    const a = run({}, 5), b = run({}, 5), c = run({}, 6);
    expect(a.events.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
    expect(c.events).not.toEqual(a.events);
    expect(validatePhrase(c.bars)).toEqual([]);
    expect(validatePhrase(a.bars)).toEqual([]);
  });

  it('high energy reaches a higher maximum level than low energy', () => {
    let hi = 0, lo = 0;
    for (let seed = 1; seed <= 30; seed++) {
      hi += level(run({ energy: 1.0 }, seed, 'BATTLE', 16, false).events);
      lo += level(run({ energy: 0.1 }, seed, 'BATTLE', 16, false).events);
    }
    expect(hi).toBeGreaterThan(lo);
  });

  it('a vocal-heavy bar plans fewer events', () => {
    let quiet = 0, vocal = 0;
    for (let seed = 1; seed <= 30; seed++) {
      quiet += run({ vocal: 0 }, seed).events.length;
      vocal += run({ vocal: 0.9 }, seed).events.length;
    }
    expect(vocal).toBeLessThan(quiet * 0.5);
  });

  it('beat confidence 0.4 plays level 1 only, no routine, and behaves as SAFE', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = run({ beatConfidence: 0.4 }, seed);
      expect(p.mode).toBe('SAFE');
      expect(p.routine).toBeUndefined();
      for (const e of p.events) expect(getGesture(e.gesture).difficulty, e.gesture).toBe(1);
    }
    expect(run({ beatConfidence: 0.4 }, 3).reasons.join(' ')).toMatch(/beat confidence 0\.40/);
  });

  it('no permission, no scratching', () => {
    const p = run({ permission: 0 }, 1);
    expect(p.mode).toBe('OFF');
    expect(p.events).toEqual([]);
  });
});
