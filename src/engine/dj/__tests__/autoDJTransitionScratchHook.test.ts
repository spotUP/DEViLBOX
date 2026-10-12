/**
 * The transition executor's scratch hook (scratch plan D8, sections 28, 44; ledger SCR-P7.6,
 * P7.8): a plan carrying `scratch` is handed to `performScratch` exactly once, before the wait
 * for the grid and without delaying it; a plan without one never calls it; a cancelled
 * transition cancels its scratch. The transition scratch's FX request goes through the one
 * action path: dubbed -> one registry fire (fx_dub_echo), dry -> none; nothing in the scratch
 * layer calls the Dub engine directly.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const holder = vi.hoisted(() => ({ engine: null as unknown }));
vi.mock('@/engine/dj/DJEngine', () => ({ getDJEngine: () => holder.engine, getDJEngineIfActive: () => holder.engine }));

import { useDJStore } from '@/stores/useDJStore';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { planTransition } from '../autodj/transitionPlanner';
import { executeTransition } from '../autodj/transitionExecutor';
import { getStyle } from '../autodj/styleProfiles';
import { DJSessionMemory } from '../autodj/sessionMemory';
import { performTransitionScratch, fxRequestAction } from '../scratch/autoScratchRuntime';
import type { DJTransitionPlan } from '../autodj/types';
import type { TransitionScratchPlan } from '../scratch/transitionScratch';

function fakeDeck(id: string) {
  const nop = () => {};
  return {
    id, playbackMode: 'audio' as const, play: async () => {}, stop: nop, pause: nop, isPlaying: () => true,
    setPitch: nop, setKeyLock: nop, setEQ: nop, setEQKill: nop, setFilterPosition: nop, getFilterPosition: () => 0, setFilterResonance: nop,
    setVolume: nop, getVolume: () => 1, setEchoSend: nop, setEchoParams: nop, setReverbSend: nop, setAudioLoop: nop, clearAudioLoop: nop,
    audioPlayer: { seek: nop, getPosition: () => 60, getDuration: () => 120, stop: nop },
  };
}

function basePlan(): DJTransitionPlan {
  return planTransition({
    outgoing: corpusAnalysis('steady'), incoming: corpusAnalysis('drops'), outgoingDeck: 'A', incomingDeck: 'B', outgoingPosition: 20,
    style: getStyle('Club'), creativeRisk: 0.4, memory: new DJSessionMemory().snapshot(), userBars: 2, withFilter: false, smartCuts: false,
    setPhase: 'CRUISING', targetEnergy: 0.8, leadSec: 0, seed: 3, scratchMode: 'MUSICAL',
  });
}

const scratchOf = (fxRequest: TransitionScratchPlan['fxRequest']): TransitionScratchPlan => ({
  kind: 'scratchAccent', events: [], source: { type: 'DECK', deck: 'A', anchor: { position: 1, safe: [0, 2] } }, startBeat: 10, endBeat: 14, fxRequest, reasons: [],
});

describe('the transition executor performs the plan scratch (SCR-P7.6)', () => {
  beforeAll(() => { corpusAnalysis('steady'); corpusAnalysis('drops'); }, 120_000);
  beforeEach(() => {
    const decks: Record<string, ReturnType<typeof fakeDeck>> = { A: fakeDeck('A'), B: fakeDeck('B') };
    holder.engine = { getDeck: (id: string) => decks[id], mixer: { setCrossfader: () => {} }, setCrossfader: () => {} };
    const s = useDJStore.getState();
    s.setDeckState('A', { isPlaying: true, detectedBPM: 126, effectiveBPM: 126 });
    s.setDeckState('B', { isPlaying: false, detectedBPM: 130, effectiveBPM: 130 });
  });

  it('a plan with scratch calls the hook once, before the wait for the grid; without scratch never', async () => {
    const order: string[] = [];
    const hook = vi.fn(() => { order.push('scratch'); return { done: Promise.resolve({ completed: true }), cancel: () => {} }; });
    const withScratch: DJTransitionPlan = { ...basePlan(), durationBars: 1, durationBeats: 4, scratch: scratchOf('dry') };
    const r = await executeTransition(withScratch, { tickMs: 5, beatSec: 0.01, performScratch: hook, waitForStart: async () => { order.push('wait'); } }).promise;
    expect(r.completed).toBe(true);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['scratch', 'wait']);
    expect(r.trace.events.some((e) => /^scratch scratchAccent 0 events$/.test(e))).toBe(true);

    const none = vi.fn(() => ({ done: Promise.resolve({ completed: true }), cancel: () => {} }));
    await executeTransition({ ...basePlan(), durationBars: 1, durationBeats: 4, scratch: undefined }, { tickMs: 5, beatSec: 0.01, performScratch: none }).promise;
    expect(none).not.toHaveBeenCalled();
  });

  it('cancelling the transition cancels its scratch', async () => {
    const cancel = vi.fn();
    const handle = executeTransition({ ...basePlan(), durationBars: 4, durationBeats: 16, scratch: scratchOf('dry') }, {
      tickMs: 5, beatSec: 0.05, performScratch: () => ({ done: new Promise(() => {}), cancel }),
    });
    await new Promise((r) => setTimeout(r, 30));
    handle.cancel();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('the scratch FX request goes through the registry (SCR-P7.8)', () => {
  it('dubbed -> one fx_dub_echo fire on the outgoing deck; dry -> none', () => {
    const fire = vi.fn(() => true);
    const exec = { schedule: vi.fn(), cancel: vi.fn(), active: 0 };
    const a = performTransitionScratch(scratchOf('dubbed'), 'A', corpusAnalysis('steady'), { executorFor: () => exec, fire });
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith('fx_dub_echo', expect.objectContaining({ deck: 'A', source: 'autodj', beats: 4 }));
    a.cancel();
    fire.mockClear();
    performTransitionScratch(scratchOf('dry'), 'A', corpusAnalysis('steady'), { executorFor: () => exec, fire }).cancel();
    expect(fire).not.toHaveBeenCalled();
    expect(fxRequestAction('transition')).toBe('fx_deck_echo_throw');
  });

  it('no scratch module calls the Dub engine directly', () => {
    const dir = join(__dirname, '..', 'scratch');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(/DubBus|getDubBus|useDubStore|DubEngine/.test(src), f).toBe(false);
    }
  });
});
