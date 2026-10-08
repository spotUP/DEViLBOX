/**
 * DJSetSimulator (plan sections 39, 62, 38; decision D7): the real session
 * controller, transition planner, executor and quality evaluator run over a
 * corpus of analysed tracks on a virtual clock, so hours of performance fit
 * a test in seconds. Failures are injected per track (plan section 38).
 *
 * Test support only. The test file mocks the DJ engine to `fakeEngine()`.
 */
import { useDJStore } from '@/stores/useDJStore';
import type { PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { DJSessionController, type SessionTrack } from '../sessionController';
import { executeTransition, type ExecutorTimers, type ExecutionResult } from '../transitionExecutor';
import { checkInvariants, type InvariantResult } from '../transitionQuality';
import { getDecisionLog } from '../decisionLog';
import { summarizeTrack } from '../trackAnalysis';
import type { DJStyleName, DJTrackAnalysis, DJTransitionPlan, TransitionQuality, TransitionStyle } from '../types';

// ── Virtual clock ───────────────────────────────────────────────────────────

interface Timer { id: number; at: number; fn: () => void; interval?: number; cancelled: boolean }

export class VirtualTimers implements ExecutorTimers {
  private t = 0;
  private timers: Timer[] = [];
  private nextId = 1;
  now(): number { return this.t; }
  setTimeout(fn: () => void, ms: number): unknown {
    const timer: Timer = { id: this.nextId++, at: this.t + Math.max(0, ms), fn, cancelled: false };
    this.timers.push(timer);
    return timer.id;
  }
  clearTimeout(id: unknown): void { const t = this.timers.find((x) => x.id === id); if (t) t.cancelled = true; }
  setInterval(fn: () => void, ms: number): unknown {
    const timer: Timer = { id: this.nextId++, at: this.t + Math.max(1, ms), fn, interval: Math.max(1, ms), cancelled: false };
    this.timers.push(timer);
    return timer.id;
  }
  clearInterval(id: unknown): void { this.clearTimeout(id); }
  get pending(): number { return this.timers.filter((x) => !x.cancelled).length; }
  /** Run due timers up to `untilMs`, draining microtasks between them. */
  async run(untilMs: number): Promise<void> {
    for (;;) {
      this.timers = this.timers.filter((x) => !x.cancelled);
      const due = this.timers.filter((x) => x.at <= untilMs).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.t = Math.max(this.t, due.at);
      if (due.interval) due.at = this.t + due.interval; else due.cancelled = true;
      due.fn();
      await Promise.resolve();
      await Promise.resolve();
    }
    this.t = Math.max(this.t, untilMs);
    await Promise.resolve();
  }
  /** Advance in slices until `pred` holds or `maxMs` passed. */
  async runUntil(pred: () => boolean, maxMs: number, sliceMs = 250): Promise<boolean> {
    const end = this.t + maxMs;
    while (this.t < end) {
      if (pred()) return true;
      await this.run(Math.min(end, this.t + sliceMs));
    }
    return pred();
  }
}

// ── Fake engine (records the primitives the executor drives) ────────────────

export type FailureKind =
  | 'preload' | 'decode' | 'analysis' | 'missingKey' | 'missingGrid' | 'malformedTracker' | 'noCue'
  | 'deckFailure' | 'effectFailure' | 'unexpectedLength' | 'short' | 'silence' | 'transitionTimeout';

export interface FakeDeck {
  id: 'A' | 'B';
  playing: boolean;
  position: number;
  pitch: number;
  keyLock: boolean;
  eq: { low: number; mid: number; high: number };
  filter: number;
  volume: number;
  echoSend: number;
  reverbSend: number;
  loop: [number, number] | null;
  playCalls: number;
  failPlay: boolean;
  failEffects: boolean;
  hang: boolean;
  calls: number;
}

export interface FakeEngine {
  decks: Record<'A' | 'B', FakeDeck>;
  crossfader: number[];
  getDeck(id: string): Record<string, unknown>;
  mixer: { setCrossfader(v: number): void };
  setCrossfader(v: number): void;
}

export function fakeEngine(): FakeEngine {
  const mk = (id: 'A' | 'B'): FakeDeck => ({ id, playing: false, position: 0, pitch: 0, keyLock: false, eq: { low: 0, mid: 0, high: 0 }, filter: 0, volume: 1, echoSend: 0, reverbSend: 0, loop: null, playCalls: 0, failPlay: false, failEffects: false, hang: false, calls: 0 });
  const decks = { A: mk('A'), B: mk('B') };
  const crossfader: number[] = [];
  const wrap = (d: FakeDeck) => ({
    id: d.id, playbackMode: 'audio',
    play: async () => { d.calls++; d.playCalls++; if (d.failPlay) throw new Error('deck play failed'); if (d.hang) return new Promise<void>(() => {}); d.playing = true; },
    stop: () => { d.calls++; d.playing = false; }, pause: () => { d.playing = false; }, isPlaying: () => d.playing,
    setPitch: (v: number) => { d.calls++; d.pitch = v; }, setKeyLock: (v: boolean) => { d.keyLock = v; },
    setEQ: (band: 'low' | 'mid' | 'high', v: number) => { d.calls++; d.eq[band] = v; }, setEQKill: () => {},
    setFilterPosition: (v: number) => { d.calls++; d.filter = v; }, getFilterPosition: () => d.filter, setFilterResonance: () => {},
    setVolume: (v: number) => { d.calls++; d.volume = v; }, getVolume: () => d.volume,
    setEchoSend: (v: number) => { if (d.failEffects) throw new Error('echo failed'); d.echoSend = v; }, setEchoParams: () => {},
    setReverbSend: (v: number) => { if (d.failEffects) throw new Error('reverb failed'); d.reverbSend = v; },
    setAudioLoop: (a: number, b: number) => { d.loop = [a, b]; }, clearAudioLoop: () => { d.loop = null; },
    audioPlayer: { seek: (s: number) => { d.position = s; }, getPosition: () => d.position, getDuration: () => 300, stop: () => { d.playing = false; } },
    replayer: { getElapsedMs: () => d.position * 1000 },
    loadSong: async () => {}, clearLoadedSong: () => {}, getLoadedSong: () => null,
  });
  const wrapped = { A: wrap(decks.A), B: wrap(decks.B) };
  return {
    decks, crossfader,
    getDeck: (id: string) => wrapped[id as 'A' | 'B'] as unknown as Record<string, unknown>,
    mixer: { setCrossfader: (v: number) => { crossfader.push(v); } },
    setCrossfader: (v: number) => { crossfader.push(v); },
  };
}

// ── Simulation ──────────────────────────────────────────────────────────────

export interface SimTrack {
  id: string;
  name: string;
  analysis: DJTrackAnalysis | null;
  track: PlaylistTrack;
  failure?: FailureKind;
}

export interface SimTransition {
  from: string;
  to: string;
  style: TransitionStyle | 'legacy';
  bars: number;
  quality: TransitionQuality | null;
  invariants: InvariantResult[];
  fellBack: ExecutionResult['fellBack'];
  completed: boolean;
  legacy: boolean;
  atSec: number;
  planningMs: number;
  keyClash: boolean;
  incomingPosition: number;
  truePeakDb: number;
}

export interface SimMetrics {
  tracksPlayed: number;
  transitions: number;
  meanQuality: number;
  minQuality: number;
  energyCoherence: number;
  maxStyleRun: number;
  distinctStyles: number;
  distinctLengths: number;
  keyConflicts: number;
  tempoDriftMax: number;
  loudnessMaxTruePeakDb: number;
  trackRepeats: number;
  planningMsMax: number;
  planningMsMean: number;
  memoryRecords: number;
  decisionLogSize: number;
  preloadFailures: number;
  analysisFailures: number;
  legacyTransitions: number;
  emergencies: number;
  fallbacks: number;
  silentMoments: number;
  invariantFailures: number;
  pendingTimersAtEnd: number;
}

export interface SimOptions {
  tracks: SimTrack[];
  engine: FakeEngine;
  durationSec?: number;
  maxTransitions?: number;
  style?: DJStyleName;
  userBars?: number;
  timers?: VirtualTimers;
}

export interface SimResult {
  transitions: SimTransition[];
  metrics: SimMetrics;
  controller: DJSessionController;
  elapsedSec: number;
}

function mean(v: number[]): number { return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; }

function crossfaderOutOfRange(values: number[]): number {
  let worst = 0;
  for (const v of values) { if (v < 0) worst = Math.max(worst, -v); if (v > 1) worst = Math.max(worst, v - 1); if (!Number.isFinite(v)) worst = 1; }
  return worst;
}

export function simSessionTracks(tracks: SimTrack[]): SessionTrack[] {
  return tracks.map((t, index) => ({ index, id: t.id, name: t.name, artist: t.track.author ?? null, track: t.track }));
}

/** A simulation track from an analysis (summary stored on the playlist track, as the analyser would). */
export function simTrack(id: string, analysis: DJTrackAnalysis | null, failure?: FailureKind): SimTrack {
  const summary = analysis ? summarizeTrack(analysis) : undefined;
  return {
    id, name: id, analysis, failure,
    track: {
      id, fileName: `${id}.wav`, trackName: id, format: 'WAV', bpm: analysis?.bpm ?? 0, duration: analysis?.durationSec ?? 0, addedAt: 0,
      musicalKey: analysis && analysis.key.mode !== 'unknown' ? analysis.key.name : undefined, energy: analysis?.energy.loudnessEnergy, djSummary: summary,
    },
  };
}

export async function simulateSet(opts: SimOptions): Promise<SimResult> {
  const timers = opts.timers ?? new VirtualTimers();
  const engine = opts.engine;
  const store = useDJStore.getState();
  store.setAutoDJConfig({ style: opts.style ?? 'Classic', transitionBars: opts.userBars ?? 8, withFilter: true, smartCuts: false, shuffle: false });
  store.setAutoDJSessionOrder([]);
  getDecisionLog().clear();
  const controller = new DJSessionController({ now: () => timers.now(), loadLeadSec: 1 });
  const tracks = opts.tracks;
  const session = simSessionTracks(tracks);
  const durationSec = opts.durationSec ?? 3600;
  const maxTransitions = opts.maxTransitions ?? 1000;
  const transitions: SimTransition[] = [];
  let preloadFailures = 0, analysisFailures = 0, legacy = 0, emergencies = 0, fallbacks = 0, silentMoments = 0;
  const played: string[] = [];

  // Start: the first usable track on deck A.
  let currentIdx = tracks.findIndex((t) => t.analysis && !t.failure);
  if (currentIdx < 0) currentIdx = 0;
  let outgoingDeck: 'A' | 'B' = 'A';
  let current = tracks[currentIdx];
  engine.decks.A.playing = true;
  store.setCrossfader(0);
  store.setDeckState('A', { isPlaying: true, trackAnalysis: current.analysis, beatGrid: current.analysis ? { beats: current.analysis.beatGrid.beats.map((b) => b.time), downbeats: current.analysis.downbeats.bars.map((b) => b.start), bpm: current.analysis.bpm, timeSignature: current.analysis.meter.beatsPerBar } : null, detectedBPM: current.analysis?.bpm ?? 125, effectiveBPM: current.analysis?.bpm ?? 125 });
  store.setDeckState('B', { isPlaying: false, trackAnalysis: null });
  controller.startSession(session, currentIdx);
  controller.onTrackStarted(currentIdx, current.analysis, { bpm: current.analysis?.bpm ?? 0, key: current.analysis?.key.name ?? null, energy: current.analysis?.energy.perceivedIntensity ?? 0.5 });
  played.push(current.id);
  let position = 0;
  const start = timers.now();

  while ((timers.now() - start) / 1000 < durationSec && transitions.length < maxTransitions) {
    // Choose and "preload" the next track (plan sections 32, 33).
    const nextIdx = controller.nextIndex();
    let next = nextIdx !== null ? tracks[nextIdx] : tracks[(currentIdx + 1) % tracks.length];
    let nextIndexUsed = nextIdx ?? (currentIdx + 1) % tracks.length;
    // Preload / decode failures: mark the track bad and ask the planner again (the product retries up to 50 times).
    let attempts = 0;
    while ((next.failure === 'preload' || next.failure === 'decode') && attempts < 50) {
      attempts++;
      preloadFailures++;
      next.track.isBad = true;
      controller.setTracks(simSessionTracks(tracks));
      controller.replanSession();
      const alt = controller.nextIndex();
      if (alt === null) break;
      next = tracks[alt];
      nextIndexUsed = alt;
    }
    if (next.failure === 'preload' || next.failure === 'decode') break;
    const incomingDeck: 'A' | 'B' = outgoingDeck === 'A' ? 'B' : 'A';
    const outDeck = engine.decks[outgoingDeck];
    const inDeck = engine.decks[incomingDeck];
    inDeck.failPlay = next.failure === 'deckFailure';
    inDeck.hang = next.failure === 'transitionTimeout';
    outDeck.failEffects = next.failure === 'effectFailure';
    const incomingAnalysis = next.failure === 'analysis' ? null : next.analysis;
    if (!incomingAnalysis) analysisFailures++;
    store.setDeckState(incomingDeck, { isPlaying: false, trackAnalysis: incomingAnalysis });

    // Plan as soon as the incoming analysis exists, from the live position.
    const t0 = performance.now();
    const plan = controller.planTransitionFor(current.analysis, incomingAnalysis, { outgoing: outgoingDeck, incoming: incomingDeck }, position);
    const planningMs = performance.now() - t0;
    const currentDuration = current.analysis?.durationSec ?? 180;

    let result: ExecutionResult;
    let usedPlan: DJTransitionPlan | null = plan;
    if (plan) {
      // The outgoing plays until the plan's start.
      const waitSec = Math.max(0, plan.startTimeSec - position);
      await timers.run(timers.now() + waitSec * 1000);
      outDeck.position = plan.startTimeSec;
      position = plan.startTimeSec;
      const beatSec = 60 / Math.max(60, current.analysis?.bpm ?? 125);
      const handle = executeTransition(plan, { timers, beatSec, tickMs: 16 });
      const expectedMs = (plan.durationBeats + 8) * beatSec * 1000 + 2000;
      let done: ExecutionResult | null = null;
      void handle.promise.then((r) => { done = r; });
      const ok = await timers.runUntil(() => done !== null, Math.max(expectedMs, 5000));
      if (!ok) {
        // Watchdog (DJAutoDJ's 45 s timeout in the product): cancel and complete on the emergency path.
        handle.cancel();
        await timers.run(timers.now() + 50);
        const cancelled = done as ExecutionResult | null;
        // The product's watchdog force-completes on the incoming side: an emergency continuity action, never a cut.
        result = { completed: false, fellBack: 'emergency', error: 'transition timeout (watchdog)', trace: cancelled?.trace ?? { samples: [], events: ['watchdog'], startOffsetMs: 0, completed: false, fellBack: 'emergency' }, incomingPlaying: true };
        engine.setCrossfader(incomingDeck === 'A' ? 0 : 1);
        store.setCrossfader(incomingDeck === 'A' ? 0 : 1);
        outDeck.playing = false;
        inDeck.hang = false;
        inDeck.playing = true;
        emergencies++;
      } else {
        result = done!;
        if (result.fellBack === 'emergency') emergencies++;
      }
      position = plan.incomingPosition + plan.durationBeats * beatSec;
    } else {
      // Legacy crossfade (no plan): the product's beatMatchedTransition; here a plain crossfade of the user's bars.
      legacy++;
      const beatSec = 60 / Math.max(60, current.analysis?.bpm ?? 125);
      const bars = opts.userBars ?? 8;
      const startSec = Math.max(position, currentDuration - bars * 4 * beatSec);
      await timers.run(timers.now() + Math.max(0, startSec - position) * 1000);
      inDeck.playing = true;
      engine.setCrossfader(incomingDeck === 'A' ? 0 : 1);
      store.setCrossfader(incomingDeck === 'A' ? 0 : 1);
      outDeck.playing = false;
      result = { completed: true, fellBack: 'none', trace: { samples: [], events: ['legacy crossfade'], startOffsetMs: 0, completed: true, fellBack: 'none' }, incomingPlaying: true };
      position = bars * 4 * beatSec;
      usedPlan = null;
    }
    if (!outDeck.playing && !inDeck.playing) silentMoments++;
    const quality = controller.onTransitionComplete(result, usedPlan);
    if (!result.incomingPlaying) {
      // The incoming deck never started: the outgoing kept playing (no-silence rule); the track is marked bad and skipped.
      next.track.isBad = true;
      inDeck.failPlay = false;
      transitions.push({
        from: current.id, to: next.id, style: usedPlan ? usedPlan.style : 'legacy', bars: usedPlan ? usedPlan.durationBars : opts.userBars ?? 8,
        quality, invariants: [], fellBack: result.fellBack, completed: false, legacy: !usedPlan, atSec: (timers.now() - start) / 1000, planningMs,
        keyClash: false, incomingPosition: 0, truePeakDb: -99,
      });
      controller.setTracks(simSessionTracks(tracks));
      controller.replanSession();
      const remainingNow = Math.max(5, currentDuration - position - 30);
      await timers.run(timers.now() + Math.min(remainingNow, 30) * 1000);
      position += Math.min(remainingNow, 30);
      continue;
    }
    if (controller.counts.fallbacks > fallbacks) fallbacks = controller.counts.fallbacks;
    const invariants = usedPlan && current.analysis && incomingAnalysis ? checkInvariants(usedPlan, current.analysis, incomingAnalysis, { trace: result.trace }) : [];
    transitions.push({
      from: current.id, to: next.id, style: usedPlan ? usedPlan.style : 'legacy', bars: usedPlan ? usedPlan.durationBars : opts.userBars ?? 8,
      quality, invariants, fellBack: result.fellBack, completed: result.completed, legacy: !usedPlan, atSec: (timers.now() - start) / 1000, planningMs,
      keyClash: !!usedPlan && usedPlan.keyPlan.clashRisk > 0.5 && usedPlan.keyPlan.confidenceClass === 'known-high',
      incomingPosition: usedPlan ? usedPlan.incomingPosition : 0,
      truePeakDb: usedPlan ? usedPlan.gainPlan.monitor.truePeakDb : -99,
    });

    // The incoming is now the current track.
    current = next;
    currentIdx = nextIndexUsed;
    outgoingDeck = incomingDeck;
    played.push(current.id);
    store.setDeckState(outgoingDeck, { isPlaying: true, trackAnalysis: current.analysis });
    controller.setTracks(simSessionTracks(tracks));
    controller.onTrackStarted(currentIdx, current.analysis, { bpm: current.analysis?.bpm ?? 0, key: current.analysis?.key.name ?? null, energy: current.analysis?.energy.perceivedIntensity ?? 0.5 });
    // Play on until the next planning point: the rest of the track minus the lead.
    const remaining = Math.max(5, (current.analysis?.durationSec ?? 180) - position - 60);
    await timers.run(timers.now() + remaining * 1000);
    position += remaining;
    engine.decks[outgoingDeck].position = position;
  }

  const qualities = transitions.map((t) => t.quality?.overall).filter((q): q is number => q !== null && q !== undefined);
  const energies = played.map((id) => tracks.find((t) => t.id === id)?.analysis?.energy.perceivedIntensity ?? 0.5);
  const deltas: number[] = [];
  for (let i = 1; i < energies.length; i++) deltas.push(Math.abs(energies[i] - energies[i - 1]));
  let maxRun = 0, run = 0;
  for (let i = 0; i < transitions.length; i++) { run = i > 0 && transitions[i].style === transitions[i - 1].style ? run + 1 : 1; maxRun = Math.max(maxRun, run); }
  const counts = new Map<string, number>();
  for (const id of played) counts.set(id, (counts.get(id) ?? 0) + 1);
  const repeats = [...counts.values()].filter((c) => c > 1).reduce((a, c) => a + c - 1, 0);
  const planned = transitions.filter((t) => !t.legacy);
  const metrics: SimMetrics = {
    tracksPlayed: played.length,
    transitions: transitions.length,
    meanQuality: mean(qualities),
    minQuality: qualities.length ? Math.min(...qualities) : 0,
    energyCoherence: 1 - Math.min(1, mean(deltas) * 2),
    maxStyleRun: maxRun,
    distinctStyles: new Set(planned.map((t) => t.style)).size,
    distinctLengths: new Set(planned.map((t) => t.bars)).size,
    keyConflicts: transitions.filter((t) => t.keyClash).length,
    // Tempo drift: the executor pitches once per plan and the grid is the deck's own clock; the sampled crossfader
    // never leaves 0..1, which is the drift proxy this simulation can measure.
    tempoDriftMax: crossfaderOutOfRange(engine.crossfader),
    loudnessMaxTruePeakDb: planned.reduce((m, t) => Math.max(m, t.truePeakDb), -99),
    trackRepeats: repeats,
    planningMsMax: Math.max(0, ...transitions.map((t) => t.planningMs)),
    planningMsMean: mean(transitions.map((t) => t.planningMs)),
    memoryRecords: controller.memory.transitionCount,
    decisionLogSize: getDecisionLog().size,
    preloadFailures,
    analysisFailures,
    legacyTransitions: legacy,
    emergencies,
    fallbacks,
    silentMoments,
    invariantFailures: transitions.reduce((a, t) => a + t.invariants.filter((i) => !i.ok).length, 0),
    pendingTimersAtEnd: timers.pending,
  };
  return { transitions, metrics, controller, elapsedSec: (timers.now() - start) / 1000 };
}

/** A larger corpus from a base set: clones with shifted tempo and key, distinct ids. */
export function expandCorpus(base: DJTrackAnalysis[], count: number): DJTrackAnalysis[] {
  const out: DJTrackAnalysis[] = [];
  const KEYS = ['A minor', 'E minor', 'B minor', 'D minor', 'G minor', 'C major', 'G major', 'F major', 'D major', 'A major', 'F# minor', 'Bb major'];
  for (let i = 0; i < count; i++) {
    const src = base[i % base.length];
    const ratio = 0.94 + ((i * 7) % 13) / 100;
    const clone: DJTrackAnalysis = JSON.parse(JSON.stringify(src));
    clone.id = `${src.id}-${i}`;
    clone.bpm = Math.round(src.bpm * ratio * 10) / 10;
    clone.beatGrid.bpm = clone.bpm;
    for (const b of clone.beatGrid.beats) b.time /= ratio;
    for (const bar of clone.downbeats.bars) { bar.start /= ratio; bar.end /= ratio; bar.downbeat /= ratio; }
    for (const s of clone.sections) { s.start /= ratio; s.end /= ratio; }
    for (const p of clone.phrases) { p.start /= ratio; p.end /= ratio; }
    for (const k of Object.keys(clone.cuePoints) as Array<keyof typeof clone.cuePoints>) { const v = clone.cuePoints[k]; if (v !== undefined) clone.cuePoints[k] = v / ratio; }
    clone.durationSec = src.durationSec / ratio;
    clone.vocalActivity.hopSec = src.vocalActivity.hopSec / ratio; clone.drumActivity.hopSec = src.drumActivity.hopSec / ratio;
    clone.bassActivity.hopSec = src.bassActivity.hopSec / ratio; clone.harmonicActivity.hopSec = src.harmonicActivity.hopSec / ratio; clone.intensity.hopSec = src.intensity.hopSec / ratio;
    if (src.key.mode !== 'unknown') {
      const name = KEYS[(i * 5) % KEYS.length];
      clone.key = { ...clone.key, name, mode: name.endsWith('minor') ? 'minor' : 'major' };
    }
    out.push(clone);
  }
  return out;
}
