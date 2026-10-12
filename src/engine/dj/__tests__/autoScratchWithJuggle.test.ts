/**
 * Scratch beside a running juggle (owner scratch plan sections 26, 49; ledger SCR-P7.9), through
 * the controller's entry `DJScratchDJ.tick()` with `juggleActive` (what DJAutoDJ.scratchTick passes
 * while the juggle controller performs): the decks are the juggle's - every scratch event is a crate
 * record on the record voice, only answers and accents, never a feature; no scratch gesture touches
 * the crossfader (the juggle sink owns it); the same set without a juggle plays its full phrases.
 */
import { describe, it, expect } from 'vitest';
import { DJScratchDJ } from '../scratch/DJScratchDJ';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { timeAtBeat, barStartBeat } from '../autodj/beatGrid';
import { fieldsTouchedBy } from '../scratch/scratchSnapshot';
import { getGesture } from '../scratch/scratchGestureCatalog';
import type { DJPerformanceContext } from '../autodj/types';
import type { ScratchEvent } from '../scratch/scratchTypes';

function run(juggleActive: boolean) {
  const track = corpusAnalysis('steady');
  const events: ScratchEvent[] = [];
  const ctrl = new DJScratchDJ({ seed: 4, executorFor: () => ({ schedule: (e) => { events.push(e); }, cancel: () => {}, active: 0 }) });
  for (let b = 0; b < track.downbeats.bars.length - 1; b++) for (const f of [0.1, 0.6]) {
    const t = timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, b)) + f;
    ctrl.tick({
      perf: { currentDeck: 'A', currentTrack: track, incomingTrack: null, currentPosition: t, setPhase: 'PEAK', setEnergy: 0.8, targetEnergy: 0.9 } as unknown as DJPerformanceContext,
      deck: 'A', mode: 'PERFORMER', style: 'electro', genreHint: 'house', scratchPermission: 2, juggleActive,
    });
  }
  return { events, ctrl };
}

describe('scratch beside a juggle (SCR-P7.9)', () => {
  it('under a juggle: crate records only, answers and accents only, no feature, never the crossfader', () => {
    const { events, ctrl } = run(true);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.source.type, e.gesture).toBe('CRATE');
      if (e.gesture !== 'drop' && e.gesture !== 'dropPhrase') expect(['ANSWER', 'ACCENT']).toContain(e.role);
      expect(fieldsTouchedBy(e.source.type, getGesture(e.gesture).faderWindows)).not.toContain('crossfader');
    }
    expect(ctrl.states.history.some((h) => h.to === 'FEATURE')).toBe(false);
  });

  it('without a juggle the same set plays its full phrases (the restriction belongs to the juggle)', () => {
    const { events } = run(false);
    expect(events.some((e) => e.gesture !== 'drop' && e.gesture !== 'dropPhrase' && e.role !== 'ANSWER' && e.role !== 'ACCENT')).toBe(true);
  });
});
