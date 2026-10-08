/**
 * Beat juggling reachability (juggling plan gates A, B, M, section 53): with
 * Auto DJ enabled, Auto Juggle on and both decks playing analysed tracks,
 * the Auto DJ poll loop drives the juggle controller, which performs through
 * the same DJ actions the DJ view's crossfader and pads use: the mixer's
 * crossfader is moved (call count), the DJ store's crossfader position the
 * slider reads changes, and the juggle telemetry the debug view reads is
 * published. Fake timers, fake engine, no audio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  crossfaderCalls: [] as number[],
  t0: 0,
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
import { useDJPlaylistStore, type PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { getAutoDJ } from '../DJAutoDJ';
import { corpusAnalysis, corpusTrack, type CorpusId } from '../autodj/testing/corpus';
import { setSessionController, DJSessionController } from '../autodj/sessionController';
import { getDjFxFireLog, clearDjFxFireLog } from '@/engine/drumpad/DjFxActions';

type Internals = {
  activeDeck: 'A' | 'B'; idleDeck: 'A' | 'B'; preloadedDeck: 'A' | 'B' | null; plan: unknown; pollCount: number;
  transitionCancel: (() => void) | null; execution: unknown; preloading: boolean; incomingAnalysis: unknown; transitionSweepStarted: boolean;
  startPolling(): void; stopPolling(): void; getJuggle(): import('../autodj/juggle/juggleController').DJJuggleController;
};

function fakeDeck(id: 'A' | 'B', startSec: number) {
  let playing = true;
  const position = () => startSec + (Date.now() - holder.t0) / 1000;
  return {
    id, playbackMode: 'audio' as const,
    play: async () => { playing = true; }, stop: () => { playing = false; }, isPlaying: () => playing,
    setPitch: () => {}, setKeyLock: () => {}, setEQ: () => {}, setEQKill: () => {}, setFilterPosition: () => {}, getFilterPosition: () => 0,
    setFilterResonance: () => {}, setVolume: () => {}, getVolume: () => 1, setEchoSend: () => {}, setEchoParams: () => {}, setReverbSend: () => {},
    setAudioLoop: () => {}, clearAudioLoop: () => {}, loadSong: async () => {}, clearLoadedSong: () => {}, getLoadedSong: () => null,
    audioPlayer: { seek: () => {}, getPosition: position, getDuration: () => 600, stop: () => {} },
    replayer: { getElapsedMs: () => position() * 1000 },
  };
}

function deckState(id: CorpusId, position: number) {
  const t = corpusTrack(id);
  return {
    fileName: `${id}.wav`, trackName: id, isPlaying: true, detectedBPM: 126, effectiveBPM: 126, durationMs: 600_000, audioPosition: position,
    trackAnalysis: corpusAnalysis(id), beatGrid: { beats: t.beats, downbeats: t.downbeats, bpm: 126, timeSignature: 4 },
  };
}

describe('Auto Juggle reaches the decks through the DJ actions', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    holder.t0 = Date.now();
    holder.crossfaderCalls.length = 0;
    clearDjFxFireLog();
    const { DJEngine } = await vi.importActual<typeof import('../DJEngine')>('../DJEngine');
    const { DJPipeline } = await vi.importActual<typeof import('../DJPipeline')>('../DJPipeline');
    holder.pipeline = Object.create(DJPipeline.prototype);
    const decks = { A: fakeDeck('A', 10), B: fakeDeck('B', 12) };
    holder.engine = Object.assign(Object.create(DJEngine.prototype), {
      getDeck: (id: 'A' | 'B') => decks[id], remapInstrumentIds: () => {}, tryAutoLoadStems: async () => {}, recorder: null, _pendingTrackSource: null,
      mixer: { setCrossfader: (v: number) => { holder.crossfaderCalls.push(v); } }, setCrossfader: (v: number) => { holder.crossfaderCalls.push(v); },
    });
    const pl = useDJPlaylistStore.getState();
    const id = `juggle-${Date.now()}`;
    const tracks: PlaylistTrack[] = ['steady', 'compatibleKey'].map((n, i) => ({ id: n, fileName: `${n}.wav`, trackName: n, format: 'WAV', bpm: 126, duration: 600, addedAt: i, musicalKey: 'A minor', energy: 0.8 }));
    pl.importPlaylists([{ id, name: 'juggle', createdAt: Date.now(), updatedAt: Date.now(), tracks }]);
    pl.setActivePlaylist(id);
    const s = useDJStore.getState();
    s.setAutoDJConfig({ shuffle: false, style: 'Club', transitionBars: 8, juggleMode: 'PERFORMER', juggleIntensity: -1 });
    s.setDeckState('A', deckState('steady', 10));
    s.setDeckState('B', deckState('compatibleKey', 12));
    s.setCrossfader(0);
    s.setAutoDJJuggleTelemetry(null);
    s.setAutoDJEnabled(true);
    s.setAutoDJStatus('playing');
    s.setAutoDJTrackIndices(0, 1);
    const controller = new DJSessionController();
    // The set is at its peak (the juggle budget allows a juggle at once); the session controller owns the set phase.
    vi.spyOn(DJSessionController.prototype, 'setPhase', 'get').mockReturnValue('PEAK');
    setSessionController(controller);
    controller.startSession(tracks.map((track, index) => ({ index, id: track.id, name: track.trackName, artist: null, track })), 0);
    controller.onTrackStarted(0, corpusAnalysis('steady'), { bpm: 126, key: 'A minor', energy: 0.8 });
    const dj = getAutoDJ() as unknown as Internals;
    dj.transitionCancel = null; dj.execution = null; dj.preloading = false; dj.incomingAnalysis = null; dj.transitionSweepStarted = false;
    dj.activeDeck = 'A'; dj.idleDeck = 'B'; dj.preloadedDeck = null; dj.plan = null;
  });
  afterEach(() => {
    const dj = getAutoDJ() as unknown as Internals;
    dj.stopPolling();
    dj.getJuggle().abort('test end');
    useDJStore.getState().setAutoDJEnabled(false);
    useDJStore.getState().setAutoDJConfig({ juggleMode: 'OFF' });
    setSessionController(null);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('the poll loop starts a juggle that moves the mixer crossfader, the store position the slider reads, and publishes telemetry', async () => {
    const dj = getAutoDJ() as unknown as Internals;
    dj.startPolling();
    // The set is at its peak: the budget allows a juggle at once.
    const j = dj.getJuggle();
    const seen = new Set<number>();
    let telemetryActive = false;
    for (let t = 0; t < 180_000 && !(seen.size >= 2 && !j.isActive() && telemetryActive); t += 500) {
      await vi.advanceTimersByTimeAsync(500);
      // What the deck ticker does in the app: the store positions follow the engine.
      const s = useDJStore.getState();
      s.setDeckState('A', { audioPosition: 10 + (Date.now() - holder.t0) / 1000 });
      s.setDeckState('B', { audioPosition: 12 + (Date.now() - holder.t0) / 1000 });
      seen.add(useDJStore.getState().crossfaderPosition);
      if (useDJStore.getState().autoDJJuggleTelemetry?.active) telemetryActive = true;
    }
    expect(j.counts.started, `the controller started a juggle from the poll loop (ticks ${j.counts.ticks}; last decision: ${j.getLastDecision()?.reason ?? 'none'}; blocked: ${j.getLastDecision()?.blocked.join('; ') ?? '-'})`).toBeGreaterThanOrEqual(1);
    expect(j.counts.completed, `aborted: ${j.events.filter((e) => e.kind === 'juggleAborted').map((e) => e.reason).join('; ') || '-'}; status ${useDJStore.getState().autoDJStatus}`).toBeGreaterThanOrEqual(1);
    await vi.advanceTimersByTimeAsync(500);
    // One path: the mixer saw the cuts and the store the slider reads moved with them.
    expect(holder.crossfaderCalls.length).toBeGreaterThanOrEqual(3);
    expect(holder.crossfaderCalls).toContain(1);
    expect(seen.has(1) || seen.has(0.5)).toBe(true);
    expect(useDJStore.getState().crossfaderPosition).toBe(0);
    // Telemetry for the debug view and the MCP.
    expect(telemetryActive).toBe(true);
    const tel = useDJStore.getState().autoDJJuggleTelemetry!;
    expect(tel.mode).toBe('PERFORMER');
    expect(tel.history.length).toBeGreaterThanOrEqual(1);
    expect(tel.reason.length).toBeGreaterThan(0);
    // Effects, when the pattern used any, went through the DjFx registry as 'autodj'.
    for (const e of getDjFxFireLog()) expect(e.source).toBe('autodj');
  }, 60_000);

  it('Auto Juggle off: the poll loop never moves the crossfader', async () => {
    useDJStore.getState().setAutoDJConfig({ juggleMode: 'OFF' });
    const dj = getAutoDJ() as unknown as Internals;
    dj.startPolling();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(holder.crossfaderCalls.length).toBe(0);
    expect(useDJStore.getState().crossfaderPosition).toBe(0);
  }, 30_000);
});
