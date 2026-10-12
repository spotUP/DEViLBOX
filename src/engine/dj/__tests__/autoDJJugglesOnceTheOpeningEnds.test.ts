/**
 * JUGGLE-SILENT (owner 2026-10-12: "ran Auto DJ a while, heard no beat
 * juggling"). Live, on a module playlist: the second track started 120 s into
 * the set (progress 6.7 % of the planned 30 min, inside the opening's 8 %),
 * and the set phase was the snapshot taken at that track's start - OPENING
 * ("normal mixing", owner plan section 28) for the whole 285 s track, long
 * after the opening ended. The arc is a function of the set's progress: the
 * phase is read when asked.
 *
 * Real module (public/data/songs/formats/shortsong1.mod: its order list,
 * pattern starts and tempo through the real analysis builder; its audio as
 * the analyser would hear it, rendered to the same walk). Entry: getAutoDJ()'s
 * poll loop with Auto Juggle at its default (MUSICAL), the set phase NOT
 * mocked. Sentinel: `loadDoubleToDeck` call count (the stand-alone double),
 * the controller's `counts.started`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useDJStore } from '@/stores/useDJStore';
import { computeExtendedAnalysis } from '../autodj/activityTimelines';
import { buildDJTrackAnalysis } from '../autodj/trackAnalysis';
import { corpusPipelineAnalysis } from '../autodj/testing/corpus';
import { renderSyntheticTrack } from '../autodj/testing/synthTrack';
import { DJSessionController, setSessionController } from '../autodj/sessionController';
import type { DJTrackAnalysis } from '../autodj/types';
import { setupStandalone, teardownStandalone, runStandalone } from './standaloneJuggleHarness';

const MODULE = 'public/data/songs/formats/shortsong1.mod';
const BAR = 4 * 60 / 125;

async function moduleAnalysis(): Promise<DJTrackAnalysis> {
  const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
  const song = await parseModuleToSong(new File([readFileSync(resolve(process.cwd(), MODULE))], 'shortsong1.mod'));
  // The module's 40 bars at 125 BPM (10 positions of 64 rows, speed 6), as its render sounds: a groove throughout.
  const track = renderSyntheticTrack({ name: 'shortsong1 render', bpm: 125, root: 57, mode: 'minor', sections: [{ bars: 40, kick: true, bass: true, hats: true, pad: true }] });
  const extended = computeExtendedAnalysis(track.pcm, track.sampleRate, { beats: track.beats });
  return buildDJTrackAnalysis({ id: 'shortsong1', durationSec: track.durationSec, analysis: corpusPipelineAnalysis(track), extended, song });
}

afterEach(() => { teardownStandalone(); });

describe('JUGGLE-SILENT: a track that started inside the opening juggles once the opening ends', () => {
  it('the set phase follows the set\'s progress mid-track, and Auto DJ sets up a stand-alone juggle on the module', async () => {
    const a = await moduleAnalysis();
    expect(a.tempoSource).toBe('module');
    // Bar 13: the last quarter of the phrase on bars 8-15 is ahead (a phrase end, owner plan section 41).
    const rig = await setupStandalone(holder, { track: 'drops', bpm: 125, startSec: 13 * BAR, analysis: a, durationSec: 1200 });
    // The harness pins the phase to CRUISING: this test is about the phase, so the real arc decides.
    vi.restoreAllMocks();

    // The live session: track 1 mixed into track 2 at 120 s, inside the opening (8 % of the 30 min plan = 144 s).
    const controller = new DJSessionController();
    setSessionController(controller);
    const tracks = [0, 1].map((index) => ({ index, id: `m${index}`, name: `m${index}`, artist: null, track: { id: `m${index}`, fileName: `m${index}.mod`, trackName: `m${index}`, format: 'MOD', bpm: 125, duration: 0, addedAt: index } }));
    controller.startSession(tracks, 0);
    const t0 = Date.now();
    vi.setSystemTime(t0 + 120_000);
    controller.memory.recordTransition({ time: Date.now(), fromTrackId: 'm0', toTrackId: 'm1', style: 'longBlend', lengthBars: 8, effects: [], energyBefore: 0.5, energyAfter: 0.5, key: null, bpm: 125, wasCut: false, wasBassSwap: false, hadVocalOverlap: false, fellBack: false });
    controller.onTrackStarted(1, a, { bpm: 125, key: null, energy: a.energy.perceivedIntensity });
    expect(controller.setPhase).toBe('OPENING');

    // 200 s into the set, the same track still playing: the opening is over.
    vi.setSystemTime(t0 + 200_000);
    expect(controller.setPhase).not.toBe('OPENING');

    rig.dj.startPolling();
    const j = rig.dj.getJuggle();
    await runStandalone(rig, 45_000, () => j.counts.started >= 1);
    const tel = useDJStore.getState().autoDJJuggleTelemetry;
    const why = `reason: ${tel?.reason}; safety: ${tel?.safety}`;
    expect(tel?.reason ?? '', why).not.toMatch(/OPENING/);
    expect(holder.doubles, why).toBe(1);
    expect(j.counts.started, why).toBe(1);
  }, 120_000);
});
