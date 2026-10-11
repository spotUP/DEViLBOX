/**
 * Juggle planner (juggling plan sections 21-31, 40-41, 44, 50, 52): decides
 * whether to juggle, which pattern, which material, how long and how hard -
 * from the performance context, the confidences, the set phase, the budget
 * and the history. Deterministic scoring, never random. Also the quality
 * score a finished juggle feeds back into memory.
 *
 * Pure.
 */
import { hash } from '../transitionPlanner';
import { harmonicCompatibility, HARMONIC_CLASH_REJECT } from '../compatibility';
import { findCallAndResponse, upcomingWindows } from './juggleMaterial';
import { MODE_PATTERNS, PATTERN_BUILDERS, PATTERN_INTENSITY, type PatternParams } from './jugglePatterns';
import type {
  DJJuggleAction, DJJugglePattern, DJJugglePatternType, DJJugglePerformanceContext, JuggleCandidate, JuggleMode,
  JuggleQualityScore, MaterialWindow,
} from './juggleTypes';
import type { SetEnergyPhase } from '../types';

export type ConfidencePolicy = 'beat' | 'phrase' | 'none';

/** Section 31.2: the confidences each policy needs. Anything that gates on juggling reads these. */
export const POLICY_MIN = {
  beat: { beat: 0.8, sync: 0.8, phrase: 0.6, material: 0.5 },
  phrase: { beat: 0.6, sync: 0.6, phrase: 0.5 },
} as const;

/** Section 31.2: high -> beat juggling, moderate -> phrase trading only, low -> normal transition. */
export function confidencePolicy(ctx: Pick<DJJugglePerformanceContext, 'beatConfidence' | 'phraseConfidence' | 'deckSyncConfidence' | 'materialConfidence'>): ConfidencePolicy {
  const b = POLICY_MIN.beat, p = POLICY_MIN.phrase;
  if (ctx.beatConfidence >= b.beat && ctx.deckSyncConfidence >= b.sync && ctx.phraseConfidence >= b.phrase && ctx.materialConfidence >= b.material) return 'beat';
  if (ctx.beatConfidence >= p.beat && ctx.deckSyncConfidence >= p.sync && ctx.phraseConfidence >= p.phrase) return 'phrase';
  return 'none';
}

export interface PhaseBudget { cooldownSec: number; maxIntensity: number; maxFraction: number; allowed: boolean }

/** Section 28: the set-level juggling arc. */
export const PHASE_BUDGET: Record<SetEnergyPhase, PhaseBudget> = {
  OPENING: { cooldownSec: 600, maxIntensity: 0, maxFraction: 0, allowed: false },
  BUILDING: { cooldownSec: 240, maxIntensity: 0.45, maxFraction: 0.1, allowed: true },
  CRUISING: { cooldownSec: 180, maxIntensity: 0.6, maxFraction: 0.15, allowed: true },
  PEAKING: { cooldownSec: 120, maxIntensity: 0.85, maxFraction: 0.25, allowed: true },
  PEAK: { cooldownSec: 90, maxIntensity: 1, maxFraction: 0.35, allowed: true },
  RELEASE: { cooldownSec: 240, maxIntensity: 0.4, maxFraction: 0.1, allowed: true },
  RECOVERY: { cooldownSec: 600, maxIntensity: 0, maxFraction: 0, allowed: false },
  CLOSING: { cooldownSec: 300, maxIntensity: 0.5, maxFraction: 0.08, allowed: true },
};

/** Section 44: what each mode changes. */
export const MODE_SHAPE: Record<JuggleMode, { intensityCap: number; cooldownScale: number; fractionScale: number }> = {
  OFF: { intensityCap: 0, cooldownScale: Infinity, fractionScale: 0 },
  SAFE: { intensityCap: 0.4, cooldownScale: 1.5, fractionScale: 0.6 },
  MUSICAL: { intensityCap: 0.65, cooldownScale: 1, fractionScale: 1 },
  PERFORMER: { intensityCap: 0.9, cooldownScale: 0.8, fractionScale: 1.3 },
  AGGRESSIVE: { intensityCap: 1, cooldownScale: 0.5, fractionScale: 1.8 },
  CHAOS: { intensityCap: 1, cooldownScale: 0.3, fractionScale: 2.5 },
};

export function budgetFor(ctx: DJJugglePerformanceContext, mode: JuggleMode): PhaseBudget & { fraction: number; reasons: string[] } {
  const base = PHASE_BUDGET[ctx.setPhase];
  const shape = MODE_SHAPE[mode];
  const cooldownSec = Math.min(3600, base.cooldownSec * shape.cooldownScale);
  const maxFraction = Math.min(0.6, base.maxFraction * shape.fractionScale);
  const fraction = ctx.elapsedSec > 0 ? ctx.juggledSec / ctx.elapsedSec : 0;
  const reasons: string[] = [];
  let allowed = base.allowed && mode !== 'OFF';
  if (!base.allowed) reasons.push(`set phase ${ctx.setPhase}: normal mixing`);
  if (mode === 'OFF') reasons.push('Auto Juggle off');
  if (allowed && ctx.secondsSinceLastJuggle < cooldownSec) { allowed = false; reasons.push(`cooldown ${Math.round(cooldownSec - ctx.secondsSinceLastJuggle)} s left`); }
  if (allowed && ctx.elapsedSec > 120 && fraction > maxFraction) { allowed = false; reasons.push(`juggle budget used (${(fraction * 100).toFixed(0)} % of the set, limit ${(maxFraction * 100).toFixed(0)} %)`); }
  return { cooldownSec, maxIntensity: Math.min(base.maxIntensity, shape.intensityCap), maxFraction, allowed, fraction, reasons };
}

/** Section 23: the intensity ladder; the set decides unless the user overrides. */
export function intensityFor(ctx: DJJugglePerformanceContext, mode: JuggleMode, override: number, seed = 0): number {
  // The user's override is the user's: only the mode's own cap bounds it. The
  // set arc's cap shapes the intensity the set decides, not the one chosen.
  if (override >= 0) return Math.min(MODE_SHAPE[mode].intensityCap, override);
  const cap = Math.min(PHASE_BUDGET[ctx.setPhase].maxIntensity, MODE_SHAPE[mode].intensityCap);
  const fromEnergy = 0.2 + 0.6 * ctx.energy + 0.2 * Math.max(0, ctx.targetEnergy - ctx.energy);
  const tension = ctx.tension * 0.2;
  // Humanization (section 30): small intensity variation, never timing.
  const wobble = (hash(seed, 11) - 0.5) * 0.1;
  return Math.max(0, Math.min(cap, fromEnergy + tension + wobble));
}

export interface Conditions { good: string[]; bad: string[] }

/** Section 25: good and bad conditions. Any bad condition blocks. */
export function conditions(ctx: DJJugglePerformanceContext): Conditions {
  const good: string[] = [];
  const bad: string[] = [];
  if (ctx.beatConfidence >= 0.8) good.push('strong beat confidence'); else if (ctx.beatConfidence < 0.6) bad.push('low beat confidence');
  if (ctx.phraseConfidence >= 0.6) good.push('phrase alignment known');
  // Sync is a property of two running decks: with one stopped there is nothing
  // to measure, and the stopped deck is the reason, not the sync.
  const bothPlaying = ctx.deckA.playing && ctx.deckB.playing;
  if (!bothPlaying) bad.push('both decks must play');
  else if (ctx.deckSyncConfidence >= 0.8) good.push('decks in sync');
  else if (ctx.deckSyncConfidence < 0.6) bad.push('unstable sync');
  if (!ctx.deckA.analysis || !ctx.deckB.analysis) bad.push('both decks need analysis');
  if (ctx.deckA.analysis && ctx.deckB.analysis && !ctx.sameTrackOnBothDecks) {
    // The heard keys at the decks' positions, judged by the one harmonic rule
    // the transition and set planners use (compatibility.ts).
    const h = harmonicCompatibility(ctx.deckA.key ?? null, ctx.deckA.keyConfidence, ctx.deckB.key ?? null, ctx.deckB.keyConfidence);
    if (h.clashRisk > HARMONIC_CLASH_REJECT) bad.push(`key clash (${h.reason})`);
    else if (h.relation !== 'unknown') good.push(`keys ${h.relation}`);
  }
  if (ctx.deckA.vocalsActive && ctx.deckB.vocalsActive) bad.push('dense vocals on both decks');
  if (ctx.deckA.drumsActive && ctx.deckB.drumsActive) good.push('rhythmic material on both decks');
  if (ctx.currentSection && ['breakdown', 'build', 'drop', 'pre-drop'].includes(ctx.currentSection.kind)) good.push(`${ctx.currentSection.kind} section`);
  if (ctx.currentSection && ctx.currentSection.kind === 'vocal-heavy') bad.push('dense section');
  if (ctx.transitionApproachingSec !== null && ctx.transitionApproachingSec < 90 && ctx.transitionApproachingSec > 20) good.push('transition approaching');
  // A juggle transition performs INTO the transition: its start is the goal, not a threat.
  if (ctx.performanceMode !== 'JUGGLE_TRANSITION' && ctx.transitionApproachingSec !== null && ctx.transitionApproachingSec <= 20) bad.push('transition imminent');
  if (ctx.targetEnergy > ctx.energy + 0.1) good.push('set needs energy');
  if (ctx.lastJuggle && ctx.secondsSinceLastJuggle < 45) bad.push('similar recent juggle');
  if (ctx.deckA.analysis?.tracker?.repeatedPhrases.length || ctx.deckB.analysis?.tracker?.repeatedPhrases.length) good.push('repeated phrase (tracker)');
  return { good, bad };
}

export interface PlannerOptions {
  mode: JuggleMode;
  /** -1 = the set decides. */
  intensityOverride: number;
  /** Learned EMA per pattern/context key (section 50), 0..1. */
  learned?: (type: DJJugglePatternType, ctx: DJJugglePerformanceContext) => number | null;
  seed?: number;
  /** Bars of the incoming deck available before the transition start (JUGGLE_TRANSITION). */
  barsAvailable?: number;
}

export interface JuggleDecision {
  pattern: DJJugglePattern | null;
  candidates: JuggleCandidate[];
  reason: string;
  blocked: string[];
  policy: ConfidencePolicy;
  intensity: number;
  /** Absolute master beat the pattern starts on (a phrase boundary). */
  startBeat: number;
  material?: { call?: MaterialWindow; response?: MaterialWindow; fill?: MaterialWindow };
}

const PHRASE_PATTERNS: DJJugglePatternType[] = ['phraseTrade', 'tightPhraseTrade', 'callResponse', 'fillTrade', 'drumBassTrade', 'double', 'loopTighten'];

/** Beats until the next phrase start on the master deck, from the context. */
export function nextPhraseStartBeat(ctx: DJJugglePerformanceContext, minLeadBeats = 4): number {
  const phraseBeats = Math.max(ctx.beatsPerBar, ctx.phraseLengthBars * ctx.beatsPerBar);
  const beatInPhrase = ctx.phrasePosition * phraseBeats;
  let next = ctx.masterBeat - beatInPhrase + phraseBeats;
  while (next - ctx.masterBeat < minLeadBeats) next += phraseBeats;
  return next;
}

export function nextBarStartBeat(ctx: DJJugglePerformanceContext, minLeadBeats = 2): number {
  let next = Math.ceil(ctx.masterBeat / ctx.beatsPerBar) * ctx.beatsPerBar;
  while (next - ctx.masterBeat < minLeadBeats) next += ctx.beatsPerBar;
  return next;
}

export function scorePattern(type: DJJugglePatternType, ctx: DJJugglePerformanceContext, intensity: number, policy: ConfidencePolicy, opts: PlannerOptions, material: JuggleDecision['material']): JuggleCandidate {
  const c: Record<string, number> = {};
  const reasons: string[] = [];
  const blocked: string[] = [];
  const pi = PATTERN_INTENSITY[type];
  const beatLevel = !PHRASE_PATTERNS.includes(type);
  const a = ctx.deckA, b = ctx.deckB;

  if (!MODE_PATTERNS[opts.mode as Exclude<JuggleMode, 'OFF'>]?.includes(type)) blocked.push(`not in mode ${opts.mode}`);
  if (policy === 'phrase' && beatLevel) blocked.push('moderate confidence: phrase trading only');
  if (policy === 'none') blocked.push('low confidence');
  if (pi > Math.min(1, intensity + 0.3)) blocked.push('above the intensity budget');
  if (ctx.lastJuggle && ctx.lastJuggle.patternType === type) blocked.push('immediate repeat of the last pattern');
  if (type === 'double' && !ctx.sameTrackOnBothDecks) blocked.push('needs the same track on both decks');
  if (type !== 'double' && ctx.sameTrackOnBothDecks && !['loopTighten', 'beatTrade', 'transformer'].includes(type)) blocked.push('same track: doubles only');
  if ((type === 'callResponse') && !material?.call) blocked.push('no call/response material');
  if (type === 'fillTrade' && !material?.fill) blocked.push('no fill material');
  if (type === 'drumBassTrade' && !(a.bassActive || b.bassActive)) blocked.push('no bass to trade');
  if (type === 'loopTighten' && !a.drumsActive && !b.drumsActive) blocked.push('no rhythmic material to loop');
  if (ctx.transitionApproachingSec !== null) {
    const barsLeft = (ctx.transitionApproachingSec / (60 / Math.max(60, ctx.deckA.bpm))) / ctx.beatsPerBar;
    const needs = patternBars(type, ctx);
    if (needs + 1 > barsLeft) blocked.push(`needs ${needs} bars, ${Math.floor(barsLeft)} left before the transition`);
  }
  if (opts.barsAvailable !== undefined && patternBars(type, ctx) > opts.barsAvailable) blocked.push(`needs ${patternBars(type, ctx)} bars, ${opts.barsAvailable} available`);

  c.energyFit = 1 - Math.min(1, Math.abs(pi - intensity) * 1.5);
  c.phraseFit = beatLevel ? ctx.beatConfidence : ctx.phraseConfidence;
  const kind = ctx.currentSection?.kind ?? 'groove';
  c.sectionFit = (['drop', 'groove', 'chorus', 'instrumental'].includes(kind) && ['beatTrade', 'doubleBeat', 'barTrade', 'transformer', 'dropAndReturn', 'escalatingJuggle', 'double'].includes(type)) ? 1
    : (['breakdown', 'bridge', 'verse'].includes(kind) && ['callResponse', 'phraseTrade', 'tightPhraseTrade', 'loopTighten'].includes(type)) ? 1
    : (['build', 'pre-drop'].includes(kind) && ['loopTighten', 'transformer', 'fillTrade'].includes(type)) ? 1
    : (['intro', 'outro', 'silence'].includes(kind)) ? 0.2 : 0.6;
  c.rhythmicFit = beatLevel ? (a.drumsActive && b.drumsActive ? 1 : 0.3) : (a.drumsActive || b.drumsActive ? 0.8 : 0.4);
  const bothBass = a.bassActive && b.bassActive;
  c.bassFit = type === 'drumBassTrade' ? (bothBass || a.bassActive !== b.bassActive ? 1 : 0.5) : bothBass ? (hasLayer(type) ? 0.4 : 0.7) : 1;
  const bothVocal = a.vocalsActive && b.vocalsActive;
  c.vocalFit = bothVocal ? (type === 'callResponse' && material?.call ? 0.8 : hasLayer(type) ? 0.2 : 0.5) : a.vocalsActive || b.vocalsActive ? (beatLevel ? 0.6 : 0.9) : 1;
  c.materialFit = type === 'callResponse' || type === 'fillTrade' ? Math.min(1, (material?.call?.confidence ?? material?.fill?.confidence ?? 0) + 0.3) : ctx.materialConfidence;
  c.confidence = beatLevel ? Math.min(ctx.beatConfidence, ctx.deckSyncConfidence) : Math.min(ctx.phraseConfidence, ctx.deckSyncConfidence);
  const recentSame = ctx.recentPatterns.filter((h) => h.patternType === type).length;
  c.novelty = ctx.recentPatterns.some((h) => h.patternType === type) ? 0.3 : 1;
  c.repetition = Math.max(0, 1 - recentSame * 0.35);
  c.risk = 1 - Math.max(0, pi - MODE_SHAPE[opts.mode].intensityCap);
  c.setPosition = Math.min(1, PHASE_BUDGET[ctx.setPhase].maxIntensity + 0.2 - Math.max(0, pi - PHASE_BUDGET[ctx.setPhase].maxIntensity));
  c.budget = 1;
  c.transitionOpportunity = ctx.transitionApproachingSec !== null && ctx.transitionApproachingSec < 90 ? (patternBars(type, ctx) <= 8 ? 1 : 0.5) : 0.7;
  const learned = opts.learned?.(type, ctx);
  c.learned = learned === null || learned === undefined ? 0.5 : learned;
  if (ctx.deckA.analysis?.tracker && (type === 'callResponse' || type === 'fillTrade') && material?.call?.source === 'tracker') { c.tracker = 1; reasons.push('tracker structure offers the material'); } else c.tracker = 0.5;

  const w: Record<string, number> = { energyFit: 1.2, phraseFit: 1, sectionFit: 0.8, rhythmicFit: 0.8, bassFit: 1, vocalFit: 1, materialFit: 0.8, confidence: 1, novelty: 0.8, repetition: 0.6, risk: 0.6, setPosition: 0.6, budget: 0.2, transitionOpportunity: 0.4, learned: 0.6, tracker: 0.3 };
  let score = 0, total = 0;
  for (const k of Object.keys(w)) { score += w[k] * c[k]; total += w[k]; }
  score /= total;
  // Deterministic tie-break from the seed (section 30: pattern variation, not timing).
  score += hash(opts.seed ?? 0, type.length * 7 + Object.keys(PATTERN_INTENSITY).indexOf(type)) * 0.02;
  for (const k of ['energyFit', 'sectionFit', 'bassFit', 'vocalFit'] as const) if (c[k] >= 0.9) reasons.push(`${k} ${c[k].toFixed(2)}`);
  return { type, score: blocked.length ? 0 : score, components: c, reasons, blocked };
}

function hasLayer(type: DJJugglePatternType): boolean { return ['beatTrade', 'drumBassTrade', 'fillTrade', 'double', 'dropAndReturn', 'escalatingJuggle'].includes(type); }

export function patternBars(type: DJJugglePatternType, ctx: DJJugglePerformanceContext): number {
  const phrase = Math.max(4, Math.min(8, ctx.phraseLengthBars));
  switch (type) {
    case 'phraseTrade': return phrase * 2;
    case 'escalatingJuggle': return phrase * 2 + phrase + 4 + 2 + 2 + 2;
    case 'tightPhraseTrade': return 8;
    case 'callResponse': return 8;
    case 'fillTrade': return 7;
    case 'drumBassTrade': return 6;
    case 'barTrade': return 4;
    case 'loopTighten': return 8;
    case 'double': return 8;
    case 'dropAndReturn': return 3;
    case 'beatTrade': return 3;
    case 'doubleBeat': return 2;
    case 'transformer': return 2;
  }
}

/** Section 42.2: an abort resolves with a release, never a dead stop. */
export function releasePattern(primary: 'A' | 'B', beatsPerBar: number): DJJugglePattern {
  const other = primary === 'A' ? 'B' : 'A';
  const actions: DJJuggleAction[] = [
    { type: 'ReleaseDeck', deck: primary, executeAtBeat: 0, quantization: 'beat', phase: 'RELEASE', reason: 'abort: release to the strongest deck' },
    { type: 'ResetDeck', deck: other, executeAtBeat: 0.01, phase: 'RELEASE', reason: 'abort: reset the other deck' },
  ];
  return { id: 'release', type: 'phraseTrade', durationBars: 1, intensity: 0, actions, energyProfile: 'RELEASE', confidence: 1, reason: 'release', phases: [{ phase: 'RELEASE', startBeat: 0, endBeat: beatsPerBar }], sequence: primary, roles: [{ beat: 0, A: primary === 'A' ? 'PRIMARY' : 'SILENT', B: primary === 'B' ? 'PRIMARY' : 'SILENT' }] };
}

/** Section 40/41: decide the next juggle (or none) for the context. */
export function planJuggle(ctx: DJJugglePerformanceContext, opts: PlannerOptions): JuggleDecision {
  const policy = confidencePolicy(ctx);
  const seed = opts.seed ?? 0;
  const intensity = intensityFor(ctx, opts.mode, opts.intensityOverride, seed);
  const budget = budgetFor(ctx, opts.mode);
  const cond = conditions(ctx);
  const blocked = [...budget.reasons, ...cond.bad];
  if (policy === 'none') blocked.push('low confidence: normal transition');
  const none = (reason: string): JuggleDecision => ({ pattern: null, candidates: [], reason, blocked, policy, intensity, startBeat: nextPhraseStartBeat(ctx) });
  if (!budget.allowed || cond.bad.length || policy === 'none') return none(blocked.join('; '));

  // Material (sections 11-13, 36-38): the voice deck calls, the other answers.
  const primary = ctx.masterDeck;
  const voice = primary === 'A' ? ctx.deckA : ctx.deckB;
  const other = primary === 'A' ? ctx.deckB : ctx.deckA;
  let material: JuggleDecision['material'];
  if (voice.analysis && other.analysis && !ctx.sameTrackOnBothDecks) {
    const bars = intensity > 0.6 ? 1 : 2;
    const cr = findCallAndResponse(voice.analysis, voice.deck, voice.position, other.analysis, other.deck, other.position, bars);
    const fills = upcomingWindows(other.analysis, other.deck, other.position, 1, 8).filter((w) => w.classes.includes('DRUM_FILL'));
    material = { call: cr?.call, response: cr?.response, fill: fills[0] };
  }

  const candidates = (Object.keys(PATTERN_INTENSITY) as DJJugglePatternType[])
    .map((t) => scorePattern(t, ctx, intensity, policy, opts, material))
    .sort((x, y) => y.score - x.score);
  const best = candidates.find((cnd) => cnd.blocked.length === 0 && cnd.score > 0.45);
  if (!best) return none(`no pattern fits: ${candidates.slice(0, 3).map((cnd) => `${cnd.type} (${cnd.blocked[0] ?? `score ${cnd.score.toFixed(2)}`})`).join(', ')}`);

  const beatsPerBar = ctx.beatsPerBar;
  const phraseBars = Math.max(2, Math.min(8, ctx.phraseLengthBars));
  const params: PatternParams = { primary, beatsPerBar, intensity, phraseBars, material, confidence: best.components.confidence, seed, double: ctx.sameTrackOnBothDecks ? { offsetBeats: doubleOffset(ctx, seed), primaryPosition: voice.position } : undefined };
  const pattern = PATTERN_BUILDERS[best.type](params);
  // Phrase lock (section 9.7, 21.1): long patterns start on a phrase, short ones on a bar, every one >= 1 bar ahead.
  const startBeat = PHRASE_PATTERNS.includes(best.type) || pattern.durationBars >= 4 ? nextPhraseStartBeat(ctx, beatsPerBar) : nextBarStartBeat(ctx, beatsPerBar);
  const reason = `${best.type} (${pattern.sequence}) at ${intensity.toFixed(2)} intensity: ${cond.good.slice(0, 3).join(', ')}${best.reasons.length ? '; ' + best.reasons.slice(0, 2).join(', ') : ''}${pattern.reason ? '; ' + pattern.reason : ''}`;
  return { pattern, candidates, reason, blocked, policy, intensity, startBeat, material };
}

/** Section 16.2/16.3: offsets of 1, 2 beats, 1, 2 or 4 bars; none arbitrary; only bars when the beat is less sure. */
export function doubleOffset(ctx: DJJugglePerformanceContext, seed: number): number {
  const bpb = ctx.beatsPerBar;
  const choices = ctx.beatConfidence >= 0.9 ? [1, 2, bpb, 2 * bpb, 4 * bpb] : [bpb, 2 * bpb, 4 * bpb];
  return choices[Math.floor(hash(seed, 23) * choices.length) % choices.length];
}

export interface JuggleTraceLike { scheduledBeat: number; firedBeat: number | null; status: 'executed' | 'blocked' | 'skipped'; action: DJJuggleAction }

/** Section 52: the quality score of a finished juggle; feeds memory. */
export function scoreJuggleQuality(pattern: DJJugglePattern, trace: JuggleTraceLike[], ctx: DJJugglePerformanceContext, extra: { fallbacks: number; aborted: boolean }): JuggleQualityScore {
  const executed = trace.filter((t) => t.status === 'executed');
  const late = executed.map((t) => Math.abs((t.firedBeat ?? t.scheduledBeat) - t.scheduledBeat));
  const meanLate = late.length ? late.reduce((a, b) => a + b, 0) / late.length : 0;
  const timing = Math.max(0, 1 - meanLate / 0.25);
  const compatibility = Math.min(1, 0.5 * ctx.deckSyncConfidence + 0.5 * (1 - Math.abs(ctx.deckA.bpm - ctx.deckB.bpm) / Math.max(1, ctx.deckA.bpm)));
  const energyFit = 1 - Math.min(1, Math.abs(pattern.intensity - ctx.intensity));
  const material = pattern.confidence;
  const layered = pattern.roles.filter((r) => r.A === 'LAYER' && r.B === 'LAYER').length;
  const bassClarity = ctx.deckA.bassActive && ctx.deckB.bassActive && layered && pattern.type !== 'drumBassTrade' ? 0.5 : 1;
  const vocalClarity = ctx.deckA.vocalsActive && ctx.deckB.vocalsActive && layered ? 0.4 : 1;
  const coherence = trace.length ? executed.length / trace.length : 0;
  const novelty = ctx.recentPatterns.some((h) => h.patternType === pattern.type) ? 0.5 : 1;
  const impact = Math.min(1, pattern.intensity * 0.6 + ctx.energy * 0.4);
  const blocked = trace.filter((t) => t.status === 'blocked').length;
  const safety = Math.max(0, 1 - (blocked / Math.max(1, trace.length)) - extra.fallbacks * 0.25 - (extra.aborted ? 0.3 : 0));
  const overall = 0.2 * timing + 0.1 * compatibility + 0.1 * energyFit + 0.1 * material + 0.1 * bassClarity + 0.1 * vocalClarity + 0.1 * coherence + 0.05 * novelty + 0.05 * impact + 0.1 * safety;
  return { timing, compatibility, energyFit, material, bassClarity, vocalClarity, coherence, novelty, impact, safety, overall };
}
