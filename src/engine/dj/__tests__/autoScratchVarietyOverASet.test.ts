/**
 * Auto Scratch keeps its vocabulary over a set (owner report 2026-10-12: "only baby scratches";
 * owner scratch plan sections 21, 22, 38/39, 53, 54). Measured before the fix over five corpus
 * tracks in MUSICAL: electro and techno played one gesture (chirp) for every phrase (the palette's
 * bias inside the mode's level left a single gesture), cooldowns removed a gesture for a whole
 * window, and a crate record refused the gestures it does not take (silence). Through the
 * controller's entry `DJScratchDJ.tick()`, per genre route: >= 3 performed gestures, no phrase of
 * more than 3 events on one gesture (section 21), and every crate event playable by its record.
 */
import { describe, it, expect } from 'vitest';
import { DJScratchDJ } from '../scratch/DJScratchDJ';
import { corpusAnalysis, type CorpusId } from '../autodj/testing/corpus';
import { timeAtBeat, barStartBeat } from '../autodj/beatGrid';
import { getScratchRecord } from '../scratch/scratchCatalogue';
import { scratchStyleFor } from '../scratch/scratchStyles';
import type { DJPerformanceContext } from '../autodj/types';
import type { ScratchEvent } from '../scratch/scratchTypes';
import { planVocabulary, MIN_VOCABULARY } from '../scratch/scratchPlacement';
import { SCRATCH_DJ_STYLES } from '../scratch/scratchTypes';

const TRACKS: CorpusId[] = ['steady', 'vocals', 'drops', 'breakdowns', 'longIntro'];
const isThrow = (e: ScratchEvent) => e.gesture === 'drop' || e.gesture === 'dropPhrase';

function simulate(genre: string, mode: 'MUSICAL' | 'PERFORMER') {
  const performed: ScratchEvent[] = [];
  const windows: ScratchEvent[][] = [];
  let unplayable = 0;
  for (const id of TRACKS) {
    const track = corpusAnalysis(id);
    const choice = scratchStyleFor('auto', genre);
    const ctrl = new DJScratchDJ({
      seed: 9,
      executorFor: () => ({ schedule: (e) => {
        if (e.source.type === 'CRATE' && !isThrow(e) && !getScratchRecord(e.source.recordId)!.gestures.includes(e.gesture)) unplayable++;
        if (!isThrow(e)) performed.push(e);
      }, cancel: () => {}, active: 0 }),
      // phrase reconstruction stabs the words of a phrase in sequence: its variety is the words (section 37)
      onPlan: (p, events) => { if (p.routine !== 'phraseReconstruction') windows.push(events.filter((e) => !isThrow(e))); },
    });
    for (let b = 0; b < track.downbeats.bars.length - 1; b++) for (const f of [0.1, 0.6]) {
      const t = timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, b)) + f;
      ctrl.tick({
        perf: { currentDeck: 'A', currentTrack: track, incomingTrack: null, currentPosition: t, setPhase: 'CRUISING', setEnergy: 0.6, targetEnergy: 0.7 } as unknown as DJPerformanceContext,
        deck: 'A', mode, style: choice.style, genre: choice.modifiers, genreHint: choice.genre, scratchPermission: 2,
      });
    }
  }
  return { performed, windows, unplayable };
}

describe('Auto Scratch varies its gestures over a set', () => {
  it('every palette in every mode plans from at least 3 gestures (electro in MUSICAL was chirp alone)', () => {
    for (const style of SCRATCH_DJ_STYLES) for (const mode of ['SAFE', 'MUSICAL', 'PERFORMER', 'BATTLE'] as const) {
      expect(planVocabulary(style, mode).length, `${style} ${mode}: ${planVocabulary(style, mode).join(', ')}`).toBeGreaterThanOrEqual(MIN_VOCABULARY);
    }
  });

  for (const genre of ['techno', 'electro', 'house', 'hipHop', 'downtempo', 'drumAndBass']) {
    it(`${genre}, MUSICAL: >= 3 gestures, no one-gesture phrase over 3 events, every crate event playable`, () => {
      const { performed, windows, unplayable } = simulate(genre, 'MUSICAL');
      expect(performed.length).toBeGreaterThan(20);
      const distinct = new Set(performed.map((e) => e.gesture));
      expect(distinct.size, [...distinct].join(', ')).toBeGreaterThanOrEqual(3);
      for (const w of windows) if (w.length > 3) expect(new Set(w.map((e) => e.gesture)).size, w.map((e) => e.gesture).join(' ')).toBeGreaterThan(1);
      expect(unplayable).toBe(0);
    }, 60_000);
  }
});
