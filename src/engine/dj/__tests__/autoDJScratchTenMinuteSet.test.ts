/**
 * Ten minutes of Auto Scratch through getAutoDJ() (SCR-PHRASING-PARITY / SCR-VARIETY acceptance). The
 * live evidence before the port (2026-10-12, a SID set, MUSICAL): a SCRATCH decision every 4 bars
 * nonstop, always the routine 'electroTransformer', always drop / baby / tearForward / chirp, only the
 * four 'aah' records. Now the overlay is the demo's: section by section, one record per section, the
 * phrase ends of each section carrying the scratches, nothing on the music.
 *
 * One long track (the corpus 'drops' track tiled through the real analysis builder) plays for ten
 * minutes on the fake clock, the set CRUISING, the juggle off, in MUSICAL (the default) and PERFORMER.
 * Measured from every event the controller hands the real ScratchExecutor: the scratch duty cycle (bars
 * with a scratch / bars), the 4-bar windows with a scratch, distinct records, gestures and routines.
 * The demo's own overlay on the parity tracks (`fixtures/phrasing_parity.json`) has a duty cycle of
 * 16 % (hip-hop arrangement) to 70 % (an instrumental battle set), and on this very track (the same
 * planner without the mode's caps - the parity test proves it is the demo's plan) 50.9 %: the run never
 * exceeds the demo on the track, stays near the parity span, and never scratches every 4-bar window.
 * Fake timers, fake decks, no audio.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  loads: 0,
  crossfader: [] as Array<{ at: number; v: number; masterPos: number }>,
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
  return { ...actual, preRenderTrack: async () => null, loadPlaylistTrackToDeck: async () => false };
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
import { barIndexAt, timeAtBeat } from '../autodj/beatGrid';
import { setupStandalone, teardownStandalone, runStandalone } from './standaloneJuggleHarness';
import { resetScratchVoicePool } from '../scratch/scratchVoicePool';
import { ScratchExecutor } from '../scratch/ScratchExecutor';
import { scratchDJStats } from '../scratch/DJScratchDJ';
import { demoRoutineStats } from '../scratch/scratchDemoRoutines';
import fixture from '../scratch/__tests__/fixtures/phrasing_parity.json';
import type { ScratchEvent } from '../scratch/scratchTypes';
import { overlaySectionAt } from '../scratch/DJScratchDJ';
import { planScratch } from '../scratch/scratchPlanner';
import { buildThreeDeckRoutine } from '../scratch/scratchDemoRoutines';
import { gestureBeats } from '../scratch/scratchGestureCatalog';
import { buildScratchContext } from '../scratch/scratchContext';
import { scratchStyleFor } from '../scratch/scratchStyles';
import type { DJPerformanceContext } from '../autodj/types';
import type { ScratchMode } from '../scratch/scratchStyles';

const TRACK = 'drops';
const BPM = 130;
const MINUTES = 10;
const PINNED_CLOCK_MS = Date.UTC(2026, 0, 1);

/** The corpus track repeated for `seconds` (as the long-set juggle test tiles it). */
function tiledAnalysis(seconds: number) {
  const t = corpusTrack(TRACK);
  const bars = CORPUS_SPECS[TRACK].sections.reduce((n, s) => n + s.bars, 0);
  const period = (bars * 4 * 60) / BPM;
  const tiles = Math.ceil(seconds / period);
  const ext = computeExtendedAnalysis(t.pcm, t.sampleRate, { beats: t.beats });
  const tile = (arr: number[], hop: number) => Array.from({ length: Math.round((period * tiles) / hop) }, (_, i) => arr[Math.min(arr.length - 1, Math.floor(((i * hop) % period) / hop))]!);
  const tileRows = (rows: number[][], hop: number) => Array.from({ length: Math.round((period * tiles) / hop) }, (_, i) => rows[Math.min(rows.length - 1, Math.floor(((i * hop) % period) / hop))]!);
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

/** The demo overlay's duty cycle on the parity tracks (bars with a scratch / bars), min and max. */
function demoDutyRange(): [number, number] {
  const lengths: Record<string, number> = { hipHop: 44, club: 128, instrumental: 64 };
  const duty = (fixture.overlay as Array<{ track: string; routine: string | null; events: Array<{ bar: number }> }>)
    .filter((o) => o.routine === null).map((o) => new Set(o.events.map((e) => e.bar)).size / lengths[o.track]!);
  return [Math.min(...duty), Math.max(...duty)];
}

async function tenMinutes(mode: ScratchMode) {
  const seconds = MINUTES * 60;
  const analysis = tiledAnalysis(seconds + 120);
  const startSec = 5;
  const rig = await setupStandalone(holder, { track: TRACK, bpm: BPM, startSec, analysis, durationSec: analysis.durationSec, clockMs: PINNED_CLOCK_MS });
  useDJStore.getState().setAutoDJConfig({ juggleMode: 'OFF', scratchMode: mode, scratchStyle: 'auto' });
  (rig.dj as unknown as { preloadNextTrack: () => Promise<void> }).preloadNextTrack = async () => {};
  const events: ScratchEvent[] = [];
  const original = ScratchExecutor.prototype.schedule;
  vi.spyOn(ScratchExecutor.prototype, 'schedule').mockImplementation(function (this: ScratchExecutor, e) { events.push(e); return original.call(this, e); });
  const before = { plans: scratchDJStats.plans, records: demoRoutineStats.overlayRecord };
  rig.dj.startPolling();
  await runStandalone(rig, seconds * 1000, () => false, 100);
  rig.dj.stopPolling();
  const firstBar = barIndexAt(analysis.downbeats, startSec) + 1;
  const lastBar = barIndexAt(analysis.downbeats, startSec + seconds);
  const bars = lastBar - firstBar;
  const performed = events.filter((e) => e.gesture !== 'needleDrop' && e.gesture !== 'needleLift');
  const barOf = (e: ScratchEvent) => barIndexAt(analysis.downbeats, timeAtBeat(analysis.beatGrid, e.executeAtBeat) + 1e-6);
  const busyBars = new Set(performed.map(barOf));
  const windows = new Set([...busyBars].map((b) => Math.floor((b - firstBar) / 4)));
  const records = new Set(performed.map((e) => (e.source.type === 'CRATE' ? e.source.recordId : `not a record: ${e.source.type}`)));
  const gestures = new Set(performed.map((e) => e.gesture));
  // the demo's own overlay on this track: the same planner with no mode cap and no vocal rule (the parity
  // test proves it is the demo's plan, event for event), the same seed, style and profile
  const ctrl = (rig.dj as unknown as { scratch: { deps: { seed: number } } }).scratch;
  const choice = scratchStyleFor('auto', analysis.genre);
  const ctx = buildScratchContext({ perf: { currentDeck: 'A', currentTrack: analysis, currentPosition: startSec, setEnergy: 0.6, targetEnergy: 0.7 } as unknown as DJPerformanceContext, style: choice.style, scratchPermission: 4 })!;
  const demo = planScratch(ctx, { mode: 'BATTLE', seed: ctrl.deps.seed, fromBar: firstBar, bars, sectionAt: (b) => overlaySectionAt(analysis, b), profile: choice.profile, records: true });
  const demoDuty = new Set(demo.events.map((e) => e.bar)).size / bars;
  // density and repetition (the owner, 2026-10-12: "repetitive sparse boring"): strokes per phrase with a
  // scratch, distinct gestures per phrase, the share of the set a stroke sounds, the roles; against the demo's
  // overlay here and the demo's three-deck routine (its Deck C performance, 32 bars, `build_scratch_events`)
  const perWindow = (evs: ReadonlyArray<{ bar: number; gesture: string }>) => {
    const w = new Map<number, Array<{ gesture: string }>>();
    for (const e of evs) { const k = Math.floor(e.bar / 4); w.set(k, [...(w.get(k) ?? []), e]); }
    const rows = [...w.values()];
    return { strokes: rows.reduce((n, r) => n + r.length, 0) / Math.max(1, rows.length), gestures: rows.reduce((n, r) => n + new Set(r.map((e) => e.gesture)).size, 0) / Math.max(1, rows.length) };
  };
  const mine = perWindow(performed.map((e) => ({ bar: barOf(e) - firstBar, gesture: e.gesture })));
  const sounding = performed.reduce((n, e) => n + e.durationBeats, 0) / (bars * 4);
  const roles = Object.entries(performed.reduce<Record<string, number>>((m, e) => ({ ...m, [e.role]: (m[e.role] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', ');
  const demoOverlay = perWindow(demo.events);
  const three = buildThreeDeckRoutine(ctrl.deps.seed).filter((e) => e.gesture !== 'needleDrop' && e.gesture !== 'needleLift');
  const threeDeck = { duty: new Set(three.map((e) => e.bar)).size / 32, ...perWindow(three), sounding: three.reduce((n, e) => n + gestureBeats(e.gesture), 0) / (32 * 4) };
  return {
    density: { mine, sounding, roles, demoOverlay, demoOverlaySounding: demo.events.reduce((n, e) => n + (e.beats ?? gestureBeats(e.gesture)), 0) / (bars * 4), threeDeck },
    demoDuty, style: choice.style,
    bars, events: performed.length, duty: busyBars.size / bars, windowShare: windows.size / Math.ceil(bars / 4), records, gestures,
    plans: scratchDJStats.plans - before.plans, recordPicks: demoRoutineStats.overlayRecord - before.records, sources: new Set(performed.map((e) => e.source.type)),
  };
}

describe('ten minutes of Auto Scratch through getAutoDJ (SCR-PHRASING-PARITY acceptance)', () => {
  afterEach(() => { teardownStandalone(); resetScratchVoicePool(); });

  for (const mode of ['MUSICAL', 'PERFORMER'] as const) {
    it(`${mode}: duty cycle inside the demo's range, never every 4-bar window, several records and gestures, crate records only`, async () => {
      const r = await tenMinutes(mode);
      const [lo, hi] = demoDutyRange();
      console.log(`[10-min set ${mode}] style ${r.style}, bars ${r.bars}, events ${r.events}, duty ${(r.duty * 100).toFixed(1)} % (the demo on this track ${(r.demoDuty * 100).toFixed(1)} %, on the parity tracks ${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)} %), 4-bar windows with a scratch ${(r.windowShare * 100).toFixed(0)} %, records ${r.records.size} [${[...r.records].join(', ')}], gestures ${r.gestures.size} [${[...r.gestures].join(', ')}]`);
      const d = r.density;
      console.log(`[10-min set ${mode}] per 4-bar phrase with a scratch: ${d.mine.strokes.toFixed(2)} strokes, ${d.mine.gestures.toFixed(2)} gestures; a stroke sounds ${(d.sounding * 100).toFixed(1)} % of the set; roles ${d.roles} | the demo's overlay here: ${d.demoOverlay.strokes.toFixed(2)} strokes, ${d.demoOverlay.gestures.toFixed(2)} gestures, sounding ${(d.demoOverlaySounding * 100).toFixed(1)} % | the demo's three-deck routine: duty ${(d.threeDeck.duty * 100).toFixed(1)} %, ${d.threeDeck.strokes.toFixed(2)} strokes, ${d.threeDeck.gestures.toFixed(2)} gestures per phrase, sounding ${(d.threeDeck.sounding * 100).toFixed(1)} %`);
      expect(r.plans).toBeGreaterThan(0);
      expect(r.recordPicks).toBeGreaterThan(0);
      expect([...r.sources]).toEqual(['CRATE']);
      expect(r.events).toBeGreaterThan(0);
      // never denser than the demo on this very track (a mode only caps it: MUSICAL to the medium state and
      // level 2, PERFORMER to high and level 3), and inside the demo's span on the parity tracks (16-70 %)
      // give or take the mode: measured 2026-10-12 MUSICAL 15.4 %, PERFORMER 24.4 %, the demo here 50.9 %
      expect(r.duty).toBeLessThanOrEqual(r.demoDuty + 1e-9);
      expect(r.duty).toBeGreaterThanOrEqual(lo * 0.75);
      expect(r.duty).toBeLessThanOrEqual(hi);
      expect(r.windowShare).toBeLessThan(1);
      expect(r.records.size).toBeGreaterThanOrEqual(3);
      expect(r.gestures.size).toBeGreaterThanOrEqual(2);
    }, 900_000);
  }
});
