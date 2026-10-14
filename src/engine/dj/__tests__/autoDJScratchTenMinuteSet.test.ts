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
 * with a scratch / bars), strokes and gestures per 4-bar phrase, the share of the set a stroke sounds, the
 * gesture mix, distinct records. P13 (owner 2026-10-12): the demo's overlay is the base - every stroke the
 * demo plans on this track (`planScratch(..., extras: false)`, the demo's plan: the parity test) reaches the
 * executor, and the set matches the demo on the same seed within the demo's own seed variance on this track.
 * Measured 2026-10-13: MUSICAL = the demo exactly (52.5 % duty, 4.91 strokes per phrase, sounding 24.6 %;
 * before P13 13.6 %, 1.16, 1.7 %); PERFORMER the demo + 13 feature strokes.
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
// the demo's overlay folds the section to its routine tempo (render_scratch_section: half-time over this 130 BPM set)
import { scratchTempoFold } from '../scratch/scratchTempo';
import { computeExtendedAnalysis } from '../autodj/activityTimelines';
import { buildDJTrackAnalysis } from '../autodj/trackAnalysis';
import { barIndexAt, barStartBeat, timeAtBeat } from '../autodj/beatGrid';
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
  useDJStore.getState().setAutoDJConfig({ juggleMode: 'OFF', scratchMode: mode, scratchStyle: 'auto', scratchRender: 'section' });
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
  const barOf = (e: ScratchEvent) => barIndexAt(analysis.downbeats, timeAtBeat(analysis.beatGrid, e.executeAtBeat) + 1e-6);
  // the strokes of the ten minutes (the controller plans a phrase ahead: the window past the end is not the set's)
  const performed = events.filter((e) => e.gesture !== 'needleDrop' && e.gesture !== 'needleLift' && barOf(e) < lastBar);
  const busyBars = new Set(performed.map(barOf));
  const windows = new Set([...busyBars].map((b) => Math.floor((b - firstBar) / 4)));
  const records = new Set(performed.map((e) => (e.source.type === 'CRATE' ? e.source.recordId : `not a record: ${e.source.type}`)));
  const gestures = new Set(performed.map((e) => e.gesture));
  // the demo's own overlay on this track: the same planner with no mode cap and no vocal rule (the parity
  // test proves it is the demo's plan, event for event), the same seed, style and profile
  const ctrl = (rig.dj as unknown as { scratch: { deps: { seed: number } } }).scratch;
  const choice = scratchStyleFor('auto', analysis.genre);
  const ctx = buildScratchContext({ perf: { currentDeck: 'A', currentTrack: analysis, currentPosition: startSec, setEnergy: 0.6, targetEnergy: 0.7 } as unknown as DJPerformanceContext, style: choice.style, scratchPermission: 4 })!;
  const demoAt = (seed: number) => planScratch(ctx, { mode: mode === 'OFF' ? 'MUSICAL' : mode, seed, fromBar: firstBar, bars, sectionAt: (b) => overlaySectionAt(analysis, b), profile: choice.profile, records: true, extras: false, tempoFold: scratchTempoFold(BPM) });
  const demo = demoAt(ctrl.deps.seed);
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
  // one measure for the set and for the demo: bars counted from the set's first bar
  const measure = (evs: ReadonlyArray<{ bar: number; gesture: string; beats: number }>) => {
    const mix: Record<string, number> = {};
    for (const e of evs) mix[e.gesture] = (mix[e.gesture] ?? 0) + 1 / Math.max(1, evs.length);
    return { duty: new Set(evs.map((e) => e.bar)).size / bars, ...perWindow(evs), sounding: evs.reduce((n, e) => n + e.beats, 0) / (bars * 4), mix, count: evs.length };
  };
  const ofPlan = (p: ReturnType<typeof demoAt>) => p.events.map((e) => ({ bar: e.bar - firstBar, gesture: e.gesture, beats: e.beats ?? gestureBeats(e.gesture) }));
  const set = measure(performed.map((e) => ({ bar: barOf(e) - firstBar, gesture: e.gesture, beats: e.durationBeats })));
  // every stroke of the demo's plan reached the executor (bar, step, gesture), and what the set added on top
  const keyOf = (bar: number, step: number, gesture: string) => `${bar}:${step}:${gesture}`;
  const scheduled = performed.map((e) => { const b = barOf(e); return keyOf(b, Math.round((e.executeAtBeat - barStartBeat(analysis.downbeats, b)) * 4), e.gesture); });
  const left = [...scheduled];
  const missing: string[] = [];
  for (const e of demo.events) { const i = left.indexOf(keyOf(e.bar, e.step, e.gesture)); if (i < 0) missing.push(keyOf(e.bar, e.step, e.gesture)); else left.splice(i, 1); }
  const added = left;
  const demoMeasure = measure(ofPlan(demo));
  // the demo's seed variance on this track (seeds 1-20): the tolerance the set is held to
  const seeds = Array.from({ length: 20 }, (_, i) => measure(ofPlan(demoAt(i + 1))));
  const spread = (f: (m: typeof set) => number) => { const v = seeds.map(f); const mean = v.reduce((a, b) => a + b, 0) / v.length; return { mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)), min: Math.min(...v), max: Math.max(...v) }; };
  const roles = Object.entries(performed.reduce<Record<string, number>>((m, e) => ({ ...m, [e.role]: (m[e.role] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', ');
  const three = buildThreeDeckRoutine(ctrl.deps.seed).filter((e) => e.gesture !== 'needleDrop' && e.gesture !== 'needleLift');
  const threeDeck = { duty: new Set(three.map((e) => e.bar)).size / 32, ...perWindow(three), sounding: three.reduce((n, e) => n + gestureBeats(e.gesture), 0) / (32 * 4) };
  const gestureNames = [...new Set([...Object.keys(set.mix), ...Object.keys(demoMeasure.mix)])];
  const mixSd = Object.fromEntries(gestureNames.map((g) => [g, spread((m) => m.mix[g] ?? 0).sd]));
  return {
    set, demo: demoMeasure, mixSd, spread: { duty: spread((m) => m.duty), strokes: spread((m) => m.strokes), sounding: spread((m) => m.sounding) },
    roles, threeDeck, demoDuty, style: choice.style, missing, added,
    bars, events: performed.length, duty: busyBars.size / bars, windowShare: windows.size / Math.ceil(bars / 4), records, gestures,
    plans: scratchDJStats.plans - before.plans, recordPicks: demoRoutineStats.overlayRecord - before.records, sources: new Set(performed.map((e) => e.source.type)),
  };
}

describe('ten minutes of Auto Scratch through getAutoDJ (SCR-PHRASING-PARITY acceptance)', () => {
  afterEach(() => { teardownStandalone(); resetScratchVoicePool(); });

  for (const mode of ['MUSICAL', 'PERFORMER'] as const) {
    it(`${mode}: every demo overlay stroke plays; duty, strokes per phrase and gesture mix match the demo within its seed variance; crate records only`, async () => {
      const r = await tenMinutes(mode);
      const [lo, hi] = demoDutyRange();
      console.log(`[10-min set ${mode}] style ${r.style}, bars ${r.bars}, events ${r.events}, duty ${(r.duty * 100).toFixed(1)} % (the demo on this track ${(r.demoDuty * 100).toFixed(1)} %, on the parity tracks ${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)} %), 4-bar windows with a scratch ${(r.windowShare * 100).toFixed(0)} %, records ${r.records.size} [${[...r.records].join(', ')}], gestures ${r.gestures.size} [${[...r.gestures].join(', ')}]`);
      const f = (m: { duty: number; strokes: number; gestures: number; sounding: number }) => `duty ${(m.duty * 100).toFixed(1)} %, ${m.strokes.toFixed(2)} strokes / ${m.gestures.toFixed(2)} gestures per phrase, sounding ${(m.sounding * 100).toFixed(1)} %`;
      const mix = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([g, v]) => `${g} ${(v * 100).toFixed(0)}`).join(' ');
      console.log(`[10-min set ${mode}] set: ${f(r.set)}, ${r.set.count} strokes; roles ${r.roles}; mix ${mix(r.set.mix)}`);
      console.log(`[10-min set ${mode}] demo (same seed): ${f(r.demo)}, ${r.demo.count} strokes; mix ${mix(r.demo.mix)}`);
      const sp = r.spread;
      console.log(`[10-min set ${mode}] demo seeds 1-20: duty ${(sp.duty.mean * 100).toFixed(1)} +- ${(sp.duty.sd * 100).toFixed(1)} % [${(sp.duty.min * 100).toFixed(1)}-${(sp.duty.max * 100).toFixed(1)}], strokes ${sp.strokes.mean.toFixed(2)} +- ${sp.strokes.sd.toFixed(2)} [${sp.strokes.min.toFixed(2)}-${sp.strokes.max.toFixed(2)}], sounding ${(sp.sounding.mean * 100).toFixed(1)} +- ${(sp.sounding.sd * 100).toFixed(1)} % | three-deck ${f(r.threeDeck)}`);
      console.log(`[10-min set ${mode}] demo strokes missing ${r.missing.length} [${r.missing.slice(0, 12).join(' ')}], added on top ${r.added.length} [${r.added.slice(0, 12).join(' ')}]`);
      // P13: every stroke the demo's overlay plans on this track reaches the executor, in every mode
      expect(r.missing).toEqual([]);
      // the set against the demo on the same track and seed, held to the demo's own seed variance (one standard
      // deviation over seeds 1-20 on this track: duty 1.5 %, 0.18 strokes per phrase, sounding 0.3 %, each
      // gesture's share): MUSICAL adds only the vocal rule's answers (none here), PERFORMER its short features on top
      const tol = mode === 'MUSICAL' ? 1 : 3;
      expect(Math.abs(r.set.duty - r.demo.duty)).toBeLessThanOrEqual(tol * r.spread.duty.sd);
      expect(Math.abs(r.set.strokes - r.demo.strokes)).toBeLessThanOrEqual(tol * r.spread.strokes.sd);
      expect(Math.abs(r.set.sounding - r.demo.sounding)).toBeLessThanOrEqual(tol * r.spread.sounding.sd);
      // (PERFORMER's features play gestures the demo's profile does not: the demo's own gestures keep their share)
      for (const [g, sd] of Object.entries(r.mixSd).filter(([g]) => mode === 'MUSICAL' || g in r.demo.mix)) expect([g, Math.abs((r.set.mix[g] ?? 0) - (r.demo.mix[g] ?? 0)) <= tol * Math.max(sd, 0.005)]).toEqual([g, true]);
      expect(r.plans).toBeGreaterThan(0);
      expect(r.recordPicks).toBeGreaterThan(0);
      expect([...r.sources]).toEqual(['CRATE']);
      expect(r.events).toBeGreaterThan(0);
      expect(r.windowShare).toBeLessThan(1);
      expect(r.records.size).toBeGreaterThanOrEqual(3);
      expect(r.gestures.size).toBeGreaterThanOrEqual(2);
    }, 900_000);
  }
});
