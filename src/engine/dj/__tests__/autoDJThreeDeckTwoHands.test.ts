/**
 * C15, the two hands (scratch ledger; three_deck.py `_perf_events` / `_section_juggles` :195-235): inside the
 * three-deck routine the A/B decks hand-juggle ONLY while Deck C is out - juggle_feat (bars 20-23) and
 * final_burst (28-29); everywhere else a hand is on Deck C and the decks only play and fade.
 *
 * 1. The controller (`DJScratchDJ.tick`, Render three_deck while the set CRUISES): bar by bar over the routine, the
 *    juggle hold (`deckCHoldsTheJuggle`), the hands it reports (`handsInUse`) and the bars Deck C scratches equal
 *    the demo's per-bar rule (fixture from three_deck.py, tools/scratch-fixtures/gen_three_deck_two_hands.py).
 * 2. The Auto DJ (`getAutoDJ()` poll loop, stand-alone juggle rig, Render three_deck): the juggle that sets up while
 *    Deck C plays its routine is released with the two-hands reason, it never completes (sentinel: the routine
 *    count 1). Fake timers, fake decks, no audio.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fixture from '../scratch/__tests__/fixtures/three_deck_two_hands.json';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  loads: 0,
  crossfader: [] as Array<{ at: number; v: number; masterPos: number }>,
  incomingGridShiftSec: 0,
  doubles: 0,
}));

vi.mock('@/engine/dj/DJEngine', () => ({ getDJEngine: () => holder.engine, getDJEngineIfActive: () => holder.engine }));
vi.mock('../DJQuantizedFX', () => {
  const record = () => () => () => {};
  return {
    beatMatchedTransition: record(), cutTransition: record(), filterBuildTransition: record(), bassSwapTransition: record(), echoOutTransition: record(),
    skipTransition: record(), getQuantizeMode: () => 'off', setQuantizeMode: () => {},
    filterSweep: () => () => {}, filterReset: () => () => {}, echoOut: () => () => {}, instantEQKill: () => {}, quantizedEQKill: () => () => {}, cancelAllAutomation: () => {},
  };
});
vi.mock('../DJTrackLoader', async (orig) => {
  const actual = await orig<typeof import('../DJTrackLoader')>();
  return {
    ...actual, preRenderTrack: async () => null, loadPlaylistTrackToDeck: async () => false,
    loadDoubleToDeck: async (...args: Parameters<typeof actual.loadDoubleToDeck>) => { holder.doubles++; return actual.loadDoubleToDeck(...args); },
  };
});
vi.mock('../DJPipeline', async (orig) => {
  const actual = await orig<typeof import('../DJPipeline')>();
  return { ...actual, getDJPipeline: () => holder.pipeline };
});
vi.mock('../DJPerSongFx', () => ({ applyPerSongMasterFx: () => {} }));

import { DJScratchDJ, scratchDJStats } from '../scratch/DJScratchDJ';
import { THREE_DECK_JUGGLE_JL_MIN } from '../scratch/scratchDemoRoutines';
import { HANDS_BUDGET } from '../autodj/performanceBudget';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { timeAtBeat, barStartBeat } from '../autodj/beatGrid';
import { getAutoDJ } from '../DJAutoDJ';
import type { AutoDJInternals } from './juggleTransitionHarness';
import { setupStandalone, teardownStandalone, runStandalone, type StandaloneRig } from './standaloneJuggleHarness';
import type { DJPerformanceContext, DJTrackAnalysis } from '../autodj/types';
import type { ScratchEvent } from '../scratch/scratchTypes';

const perfAt = (track: DJTrackAnalysis, t: number): DJPerformanceContext => ({
  currentDeck: 'A', currentTrack: track, incomingTrack: null, currentPosition: t, currentBeat: 0, currentBar: 0,
  timeRemainingSec: 100, setEnergy: 0.6, targetEnergy: 0.6, setPhase: 'CRUISING', candidateTracks: [], creativeRisk: 0.5, confidence: 0.8,
} as unknown as DJPerformanceContext);

describe('C15: the A/B decks juggle only while Deck C is out (three-deck routine)', () => {
  let rig: StandaloneRig | null = null;
  afterEach(() => { if (rig) { teardownStandalone(); rig = null; } });

  it('bar by bar the juggle hold, the hands and the Deck C bars are the demo\'s _section_juggles', () => {
    expect(THREE_DECK_JUGGLE_JL_MIN).toBe(fixture.juggle_jl_min);
    // the demo plans its A/B events by the same rule: a hand-juggle exactly in the bars _section_juggles allows
    expect(fixture.hand).toEqual(fixture.juggles);
    const track = corpusAnalysis('drops');
    const scheduled: ScratchEvent[] = [];
    const ctrl = new DJScratchDJ({ seed: 3, executorFor: () => ({ schedule: (e: ScratchEvent) => { scheduled.push(e); return {}; }, cancel: () => {}, active: 0 }) });
    const barT = (b: number) => timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, b)) + 0.05;
    const tick = (b: number) => ctrl.tick({ perf: perfAt(track, barT(b)), deck: 'A', mode: 'MUSICAL', style: 'boomBap', scratchPermission: 2, render: 'three_deck' });
    // the routine starts on the first phrase after the first tick
    let start = -1;
    for (let b = 3; b < 20 && start < 0; b++) {
      tick(b);
      if (ctrl.lastPlan?.routine === 'threeDeck') start = b + 1;
    }
    expect(start).toBeGreaterThan(0);
    const holds: number[] = [], hands: number[] = [];
    for (let k = 0; k < 32; k++) {
      tick(start + k);
      holds.push(ctrl.deckCHoldsTheJuggle() ? 1 : 0);
      hands.push(ctrl.handsInUse());
    }
    expect(holds).toEqual(fixture.juggles.map((j) => 1 - j));
    expect(hands).toEqual(fixture.juggles.map((j) => (j ? 0 : HANDS_BUDGET)));
    // Deck C scratches only in the bars the demo gives it (never while the decks juggle)
    const startBeat = barStartBeat(track.downbeats, start);
    const busy = new Set(scheduled.filter((e) => e.gesture !== 'needleDrop' && e.gesture !== 'needleLift' && e.executeAtBeat >= startBeat)
      .map((e) => Math.floor((e.executeAtBeat - startBeat) / 4)).filter((b) => b < 32));
    for (const b of busy) expect(fixture.deck_c[b], `bar ${b}`).toBe(1);
    expect(fixture.juggles.every((j, b) => !(j && busy.has(b)))).toBe(true);
  });

  it('through the Auto DJ: a juggle set up while Deck C plays its routine is released with the two-hands reason, never completed', async () => {
    rig = await setupStandalone(holder, { track: 'drops', bpm: 130, startSec: 46, scratchRender: 'three_deck' });
    const routinesBefore = scratchDJStats.routines;
    const dj = getAutoDJ() as unknown as AutoDJInternals;
    const j = dj.getJuggle();
    dj.startPolling();
    await runStandalone(rig, 40_000, () => j.counts.aborted >= 1 && !rig!.decks.B.isPlaying());
    const aborted = j.events.filter((e) => e.kind === 'juggleAborted').map((e) => e.reason ?? '');
    expect(scratchDJStats.routines - routinesBefore).toBeGreaterThanOrEqual(1);
    expect(j.counts.started, aborted.join('; ')).toBeGreaterThanOrEqual(1);
    expect(j.counts.completed, aborted.join('; ')).toBe(0);
    expect(aborted.some((r) => /two hands: Deck C plays the three-deck routine/.test(r)), aborted.join('; ')).toBe(true);
  }, 60_000);
});
