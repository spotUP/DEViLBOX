/**
 * DJSessionController (plan sections 32-34, 37, 38, 56, 57): the coordinator
 * above the Auto DJ state machine. Owns the session memory, the planning
 * cadence (session order replanned at every track start), anticipatory
 * transition planning (as soon as the next track's analysis exists), smart
 * preload timing, the fallback hierarchy, adaptation from measured quality
 * and the telemetry the debug view reads. It holds no musical heuristics of
 * its own: the planners decide, the executor executes.
 */
import { useDJStore } from '@/stores/useDJStore';
import type { PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { getDecisionLog } from './decisionLog';
import { DJSessionMemory } from './sessionMemory';
import { getStyle } from './styleProfiles';
import { planSet, type PlannerTrack } from './setPlanner';
import { fallbackPlan, planTransition } from './transitionPlanner';
import { juggleModeOf } from './juggle/juggleTypes';
import { evaluateTransition, checkInvariants } from './transitionQuality';
import { buildPerformanceContext } from './performanceContext';
import { buildTelemetry, type AutoDJTelemetry } from './telemetry';
import type { ExecutionResult } from './transitionExecutor';
import type {
  DJPerformanceContext, DJStyleProfile, DJTrackAnalysis, DJTrackCandidate, DJTransitionPlan, SetEnergyPhase, SetPlan,
  TransitionQuality,
} from './types';

export interface SessionTrack {
  index: number;
  id: string;
  name: string;
  artist?: string | null;
  track: PlaylistTrack;
}

export interface ControllerOptions {
  now?: () => number;
  /** Seconds the executor needs between "trigger" and the first keyframe (deck load + grid wait). */
  loadLeadSec?: number;
}

export interface PreloadTiming {
  leadSec: number;
  reasons: string[];
}

export const BASE_PRELOAD_LEAD_SEC = 60;

export class DJSessionController {
  readonly memory: DJSessionMemory;
  private now: () => number;
  private style: DJStyleProfile;
  private creativeRisk: number;
  private setPlan: SetPlan | null = null;
  private played: number[] = [];
  private currentIndex = -1;
  private plan: DJTransitionPlan | null = null;
  private planInputs: { outgoing: DJTrackAnalysis; incoming: DJTrackAnalysis } | null = null;
  private lastQuality: TransitionQuality | null = null;
  /** Exponential average of how long a preload took, seconds (device performance). */
  private preloadSecEma = 20;
  private preloadStartedAt = 0;
  private tracks: SessionTrack[] = [];
  private candidates: DJTrackCandidate[] = [];
  private sessionStartedAt: number;
  readonly loadLeadSec: number;
  /** Reachability sentinels: how often each stage ran this session. */
  readonly counts = { sessionPlans: 0, transitionPlans: 0, executions: 0, fallbacks: 0, emergencies: 0, adaptations: 0 };

  constructor(opts: ControllerOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.memory = new DJSessionMemory(this.now);
    this.sessionStartedAt = this.now();
    this.loadLeadSec = opts.loadLeadSec ?? 2;
    const s = useDJStore.getState();
    this.style = getStyle(s.autoDJStyle);
    this.creativeRisk = s.autoDJCreativeRisk >= 0 ? s.autoDJCreativeRisk : this.style.riskTolerance;
  }

  // ── Session ───────────────────────────────────────────────────────────────

  startSession(tracks: SessionTrack[], startIndex: number): void {
    this.memory.reset();
    this.played = [];
    this.plan = null;
    this.planInputs = null;
    this.lastQuality = null;
    this.tracks = tracks;
    this.sessionStartedAt = this.now();
    const s = useDJStore.getState();
    this.style = getStyle(s.autoDJStyle);
    this.creativeRisk = s.autoDJCreativeRisk >= 0 ? s.autoDJCreativeRisk : this.style.riskTolerance;
    getDecisionLog().record('SET_PHASE', [`session started with style ${this.style.name}, creative risk ${this.creativeRisk.toFixed(2)}`], { time: this.now() });
    this.currentIndex = startIndex;
    this.replanSession();
  }

  get styleProfile(): DJStyleProfile { return this.style; }
  get currentCreativeRisk(): number { return this.creativeRisk; }
  get currentPlan(): DJTransitionPlan | null { return this.plan; }
  get currentSetPlan(): SetPlan | null { return this.setPlan; }
  get setPhase(): SetEnergyPhase { return this.setPlan?.phase ?? 'OPENING'; }
  get targetEnergy(): number { return this.setPlan?.targetEnergy ?? 0.5; }

  setTracks(tracks: SessionTrack[]): void { this.tracks = tracks; }

  private plannerTracks(): PlannerTrack[] {
    return this.tracks.map((t) => ({
      index: t.index, id: t.id, name: t.name, artist: t.artist ?? null, summary: t.track.djSummary ?? null,
      bpm: t.track.bpm, musicalKey: t.track.musicalKey, energy: t.track.energy, duration: t.track.duration, isBad: t.track.isBad,
    }));
  }

  /** Replan the session order from the current track (plan sections 8, 10, 32). */
  replanSession(currentEnergy?: number): SetPlan {
    const plan = planSet({
      tracks: this.plannerTracks(),
      currentIndex: this.currentIndex,
      played: this.played,
      memory: this.memory.snapshot(),
      style: this.style,
      creativeRisk: this.creativeRisk,
      elapsedSec: (this.now() - this.sessionStartedAt) / 1000,
      plannedDurationSec: this.plannedDurationSec(),
      currentEnergy,
    });
    this.setPlan = plan;
    this.candidates = plan.candidates;
    this.counts.sessionPlans++;
    useDJStore.getState().setAutoDJSessionOrder(plan.order);
    const log = getDecisionLog();
    log.record('PLAN_SESSION_ORDER', plan.reasons, { time: this.now(), details: { order: plan.order, phase: plan.phase, targetEnergy: plan.targetEnergy } });
    const chosen = plan.candidates.find((c) => c.index === plan.order[0]);
    if (chosen) {
      log.record('SELECT_NEXT_TRACK', chosen.reasons, {
        time: this.now(),
        selectedTrack: chosen.name,
        rejectedAlternatives: plan.candidates.filter((c) => c.index !== chosen.index).slice(0, 6).map((c) => ({ track: c.name, reason: c.rejections[0] ?? `score ${c.score.toFixed(2)} < ${chosen.score.toFixed(2)}` })),
        details: { components: chosen.components, score: chosen.score },
      });
    }
    return plan;
  }

  private plannedDurationSec(): number {
    const total = this.tracks.reduce((a, t) => a + (t.track.duration > 0 ? t.track.duration : 240), 0);
    return Math.max(1800, total);
  }

  /** The next playlist index from the session order (not from the playlist's own order). */
  nextIndex(): number | null {
    const order = this.setPlan?.order ?? [];
    return order.length ? order[0] : null;
  }

  /** A track started playing on a deck. */
  onTrackStarted(index: number, analysis: DJTrackAnalysis | null, info: { artist?: string | null; bpm: number; key: string | null; energy: number }): void {
    this.currentIndex = index;
    if (!this.played.includes(index)) this.played.push(index);
    const t = this.tracks.find((x) => x.index === index);
    this.memory.recordTrackStart(t?.id ?? String(index), { artist: info.artist ?? t?.artist ?? null, energy: analysis?.energy.perceivedIntensity ?? info.energy, key: info.key, bpm: info.bpm, time: this.now() });
    this.plan = null;
    this.planInputs = null;
    this.replanSession(analysis?.energy.perceivedIntensity);
  }

  // ── Preload (plan section 33) ─────────────────────────────────────────────

  preloadStarted(): void { this.preloadStartedAt = this.now(); }

  preloadFinished(): void {
    if (this.preloadStartedAt > 0) {
      const sec = (this.now() - this.preloadStartedAt) / 1000;
      this.preloadSecEma = this.preloadSecEma * 0.6 + sec * 0.4;
      this.preloadStartedAt = 0;
    }
  }

  /**
   * How long before the mix point the next track must start loading: the
   * base lead plus the expected render/decode time (track length, the
   * device's measured history), more when no analysis exists yet, more when
   * the planned transition is long or uncertain, with a safety margin.
   */
  preloadTiming(next: PlaylistTrack | null, outgoing: DJTrackAnalysis | null): PreloadTiming {
    const reasons: string[] = [`base ${BASE_PRELOAD_LEAD_SEC} s`];
    let lead = BASE_PRELOAD_LEAD_SEC;
    const isAudio = next ? /\.(wav|mp3|flac|ogg|m4a|aac)$/i.test(next.fileName) : false;
    const duration = next?.duration ?? 240;
    const render = isAudio ? 5 : Math.min(90, 10 + duration * 0.25);
    const device = Math.max(5, this.preloadSecEma);
    const expected = Math.max(render, device) + 20;
    if (expected > lead) { lead = expected; reasons.push(`render/decode expected ${expected.toFixed(0)} s (device history ${device.toFixed(0)} s)`); }
    if (next && !next.djSummary) { lead += 20; reasons.push('no analysis yet: +20 s'); }
    if (outgoing) {
      const bars = this.style.transitionLengthBars;
      const barSec = outgoing.bpm > 0 ? (60 / outgoing.bpm) * outgoing.meter.beatsPerBar : 2;
      const mixOut = outgoing.cuePoints.bestMixOut;
      const distance = mixOut !== undefined ? outgoing.durationSec - mixOut : bars * barSec;
      lead = Math.max(lead, distance + bars * barSec + 15);
      reasons.push(`mix point ${distance.toFixed(0)} s before the end, ${bars}-bar style length`);
      if (outgoing.analysisConfidence.overall < 0.5) { lead += 15; reasons.push('low confidence: +15 s'); }
    }
    return { leadSec: lead, reasons };
  }

  // ── Transition planning (plan sections 15, 32, 37) ────────────────────────

  /**
   * Plan the next transition from the two analyses (anticipatory: called as
   * soon as the incoming analysis exists, and again with the live position
   * just before execution). Returns null when the analyses are missing.
   */
  planTransitionFor(outgoing: DJTrackAnalysis | null, incoming: DJTrackAnalysis | null, decks: { outgoing: 'A' | 'B'; incoming: 'A' | 'B' }, outgoingPosition: number): DJTransitionPlan | null {
    if (!outgoing || !incoming) {
      getDecisionLog().record('EMERGENCY', [`no analysis for the ${!outgoing ? 'outgoing' : 'incoming'} deck: legacy crossfade`], { time: this.now() });
      this.plan = null;
      return null;
    }
    const s = useDJStore.getState();
    let plan = planTransition({
      outgoing, incoming, outgoingDeck: decks.outgoing, incomingDeck: decks.incoming, outgoingPosition,
      style: this.style, creativeRisk: this.creativeRisk, memory: this.memory.snapshot(), userBars: s.autoDJTransitionBars,
      withFilter: s.autoDJWithFilter, smartCuts: s.autoDJSmartCuts, setPhase: this.setPhase, targetEnergy: this.targetEnergy,
      leadSec: this.loadLeadSec, bridgeAvailable: this.bridgeAvailable(incoming), seed: this.memory.transitionCount + this.counts.transitionPlans * 7,
      juggleMode: juggleModeOf(s.autoDJJuggleMode),
    });
    const invariants = checkInvariants(plan, outgoing, incoming);
    const broken = invariants.filter((i) => !i.ok);
    if (broken.length) {
      // Plan-level degrade (plan section 37): the safe phrase transition keeps the points, drops the creative parts.
      const safe = fallbackPlan(plan, {
        outgoing, incoming, outgoingDeck: decks.outgoing, incomingDeck: decks.incoming, outgoingPosition, style: this.style, creativeRisk: this.creativeRisk,
        memory: this.memory.snapshot(), userBars: s.autoDJTransitionBars, withFilter: s.autoDJWithFilter, smartCuts: s.autoDJSmartCuts, setPhase: this.setPhase, targetEnergy: this.targetEnergy,
        juggleMode: juggleModeOf(s.autoDJJuggleMode),
      }, 'fallback');
      getDecisionLog().record('FALLBACK', broken.map((b) => `${b.name}: ${b.detail}`), { time: this.now(), details: { from: plan.style, to: safe.style } });
      this.counts.fallbacks++;
      plan = safe;
    }
    this.plan = plan;
    this.planInputs = { outgoing, incoming };
    this.counts.transitionPlans++;
    getDecisionLog().record('PLAN_TRANSITION', plan.reasons, {
      time: this.now(), selectedTrack: plan.style,
      rejectedAlternatives: plan.rejected.slice(0, 8).map((r) => ({ track: r.style, reason: r.reason })),
      details: { id: plan.id, startTimeSec: plan.startTimeSec, incomingPosition: plan.incomingPosition, durationBars: plan.durationBars, confidence: plan.confidence, risk: plan.risk.overall },
    });
    return plan;
  }

  private bridgeAvailable(incoming: DJTrackAnalysis): boolean {
    const order = this.setPlan?.order ?? [];
    if (order.length < 2) return false;
    const after = this.tracks.find((t) => t.index === order[1]);
    const bpm = after?.track.djSummary?.bpm ?? after?.track.bpm ?? 0;
    return bpm > 0 && Math.abs(Math.log2(bpm / Math.max(1, incoming.bpm))) < Math.log2(1.08);
  }

  // ── After execution (plan sections 41, 69: hear the consequence, adapt) ──

  onTransitionComplete(result: ExecutionResult, plan: DJTransitionPlan | null = this.plan): TransitionQuality | null {
    this.counts.executions++;
    if (result.fellBack === 'emergency') this.counts.emergencies++;
    const inputs = this.planInputs;
    let quality: TransitionQuality | null = null;
    if (plan && inputs) {
      quality = evaluateTransition(plan, inputs.outgoing, inputs.incoming, result.trace);
      this.lastQuality = quality;
      this.memory.recordTransition({
        time: this.now(), fromTrackId: inputs.outgoing.id, toTrackId: inputs.incoming.id, style: plan.style, lengthBars: plan.durationBars,
        effects: plan.effects.map((e) => e.kind), energyBefore: inputs.outgoing.energy.perceivedIntensity, energyAfter: inputs.incoming.energy.perceivedIntensity,
        key: inputs.incoming.key.mode === 'unknown' ? null : inputs.incoming.key.name, bpm: inputs.incoming.bpm, wasCut: plan.style === 'hardCut',
        wasBassSwap: plan.style === 'bassSwap', hadVocalOverlap: plan.risk.vocal > 0.4, quality, fellBack: result.fellBack !== 'none',
      });
      // Adapt: a fallback or a poor result lowers the risk budget a little, a good creative result raises it toward the style's.
      const before = this.creativeRisk;
      if (result.fellBack !== 'none' || quality.overall < 0.45) this.creativeRisk = Math.max(0, this.creativeRisk - 0.1);
      else if (quality.overall > 0.7) this.creativeRisk = Math.min(this.style.riskTolerance, this.creativeRisk + 0.03);
      if (Math.abs(before - this.creativeRisk) > 1e-9) {
        this.counts.adaptations++;
        getDecisionLog().record('ADAPT', [`quality ${quality.overall.toFixed(2)}, fell back ${result.fellBack}: creative risk ${before.toFixed(2)} -> ${this.creativeRisk.toFixed(2)}`], { time: this.now() });
      }
      getDecisionLog().record('EXECUTE_TRANSITION', [`${plan.style} ${plan.durationBars} bars: completed ${result.completed}, fell back ${result.fellBack}, quality ${quality.overall.toFixed(2)}`], { time: this.now(), details: { quality, events: result.trace.events.slice(0, 12) } });
    } else {
      getDecisionLog().record('EXECUTE_TRANSITION', [`legacy transition completed ${result.completed}`], { time: this.now() });
    }
    this.plan = null;
    this.planInputs = null;
    return quality;
  }

  // ── Context and telemetry (plan sections 34, 44) ──────────────────────────

  context(input: { currentDeck: 'A' | 'B'; incomingDeck?: 'A' | 'B'; currentTrack: DJTrackAnalysis | null; incomingTrack: DJTrackAnalysis | null; currentPosition: number; timeRemainingSec: number }): DJPerformanceContext {
    return buildPerformanceContext({
      ...input, setPhase: this.setPhase, targetEnergy: this.targetEnergy, memory: this.memory.snapshot(), candidates: this.candidates,
      transition: this.plan ?? undefined, style: this.style, creativeRisk: this.creativeRisk,
    });
  }

  telemetry(ctx: DJPerformanceContext, currentName: string | null, nextName: string | null): AutoDJTelemetry {
    const log = getDecisionLog();
    const order = (this.setPlan?.order ?? []).map((index) => ({ index, name: this.tracks.find((t) => t.index === index)?.name ?? String(index) }));
    return buildTelemetry({
      context: ctx, currentName, nextName, plan: this.plan, lastTrackDecision: log.last('SELECT_NEXT_TRACK'),
      lastTransitionDecision: log.last('PLAN_TRANSITION'), lastQuality: this.lastQuality, sessionOrder: order, now: this.now(),
    });
  }

  publishTelemetry(ctx: DJPerformanceContext, currentName: string | null, nextName: string | null): void {
    useDJStore.getState().setAutoDJTelemetry(this.telemetry(ctx, currentName, nextName));
  }

  get lastMeasuredQuality(): TransitionQuality | null { return this.lastQuality; }
}

let instance: DJSessionController | null = null;

export function getSessionController(): DJSessionController {
  if (!instance) instance = new DJSessionController();
  return instance;
}

/** Tests and the simulator install their own controller (virtual clock). */
export function setSessionController(c: DJSessionController | null): void {
  instance = c;
}
