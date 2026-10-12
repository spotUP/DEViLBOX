/**
 * Reachability R8 (scratch ledger SCR-P7.R8; owner scratch plan sections 45, 46, 76): six planned
 * transitions - longBlend, shortBlend, dropMix, breakdownMix, hardCut, echoOut - each with the
 * scratch the planner attaches (`planTransitionScratch` on the planner's own plan), executed by the
 * real transition executor with the real `performTransitionScratch` (its executor recorded).
 * Sentinel `autoScratchRuntimeStats.transitionScratches`: 5 performed - echoOut, a risky pair
 * whose throw shares the echo bar, carries none. Every performed event ends before the plan's end;
 * no scratch gesture writes the crossfader (the transition's curve owns it).
 * Not through getAutoDJ (deviation): DJAutoDJ.executePlan's performScratch is the one-line call of
 * performTransitionScratch; R7 drives the Auto DJ poll loop.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const holder = vi.hoisted(() => ({ engine: null as unknown, crossfader: [] as number[] }));
vi.mock('@/engine/dj/DJEngine', () => ({ getDJEngine: () => holder.engine, getDJEngineIfActive: () => holder.engine }));

import { useDJStore } from '@/stores/useDJStore';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { planTransition } from '../autodj/transitionPlanner';
import { executeTransition } from '../autodj/transitionExecutor';
import { getStyle } from '../autodj/styleProfiles';
import { DJSessionMemory } from '../autodj/sessionMemory';
import { performTransitionScratch, autoScratchRuntimeStats } from '../scratch/autoScratchRuntime';
import { planTransitionScratch } from '../scratch/transitionScratch';
import { fieldsTouchedBy } from '../scratch/scratchSnapshot';
import { getGesture } from '../scratch/scratchGestureCatalog';
import type { DJTransitionPlan, TransitionStyle } from '../autodj/types';
import type { ScratchEvent } from '../scratch/scratchTypes';

function fakeDeck(id: string) {
  const nop = () => {};
  return {
    id, playbackMode: 'audio' as const, play: async () => {}, stop: nop, pause: nop, isPlaying: () => true,
    setPitch: nop, setKeyLock: nop, setEQ: nop, setEQKill: nop, setFilterPosition: nop, getFilterPosition: () => 0, setFilterResonance: nop,
    setVolume: nop, getVolume: () => 1, setEchoSend: nop, setEchoParams: nop, setReverbSend: nop, setAudioLoop: nop, clearAudioLoop: nop,
    audioPlayer: { seek: nop, getPosition: () => 60, getDuration: () => 120, stop: nop },
  };
}

const STYLES: TransitionStyle[] = ['longBlend', 'shortBlend', 'dropMix', 'breakdownMix', 'hardCut', 'echoOut'];

describe('six transitions with their scratch (SCR-P7.R8)', () => {
  beforeAll(() => { corpusAnalysis('steady'); corpusAnalysis('drops'); }, 120_000);
  beforeEach(() => {
    holder.crossfader.length = 0;
    const decks: Record<string, ReturnType<typeof fakeDeck>> = { A: fakeDeck('A'), B: fakeDeck('B') };
    holder.engine = { getDeck: (id: string) => decks[id], mixer: { setCrossfader: (v: number) => holder.crossfader.push(v) }, setCrossfader: (v: number) => holder.crossfader.push(v) };
    useDJStore.getState().setDeckState('A', { isPlaying: true, detectedBPM: 126, effectiveBPM: 126 });
    useDJStore.getState().setDeckState('B', { isPlaying: false, detectedBPM: 130, effectiveBPM: 130 });
  });

  it('5 of 6 perform their scratch (echoOut refused), every event inside the plan, never the crossfader', async () => {
    const outgoing = corpusAnalysis('steady'), incoming = corpusAnalysis('drops');
    const base = planTransition({
      outgoing, incoming, outgoingDeck: 'A', incomingDeck: 'B', outgoingPosition: 20, style: getStyle('Club'), creativeRisk: 0.4,
      memory: new DJSessionMemory().snapshot(), userBars: 2, withFilter: false, smartCuts: false, setPhase: 'CRUISING', targetEnergy: 0.8, leadSec: 0, seed: 3,
    });
    const before = autoScratchRuntimeStats.transitionScratches;
    const performed: Array<{ style: string; plan: DJTransitionPlan; events: ScratchEvent[] }> = [];
    for (const style of STYLES) {
      const effects = style === 'echoOut' ? [{ kind: 'echo-out' as const, deck: 'outgoing' as const, beat: 0, lengthBeats: 4, amount: 0.7, reason: 'echo' }] : [];
      const plan: DJTransitionPlan = { ...base, style, durationBars: 2, durationBeats: 8, endBeat: base.startBeat + 8, effects, filterPlan: { kind: 'none', curves: [], resonance: 1 } };
      plan.scratch = planTransitionScratch({ plan, outgoing, incoming, mode: 'MUSICAL', permission: 4, creativeRisk: 0.4, setPhase: 'CRUISING', seed: 3 }).scratch;
      const events: ScratchEvent[] = [];
      const r = await executeTransition(plan, {
        tickMs: 5, beatSec: 0.005,
        performScratch: (s) => performTransitionScratch(s, 'A', outgoing, { executorFor: () => ({ schedule: (e) => { events.push(e); }, cancel: () => {}, active: 0 }), fire: () => true }),
      }).promise;
      expect(r.completed, style).toBe(true);
      if (plan.scratch) performed.push({ style, plan, events });
    }
    expect(autoScratchRuntimeStats.transitionScratches - before).toBe(5);
    expect(performed.map((p) => p.style)).toEqual(['longBlend', 'shortBlend', 'dropMix', 'breakdownMix', 'hardCut']);
    for (const { style, plan, events } of performed) {
      expect(events.length, style).toBeGreaterThan(0);
      for (const e of events) {
        expect(e.executeAtBeat + e.durationBeats, `${style} ${e.gesture}`).toBeLessThanOrEqual(plan.endBeat + 1e-9);
        expect(fieldsTouchedBy(e.source.type, getGesture(e.gesture).faderWindows)).not.toContain('crossfader');
      }
    }
  }, 60_000);
});
