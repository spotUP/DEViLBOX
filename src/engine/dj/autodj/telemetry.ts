/**
 * Auto DJ telemetry (plan section 44): the serialisable snapshot the debug
 * view and the MCP read. Built by the session controller from the
 * performance context and the current plan; the single source of the debug
 * view's numbers and explanation lines.
 */
import { formatDecision } from './decisionLog';
import type { DecisionLogEntry, DJPerformanceContext, DJTransitionPlan, TransitionQuality } from './types';

export interface AutoDJTelemetry {
  updatedAt: number;
  current: {
    name: string | null;
    bpm: number;
    key: string | null;
    keyConfidence: number;
    energy: number;
    setPhase: string;
    bar: number;
    phrase: number | null;
    section: string | null;
    positionSec: number;
    remainingSec: number;
  };
  next: {
    name: string | null;
    bpm: number;
    key: string | null;
    energy: number;
    mixInSec: number | null;
    mixOutSec: number | null;
  } | null;
  transition: {
    type: string;
    lengthBars: number;
    tempoPlan: string;
    keyPlan: string;
    bassPlan: string;
    eqPlan: string;
    filterPlan: string;
    startSec: number;
    incomingPositionSec: number;
    effects: string[];
    loop: string | null;
    cueJump: string | null;
    fallback: string;
    confidence: number;
    risk: DJTransitionPlan['risk'];
  } | null;
  confidence: number;
  whyThisTrack: string[];
  whyThisTransition: string[];
  lastQuality: TransitionQuality | null;
  sessionOrder: Array<{ index: number; name: string }>;
  style: string;
  creativeRisk: number;
  transitionCount: number;
  elapsedSec: number;
}

export function buildTelemetry(input: {
  context: DJPerformanceContext;
  currentName: string | null;
  nextName: string | null;
  plan: DJTransitionPlan | null;
  lastTrackDecision: DecisionLogEntry | null;
  lastTransitionDecision: DecisionLogEntry | null;
  lastQuality: TransitionQuality | null;
  sessionOrder: Array<{ index: number; name: string }>;
  now?: number;
}): AutoDJTelemetry {
  const c = input.context;
  const a = c.currentTrack;
  const b = c.incomingTrack;
  const p = input.plan;
  return {
    updatedAt: input.now ?? Date.now(),
    current: {
      name: input.currentName,
      bpm: a?.bpm ?? 0,
      key: a && a.key.mode !== 'unknown' ? `${a.key.name} (${a.key.camelot ?? ''})` : null,
      keyConfidence: a?.keyConfidence ?? 0,
      energy: a?.energy.perceivedIntensity ?? 0,
      setPhase: c.setPhase,
      bar: c.currentBar,
      phrase: c.currentPhrase ? c.currentPhrase.index : null,
      section: c.currentSection ? c.currentSection.kind : null,
      positionSec: c.currentPosition,
      remainingSec: c.timeRemainingSec,
    },
    next: b ? {
      name: input.nextName,
      bpm: b.bpm,
      key: b.key.mode !== 'unknown' ? `${b.key.name} (${b.key.camelot ?? ''})` : null,
      energy: b.energy.perceivedIntensity,
      mixInSec: p ? p.incomingPosition : (b.cuePoints.bestMixIn ?? null),
      mixOutSec: p ? p.startTimeSec : (a?.cuePoints.bestMixOut ?? null),
    } : null,
    transition: p ? {
      type: p.style,
      lengthBars: p.durationBars,
      tempoPlan: `${p.tempoPlan.method} ${p.tempoPlan.percent >= 0 ? '+' : ''}${p.tempoPlan.percent.toFixed(1)} % (${p.tempoPlan.band})${p.tempoPlan.keyLock ? ', key lock' : ''}`,
      keyPlan: `${p.keyPlan.relation}, ${p.keyPlan.confidenceClass}, clash risk ${p.keyPlan.clashRisk.toFixed(2)}`,
      bassPlan: p.bassPlan.schedule.map((s) => `bar ${s.bar}: ${s.owner}`).join(', '),
      eqPlan: p.eqPlan.curves.length ? p.eqPlan.curves.map((cv) => cv.target).join(', ') : 'none',
      filterPlan: p.filterPlan.kind,
      startSec: p.startTimeSec,
      incomingPositionSec: p.incomingPosition,
      effects: p.effects.map((e) => `${e.kind} at beat ${e.beat}`),
      loop: p.loop ? `${p.loop.purpose} (${p.loop.lengthBeats} beats x ${p.loop.repeats})` : null,
      cueJump: p.cueJump ? `${p.cueJump.target} at ${p.cueJump.targetSec.toFixed(1)} s` : null,
      fallback: `${p.fallbackStyle} / ${p.emergencyStyle}`,
      confidence: p.confidence,
      risk: p.risk,
    } : null,
    confidence: c.confidence,
    whyThisTrack: input.lastTrackDecision ? formatDecision(input.lastTrackDecision) : [],
    whyThisTransition: input.lastTransitionDecision ? formatDecision(input.lastTransitionDecision) : [],
    lastQuality: input.lastQuality,
    sessionOrder: input.sessionOrder,
    style: c.style.name,
    creativeRisk: c.creativeRisk,
    transitionCount: c.recentHistory.transitionCount,
    elapsedSec: c.recentHistory.elapsedSec,
  };
}
