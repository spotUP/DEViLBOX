/**
 * Auto DJ left deck filters off-centre (2026-10-11 live state: deck B -0.68,
 * deck A -0.13, Auto DJ off, both decks idle). A filter plan starts the
 * registry's filter_release / filter_rise sweeps for the planned length; the
 * emergency fade (four beats) reset the decks but never ended those sweeps,
 * so they kept writing the filter of the stopped deck. And the registry kept
 * one cancel handle per action id, so ending the move on one deck could leave
 * the other deck's sweep running.
 *
 * Drives the real executor and the real registry with stubbed decks and fake timers.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

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
import { fireDjFx, releaseDjFx } from '@/engine/drumpad/DjFxActions';
import type { DJTransitionPlan } from '../autodj/types';

type FakeDeck = ReturnType<typeof fakeDeck>;
function fakeDeck(id: string) {
  let filter = 0;
  const noop = () => {};
  return {
    id, playbackMode: 'audio' as const,
    play: async () => {}, stop: noop, pause: noop, isPlaying: () => true,
    setPitch: noop, setKeyLock: noop, setEQ: noop, setEQKill: noop,
    setFilterPosition: (p: number) => { filter = p; }, getFilterPosition: () => filter,
    setFilterResonance: noop,
    setVolume: noop, getVolume: () => 1,
    setEchoSend: noop, setEchoParams: noop, setReverbSend: noop,
    setAudioLoop: noop, clearAudioLoop: noop,
    audioPlayer: { seek: noop, getPosition: () => 60, getDuration: () => 120, stop: noop },
  };
}

function plan(kind: 'high-pass-sweep' | 'resonant-build'): DJTransitionPlan {
  const p = planTransition({
    outgoing: corpusAnalysis('vocals'), incoming: corpusAnalysis('steady'), outgoingDeck: 'B', incomingDeck: 'A', outgoingPosition: 20,
    style: getStyle('Club'), creativeRisk: 0.3, memory: new DJSessionMemory().snapshot(), userBars: 8, withFilter: false, smartCuts: false,
    setPhase: 'PEAK', targetEnergy: 0.8, leadSec: 0, seed: 3,
  });
  return { ...p, durationBars: 8, durationBeats: 32, effects: [], filterPlan: { kind, curves: [], resonance: 1 } };
}

let decks: Record<string, FakeDeck>;
const engineFilter = (d: 'A' | 'B') => decks[d].getFilterPosition();

describe('an Auto DJ filter move ends with the transition on every exit path', () => {
  beforeAll(() => { corpusAnalysis('vocals'); corpusAnalysis('steady'); }, 120_000);
  beforeEach(() => {
    vi.useFakeTimers();
    decks = { A: fakeDeck('A'), B: fakeDeck('B') };
    holder.engine = { getDeck: (id: string) => decks[id], mixer: { setCrossfader: () => {} }, setCrossfader: () => {} };
    useDJStore.getState().setCrossfader(1);
  });
  afterEach(() => { vi.useRealTimers(); });

  it.each(['high-pass-sweep', 'resonant-build'] as const)('the emergency fade (%s) leaves both filters centred once the planned sweep length has passed', async (kind) => {
    // The sweeps are running when the transition fails: emergency fade.
    const handle = executeTransition(plan(kind), { beatSec: 0.5, tickMs: 16, onSweepStarted: () => { throw new Error('failed after the sweeps started'); } });
    await vi.advanceTimersByTimeAsync(8000);
    const result = await handle.promise;
    expect(result.fellBack).toBe('emergency');
    // The planned sweeps would have run 32 beats = 16 s in all.
    await vi.advanceTimersByTimeAsync(20000);
    expect(engineFilter('B')).toBe(0);
    expect(engineFilter('A')).toBe(0);
  });

  it('ending a release on one deck does not leave the same action running on the other deck', async () => {
    fireDjFx('fx_deck_filter_release', { deck: 'A', beats: 8, source: 'autodj' });
    fireDjFx('fx_deck_filter_release', { deck: 'B', beats: 8, source: 'autodj' });
    await vi.advanceTimersByTimeAsync(1000);
    releaseDjFx('fx_deck_filter_release', { deck: 'A', source: 'autodj' });
    releaseDjFx('fx_deck_filter_release', { deck: 'B', source: 'autodj' });
    await vi.advanceTimersByTimeAsync(10000);
    expect(engineFilter('A')).toBe(0);
    expect(engineFilter('B')).toBe(0);
  });
});
