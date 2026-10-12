/**
 * Deterministic planner (owner scratch plan section 66; SCR-P4.13). The conservative rules (the vocal, a
 * low beat confidence) govern the DEViLBOX extras only: the demo's own strokes play as planned (P13).
 */
import { describe, it, expect } from 'vitest';
import { planScratch } from '../scratchPlanner';
import { getGesture } from '../scratchGestureCatalog';
import { scenarioContext } from './fixtures/scenarioContext';

const base = { style: 'battle' as const, kind: 'instrumental' as const, bpm: 100, energy: 0.8 };
const run = (ctxOver: Partial<Parameters<typeof scenarioContext>[0]>, seed: number, mode: 'MUSICAL' | 'PERFORMER' | 'BATTLE' = 'BATTLE', bars = 16, routine: 'auto' | null = 'auto', densityShift = 0) =>
  planScratch(scenarioContext({ permission: 4, ...base, ...ctxOver }), { mode, seed, fromBar: 16, bars, routine, densityShift });
const demoKeys = (p: ReturnType<typeof run>) => p.events.filter((e) => e.layer === 'demo').map((e) => `${e.bar}:${e.step}:${e.gesture}:${e.velocity}`);
const level = (events: { gesture: Parameters<typeof getGesture>[0] }[]) => Math.max(0, ...events.map((e) => getGesture(e.gesture).difficulty));

describe('the planner is deterministic and conservative (SCR-P4.13)', () => {
  it('the same seed and context give identical events; a different seed gives valid but different ones', () => {
    const a = run({}, 5), b = run({}, 5), c = run({}, 6);
    expect(a.events.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
    expect(c.events).not.toEqual(a.events);
    // valid: the demo's own validation finds nothing it would repair
    for (const p of [a, c]) expect(p.issues.filter((i) => /too busy|same gesture/.test(i))).toEqual([]);
  });

  it('a high-energy section (showcase 1.0) reaches a higher maximum level than a low one (verse 0.2), from the demo section energy', () => {
    let hi = 0, lo = 0, loBars = 0;
    for (let seed = 1; seed <= 60; seed++) {
      hi += level(run({ kind: 'instrumental' }, seed, 'BATTLE', 16, null).events);
      const v = run({ kind: 'verse' }, seed, 'BATTLE', 16, null).events;
      if (v.length) { lo += level(v); loBars++; }
    }
    expect(loBars).toBeGreaterThan(0);
    expect(hi / 60).toBeGreaterThan(lo / loBars);
  });

  it('a vocal-heavy bar thins the extras only: the demo\'s strokes play under the vocal', () => {
    let quiet = 0, vocal = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const q = run({ style: 'boomBap', kind: 'verse', vocal: 0 }, seed, 'PERFORMER', 16, null, 1), v = run({ style: 'boomBap', kind: 'verse', vocal: 0.9 }, seed, 'PERFORMER', 16, null, 1);
      expect(demoKeys(v), `seed ${seed}`).toEqual(demoKeys(q));
      quiet += q.events.filter((e) => e.layer === 'extra').length;
      vocal += v.events.filter((e) => e.layer === 'extra').length;
    }
    expect(quiet).toBeGreaterThan(0);
    expect(vocal).toBeLessThan(quiet * 0.5);
  });

  it('beat confidence 0.4 plays as SAFE: extras at level 1 only, the demo\'s strokes and routine as planned', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = run({ beatConfidence: 0.4 }, seed, 'BATTLE', 16, 'auto', 1);
      expect(p.mode).toBe('SAFE');
      expect(demoKeys(p)).toEqual(demoKeys(run({}, seed)));
      for (const e of p.events.filter((x) => x.layer === 'extra')) expect(getGesture(e.gesture).difficulty, e.gesture).toBe(1);
    }
    expect(run({ beatConfidence: 0.4 }, 3).reasons.join(' ')).toMatch(/beat confidence 0\.40/);
  });

  it('no permission, no scratching', () => {
    const p = run({ permission: 0 }, 1);
    expect(p.mode).toBe('OFF');
    expect(p.events).toEqual([]);
  });
});
