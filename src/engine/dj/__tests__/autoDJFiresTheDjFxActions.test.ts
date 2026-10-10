/**
 * Plan sections 17-19, 23, 24, 53 and the owner's rule: the Auto DJ performs
 * through the SAME DJ FX actions the DJ view's pads, MIDI and keyboard fire
 * (DjFxActions.fireDjFx), the way Auto Dub fires dub moves through the move
 * registry. A planned echo-out fires fx_deck_echo_out on the outgoing deck
 * (fire count, fire log, the store flag the pad lights from, the deck's echo
 * send); a filter build fires the filter rise / release actions and the
 * deck filter position the knob reads moves; a brake fires fx_deck_brake.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  calls: [] as Array<{ deck: string; fn: string; args: unknown[] }>,
  crossfader: [] as number[],
}));

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
import { clearDjFxFireLog, djFxFireCounts, getDjFxFireLog, fireDjFx, releaseDjFx } from '@/engine/drumpad/DjFxActions';
import type { DJTransitionPlan } from '../autodj/types';

function fakeDeck(id: string) {
  const rec = (fn: string) => (...args: unknown[]) => { holder.calls.push({ deck: id, fn, args }); };
  let filter = 0;
  return {
    id, playbackMode: 'audio' as const,
    play: async () => { holder.calls.push({ deck: id, fn: 'play', args: [] }); }, stop: rec('stop'), pause: rec('pause'), isPlaying: () => true,
    setPitch: rec('setPitch'), setKeyLock: rec('setKeyLock'), setEQ: rec('setEQ'), setEQKill: rec('setEQKill'),
    setFilterPosition: (p: number) => { filter = p; holder.calls.push({ deck: id, fn: 'setFilterPosition', args: [p] }); }, getFilterPosition: () => filter,
    setFilterResonance: rec('setFilterResonance'), setVolume: rec('setVolume'), getVolume: () => 1,
    setEchoSend: rec('setEchoSend'), setEchoParams: rec('setEchoParams'), setReverbSend: rec('setReverbSend'),
    setAudioLoop: rec('setAudioLoop'), clearAudioLoop: rec('clearAudioLoop'),
    audioPlayer: { seek: rec('seek'), getPosition: () => 60, getDuration: () => 120, stop: () => {} },
  };
}

function basePlan(): DJTransitionPlan {
  return planTransition({
    outgoing: corpusAnalysis('vocals'), incoming: corpusAnalysis('steady'), outgoingDeck: 'A', incomingDeck: 'B', outgoingPosition: 20,
    style: getStyle('Dub'), creativeRisk: 0.6, memory: new DJSessionMemory().snapshot(), userBars: 2, withFilter: true, smartCuts: false,
    setPhase: 'PEAK', targetEnergy: 0.8, leadSec: 0, seed: 3,
  });
}

describe('the Auto DJ fires the DJ FX actions the pads use', () => {
  beforeAll(() => { corpusAnalysis('vocals'); corpusAnalysis('steady'); }, 120_000);
  beforeEach(() => {
    holder.calls.length = 0; holder.crossfader.length = 0;
    clearDjFxFireLog();
    const decks: Record<string, ReturnType<typeof fakeDeck>> = { A: fakeDeck('A'), B: fakeDeck('B') };
    holder.engine = { getDeck: (id: string) => decks[id], mixer: { setCrossfader: (v: number) => holder.crossfader.push(v) }, setCrossfader: (v: number) => holder.crossfader.push(v) };
    const s = useDJStore.getState();
    s.setCrossfader(0);
    s.setDeckState('A', { isPlaying: true, detectedBPM: 122, effectiveBPM: 122, beatGrid: { beats: [0, 0.49], downbeats: [0], bpm: 122, timeSignature: 4 }, filterPosition: 0 });
    s.setDeckState('B', { isPlaying: false, detectedBPM: 126, effectiveBPM: 126, filterPosition: 0 });
    for (const id of Object.keys(s.djFxActive)) s.setDjFxActive(id, null);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('an echo-out plan fires fx_deck_echo_out on the outgoing deck: count, log, pad flag and the deck echo send', async () => {
    const plan: DJTransitionPlan = { ...basePlan(), style: 'echoOut', durationBars: 2, durationBeats: 8, effects: [{ kind: 'echo-out', deck: 'outgoing', beat: 0, lengthBeats: 8, amount: 0.75, reason: 'test' }], filterPlan: { kind: 'none', curves: [], resonance: 1 } };
    const handle = executeTransition(plan, { tickMs: 5, beatSec: 0.02 });
    await vi.waitFor(() => expect(djFxFireCounts.fx_deck_echo_out ?? 0).toBe(1), { timeout: 2000 });
    expect(useDJStore.getState().djFxActive.fx_deck_echo_out).toBe('A');
    const fire = getDjFxFireLog().find((e) => e.id === 'fx_deck_echo_out' && e.kind === 'fire')!;
    expect(fire.source).toBe('autodj');
    expect(fire.deck).toBe('A');
    expect(fire.beats).toBe(8);
    expect(holder.calls.some((c) => c.deck === 'A' && c.fn === 'setEchoSend' && (c.args[0] as number) > 0.5)).toBe(true);
    expect(holder.calls.some((c) => c.deck === 'A' && c.fn === 'setEchoParams')).toBe(true);
    const result = await handle.promise;
    expect(result.completed).toBe(true);
    // The crossfader rested at the centre for the tail, then completed.
    expect(holder.crossfader.some((v) => Math.abs(v - 0.5) < 0.02)).toBe(true);
    expect(holder.crossfader[holder.crossfader.length - 1]).toBe(1);
  });

  it('a filter build fires the filter rise on the incoming and the release on the outgoing; the knob position the UI reads moves', async () => {
    const plan: DJTransitionPlan = { ...basePlan(), style: 'filterBuild', durationBars: 2, durationBeats: 8, effects: [], filterPlan: { kind: 'resonant-build', curves: [], resonance: 2.5 } };
    const handle = executeTransition(plan, { tickMs: 5, beatSec: 0.02 });
    await vi.waitFor(() => expect(djFxFireCounts.fx_deck_filter_rise ?? 0).toBe(1), { timeout: 2000 });
    expect(djFxFireCounts.fx_deck_filter_release).toBe(1);
    const rise = getDjFxFireLog().find((e) => e.id === 'fx_deck_filter_rise' && e.kind === 'fire')!;
    expect(rise.deck).toBe('B');
    expect(rise.source).toBe('autodj');
    // The incoming starts high-passed (-0.8): the deck and the store the knob reads both move.
    await vi.waitFor(() => expect(holder.calls.some((c) => c.deck === 'B' && c.fn === 'setFilterPosition' && (c.args[0] as number) <= -0.7)).toBe(true), { timeout: 2000 });
    await vi.waitFor(() => expect(useDJStore.getState().decks.B.filterPosition).toBeLessThan(-0.3), { timeout: 2000 });
    await handle.promise;
  });

  it('cancelling a finished transition does not report it again (Auto DJ cancels on every completion)', async () => {
    const plan: DJTransitionPlan = { ...basePlan(), style: 'filterBuild', durationBars: 2, durationBeats: 8, effects: [], filterPlan: { kind: 'resonant-build', curves: [], resonance: 2.5 } };
    const results: unknown[] = [];
    const handle = executeTransition(plan, { tickMs: 5, beatSec: 0.02, onComplete: (r) => results.push(r) });
    const done = await handle.promise;
    expect(done.completed).toBe(true);
    const releasesBefore = getDjFxFireLog().filter((e) => e.kind !== 'fire').length;
    handle.cancel();
    expect(results.length).toBe(1);
    expect(getDjFxFireLog().filter((e) => e.kind !== 'fire').length).toBe(releasesBefore);
  });

  it('a brake effect fires fx_deck_brake; the pad fires the same action and lights from the same flag', async () => {
    const plan: DJTransitionPlan = { ...basePlan(), style: 'hardCut', durationBars: 1, durationBeats: 4, effects: [{ kind: 'brake', deck: 'outgoing', beat: 0, lengthBeats: 2, amount: 1, reason: 'test' }], filterPlan: { kind: 'none', curves: [], resonance: 1 } };
    const handle = executeTransition(plan, { tickMs: 5, beatSec: 0.02 });
    const r = await handle.promise;
    expect(r.trace.events.some((e) => e.startsWith('fx brake'))).toBe(true);
    expect(djFxFireCounts.fx_deck_brake ?? 0).toBe(1);
    // Humanization never pushes an effect before beat 0 or past the cut (a signed hash once made the offset negative).
    expect(plan.humanize.fxOffsetMs).toBeGreaterThanOrEqual(0);
    expect(plan.humanize.startOffsetMs).toBeGreaterThanOrEqual(0);
    // The pad path: same action, same flag.
    fireDjFx('fx_deck_kill_lo', { deck: 'B', source: 'pad' });
    expect(useDJStore.getState().djFxActive.fx_deck_kill_lo).toBe('B');
    expect(useDJStore.getState().decks.B.eqLowKill).toBe(true);
    releaseDjFx('fx_deck_kill_lo', { deck: 'B', source: 'pad' });
    expect(useDJStore.getState().djFxActive.fx_deck_kill_lo).toBeUndefined();
    expect(getDjFxFireLog().filter((e) => e.source === 'pad').length).toBe(2);
  });
});
