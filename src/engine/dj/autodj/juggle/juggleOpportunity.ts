/**
 * Stand-alone juggles (plan 2026-10-11-dj-juggling, P4.1). Owner, 2026-10-11:
 * "a juggle is not only a transition, it could happen anywhere in an artistic
 * way to make the music better and excite the crowd".
 *
 * Outside a mix only one deck plays, so the juggle planner rightly blocks
 * ("both decks must play"). This decides whether Auto DJ should produce the
 * two-deck state now - load a double of the playing track (or tease the
 * pre-rendered next one) on the idle deck - by judging the master as if the
 * idle deck already held a phase-locked double: the planner's own budget,
 * conditions, confidence policy and pattern choice decide (no thresholds of
 * its own), plus a musical moment within the next phrase.
 *
 * Pure.
 */
import { MODE_PATTERNS } from './jugglePatterns';
import { budgetFor, conditions, confidencePolicy, lowConfidenceReason, nextPhraseStartBeat, patternBars, planJuggle, POLICY_MIN } from './jugglePlanner';
import type { DJDeckPerformanceState, DJJugglePerformanceContext, JuggleMode, JuggleTrigger, LibraryPatternType, StandaloneSource } from './juggleTypes';
import { JUGGLE_PATTERN_TYPES } from './juggleTypes';
import type { DJSection, DJTrackAnalysis } from '../types';

export type { JuggleTrigger, StandaloneSource };

export interface JuggleOpportunity {
  trigger: JuggleTrigger;
  source: StandaloneSource;
  /** Absolute master beat of the phrase the juggle aims at. */
  startBeat: number;
  reason: string;
}

/**
 * The pre-rendered next track, and whether it suits a tease: `compatible` is
 * the anticipated plan's verdict (tempo band none/normal, no key clash);
 * `pair` is the context with the next track playing on the idle deck from
 * its cue, so the planner's own conditions judge the pair that would really
 * play (keys heard there, vocals, bass) - owner plan section 25.
 */
export interface NextTrackOption { analysis: DJTrackAnalysis; compatible: boolean; pair?: DJJugglePerformanceContext }

/** Room kept between a stand-alone juggle's end and the planned transition. */
export const STANDALONE_TRANSITION_MARGIN_SEC = 30;
/** The next track is teased only this close to the transition that brings it in. */
export const NEXT_TEASE_MAX_SEC = 180;

/**
 * The context as it will be once a double plays on the idle deck: the idle
 * deck holds the master's state (same track, same analysis, playing) and the
 * decks' sync is what the controller computes for two copies of one grid.
 */
export function asDoubleContext(ctx: DJJugglePerformanceContext): DJJugglePerformanceContext {
  const master = ctx.masterDeck === 'A' ? ctx.deckA : ctx.deckB;
  const idle: 'A' | 'B' = ctx.masterDeck === 'A' ? 'B' : 'A';
  const copy: DJDeckPerformanceState = { ...master, deck: idle };
  return {
    ...ctx,
    deckA: idle === 'A' ? copy : master,
    deckB: idle === 'B' ? copy : master,
    sameTrackOnBothDecks: !!master.analysis,
    deckSyncConfidence: master.analysis ? master.analysis.beatGrid.confidence : 0,
  };
}

/** The longest pattern the mode may play here, in bars: what the transition guard keeps room for. */
function longestPatternBars(ctx: DJJugglePerformanceContext, mode: JuggleMode): number {
  if (mode === 'OFF') return 0;
  const allowed = MODE_PATTERNS[mode].filter((t): t is LibraryPatternType => (JUGGLE_PATTERN_TYPES as readonly string[]).includes(t));
  return Math.max(0, ...allowed.map((t) => patternBars(t, ctx)));
}

/**
 * Whether to set up a stand-alone juggle now. Null = not now; the reasons go
 * to `why` (the debug view and the MCP explain show them).
 */
export function juggleOpportunity(
  ctx: DJJugglePerformanceContext, mode: JuggleMode, next: NextTrackOption | null, why: string[],
  opts: { intensityOverride?: number; seed?: number; skipTiming?: boolean } = {},
): JuggleOpportunity | null {
  const timing = { skipTiming: opts.skipTiming };
  const master = ctx.masterDeck === 'A' ? ctx.deckA : ctx.deckB;
  if (!master.analysis) { why.push('the playing deck has no analysis'); return null; }
  if (!master.playing) { why.push('the master deck is not playing'); return null; }

  // The planner's own gates, on the context a double would make.
  const h = asDoubleContext(ctx);
  const budget = budgetFor(h, mode, timing);
  if (!budget.allowed) { why.push(...budget.reasons); return null; }
  const cond = conditions(h, timing);
  if (cond.bad.length) { why.push(...cond.bad); return null; }
  if (confidencePolicy(h) === 'none') { why.push(lowConfidenceReason(h)); return null; }

  const beatSec = 60 / Math.max(60, master.bpm || master.analysis.bpm);
  const bpb = ctx.beatsPerBar;
  const barSec = beatSec * bpb;
  const phraseSec = Math.max(1, ctx.phraseLengthBars) * barSec;
  const startBeat = nextPhraseStartBeat(h, bpb);

  // A planned transition needs the deck: the setup, the longest pattern and a margin must fit before it.
  if (ctx.transitionApproachingSec !== null) {
    const setupSec = Math.max(0, startBeat - ctx.masterBeat) * beatSec;
    const needSec = setupSec + longestPatternBars(h, mode) * barSec + STANDALONE_TRANSITION_MARGIN_SEC;
    if (ctx.transitionApproachingSec <= needSec) {
      why.push(`transition in ${Math.round(ctx.transitionApproachingSec)} s: a stand-alone juggle needs ${Math.round(needSec)} s`);
      return null;
    }
  }

  // The musical moment, first match wins.
  const pos = master.position;
  const ahead = (s: DJSection | undefined): boolean => !!s && s.start > pos && s.start - pos <= phraseSec;
  const nx = ctx.nextSection;
  let trigger: JuggleTrigger | null = null;
  if (nx && nx.kind === 'breakdown' && ahead(nx)) trigger = 'break';
  else if (nx && (nx.kind === 'build' || nx.kind === 'pre-drop') && ahead(nx)) trigger = 'build';
  else if (ctx.phrasePosition >= 0.75 && ctx.phraseConfidence >= POLICY_MIN.phrase.phrase) trigger = 'phraseEnd';
  else if (ctx.targetEnergy - ctx.energy >= 0.15) trigger = 'energy';
  // Juggle Now: the moment is the user's request (a timing gate, skipped).
  else if (opts.skipTiming) trigger = 'request';
  if (!trigger) { why.push('no musical moment ahead (break, build, phrase end or energy lift)'); return null; }

  // The planner must have a pattern for the double, or loading one is for nothing.
  const decision = planJuggle(h, { mode, intensityOverride: opts.intensityOverride ?? -1, seed: opts.seed, skipTiming: opts.skipTiming });
  if (!decision.pattern) { why.push(`no pattern fits a double: ${decision.reason}`); return null; }

  let tease = !!next && next.compatible && ctx.transitionApproachingSec !== null && ctx.transitionApproachingSec <= NEXT_TEASE_MAX_SEC;
  if (tease) {
    // The pair that would play, judged by the planner's own conditions; any conflict means the double.
    const bad = next!.pair ? conditions(next!.pair).bad : ['the next track was not judged as a pair'];
    if (bad.length) { tease = false; why.push(`no tease of the next track: ${bad[0]}`); }
  }
  const source: StandaloneSource = tease ? 'next' : 'double';
  const what = source === 'double' ? 'a double of the playing track' : 'a tease of the next track';
  const moment = trigger === 'break' ? 'a breakdown ahead' : trigger === 'build' ? 'a build ahead' : trigger === 'phraseEnd' ? 'the phrase ends' : trigger === 'request' ? 'Juggle Now' : 'the set needs energy';
  return { trigger, source, startBeat, reason: `${trigger}: ${moment}, ${what} (${decision.pattern.type} fits)` };
}
