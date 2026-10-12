/**
 * Reachability (ledger SCR-P5.R5; owner scratch plan sections 12, 13, 88): through the Auto
 * Scratch controller's entry `DJScratchDJ.tick()` on two corpus contexts, the section 13
 * selector chooses the source - a breakdown gets a crate voice record, a house four-on-the-floor
 * transition the live deck - the planned events carry that source to the executor, and every
 * decision handed to the decision log carries its twelve score terms.
 */
import { describe, it, expect } from 'vitest';
import { DJScratchDJ } from '../scratch/DJScratchDJ';
import { scratchSourceStats, SOURCE_TERMS, type SourceDecision } from '../scratch/ScratchSourceSelector';
import { VOCAL_CATEGORIES } from '../scratch/scratchCatalogue';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { timeAtBeat, barStartBeat } from '../autodj/beatGrid';
import type { DJPerformanceContext, DJTrackAnalysis } from '../autodj/types';
import type { ScratchEvent } from '../scratch/scratchTypes';

const perfAt = (track: DJTrackAnalysis, t: number, over: Partial<DJPerformanceContext> = {}): DJPerformanceContext => ({
  currentDeck: 'A', currentTrack: track, incomingTrack: null, currentPosition: t, currentBeat: 0, currentBar: 0,
  timeRemainingSec: 100, setEnergy: 0.6, targetEnergy: 0.7, setPhase: 'CRUISING', candidateTracks: [], creativeRisk: 0.3, confidence: 0.8,
  ...over,
} as unknown as DJPerformanceContext);

/** A position in the last bar before the phrase that holds `bar`, so the tick plans that whole phrase. */
function beforePhraseOf(track: DJTrackAnalysis, bar: number): number {
  const phrase = track.phrases.find((p) => bar >= p.startBar && bar < p.startBar + p.lengthBars)!;
  return timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, phrase.startBar - 1)) + 0.05;
}

describe('Auto Scratch picks the source by context (SCR-P5.R5)', () => {
  it('breakdown -> a crate voice record; house transition -> the live deck; each decision carries its score terms', () => {
    const scheduled: ScratchEvent[][] = [];
    const decisions: SourceDecision[] = [];
    const refused: string[] = [];
    const ctrl = new DJScratchDJ({
      seed: 3,
      executorFor: () => ({ schedule: (e) => { scheduled[scheduled.length - 1]!.push(e); }, cancel: () => undefined, active: 0 }),
      onSourceDecision: (d) => decisions.push(d),
      onRefused: (_e, rule) => refused.push(rule),
    });
    const before = scratchSourceStats.select;

    const breakdowns = corpusAnalysis('breakdowns');
    const bdBar = breakdowns.sections.find((s) => s.kind === 'breakdown')!.startBar;
    scheduled.push([]);
    const r1 = ctrl.tick({ perf: perfAt(breakdowns, beforePhraseOf(breakdowns, bdBar)), deck: 'A', mode: 'PERFORMER', style: 'boomBap', scratchPermission: 1, genreHint: 'hipHop' });

    const steady = corpusAnalysis('steady');
    scheduled.push([]);
    const r2 = ctrl.tick({
      perf: perfAt(steady, beforePhraseOf(steady, 12), { transition: { style: 'longBlend', outgoingDeck: 'A', incomingDeck: 'B' } } as never),
      deck: 'A', mode: 'PERFORMER', style: 'electro', scratchPermission: 1, genreHint: 'house',
    });

    expect(r1.scheduled, r1.reason).toBeGreaterThan(0);
    expect(r2.scheduled, r2.reason).toBeGreaterThan(0);
    expect(scratchSourceStats.select - before).toBe(2);
    expect(refused, 'the governor refuses none of these phrases').toEqual([]);
    expect(decisions).toHaveLength(2);

    const [crate, deck] = decisions;
    expect(crate!.candidate.source.type).toBe('CRATE');
    expect(VOCAL_CATEGORIES).toContain(crate!.candidate.record!.category);
    expect(crate!.candidate.record!.category).not.toBe('FX');
    expect(scheduled[0]!.every((e) => e.source.type === 'CRATE')).toBe(true);

    expect(deck!.candidate.source.type).toBe('DECK');
    expect(scheduled[1]!.every((e) => e.source.type === 'DECK' && e.deck === 'A')).toBe(true);

    for (const d of decisions) {
      expect(Object.keys(d.terms).sort()).toEqual([...SOURCE_TERMS].sort());
      expect(d.reasons.length).toBeGreaterThanOrEqual(2);
    }
  }, 60_000);
});
