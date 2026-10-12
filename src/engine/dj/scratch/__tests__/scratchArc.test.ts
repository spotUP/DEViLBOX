/** The performance arc (owner scratch plan sections 29, 30, 74; ledger SCR-P6.1-P6.3). */
import { describe, it, expect } from 'vitest';
import { FEATURE_ARC, UP_ROUGH_ARC, scaleArc, arcForSection, planArc, phaseAt } from '../scratchArc';
import { getGesture } from '../scratchGestureCatalog';
import { validatePhrase, oneHandConflicts } from '../scratchPlacement';

describe('arc template (SCR-P6.1)', () => {
  it('the 9 phases of both templates cover bars 0-32 exactly once', () => {
    for (const t of [FEATURE_ARC, UP_ROUGH_ARC]) {
      expect(t.phases).toHaveLength(9);
      const cover = Array(32).fill(0);
      for (const p of t.phases) for (let b = p.startBar; b < p.startBar + p.bars; b++) cover[b]++;
      expect(cover.every((c) => c === 1)).toBe(true);
    }
    expect(UP_ROUGH_ARC.phases.map((p) => p.name)).toEqual(['establish', 'build', 'develop', 'callResponse', 'intensify', 'feature', 'peak', 'burst', 'resolution']);
  });

  it('scaleArc(16) keeps the order and the ratios; 64 doubles every phase; 8 keeps the order', () => {
    const s16 = scaleArc(FEATURE_ARC, 16);
    expect(s16.phases.map((p) => p.name)).toEqual(FEATURE_ARC.phases.map((p) => p.name));
    s16.phases.forEach((p, i) => expect(Math.abs(p.startBar - FEATURE_ARC.phases[i]!.startBar / 2)).toBeLessThanOrEqual(0.5));
    expect(s16.phases.reduce((a, p) => a + p.bars, 0)).toBe(16);
    const s64 = scaleArc(FEATURE_ARC, 64);
    s64.phases.forEach((p, i) => expect(p.bars).toBe(FEATURE_ARC.phases[i]!.bars * 2));
    const s8 = scaleArc(FEATURE_ARC, 8);
    const order = FEATURE_ARC.phases.map((p) => p.name);
    expect(s8.phases.map((p) => order.indexOf(p.name))).toEqual([...s8.phases.map((p) => order.indexOf(p.name))].sort((a, b) => a - b));
    expect(s8.phases.reduce((a, p) => a + p.bars, 0)).toBe(8);
  });
});

describe('the arc follows the set (SCR-P6.2, section 30)', () => {
  it('the 8 mappings', () => {
    expect(arcForSection('intro', 'OPENING')).toMatchObject({ role: 'sparse', density: 'low', level: 1, template: null });
    expect(arcForSection('build', 'BUILDING')).toMatchObject({ role: 'more', density: 'medium', level: 2 });
    expect(arcForSection('drop', 'CRUISING')).toMatchObject({ role: 'shortFeature', bars: 4, density: 'high', level: 3 });
    expect(arcForSection('groove', 'CRUISING')).toMatchObject({ role: 'accents', density: 'veryLow', template: null });
    expect(arcForSection('breakdown', 'RELEASE')).toMatchObject({ role: 'space', density: 'low' });
    expect(arcForSection('build', 'PEAKING')).toMatchObject({ role: 'escalation', bars: 8, density: 'high', level: 3 });
    expect(arcForSection('drop', 'PEAK')).toMatchObject({ role: 'peakBurst', bars: 32, density: 'showcase', level: 4 });
    expect(arcForSection('outro', 'CLOSING')).toMatchObject({ role: 'resolution', density: 'veryLow', level: 1 });
  });
});

describe('a 32-bar feature (SCR-P6.3, section 74)', () => {
  for (const [style, mode] of [['battle', 'BATTLE'], ['electro', 'PERFORMER'], ['boomBap', 'MUSICAL']] as const) {
    it(`${style} ${mode}: the 9 phases in order, the level climbs to the peak, >= 4 genuine rests, a resolution in bar 31`, () => {
      for (let seed = 1; seed <= 10; seed++) {
        const p = planArc({ arc: FEATURE_ARC, startBar: 64, style, mode, seed });
        const order = [...new Set(p.phaseByBar)];
        expect(order).toEqual(['establish', 'build', 'call', 'response', 'develop', 'feature', 'peak', 'burst', 'resolution']);
        // the highest level each phase reaches never falls before the peak
        const maxLevel = (name: string) => Math.max(0, ...p.events.filter((e) => e.phase === name).map((e) => getGesture(e.gesture).difficulty));
        const climb = ['establish', 'build', 'call', 'response', 'develop', 'feature', 'peak'].map(maxLevel);
        for (let i = 1; i < climb.length; i++) expect(climb[i]!, `seed ${seed} ${climb.join(',')}`).toBeGreaterThanOrEqual(climb[i - 1]!);
        expect(p.emptyBars.length, `seed ${seed}`).toBeGreaterThanOrEqual(4);
        expect(p.events.some((e) => e.bar === 64 + 31 && e.role === 'OUTRO' && e.phase === 'resolution'), `seed ${seed}`).toBe(true);
        expect(oneHandConflicts(p.events)).toBe(0);
        const bars = Array.from({ length: 32 }, (_, i) => p.events.filter((e) => e.bar === 64 + i));
        expect(validatePhrase(bars)).toEqual([]);
      }
    });
  }

  it('phaseAt resolves a bar to its phase', () => {
    expect(phaseAt(FEATURE_ARC, 0)!.name).toBe('establish');
    expect(phaseAt(FEATURE_ARC, 31)!.name).toBe('resolution');
    expect(phaseAt(FEATURE_ARC, 32)).toBeNull();
  });
});
