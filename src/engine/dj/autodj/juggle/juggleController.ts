/**
 * Juggle controller (juggling plan sections 3, 4, 24, 29, 33, 42, 43, 45, 46,
 * 50, 53): builds the two-deck performance context from the deck analyses
 * and positions (no second transport), asks the planner for a juggle on
 * every Auto DJ tick, runs it through the executor against the shared clock,
 * watches for abort conditions and manual overrides, keeps the history and
 * the learned memory, and publishes telemetry. The transition executor keeps
 * ordinary transitions; this layer only performs between them.
 */
import { fractionalBeatAt } from '../beatGrid';
import { timelineAt, barIndexAt, barPhaseAtBeat, trackBeatConfidence } from '../beatGrid';
import { realTimers, type ExecutorTimers } from '../transitionExecutor';
import { keyAt } from '../trackAnalysis';
import { shiftedKeyName } from '../tempoKeySolver';
import type { DJTrackAnalysis, SetEnergyPhase } from '../types';
import { classifyWindow, materialRefs } from './juggleMaterial';
import { PATTERN_INTENSITY, coarsenLadder, minLadderRung, phaseAt, rolesAt, transitionLadder } from './jugglePatterns';
import { budgetFor, conditions, downbeatAtOrAfter, confidencePolicy, intensityFor, lowConfidenceReason, planJuggle, releasePattern, scoreJuggleQuality, type JuggleDecision } from './jugglePlanner';
import { phaseUnverified, PHASE_VERIFIED_SEC } from './phaseVerification';
import { cutTimings, executeJuggle, type JuggleActionSink, type JuggleClock, type JuggleEvent, type JuggleExecution, type JuggleExecutionResult } from './juggleExecutor';
import type {
  DJDeckPerformanceState, DJJuggleHistory, DJJugglePerformanceContext, DJPerformanceMode, JuggleMode, JuggleQualityScore,
  JuggleTelemetry, DJJugglePatternType, JuggleNowState, StandaloneTelemetry, JuggleCutTiming,
} from './juggleTypes';

type AB = 'A' | 'B';

export interface DeckInput {
  trackId: string;
  analysis: DJTrackAnalysis | null;
  positionSec: number;
  playing: boolean;
  bpm: number;
  loop?: { startSec: number; endSec: number; lengthBeats: number } | null;
  /** Semitones the deck's varispeed moves the heard key (0 with key lock). */
  keyShiftSemitones?: number;
}

export interface TickInput {
  masterDeck: AB;
  decks: Record<AB, DeckInput>;
  setPhase: SetEnergyPhase;
  energy: number;
  targetEnergy: number;
  performanceMode: DJPerformanceMode;
  /** Seconds until the planned transition starts; null when none is planned. */
  transitionApproachingSec: number | null;
  /** The user moved something (crossfader, deck, cue, FX, tempo) since the last tick. */
  userControl?: string | null;
  /** Hands the scratch, the transition and the FX hold now (scratch plan section 27, the shared budget of 6). */
  otherHands?: number;
  /** C15 (three_deck `_perf_events`, two hands): Deck C plays its routine, so the A/B decks only play and fade -
   *  no juggle starts and a running one releases. The reason, or null when the hands are free. */
  deckCHolds?: string | null;
}

export interface JuggleControllerDeps {
  sink: JuggleActionSink;
  /** The clock for a deck: fractional beats on the deck's own grid. */
  clockFor: (deck: AB, analysis: DJTrackAnalysis, position: () => number) => JuggleClock;
  positionOf: (deck: AB) => number;
  timers?: ExecutorTimers;
  now?: () => number;
  onEvent?: (e: JuggleEvent) => void;
  onTelemetry?: (t: JuggleTelemetry) => void;
  /** Called when a performed pattern ends (completed, aborted or fallen back), after the history is written. */
  onFinish?: (result: JuggleExecutionResult) => void;
  seed?: number;
}

export interface JuggleTickResult {
  started: boolean;
  active: boolean;
  decision: JuggleDecision | null;
  aborted: string | null;
}

const RECENT = 6;

export class DJJuggleController {
  private mode: JuggleMode = 'OFF';
  private intensityOverride = -1;
  private execution: JuggleExecution | null = null;
  private execCtx: DJJugglePerformanceContext | null = null;
  private history: DJJuggleHistory[] = [];
  private learned = new Map<string, number>();
  private juggledSec = 0;
  private startedAt: number;
  private lastJuggleAt = -Infinity;
  private lastDecision: JuggleDecision | null = null;
  private lastQuality: JuggleQualityScore | null = null;
  private lastCtx: DJJugglePerformanceContext | null = null;
  private pendingAbort: string | null = null;
  private counter = 0;
  private standalone: StandaloneTelemetry | null = null;
  private standaloneNote: string | null = null;
  private nowRequest: JuggleNowState | null = null;
  readonly events: JuggleEvent[] = [];
  readonly counts: Record<string, number> = { ticks: 0, started: 0, completed: 0, aborted: 0, fallbacks: 0 };

  private deps: JuggleControllerDeps;

  constructor(deps: JuggleControllerDeps) {
    this.deps = deps;
    this.startedAt = this.now();
  }

  private now(): number { return (this.deps.now ?? this.deps.timers?.now ?? realTimers.now)(); }

  setMode(mode: JuggleMode): void { this.mode = mode; if (mode === 'OFF' && this.execution) this.abort('Auto Juggle off'); }
  getMode(): JuggleMode { return this.mode; }
  setIntensity(v: number): void { this.intensityOverride = v; }
  isActive(): boolean { return !!this.execution?.active(); }
  getHistory(): readonly DJJuggleHistory[] { return this.history; }
  getLastDecision(): JuggleDecision | null { return this.lastDecision; }
  currentExecution(): JuggleExecution | null { return this.execution; }
  /** Pending timers and executions: the leak check for long sets. */
  openWork(): number { return this.execution?.active() ? 1 : 0; }

  /**
   * Auto DJ's stand-alone juggle (plan 2026-10-11-dj-juggling, P4.5): shown
   * with the telemetry. `note` says why none is set up while only one deck
   * plays (the planner's own "both decks must play" says nothing then).
   */
  setStandalone(standalone: StandaloneTelemetry | null, note: string | null = null): void {
    const nextNote = standalone ? null : note;
    const same = JSON.stringify(standalone) === JSON.stringify(this.standalone) && nextNote === this.standaloneNote;
    this.standalone = standalone ? { ...standalone } : null;
    this.standaloneNote = nextNote;
    if (!same) this.deps.onTelemetry?.(this.telemetry());
  }

  // ── Juggle Now (owner decision 2026-10-12) ─────────────────────────────────

  /**
   * The user asks for a juggle now. The poll loop's own entry (tick, and the
   * stand-alone setup it drives) plans it with the timing gates skipped - the
   * set phase, the cooldown, the juggled fraction, a recent juggle, the
   * musical moment - and every safety gate kept. The request stays pending
   * until a pattern starts or a gate refuses it; the refusal is shown.
   */
  requestNow(): void {
    this.nowRequest = { state: 'pending', reason: 'Juggle Now: planning' };
    this.deps.onTelemetry?.(this.telemetry());
  }
  /** A Juggle Now request is waiting for its juggle: the timing gates are skipped. */
  nowPending(): boolean { return this.nowRequest?.state === 'pending'; }
  nowState(): JuggleNowState | null { return this.nowRequest ? { ...this.nowRequest } : null; }
  /** A pending Juggle Now is refused: a safety gate, or the decks are not Auto DJ's to juggle now. */
  refuseNow(reason: string): void {
    if (!this.nowPending()) return;
    this.nowRequest = { state: 'refused', reason };
    this.record({ kind: 'juggleAborted', beat: 0, reason: `Juggle Now refused: ${reason}` });
    this.deps.onTelemetry?.(this.telemetry());
  }

  /**
   * A stand-alone setup gave up before any pattern (owner plan section 24: the
   * budget counts the attempt): the cooldown runs from now, as after a juggle,
   * so a double that could not be locked is not set up again on the next poll.
   */
  noteFailedSetup(): void { this.lastJuggleAt = this.now(); }

  /** Section 43: a manual override yields at once; the rest of the pattern is released. */
  noteUserControl(what: string): void { if (this.execution?.active()) this.pendingAbort = `user control: ${what}`; }

  /** Section 42.2: graceful abort - release to the strongest deck. */
  abort(reason: string): void { if (this.execution?.active()) this.execution.abort(reason); }

  /** Section 33: emergency - cancel pending, strongest deck, stable crossfader, loops out, continue. */
  emergency(reason: string): void {
    if (this.execution?.active()) this.execution.cancel(`emergency: ${reason}`);
    const st = this.deps.sink.state();
    const safe: AB = st.audible.A ? 'A' : st.audible.B ? 'B' : st.playing.A ? 'A' : st.playing.B ? 'B' : st.crossfader <= 0.5 ? 'A' : 'B';
    const info = { beatSec: 0.5, beatNow: 0, patternBeat: 0 };
    this.deps.sink.apply({ type: 'ReleaseDeck', deck: safe, executeAtBeat: 0, reason: `emergency: ${reason}` }, info);
    this.deps.sink.apply({ type: 'ResetDeck', deck: 'BOTH', executeAtBeat: 0, reason: 'emergency: clean state' }, info);
    this.record({ kind: 'juggleAborted', beat: 0, reason: `emergency: ${reason}` });
    this.lastJuggleAt = this.now();
  }

  private record(e: JuggleEvent): void {
    this.events.push(e);
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
    this.deps.onEvent?.(e);
  }

  // ── Context (sections 4, 31, 38) ───────────────────────────────────────────

  private deckState(deck: AB, input: DeckInput): DJDeckPerformanceState {
    const a = input.analysis;
    const pos = input.positionSec;
    if (!a) {
      return { deck, trackId: input.trackId, position: pos, beatPhase: 0, barPhase: 0, beatIndex: 0, bpm: input.bpm, keyConfidence: 0, energy: 0, drumsActive: false, bassActive: false, vocalsActive: false, melodicActivity: 0, loop: input.loop ?? null, analysisConfidence: 0, playing: input.playing, analysis: null };
    }
    const beat = fractionalBeatAt(a.beatGrid, pos);
    const refs = materialRefs(a);
    const at = (tl: { values: number[]; hopSec: number }, ref: number) => timelineAt(tl.values, tl.hopSec || 0.25, pos) / ref;
    const section = a.sections.find((s) => s.start <= pos && pos < s.end);
    // The key heard now, as the transition planner reads it: the local key at
    // the position, moved by the varispeed shift.
    const local = keyAt(a, pos);
    const localName = local.key.mode === 'unknown' ? null : local.key.name;
    const heardKey = shiftedKeyName(localName, input.keyShiftSemitones ?? 0) ?? localName ?? undefined;
    return {
      deck, trackId: input.trackId, position: pos, beatPhase: beat - Math.floor(beat), barPhase: barPhaseAtBeat(a.downbeats, beat), beatIndex: beat,
      bpm: input.bpm || a.bpm, key: heardKey, keyConfidence: localName ? local.confidence : 0, section, cuePosition: a.cuePoints.bestMixIn, mixInPosition: a.cuePoints.bestMixIn, mixOutPosition: a.cuePoints.bestMixOut,
      energy: Math.min(1, at(a.intensity, refs.intensity)), drumsActive: at(a.drumActivity, refs.drums) > 0.4, bassActive: at(a.bassActivity, refs.bass) > 0.4,
      vocalsActive: a.vocalActivity.confidence > 0 && at(a.vocalActivity, refs.vocal) > 0.5, melodicActivity: Math.min(1, at(a.harmonicActivity, refs.harmonic)),
      loop: input.loop ?? null, analysisConfidence: a.analysisConfidence.overall, playing: input.playing, analysis: a,
    };
  }

  buildContext(input: TickInput): DJJugglePerformanceContext {
    const A = this.deckState('A', input.decks.A);
    const B = this.deckState('B', input.decks.B);
    const master = input.masterDeck === 'A' ? A : B;
    const ma = master.analysis;
    const bpb = ma?.meter.beatsPerBar || 4;
    const phrase = ma?.phrases.find((p) => p.start <= master.position && master.position < p.end);
    const phraseLengthBars = phrase?.lengthBars ?? ma?.phraseLengthBars ?? 8;
    const masterBar = ma ? barIndexAt(ma.downbeats, master.position) : Math.floor(master.beatIndex / bpb);
    const phrasePosition = phrase ? Math.max(0, Math.min(0.999, (master.position - phrase.start) / Math.max(1e-6, phrase.end - phrase.start))) : ((masterBar % phraseLengthBars) + master.barPhase) / phraseLengthBars;
    const bpmA = A.bpm || 1, bpmB = B.bpm || 1;
    const tempoMatch = Math.abs(bpmA - bpmB) / Math.max(bpmA, bpmB);
    const bothPlaying = A.playing && B.playing && !!A.analysis && !!B.analysis;
    // Sync = how well beatmatched decks on these grids hold: the grids' own confidence (as the
    // transition planner's pairConfidence reads it), times the live tempo match while both play.
    // A stopped or empty deck is the 'both decks must play' / 'need analysis' condition, not a
    // sync of 0 - that made every one-deck refusal read 'sync 0.00 < 0.6' (SID juggle report).
    const grids = [A, B].filter((d) => d.analysis).map((d) => d.analysis!.beatGrid.confidence);
    const gridSync = grids.length ? Math.min(...grids) : 0;
    const deckSyncConfidence = bothPlaying ? Math.max(0, 1 - tempoMatch * 20) * gridSync : gridSync;
    const sameTrack = !!A.analysis && !!B.analysis && A.trackId === B.trackId;
    const nowSec = this.now() / 1000;
    const last = this.history[this.history.length - 1];
    const secondsSinceLastJuggle = Number.isFinite(this.lastJuggleAt) ? (this.now() - this.lastJuggleAt) / 1000 : Infinity;
    const sectionIdx = ma ? ma.sections.indexOf(master.section!) : -1;
    // The pair's beat confidence, the one definition the transition planner reads too (pairConfidence):
    // both decks' grids and bars when both are analysed, else the master's.
    const beatConfidence = A.analysis && B.analysis ? Math.min(trackBeatConfidence(A.analysis), trackBeatConfidence(B.analysis)) : ma ? trackBeatConfidence(ma) : 0;
    return {
      masterDeck: input.masterDeck, masterBeat: master.beatIndex, masterBar, phrasePosition, phraseLengthBars, beatsPerBar: bpb,
      deckA: A, deckB: B, activeDeck: input.masterDeck, performanceMode: input.performanceMode, energy: input.energy, targetEnergy: input.targetEnergy, setPhase: input.setPhase,
      phraseConfidence: phrase?.confidence ?? (ma ? ma.analysisConfidence.downbeat * 0.8 : 0), beatConfidence,
      sectionConfidence: master.section?.confidence ?? 0, deckSyncConfidence, materialConfidence: Math.min(A.analysisConfidence, B.analysisConfidence),
      currentSection: master.section, nextSection: sectionIdx >= 0 ? ma?.sections[sectionIdx + 1] : undefined,
      lastJuggle: last, recentPatterns: this.history.slice(-RECENT), intensity: this.lastDecision?.intensity ?? 0,
      tension: Math.max(0, input.targetEnergy - input.energy), fallbackAvailable: A.playing || B.playing, sameTrackOnBothDecks: sameTrack,
      transitionApproachingSec: input.transitionApproachingSec, elapsedSec: nowSec - this.startedAt / 1000, juggledSec: this.juggledSec, secondsSinceLastJuggle,
      otherHands: input.otherHands ?? 0,
    };
  }

  // ── Juggle transition (section 26) ─────────────────────────────────────────

  /**
   * The juggle budget a transition plan reads (owner plan sections 24, 28,
   * 29): whether the set arc, the cooldown and the juggled fraction allow a
   * juggle now, why not, and the recent juggles the ladder varies against.
   * Stand-alone juggles and juggle transitions share this one budget.
   */
  transitionBudget(input: TickInput): { allowed: boolean; reasons: string[]; recent: DJJuggleHistory[] } {
    const ctx = this.buildContext(input);
    const b = budgetFor(ctx, this.mode);
    return { allowed: b.allowed, reasons: b.reasons, recent: this.history.slice(-RECENT) };
  }

  /**
   * Run a juggle transition's ladder now - the transition executor's trade
   * stage. The pair is judged again on the decks as they are (owner plan
   * sections 24, 25, 31): the budget and cooldown, the bad conditions (key
   * clash, vocals on both decks, unstable sync) and the confidence, which
   * may coarsen the planned rungs (A1 B1 A1 B1 becomes A2 B2, the same
   * length) or call the ladder off. The incoming is locked to the
   * outgoing's bars while it is silent and its heard phase must be verified
   * before its first answer, or the ladder releases (section 16). The
   * outgoing (`input.masterDeck`) and the incoming trade the rungs from the
   * bar the incoming started on (within a quarter beat, else the next bar),
   * then the incoming is released. Resolves when released or aborted.
   */
  performLadder(input: TickInput, ladder: { ladderBars: number[]; target: AB }): Promise<JuggleExecutionResult> {
    const refuse = (reason: string): Promise<JuggleExecutionResult> => {
      this.record({ kind: 'juggleAborted', beat: 0, reason });
      return Promise.resolve({ completed: false, aborted: true, refused: true, reason, trace: [], fallbacks: 0, events: [], endBeat: 0 });
    };
    if (this.mode === 'OFF') return refuse('Auto Juggle off');
    if (this.execution?.active()) this.execution.abort('juggle transition took over');
    const ctx = this.buildContext(input);
    this.lastCtx = ctx;
    const policy = confidencePolicy(ctx);
    const minRung = minLadderRung(this.mode, policy);
    const budget = budgetFor(ctx, this.mode);
    // The keys were judged by the transition plan at the join, with its key lock or shift (the decks'
    // local keys here are read before that plan's tempo and key moves): every other bad condition holds.
    const bad = conditions(ctx).bad.filter((r) => !r.startsWith('key clash'));
    const blocked = [...(budget.allowed ? [] : budget.reasons), ...bad, ...(minRung === null ? [lowConfidenceReason(ctx)] : [])];
    if (blocked.length) {
      this.lastDecision = this.idleDecision(ctx, `juggle transition not performed: ${blocked.join('; ')}`);
      this.publish(ctx);
      return refuse(`juggle transition not performed: ${blocked.join('; ')}`);
    }
    const bpb = ctx.beatsPerBar;
    const ladderBars = coarsenLadder(ladder.ladderBars, minRung!);
    const pattern = transitionLadder({
      primary: input.masterDeck, beatsPerBar: bpb, intensity: PATTERN_INTENSITY.transitionLadder, phraseBars: ctx.phraseLengthBars,
      confidence: Math.min(ctx.beatConfidence, ctx.deckSyncConfidence), seed: (this.deps.seed ?? 0) + this.counter++, ladderBars, target: ladder.target,
    });
    // The bar the incoming started on (within a quarter beat), on the master's own bar grid.
    const startBeat = downbeatAtOrAfter(ctx, ctx.masterBeat - 0.25);
    const coarsened = ladderBars.join('-') !== ladder.ladderBars.join('-') ? ` (${policy} confidence: ${ladder.ladderBars.join('-')} traded as ${ladderBars.join('-')})` : '';
    const decision: JuggleDecision = {
      pattern, candidates: [], reason: `juggle transition: ${pattern.reason}${coarsened}`, blocked: [], policy, intensity: pattern.intensity, startBeat,
    };
    this.lastDecision = decision;
    this.start(decision, ctx, input, { deck: ladder.target, beforeBeat: startBeat + ladderBars[0] * bpb });
    this.publish(ctx);
    // An abort before the first cut onto the incoming (its phase never verified, the decks drifted) traded
    // nothing: the incoming was never heard, and the transition resolves as if the ladder was refused.
    return this.execution!.done.then((r) => (r.completed ? r : {
      ...r, refused: !r.trace.some((t) => t.status === 'executed' && t.action.type === 'CutIn' && t.action.deck === ladder.target),
    }));
  }

  // ── Tick (sections 21, 24, 41, 42) ─────────────────────────────────────────

  tick(input: TickInput): JuggleTickResult {
    this.counts.ticks++;
    const ctx = this.buildContext(input);
    this.lastCtx = ctx;
    if (input.userControl) this.noteUserControl(input.userControl);
    if (this.execution?.active()) {
      // Section 42: abort conditions while performing.
      const reason = this.pendingAbort ?? this.abortReason(ctx, input);
      if (reason) { this.pendingAbort = null; this.execution.abort(reason); }
      this.refuseNow('a juggle is already playing');
      this.publish(ctx);
      return { started: false, active: this.execution.active(), decision: this.lastDecision, aborted: reason };
    }
    if (input.userControl) { this.lastJuggleAt = this.now(); this.refuseNow(`user control: ${input.userControl}`); this.publish(ctx); return { started: false, active: false, decision: null, aborted: null }; }
    if (this.mode === 'OFF') { this.refuseNow('Auto Juggle off'); this.publish(ctx); return { started: false, active: false, decision: null, aborted: null }; }
    if (input.performanceMode !== 'JUGGLE' && input.performanceMode !== 'JUGGLE_TRANSITION') {
      // Not this layer's turn: say so, instead of publishing the reasons of a
      // decision made before the transition took the decks.
      this.lastDecision = this.idleDecision(ctx, `${input.performanceMode}: the transition owns the decks`);
      this.refuseNow(this.lastDecision.reason);
      this.publish(ctx);
      return { started: false, active: false, decision: null, aborted: null };
    }
    const skipTiming = this.nowPending();
    const decision = planJuggle(ctx, { mode: this.mode, intensityOverride: this.intensityOverride, learned: (t, c) => this.learnedFor(t, c), seed: (this.deps.seed ?? 0) + this.counter++, skipTiming });
    this.lastDecision = decision;
    if (!decision.pattern) {
      // With one deck playing the stand-alone setup answers a Juggle Now (it makes the second deck); with two the planner did.
      if (skipTiming && ctx.deckA.playing && ctx.deckB.playing) this.refuseNow(decision.reason);
      this.publish(ctx);
      return { started: false, active: false, decision, aborted: null };
    }
    if (skipTiming) this.nowRequest = { state: 'started', reason: decision.reason };
    this.start(decision, ctx, input);
    this.publish(ctx);
    return { started: true, active: true, decision, aborted: null };
  }

  private idleDecision(ctx: DJJugglePerformanceContext, reason: string): JuggleDecision {
    return { pattern: null, candidates: [], reason, blocked: [reason], policy: confidencePolicy(ctx), intensity: intensityFor(ctx, this.mode, this.intensityOverride, 0, { skipTiming: this.nowPending() }), startBeat: ctx.masterBeat };
  }

  private abortReason(ctx: DJJugglePerformanceContext, input: TickInput): string | null {
    if (this.mode === 'OFF') return 'Auto Juggle off';
    if (input.deckCHolds) return input.deckCHolds;
    if (!ctx.deckA.playing || !ctx.deckB.playing) return 'deck failure: a deck stopped';
    if (ctx.beatConfidence < 0.5) return 'beat confidence dropped';
    if (ctx.deckSyncConfidence < 0.5) return 'decks drifted apart';
    if (input.performanceMode !== 'JUGGLE' && input.performanceMode !== 'JUGGLE_TRANSITION') return 'transition took over';
    if (this.execCtx && (ctx.deckA.trackId !== this.execCtx.deckA.trackId || ctx.deckB.trackId !== this.execCtx.deckB.trackId)) return 'track changed';
    if (ctx.deckA.vocalsActive && ctx.deckB.vocalsActive && this.execution && rolesAt(this.execution.pattern, this.execution.beatNow() - this.execution.startBeat).A === 'LAYER') return 'vocal collision';
    return null;
  }

  /**
   * Start a decision. `verify`: the deck whose heard bar phase must pass the
   * juggle layer's one verification rule (phaseUnverified) before
   * `beforeBeat` (its first audible bar), or the pattern releases gracefully
   * (owner plan section 16).
   */
  private start(decision: JuggleDecision, ctx: DJJugglePerformanceContext, input: TickInput, verify?: { deck: AB; beforeBeat: number }): void {
    const pattern = decision.pattern!;
    const masterInput = input.decks[input.masterDeck];
    const clock = this.deps.clockFor(input.masterDeck, masterInput.analysis!, () => this.deps.positionOf(input.masterDeck));
    const sink = this.deps.sink;
    let verified = !verify || !sink.phaseError;
    const phaseGate = (): string | null => {
      if (verified) return null;
      const off = phaseUnverified(sink, verify!.deck);
      if (off === null) {
        verified = true;
        this.record({ kind: 'juggleActionExecuted', beat: clock.beatNow(), reason: `phase verified: deck ${verify!.deck} within ${(PHASE_VERIFIED_SEC * 1000).toFixed(0)} ms of the master's bars`, pattern: pattern.id });
        return null;
      }
      if (clock.beatNow() < verify!.beforeBeat - 0.25) return null;
      return `phase not verified before its first bar: ${off}`;
    };
    this.execCtx = ctx;
    this.counts.started++;
    this.record({ kind: 'jugglePatternSelected', beat: ctx.masterBeat, reason: decision.reason, pattern: pattern.id });
    const startedAt = this.now();
    const exec = executeJuggle(pattern, decision.startBeat, {
      clock, sink: this.deps.sink, timers: this.deps.timers, onEvent: (e) => this.record(e),
      abortCheck: () => this.pendingAbort ?? phaseGate(),
    });
    this.execution = exec;
    exec.done.then((result) => this.finish(pattern, result, ctx, startedAt, decision, cutTimings(result.trace, exec.startBeat, clock.beatSec()))).catch(() => { /* never throws */ });
  }

  private finish(pattern: JuggleExecution['pattern'], result: JuggleExecutionResult, ctx: DJJugglePerformanceContext, startedAt: number, decision: JuggleDecision, cuts: JuggleCutTiming[]): void {
    this.pendingAbort = null;
    this.juggledSec += (this.now() - startedAt) / 1000;
    this.lastJuggleAt = this.now();
    this.counts.fallbacks += result.fallbacks;
    if (result.completed) this.counts.completed++; else this.counts.aborted++;
    const quality = scoreJuggleQuality(pattern, result.trace, ctx, { fallbacks: result.fallbacks, aborted: result.aborted });
    this.lastQuality = quality;
    const entry: DJJuggleHistory = {
      patternType: pattern.type, durationBars: pattern.durationBars, intensity: pattern.intensity, sourceTracks: [ctx.deckA.trackId, ctx.deckB.trackId],
      successScore: quality.overall, timestamp: this.now(), sequence: pattern.sequence, sectionKind: ctx.currentSection?.kind, setPhase: ctx.setPhase, energy: ctx.energy,
      ladderBars: pattern.ladderBars, cuts,
    };
    this.history.push(entry);
    if (this.history.length > 64) this.history.splice(0, this.history.length - 64);
    // Section 50: learned memory, deterministic EMA per pattern + context.
    const key = this.memoryKey(pattern.type, ctx);
    const prev = this.learned.get(key);
    this.learned.set(key, prev === undefined ? quality.overall : prev * 0.7 + quality.overall * 0.3);
    if (!result.completed && !result.aborted) this.record({ kind: 'juggleFallback', beat: result.endBeat, reason: `${decision.pattern?.type}: ${result.reason}` });
    if (this.execution && !this.execution.active()) this.execution = null;
    this.deps.onTelemetry?.(this.telemetry());
    this.deps.onFinish?.(result);
  }

  private memoryKey(type: DJJugglePatternType, ctx: DJJugglePerformanceContext): string { return `${type}|${ctx.setPhase}|${ctx.currentSection?.kind ?? '-'}`; }
  private learnedFor(type: DJJugglePatternType, ctx: DJJugglePerformanceContext): number | null { return this.learned.get(this.memoryKey(type, ctx)) ?? null; }

  /** The release pattern for an external emergency on a known master deck. */
  releaseNow(primary: AB, beatsPerBar: number): void {
    const pattern = releasePattern(primary, beatsPerBar);
    const info = { beatSec: 0.5, beatNow: 0, patternBeat: 0 };
    for (const a of pattern.actions) this.deps.sink.apply(a, info);
  }

  // ── Telemetry (section 45) ─────────────────────────────────────────────────

  telemetry(ctx: DJJugglePerformanceContext | null = this.lastCtx): JuggleTelemetry {
    const exec = this.execution?.active() ? this.execution : null;
    // A running pattern's own clock: continuous across its seeks of the master (juggleExecutor).
    const beat = exec ? exec.beatNow() - exec.startBeat : ctx ? ctx.masterBeat : 0;
    const roles = exec ? rolesAt(exec.pattern, beat) : { A: 'PRIMARY' as const, B: 'SILENT' as const };
    const materialOf = (d: DJDeckPerformanceState): string[] => d.analysis ? classifyWindow(d.analysis, d.deck, d.position, 1).classes : [];
    const budget = ctx ? budgetFor(ctx, this.mode, { skipTiming: this.nowPending() }) : null;
    const d = this.lastDecision;
    return {
      mode: this.mode, active: !!exec, pattern: exec?.pattern.type ?? null, sequence: exec?.pattern.sequence ?? null, phase: exec ? phaseAt(exec.pattern, beat) : null,
      intensity: d?.intensity ?? 0, activeDeck: ctx?.activeDeck ?? 'A',
      deckA: { material: ctx ? materialOf(ctx.deckA) : [], confidence: ctx?.deckA.analysisConfidence ?? 0, role: roles.A },
      deckB: { material: ctx ? materialOf(ctx.deckB) : [], confidence: ctx?.deckB.analysisConfidence ?? 0, role: roles.B },
      nextActions: exec ? exec.nextActions(6) : [], reason: d?.reason ?? 'no decision yet', confidence: d ? Math.min(ctx?.beatConfidence ?? 0, ctx?.deckSyncConfidence ?? 0) : 0,
      safety: this.safety(exec !== null, d),
      budget: { juggledFraction: budget?.fraction ?? 0, secondsSinceLastJuggle: ctx?.secondsSinceLastJuggle ?? Infinity, cooldownSec: budget?.cooldownSec ?? 0 },
      lastQuality: this.lastQuality, history: this.history.slice(-5).map((h) => ({ type: h.patternType, bars: h.durationBars, score: h.successScore, ...(h.cuts ? { cuts: h.cuts } : {}) })),
      standalone: this.standalone, juggleNow: this.nowState(),
    };
  }

  private safety(performing: boolean, d: JuggleDecision | null): string {
    if (this.pendingAbort) return `aborting: ${this.pendingAbort}`;
    const sa = this.standalone;
    if (!performing && sa && sa.phase !== 'running') return `setting up: ${sa.source} on ${sa.deck} (${sa.trigger})`;
    if (!performing && !sa && this.standaloneNote) return `stand-alone: ${this.standaloneNote}`;
    return d?.blocked.length ? `blocked: ${d.blocked[0]}` : 'clear';
  }

  private publish(ctx: DJJugglePerformanceContext): void { this.deps.onTelemetry?.(this.telemetry(ctx)); }
}

/** The default clock: the deck's position mapped through its analysis beat grid. */
export function analysisClock(analysis: DJTrackAnalysis, position: () => number, bpmOverride?: () => number): JuggleClock {
  return {
    beatNow: () => fractionalBeatAt(analysis.beatGrid, position()),
    beatSec: () => 60 / Math.max(60, bpmOverride?.() || analysis.bpm),
  };
}
