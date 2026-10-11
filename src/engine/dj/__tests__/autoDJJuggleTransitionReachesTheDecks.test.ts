/**
 * Reachability R3 (plan 2026-10-11-dj-juggling, JUGX-P3.R3): with Auto DJ
 * enabled, Auto Juggle PERFORMER and a compatible corpus pair, the poll loop
 * plans a juggle transition, executes it, and the ladder reaches the mixer.
 *
 * Entry: getAutoDJ() - its own anticipate() plans the transition, the poll
 * loop triggers it, the executor starts the incoming deck on the grid, its
 * trade stage runs the juggle controller's ladder, the release curve and the
 * finish stop the outgoing, the poll loop completes the transition.
 *
 * Sentinel: the transitionLadder builder's call count (1) and the executed
 * plan's style. Numbers (owner juggling plan sections 9, 41, 44: a whole
 * 16-bar phrase, single-bar trades only at beat-level confidence): the mixer
 * crossfader receives 0 / 1 / 0 / 1 / 0 / 1 / 0 / 1 and the release 1 on
 * master beats L+0, 16, 32, 40, 48, 52, 56, 60, 64 (+-1 juggle tick, 15 ms),
 * L the bar the incoming started on; final crossfader on the incoming;
 * outgoing stopped; zero seeks on a playing deck; the executed plan is the
 * anticipated one (C4).
 *
 * Also here, where the fakes are: the executor never seeks an incoming deck
 * that already plays, and the juggle sink's ResyncDeck / JumpToBar keep a
 * playing deck in phase. Fake timers, fake engine, no audio.
 */
import { JUGGLE_CUT_SWEEP_MS } from '../autodj/juggle/crossfaderSweep';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  loads: 0,
  crossfader: [] as Array<{ at: number; v: number; masterPos: number }>,
  incomingGridShiftSec: 0,
  ladderBuilds: 0,
  /** When set, the incoming analysis Auto DJ builds carries this grid confidence (a phrase-level grid). */
  incomingGridConfidence: undefined as number | undefined,
  /** When set, the incoming analysis Auto DJ builds carries this phrase confidence (the corpus track reads 0.5). */
  incomingPhraseConfidence: undefined as number | undefined,
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
    loadPreRenderedTrackToDeck: async () => (await import('./juggleTransitionHarness')).loadIncoming(holder),
  };
});
vi.mock('../DJPipeline', async (orig) => {
  const actual = await orig<typeof import('../DJPipeline')>();
  return { ...actual, getDJPipeline: () => holder.pipeline };
});
vi.mock('../DJPerSongFx', () => ({ applyPerSongMasterFx: () => {} }));
vi.mock('../autodj/trackAnalysis', async (orig) => {
  const actual = await orig<typeof import('../autodj/trackAnalysis')>();
  return {
    ...actual,
    buildDJTrackAnalysis: (...args: Parameters<typeof actual.buildDJTrackAnalysis>) => {
      const a = actual.buildDJTrackAnalysis(...args);
      if (holder.incomingGridConfidence !== undefined) a.analysisConfidence.beatGrid = holder.incomingGridConfidence;
      if (holder.incomingPhraseConfidence !== undefined) for (const p of a.phrases) p.confidence = holder.incomingPhraseConfidence;
      return a;
    },
  };
});
vi.mock('../autodj/juggle/jugglePatterns', async (orig) => {
  const actual = await orig<typeof import('../autodj/juggle/jugglePatterns')>();
  return { ...actual, transitionLadder: (p: Parameters<typeof actual.transitionLadder>[0]) => { holder.ladderBuilds++; return actual.transitionLadder(p); } };
});

import { useDJStore } from '@/stores/useDJStore';
import { BEAT, barPhaseErrorSec, loadIncoming, setupJuggleTransition, teardownJuggleTransition, gridOf, OUTGOING, INCOMING } from './juggleTransitionHarness';
import type { DJTransitionPlan } from '../autodj/types';
import { corpusTrack } from '../autodj/testing/corpus';
import { executeTransition } from '../autodj/transitionExecutor';
import { createDeckJuggleSink } from '../autodj/juggle/juggleDeckSink';

/** Master (deck A) beat at a master position, on its corpus grid. */
const masterBeat = (pos: number): number => (pos - corpusTrack(OUTGOING).beats[0]) / BEAT;

describe('R3: Auto DJ plans and performs a juggle transition through the decks', () => {
  beforeEach(() => { holder.ladderBuilds = 0; holder.incomingGridShiftSec = 0; holder.incomingGridConfidence = undefined; holder.incomingPhraseConfidence = undefined; });
  afterEach(() => teardownJuggleTransition());

  it('the ladder trades 4-2-1-1 bars into the incoming on the master grid, and the transition completes', async () => {
    holder.incomingPhraseConfidence = 0.9;
    const { dj, decks, anticipated } = await setupJuggleTransition(holder, { mode: 'PERFORMER' });
    expect(anticipated?.style, `anticipated plan: ${anticipated?.reasons.join(' | ')}`).toBe('juggleTransition');
    expect(anticipated!.juggle).toEqual({ ladderBars: [4, 2, 1, 1], tradeBeats: 64 });
    let executedId: string | null = null;
    let executedStyle: string | null = null;
    dj.startPolling();
    for (let t = 0; t < 120_000; t += 50) {
      await vi.advanceTimersByTimeAsync(50);
      if (dj.execution && !executedId) { executedId = dj.execution.plan.id; executedStyle = dj.execution.plan.style; }
      if (executedId && useDJStore.getState().autoDJStatus !== 'transitioning' && !decks.A.isPlaying()) break;
    }
    expect(holder.loads).toBe(1);
    // Sentinels: the planned style executed (the anticipated plan itself, C4) and the ladder pattern was built once.
    expect(executedStyle).toBe('juggleTransition');
    expect(executedId).toBe(anticipated!.id);
    expect(holder.ladderBuilds).toBe(1);
    const j = dj.getJuggle();
    expect(j.counts.started).toBe(1);
    expect(j.counts.completed, `aborted: ${j.events.filter((e) => e.kind === 'juggleAborted').map((e) => e.reason).join('; ') || '-'}`).toBe(1);

    // The ladder on the mixer, in master beats.
    expect(decks.B.startedAt).not.toBeNull();
    const ladderCuts = j.events.filter((e) => e.kind === 'juggleActionExecuted' && (e.action?.type === 'CutIn' || e.action?.type === 'ReleaseDeck'));
    expect(ladderCuts.map((e) => e.action!.deck)).toEqual(['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'B']);
    const L = ladderCuts[0].beat;
    const startBeat = Math.round(L);
    expect(startBeat % 4, 'the ladder starts on a bar').toBe(0);
    // ... the bar the incoming started on: the plan's start.
    expect(startBeat).toBe(Math.round(masterBeat(anticipated!.startTimeSec)));
    const offsets = [0, 16, 32, 40, 48, 52, 56, 60, 64];
    const values = [0, 1, 0, 1, 0, 1, 0, 1, 1];
    const tick = 0.015 / BEAT;
    ladderCuts.forEach((e, i) => expect(e.beat - (startBeat + offsets[i]), `cut ${i} at beat ${e.beat.toFixed(3)}`).toBeGreaterThanOrEqual(-1e-6));
    ladderCuts.forEach((e, i) => expect(e.beat - (startBeat + offsets[i]), `cut ${i} at beat ${e.beat.toFixed(3)}`).toBeLessThanOrEqual(tick + 1e-6));
    // The mixer received each value at its beat.
    for (let i = 0; i < offsets.length; i++) {
      const want = startBeat + offsets[i];
      // a cut is a fast fader sweep: it starts on the beat and lands on its value within the sweep time
      const sweepBeats = JUGGLE_CUT_SWEEP_MS / 1000 / BEAT;
      const hit = holder.crossfader.find((c) => c.v === values[i] && masterBeat(c.masterPos) - want >= -tick - 1e-6 && masterBeat(c.masterPos) - want <= tick + sweepBeats + 0.05);
      expect(hit, `mixer crossfader ${values[i]} at master beat ${want}`).toBeDefined();
    }
    // The end state: crossfader on the incoming, outgoing stopped, Auto DJ playing the incoming.
    expect(useDJStore.getState().crossfaderPosition).toBe(1);
    expect(holder.crossfader[holder.crossfader.length - 1].v).toBe(1);
    expect(decks.A.isPlaying()).toBe(false);
    expect(decks.B.isPlaying()).toBe(true);
    expect(dj.activeDeck).toBe('B');
    // Zero seeks on a playing deck.
    expect(decks.A.seeksWhilePlaying).toBe(0);
    expect(decks.B.seeksWhilePlaying).toBe(0);
  }, 60_000);

  it('phrase-level grids trade no single bars: 4-2-2 in PERFORMER, and the transition completes', async () => {
    holder.incomingGridConfidence = 0.7;
    const { dj, decks, anticipated } = await setupJuggleTransition(holder, { mode: 'PERFORMER', startSec: 0, outgoingGridConfidence: 0.7 });
    expect(anticipated?.juggle, `anticipated plan: ${anticipated?.reasons.join(' | ')}`).toEqual({ ladderBars: [4, 2, 2], tradeBeats: 64 });
    // The juggle controller is Auto DJ's own and outlives a test: count from here.
    const j = dj.getJuggle();
    const completedBefore = j.counts.completed;
    const eventsBefore = j.events.length;
    dj.startPolling();
    let executed = false;
    for (let t = 0; t < 150_000; t += 100) {
      await vi.advanceTimersByTimeAsync(100);
      if (dj.execution) executed = true;
      if (executed && useDJStore.getState().autoDJStatus !== 'transitioning' && !decks.A.isPlaying()) break;
    }
    await vi.advanceTimersByTimeAsync(200); // the last cut is a fast sweep: let it land
    expect(j.counts.completed - completedBefore, `aborted: ${j.events.filter((e) => e.kind === 'juggleAborted').map((e) => e.reason).join('; ') || '-'}`).toBe(1);
    const cuts = j.events.slice(eventsBefore).filter((e) => e.kind === 'juggleActionExecuted' && (e.action?.type === 'CutIn' || e.action?.type === 'ReleaseDeck'));
    expect(cuts.map((e) => Math.round(e.beat - cuts[0].beat))).toEqual([0, 16, 32, 40, 48, 56, 64]);
    expect(useDJStore.getState().crossfaderPosition).toBe(1);
    expect(decks.B.isPlaying()).toBe(true);
  }, 60_000);
});

describe('owner plan section 16: the incoming is locked and verified before it is heard (audit row 9)', () => {
  beforeEach(() => { holder.ladderBuilds = 0; holder.incomingGridConfidence = undefined; });
  afterEach(() => { teardownJuggleTransition(); holder.incomingGridShiftSec = 0; holder.incomingPhraseConfidence = undefined; });

  it('an incoming 0.9 s off the master\'s bars is re-cued once while silent, and is within 5 ms when its first bar is heard', async () => {
    holder.incomingGridShiftSec = 0.9;
    holder.incomingPhraseConfidence = 0.9;
    const { dj, decks, anticipated } = await setupJuggleTransition(holder, { mode: 'PERFORMER' });
    expect(anticipated?.style, `anticipated plan: ${anticipated?.reasons.join(' | ')}`).toBe('juggleTransition');
    // Auto DJ's own execution of the anticipated plan (the poll loop's trigger is R3's; this is its trade stage).
    loadIncoming(holder);
    (dj as unknown as { executePlan(p: DJTransitionPlan): () => void }).executePlan(anticipated!);
    const a0 = corpusTrack(OUTGOING).beats[0];
    const error = () => barPhaseErrorSec(decks.A.position() - a0, decks.B.position() - holder.incomingGridShiftSec);
    const j = dj.getJuggle();
    let errorAtFirstAnswer: number | null = null;
    let crossfaderBeforeAnswer: number[] = [];
    for (let t = 0; t < 120_000; t += 20) {
      await vi.advanceTimersByTimeAsync(20);
      const answered = j.events.some((e) => e.kind === 'juggleActionExecuted' && e.action?.type === 'CutIn' && e.action.deck === 'B');
      if (answered && errorAtFirstAnswer === null) { errorAtFirstAnswer = error(); crossfaderBeforeAnswer = holder.crossfader.slice(0, -1).map((c) => c.v); }
      if (j.counts.completed + j.counts.aborted > 0 && !decks.A.isPlaying()) break;
    }
    expect(j.counts.completed, `aborted: ${j.events.filter((e) => e.kind === 'juggleAborted').map((e) => e.reason).join('; ') || '-'}`).toBe(1);
    // One re-cue, landed while the crossfader still held the outgoing only.
    expect(decks.B.seeksWhilePlaying).toBe(1);
    expect(crossfaderBeforeAnswer.every((v) => v === 0)).toBe(true);
    expect(Math.abs(errorAtFirstAnswer!)).toBeLessThan(0.005);
    expect(decks.A.seeksWhilePlaying).toBe(0);
  }, 60_000);
});

describe('no seek of a playing deck in the transition and juggle paths', () => {
  afterEach(() => teardownJuggleTransition());

  it('the executor never seeks an incoming deck that already plays: it bends it into phase', async () => {
    const { decks, anticipated } = await setupJuggleTransition(holder, { mode: 'OFF' });
    // The user started deck B 30 ms off the master's bars.
    useDJStore.getState().setDeckState('B', { fileName: `${INCOMING}.wav`, beatGrid: gridOf(INCOMING), isPlaying: true, detectedBPM: 126, effectiveBPM: 126 });
    decks.B.audioPlayer.seek(decks.A.position() - corpusTrack(OUTGOING).beats[0] + 0.030);
    await decks.B.play();
    const h = executeTransition({ ...anticipated!, startTimeSec: decks.A.position(), humanize: { ...anticipated!.humanize, startOffsetMs: 0 } }, { tickMs: 16 });
    await vi.advanceTimersByTimeAsync(200);
    h.cancel();
    expect(decks.B.seeksWhilePlaying, 'the playing incoming deck was seeked').toBe(0);
    expect(decks.B.bends.length).toBeGreaterThanOrEqual(1);
  });

  it('a double\'s ResyncDeck bends a playing copy that is within half a beat, never seeks it', async () => {
    const { decks } = await setupJuggleTransition(holder, { mode: 'OFF' });
    useDJStore.getState().setDeckState('B', { fileName: `${OUTGOING}.wav`, beatGrid: gridOf(OUTGOING), isPlaying: true, detectedBPM: 126, effectiveBPM: 126 });
    decks.B.audioPlayer.seek(decks.A.position() - 0.020);
    await decks.B.play();
    createDeckJuggleSink().apply({ type: 'ResyncDeck', deck: 'B', executeAtBeat: 0, targetPosition: 0, beats: 0 }, { beatSec: BEAT, beatNow: 0, patternBeat: 0 });
    expect(decks.B.seeksWhilePlaying).toBe(0);
    expect(decks.B.bends.length).toBe(1);
    expect(decks.B.bends[0].ratio).toBeGreaterThan(1);
  });

  it('a double\'s ResyncDeck re-cues the copy a bar ahead with one exact seek', async () => {
    const { decks } = await setupJuggleTransition(holder, { mode: 'OFF' });
    decks.B.audioPlayer.seek(decks.A.position());
    await decks.B.play();
    createDeckJuggleSink().apply({ type: 'ResyncDeck', deck: 'B', executeAtBeat: 0, targetPosition: 0, beats: 4 }, { beatSec: BEAT, beatNow: 0, patternBeat: 0 });
    expect(decks.B.seeks[decks.B.seeks.length - 1]).toBeCloseTo(decks.A.position() + 4 * BEAT, 6);
  });

  it('a JumpToBar cue jump lands on the master\'s phase (fired a hair before the cut beat)', async () => {
    const { decks } = await setupJuggleTransition(holder, { mode: 'OFF' });
    createDeckJuggleSink().apply({ type: 'JumpToBar', deck: 'B', executeAtBeat: 15.99, targetPosition: 30 }, { beatSec: BEAT, beatNow: 23.99, patternBeat: 15.99 });
    expect(decks.B.seeks[decks.B.seeks.length - 1]).toBeCloseTo(30 - 0.01 * BEAT, 9);
  });
});
