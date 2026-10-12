/**
 * JUGGLE-FOLLOWUPS (d), live 2026-10-12 and the P4.LS long set: a stand-alone double whose bar phase
 * could not be corrected (3 re-cues) was handed back without starting the juggle cooldown, so the next
 * poll loaded and re-cued another double - 14-17 setups in a half hour against a budget of 12. A failed
 * setup spends the cooldown like a juggle (owner plan section 24).
 *
 * Entry: getAutoDJ() - its poll loop loads the double and starts it on the master's downbeat. Every
 * seek of the copy lands one beat late, so no re-cue ever lands on the master's bars. Sentinel: the
 * setup gave up ("could not be corrected"). Numbers: one double loaded in the 150 s after the give-up
 * (CRUISING cooldown 180 s at MUSICAL), the juggle telemetry reads the cooldown, no pattern started.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  loads: 0,
  crossfader: [] as Array<{ at: number; v: number; masterPos: number }>,
  incomingGridShiftSec: 0,
  doubles: 0,
}));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));
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

import { useDJStore } from '@/stores/useDJStore';
import { getAutoDJ } from '../DJAutoDJ';
import { getDecisionLog } from '../autodj/decisionLog';
import type { AutoDJInternals } from './juggleTransitionHarness';
import { setupStandalone, teardownStandalone, runStandalone, type StandaloneRig } from './standaloneJuggleHarness';

const TRACK = 'drops';
const BPM = 130;
const BEAT = 60 / BPM;
const START_SEC = 46;

let rig: StandaloneRig;

describe('JUGGLE-FOLLOWUPS (d): a double whose bar phase cannot be corrected starts the juggle cooldown', () => {
  beforeEach(async () => { rig = await setupStandalone(holder, { track: TRACK, bpm: BPM, startSec: START_SEC }); });
  afterEach(() => { teardownStandalone(); });

  it('after "bar phase could not be corrected" no second double is set up within the cooldown', async () => {
    const { decks } = rig;
    // Every seek of the copy lands a beat late: it can never be re-cued onto the master's bars.
    const seek = decks.B.audioPlayer.seek;
    decks.B.audioPlayer.seek = (t: number) => seek(t > 1 ? t + BEAT : t);
    const dj = getAutoDJ() as unknown as AutoDJInternals;
    const j = dj.getJuggle();
    const gaveUp = () => getDecisionLog().list(50, 'JUGGLE').some((e) => e.reasons[0].includes('could not be corrected'));
    dj.startPolling();
    await runStandalone(rig, 120_000, gaveUp, 50);
    const why = () => `log: ${getDecisionLog().list(10, 'JUGGLE').map((e) => e.reasons[0]).join(' | ')}; safety: ${useDJStore.getState().autoDJJuggleTelemetry?.safety}`;
    expect(gaveUp(), why()).toBe(true);
    expect(holder.doubles, why()).toBe(1);

    await runStandalone(rig, 150_000, () => false, 250);
    expect(holder.doubles, why()).toBe(1);
    expect(j.counts.started, why()).toBe(0);
    const budget = useDJStore.getState().autoDJJuggleTelemetry!.budget;
    expect(budget.secondsSinceLastJuggle, why()).toBeLessThan(budget.cooldownSec);
  }, 300_000);
});
