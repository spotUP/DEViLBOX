/**
 * Reachability R4 (plan 2026-10-11-dj-juggling, JUGX-P4.R4): a juggle is not
 * only a transition. With Auto DJ enabled, one deck playing a corpus track
 * with a build ahead within a phrase, the set CRUISING and Auto Juggle at its
 * default (MUSICAL, owner decision 2026-10-11), the poll loop loads a double
 * of the playing track on the idle deck, starts it on the master's downbeat,
 * the juggle controller performs a pattern with it, and Auto DJ hands back:
 * the idle deck stops and the crossfader sits on the master.
 *
 * Entry: getAutoDJ() - its poll loop. Sentinels: `loadDoubleToDeck` call
 * count 1 (the real export, wrapped), the controller's `counts.started` 1.
 * Numbers: the double starts at the master's position at a master downbeat
 * (+-5 ms); heard beat phase within 5 ms before the pattern; >= 2 crossfader
 * moves during the pattern; hand-back within one bar of the pattern's end.
 * Negative case: a transition 40 s away (room for the planner, not for a
 * stand-alone setup) - no double. Fake timers, fake decks, no audio.
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
import { corpusTrack } from '../autodj/testing/corpus';
import { getDecisionLog } from '../autodj/decisionLog';
import type { AutoDJInternals } from './juggleTransitionHarness';
import { setupStandalone, teardownStandalone, runStandalone, type StandaloneRig } from './standaloneJuggleHarness';

const TRACK = 'drops';
const BPM = 130;
const BEAT = 60 / BPM;
const BAR = 4 * BEAT;
const START_SEC = 46; // phrase 44.3-59.1 s; the build starts at 59.1 s

function beatPhaseErrorSec(a: number, b: number): number {
  const d = (((b - a) % BEAT) + BEAT) % BEAT;
  return d >= BEAT / 2 ? d - BEAT : d;
}

let rig: StandaloneRig;
let decks: StandaloneRig['decks'];
const run = (ms: number, until?: () => boolean) => runStandalone(rig, ms, until);

describe('R4: Auto DJ juggles anywhere in the set, not only in a transition', () => {
  beforeEach(async () => { rig = await setupStandalone(holder, { track: TRACK, bpm: BPM, startSec: START_SEC }); decks = rig.decks; });
  afterEach(() => { teardownStandalone(); });

  it('Auto Juggle defaults to MUSICAL (owner decision 2026-10-11)', () => {
    expect(useDJStore.getState().autoDJJuggleMode).toBe('MUSICAL');
  });

  it('a transition 40 s away: no double is loaded, and the debug view says why', async () => {
    const dj = getAutoDJ() as unknown as AutoDJInternals;
    // The preload is not this test's subject: the transition is 40 s away and stays planned.
    (dj as unknown as { preloadNextTrack: () => Promise<void> }).preloadNextTrack = async () => {};
    decks.A.audioPlayer.getDuration = () => START_SEC + 40;
    dj.startPolling();
    await run(10_000);
    expect(holder.doubles).toBe(0);
    expect(decks.B.isPlaying()).toBe(false);
    expect(useDJStore.getState().autoDJJuggleTelemetry?.safety ?? '').toMatch(/stand-alone: transition in \d+ s/);
  }, 60_000);

  it('a build ahead: the double starts on the master downbeat, a pattern plays, Auto DJ hands back', async () => {
    const dj = getAutoDJ() as unknown as AutoDJInternals;
    const j = dj.getJuggle();
    dj.startPolling();
    let settledPhase: number | null = null;
    let telemetrySetup = false;
    await run(60_000, () => {
      const tel = useDJStore.getState().autoDJJuggleTelemetry;
      if (tel?.safety.startsWith('setting up: double on B')) telemetrySetup = true;
      // Two seconds after the start, before the pattern's first action (on the phrase at 59.1 s): the double's heard beat phase.
      if (rig.start && settledPhase === null && decks.B.startedAt !== null && Date.now() - decks.B.startedAt >= 2000) {
        settledPhase = beatPhaseErrorSec(decks.A.position(), decks.B.position());
      }
      return j.counts.completed + j.counts.aborted >= 1 && !decks.B.isPlaying();
    });

    const why = `last decision: ${j.getLastDecision()?.reason ?? '-'}; safety: ${useDJStore.getState().autoDJJuggleTelemetry?.safety ?? '-'}`;
    expect(holder.doubles, why).toBe(1);
    expect(j.counts.started, why).toBe(1);
    expect(telemetrySetup).toBe(true);

    // Started on a master downbeat, at the master's position there.
    expect(rig.start, why).not.toBeNull();
    const downbeats = corpusTrack(TRACK).downbeats;
    const nearestDownbeat = downbeats.reduce((b, d) => (Math.abs(d - rig.start!.masterPos) < Math.abs(b - rig.start!.masterPos) ? d : b), downbeats[0]);
    expect(Math.abs(rig.start!.masterPos - nearestDownbeat)).toBeLessThan(0.005);
    expect(Math.abs(rig.start!.idlePos - rig.start!.masterPos)).toBeLessThan(0.005);
    expect(settledPhase).not.toBeNull();
    expect(Math.abs(settledPhase!)).toBeLessThan(0.005);

    // The pattern moved the crossfader at least twice, and its release put it on the master.
    expect(j.counts.completed, j.events.filter((e) => e.kind === 'juggleAborted').map((e) => e.reason).join('; ')).toBe(1);
    const startedAt = decks.B.startedAt!;
    const during = holder.crossfader.filter((c) => c.at > startedAt && c.at <= decks.B.stoppedAt!);
    const moves = during.filter((c, i) => i > 0 && c.v !== during[i - 1].v).length;
    expect(moves).toBeGreaterThanOrEqual(2);
    // By write order, not by ms: the release sweep's first write and the hand-back can share a millisecond.
    const lastPatternMove = during.map((c, i) => ({ ...c, i })).filter((c) => c.v !== 0).at(-1)!;
    const release = during.find((c, i) => i > lastPatternMove.i && c.v === 0)!;
    expect(release).toBeDefined();

    // Hand-back: idle stopped within a bar of the pattern's end, crossfader on the master, telemetry clear.
    expect(decks.B.isPlaying()).toBe(false);
    expect((decks.B.stoppedAt! - release.at) / 1000).toBeLessThanOrEqual(BAR + 0.05);
    expect(holder.crossfader.at(-1)!.v).toBe(0);
    expect(useDJStore.getState().crossfaderPosition).toBe(0);
    expect(decks.A.isPlaying()).toBe(true);
    expect(useDJStore.getState().autoDJJuggleTelemetry?.standalone).toBeNull();
    const log = getDecisionLog().list(50, 'JUGGLE');
    expect(log.length).toBe(1);
    expect(log[0].reasons[0]).toContain('stand-alone double on B (build): pattern completed');
  }, 120_000);

  it('the user loads a track on the idle deck during the setup: Auto DJ lets go of the deck and does not stop it (owner plan section 43)', async () => {
    const dj = getAutoDJ() as unknown as AutoDJInternals;
    dj.startPolling();
    await run(30_000, () => decks.B.isPlaying());
    expect(decks.B.isPlaying()).toBe(true);
    useDJStore.getState().setDeckState('B', { fileName: 'users-own.wav', trackName: 'users own' });
    await run(3_000);
    expect(decks.B.isPlaying(), 'the user\'s deck keeps playing').toBe(true);
    expect(useDJStore.getState().autoDJJuggleTelemetry?.standalone).toBeNull();
    expect(getDecisionLog().list(50, 'JUGGLE').at(-1)?.reasons[0]).toContain('the user loaded the idle deck');
  }, 120_000);
});
