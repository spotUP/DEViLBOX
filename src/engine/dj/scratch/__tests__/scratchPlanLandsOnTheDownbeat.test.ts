/**
 * Audit SA-M1 (thoughts/shared/research/2026-10-12_scratch-work-audit.md; owner scratch plan
 * sections 7, 8): a planned bar is the downbeat grid's bar. Before the fix `executeAtBeat` was
 * `bar x 4 + step / 4` on a clock whose beat 0 is the first DETECTED beat, so on a track whose
 * first downbeat is the second detected beat (phaseOffset 1) every scratch landed one beat late:
 * "bar 4 step 0" on beat 2 of the bar.
 */
import { describe, it, expect } from 'vitest';
import { toScratchEvents } from '../scratchPlanner';
import { deckAnchor } from '../scratchAnchor';
import { fractionalBeatAt } from '../../autodj/beatGrid';
import { fixtureAnalysis } from './fixtures/analysisFixture';
import type { PlacedScratch } from '../scratchPlacement';
import type { DJTrackAnalysis } from '../../autodj/types';

/** The fixture track, its bars moved one beat later: the first detected beat is a pickup. */
function pickupTrack(): DJTrackAnalysis {
  const t = fixtureAnalysis();
  const beats = t.beatGrid.beats;
  const bars = Array.from({ length: Math.floor((beats.length - 1) / 4) }, (_, i) => {
    const first = 1 + i * 4;
    return { index: i, start: beats[first]!.time, end: beats[first + 4]?.time ?? beats[first]!.time + 2, downbeat: beats[first]!.time, beats: [first, first + 1, first + 2, first + 3], full: true };
  });
  return { ...t, downbeats: { bars, meter: { beatsPerBar: 4, confidence: 0.9 }, confidence: 0.9, phaseOffset: 1 } } as DJTrackAnalysis;
}

const placed = (bar: number, step: number): PlacedScratch => ({
  bar, step, beat: bar * 4 + step / 4, gesture: 'forwardStab', velocity: 0.8, placementRole: 'accent', role: 'ACCENT',
});

describe('a planned bar is the downbeat grid bar (SA-M1)', () => {
  it('bar 4 step 0 on a track with a one-beat pickup fires on the downbeat of bar 4, not on its beat 2', () => {
    const track = pickupTrack();
    const anchor = deckAnchor(10, 20, 'downbeat', 120);
    const [ev, turn] = toScratchEvents([placed(4, 0), placed(15, 15)], { type: 'DECK', deck: 'A', anchor }, anchor, {
      bpm: 120, seed: 1, humanize: false, downbeats: track.downbeats,
    });
    const bar4 = track.downbeats.bars[4]!.start;
    expect(ev!.executeAtBeat).toBeCloseTo(fractionalBeatAt(track.beatGrid, bar4), 9);
    expect(ev!.executeAtBeat).toBe(17);
    // the phrase-end turnaround sits on the last sixteenth of bar 15, a sixteenth before bar 16
    const bar16 = fractionalBeatAt(track.beatGrid, track.downbeats.bars[16]!.start);
    expect(bar16 - turn!.executeAtBeat).toBeCloseTo(0.25, 9);
  });
});
