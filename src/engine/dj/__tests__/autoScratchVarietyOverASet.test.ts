/**
 * Auto Scratch keeps its vocabulary over a set (owner report 2026-10-12: "only baby scratches";
 * owner scratch plan sections 21, 22, 38/39, 53, 54). Measured before the fix over five corpus
 * tracks in MUSICAL: electro and techno played one gesture (chirp) for every phrase (the palette's
 * bias inside the mode's level left a single gesture), cooldowns removed a gesture for a whole
 * window, and a crate record refused the gestures it does not take (silence). Through the
 * controller's entry `DJScratchDJ.tick()`, per genre route: >= 2 performed gestures (a mode cap and a
 * genre's short-stroke cap leave some profiles three gestures inside the level, the demo's band picks
 * two or three of them in sparse sections), several crate records over the set (the demo's one record
 * per section, SCR-PHRASING-PARITY D4), and never the music (D1).
 */
import { describe, it, expect } from 'vitest';
import { DJScratchDJ } from '../scratch/DJScratchDJ';
import { corpusAnalysis, type CorpusId } from '../autodj/testing/corpus';
import { timeAtBeat, barStartBeat } from '../autodj/beatGrid';
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
        if (e.source.type !== 'CRATE') unplayable++;
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
    it(`${genre}, MUSICAL: >= 2 gestures, >= 3 crate records, never the music`, () => {
      const { performed, unplayable } = simulate(genre, 'MUSICAL');
      expect(performed.length).toBeGreaterThan(5);
      const distinct = new Set(performed.map((e) => e.gesture));
      expect(distinct.size, [...distinct].join(', ')).toBeGreaterThanOrEqual(2);
      const records = new Set(performed.map((e) => (e.source.type === 'CRATE' ? e.source.recordId : '')));
      expect(records.size, [...records].join(', ')).toBeGreaterThanOrEqual(3);
      expect(unplayable).toBe(0);
    }, 60_000);
  }
});
