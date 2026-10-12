/**
 * Owner decision 2026-10-12: Auto DJ may rewind a peak tune ONCE instead of
 * moving on (the crowd demands it). The planner (planTransition) puts a rewind
 * on the plan at the peak, on a high-energy tune, at the creative risk a
 * spinback asks for, never twice for one tune; the executor performs it on the
 * grid moment through the deck's Rewind action (fx_deck_rewind, the pad's): the
 * outgoing platter is pulled back (rate negative) and the tune is cued to its
 * first downbeat at speed; the incoming is never started. The session controller
 * remembers the rewind (the next plan moves on), logs a REWIND decision for
 * dj_auto_dj_explain, and the set plan grows by the replayed time.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { TurntablePhysics } from '@/engine/turntable/TurntablePhysics';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  calls: [] as Array<{ deck: string; fn: string; args: unknown[]; t: number }>,
}));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));

import { useDJStore } from '@/stores/useDJStore';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { planTransition, type TransitionPlanInput } from '../autodj/transitionPlanner';
import { executeTransition } from '../autodj/transitionExecutor';
import { getStyle } from '../autodj/styleProfiles';
import { DJSessionMemory } from '../autodj/sessionMemory';
import { DJSessionController, type SessionTrack } from '../autodj/sessionController';
import { getDecisionLog } from '../autodj/decisionLog';
import { djFxFireCounts } from '@/engine/drumpad/DjFxActions';
import type { DJTrackAnalysis } from '../autodj/types';
import type { PlaylistTrack } from '@/stores/useDJPlaylistStore';

function fakeDeck(id: string) {
  const rec = (fn: string) => (...args: unknown[]) => { holder.calls.push({ deck: id, fn, args, t: Date.now() }); };
  let playing = id === 'A';
  const physics = new TurntablePhysics();
  return {
    id, playbackMode: 'audio' as const, physics,
    play: async () => { playing = true; rec('play')(); }, stop: () => { playing = false; rec('stop')(); },
    pause: () => { playing = false; rec('pause')(); }, isPlaying: () => playing,
    startScratch: rec('startScratch'), setScratchVelocity: rec('setScratchVelocity'), stopScratch: rec('stopScratch'),
    cueSeconds: (sec: number) => { holder.calls.push({ deck: id, fn: 'cueSeconds', args: [sec, physics.playbackRate], t: Date.now() }); return true; },
    setPitch: rec('setPitch'), setKeyLock: rec('setKeyLock'), setEQ: rec('setEQ'), setEQKill: rec('setEQKill'),
    setFilterPosition: rec('setFilterPosition'), getFilterPosition: () => 0,
    setFilterResonance: rec('setFilterResonance'), setVolume: rec('setVolume'), getVolume: () => 1,
    setEchoSend: rec('setEchoSend'), setEchoParams: rec('setEchoParams'), setReverbSend: rec('setReverbSend'),
    setAudioLoop: rec('setAudioLoop'), clearAudioLoop: rec('clearAudioLoop'),
    audioPlayer: { seek: rec('seek'), getPosition: () => 60, getDuration: () => 120, stop: () => {} },
  };
}

/** The corpus tune as a peak tune: the planner reads its energy. */
function peakTune(): DJTrackAnalysis {
  const a = corpusAnalysis('vocals');
  return { ...a, energy: { ...a.energy, perceivedIntensity: 0.92 } };
}

const input = (memory = new DJSessionMemory().snapshot(), overrides: Partial<TransitionPlanInput> = {}): TransitionPlanInput => ({
  outgoing: peakTune(), incoming: corpusAnalysis('steady'), outgoingDeck: 'A', incomingDeck: 'B', outgoingPosition: 20,
  style: getStyle('Dub'), creativeRisk: 0.8, memory, userBars: 2, withFilter: false, smartCuts: false,
  setPhase: 'PEAK', targetEnergy: 0.85, leadSec: 0, seed: 3, ...overrides,
});

describe('Auto DJ rewinds a peak tune once', () => {
  beforeAll(() => { corpusAnalysis('vocals'); corpusAnalysis('steady'); }, 120_000);
  beforeEach(() => {
    holder.calls.length = 0;
    const decks: Record<string, ReturnType<typeof fakeDeck>> = { A: fakeDeck('A'), B: fakeDeck('B') };
    holder.engine = { getDeck: (id: string) => decks[id], mixer: { setCrossfader: () => {} }, setCrossfader: () => {} };
    const s = useDJStore.getState();
    s.setCrossfader(0);
    s.setDeckState('A', { isPlaying: true, detectedBPM: 120, effectiveBPM: 120, filterPosition: 0, beatGrid: null, trackAnalysis: peakTune() });
    s.setDeckState('B', { isPlaying: false, detectedBPM: 120, effectiveBPM: 120, filterPosition: 0, beatGrid: null });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('plans, performs and remembers the rewind; the next plan moves on and the set plan counts the replay', async () => {
    const plan = planTransition(input());
    expect(plan.rewind, plan.reasons.join('\n')).toBeDefined();
    const rewind = plan.rewind!;
    const firstDownbeat = peakTune().landmarks.firstDownbeat;
    expect(rewind.atSec).toBe(plan.startTimeSec);
    expect(rewind.restartSec).toBeCloseTo(firstDownbeat, 6);
    expect(rewind.replaySec).toBeCloseTo(plan.startTimeSec - firstDownbeat, 6);
    expect(plan.reasons.some((r) => r.startsWith('rewind: peak tune'))).toBe(true);
    // Gates: not at the peak, a low creative risk, a low-energy tune: no rewind.
    expect(planTransition(input(undefined, { setPhase: 'CRUISING' })).rewind).toBeUndefined();
    expect(planTransition(input(undefined, { creativeRisk: 0.5 })).rewind).toBeUndefined();
    expect(planTransition(input(undefined, { outgoing: corpusAnalysis('steady'), incoming: corpusAnalysis('vocals') })).rewind).toBeUndefined();

    // Execute on one fake clock for the executor and the platter driver.
    const firesBefore = djFxFireCounts.fx_deck_rewind ?? 0;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    const timers = {
      now: () => Date.now(),
      setInterval: (fn: () => void, ms: number) => setInterval(fn, ms), clearInterval: (id: unknown) => clearInterval(id as ReturnType<typeof setInterval>),
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>),
    };
    let done = false;
    const running = executeTransition(plan, { tickMs: 5, beatSec: 0.5, timers }).promise.finally(() => { done = true; });
    for (let i = 0; i < 2000 && !done; i++) await vi.advanceTimersByTimeAsync(5);
    const r = await running;

    expect(r.rewound, r.trace.events.join('\n')).toBe(true);
    expect(r.completed).toBe(true);
    expect(r.incomingPlaying).toBe(false);
    expect(djFxFireCounts.fx_deck_rewind, 'the deck Rewind action fired').toBe(firesBefore + 1);
    const rates = holder.calls.filter((c) => c.deck === 'A' && c.fn === 'setScratchVelocity').map((c) => c.args[0] as number);
    expect(Math.min(...rates), 'the outgoing record was pulled back').toBeLessThan(-2);
    const cue = holder.calls.find((c) => c.deck === 'A' && c.fn === 'cueSeconds');
    expect(cue?.args[0], 'the same tune again, from its first downbeat').toBe(useDJStore.getState().decks.A.trackAnalysis!.landmarks.firstDownbeat);
    expect(cue?.args[1], 'at speed').toBe(1);
    expect(holder.calls.some((c) => c.deck === 'B' && (c.fn === 'play' || c.fn === 'seek')), 'the incoming was never touched').toBe(false);

    // The controller remembers it, explains it, and the set grows by the replay.
    const tracks: SessionTrack[] = [0, 1, 2].map((i) => ({ index: i, id: `t${i}`, name: `t${i}`, track: { fileName: `t${i}.mod`, duration: 1000 } as PlaylistTrack }));
    const controller = new DJSessionController({ now: () => Date.now() });
    controller.setTracks(tracks);
    controller.onTransitionComplete(r, plan);
    expect(controller.counts.rewinds).toBe(1);
    expect(controller.counts.executions, 'no transition happened').toBe(0);
    const decision = getDecisionLog().last('REWIND');
    expect(decision?.reasons[0]).toBe(rewind.reason);
    expect(decision?.details?.plannedDurationSec, 'the set plan counts the replayed time').toBeCloseTo(3000 + rewind.replaySec, 6);
    const memory = controller.memory.snapshot();
    expect(memory.rewoundTracks).toEqual([peakTune().id]);
    expect(memory.replayedSec).toBeCloseTo(rewind.replaySec, 6);
    // Once per tune: the plan after the rewind moves on.
    const after = planTransition(input(memory, { outgoingPosition: firstDownbeat }));
    expect(after.rewind).toBeUndefined();
    expect(after.reasons).toContain('rewind: this tune was rewound already: moving on');
  }, 60_000);
});
