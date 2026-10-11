/**
 * Audit JA-m8 (2026-10-11 juggling audit; owner plan section 16 steps 3 and
 * 5): the stand-alone double was verified on BEAT phase only, so a copy a
 * whole beat (or two, or three) off the master's bars counted as aligned and
 * the juggle's cuts landed on the wrong beat of the bar. Verification is on
 * the heard bar phase. The real store and DJAutoSync phase measurement; no
 * engine (positions come from the store).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/engine/dj/DJEngine', () => ({ getDJEngine: () => { throw new Error('no engine'); }, getDJEngineIfActive: () => null }));

import { useDJStore } from '@/stores/useDJStore';
import { idleBarPhaseVerified } from '../standaloneJuggle';

const BEAT = 0.5;
const grid = { beats: Array.from({ length: 400 }, (_, i) => i * BEAT), downbeats: Array.from({ length: 100 }, (_, i) => i * 4 * BEAT), bpm: 120, timeSignature: 4 };

function place(masterSec: number, idleSec: number): void {
  const s = useDJStore.getState();
  s.setDeckState('A', { beatGrid: grid, isPlaying: false, audioPosition: masterSec, durationMs: 200_000 });
  s.setDeckState('B', { beatGrid: grid, isPlaying: false, audioPosition: idleSec, durationMs: 200_000 });
}

describe('the stand-alone double is verified on the bar, not only on the beat', () => {
  beforeEach(() => place(0, 0));

  it('a copy one whole beat after the master (on the beat, off the bar) is not verified', () => {
    place(20, 20 + BEAT);
    expect(idleBarPhaseVerified('B')).toBe(false);
  });

  it('a copy 2 ms from the master on the same bar is verified; 10 ms is not', () => {
    place(20, 20.002);
    expect(idleBarPhaseVerified('B')).toBe(true);
    place(20, 20.01);
    expect(idleBarPhaseVerified('B')).toBe(false);
  });
});
