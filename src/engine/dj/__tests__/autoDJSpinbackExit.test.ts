/**
 * Owner decision 2026-10-12: a spinback exit for Auto DJ. The planner's impact
 * exit of a hard cut picks a spinback for a high-energy exit (a brake
 * otherwise, and not a spinback twice in a row); the executor fires the deck's
 * Spinback action (fx_deck_spinback, the pad's) on the grid moment - the
 * phrase end - and starts the incoming one bar later, on the next downbeat.
 * The outgoing deck's physics spins it back (rate negative) and it stops once
 * the reverse ends: the record is pulled out.
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
import { planTransition, impactExit } from '../autodj/transitionPlanner';
import { executeTransition } from '../autodj/transitionExecutor';
import { getStyle } from '../autodj/styleProfiles';
import { DJSessionMemory } from '../autodj/sessionMemory';
import { djFxFireCounts } from '@/engine/drumpad/DjFxActions';
import type { DJSection, DJTransitionPlan } from '../autodj/types';

function fakeDeck(id: string) {
  const rec = (fn: string) => (...args: unknown[]) => { holder.calls.push({ deck: id, fn, args, t: Date.now() }); };
  let playing = id === 'A';
  return {
    id, playbackMode: 'audio' as const, physics: new TurntablePhysics(),
    play: async () => { playing = true; rec('play')(); }, stop: () => { playing = false; rec('stop')(); },
    pause: () => { playing = false; rec('pause')(); }, isPlaying: () => playing,
    startScratch: rec('startScratch'), setScratchVelocity: rec('setScratchVelocity'), stopScratch: rec('stopScratch'),
    setPitch: rec('setPitch'), setKeyLock: rec('setKeyLock'), setEQ: rec('setEQ'), setEQKill: rec('setEQKill'),
    setFilterPosition: rec('setFilterPosition'), getFilterPosition: () => 0,
    setFilterResonance: rec('setFilterResonance'), setVolume: rec('setVolume'), getVolume: () => 1,
    setEchoSend: rec('setEchoSend'), setEchoParams: rec('setEchoParams'), setReverbSend: rec('setReverbSend'),
    setAudioLoop: rec('setAudioLoop'), clearAudioLoop: rec('clearAudioLoop'),
    audioPlayer: { seek: rec('seek'), getPosition: () => 60, getDuration: () => 120, stop: () => {} },
  };
}

const section = (kind: DJSection['kind'], energy: number): DJSection => ({ kind, start: 0, end: 8, startBar: 0, endBar: 4, confidence: 1, energy, alternatives: [] });

describe('Auto DJ spinback exit', () => {
  beforeAll(() => { corpusAnalysis('vocals'); corpusAnalysis('steady'); }, 120_000);
  beforeEach(() => {
    holder.calls.length = 0;
    const decks: Record<string, ReturnType<typeof fakeDeck>> = { A: fakeDeck('A'), B: fakeDeck('B') };
    holder.engine = { getDeck: (id: string) => decks[id], mixer: { setCrossfader: () => {} }, setCrossfader: () => {} };
    const s = useDJStore.getState();
    s.setCrossfader(0);
    s.setDeckState('A', { isPlaying: true, detectedBPM: 120, effectiveBPM: 120, filterPosition: 0 });
    s.setDeckState('B', { isPlaying: false, detectedBPM: 120, effectiveBPM: 120, filterPosition: 0 });
  });

  afterEach(() => { vi.useRealTimers(); });

  it('the impact exit is a spinback one bar before the start on a high-energy exit, a brake otherwise and after a recent spinback', () => {
    const fresh = new DJSessionMemory().snapshot();
    const spin = impactExit(section('drop', 0.9), section('drop', 0.9), 4, fresh);
    expect(spin).toMatchObject({ kind: 'spinback', deck: 'outgoing', beat: -4, lengthBeats: 4 });
    expect(impactExit(section('groove', 0.3), section('groove', 0.3), 4, fresh).kind).toBe('brake');
    expect(impactExit(section('drop', 0.9), section('drop', 0.9), 4, { ...fresh, recentFX: ['spinback'] }).kind).toBe('brake');
  });

  it('executes: the outgoing spins back on the phrase end and stops, the incoming drops on the next downbeat', async () => {
    const base = planTransition({
      outgoing: corpusAnalysis('vocals'), incoming: corpusAnalysis('steady'), outgoingDeck: 'A', incomingDeck: 'B', outgoingPosition: 20,
      style: getStyle('Dub'), creativeRisk: 0.6, memory: new DJSessionMemory().snapshot(), userBars: 2, withFilter: false, smartCuts: false,
      setPhase: 'PEAK', targetEnergy: 0.8, leadSec: 0, seed: 3,
    });
    const beatSec = 0.4;
    const plan: DJTransitionPlan = {
      ...base, style: 'hardCut', durationBars: 1, durationBeats: 4, filterPlan: { kind: 'none', curves: [], resonance: 1 },
      humanize: { ...base.humanize, startOffsetMs: 0, fxOffsetMs: 0 },
      effects: [impactExit(section('drop', 0.9), section('drop', 0.9), 4, new DJSessionMemory().snapshot())],
    };
    const firesBefore = djFxFireCounts.fx_deck_spinback ?? 0;
    // One clock for the executor, the spinback driver and the decks: fake, so a loaded machine cannot skew it.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    const timers = {
      now: () => Date.now(),
      setInterval: (fn: () => void, ms: number) => setInterval(fn, ms), clearInterval: (id: unknown) => clearInterval(id as ReturnType<typeof setInterval>),
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>),
    };
    let done = false;
    const running = executeTransition(plan, { tickMs: 5, beatSec, timers }).promise.finally(() => { done = true; });
    for (let i = 0; i < 4000 && !done; i++) await vi.advanceTimersByTimeAsync(5);
    const r = await running;

    expect(r.completed).toBe(true);
    expect(djFxFireCounts.fx_deck_spinback, 'the Spinback action fired').toBe(firesBefore + 1);
    expect(r.trace.events).toContain('fx spinback 4 beats before the start');
    const rates = holder.calls.filter((c) => c.deck === 'A' && c.fn === 'setScratchVelocity').map((c) => c.args[0] as number);
    expect(Math.min(...rates), 'the outgoing spun back').toBeLessThan(-0.05);
    const pause = holder.calls.find((c) => c.deck === 'A' && c.fn === 'pause');
    const drop = holder.calls.find((c) => c.deck === 'B' && c.fn === 'play')!;
    expect(pause, 'the record is pulled out').toBeDefined();
    expect(pause!.t, 'pulled out before the drop').toBeLessThan(drop.t);
    // The incoming starts one bar after the spinback on the phrase end: the next downbeat.
    const spin = holder.calls.find((c) => c.deck === 'A' && c.fn === 'startScratch')!;
    expect((drop.t - spin.t) / 1000).toBeCloseTo(4 * beatSec, 1);
  }, 30_000);
});
