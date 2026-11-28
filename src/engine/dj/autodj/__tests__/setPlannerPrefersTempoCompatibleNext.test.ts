/**
 * DJ-K (owner 2026-10-11: an 84 -> 140 BPM mix was "not super nice"): with a
 * full pool the set planner picks the tempo-compatible next track and walks a
 * large tempo gap over several tracks instead of jumping it in one mix.
 */
import { describe, it, expect } from 'vitest';
import { planSet, type PlannerTrack } from '../setPlanner';
import { getStyle } from '../styleProfiles';
import { DJSessionMemory } from '../sessionMemory';

const track = (index: number, bpm: number): PlannerTrack => ({
  index, id: `t${index}`, name: `track ${index}`, artist: `artist ${index}`, summary: null, bpm, musicalKey: 'Am', energy: 0.6, duration: 240,
});

function plan(tracks: PlannerTrack[]) {
  return planSet({
    tracks, currentIndex: 0, played: [0], memory: new DJSessionMemory().snapshot(), style: getStyle('Classic'),
    creativeRisk: 0.3, elapsedSec: 600, currentEnergy: 0.6, lookahead: 3,
  });
}

describe('set planner tempo compatibility', () => {
  it('a 140 BPM track is followed by the 138 BPM track, not the 84 BPM one', () => {
    const p = plan([track(0, 140), track(1, 84), track(2, 138)]);
    expect(p.order[0]).toBe(2);
  });

  // Tempo match is half/double aware (compatibility.ts tempoCompatibility): 84 BPM mixes as 168, so the
  // walk from 140 goes up through 154, not down through 112 (140 -> 112 -> 84 is 25 % then 33 %).
  it('a 140 -> 84 BPM gap is walked through the 154 BPM track (84 doubled is 168)', () => {
    const p = plan([track(0, 140), track(1, 84), track(2, 154)]);
    expect(p.order.slice(0, 2)).toEqual([2, 1]);
  });
});
