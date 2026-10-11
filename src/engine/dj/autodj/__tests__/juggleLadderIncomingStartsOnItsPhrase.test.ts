/**
 * Audit JA-m6 (thoughts/shared/research/2026-10-11_juggling-sonnet-work-audit.md, minor m6): a juggle
 * transition placed the incoming on any 4-bar group of its phrase grid, not on a phrase start, so a
 * ladder could start halfway through an 8-bar phrase and its 8-bar rungs straddle the incoming's
 * phrases. Owner juggling plan sections 9 and 41: trades respect phrase boundaries - the incoming
 * starts on one of its phrase starts and its phrases run with the ladder.
 */
import { describe, it, expect } from 'vitest';
import { corpusAnalysis } from '../testing/corpus';
import { planTransition, onPhraseStart, type TransitionPlanInput } from '../transitionPlanner';
import { barIndexAt } from '../beatGrid';
import { getStyle } from '../styleProfiles';
import { DJSessionMemory } from '../sessionMemory';
import type { DJTrackAnalysis } from '../types';

/** The incoming re-phrased into 8-bar phrases from its first bar; every phrase sure. */
function eightBarPhrases(a: DJTrackAnalysis): void {
  const bars = a.downbeats.bars;
  a.phrases = [];
  for (let b = 0; b + 8 <= bars.length; b += 8) {
    a.phrases.push({ index: a.phrases.length, start: bars[b].start, end: bars[b + 7].end, startBar: bars[b].index, lengthBars: 8, confidence: 0.9, sectionIndex: 0 });
  }
  a.phraseLengthBars = 8;
}

describe('JA-m6: a juggle transition starts the incoming on its phrase start', () => {
  it('a drop 16 bars after a mid-phrase bar does not pull the incoming onto bar 4 of an 8-bar phrase', () => {
    const o = structuredClone(corpusAnalysis('steady'));
    const i = structuredClone(corpusAnalysis('compatibleKey'));
    for (const p of o.phrases) p.confidence = 0.9;
    eightBarPhrases(i);
    // The incoming drop sits on bar 20: a 16-bar ladder landing on it would start on bar 4, mid-phrase.
    const bars = i.downbeats.bars;
    i.cuePoints.firstDrop = bars[20].start;
    const input: TransitionPlanInput = {
      outgoing: o, incoming: i, outgoingDeck: 'A', incomingDeck: 'B', outgoingPosition: 10, style: getStyle('Club'),
      creativeRisk: 0.6, memory: new DJSessionMemory().snapshot(), userBars: 8, withFilter: true, smartCuts: false,
      setPhase: 'PEAK', targetEnergy: 0.8, leadSec: 1, seed: 3, juggleMode: 'PERFORMER',
    };
    const p = planTransition(input);
    expect(p.style, p.reasons.join(' | ')).toBe('juggleTransition');
    const tradeBars = p.juggle!.tradeBeats / p.beatsPerBar;
    const startBar = bars[barIndexAt(i.downbeats, p.incomingPosition + 1e-3)].index;
    expect(startBar % 8, `incoming starts on bar ${startBar}`).toBe(0);
    expect(onPhraseStart(i, p.incomingPosition)).toBe(true);
    // The ladder spans whole 8-bar phrases: the release lands on a phrase start too.
    expect(tradeBars % 8).toBe(0);
    expect(onPhraseStart(i, p.incomingPosition + p.juggle!.tradeBeats * (60 / i.bpm))).toBe(true);
  });
});
