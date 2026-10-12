/** Opportunity finder (owner scratch plan sections 8, 24, 47, 51; DoD 1; ledger SCR-P6.11). */
import { describe, it, expect } from 'vitest';
import { corpusAnalysis } from '../../autodj/testing/corpus';
import { buildScratchContext } from '../scratchContext';
import { findOpportunity } from '../scratchOpportunity';
import { fixturePerf } from './fixtures/analysisFixture';
import { timeAtBeat, barStartBeat } from '../../autodj/beatGrid';

describe('opportunity finder (SCR-P6.11)', () => {
  const a = corpusAnalysis('steady');
  const ctxAt = (bar: number) => buildScratchContext({ perf: fixturePerf(a, timeAtBeat(a.beatGrid, barStartBeat(a.downbeats, bar)) + 0.05), style: 'boomBap', scratchPermission: 1 })!;

  it('the last bar of every phrase is an opportunity', () => {
    const lastBars = a.phrases.map((p) => p.startBar + p.lengthBars - 1).filter((b) => b < 30);
    expect(lastBars.length).toBeGreaterThanOrEqual(2);
    for (const bar of lastBars) {
      const o = findOpportunity(ctxAt(bar));
      expect(o, `bar ${bar}`).not.toBeNull();
      expect(['phraseEnd', 'dropApproach', 'breakdownEntry', 'outgoingPhraseEnd']).toContain(o!.kind);
      expect(o!.maxLevel).toBeGreaterThan(1);
    }
  });

  it('with beat confidence under 0.6 only a level-1 accent is offered', () => {
    for (let bar = 0; bar < 24; bar++) {
      const o = findOpportunity({ ...ctxAt(bar), beatConfidence: 0.5 });
      if (o) { expect(o.maxLevel).toBe(1); expect(o.role).toBe('ACCENT'); }
    }
    const end = a.phrases[0]!.startBar + a.phrases[0]!.lengthBars - 1;
    expect(findOpportunity({ ...ctxAt(end), beatConfidence: 0.5 })!.maxLevel).toBe(1);
  });

  it('a vocal call that just ended is answered', () => {
    const o = findOpportunity({ ...ctxAt(5), vocalActivity: 0.2 }, { previousBarVocal: 0.9 });
    expect(o).toMatchObject({ kind: 'vocalCall', role: 'ANSWER' });
  });
});
