/**
 * JA-DOUBLE-OFFBAR: since JA-m8 (2d6490bd8) a stand-alone double is verified on its heard BAR phase,
 * but the setup only kept it on the master's BEAT - a copy a whole beat off the master's bars stayed
 * there, was never verified, and Auto DJ gave up after two phrases ("no pattern within two phrases").
 * Owner plan section 16: align, establish the bar phase, verify, then permit. The setup locks the
 * silent copy to the master's bars (one exact re-cue) before it verifies.
 *
 * Entry: getAutoDJ() - its poll loop loads the double and starts it on the master's downbeat; the
 * copy's cues while stopped land one beat late (the off-bar start). Sentinel: exactly one re-cue of the
 * playing copy before any pattern, with the crossfader on the master (silent), and the controller
 * started a pattern. Numbers: the copy starts one beat off the bar; when the pattern starts its heard
 * bar phase is within 5 ms of the master's; the pattern completes; no "two phrases" give-up.
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
const BAR = 4 * BEAT;
const START_SEC = 46; // phrase 44.3-59.1 s; the build starts at 59.1 s (the R4 setup)

function barPhaseErrorSec(a: number, b: number): number {
  const d = (((b - a) % BAR) + BAR) % BAR;
  return d >= BAR / 2 ? d - BAR : d;
}

let rig: StandaloneRig;

describe('JA-DOUBLE-OFFBAR: a double that starts off the master\'s bar is re-cued onto it, verified, and juggled', () => {
  beforeEach(async () => { rig = await setupStandalone(holder, { track: TRACK, bpm: BPM, startSec: START_SEC }); });
  afterEach(() => { teardownStandalone(); });

  it('the copy\'s cue lands one beat late: the silent copy is re-cued onto the bar, a pattern plays, no two-phrase give-up', async () => {
    const { decks } = rig;
    // The copy's cues while it is stopped (the setup's cue and quantizedPlay's bar align) land one beat late:
    // it starts on the master's beat but a beat off its bar. Seeks once it plays land exactly.
    const seek = decks.B.audioPlayer.seek;
    const dj = getAutoDJ() as unknown as AutoDJInternals;
    const j = dj.getJuggle();
    /** Seeks of the copy after it started and before any pattern: the setup's correction. */
    const recues: Array<{ cf: number; masterPos: number }> = [];
    decks.B.audioPlayer.seek = (t: number) => {
      if (decks.B.startedAt !== null && j.counts.started === 0) recues.push({ cf: useDJStore.getState().crossfaderPosition, masterPos: decks.A.position() });
      seek(!decks.B.isPlaying() && t > 1 ? t + BEAT : t);
    };
    let phaseAtPattern: number | null = null;
    dj.startPolling();
    await runStandalone(rig, 60_000, () => {
      if (phaseAtPattern === null && j.counts.started >= 1) phaseAtPattern = barPhaseErrorSec(decks.A.position(), decks.B.position());
      return j.counts.completed + j.counts.aborted >= 1 && !decks.B.isPlaying();
    }, 20);

    const why = `last decision: ${j.getLastDecision()?.reason ?? '-'}; log: ${getDecisionLog().list(5, 'JUGGLE').map((e) => e.reasons[0]).join(' | ')}`;
    expect(holder.doubles, why).toBe(1);
    // The off-bar start this test sets up: on the beat, a whole beat off the bar.
    expect(rig.start, why).not.toBeNull();
    expect(Math.abs(Math.abs(barPhaseErrorSec(rig.start!.masterPos, rig.start!.idlePos)) - BEAT)).toBeLessThan(0.01);
    // Sentinel: one exact re-cue of the copy, while the crowd hears only the master.
    expect(recues.length, why).toBe(1);
    expect(recues[0].cf).toBe(0);
    // Verified on the bar, and only then a pattern.
    expect(j.counts.started, why).toBe(1);
    expect(phaseAtPattern).not.toBeNull();
    expect(Math.abs(phaseAtPattern!)).toBeLessThan(0.005);
    expect(j.counts.completed, why).toBe(1);
    const log = getDecisionLog().list(50, 'JUGGLE');
    expect(log.some((e) => e.reasons[0].includes('no pattern within two phrases')), why).toBe(false);
  }, 120_000);
});
