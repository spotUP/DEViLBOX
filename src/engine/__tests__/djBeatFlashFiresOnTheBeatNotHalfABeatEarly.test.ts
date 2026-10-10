/**
 * DJ view: the beat flash fired half a beat EARLY and the 1-2-3-4 beat lights
 * changed half a beat LATE. Both keyed on the NEAREST grid beat, which flips
 * to the next beat halfway between beats. A beat event belongs to the moment
 * the heard position CROSSES a beat: the beat in progress is the last grid
 * beat at or before the position.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/engine/dj/DJEngine', () => ({ getDJEngine: () => { throw new Error('no engine in this test'); } }));
vi.mock('@/engine/dj/DJActions', () => ({ setDeckPitch: () => {} }));

import { phaseAt, beatCrossed, getPhaseInfo } from '@/engine/dj/DJAutoSync';
import { useDJStore } from '@/stores/useDJStore';
import type { BeatGridData } from '@/engine/dj/DJAudioCache';

// 125 BPM: one beat every 0.48 s, a downbeat every fourth beat, first beat at 0.1 s.
const PERIOD = 0.48;
const FIRST = 0.1;
const beats = Array.from({ length: 64 }, (_, i) => FIRST + i * PERIOD);
const grid: BeatGridData = { beats, downbeats: beats.filter((_, i) => i % 4 === 0), bpm: 125, timeSignature: 4 };
const at = (beat: number): number => FIRST + beat * PERIOD;

describe('DJ beat flash and beat lights follow the beat the heard position crossed', () => {
  it('at 0.9 of a beat the current beat is still the previous one, not the next', () => {
    const p = phaseAt(grid, at(5.9))!;
    expect(p.beatIdx).toBe(5);
    expect(p.beatInBar).toBe(1); // beat 6 of the track = the second light
    expect(p.beatFraction).toBeCloseTo(0.9, 6);
    // Halfway, too: the old nearest-beat index had already flipped to 6 here.
    expect(phaseAt(grid, at(5.51))!.beatIdx).toBe(5);
  });

  it('the beat index increments exactly at the beat, and the flash fires there and only there', () => {
    let prev: number | null = null;
    const fired: number[] = [];
    // Sweep 8 beats in 5 ms frames; record the position of every flash.
    for (let t = at(2) - 0.003; t < at(10); t += 0.005) {
      const p = phaseAt(grid, t)!;
      if (beatCrossed(prev, p.beatIdx)) fired.push(t);
      prev = p.beatIdx;
    }
    expect(fired.length).toBe(8);
    fired.forEach((t, i) => {
      const beatTime = at(2 + i);
      // The first frame at or after the beat: never before it, within one frame after.
      expect(t).toBeGreaterThanOrEqual(beatTime - 1e-9);
      expect(t - beatTime).toBeLessThan(0.005);
    });
  });

  it('the lit light walks 1-2-3-4 from the downbeat and the brightness reading moves within a beat', () => {
    expect([0, 1, 2, 3, 4, 7, 8].map((b) => phaseAt(grid, at(b) + 0.01)!.beatInBar)).toEqual([0, 1, 2, 3, 0, 3, 0]);
    expect(phaseAt(grid, at(3.1))!.beatFraction).toBeLessThan(phaseAt(grid, at(3.6))!.beatFraction);
    // Before the first beat nothing is lit and nothing flashes.
    expect(phaseAt(grid, 0.05)!.beatIdx).toBe(-1);
    expect(phaseAt(grid, 0.05)!.beatInBar).toBe(-1);
    expect(beatCrossed(null, 0)).toBe(false);
  });

  it('getPhaseInfo for a deck reports the crossed beat at its position', () => {
    useDJStore.getState().setDeckState('A', { playbackMode: 'audio', beatGrid: grid, audioPosition: at(12.9), elapsedMs: at(12.9) * 1000 });
    const p = getPhaseInfo('A')!;
    expect(p.beatIdx).toBe(12);
    expect(p.beatInBar).toBe(0);
  });
});
