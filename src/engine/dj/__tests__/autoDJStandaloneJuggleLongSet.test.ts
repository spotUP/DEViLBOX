/**
 * Stand-alone juggles over a long set (plan 2026-10-11-dj-juggling,
 * JUGX-P4.LS; owner plan 2026-10-08 sections 24, 28, 49, 51): one simulated
 * hour through getAutoDJ() at the MUSICAL default and half an hour in
 * PERFORMER, one long track playing (the corpus "drops" track tiled through
 * the real analysis builder), the set CRUISING. Juggles stay within the
 * set-phase budget (fraction and cooldown, scaled by the mode), never repeat
 * the last pattern, every one is handed back (idle deck stopped, crossfader on the master), a deck is
 * always audible, and nothing is left running at the end: no open juggle
 * work, no pending timer. Fake timers, fake decks, no audio.
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

import { useDJStore } from '@/stores/useDJStore';
import { corpusPipelineAnalysis, corpusTrack, CORPUS_SPECS } from '../autodj/testing/corpus';
import { computeExtendedAnalysis } from '../autodj/activityTimelines';
import { buildDJTrackAnalysis } from '../autodj/trackAnalysis';
import { getDecisionLog } from '../autodj/decisionLog';
import { MODE_SHAPE, PHASE_BUDGET } from '../autodj/juggle/jugglePlanner';
import type { JuggleMode } from '../autodj/juggle/juggleTypes';
import { setupStandalone, teardownStandalone, runStandalone } from './standaloneJuggleHarness';

const TRACK = 'drops';
const BPM = 130;
const BAR = 4 * 60 / BPM;
const HOUR = 3600;

/** The corpus track repeated for `seconds`: its beats, downbeats and extended timelines tiled on its musical length. */
function tiledAnalysis(seconds: number) {
  const t = corpusTrack(TRACK);
  const bars = CORPUS_SPECS[TRACK].sections.reduce((n, s) => n + s.bars, 0);
  const period = (bars * 4 * 60) / BPM;
  const tiles = Math.ceil(seconds / period);
  const ext = computeExtendedAnalysis(t.pcm, t.sampleRate, { beats: t.beats });
  const tile = (arr: number[], hop: number) => {
    const n = Math.round((period * tiles) / hop);
    return Array.from({ length: n }, (_, i) => arr[Math.min(arr.length - 1, Math.floor(((i * hop) % period) / hop))]);
  };
  const tileRows = (rows: number[][], hop: number) => {
    const n = Math.round((period * tiles) / hop);
    return Array.from({ length: n }, (_, i) => rows[Math.min(rows.length - 1, Math.floor(((i * hop) % period) / hop))]);
  };
  const one = t.beats.filter((b) => b < period - 1e-6);
  const beats = Array.from({ length: tiles }, (_, k) => one.map((b) => b + k * period)).flat();
  const analysis = corpusPipelineAnalysis(t, { beats, downbeats: beats.filter((_, i) => i % 4 === 0) });
  return buildDJTrackAnalysis({
    id: `${TRACK}.wav`, durationSec: period * tiles, analysis,
    extended: {
      ...ext, bass: tile(ext.bass, ext.hopSec), drums: tile(ext.drums, ext.hopSec), harmonic: tile(ext.harmonic, ext.hopSec), vocal: tile(ext.vocal, ext.hopSec),
      brightness: tile(ext.brightness, ext.hopSec), loudnessShortTermDb: tile(ext.loudnessShortTermDb, ext.hopSec), onsetFlux: tile(ext.onsetFlux, ext.hopSec),
      chroma: tileRows(ext.chroma, ext.keyHopSec),
    },
    song: null,
  });
}

async function longSet(mode: JuggleMode, seconds: number) {
  const analysis = tiledAnalysis(seconds + 120);
  const rig = await setupStandalone(holder, { track: TRACK, bpm: BPM, startSec: 5, analysis, durationSec: analysis.durationSec });
  useDJStore.getState().setAutoDJConfig({ juggleMode: mode });
  const { dj, decks } = rig;
  // The track outlasts the run: no preload, no transition - the time is the stand-alone layer's.
  (dj as unknown as { preloadNextTrack: () => Promise<void> }).preloadNextTrack = async () => {};
  const j = dj.getJuggle();
  dj.startPolling();
  const starts: number[] = [];
  const stops: Array<{ at: number; cf: number }> = [];
  let silent = 0;
  let wasPlaying = false;
  await runStandalone(rig, seconds * 1000, () => {
    const playing = decks.B.isPlaying();
    const cf = useDJStore.getState().crossfaderPosition;
    if (playing && !wasPlaying) starts.push(Date.now());
    if (!playing && wasPlaying) stops.push({ at: Date.now(), cf });
    wasPlaying = playing;
    // Owner plan section 34: a deck is always audible (A plays; the fader on B only while B plays).
    if (!decks.A.isPlaying() || (cf > 0.999 && !playing)) silent++;
    return false;
  }, 1000);
  const log = getDecisionLog().list(400, 'JUGGLE');
  const why = `${mode}: juggles ${starts.length}; log: ${log.map((e) => e.reasons[0]).join(' | ')}; safety: ${useDJStore.getState().autoDJJuggleTelemetry?.safety}`;
  const budget = { cooldownSec: PHASE_BUDGET.CRUISING.cooldownSec * MODE_SHAPE[mode].cooldownScale, maxFraction: PHASE_BUDGET.CRUISING.maxFraction * MODE_SHAPE[mode].fractionScale };
  return { rig, j, starts, stops, silent, log, why, budget };
}

async function expectNothingLeft(r: Awaited<ReturnType<typeof longSet>>) {
  // Nothing left running (owner plan section 49): disable, let the last bars pass.
  (r.rig.dj as unknown as { disable(): void }).disable();
  await vi.advanceTimersByTimeAsync(4 * BAR * 1000);
  expect(r.rig.decks.B.isPlaying()).toBe(false);
  expect(r.j.openWork()).toBe(0);
  expect(useDJStore.getState().autoDJJuggleTelemetry?.standalone ?? null).toBeNull();
  expect(useDJStore.getState().crossfaderPosition).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
}

function expectBudgetAndHandBacks(r: Awaited<ReturnType<typeof longSet>>, seconds: number) {
  expect(r.starts.length, r.why).toBeLessThanOrEqual(Math.floor(seconds / r.budget.cooldownSec));
  // Every setup either started a pattern or gave up before one (and spent the cooldown, JUGGLE-FOLLOWUPS d).
  const failedSetups = r.log.filter((e) => e.reasons[0].includes('could not be corrected') || e.reasons[0].includes('no pattern within two phrases')).length;
  expect(r.j.counts.started + failedSetups, r.why).toBe(r.starts.length);
  // The cooldown holds between one hand-back and the next start.
  for (let i = 1; i < r.starts.length; i++) expect((r.starts[i] - r.stops[i - 1].at) / 1000, r.why).toBeGreaterThanOrEqual(r.budget.cooldownSec);
  expect(useDJStore.getState().autoDJJuggleTelemetry!.budget.juggledFraction).toBeLessThanOrEqual(r.budget.maxFraction);
  // Every one handed back: the idle deck stopped with the crossfader on the master, the log says how.
  expect(r.stops.length).toBeGreaterThanOrEqual(r.starts.length - (r.rig.decks.B.isPlaying() ? 1 : 0));
  for (const s of r.stops) expect(s.cf).toBe(0);
  expect(r.log.length).toBeGreaterThanOrEqual(r.stops.length);
  expect(r.silent).toBe(0);
  // Owner plan section 49 / scenario 10: never the same pattern twice in a row.
  const types = r.j.getHistory().map((h) => h.patternType);
  for (let i = 1; i < types.length; i++) expect(types[i], `${r.why}; history ${types.join(', ')}`).not.toBe(types[i - 1]);
}

describe('P4.LS: stand-alone juggles over a long set', () => {
  afterEach(() => { teardownStandalone(); });

  it('one hour, MUSICAL (the default): a double, within the CRUISING budget, handed back, never the same pattern twice in a row, nothing left running', async () => {
    const r = await longSet('MUSICAL', HOUR);
    // MUSICAL's only pattern for a double is `double`, and the planner never repeats the last pattern:
    // on one track with no transition in between, one double in the hour.
    expect(r.starts.length, r.why).toBe(1);
    expectBudgetAndHandBacks(r, HOUR);
    await expectNothingLeft(r);
  }, 900_000);

  it('30 minutes, PERFORMER: repeated juggles, each at least the cooldown after the last hand-back, within the budget, nothing left running', async () => {
    const seconds = 30 * 60;
    const r = await longSet('PERFORMER', seconds);
    expect(r.starts.length, r.why).toBeGreaterThanOrEqual(3);
    expectBudgetAndHandBacks(r, seconds);
    await expectNothingLeft(r);
  }, 900_000);
});
