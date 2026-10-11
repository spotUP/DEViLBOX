/**
 * DJTransitionPlanner (plan sections 15-24, 36, 37, 46-54, 59): one complete
 * DJTransitionPlan before anything executes. Mix-out and mix-in points,
 * phrase alignment, a transition style chosen from context (never a dice
 * roll), an adaptive length, tempo and key plans, continuous crossfade / EQ /
 * filter / bass-handover curves, FX as punctuation, gain staging, risk,
 * confidence, a fallback chain, loops and cue jumps where justified, and a
 * cut only with structural justification.
 *
 * Pure. The executor runs what this returns.
 */
import { bassCompatibility, bassKeysCompatible, drumCompatibility, harmonicCompatibility, vocalCompatibility, HARMONIC_CLASH_REJECT } from './compatibility';
import { planGain, sharedBarsOf } from './gainStaging';
import { solveKey, solveTempo, type TempoKeyLimits } from './tempoKeySolver';
import { keyAt, summarizeTrack } from './trackAnalysis';
import { timelineAt, barIndexAt, trackBeatConfidence } from './beatGrid';
import type {
  AutomationCurve, BassHandoverPlan, BassOwner, CutCandidate, CueJumpPlan, DJEffectEvent, DJPhrase,
  DJSection, DJStyleProfile, DJTrackAnalysis, DJTransitionPlan, EQPlan, HumanizePlan, LoopPlan,
  SessionMemorySnapshot, TransitionRisk, TransitionStyle,
} from './types';
import { TRANSITION_STYLES } from './types';
import { crossfadeFor, curve, filterFor, stepCurve } from './transitionCurves';
import { POLICY_MIN, PHASE_BUDGET, confidencePolicy, meterMismatch, type ConfidencePolicy } from './juggle/jugglePlanner';
import { LADDER_SHAPES, minLadderRung } from './juggle/jugglePatterns';
import type { DJJuggleHistory, DJJugglePerformanceContext, JuggleMode } from './juggle/juggleTypes';

export interface TransitionPlanInput {
  outgoing: DJTrackAnalysis;
  incoming: DJTrackAnalysis;
  outgoingDeck: 'A' | 'B';
  incomingDeck: 'A' | 'B';
  /** Outgoing deck position now, seconds. */
  outgoingPosition: number;
  style: DJStyleProfile;
  creativeRisk: number;
  memory: SessionMemorySnapshot;
  /** The user's bar setting: the preferred length when the music does not decide. */
  userBars: number;
  withFilter: boolean;
  smartCuts: boolean;
  setPhase: string;
  targetEnergy: number;
  /** Seconds the executor needs between planning and the first keyframe. */
  leadSec?: number;
  limits?: TempoKeyLimits;
  bridgeAvailable?: boolean;
  /** Deterministic humanization seed (the transition count), never Math.random. */
  seed?: number;
  /** The Auto Juggle mode: SAFE and up may plan a juggle transition (default OFF). */
  juggleMode?: JuggleMode;
  /**
   * The juggle controller's budget now (owner plan sections 24, 28): whether
   * the set arc, the cooldown and the juggled fraction allow a juggle, why
   * not, and the recent juggles (the ladder varies its shape against them,
   * section 29). Without it only the set phase gates.
   */
  juggleState?: { allowed: boolean; reasons: string[]; recent: DJJuggleHistory[] };
}

export const LENGTH_CANDIDATES = [2, 4, 8, 16, 32] as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

function sectionAt(a: DJTrackAnalysis, t: number): DJSection | undefined {
  return a.sections.find((s) => s.start <= t && t < s.end) ?? a.sections[a.sections.length - 1];
}

function phraseAt(a: DJTrackAnalysis, t: number): DJPhrase | undefined {
  return a.phrases.find((p) => p.start <= t && t < p.end);
}

function beatIndexAt(a: DJTrackAnalysis, t: number): number {
  const beats = a.beatGrid.beats;
  if (beats.length === 0) return Math.floor(t / (60 / Math.max(60, a.bpm)));
  let lo = 0, hi = beats.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (beats[mid].time <= t) lo = mid; else hi = mid - 1; }
  return lo;
}

function mean(values: number[]): number { return values.length ? values.reduce((x, y) => x + y, 0) / values.length : 0; }

function activity(tl: { values: number[]; hopSec: number }, from: number, to: number): number {
  const v: number[] = [];
  for (let t = from; t < to; t += tl.hopSec) v.push(timelineAt(tl.values, tl.hopSec, t));
  return mean(v);
}

/** Deterministic 0..1 from a seed (unsigned at every step: a signed XOR once made fxOffsetMs negative). */
/** Deterministic unit hash in [0, 1): the one humanization source for every planner. */
export function hash(seed: number, salt: number): number {
  let x = (seed * 2654435761 + salt * 40503) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 0x5bd1e995) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  return (x % 10000) / 10000;
}

// ── Mix points (plan sections 7, 46, 47) ────────────────────────────────────

export interface MixOutChoice { time: number; bar: number; reasons: string[]; score: number; phrase: DJPhrase | null }

/**
 * Where the outgoing track hands over: the best phrase start at or after the
 * position (plus the lead) that leaves room for the transition, scored for
 * phrase boundary, vocals absent, drums present, before the outro end, and
 * tracker events (break/drop/pattern change) when the material is a module.
 */
export function chooseMixOut(a: DJTrackAnalysis, position: number, lengthSec: number, leadSec: number, strictness: number): MixOutChoice {
  const earliest = position + leadSec;
  const latest = (a.cuePoints.finalBeat ?? a.durationSec) - lengthSec;
  const candidates: MixOutChoice[] = [];
  const consider = (time: number, bar: number, phrase: DJPhrase | null, base: number, why: string) => {
    if (time < earliest || time > latest + 1e-6) return;
    const reasons = [why];
    let score = base;
    const vocalsAhead = activity(a.vocalActivity, time, time + lengthSec);
    if (a.vocalActivity.confidence > 0 && vocalsAhead < 0.25) { score += 0.25; reasons.push('no outgoing vocals in the window'); }
    else if (vocalsAhead >= 0.25) { score -= 0.3 * vocalsAhead; reasons.push('outgoing vocals in the window'); }
    const drums = activity(a.drumActivity, time, Math.min(time + lengthSec, a.durationSec));
    if (drums > 0.3) { score += 0.15; reasons.push('drums keep the beat'); }
    if (a.cuePoints.bestMixOut !== undefined && Math.abs(time - a.cuePoints.bestMixOut) < 0.05) { score += 0.2; reasons.push('the track\'s best mix-out point'); }
    const sec = sectionAt(a, time);
    if (sec?.kind === 'outro') { score += 0.1; reasons.push('outro'); }
    if (sec?.kind === 'drop' || sec?.kind === 'chorus') { score -= 0.15; reasons.push(`mixing out of a ${sec.kind}`); }
    // Earlier is better when scores tie: a DJ does not run the track to the last bar.
    score -= (time - earliest) / Math.max(1, a.durationSec) * 0.1;
    candidates.push({ time, bar, reasons, score, phrase });
  };
  for (const p of a.phrases) consider(p.start, p.startBar, p, 0.4 * strictness + 0.2, 'phrase boundary');
  if (a.phrases.length === 0 || strictness < 0.7) {
    for (const bar of a.downbeats.bars) if (bar.full) consider(bar.start, bar.index, null, 0.2, 'bar boundary');
  }
  if (a.tracker) {
    for (const e of a.tracker.events) {
      if (e.kind === 'BREAK' || e.kind === 'DROP' || e.kind === 'DENSITY_DECREASE') consider(e.time, barIndexAt(a.downbeats, e.time), null, 0.45, `tracker ${e.kind.toLowerCase()}`);
    }
  }
  if (candidates.length === 0) {
    // Nothing fits in the room left: the first bar boundary from here (still on
    // the grid, the length is shortened by the caller), else now.
    const bar = a.downbeats.bars.find((b) => b.start >= earliest - 1e-6);
    const t = bar ? bar.start : earliest;
    return { time: t, bar: bar ? bar.index : barIndexAt(a.downbeats, t), reasons: ['no phrase boundary fits the room left: next bar boundary'], score: 0, phrase: null };
  }
  candidates.sort((x, y) => y.score - x.score);
  return candidates[0];
}

export interface MixInChoice { time: number; reasons: string[] }

/** Where the incoming track starts, by strategy (plan section 7). */
export function chooseMixIn(a: DJTrackAnalysis, style: TransitionStyle, lengthSec: number): MixInChoice {
  const c = a.cuePoints;
  const safe = (t: number | undefined, fallback: number) => (t !== undefined && t >= 0 && t < a.durationSec - lengthSec ? t : fallback);
  const usable = safe(c.bestMixIn, safe(c.firstDrums, a.landmarks.firstUsableMixPoint));
  switch (style) {
    case 'drumIntroMix': return { time: safe(c.firstDrums, usable), reasons: ['start at the incoming drums'] };
    case 'dropMix': {
      const drop = c.firstDrop ?? c.firstHook;
      if (drop !== undefined && drop - lengthSec >= 0) return { time: drop - lengthSec, reasons: ['start so the incoming drop lands as the outgoing track leaves'] };
      return { time: usable, reasons: ['no drop known: best mix-in'] };
    }
    case 'hardCut': return { time: safe(c.firstHook ?? c.firstDrop ?? c.firstFullGroove, usable), reasons: ['cut straight into the hook'] };
    case 'breakdownMix': return { time: safe(c.firstFullGroove ?? c.firstDrums, usable), reasons: ['incoming groove under the outgoing breakdown'] };
    case 'juggleTransition': {
      // `lengthSec` is the ladder here and the time returned is where the release lands: the incoming
      // starts that long before it. The drop when the incoming has the ladder's length before it, else
      // the best mix-in; a mix-in at the very start (most intros) is traded from, the release lands after.
      const drop = c.firstDrop;
      if (drop !== undefined && drop - lengthSec >= 0 && drop < a.durationSec) return { time: drop, reasons: ['the ladder lands on the incoming drop'] };
      if (usable - lengthSec >= 0) return { time: usable, reasons: ['no drop in reach: the ladder lands on the best mix-in'] };
      return { time: usable + lengthSec, reasons: ['the ladder trades from the incoming mix-in'] };
    }
    case 'vocalSwap': {
      const v = c.firstVocal;
      if (v !== undefined && v - lengthSec >= 0) return { time: Math.max(usable, v - lengthSec), reasons: ['incoming vocal arrives after the outgoing vocal has left'] };
      return { time: usable, reasons: ['best mix-in'] };
    }
    default: return { time: usable, reasons: [usable === c.bestMixIn ? 'the track\'s best mix-in point' : 'first usable mixing point'] };
  }
}

// ── Juggle-transition ladder (juggling plan sections 9, 26, 29, 31, 41, 44) ──

/**
 * The pair's confidences in the juggle layer's terms (owner plan section 31):
 * beat = both tracks' beat confidence (trackBeatConfidence: grid and bars); sync = how well two beatmatched
 * decks on these grids hold; phrase = both tracks' phrase confidence;
 * material = both analyses. The juggle layer's confidencePolicy reads them.
 */
export function pairConfidence(outgoing: DJTrackAnalysis, incoming: DJTrackAnalysis): Pick<DJJugglePerformanceContext, 'beatConfidence' | 'phraseConfidence' | 'deckSyncConfidence' | 'materialConfidence'> {
  const o = outgoing.analysisConfidence, i = incoming.analysisConfidence;
  const phraseOf = (a: DJTrackAnalysis) => (a.phrases.length ? mean(a.phrases.map((p) => p.confidence)) : a.analysisConfidence.downbeat * 0.8);
  return {
    beatConfidence: Math.min(trackBeatConfidence(outgoing), trackBeatConfidence(incoming)),
    deckSyncConfidence: Math.min(o.beatGrid, i.beatGrid),
    phraseConfidence: Math.min(phraseOf(outgoing), phraseOf(incoming)),
    materialConfidence: Math.min(o.overall, i.overall),
  };
}

/**
 * The ladders to try, in order (owner plan sections 21, 29, 44): every shape
 * the mode and confidence allow (`minRung`), the tightest first, the ones the
 * last three ladders did not use before the ones they did; ties broken by the
 * seed (pattern variation, never timing).
 */
export function ladderCandidates(minRung: number, recent: readonly DJJuggleHistory[] = [], seed = 0): number[][] {
  const used = new Set(recent.filter((h) => h.patternType === 'transitionLadder' && h.ladderBars).slice(-3).map((h) => h.ladderBars!.join('-')));
  return LADDER_SHAPES
    .map((shape, idx) => ({ bars: [...shape.bars], minRung: shape.minRung, used: used.has(shape.bars.join('-')), tie: hash(seed, 31 + idx) }))
    .filter((x) => x.minRung >= minRung)
    .sort((a, b) => Number(a.used) - Number(b.used) || a.minRung - b.minRung || a.tie - b.tie)
    .map((x) => x.bars);
}

/** Is `t` a bar start that begins a 4-bar group of the track's phrase grid (owner plan section 9: trades respect phrase boundaries)? */
export function onPhraseGroup(a: DJTrackAnalysis, t: number): boolean {
  const bars = a.downbeats.bars;
  if (bars.length === 0) return false;
  const tol = 0.1 * (60 / (a.bpm > 0 ? a.bpm : 125));
  let idx = barIndexAt(a.downbeats, t + tol);
  if (Math.abs(bars[idx].start - t) > tol) return false;
  idx = bars[idx].index;
  const phrase = a.phrases.find((p) => p.startBar <= idx && idx < p.startBar + p.lengthBars);
  return (idx - (phrase?.startBar ?? 0)) % 4 === 0;
}

/** Is `t` a bar start on which one of the track's phrases starts (no phrases: the bar grid counted in its phrase length)? */
export function onPhraseStart(a: DJTrackAnalysis, t: number): boolean {
  const bars = a.downbeats.bars;
  if (bars.length === 0) return false;
  const tol = 0.1 * (60 / (a.bpm > 0 ? a.bpm : 125));
  const at = bars[barIndexAt(a.downbeats, t + tol)];
  if (Math.abs(at.start - t) > tol) return false;
  if (a.phrases.length > 0) return a.phrases.some((p) => p.startBar === at.index);
  return at.index % Math.max(1, a.phraseLengthBars) === 0;
}

/**
 * Does a ladder of `tradeBars` from `start` run with the track's phrases (owner plan sections 9, 41):
 * it starts on a phrase start and either nests inside that phrase (the phrase is a whole number of
 * ladders) or spans whole phrases, its release landing on a phrase start - no rung straddles a phrase.
 */
function ladderOnPhrases(a: DJTrackAnalysis, start: number, release: number, tradeBars: number): boolean {
  if (!onPhraseStart(a, start)) return false;
  const phrase = phraseAt(a, start + 1e-3);
  const phraseBars = Math.max(1, phrase?.lengthBars ?? a.phraseLengthBars);
  if (tradeBars < phraseBars) return phraseBars % tradeBars === 0;
  return tradeBars % phraseBars === 0 && onPhraseStart(a, release);
}

/** Is a cut at `t` inside a sung phrase of the track (vocals on both sides of it)? Owner plan section 9: never switch halfway through a vocal phrase. */
function midVocalPhrase(a: DJTrackAnalysis, t: number, beatSec: number): boolean {
  if (!(a.vocalActivity.confidence > 0)) return false;
  return activity(a.vocalActivity, Math.max(0, t - beatSec), t) >= 0.25 && activity(a.vocalActivity, t, t + beatSec) >= 0.25;
}

/** The bar offsets where the ladder switches decks (each rung's answer and next call, and the release). */
export function ladderCutBars(ladderBars: readonly number[]): number[] {
  const cuts: number[] = [];
  let bar = 0;
  for (const r of ladderBars) { if (bar > 0) cuts.push(bar); bar += r; cuts.push(bar); bar += r; }
  cuts.push(bar);
  return cuts;
}

export interface LadderChoice { ladderBars: number[]; tradeBeats: number; mixOut: MixOutChoice; mixIn: MixInChoice; incomingPosition: number }

/**
 * The first ladder from `ladders` that fits both tracks musically:
 * - the outgoing starts it on one of its phrase boundaries, with the trades
 *   plus 2 bars left, as close as possible to where an ordinary transition
 *   would hand over (`handOverSec`) - never a bare bar boundary (section 9);
 * - the incoming starts on one of its own phrase starts and the ladder nests
 *   in that phrase or spans whole phrases (the release on a phrase start, its
 *   drop when the drop sits there), so both tracks' phrases run together
 *   through every trade (sections 9, 41);
 * - no cut falls inside a sung phrase of either deck (section 9).
 * `tradeBeats = 2 * sum(ladderBars) * beatsPerBar`. Null when none fits (reasons in `why`).
 */
export function chooseLadder(
  outgoing: DJTrackAnalysis, incoming: DJTrackAnalysis, ladders: readonly number[][], outgoingPosition: number, leadSec: number,
  handOverSec: number, why: string[] = [],
): LadderChoice | null {
  const beatsPerBar = outgoing.meter.beatsPerBar || 4;
  const bpm = outgoing.bpm > 0 ? outgoing.bpm : 125;
  const beatSec = 60 / bpm;
  const barSec = beatSec * beatsPerBar;
  // The incoming plays beatmatched: a master beat is one incoming beat of its own track time.
  const inBeatSec = 60 / (incoming.bpm > 0 ? incoming.bpm : bpm);
  const finalBeat = outgoing.cuePoints.finalBeat ?? outgoing.durationSec;
  const c = incoming.cuePoints;
  const fits = (t: number | undefined, len: number) => t !== undefined && t >= 0 && t < incoming.durationSec - len;
  const usable = fits(c.bestMixIn, 0) ? c.bestMixIn! : fits(c.firstDrums, 0) ? c.firstDrums! : incoming.landmarks.firstUsableMixPoint;
  for (const ladderBars of ladders) {
    const name = ladderBars.join('-');
    const tradeBars = 2 * ladderBars.reduce((x, y) => x + y, 0);
    const tradeBeats = tradeBars * beatsPerBar;
    const phraseBars = Math.max(1, outgoing.phraseLengthBars);
    if (tradeBars % phraseBars !== 0 && phraseBars % tradeBars !== 0) { why.push(`${name} ladder: ${tradeBars} bars is not a whole phrase of ${phraseBars}`); continue; }
    const roomSec = (tradeBars + 2) * barSec;
    const earliest = outgoingPosition + leadSec;
    const latest = finalBeat - roomSec;
    if (latest < earliest - 1e-6) { why.push(`${name} ladder: the outgoing has no ${tradeBars + 2} bars left`); continue; }
    // The incoming: where the release lands and the ladder starts, both on its phrase grid.
    const tradeSec = tradeBeats * inBeatSec;
    const lands: MixInChoice[] = [];
    if (c.firstDrop !== undefined) lands.push({ time: c.firstDrop, reasons: ['the ladder lands on the incoming drop'] });
    lands.push({ time: usable, reasons: ['no drop in reach: the ladder lands on the best mix-in'] });
    lands.push({ time: usable + tradeSec, reasons: ['the ladder trades from the incoming mix-in'] });
    for (const p of incoming.phrases) if (p.start > usable) lands.push({ time: p.start, reasons: ['the ladder lands on an incoming phrase'] });
    for (const p of incoming.phrases) if (p.start >= usable) lands.push({ time: p.start + tradeSec, reasons: ['the ladder trades from an incoming phrase'] });
    const mixIn = lands.find((l) => l.time - tradeSec >= -1e-6 && l.time + barSec <= incoming.durationSec
      && ladderOnPhrases(incoming, Math.max(0, l.time - tradeSec), l.time, tradeBars));
    if (!mixIn) { why.push(`${name} ladder: the incoming has no phrase start that ${tradeBars} bars run with`); continue; }
    const incomingPosition = Math.max(0, mixIn.time - tradeSec);
    // The outgoing: its phrase starts in the room, nearest the hand-over aim first.
    const aim = Math.max(earliest, Math.min(latest, handOverSec - (tradeBars + 1) * barSec));
    const starts = outgoing.phrases.filter((p) => p.start >= earliest - 1e-6 && p.start <= latest + 1e-6)
      .sort((x, y) => Math.abs(x.start - aim) - Math.abs(y.start - aim));
    if (starts.length === 0) { why.push(`${name} ladder: no outgoing phrase boundary leaves ${tradeBars + 2} bars`); continue; }
    const cuts = ladderCutBars(ladderBars);
    const sung = (p: DJPhrase) => cuts.some((bar) => midVocalPhrase(outgoing, p.start + bar * barSec, beatSec) || midVocalPhrase(incoming, incomingPosition + bar * beatsPerBar * inBeatSec, inBeatSec));
    const phrase = starts.find((p) => !sung(p));
    if (!phrase) { why.push(`${name} ladder: every cut point falls inside a sung phrase`); continue; }
    const mixOut: MixOutChoice = { time: phrase.start, bar: phrase.startBar, reasons: ['phrase boundary', 'no cut inside a sung phrase'], score: 1, phrase };
    return { ladderBars, tradeBeats, mixOut, mixIn, incomingPosition };
  }
  return null;
}

// ── Length (plan section 16) ────────────────────────────────────────────────

export interface LengthChoice { bars: number; reasons: string[]; scores: Record<number, number> }

export function chooseLength(ctx: {
  outgoing: DJTrackAnalysis; incoming: DJTrackAnalysis; style: DJStyleProfile; userBars: number; styleName: TransitionStyle;
  energyDelta: number; vocalRisk: number; clashRisk: number; drumScore: number; setPhase: string; risk: number;
  outgoingRoomBars: number; incomingIntroBars: number; memory: SessionMemorySnapshot;
}): LengthChoice {
  const scores: Record<number, number> = {};
  const reasons: string[] = [];
  const phrase = ctx.outgoing.phraseLengthBars;
  for (const bars of LENGTH_CANDIDATES) {
    let s = 0;
    if (bars % phrase === 0 || phrase % bars === 0) s += 0.3;
    if (bars === phrase) s += 0.2;
    // Preference: the style's length and the user's setting.
    s -= Math.abs(Math.log2(bars) - Math.log2(ctx.style.transitionLengthBars)) * 0.2;
    s -= Math.abs(Math.log2(bars) - Math.log2(ctx.userBars)) * 0.15;
    // Room: no longer than the outgoing can give or the incoming intro offers.
    if (bars > ctx.outgoingRoomBars) s -= 1.5;
    if (ctx.incomingIntroBars > 0 && bars > ctx.incomingIntroBars * 1.5) s -= 0.3;
    // Music: big energy change, vocals, clashes, weak drums -> shorter; compatible drums and keys -> longer.
    if (Math.abs(ctx.energyDelta) > 0.25) s -= Math.log2(bars) * 0.1;
    s -= ctx.vocalRisk * Math.log2(bars) * 0.12;
    s -= ctx.clashRisk * Math.log2(bars) * 0.15;
    s += (ctx.drumScore - 0.5) * Math.log2(bars) * 0.1;
    if (ctx.setPhase === 'PEAK' || ctx.setPhase === 'PEAKING') s -= Math.max(0, Math.log2(bars) - 3) * 0.1;
    if (ctx.setPhase === 'OPENING' || ctx.setPhase === 'CRUISING') s += Math.max(0, Math.log2(bars) - 3) * 0.05;
    s -= ctx.risk * Math.log2(bars) * 0.05;
    // Style-intrinsic lengths.
    if (ctx.styleName === 'hardCut' && bars > 2) s -= 2;
    if ((ctx.styleName === 'echoOut' || ctx.styleName === 'delayThrow') && bars > 8) s -= 0.6;
    if ((ctx.styleName === 'longBlend') && bars < 8) s -= 0.6;
    if ((ctx.styleName === 'shortBlend') && bars > 4) s -= 0.6;
    // Repetition: the same length three times in a row.
    const recent = ctx.memory.recentTransitionLengths.slice(-2);
    if (recent.length === 2 && recent.every((l) => l === bars)) s -= 0.3 * (1 - ctx.style.repetitionTolerance);
    scores[bars] = s;
  }
  let best: number = LENGTH_CANDIDATES[2];
  for (const bars of LENGTH_CANDIDATES) if (scores[bars] > scores[best]) best = bars;
  if (best >= 16) reasons.push('long blend: compatible drums and keys, room on both tracks');
  else if (best <= 2) reasons.push('immediate: musically justified and safe');
  else if (best <= 4) reasons.push('short blend: a strong identity, vocals or an energy change ask for it');
  reasons.push(`${best} bars (phrase ${phrase} bars, outgoing room ${ctx.outgoingRoomBars} bars)`);
  return { bars: best, reasons, scores };
}

// ── Style selection (plan sections 17, 23, 53, 55) ─────────────────────────

export interface StyleScore { style: TransitionStyle; score: number; reason: string }

export function scoreStyles(ctx: {
  outSection: DJSection | undefined; inSection: DJSection | undefined; outgoing: DJTrackAnalysis; incoming: DJTrackAnalysis;
  vocalRisk: number; outgoingVocalEnding: boolean; drumScore: number; bothBassHeavy: boolean; energyDelta: number; clashRisk: number;
  tempoBand: string; tempoMethod: string; style: DJStyleProfile; creativeRisk: number; memory: SessionMemorySnapshot; smartCuts: boolean;
  outroRoomBars: number; incomingHasDrumIntro: boolean; confidence: number; setPhaseIsPeak: () => boolean;
  /** Auto Juggle mode and whether a trading ladder fits both tracks (juggleTransition). */
  juggleMode?: JuggleMode; ladderFits?: boolean;
}): StyleScore[] {
  const out: StyleScore[] = [];
  const rep = (s: TransitionStyle) => {
    const recent = ctx.memory.recentTransitionTypes.slice(-3);
    let run = 0;
    for (let i = recent.length - 1; i >= 0; i--) { if (recent[i] === s) run++; else break; }
    return run * (1 - ctx.style.repetitionTolerance) * 0.35;
  };
  const fx = ctx.style.fxUsage;
  const add = (style: TransitionStyle, score: number, reason: string) => out.push({ style, score: score - rep(style), reason });
  const lowConf = ctx.confidence < 0.5;

  // Always available: the blends.
  add('longBlend', 0.5 + ctx.drumScore * 0.3 + (ctx.outroRoomBars >= 16 ? 0.2 : 0) - Math.abs(ctx.energyDelta) * 0.4 - ctx.vocalRisk * 0.3 - ctx.clashRisk * 0.3, 'drums and keys compatible, room on both tracks');
  add('shortBlend', 0.45 + Math.max(0, Math.abs(ctx.energyDelta) - 0.15) * 0.6 + ctx.vocalRisk * 0.2 + ctx.clashRisk * 0.2 + (ctx.outroRoomBars < 4 ? 0.25 : 0), 'a quick move: a big energy change, vocals or little room');
  if (lowConf) return out; // Low confidence: only the robust blends (plan section 35).

  // Bass handling.
  if (ctx.bothBassHeavy || (ctx.drumScore > 0.6 && ctx.clashRisk < 0.3)) add('bassSwap', 0.55 + (ctx.bothBassHeavy ? 0.25 : 0) + (ctx.style.bassBehaviour === 'swap' ? 0.15 : 0), ctx.bothBassHeavy ? 'two heavy basses: hand the low end over at a phrase boundary' : 'compatible drums: swap the bass at the phrase');
  if (ctx.clashRisk > 0.3 && ctx.clashRisk < 0.7) add('EQSwap', 0.5 + ctx.clashRisk * 0.3, 'harmonic tension: swap the bands instead of blending full range');
  // Filters as punctuation.
  if (ctx.energyDelta > 0.1 || ctx.inSection?.kind === 'build' || ctx.inSection?.kind === 'intro') add('filterBuild', 0.45 + ctx.energyDelta * 0.6 + fx * 0.2, 'energy rises: a controlled filter rise into the incoming section');
  if (ctx.energyDelta < -0.1 || ctx.outSection?.kind === 'outro') add('filterRelease', 0.5 + Math.abs(Math.min(0, ctx.energyDelta)) * 0.8 + fx * 0.1, 'energy settles: release the outgoing low end through the filter');
  // Echo / reverb / delay as punctuation (plan section 53).
  if (ctx.outgoingVocalEnding || ctx.outSection?.kind === 'vocal-heavy' || ctx.outSection?.kind === 'chorus') add('echoOut', 0.5 + fx * 0.4 - ctx.memory.recentFX.filter((f) => f === 'echo-out').length * 0.15, 'a phrase-ending vocal or stab is the echo source');
  if (ctx.outSection?.kind === 'breakdown' && fx > 0.3) add('reverbOut', 0.4 + fx * 0.3, 'breakdown: reverb expansion');
  if (ctx.outSection?.kind === 'groove' && fx > 0.5 && ctx.drumScore > 0.6) add('delayThrow', 0.35 + fx * 0.3, 'phrase ending: a delay throw');
  // Structural moves (plan section 23).
  if (ctx.outSection?.kind === 'breakdown' && ctx.outroRoomBars >= 8) add('breakdownMix', 0.65 + fx * 0.1, 'the outgoing breakdown is the transition window');
  const dropSection = ctx.incoming.sections.find((s) => s.kind === 'drop');
  const dropLifts = dropSection ? dropSection.energy > ctx.outgoing.energy.perceivedIntensity - 0.05 : ctx.energyDelta > 0;
  if (ctx.incoming.cuePoints.firstDrop !== undefined && dropLifts && ctx.creativeRisk > 0.3) add('dropMix', 0.6 + ctx.creativeRisk * 0.3 + (ctx.setPhaseIsPeak() ? 0.2 : 0), 'bring the incoming drop in exactly as the outgoing leaves');
  if (ctx.incomingHasDrumIntro && (ctx.outSection?.kind === 'groove' || ctx.outSection?.kind === 'instrumental' || ctx.outSection?.kind === 'outro')) add('drumIntroMix', 0.6 + ctx.drumScore * 0.2, 'incoming drums under the outgoing melodic section');
  if (ctx.vocalRisk > 0.3) add('vocalSwap', 0.55 + ctx.vocalRisk * 0.4, 'vocals on both: swap through an instrumental stretch');
  if (ctx.drumScore < 0.5) add('percussionSwap', 0.5 + (0.5 - ctx.drumScore) * 0.6, 'drum patterns fight: swap the percussion, not the whole mix');
  if (ctx.incoming.phrases.length > 0 && ctx.outroRoomBars < 4 && ctx.outgoing.phrases.length > 0) add('loopExit', 0.5, 'too little room: loop the last outgoing phrase and exit on the loop');
  // Tempo moves.
  if (ctx.tempoMethod === 'tempo-bridge') add('tempoBridge', 0.9, 'the tempo gap is bridged by the next track');
  if (ctx.tempoMethod === 'double-time') add('doubleTimeJump', 0.6 + ctx.creativeRisk * 0.2, 'double-time relationship');
  if (ctx.tempoMethod === 'half-time') add('halfTimeJump', 0.6 + ctx.creativeRisk * 0.2, 'half-time relationship');
  // Cuts: exceptional, justified (plan section 24).
  // A cut needs the grid above all: both beat grids trusted, a cut-friendly style, the risk budget and a structural trigger.
  const gridConf = Math.min(ctx.outgoing.analysisConfidence.beatGrid, ctx.incoming.analysisConfidence.beatGrid, ctx.outgoing.analysisConfidence.downbeat);
  const cutOk = ctx.style.cutFrequency > 0 && ctx.creativeRisk >= 0.5 && gridConf >= 0.75 && ctx.confidence >= 0.6;
  if (cutOk && (ctx.incoming.cuePoints.firstDrop !== undefined || ctx.outSection?.kind === 'silence' || ctx.smartCuts)) {
    add('hardCut', 0.5 + ctx.style.cutFrequency * 0.5 + ctx.creativeRisk * 0.3 + (ctx.setPhaseIsPeak() ? 0.15 : 0) + (ctx.smartCuts ? 0.1 : 0), 'structural justification for a cut (drop, silence or drum-break tail)');
  }
  // A juggle transition (juggling plan section 26): trade the two tracks down a ladder into the incoming drop.
  // The juggle layer's own gates (POLICY_MIN, HARMONIC_CLASH_REJECT): one gate vocabulary.
  const mode = ctx.juggleMode ?? 'OFF';
  const juggleOk = mode !== 'OFF'
    && (ctx.tempoBand === 'none' || ctx.tempoBand === 'normal')
    && ctx.clashRisk <= HARMONIC_CLASH_REJECT && ctx.vocalRisk < 0.5 && ctx.drumScore >= 0.5
    && gridConf >= POLICY_MIN.phrase.beat && !!ctx.ladderFits;
  if (juggleOk) {
    const performer = mode === 'PERFORMER' || mode === 'AGGRESSIVE' || mode === 'CHAOS';
    add('juggleTransition', 0.5 + ctx.creativeRisk * 0.3 + (ctx.setPhaseIsPeak() ? 0.2 : 0) + (performer ? 0.15 : 0), 'compatible grids, keys and drums: trade the tracks into the drop');
  }
  return out;
}

// ── Curves ──────────────────────────────────────────────────────────────────

export function planBassHandover(ctx: {
  outgoing: DJTrackAnalysis; incoming: DJTrackAnalysis; durationBars: number; beatsPerBar: number; style: DJStyleProfile;
  transitionStyle: TransitionStyle; outStart: number; inStart: number; lengthSec: number;
  /** The basslines' keys at the join, as heard (after the key plan's shift or lock), sit together. */
  bassKeysCompatible: boolean;
}): BassHandoverPlan {
  const { durationBars, beatsPerBar } = ctx;
  const outHeavy = ctx.outgoing.bass.heaviness > 0.7;
  const inHeavy = ctx.incoming.bass.heaviness > 0.7;
  const incomingKickStronger = ctx.incoming.bass.kickStrength > ctx.outgoing.bass.kickStrength + 0.1;
  // Is the outgoing bass still musically necessary at the hand-over: melodic bass that keeps playing.
  const outBassAhead = activity(ctx.outgoing.bassActivity, ctx.outStart, ctx.outStart + ctx.lengthSec);
  const outgoingBassNecessary = ctx.outgoing.bass.melodic && outBassAhead > 0.4;
  const inBassStart = activity(ctx.incoming.bassActivity, ctx.inStart, ctx.inStart + ctx.lengthSec / 2);
  // Both basses share a bar only when the material is compatible (owner juggling plan section 35): light
  // enough, not two melodic lines, and in keys that sit together.
  const coexist = !(outHeavy && inHeavy) && ctx.style.bassBehaviour !== 'strict' && !(ctx.outgoing.bass.melodic && ctx.incoming.bass.melodic) && ctx.bassKeysCompatible;
  // Hand over at the phrase boundary nearest the middle (plan section 21).
  const phrase = ctx.outgoing.phraseLengthBars;
  let handoverBar = Math.round(durationBars / 2);
  if (durationBars >= phrase) handoverBar = Math.max(phrase, Math.round(durationBars / 2 / phrase) * phrase);
  if (ctx.transitionStyle === 'dropMix') handoverBar = Math.max(0, durationBars - 1);
  if (ctx.transitionStyle === 'drumIntroMix') handoverBar = Math.min(durationBars, Math.max(1, Math.round(durationBars * 0.6)));
  if (incomingKickStronger && !outgoingBassNecessary) handoverBar = Math.max(1, handoverBar - 1);
  if (outgoingBassNecessary) handoverBar = Math.min(durationBars - 1, handoverBar + 1);
  handoverBar = Math.max(0, Math.min(durationBars, handoverBar));
  const schedule: Array<{ bar: number; owner: BassOwner }> = [];
  if (inBassStart < 0.15 && handoverBar > 0) schedule.push({ bar: 0, owner: 'NEUTRAL' });
  else schedule.push({ bar: 0, owner: 'OUTGOING' });
  const sharedBars = coexist ? 1 : 0;
  if (sharedBars > 0 && handoverBar - sharedBars > 0) schedule.push({ bar: handoverBar - sharedBars, owner: 'SHARED' });
  schedule.push({ bar: handoverBar, owner: 'INCOMING' });
  const b = (bar: number) => bar * beatsPerBar;
  const curves: AutomationCurve[] = [];
  // A cut, or a juggle's trades (one deck heard at a time): full range on both, nothing to hand over gradually.
  if (ctx.transitionStyle === 'hardCut' || ctx.transitionStyle === 'juggleTransition') {
    curves.push(curve('outgoing.eqLow', [{ beat: 0, value: 0 }]), curve('incoming.eqLow', [{ beat: 0, value: 0 }]));
  } else {
    // One bass at a time (owner juggling plan sections 14, 35, the juggle layer's own rule): the incoming
    // low band is killed until the hand-over, the outgoing's is killed from it - "cut A bass, bring B bass".
    // A compatible pair shares one bar first, both at -6 dB.
    const sharedStart = Math.max(0, b(handoverBar - sharedBars));
    const handBeat = b(handoverBar);
    if (coexist && sharedBars > 0 && sharedStart < handBeat) {
      curves.push(curve('outgoing.eqLow', [{ beat: 0, value: 0 }, { beat: Math.max(0, sharedStart - 0.5), value: 0 }, { beat: sharedStart + 0.5, value: -6, curve: 'ease' }]));
      curves.push(curve('incoming.eqLow', [{ beat: 0, value: -6 }, { beat: sharedStart + 0.5, value: -6 }, { beat: handBeat, value: 0, curve: 'ease' }]));
      curves.push(stepCurve('incoming.lowKill', 1, 0, sharedStart));
    } else {
      curves.push(curve('outgoing.eqLow', [{ beat: 0, value: 0 }]), curve('incoming.eqLow', [{ beat: 0, value: 0 }]));
      curves.push(stepCurve('incoming.lowKill', 1, 0, handBeat));
    }
    curves.push(stepCurve('outgoing.lowKill', 0, 1, handBeat));
  }
  const reason = outHeavy && inHeavy ? 'both heavy: strict hand-over, never both exposed'
    : coexist ? `shared for one bar at bar ${handoverBar - 1}, incoming owns from bar ${handoverBar} (outgoing bass killed)`
    : `bass handed over at bar ${handoverBar}: outgoing killed, incoming in${incomingKickStronger ? ' (stronger kick)' : ''}${outgoingBassNecessary ? ' (outgoing bassline kept a bar longer)' : ''}${ctx.bassKeysCompatible ? '' : ' (bass keys not proven compatible: no shared bar)'}`;
  return { schedule, curves, coexist, bassKeysCompatible: ctx.bassKeysCompatible, outgoingHeavy: outHeavy, incomingHeavy: inHeavy, incomingKickStronger, outgoingBassNecessary, handoverBar, reason };
}

function eqFor(style: TransitionStyle, beats: number): EQPlan {
  if (style === 'EQSwap') {
    return { curves: [
      curve('outgoing.eqMid', [{ beat: 0, value: 0 }, { beat: beats * 0.5, value: -6, curve: 'ease' }, { beat: beats, value: -12, curve: 'ease' }]),
      curve('incoming.eqMid', [{ beat: 0, value: -9 }, { beat: beats * 0.5, value: -3, curve: 'ease' }, { beat: beats, value: 0, curve: 'ease' }]),
      curve('outgoing.eqHigh', [{ beat: 0, value: 0 }, { beat: beats, value: -9, curve: 'ease' }]),
      curve('incoming.eqHigh', [{ beat: 0, value: -6 }, { beat: beats, value: 0, curve: 'ease' }]),
    ] };
  }
  if (style === 'percussionSwap') {
    return { curves: [
      curve('outgoing.eqHigh', [{ beat: 0, value: 0 }, { beat: beats * 0.4, value: -12, curve: 'ease' }]),
      curve('incoming.eqHigh', [{ beat: 0, value: -12 }, { beat: beats * 0.4, value: 0, curve: 'ease' }]),
    ] };
  }
  if (style === 'vocalSwap') {
    return { curves: [
      curve('outgoing.eqMid', [{ beat: 0, value: 0 }, { beat: beats * 0.5, value: -8, curve: 'ease' }]),
      curve('incoming.eqMid', [{ beat: 0, value: -8 }, { beat: beats * 0.6, value: 0, curve: 'ease' }]),
    ] };
  }
  return { curves: [] };
}

function effectsFor(style: TransitionStyle, beats: number, fxUsage: number, outSection: DJSection | undefined, inSection: DJSection | undefined, memory: SessionMemorySnapshot): DJEffectEvent[] {
  const events: DJEffectEvent[] = [];
  const recent = (k: DJEffectEvent['kind']) => memory.recentFX.filter((f) => f === k).length;
  if (style === 'echoOut') events.push({ kind: 'echo-out', deck: 'outgoing', beat: 0, lengthBeats: Math.min(beats, 16), amount: 0.75, reason: 'vocal or stab ending: echo out' });
  if (style === 'reverbOut') events.push({ kind: 'reverb-out', deck: 'outgoing', beat: 0, lengthBeats: Math.min(beats, 16), amount: 0.7, reason: 'breakdown: reverb expansion' });
  if (style === 'delayThrow') events.push({ kind: 'delay-throw', deck: 'outgoing', beat: Math.max(0, beats - 4), lengthBeats: 2, amount: 0.6, reason: 'phrase ending: delay throw' });
  if (style === 'filterBuild') events.push({ kind: 'filter-rise', deck: 'incoming', beat: 0, lengthBeats: beats, amount: 1, reason: 'build: filter rise' });
  if (style === 'dropMix') events.push({ kind: 'clean-release', deck: 'incoming', beat: beats, lengthBeats: 0, amount: 1, reason: 'drop: clean release, nothing in the way' });
  if (style === 'breakdownMix' && fxUsage > 0.5 && recent('reverb-expansion') === 0 && outSection?.kind === 'breakdown') {
    events.push({ kind: 'reverb-expansion', deck: 'outgoing', beat: 0, lengthBeats: Math.min(8, beats), amount: 0.4, reason: 'breakdown: reverb expansion' });
  }
  if (style !== 'echoOut' && style !== 'delayThrow' && fxUsage > 0.6 && recent('delay-throw') === 0 && inSection?.kind !== 'drop' && beats >= 16 && (outSection?.kind === 'groove' || outSection?.kind === 'outro')) {
    events.push({ kind: 'delay-throw', deck: 'outgoing', beat: beats - 4, lengthBeats: 2, amount: 0.4, reason: 'phrase ending: a small delay throw as punctuation' });
  }
  return events;
}

// ── Risk and confidence (plan sections 35, 36) ──────────────────────────────

export function assessRisk(ctx: {
  clashRisk: number; tempoBand: string; tempoMethod: string; phraseConfidence: number; bothBassHeavy: boolean; bassShared: boolean;
  vocalRisk: number; truePeakDb: number; lowFrequencyAccumulation: number; outConf: number; inConf: number; styleName: TransitionStyle;
}): TransitionRisk {
  const tempo = ctx.tempoMethod === 'avoid' ? 0.8 : ctx.tempoBand === 'extreme' ? 0.9 : ctx.tempoBand === 'creative' ? 0.5 : ctx.tempoBand === 'normal' ? 0.2 : 0.05;
  const phrase = 1 - ctx.phraseConfidence;
  const bass = (ctx.bothBassHeavy ? 0.5 : 0.1) + (ctx.bassShared ? 0.2 : 0);
  const loudness = Math.max(0, Math.min(1, (ctx.truePeakDb + 1) / 3)) * 0.6 + ctx.lowFrequencyAccumulation * 0.4;
  const technical = 1 - Math.min(ctx.outConf, ctx.inConf);
  const creative = ['hardCut', 'dropMix', 'loopExit', 'tempoBridge', 'doubleTimeJump', 'halfTimeJump', 'juggleTransition'].includes(ctx.styleName) ? 0.15 : 0;
  const risk: TransitionRisk = {
    harmonic: Math.min(1, ctx.clashRisk), tempo, phrase: Math.min(1, phrase), bass: Math.min(1, bass), vocal: Math.min(1, ctx.vocalRisk),
    loudness: Math.min(1, loudness), technical: Math.min(1, technical), overall: 0,
  };
  risk.overall = Math.min(1, 0.2 * risk.harmonic + 0.2 * risk.tempo + 0.15 * risk.phrase + 0.15 * risk.bass + 0.1 * risk.vocal + 0.1 * risk.loudness + 0.1 * risk.technical + creative);
  return risk;
}

// ── The plan ────────────────────────────────────────────────────────────────

let planCounter = 0;

export function planTransition(input: TransitionPlanInput): DJTransitionPlan {
  const { outgoing, incoming, style } = input;
  const beatsPerBar = outgoing.meter.beatsPerBar || 4;
  const bpm = outgoing.bpm > 0 ? outgoing.bpm : 125;
  const barSec = (60 / bpm) * beatsPerBar;
  const leadSec = input.leadSec ?? 1.5;
  const seed = input.seed ?? planCounter++;
  const outSummary = summarizeTrack(outgoing);
  const inSummary = summarizeTrack(incoming);
  const memory = input.memory;

  // Confidence that gates sophistication (plan section 35).
  const outConf = outgoing.analysisConfidence.overall;
  const inConf = incoming.analysisConfidence.overall;
  const gridConf = Math.min(outgoing.analysisConfidence.beatGrid, incoming.analysisConfidence.beatGrid);
  const confidence = Math.min(outConf, inConf, 0.5 + 0.5 * gridConf);

  // Compatibility at the join.
  const vocal = vocalCompatibility(outSummary, inSummary);
  const drums = drumCompatibility(outSummary, inSummary);
  const bass = bassCompatibility(outSummary, inSummary);
  const energyDelta = incoming.energy.perceivedIntensity - outgoing.energy.perceivedIntensity;

  // Tempo and key.
  const provisionalBars = Math.max(2, Math.min(32, input.userBars || style.transitionLengthBars));
  const tempoInput = {
    outgoingBpm: bpm, outgoingBpmConfidence: outgoing.bpmConfidence, incomingBpm: incoming.bpm, incomingBpmConfidence: incoming.bpmConfidence,
    outgoingKey: outgoing.key.mode === 'unknown' ? null : outgoing.key.name, outgoingKeyConfidence: outgoing.keyConfidence,
    incomingKey: incoming.key.mode === 'unknown' ? null : incoming.key.name, incomingKeyConfidence: incoming.keyConfidence,
    harmonicDensity: (outgoing.energy.harmonicDensity + incoming.energy.harmonicDensity) / 2,
    overlapBars: provisionalBars, style, creativeRisk: input.creativeRisk, limits: input.limits, bridgeAvailable: input.bridgeAvailable,
  };
  const tempoPlan = solveTempo(tempoInput);

  // Preliminary mix-out for the local key and the sections at the join.
  const prelimOut = chooseMixOut(outgoing, input.outgoingPosition, provisionalBars * barSec, leadSec, style.phraseStrictness);
  const outSection = sectionAt(outgoing, prelimOut.time);
  const localOut = keyAt(outgoing, prelimOut.time);
  const localIn = keyAt(incoming, incoming.cuePoints.bestMixIn ?? 0);
  const keyPlan = solveKey({
    ...tempoInput,
    outgoingKey: localOut.key.mode === 'unknown' ? null : localOut.key.name, outgoingKeyConfidence: localOut.confidence,
    incomingKey: localIn.key.mode === 'unknown' ? null : localIn.key.name, incomingKeyConfidence: localIn.confidence,
  }, tempoPlan);
  const clash = harmonicCompatibility(keyPlan.outgoingKey, localOut.confidence, keyPlan.keyLock ? keyPlan.incomingKey : (keyPlan.shiftedKey ?? keyPlan.incomingKey), localIn.confidence, { strictness: style.keyStrictness, overlapBars: provisionalBars });

  // Style from context (plan sections 17, 55).
  const outroRoomSec = (outgoing.cuePoints.finalBeat ?? outgoing.durationSec) - prelimOut.time;
  const outroRoomBars = Math.max(0, Math.floor(outroRoomSec / barSec));
  const incomingIntro = incoming.sections.find((s) => s.kind === 'intro');
  // A drum intro: drums run for two bars before the bass arrives, or the intro
  // section itself carries drums. A bass playing from the first bar is not one.
  const inBassStart = activity(incoming.bassActivity, incoming.cuePoints.firstDrums ?? 0, (incoming.cuePoints.firstDrums ?? 0) + 2 * barSec);
  const incomingHasDrumIntro = (incoming.cuePoints.firstBass !== undefined && (incoming.cuePoints.firstDrums ?? 0) < incoming.cuePoints.firstBass - 2 * barSec && inBassStart < 0.2)
    || (!!incomingIntro && activity(incoming.drumActivity, incomingIntro.start, incomingIntro.end) > 0.3 && activity(incoming.bassActivity, incomingIntro.start, incomingIntro.end) < 0.2);
  const outgoingVocalEnding = outgoing.vocalActivity.confidence > 0 && activity(outgoing.vocalActivity, Math.max(0, prelimOut.time - 2 * barSec), prelimOut.time) > 0.4
    && activity(outgoing.vocalActivity, prelimOut.time, prelimOut.time + 2 * barSec) < 0.25;
  const setPhaseIsPeak = () => input.setPhase === 'PEAK' || input.setPhase === 'PEAKING';
  const juggleMode: JuggleMode = input.juggleMode ?? 'OFF';
  const ladderWhy: string[] = [];
  // A juggle transition is budgeted (owner plan sections 24, 28): the set arc, the cooldown, the juggled
  // fraction - and confidence-aware (section 31): the mode's shortest rung only at the pair's confidence.
  const policy: ConfidencePolicy = confidencePolicy(pairConfidence(outgoing, incoming));
  const minRung = minLadderRung(juggleMode, policy);
  const phaseAllowed = (PHASE_BUDGET as Record<string, { allowed: boolean }>)[input.setPhase]?.allowed !== false;
  // Different meters: the ladder's rungs would be counted in one deck's bars (owner plan sections 25, 56).
  const meters = meterMismatch(outgoing, incoming);
  if (juggleMode !== 'OFF') {
    if (meters) ladderWhy.push(`${meters}: normal transition`);
    if (!phaseAllowed) ladderWhy.push(`set phase ${input.setPhase}: normal mixing`);
    if (input.juggleState && !input.juggleState.allowed) ladderWhy.push(...input.juggleState.reasons);
    if (minRung === null) ladderWhy.push(`${policy} confidence: normal transition`);
  }
  const ladder = !meters && minRung !== null && phaseAllowed && (input.juggleState?.allowed ?? true)
    ? chooseLadder(outgoing, incoming, ladderCandidates(minRung, input.juggleState?.recent, seed), input.outgoingPosition, leadSec, prelimOut.time + provisionalBars * barSec, ladderWhy) : null;
  const styles = scoreStyles({
    outSection, inSection: sectionAt(incoming, incoming.cuePoints.bestMixIn ?? 0), outgoing, incoming,
    vocalRisk: vocal.overlapRisk, outgoingVocalEnding, drumScore: drums.score, bothBassHeavy: bass.bothHeavy, energyDelta,
    clashRisk: clash.clashRisk, tempoBand: tempoPlan.band, tempoMethod: tempoPlan.method, style, creativeRisk: input.creativeRisk,
    memory, smartCuts: input.smartCuts, outroRoomBars, incomingHasDrumIntro, confidence, setPhaseIsPeak,
    juggleMode, ladderFits: !!ladder,
  }).sort((a, b) => b.score - a.score);
  const chosen = styles[0];
  const transitionStyle: TransitionStyle = chosen.style;
  const rejected = styles.slice(1).map((s) => ({ style: s.style, reason: `${s.reason} (score ${s.score.toFixed(2)} < ${chosen.score.toFixed(2)})` }));
  for (const s of TRANSITION_STYLES) if (!styles.some((x) => x.style === s)) rejected.push({ style: s, reason: 'no musical trigger' });

  // Length (plan section 16).
  const incomingIntroBars = incomingIntro ? Math.round((incomingIntro.end - incomingIntro.start) / barSec) : 0;
  const prelimRisk = assessRisk({
    clashRisk: clash.clashRisk, tempoBand: tempoPlan.band, tempoMethod: tempoPlan.method, phraseConfidence: Math.min(outgoing.phrases[0]?.confidence ?? 0.3, incoming.phrases[0]?.confidence ?? 0.3),
    bothBassHeavy: bass.bothHeavy, bassShared: false, vocalRisk: vocal.overlapRisk, truePeakDb: -3, lowFrequencyAccumulation: 0, outConf, inConf, styleName: transitionStyle,
  });
  const length = chooseLength({
    outgoing, incoming, style, userBars: input.userBars, styleName: transitionStyle, energyDelta, vocalRisk: vocal.overlapRisk,
    clashRisk: clash.clashRisk, drumScore: drums.score, setPhase: input.setPhase, risk: prelimRisk.overall,
    outgoingRoomBars: Math.max(2, outroRoomBars), incomingIntroBars, memory,
  });
  // A juggle transition: the ladder runs from the start, the release is one bar after it.
  const juggle: DJTransitionPlan['juggle'] = transitionStyle === 'juggleTransition' && ladder ? { ladderBars: ladder.ladderBars, tradeBeats: ladder.tradeBeats } : undefined;
  let durationBars = transitionStyle === 'hardCut' || juggle ? 1 : length.bars;
  if (tempoPlan.method === 'avoid') durationBars = Math.min(durationBars, 4);
  // Final mix points with the real length; when the outgoing has less room than
  // the length, halve the length (never below 2 bars) and look again.
  let mixOut = juggle ? ladder!.mixOut : chooseMixOut(outgoing, input.outgoingPosition, durationBars * barSec, leadSec, style.phraseStrictness);
  const finalBeatSec = outgoing.cuePoints.finalBeat ?? outgoing.durationSec;
  while (!juggle && durationBars > 2 && mixOut.time + durationBars * barSec > finalBeatSec + 0.5) {
    durationBars = Math.max(2, Math.floor(durationBars / 2));
    mixOut = chooseMixOut(outgoing, input.outgoingPosition, durationBars * barSec, leadSec, style.phraseStrictness);
  }
  const durationBeats = durationBars * beatsPerBar;
  const lengthSec = durationBars * barSec;
  const mixIn = juggle ? ladder!.mixIn : chooseMixIn(incoming, transitionStyle, lengthSec);
  // The incoming starts with the ladder, the trade length before its mix-in.
  const incomingPosition = juggle ? ladder!.incomingPosition : mixIn.time;
  const startBeat = beatIndexAt(outgoing, mixOut.time);
  const endBeat = startBeat + (juggle?.tradeBeats ?? 0) + durationBeats;

  // Curves.
  const toward: 0 | 1 = input.incomingDeck === 'A' ? 0 : 1;
  const crossfadePlan = crossfadeFor(transitionStyle, durationBeats, toward);
  const bassPlan = planBassHandover({ outgoing, incoming, durationBars, beatsPerBar, style, transitionStyle, outStart: mixOut.time, inStart: mixIn.time, lengthSec, bassKeysCompatible: bassKeysCompatible(clash) });
  const filterPlan = filterFor(transitionStyle, durationBeats, input.withFilter, 1);
  const eqPlan = eqFor(transitionStyle, durationBeats);
  const effects = effectsFor(transitionStyle, durationBeats, style.fxUsage, outSection, sectionAt(incoming, mixIn.time), memory);
  const gainPlan = planGain({
    outgoing, incoming, sharedBars: sharedBarsOf(bassPlan.schedule, durationBars), durationBars,
    fxAmount: Math.max(0, ...effects.map((e) => e.amount)), law: crossfadePlan.law,
  });
  // Echo-out, reverb-out, delay throws, filter rises and releases are
  // performed by the DJ FX actions the pads use (the executor fires them);
  // the plan carries them as effect events and the filter kind, not as
  // private curves (one path, plan sections 17-19, 53).
  if (transitionStyle === 'hardCut' && input.smartCuts && input.creativeRisk >= 0.7 && style.cutFrequency >= 0.3) {
    effects.push({ kind: 'brake', deck: 'outgoing', beat: 0, lengthBeats: 2, amount: 1, reason: 'impact cut: brake the outgoing deck into the cut' });
  }

  // Loops and cue jumps (plan sections 51, 52).
  let loop: LoopPlan | undefined;
  const phraseConf = Math.min(outgoing.phrases[0]?.confidence ?? 0, incoming.phrases[0]?.confidence ?? 0);
  if (gridConf >= 0.7 && phraseConf >= 0.6) {
    const outPhrase = phraseAt(outgoing, mixOut.time);
    if ((transitionStyle === 'loopExit' || outroRoomBars < durationBars) && outPhrase && outPhrase.lengthBars >= 4) {
      loop = { deck: 'outgoing', startSec: outPhrase.start, endSec: outPhrase.end, lengthBeats: outPhrase.lengthBars * beatsPerBar, repeats: Math.max(1, Math.ceil((durationBars - outroRoomBars) / outPhrase.lengthBars)), purpose: 'extend-outro', confidence: phraseConf, reason: 'the outgoing track ends before the transition would: loop its last phrase' };
    } else if (transitionStyle === 'breakdownMix' && outSection?.kind === 'breakdown' && (outSection.end - outSection.start) < lengthSec) {
      loop = { deck: 'outgoing', startSec: outSection.start, endSec: outSection.end, lengthBeats: Math.round((outSection.end - outSection.start) / (60 / bpm)), repeats: 1, purpose: 'hold-breakdown', confidence: phraseConf, reason: 'hold the breakdown for the whole transition' };
    } else if (incomingIntroBars > 0 && incomingIntroBars < durationBars && transitionStyle === 'longBlend' && incomingIntro) {
      loop = { deck: 'incoming', startSec: incomingIntro.start, endSec: incomingIntro.end, lengthBeats: incomingIntroBars * beatsPerBar, repeats: Math.max(1, Math.ceil(durationBars / incomingIntroBars) - 1), purpose: 'extend-intro', confidence: phraseConf, reason: 'the incoming intro is shorter than the blend: extend it' };
    }
  }
  let cueJump: CueJumpPlan | undefined;
  if (transitionStyle === 'dropMix' && incoming.cuePoints.firstDrop !== undefined && inConf >= 0.8 && input.creativeRisk >= 0.6) {
    cueJump = { deck: 'incoming', targetSec: mixIn.time, target: 'drop', confidence: inConf, reason: 'start the incoming so its drop lands at the end of the transition' };
  } else if (transitionStyle === 'hardCut' && inConf >= 0.8 && input.creativeRisk >= 0.6 && incoming.cuePoints.firstHook !== undefined) {
    cueJump = { deck: 'incoming', targetSec: mixIn.time, target: 'hook', confidence: inConf, reason: 'cut straight into the hook' };
  }

  // Cut candidate (plan section 24).
  let cut: CutCandidate | undefined;
  if (transitionStyle === 'hardCut') {
    const reason: CutCandidate['reason'] = outSection?.kind === 'silence' ? 'silence' : incoming.cuePoints.firstDrop !== undefined ? 'drop' : input.smartCuts ? 'impact' : 'phraseBoundary';
    cut = { beat: startBeat, reason, confidence: Math.min(confidence, mixOut.phrase ? mixOut.phrase.confidence : 0.6) };
  }

  const risk = assessRisk({
    clashRisk: clash.clashRisk, tempoBand: tempoPlan.band, tempoMethod: tempoPlan.method, phraseConfidence: phraseConf,
    bothBassHeavy: bass.bothHeavy, bassShared: bassPlan.coexist, vocalRisk: vocal.overlapRisk, truePeakDb: gainPlan.monitor.truePeakDb,
    lowFrequencyAccumulation: gainPlan.monitor.lowFrequencyAccumulation, outConf, inConf, styleName: transitionStyle,
  });

  // Humanize (plan section 31): deterministic from the seed, tiny, never on the grid itself.
  const humanize: HumanizePlan = {
    // A juggle trades by cuts from the first beat: the incoming starts on the grid, never late.
    startOffsetMs: juggle ? 0 : Math.round(hash(seed, 1) * 30),
    lengthVariationBars: 0,
    fxOffsetMs: Math.round(hash(seed, 2) * 20),
  };

  const quantize: DJTransitionPlan['quantize'] = gridConf < 0.3 ? 'none' : style.phraseStrictness >= 0.7 && outgoing.phrases.length > 0 && phraseConf >= 0.5 ? 'phrase' : gridConf >= 0.5 ? 'bar' : 'beat';
  const fallbackStyle: TransitionStyle = tempoPlan.band === 'extreme' || tempoPlan.method === 'avoid' ? 'shortBlend' : 'longBlend';

  const reasons = [
    `style ${transitionStyle}: ${chosen.reason}`,
    ...length.reasons,
    `mix out at ${mixOut.time.toFixed(1)} s: ${mixOut.reasons.join(', ')}`,
    `mix in at ${mixIn.time.toFixed(1)} s: ${mixIn.reasons.join(', ')}`,
    `tempo: ${tempoPlan.reason}`,
    `key: ${keyPlan.reason}${keyPlan.keyLock ? ' [key lock]' : ''}`,
    `bass: ${bassPlan.reason}`,
    `drums: ${drums.reason}`,
    `vocals: ${vocal.reason}`,
    `gain: overlap ${gainPlan.overlapCompensationDb.toFixed(1)} dB, predicted true peak ${gainPlan.monitor.truePeakDb.toFixed(1)} dB`,
    `risk ${risk.overall.toFixed(2)}, confidence ${confidence.toFixed(2)}, fallback ${fallbackStyle}`,
  ];
  if (juggle) {
    // The trade stage judges the decks again and may refuse (cooldown, dense vocals, confidence: owner plan
    // sections 24, 25, 31). Then a normal transition plays (section 31: low -> normal transition), planned
    // here from the ladder's start: the best style without the juggle, with its own length and curves.
    const fallback = planTransition({ ...input, juggleMode: 'OFF', juggleState: undefined, outgoingPosition: ladder!.mixOut.time, seed });
    juggle.fallback = { ...fallback, id: `t${seed}-trade-refused` };
    reasons.push(`juggle: ${juggle.ladderBars.join(' -> ')} bar trades (${juggle.tradeBeats} beats), incoming from ${incomingPosition.toFixed(1)} s; refused at the trades: ${fallback.style} ${fallback.durationBars} bars at ${fallback.startTimeSec.toFixed(1)} s`);
  }
  else if (juggleMode !== 'OFF' && ladderWhy.length) reasons.push(`juggle: ${ladderWhy.join('; ')}`);
  if (loop) reasons.push(`loop: ${loop.reason}`);
  if (cueJump) reasons.push(`cue jump: ${cueJump.reason}`);

  return {
    id: `t${seed}`,
    style: transitionStyle,
    outgoingDeck: input.outgoingDeck,
    incomingDeck: input.incomingDeck,
    startBeat,
    endBeat,
    startTimeSec: mixOut.time,
    incomingPosition,
    durationBars,
    durationBeats,
    beatsPerBar,
    tempoPlan,
    keyPlan,
    crossfadePlan,
    eqPlan,
    filterPlan,
    bassPlan,
    gainPlan,
    effects,
    loop,
    cueJump,
    cut,
    juggle,
    confidence,
    risk,
    quantize,
    humanize,
    fallbackStyle,
    emergencyStyle: 'shortBlend',
    reasons,
    rejected,
  };
}

/** A safe plan from a plan: the fallback style with the same length and points (plan section 37). */
export function fallbackPlan(plan: DJTransitionPlan, input: TransitionPlanInput, level: 'fallback' | 'emergency'): DJTransitionPlan {
  const styleName: TransitionStyle = level === 'fallback' ? plan.fallbackStyle : plan.emergencyStyle;
  const bars = level === 'emergency' ? Math.min(4, plan.durationBars) : plan.durationBars;
  const beatsPerBar = plan.beatsPerBar;
  const beats = bars * beatsPerBar;
  const toward: 0 | 1 = plan.incomingDeck === 'A' ? 0 : 1;
  const tempoPlan = level === 'emergency' ? { ...plan.tempoPlan, method: 'none' as const, incomingSemitones: 0, ratio: 1, percent: 0, keyLock: false, reason: 'emergency: no tempo change' } : plan.tempoPlan;
  const bassPlan = level === 'emergency'
    ? { ...plan.bassPlan, curves: [], schedule: [{ bar: 0, owner: 'SHARED' as const }], reason: 'emergency: plain crossfade' }
    : planBassHandover({ outgoing: input.outgoing, incoming: input.incoming, durationBars: bars, beatsPerBar, style: input.style, transitionStyle: styleName, outStart: plan.startTimeSec, inStart: plan.incomingPosition, lengthSec: bars * (60 / Math.max(60, input.outgoing.bpm)) * beatsPerBar, bassKeysCompatible: plan.bassPlan.bassKeysCompatible });
  return {
    ...plan,
    id: `${plan.id}-${level}`,
    style: styleName,
    durationBars: bars,
    durationBeats: beats,
    endBeat: plan.startBeat + beats,
    tempoPlan,
    crossfadePlan: crossfadeFor(styleName, beats, toward),
    eqPlan: { curves: [] },
    filterPlan: level === 'emergency' ? { kind: 'none', curves: [], resonance: 1 } : filterFor(styleName, beats, input.withFilter, 1),
    bassPlan,
    effects: [],
    loop: undefined,
    cueJump: undefined,
    cut: undefined,
    juggle: undefined,
    quantize: level === 'emergency' ? 'bar' : plan.quantize,
    reasons: [`${level}: ${styleName} instead of ${plan.style}`, ...plan.reasons.slice(1)],
  };
}
