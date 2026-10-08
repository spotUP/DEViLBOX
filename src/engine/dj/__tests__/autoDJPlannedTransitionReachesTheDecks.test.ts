/**
 * The planned transition reaches the decks through the product entry
 * (plan sections 15, 32, 46, 56-61; Gates F-L, N-Q, T): Auto DJ's own
 * triggerTransition loads the pre-rendered track, asks the session controller
 * for a plan built from both decks' DJTrackAnalysis, and the executor drives
 * the incoming position (a musical mix-in, not 0:00), the one pitch path,
 * the key lock, the bass hand-over EQ, the filter and the crossfader on the
 * real deck/mixer primitives (a fake engine records every call). The decision
 * log and the controller's counters are the sentinels that the new code ran.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  calls: [] as Array<{ deck: string; fn: string; args: unknown[] }>,
  crossfader: [] as number[],
  position: { A: 0, B: 0 } as Record<string, number>,
  legacy: 0,
}));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));
vi.mock('../DJQuantizedFX', () => {
  const record = () => () => { holder.legacy++; return () => {}; };
  return {
    beatMatchedTransition: record(), skipTransition: record(), cutTransition: record(),
    filterBuildTransition: record(), bassSwapTransition: record(), echoOutTransition: record(),
    getQuantizeMode: () => 'off', setQuantizeMode: () => {},
    // The DJ FX registry (filter release, echo out) reaches these sweeps through the same module.
    filterSweep: () => () => {}, filterReset: () => () => {}, echoOut: () => () => {},
    instantEQKill: () => {}, quantizedEQKill: () => () => {}, cancelAllAutomation: () => {},
  };
});
vi.mock('../DJPipeline', async (orig) => {
  const actual = await orig<typeof import('../DJPipeline')>();
  return { ...actual, getDJPipeline: () => holder.pipeline };
});
vi.mock('../DJPerSongFx', () => ({ applyPerSongMasterFx: () => {} }));

import { getAutoDJ } from '../DJAutoDJ';
import { useDJStore } from '@/stores/useDJStore';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import { corpusTrack, corpusPipelineAnalysis, corpusAnalysis } from '../autodj/testing/corpus';
import { computeExtendedAnalysis } from '../autodj/activityTimelines';
import { getDecisionLog } from '../autodj/decisionLog';
import { getSessionController, setSessionController, DJSessionController } from '../autodj/sessionController';

type Internals = {
  activeDeck: 'A' | 'B'; idleDeck: 'A' | 'B'; preloadedDeck: 'A' | 'B' | null;
  preRenderedTrack: { track: unknown; data: unknown } | null;
  triggerTransition(bars: number): Promise<void>;
  plan: unknown;
};

function fakeDeck(id: string, duration: number) {
  const rec = (fn: string) => (...args: unknown[]) => { holder.calls.push({ deck: id, fn, args }); };
  let playing = id === 'A';
  return {
    id,
    playbackMode: 'audio' as const,
    loadSong: async () => {}, clearLoadedSong: () => {}, getLoadedSong: () => null,
    loadAudioFile: async () => ({ duration, sampleRate: 22050, numberOfChannels: 1, waveformPeaks: new Float32Array(4) }),
    play: async () => { playing = true; holder.calls.push({ deck: id, fn: 'play', args: [] }); },
    stop: () => { playing = false; holder.calls.push({ deck: id, fn: 'stop', args: [] }); },
    isPlaying: () => playing,
    setPitch: rec('setPitch'), setKeyLock: rec('setKeyLock'), setEQ: rec('setEQ'), setEQKill: rec('setEQKill'),
    setFilterPosition: rec('setFilterPosition'), setFilterResonance: rec('setFilterResonance'), setVolume: rec('setVolume'),
    getVolume: () => 1, getFilterPosition: () => 0,
    setEchoSend: rec('setEchoSend'), setEchoParams: rec('setEchoParams'), setReverbSend: rec('setReverbSend'),
    setAudioLoop: rec('setAudioLoop'), clearAudioLoop: rec('clearAudioLoop'),
    audioPlayer: { seek: (sec: number) => { holder.calls.push({ deck: id, fn: 'seek', args: [sec] }); holder.position[id] = sec; }, getPosition: () => holder.position[id], getDuration: () => duration, stop: () => {} },
    replayer: { getElapsedMs: () => holder.position[id] * 1000 },
  };
}

describe('a planned Auto DJ transition reaches the decks', () => {
  const outgoing = corpusTrack('steady');
  const incomingTrack = corpusTrack('longIntro');

  beforeAll(() => { corpusAnalysis('steady'); corpusAnalysis('longIntro'); }, 120_000);
  beforeEach(async () => {
    holder.calls.length = 0; holder.crossfader.length = 0; holder.legacy = 0;
    holder.position = { A: 20, B: 0 };
    getDecisionLog().clear();
    setSessionController(new DJSessionController());
    const { DJEngine } = await vi.importActual<typeof import('../DJEngine')>('../DJEngine');
    const { DJPipeline } = await vi.importActual<typeof import('../DJPipeline')>('../DJPipeline');
    holder.pipeline = Object.create(DJPipeline.prototype);
    const decks: Record<string, ReturnType<typeof fakeDeck>> = { A: fakeDeck('A', outgoing.durationSec), B: fakeDeck('B', incomingTrack.durationSec) };
    holder.engine = Object.assign(Object.create(DJEngine.prototype), {
      getDeck: (id: string) => decks[id], remapInstrumentIds: () => {}, tryAutoLoadStems: async () => {},
      recorder: null, _pendingTrackSource: null,
      mixer: { setCrossfader: (v: number) => { holder.crossfader.push(v); } },
      setCrossfader: (v: number) => { holder.crossfader.push(v); },
    });
    const s = useDJStore.getState();
    s.setAutoDJConfig({ transitionBars: 2, style: 'Radio', withFilter: true });
    s.setCrossfader(0);
    s.setDeckState('A', { fileName: 'steady.wav', isPlaying: true, effectiveBPM: 126, detectedBPM: 126, musicalKey: 'A minor', energy: 0.7,
      durationMs: outgoing.durationSec * 1000, audioPosition: 20, trackAnalysis: corpusAnalysis('steady'),
      beatGrid: { beats: outgoing.beats, downbeats: outgoing.downbeats, bpm: 126, timeSignature: 4 } });
    s.setDeckState('B', { fileName: 'old.wav', isPlaying: false, trackAnalysis: null });
    const pl = useDJPlaylistStore.getState();
    const id = pl.createPlaylist('planned');
    pl.setActivePlaylist(id);
    s.setAutoDJTrackIndices(0, 1);
  });
  afterEach(() => { setSessionController(null); vi.restoreAllMocks(); });

  it('plans from both analyses and executes the plan on the real primitives, not the legacy crossfade', async () => {
    const extended = computeExtendedAnalysis(incomingTrack.pcm, incomingTrack.sampleRate, { beats: incomingTrack.beats });
    const analysis = { ...corpusPipelineAnalysis(incomingTrack), extended };
    const dj = getAutoDJ() as unknown as Internals;
    dj.activeDeck = 'A'; dj.idleDeck = 'B'; dj.preloadedDeck = 'B';
    dj.preRenderedTrack = {
      track: { fileName: 'longIntro.wav', trackName: 'long intro', id: 't1' },
      data: { wavData: new ArrayBuffer(8), filename: 'longIntro.wav', trackName: 'long intro', bpm: 124, duration: incomingTrack.durationSec, analysis },
    };
    // The outgoing deck is already at the planned mix-out point: the executor's grid wait resolves at once.
    holder.position.A = 20;
    useDJStore.getState().setAutoDJStatus('transition-pending');
    const controller = getSessionController();
    await dj.triggerTransition(2);
    const plan = controller.currentPlan;
    expect(plan).not.toBeNull();
    holder.position.A = plan!.startTimeSec + 0.001;

    const log = getDecisionLog();
    expect(log.counts.PLAN_TRANSITION).toBeGreaterThanOrEqual(1);
    expect(holder.legacy).toBe(0);
    expect(controller.counts.transitionPlans).toBeGreaterThanOrEqual(1);

    // Wait for the executor to finish (real timers; a Radio-style short plan).
    const durationSec = plan!.durationBeats * (60 / 126);
    await vi.waitFor(() => expect(controller.counts.executions).toBe(1), { timeout: Math.max(5000, durationSec * 1000 + 4000), interval: 50 });

    const calls = holder.calls;
    // The load seeks to 0 first; the executor's seek is the last one before play.
    const seek = calls.filter((c) => c.deck === 'B' && c.fn === 'seek').pop();
    expect(seek).toBeDefined();
    // The incoming starts where the drums enter (bar 16, 31 s at 124 BPM), not at 0:00 (plan sections 7, 46).
    expect(seek!.args[0] as number, JSON.stringify({ style: plan!.style, inPos: plan!.incomingPosition, cues: useDJStore.getState().decks.B.trackAnalysis?.cuePoints, dur: useDJStore.getState().decks.B.trackAnalysis?.durationSec, reasons: plan!.reasons.slice(0, 4) })).toBeGreaterThan(28);
    expect(plan!.incomingPosition).toBe(seek!.args[0]);
    // Tempo through the one pitch path, key lock a decision (plan sections 12, 13).
    const pitch = calls.find((c) => c.deck === 'B' && c.fn === 'setPitch');
    expect(pitch).toBeDefined();
    expect(pitch!.args[0] as number).toBeCloseTo(12 * Math.log2(126 / 124), 2);
    expect(calls.some((c) => c.deck === 'B' && c.fn === 'setKeyLock')).toBe(true);
    // Bass ownership: the incoming low band starts cut and ends open; the outgoing low band ends cut before the stop (plan sections 20, 21).
    const inLow = calls.filter((c) => c.deck === 'B' && c.fn === 'setEQ' && c.args[0] === 'low').map((c) => c.args[1] as number);
    expect(inLow[0]).toBeLessThanOrEqual(-6);
    expect(Math.max(...inLow)).toBe(0);
    const outLow = calls.filter((c) => c.deck === 'A' && c.fn === 'setEQ' && c.args[0] === 'low').map((c) => c.args[1] as number);
    expect(Math.min(...outLow)).toBeLessThanOrEqual(-6);
    // Continuous crossfader over the plan: many samples, ending exactly on the incoming side; outgoing stopped and reset.
    expect(holder.crossfader.length).toBeGreaterThan(20);
    expect(holder.crossfader[holder.crossfader.length - 1]).toBe(1);
    expect(calls.some((c) => c.deck === 'A' && c.fn === 'stop')).toBe(true);
    expect(calls.some((c) => c.deck === 'B' && c.fn === 'play')).toBe(true);
    const lastOutFilter = calls.filter((c) => c.deck === 'A' && c.fn === 'setFilterPosition').pop();
    expect(lastOutFilter!.args[0]).toBe(0);
    // The consequence was heard: a quality score and a memory record (plan sections 28, 41, 69).
    expect(controller.lastMeasuredQuality).not.toBeNull();
    expect(controller.lastMeasuredQuality!.overall).toBeGreaterThan(0.4);
    expect(controller.memory.transitionCount).toBe(1);
    expect(log.counts.EXECUTE_TRANSITION).toBe(1);
    // Telemetry carries the explanation (plan sections 44, 45).
    const why = log.last('PLAN_TRANSITION')!;
    expect(why.reasons.length).toBeGreaterThan(5);
    expect(why.rejectedAlternatives.length).toBeGreaterThan(0);
  }, 60_000);

  it('without an analysis on the outgoing deck the legacy crossfade runs and the log says EMERGENCY', async () => {
    useDJStore.getState().setDeckState('A', { trackAnalysis: null });
    const dj = getAutoDJ() as unknown as Internals;
    dj.activeDeck = 'A'; dj.idleDeck = 'B'; dj.preloadedDeck = 'B';
    dj.preRenderedTrack = {
      track: { fileName: 'in.wav', trackName: 'in', id: 't2' },
      data: { wavData: new ArrayBuffer(8), filename: 'in.wav', trackName: 'in', bpm: 126, duration: 60, analysis: corpusPipelineAnalysis(outgoing) },
    };
    useDJStore.getState().setAutoDJStatus('transition-pending');
    await dj.triggerTransition(2);
    expect(holder.legacy).toBe(1);
    expect(getDecisionLog().counts.EMERGENCY).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
