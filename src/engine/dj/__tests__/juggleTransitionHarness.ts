/**
 * Shared harness for the juggle-transition reachability tests (plan
 * 2026-10-11-dj-juggling, R2 and R3): fake decks whose positions run on the
 * fake clock at their rate (bends included), that count seeks landing while
 * they play; a two-track corpus playlist; Auto DJ set up in
 * transition-pending with the next track pre-rendered and the transition
 * anticipated through Auto DJ's own `anticipate()`.
 *
 * The `vi.mock` calls stay in each test file (they are hoisted per file);
 * the files' mocks call `loadIncoming()` for the pre-rendered load.
 */
import { vi } from 'vitest';
import { useDJStore } from '@/stores/useDJStore';
import { useDJPlaylistStore, type PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { getAutoDJ } from '../DJAutoDJ';
import { corpusAnalysis, corpusPipelineAnalysis, corpusTrack, type CorpusId } from '../autodj/testing/corpus';
import { computeExtendedAnalysis } from '../autodj/activityTimelines';
import { setSessionController, DJSessionController } from '../autodj/sessionController';
import type { DJTrackAnalysis, DJTransitionPlan } from '../autodj/types';
import type { DJJuggleController } from '../autodj/juggle/juggleController';
import type { JuggleMode } from '../autodj/juggle/juggleTypes';

export const BPM = 126;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const OUTGOING: CorpusId = 'steady';
export const INCOMING: CorpusId = 'compatibleKey';

export type AutoDJInternals = {
  activeDeck: 'A' | 'B'; idleDeck: 'A' | 'B'; preloadedDeck: 'A' | 'B' | null; plan: DJTransitionPlan | null; pollCount: number;
  transitionCancel: (() => void) | null; execution: { plan: DJTransitionPlan } | null; preloading: boolean; incomingAnalysis: DJTrackAnalysis | null;
  transitionSweepStarted: boolean; preRenderedTrack: unknown;
  startPolling(): void; stopPolling(): void; getJuggle(): DJJuggleController;
  anticipate(track: PlaylistTrack, index: number, preRendered: { duration: number; analysis?: unknown }): void;
};

export interface HarnessHolder {
  engine: unknown;
  pipeline: unknown;
  loads: number;
  /** Every mixer crossfader write: fake-clock time, value and the master (deck A) position then. */
  crossfader: Array<{ at: number; v: number; masterPos: number }>;
  /** Seconds the incoming deck's grid is shifted against its audio (an off-grid start for R2). */
  incomingGridShiftSec: number;
}

export type FakeDeck = ReturnType<typeof fakeDeck>;

/** A deck whose position advances at its rate on the fake clock; records bends, and seeks that land while it plays. */
export function fakeDeck(id: 'A' | 'B', startSec: number, playing: boolean, onPlay: (positionSec: number) => void = () => {}) {
  let pos = startSec, rate = 1, at = Date.now(), isPlaying = playing;
  let restore: ReturnType<typeof setTimeout> | null = null;
  const position = () => pos + (isPlaying ? ((Date.now() - at) / 1000) * rate : 0);
  const rebase = () => { pos = position(); at = Date.now(); };
  const d = {
    id, playbackMode: 'audio' as const,
    seeksWhilePlaying: 0, seeks: [] as number[], bends: [] as Array<{ ratio: number; ms: number }>, startedAt: null as number | null, stoppedAt: null as number | null,
    position,
    play: async () => { rebase(); if (!isPlaying) { d.startedAt = Date.now(); onPlay(pos); } isPlaying = true; },
    stop: () => { rebase(); if (isPlaying) d.stoppedAt = Date.now(); isPlaying = false; }, isPlaying: () => isPlaying,
    cue: (t: number) => d.audioPlayer.seek(t),
    /** A double's load (DeckEngine.loadDecodedAudio): the deck stops at the start of the shared buffer. */
    loadDecodedAudio: async () => { rebase(); isPlaying = false; pos = 0; return { duration: 600, sampleRate: 44100, numberOfChannels: 2, waveformPeaks: new Float32Array(0) }; },
    bendRate: (ratio: number, ms: number) => {
      d.bends.push({ ratio, ms });
      rebase(); rate = ratio;
      if (restore) clearTimeout(restore);
      restore = setTimeout(() => { rebase(); rate = 1; restore = null; }, ms);
    },
    getHeardPosition: () => position(),
    setPitch: () => {}, setKeyLock: () => {}, setEQ: () => {}, setEQKill: () => {}, setFilterPosition: () => {}, getFilterPosition: () => 0,
    setFilterResonance: () => {}, setVolume: () => {}, getVolume: () => 1, setEchoSend: () => {}, setEchoParams: () => {}, setReverbSend: () => {},
    setAudioLoop: () => {}, clearAudioLoop: () => {}, loadSong: async () => {}, clearLoadedSong: () => {}, getLoadedSong: () => null,
    audioPlayer: {
      seek: (t: number) => { if (isPlaying) d.seeksWhilePlaying++; d.seeks.push(t); pos = t; at = Date.now(); },
      getPosition: () => position(), getDuration: () => 600, stop: () => {},
      getAudioBuffer: () => ({}) as AudioBuffer, getWaveformPeaks: () => null, getOriginalFileBytes: () => null,
    },
    replayer: { getElapsedMs: () => position() * 1000 },
  };
  return d;
}

/** The corpus track's own beat grid, optionally shifted (seconds). */
export function gridOf(id: CorpusId, shiftSec = 0) {
  const t = corpusTrack(id);
  return { beats: t.beats.map((b) => b + shiftSec), downbeats: t.downbeats.map((b) => b + shiftSec), bpm: BPM, timeSignature: 4 };
}

/** Signed bar-phase distance of `b` from `a` in seconds, in [-BAR/2, BAR/2). */
export function barPhaseErrorSec(a: number, b: number): number {
  const d = (((b - a) % BAR) + BAR) % BAR;
  return d >= BAR / 2 ? d - BAR : d;
}

/** The outgoing corpus analysis, with its grid's analysis confidence set when asked (a copy: the corpus is shared). */
function outgoingAnalysis(gridConfidence?: number): DJTrackAnalysis {
  if (gridConfidence === undefined) return corpusAnalysis(OUTGOING);
  const a = structuredClone(corpusAnalysis(OUTGOING));
  a.analysisConfidence.beatGrid = gridConfidence;
  return a;
}

/** What the real pre-rendered load does to the incoming deck's store state: the track, its analysis and grid. */
export function loadIncoming(holder: HarnessHolder): boolean {
  holder.loads++;
  const dj = getAutoDJ() as unknown as AutoDJInternals;
  useDJStore.getState().setDeckState('B', {
    fileName: `${INCOMING}.wav`, trackName: INCOMING, isPlaying: false, detectedBPM: BPM, effectiveBPM: BPM, durationMs: 600_000, audioPosition: 0,
    pitchOffset: 0, trackAnalysis: dj.incomingAnalysis ?? corpusAnalysis(INCOMING), beatGrid: gridOf(INCOMING, holder.incomingGridShiftSec),
  });
  return true;
}

/**
 * Deck A plays the outgoing track from `startSec`, deck B is stopped and
 * empty; the playlist is the two corpus tracks; Auto DJ is transition-pending
 * with the next track pre-rendered, and `anticipate()` has planned the
 * transition from the incoming analysis. Returns the decks and the
 * anticipated plan.
 */
export async function setupJuggleTransition(holder: HarnessHolder, opts: { mode: JuggleMode; startSec?: number; outgoingGridConfidence?: number; scratchMode?: string }) {
  // Warm the modules the trigger imports dynamically: a cold import takes real time while the fake clock runs on,
  // and the deck would pass the plan's start before the executor got it.
  await import('../DJTrackLoader');
  await import('../DJPerSongFx');
  vi.useFakeTimers();
  holder.loads = 0;
  holder.crossfader.length = 0;
  const { DJEngine } = await vi.importActual<typeof import('../DJEngine')>('../DJEngine');
  const { DJPipeline } = await vi.importActual<typeof import('../DJPipeline')>('../DJPipeline');
  holder.pipeline = Object.create(DJPipeline.prototype);
  const startSec = opts.startSec ?? 10;
  const decks = { A: fakeDeck('A', startSec, true), B: fakeDeck('B', 0, false) };
  const record = (v: number) => { holder.crossfader.push({ at: Date.now(), v, masterPos: decks.A.position() }); };
  holder.engine = Object.assign(Object.create(DJEngine.prototype), {
    getDeck: (id: 'A' | 'B') => decks[id], remapInstrumentIds: () => {}, tryAutoLoadStems: async () => {}, recorder: null, _pendingTrackSource: null,
    mixer: { setCrossfader: record }, setCrossfader: record,
  });
  const pl = useDJPlaylistStore.getState();
  const id = `juggle-transition-${Date.now()}`;
  const tracks: PlaylistTrack[] = [OUTGOING, INCOMING].map((n, i) => ({ id: n, fileName: `${n}.wav`, trackName: n, format: 'WAV', bpm: BPM, duration: 600, addedAt: i, musicalKey: 'A minor', energy: 0.8 }));
  pl.importPlaylists([{ id, name: 'juggle transition', createdAt: Date.now(), updatedAt: Date.now(), tracks }]);
  pl.setActivePlaylist(id);
  const s = useDJStore.getState();
  s.setAutoDJConfig({ shuffle: false, style: 'Club', transitionBars: 8, juggleMode: opts.mode, juggleIntensity: -1,
    // Auto Scratch defaults to MUSICAL + the three-deck routine. A juggle test that is not about the scratch layer
    // passes scratchMode 'OFF': whether a routine starts mid-test depends on where the poll lands against the bars.
    ...(opts.scratchMode ? { scratchMode: opts.scratchMode } : {}) });
  s.setDeckState('A', {
    fileName: `${OUTGOING}.wav`, trackName: OUTGOING, isPlaying: true, detectedBPM: BPM, effectiveBPM: BPM, durationMs: 600_000, audioPosition: startSec,
    pitchOffset: 0, trackAnalysis: outgoingAnalysis(opts.outgoingGridConfidence), beatGrid: gridOf(OUTGOING),
  });
  s.setDeckState('B', { fileName: null, trackName: '', isPlaying: false, trackAnalysis: null, beatGrid: null, audioPosition: 0, pitchOffset: 0, keyLockEnabled: false });
  s.setCrossfader(0);
  s.setAutoDJJuggleTelemetry(null);
  s.setAutoDJEnabled(true);
  s.setAutoDJStatus('transition-pending');
  s.setAutoDJTrackIndices(0, 1);
  // The set is at its peak; the session controller owns the set phase.
  vi.spyOn(DJSessionController.prototype, 'setPhase', 'get').mockReturnValue('PEAK');
  const controller = new DJSessionController();
  setSessionController(controller);
  controller.startSession(tracks.map((track, index) => ({ index, id: track.id, name: track.trackName, artist: null, track })), 0);
  controller.onTrackStarted(0, useDJStore.getState().decks.A.trackAnalysis!, { bpm: BPM, key: 'A minor', energy: 0.8 });
  const dj = getAutoDJ() as unknown as AutoDJInternals;
  dj.transitionCancel = null; dj.execution = null; dj.preloading = false; dj.transitionSweepStarted = false;
  dj.activeDeck = 'A'; dj.idleDeck = 'B'; dj.preloadedDeck = 'B'; dj.plan = null; dj.incomingAnalysis = null;
  dj.preRenderedTrack = { track: tracks[1], data: new ArrayBuffer(8) };
  // Auto DJ's own anticipation: the incoming analysis from the pre-render, the plan from it.
  const t = corpusTrack(INCOMING);
  // The pre-render's analysis carries the extended timelines, as the real worker's does (phrases, sections, vocals).
  const extended = computeExtendedAnalysis(t.pcm, t.sampleRate, { beats: t.beats });
  dj.anticipate(tracks[1], 1, { duration: t.durationSec, analysis: { ...corpusPipelineAnalysis(t), extended } });
  // Read through a function: the assignment above narrowed `dj.plan` to null for the compiler.
  const planOf = (d: AutoDJInternals): DJTransitionPlan | null => d.plan;
  return { dj, decks, anticipated: planOf(dj) };
}

export function teardownJuggleTransition(): void {
  const dj = getAutoDJ() as unknown as AutoDJInternals;
  dj.stopPolling();
  try { dj.transitionCancel?.(); } catch { /* */ }
  dj.getJuggle().abort('test end');
  // A fresh juggle controller per test: its cooldown and history belong to one set, not to the next test.
  (dj as unknown as { juggle: unknown }).juggle = null;
  dj.plan = null; dj.preRenderedTrack = null; dj.preloadedDeck = null; dj.execution = null; dj.transitionCancel = null;
  useDJStore.getState().setAutoDJEnabled(false);
  useDJStore.getState().setAutoDJStatus('idle');
  useDJStore.getState().setAutoDJConfig({ juggleMode: 'OFF' });
  setSessionController(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
}
