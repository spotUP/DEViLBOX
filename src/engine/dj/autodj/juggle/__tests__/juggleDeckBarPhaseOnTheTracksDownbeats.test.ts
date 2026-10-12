/**
 * JUGGLE-FOLLOWUPS (e): the juggle controller's deck state read its bar phase as (beat mod 4) / 4 -
 * beat 0 taken for a downbeat. A track whose first detected beat is the bar's last beat (downbeat grid
 * phaseOffset 1) then read a bar phase of 0.25 on every downbeat. The bar phase is on the track's own bar
 * grid (barStartBeat), the grid the controller's masterBar already reads.
 *
 * The real analysis builder on the corpus "drops" track, its downbeats moved to beats 1, 5, 9, ...
 * Entry: DJJuggleController.buildContext, the one juggle context builder.
 */
import { describe, it, expect } from 'vitest';
import { DJJuggleController, type TickInput } from '../juggleController';
import type { JuggleActionSink } from '../juggleExecutor';
import { corpusPipelineAnalysis, corpusTrack } from '../../testing/corpus';
import { buildDJTrackAnalysis } from '../../trackAnalysis';

function offsetAnalysis() {
  const t = corpusTrack('drops');
  const analysis = corpusPipelineAnalysis(t, { beats: t.beats, downbeats: t.beats.filter((_, i) => i % 4 === 1) });
  return buildDJTrackAnalysis({ id: 'drops-offset', durationSec: t.durationSec, analysis, song: null });
}

describe('JUGGLE-FOLLOWUPS (e): the juggle deck state reads its bar phase on the track\'s downbeats', () => {
  it('on a downbeat of a grid with phaseOffset 1 the bar phase is 0, half a bar later 0.5', () => {
    const a = offsetAnalysis();
    expect(a.downbeats.phaseOffset).toBe(1);
    const c = new DJJuggleController({ sink: {} as JuggleActionSink, positionOf: () => 0, clockFor: () => { throw new Error('no pattern here'); } });
    const input = (pos: number): TickInput => ({
      masterDeck: 'A', setPhase: 'CRUISING', energy: 0.6, targetEnergy: 0.6, performanceMode: 'JUGGLE', transitionApproachingSec: null,
      decks: {
        A: { trackId: 'drops', analysis: a, positionSec: pos, playing: true, bpm: a.bpm },
        B: { trackId: 'none', analysis: null, positionSec: 0, playing: false, bpm: 0 },
      },
    });
    const bar = a.downbeats.bars[6];
    const onDownbeat = c.buildContext(input(bar.start)).deckA.barPhase;
    expect(Math.min(onDownbeat, 1 - onDownbeat)).toBeLessThan(0.01);
    const mid = c.buildContext(input(a.beatGrid.beats[bar.beats[2]].time)).deckA.barPhase;
    expect(mid).toBeCloseTo(0.5, 2);
  });
});
