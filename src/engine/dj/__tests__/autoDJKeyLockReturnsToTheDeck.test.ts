/**
 * Auto DJ left key lock on (2026-10-10 audit): the transition executor wrote
 * the plan's key lock onto the incoming deck on every transition - ON when the
 * plan pitched the deck, OFF otherwise (overwriting the DJ's own setting) -
 * and nothing ever gave the deck its own state back, so a deck kept running
 * through the time-stretcher for every later track.
 *
 * Now: a plan that needs key lock engages it for the track it pitches; it stays
 * while that track plays (releasing it mid-track would jump the key) and the
 * deck's own state returns when the track leaves the deck. A plan that does
 * not need it leaves the deck's setting alone.
 *
 * Drives the real executor with stubbed decks.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const holder = vi.hoisted(() => ({ engine: null as unknown }));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));

import { useDJStore } from '@/stores/useDJStore';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { planTransition } from '../autodj/transitionPlanner';
import { executeTransition } from '../autodj/transitionExecutor';
import { getStyle } from '../autodj/styleProfiles';
import { DJSessionMemory } from '../autodj/sessionMemory';
import type { DJTransitionPlan } from '../autodj/types';

function fakeDeck(id: string) {
  let filter = 0;
  const noop = () => {};
  return {
    id, playbackMode: 'audio' as const,
    play: async () => {}, stop: noop, pause: noop, isPlaying: () => true,
    setPitch: noop, setKeyLock: noop, setEQ: noop, setEQKill: noop,
    setFilterPosition: (p: number) => { filter = p; }, getFilterPosition: () => filter,
    setFilterResonance: noop, setVolume: noop, getVolume: () => 1,
    setEchoSend: noop, setEchoParams: noop, setReverbSend: noop,
    setAudioLoop: noop, clearAudioLoop: noop,
    audioPlayer: { seek: noop, getPosition: () => 60, getDuration: () => 120, stop: noop },
  };
}

function plan(outgoing: 'A' | 'B', incoming: 'A' | 'B', keyLock: boolean): DJTransitionPlan {
  const p = planTransition({
    outgoing: corpusAnalysis('vocals'), incoming: corpusAnalysis('steady'), outgoingDeck: outgoing, incomingDeck: incoming, outgoingPosition: 20,
    style: getStyle('Club'), creativeRisk: 0.3, memory: new DJSessionMemory().snapshot(), userBars: 1, withFilter: false, smartCuts: false,
    setPhase: 'PEAK', targetEnergy: 0.8, leadSec: 0, seed: 3,
  });
  return { ...p, durationBars: 1, durationBeats: 4, effects: [], filterPlan: { kind: 'none', curves: [], resonance: 1 }, keyPlan: { ...p.keyPlan, keyLock } };
}

const keyLock = (d: 'A' | 'B') => useDJStore.getState().decks[d].keyLockEnabled;

describe('Auto DJ hands key lock back to the deck', () => {
  beforeAll(() => { corpusAnalysis('vocals'); corpusAnalysis('steady'); }, 120_000);
  beforeEach(() => {
    const decks: Record<string, ReturnType<typeof fakeDeck>> = { A: fakeDeck('A'), B: fakeDeck('B') };
    holder.engine = { getDeck: (id: string) => decks[id], mixer: { setCrossfader: () => {} }, setCrossfader: () => {} };
    const s = useDJStore.getState();
    s.setCrossfader(0);
    s.setDeckKeyLock('A', false);
    s.setDeckKeyLock('B', false);
  });

  it('a pitched incoming track keeps key lock while it plays, and the deck gets its own setting back when the track leaves', async () => {
    await executeTransition(plan('A', 'B', true), { tickMs: 5, beatSec: 0.02 }).promise;
    expect(keyLock('B')).toBe(true);
    // The next transition takes the locked track off deck B.
    await executeTransition(plan('B', 'A', false), { tickMs: 5, beatSec: 0.02 }).promise;
    expect(keyLock('B')).toBe(false);
    expect(keyLock('A')).toBe(false);
  });

  it('a plan that does not need key lock leaves the DJ\'s own key lock on', async () => {
    useDJStore.getState().setDeckKeyLock('B', true);
    await executeTransition(plan('A', 'B', false), { tickMs: 5, beatSec: 0.02 }).promise;
    expect(keyLock('B')).toBe(true);
  });
});
