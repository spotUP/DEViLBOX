/**
 * Reachability R7 (scratch ledger SCR-P7.R7; owner scratch plan sections 4, 8, 13, 68, Gate I):
 * with Auto DJ playing the corpus `breakdowns` track and Auto Scratch MUSICAL, the Auto DJ's own
 * poll loop (`startPolling`, the loop `enable()` starts) ticks the scratch performer, which finds
 * the opportunity, selects the source, plans phrases with `planPhrase`, and every planned event
 * is executed by the real `ScratchExecutor` within [-8, +10] ms of its grid beat; the record
 * voice strokes (a crate source never touches the deck). The Auto DJ decides WHETHER: the same
 * run with Auto Scratch OFF leaves every count at 0.
 *
 * Fake timers drive the poll and the executor; the deck is a fake whose position runs on the
 * fake clock; the record voice renders through the real worklet on an offline context.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { installRealWebAudio, resolveWorkletsFromPublic, servePublicToFetch } from '@/test/audio/realWebAudio';

const SR = 48000;
const holder = vi.hoisted(() => ({ engine: null as unknown, ctx: null as unknown, pipeline: null as unknown }));

vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  return { ...actual, now: () => (holder.ctx as BaseAudioContext).currentTime, getContext: () => ({ rawContext: holder.ctx, state: 'running' }) };
});
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
  return { ...actual, preRenderTrack: async () => null, loadPlaylistTrackToDeck: async () => false, loadPreRenderedTrackToDeck: async () => false };
});
vi.mock('../DJPipeline', async (orig) => {
  const actual = await orig<typeof import('../DJPipeline')>();
  return { ...actual, getDJPipeline: () => holder.pipeline };
});
vi.mock('../DJPerSongFx', () => ({ applyPerSongMasterFx: () => {} }));

import { useDJStore } from '@/stores/useDJStore';
import { useDJPlaylistStore, type PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { getAutoDJ } from '../DJAutoDJ';
import { corpusAnalysis, corpusTrack } from '../autodj/testing/corpus';
import { setSessionController, DJSessionController } from '../autodj/sessionController';
import { fakeDeck } from './juggleTransitionHarness';
import { ScratchExecutor, scratchExecutorStats, type ScratchRun } from '../scratch/ScratchExecutor';
import { scratchOpportunityStats } from '../scratch/scratchOpportunity';
import { scratchSourceStats } from '../scratch/ScratchSourceSelector';
import { scratchPlacementStats } from '../scratch/scratchPlacement';
import { scratchVoiceStats } from '../scratch/ScratchRecordVoice';
import { getScratchVoicePool, resetScratchVoicePool } from '../scratch/scratchVoicePool';
import { timeAtBeat, barStartBeat, fractionalBeatAt } from '../autodj/beatGrid';
import { getDecisionLog } from '../autodj/decisionLog';
import { scratchPhysicsStats, isPhysical } from '../scratch/scratchPhysics';
import { getGesture } from '../scratch/scratchGestureCatalog';

type Internals = {
  activeDeck: 'A' | 'B'; idleDeck: 'A' | 'B'; preloadedDeck: 'A' | 'B' | null; plan: unknown; execution: unknown; transitionCancel: unknown;
  preloading: boolean; scratch: unknown; startPolling(): void; stopPolling(): void;
};

/** A fake deck with the scratch surface a deck gesture would touch (counted; a crate gesture must touch none). */
function scratchDeck(startSec: number) {
  const d = fakeDeck('A', startSec, true);
  const touched = { velocity: 0, pattern: 0, snapshot: 0 };
  return Object.assign(d, {
    touched,
    setScratchVelocity: () => { touched.velocity++; }, playPattern: () => { touched.pattern++; }, stopPattern: () => {}, finishPatternCycle: () => {},
    captureScratchSnapshot: () => ({ rate: 1, channelGain: 1, captureFrozen: false, suppressNotes: false }),
    restoreScratchSnapshot: () => { touched.snapshot++; }, recueScratch: () => ({ recued: true, mode: 'audio' as const, returnsToAnchor: true }),
    getEffectiveBPM: () => 125,
  });
}

async function run(mode: 'MUSICAL' | 'OFF') {
  const track = corpusAnalysis('breakdowns');
  const breakdown = track.sections.find((s) => s.kind === 'breakdown')!;
  const startSec = timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, breakdown.startBar - 2)) + 0.05;
  const ctx = new OfflineAudioContext(2, SR, SR);
  holder.ctx = ctx;
  const samplerInput = ctx.createGain();
  samplerInput.connect(ctx.destination);
  const deck = scratchDeck(startSec);
  const idle = fakeDeck('B', 0, false);
  holder.engine = { getDeck: (id: 'A' | 'B') => (id === 'A' ? deck : idle), mixer: { samplerInput, setCrossfader: () => {} }, setCrossfader: () => {} };
  resetScratchVoicePool();
  await getScratchVoicePool().ready; // the ring worklets load before the fake clock runs

  const pl = useDJPlaylistStore.getState();
  const id = `scratch-r7-${Date.now()}`;
  const tracks: PlaylistTrack[] = (['breakdowns', 'steady'] as const).map((n, i) => ({ id: n, fileName: `${n}.wav`, trackName: n, format: 'WAV', bpm: 125, duration: 600, addedAt: i, musicalKey: 'A minor', energy: 0.7 }));
  pl.importPlaylists([{ id, name: 'scratch r7', createdAt: Date.now(), updatedAt: Date.now(), tracks }]);
  pl.setActivePlaylist(id);
  const s = useDJStore.getState();
  s.setAutoDJConfig({ shuffle: false, style: 'Club', juggleMode: 'OFF', scratchMode: mode, scratchStyle: 'boomBap' });
  s.setDeckState('A', { fileName: 'breakdowns.wav', trackName: 'breakdowns', isPlaying: true, detectedBPM: 125, effectiveBPM: 125, durationMs: 600_000, audioPosition: startSec, pitchOffset: 0, trackAnalysis: track });
  s.setDeckState('B', { fileName: null, trackName: '', isPlaying: false, trackAnalysis: null, beatGrid: null, audioPosition: 0 });
  s.setAutoDJEnabled(true);
  s.setAutoDJStatus('playing');
  s.setAutoDJTrackIndices(0, 1);
  vi.spyOn(DJSessionController.prototype, 'setPhase', 'get').mockReturnValue('CRUISING');
  const controller = new DJSessionController();
  setSessionController(controller);
  controller.startSession(tracks.map((t, index) => ({ index, id: t.id, name: t.trackName, artist: null, track: t })), 0);
  controller.onTrackStarted(0, track, { bpm: 125, key: 'A minor', energy: 0.7 });

  const dj = getAutoDJ() as unknown as Internals;
  dj.activeDeck = 'A'; dj.idleDeck = 'B'; dj.preloadedDeck = null; dj.plan = null; dj.execution = null; dj.transitionCancel = null; dj.preloading = false; dj.scratch = null;

  const runs: Array<{ run: ScratchRun; beatSec: number }> = [];
  const original = ScratchExecutor.prototype.schedule;
  vi.spyOn(ScratchExecutor.prototype, 'schedule').mockImplementation(function (this: ScratchExecutor, e) {
    const r = original.call(this, e);
    runs.push({ run: r, beatSec: 60 / 125 });
    return r;
  });
  const before = {
    find: scratchOpportunityStats.find, select: scratchSourceStats.select, phrase: scratchPlacementStats.planPhrase,
    started: scratchExecutorStats.started, strokes: scratchVoiceStats.strokes, decisions: getDecisionLog().counts.SCRATCH ?? 0,
    simulations: scratchPhysicsStats.simulations,
  };

  vi.useFakeTimers();
  dj.startPolling();
  const endSec = timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, breakdown.startBar + 8));
  while (deck.position() < endSec) await vi.advanceTimersByTimeAsync(20);
  dj.stopPolling();
  // the window already planned plays out (the performer plans a phrase ahead)
  for (let t = 0; t < 60_000 && runs.some((r) => r.run.state === 'pending' || r.run.state === 'running' || r.run.state === 'ending'); t += 20) await vi.advanceTimersByTimeAsync(20);
  vi.useRealTimers();
  await getScratchVoicePool().settled();

  const newDecisions = (getDecisionLog().counts.SCRATCH ?? 0) - before.decisions;
  return {
    track, deck, runs, decisions: newDecisions > 0 ? getDecisionLog().list(newDecisions, 'SCRATCH') : [], memory: controller.memory.snapshot(),
    counts: {
      find: scratchOpportunityStats.find - before.find, select: scratchSourceStats.select - before.select, phrase: scratchPlacementStats.planPhrase - before.phrase,
      started: scratchExecutorStats.started - before.started, strokes: scratchVoiceStats.strokes - before.strokes,
      decisions: (getDecisionLog().counts.SCRATCH ?? 0) - before.decisions,
      simulations: scratchPhysicsStats.simulations - before.simulations,
    },
  };
}

describe('Auto DJ scratches through the decks (SCR-P7.R7)', () => {
  beforeAll(() => { installRealWebAudio(); resolveWorkletsFromPublic(); servePublicToFetch(); corpusAnalysis('breakdowns'); corpusTrack('breakdowns'); }, 120_000);
  afterEach(() => {
    const dj = getAutoDJ() as unknown as Internals;
    dj.stopPolling();
    useDJStore.getState().setAutoDJEnabled(false);
    useDJStore.getState().setAutoDJStatus('idle');
    useDJStore.getState().setAutoDJConfig({ scratchMode: 'MUSICAL', scratchStyle: 'auto' });
    setSessionController(null);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('MUSICAL into a breakdown: opportunity, source, planPhrase, every planned event executed on the grid, the voice strokes', async () => {
    const { counts, runs, deck, track, decisions, memory } = await run('MUSICAL');
    expect(counts.find).toBeGreaterThanOrEqual(1);
    expect(counts.select).toBeGreaterThanOrEqual(1);
    expect(counts.phrase).toBeGreaterThanOrEqual(1);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(counts.started).toBe(runs.length);
    expect(counts.decisions).toBeGreaterThanOrEqual(1);
    // SCR-P7.12: one decision per performed phrase with the section 65 fields; the set remembers each phrase
    for (const d of decisions) {
      expect(d.details?.source, 'source').toBeTruthy();
      expect(typeof d.details?.gesture).toBe('string');
      expect(Number.isFinite(d.details?.placementBeat as number)).toBe(true);
      expect(d.details?.durationBeats as number).toBeGreaterThan(0);
    }
    expect(memory.scratchPhrases).toBe(counts.decisions);
    expect(memory.recentScratchGestures).toContain(decisions[decisions.length - 1]!.details!.gesture);
    const crate = runs.filter((r) => r.run.event.source.type === 'CRATE');
    if (crate.length === runs.length) {
      // a crate source plays on the record voice and never touches the deck (section 16)
      expect(counts.strokes).toBeGreaterThan(0);
      expect(deck.touched.velocity + deck.touched.pattern).toBe(0);
    } else {
      expect(deck.touched.velocity + deck.touched.pattern + counts.strokes).toBeGreaterThan(0);
    }
    // the stroke was handed to the engine for its grid beat plus its humanize offset, inside [-8, +10] ms
    for (const { run: r, beatSec } of runs) {
      expect(r.startedBeat).not.toBeNull();
      const offMs = (r.startedBeat! - r.event.executeAtBeat) * beatSec * 1000;
      expect(offMs, `${r.event.gesture} at beat ${r.event.executeAtBeat}`).toBeGreaterThanOrEqual(-8 - 6); // + one 5 ms tick for a deck stroke
      expect(offMs).toBeLessThanOrEqual(10 + 6);
      expect(Math.abs(offMs - r.event.humanizeMs)).toBeLessThanOrEqual(6);
    }
    // SCR-PG-BR: every record stroke the model performs (not throws, not flourishes) is one turntable simulation
    const physical = runs.filter((r) => r.run.event.source.type === 'CRATE' && isPhysical(getGesture(r.run.event.gesture))).length;
    expect(physical).toBeGreaterThan(0);
    expect(counts.simulations).toBe(physical);
    // the style's FX rides on every planned event (SCR-PG-A5): Boom Bap, its FX amount 0.1 x the genre's scale
    for (const { run: r } of runs) {
      expect(r.event.fx?.style).toBe('boomBap');
      expect(r.event.fx!.amount).toBeGreaterThan(0);
      expect(r.event.fx!.amount).toBeLessThanOrEqual(0.1 * 2);
    }
    // the planned beats sit on the track's own downbeat grid (1/16 steps of a bar)
    for (const { run: r } of runs) {
      const t = timeAtBeat(track.beatGrid, r.event.executeAtBeat);
      expect(Math.abs(fractionalBeatAt(track.beatGrid, t) - r.event.executeAtBeat)).toBeLessThan(1e-6);
    }
  }, 180_000);

  it('Auto Scratch OFF: the same run plans and performs nothing', async () => {
    const { counts, runs, deck } = await run('OFF');
    expect(counts).toEqual({ find: 0, select: 0, phrase: 0, started: 0, strokes: 0, decisions: 0, simulations: 0 });
    expect(runs).toHaveLength(0);
    expect(deck.touched.velocity + deck.touched.pattern).toBe(0);
  }, 180_000);
});
