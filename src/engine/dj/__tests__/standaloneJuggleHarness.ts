/**
 * Shared rig for the stand-alone juggle tests (plan 2026-10-11-dj-juggling,
 * R4 and P4.LS): deck A plays an analysed corpus track on the fake clock,
 * deck B is stopped and empty, the set is CRUISING, Auto DJ is enabled and
 * playing with nothing preloaded. The `vi.mock` calls stay in each test file
 * (they are hoisted per file); the files pass their hoisted holder here.
 */
import { vi } from 'vitest';
import { useDJStore } from '@/stores/useDJStore';
import { useDJPlaylistStore, type PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { getAutoDJ } from '../DJAutoDJ';
import { corpusAnalysis, corpusTrack, type CorpusId } from '../autodj/testing/corpus';
import { setSessionController, DJSessionController } from '../autodj/sessionController';
import { getDecisionLog } from '../autodj/decisionLog';
import type { DJTrackAnalysis } from '../autodj/types';
import { fakeDeck, type AutoDJInternals, type FakeDeck } from './juggleTransitionHarness';

export interface StandaloneHolder {
  engine: unknown;
  pipeline: unknown;
  crossfader: Array<{ at: number; v: number; masterPos: number }>;
  doubles: number;
}

export interface StandaloneRig {
  dj: AutoDJInternals;
  decks: { A: FakeDeck; B: FakeDeck };
  /** The double's start: its position and the master's at that moment. */
  start: { idlePos: number; masterPos: number } | null;
}

export async function setupStandalone(
  holder: StandaloneHolder,
  opts: { track: CorpusId; bpm: number; startSec: number; analysis?: DJTrackAnalysis; durationSec?: number },
): Promise<StandaloneRig> {
  await import('../DJTrackLoader');
  vi.useFakeTimers();
  holder.doubles = 0;
  holder.crossfader.length = 0;
  getDecisionLog().clear();
  const { DJEngine } = await vi.importActual<typeof import('../DJEngine')>('../DJEngine');
  const { DJPipeline } = await vi.importActual<typeof import('../DJPipeline')>('../DJPipeline');
  holder.pipeline = Object.create(DJPipeline.prototype);
  const rig = { start: null } as StandaloneRig;
  rig.decks = {
    A: fakeDeck('A', opts.startSec, true),
    B: fakeDeck('B', 0, false, (pos) => { rig.start = { idlePos: pos, masterPos: rig.decks.A.position() }; }),
  };
  const durationSec = opts.durationSec ?? 600;
  rig.decks.A.audioPlayer.getDuration = () => durationSec;
  const record = (v: number) => { holder.crossfader.push({ at: Date.now(), v, masterPos: rig.decks.A.position() }); };
  holder.engine = Object.assign(Object.create(DJEngine.prototype), {
    getDeck: (id: 'A' | 'B') => rig.decks[id], remapInstrumentIds: () => {}, tryAutoLoadStems: async () => {}, recorder: null, _pendingTrackSource: null,
    mixer: { setCrossfader: record, crossfaderSettledAt: () => 0 }, setCrossfader: record,
  });
  const pl = useDJPlaylistStore.getState();
  const id = `standalone-${Date.now()}`;
  const tracks: PlaylistTrack[] = [opts.track, 'compatibleKey'].map((n, i) => ({ id: n, fileName: `${n}.wav`, trackName: n, format: 'WAV', bpm: opts.bpm, duration: durationSec, addedAt: i, musicalKey: 'A minor', energy: 0.8 }));
  pl.importPlaylists([{ id, name: 'standalone juggle', createdAt: Date.now(), updatedAt: Date.now(), tracks }]);
  pl.setActivePlaylist(id);
  const s = useDJStore.getState();
  s.setAutoDJConfig({ shuffle: false, style: 'Club', transitionBars: 8, juggleIntensity: -1 });
  const analysis = opts.analysis ?? corpusAnalysis(opts.track);
  const grid = { beats: analysis.beatGrid.beats.map((b) => b.time), downbeats: analysis.downbeats.bars.map((b) => b.start), bpm: opts.bpm, timeSignature: 4 };
  if (!opts.analysis) { const t = corpusTrack(opts.track); grid.beats = t.beats; grid.downbeats = t.downbeats; }
  s.setDeckState('A', {
    fileName: `${opts.track}.wav`, trackName: opts.track, isPlaying: true, detectedBPM: opts.bpm, effectiveBPM: opts.bpm, durationMs: durationSec * 1000,
    audioPosition: opts.startSec, pitchOffset: 0, trackAnalysis: analysis, beatGrid: grid, analysisState: 'ready',
  });
  s.setDeckState('B', { fileName: null, trackName: '', isPlaying: false, trackAnalysis: null, beatGrid: null, audioPosition: 0, pitchOffset: 0, keyLockEnabled: false });
  s.setCrossfader(0);
  s.setAutoDJJuggleTelemetry(null);
  s.setAutoDJEnabled(true);
  s.setAutoDJStatus('playing');
  s.setAutoDJTrackIndices(0, 1);
  vi.spyOn(DJSessionController.prototype, 'setPhase', 'get').mockReturnValue('CRUISING');
  const controller = new DJSessionController();
  setSessionController(controller);
  controller.startSession(tracks.map((track, index) => ({ index, id: track.id, name: track.trackName, artist: null, track })), 0);
  controller.onTrackStarted(0, analysis, { bpm: opts.bpm, key: 'A minor', energy: 0.8 });
  const dj = getAutoDJ() as unknown as AutoDJInternals;
  dj.transitionCancel = null; dj.execution = null; dj.preloading = false; dj.transitionSweepStarted = false;
  dj.activeDeck = 'A'; dj.idleDeck = 'B'; dj.preloadedDeck = null; dj.plan = null; dj.incomingAnalysis = null; dj.preRenderedTrack = null;
  // A fresh juggle controller per test: the previous test's juggle would hold the cooldown.
  (dj as unknown as { juggle: unknown }).juggle = null;
  rig.dj = dj;
  return rig;
}

/** Run the poll loop on the fake clock, keeping the store positions as the deck ticker does. */
export async function runStandalone(rig: StandaloneRig, ms: number, until: () => boolean = () => false, stepMs = 50): Promise<void> {
  for (let t = 0; t < ms && !until(); t += stepMs) {
    await vi.advanceTimersByTimeAsync(stepMs);
    const s = useDJStore.getState();
    s.setDeckState('A', { audioPosition: rig.decks.A.position() });
    s.setDeckState('B', { audioPosition: rig.decks.B.position() });
  }
}

export function teardownStandalone(): void {
  const dj = getAutoDJ() as unknown as AutoDJInternals;
  dj.stopPolling();
  delete (dj as { preloadNextTrack?: unknown }).preloadNextTrack;
  dj.getJuggle().abort('test end');
  useDJStore.getState().setAutoDJEnabled(false);
  useDJStore.getState().setAutoDJStatus('idle');
  setSessionController(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
}
