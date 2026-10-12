/**
 * Gates S, V, R, L, M and the automated invariants (plan sections 38, 39,
 * 43, 62, 66): the real session controller, planner, executor and quality
 * evaluator run whole sets on a virtual clock through DJSetSimulator. Hours
 * of performance in seconds; failures injected per track; every transition
 * checked against the invariants; metrics asserted with the plan's numbers.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const holder = vi.hoisted(() => ({ engine: null as unknown }));
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));

import { CORPUS_IDS, corpusAnalysis, corpusTrack, corpusPipelineAnalysis } from '../autodj/testing/corpus';
import { buildDJTrackAnalysis } from '../autodj/trackAnalysis';
import { expandCorpus, fakeEngine, simulateSet, simTrack, type FailureKind, type SimTrack } from '../autodj/testing/setSimulator';
import { getDecisionLog } from '../autodj/decisionLog';
import type { DJTrackAnalysis } from '../autodj/types';

function base(): DJTrackAnalysis[] {
  return CORPUS_IDS.filter((id) => id !== 'short' && id !== 'silence' && id !== 'uncertainKey').map((id) => corpusAnalysis(id));
}

function tracksOf(analyses: DJTrackAnalysis[]): SimTrack[] {
  return analyses.map((a) => simTrack(a.id, a));
}

async function run(tracks: SimTrack[], durationSec: number, style: 'Classic' | 'Club' | 'Festival' = 'Club', maxTransitions?: number) {
  const engine = fakeEngine();
  holder.engine = engine;
  return simulateSet({ tracks, engine, durationSec, style, userBars: 8, maxTransitions });
}

describe('long-set and autonomous performance (Gates S, V, L, N)', () => {
  beforeAll(() => { base(); }, 180_000);
  beforeEach(() => { getDecisionLog().clear(); });

  it('30 minutes: transitions complete, invariants hold, no silence, planning stays cheap', async () => {
    const r = await run(tracksOf(base()), 30 * 60);
    expect(r.elapsedSec).toBeGreaterThanOrEqual(30 * 60 - 1);
    expect(r.metrics.transitions).toBeGreaterThanOrEqual(8);
    expect(r.metrics.silentMoments).toBe(0);
    expect(r.metrics.invariantFailures).toBe(0);
    expect(r.metrics.emergencies).toBe(0);
    expect(r.metrics.meanQuality).toBeGreaterThan(0.5);
    expect(r.metrics.planningMsMax).toBeLessThan(500);
    expect(r.transitions.every((t) => t.completed)).toBe(true);
  }, 120_000);

  it('1 hour: variety, no style run longer than three, no key conflicts at high confidence', async () => {
    const r = await run(tracksOf(expandCorpus(base(), 25)), 60 * 60);
    expect(r.metrics.transitions).toBeGreaterThanOrEqual(15);
    expect(r.metrics.distinctStyles).toBeGreaterThanOrEqual(3);
    expect(r.metrics.distinctLengths).toBeGreaterThanOrEqual(2);
    expect(r.metrics.maxStyleRun).toBeLessThanOrEqual(3);
    // A clash at high confidence only when the pool offers nothing else: at most one in an hour of 25 tracks.
    expect(r.metrics.keyConflicts, r.transitions.filter((t) => t.keyClash).map((t) => `${t.from} -> ${t.to}`).join(', ')).toBeLessThanOrEqual(1);
    expect(r.metrics.energyCoherence).toBeGreaterThan(0.5);
    expect(r.metrics.invariantFailures, JSON.stringify(r.transitions.flatMap((t) => t.invariants.filter((i) => !i.ok).map((i) => `${t.style} ${t.from}->${t.to}: ${i.name} ${i.detail}`)))).toBe(0);
  }, 180_000);

  it('2 hours: memory and log bounded, timers released, no repeats before the pool is exhausted', async () => {
    const r = await run(tracksOf(expandCorpus(base(), 50)), 2 * 60 * 60, 'Festival');
    expect(r.metrics.transitions).toBeGreaterThanOrEqual(25);
    expect(r.metrics.memoryRecords).toBeLessThanOrEqual(64);
    expect(r.metrics.decisionLogSize).toBeLessThanOrEqual(400);
    expect(r.metrics.pendingTimersAtEnd).toBe(0);
    // 50 distinct tracks, fewer than 50 plays: nothing repeats.
    if (r.metrics.tracksPlayed <= 50) {
      const seen = new Map<string, number[]>();
      r.transitions.forEach((t, i) => { seen.set(t.to, [...(seen.get(t.to) ?? []), i]); });
      const dupes = [...seen.entries()].filter(([, v]) => v.length > 1);
      expect(r.metrics.trackRepeats, JSON.stringify({ dupes, first: r.transitions[0]?.from, played: r.metrics.tracksPlayed })).toBe(0);
    }
    expect(r.metrics.invariantFailures, JSON.stringify(r.transitions.flatMap((t) => t.invariants.filter((i) => !i.ok).map((i) => `${t.style} ${t.from}->${t.to}: ${i.name} ${i.detail}`)))).toBe(0);
  }, 300_000);

  it('4 hours, 100 tracks: no degradation (planning time, quality, variety stable between the first and last quarter)', async () => {
    const r = await run(tracksOf(expandCorpus(base(), 100)), 4 * 60 * 60, 'Classic');
    expect(r.metrics.transitions).toBeGreaterThanOrEqual(50);
    const n = r.transitions.length;
    const q1 = r.transitions.slice(0, Math.floor(n / 4));
    const q4 = r.transitions.slice(n - Math.floor(n / 4));
    const meanQ = (xs: typeof q1) => xs.reduce((a, t) => a + (t.quality?.overall ?? 0), 0) / xs.length;
    const meanP = (xs: typeof q1) => xs.reduce((a, t) => a + t.planningMs, 0) / xs.length;
    expect(meanQ(q4)).toBeGreaterThan(meanQ(q1) - 0.15);
    expect(meanP(q4)).toBeLessThan(Math.max(50, meanP(q1) * 3));
    expect(new Set(q4.map((t) => t.style)).size).toBeGreaterThanOrEqual(2);
    expect(r.metrics.silentMoments).toBe(0);
    expect(r.metrics.pendingTimersAtEnd).toBe(0);
    expect(r.metrics.invariantFailures).toBe(0);
    // Hear the consequence, adapt: quality recorded for every planned transition.
    expect(r.transitions.filter((t) => !t.legacy).every((t) => t.quality !== null)).toBe(true);
  }, 600_000);

  it('10, 25, 50 and 100 track runs all complete with varied, explained transitions', async () => {
    for (const count of [10, 25, 50, 100]) {
      const r = await run(tracksOf(expandCorpus(base(), count)), 8 * 60 * 60, 'Club', count);
      expect(r.metrics.transitions, `${count} tracks`).toBeGreaterThanOrEqual(Math.min(count, 10));
      expect(r.metrics.distinctStyles, `${count} tracks`).toBeGreaterThanOrEqual(2);
      expect(r.metrics.silentMoments, `${count} tracks`).toBe(0);
      expect(getDecisionLog().counts.PLAN_TRANSITION ?? 0, `${count} tracks`).toBeGreaterThanOrEqual(Math.min(count, 10));
      expect(getDecisionLog().counts.SELECT_NEXT_TRACK ?? 0, `${count} tracks`).toBeGreaterThanOrEqual(Math.min(count, 10));
    }
  }, 600_000);
});

describe('failure resilience (Gates R, M): playback never stops', () => {
  const failures: FailureKind[] = ['preload', 'decode', 'analysis', 'missingKey', 'missingGrid', 'malformedTracker', 'noCue', 'deckFailure', 'effectFailure', 'unexpectedLength', 'short', 'silence', 'transitionTimeout'];

  function trackWithFailure(kind: FailureKind, i: number): SimTrack {
    const steady = corpusTrack('steady');
    const pipe = corpusPipelineAnalysis(steady);
    switch (kind) {
      case 'missingKey': return simTrack(`fail-${kind}-${i}`, buildDJTrackAnalysis({ id: `fail-${kind}-${i}`, durationSec: steady.durationSec, analysis: { ...pipe, musicalKey: 'Unknown', keyConfidence: 0 }, extended: null }), kind);
      case 'missingGrid': return simTrack(`fail-${kind}-${i}`, buildDJTrackAnalysis({ id: `fail-${kind}-${i}`, durationSec: steady.durationSec, analysis: { ...pipe, beats: [], downbeats: [], bpmConfidence: 0 }, extended: null }), kind);
      case 'malformedTracker': {
        const song = { name: 'broken', format: 'MOD', patterns: [{ id: 'p', name: 'p', length: 64, channels: [] }], instruments: [], songPositions: [0, 5, 9], songLength: 3, numChannels: 0, initialSpeed: 0, initialBPM: 0 } as unknown as import('@/engine/TrackerReplayer').TrackerSong;
        return simTrack(`fail-${kind}-${i}`, buildDJTrackAnalysis({ id: `fail-${kind}-${i}`, durationSec: steady.durationSec, analysis: pipe, extended: null, song }), kind);
      }
      case 'noCue': { const a = JSON.parse(JSON.stringify(corpusAnalysis('steady'))) as DJTrackAnalysis; a.id = `fail-${kind}-${i}`; a.cuePoints = {}; a.sections = []; a.phrases = []; return simTrack(a.id, a, kind); }
      case 'unexpectedLength': { const a = JSON.parse(JSON.stringify(corpusAnalysis('longIntro'))) as DJTrackAnalysis; a.id = `fail-${kind}-${i}`; a.durationSec = 20; a.cuePoints.finalBeat = 20; return simTrack(a.id, a, kind); }
      case 'short': { const a = JSON.parse(JSON.stringify(corpusAnalysis('short'))) as DJTrackAnalysis; a.id = `fail-${kind}-${i}`; return simTrack(a.id, a, kind); }
      case 'silence': { const a = JSON.parse(JSON.stringify(corpusAnalysis('silence'))) as DJTrackAnalysis; a.id = `fail-${kind}-${i}`; return simTrack(a.id, a, kind); }
      default: { const a = JSON.parse(JSON.stringify(corpusAnalysis('steady'))) as DJTrackAnalysis; a.id = `fail-${kind}-${i}`; return simTrack(a.id, a, kind); }
    }
  }

  it('every failure kind in turn: the set continues on the remaining deck, no hard cut from a software failure, the log says what happened', async () => {
    const good = tracksOf(expandCorpus(base(), 14));
    const tracks: SimTrack[] = [];
    failures.forEach((kind, i) => { tracks.push(good[i]); tracks.push(trackWithFailure(kind, i)); });
    tracks.push(good[13]);
    const engine = fakeEngine();
    holder.engine = engine;
    const r = await simulateSet({ tracks, engine, durationSec: 6 * 60 * 60, style: 'Club', userBars: 8, maxTransitions: 40 });
    expect(r.metrics.transitions).toBeGreaterThanOrEqual(20);
    expect(r.metrics.silentMoments).toBe(0);
    expect(r.metrics.preloadFailures).toBeGreaterThanOrEqual(2);
    expect(r.metrics.analysisFailures).toBeGreaterThanOrEqual(1);
    expect(r.metrics.legacyTransitions).toBeGreaterThanOrEqual(1);
    // Deck failure and the hanging deck end on the emergency crossfade, never a cut.
    expect(r.metrics.emergencies).toBeGreaterThanOrEqual(2);
    expect(r.transitions.every((t) => t.style !== 'hardCut')).toBe(true);
    expect(r.transitions.every((t) => t.completed || t.fellBack === 'emergency')).toBe(true);
    const log = getDecisionLog();
    expect((log.counts.EMERGENCY ?? 0) + (log.counts.FALLBACK ?? 0) + (log.counts.EXECUTE_TRANSITION ?? 0)).toBeGreaterThan(0);
    // Missing key / grid / cue tracks got conservative plans (no creative style on low confidence).
    // A track without cues, sections and phrases keeps a trusted beat grid and downbeats: the juggle gates
    // (grid and phrase confidence, ladder fit on the downbeat phrase grid) hold, and with the juggle budget
    // open the juggle transition outranks the blends (owner decision 2026-10-12, JUGGLE-FOLLOWUPS a, juggling
    // plan section 24). A missing grid fails those gates: blends only.
    for (const t of r.transitions) {
      const to = tracks.find((x) => x.id === t.to);
      if (to?.failure === 'missingGrid') expect(['longBlend', 'shortBlend', 'legacy'], t.to).toContain(t.style);
      if (to?.failure === 'noCue') expect(['longBlend', 'shortBlend', 'legacy', 'juggleTransition'], t.to).toContain(t.style);
    }
    // The player state is sane at the end: one deck playing, crossfader on its side.
    const playing = (engine.decks.A.playing ? 1 : 0) + (engine.decks.B.playing ? 1 : 0);
    expect(playing).toBeGreaterThanOrEqual(1);
  }, 300_000);
});
