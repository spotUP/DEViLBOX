/**
 * Gate E — the intention layer.
 *
 * The performer decides WHAT IT WANTS before it decides what to press:
 *
 *   music → condition → intention → target → move → gesture
 *
 * The old Auto Dub ran that chain backwards. A probability roll decided
 * whether anything happened at all (`if (rng() > rollProb) return null`), and
 * only then did a rule table pick a move. Two consequences, both audible:
 *
 *  1. Silence was never a decision. It was the residue of a failed dice roll,
 *     so it landed anywhere — mid-phrase, mid-build, one bar long — and never
 *     where dub actually wants it. Dub is a music of contrast; a version that
 *     never commits to space is just a wash.
 *  2. Nothing connected consecutive moves. Each tick re-rolled from scratch,
 *     so the performer could not answer the player, could not build toward a
 *     phrase edge, and could not decide to let a tail ring out.
 *
 * REST here is an explicit multi-bar commitment with a reason, taken in
 * advance and honoured until its bar arrives. Everything else is chosen from
 * what the music is doing, using the Gate D context — never from a dice roll.
 *
 * Pure: no stores, no engine, no randomness except what the caller injects.
 */

import type {
  Intention,
  IntentionTarget,
  PerformanceContext,
} from './performanceContext';
import { NO_TARGET } from './performanceContext';
import { axisOr } from './musicalChannelProfile';
import type { LookAheadWindow, MusicalEvent } from './musicalEvents';

/** What the performer decided, and why. The reason reaches the fire log. */
export interface IntentionDecision {
  intention: Intention;
  target: IntentionTarget;
  reason: string;
  /**
   * Bars this decision is committed for. REST uses it to stay silent across a
   * span instead of re-deciding every 250 ms tick; the others are free to be
   * revisited next tick.
   */
  holdBars: number;
}

/**
 * Tunables. Persona-level, so King Tubby's restraint and Mad Professor's
 * density differ in how long they rest and how eagerly they answer, without
 * either of them resting by accident.
 */
export interface IntentionPolicy {
  /** Bars a committed REST lasts. */
  restBars: number;
  /** Phrases of continuous activity before a REST is owed. */
  restEveryPhrases: number;
  /** Look-ahead window used to spot an event worth accenting. */
  accentWindow: LookAheadWindow;
  /** Minimum onset strength worth accenting. */
  accentStrength: number;
  /** Wet level above which the performer stops adding and gives it SPACE. */
  wetCeiling: number;
  /** Feedback level above which it must actively RESET rather than ride. */
  feedbackCeiling: number;
  /** Rows after a user's own move within which the performer ANSWERS it. */
  answerWithinRows: number;
  /** Rows of doing nothing after which TEXTURE is allowed to fill. */
  textureAfterRows: number;
}

export const DEFAULT_INTENTION_POLICY: IntentionPolicy = {
  restBars: 2,
  restEveryPhrases: 2,
  accentWindow: '1/8',
  accentStrength: 0.5,
  wetCeiling: 0.75,
  feedbackCeiling: 0.85,
  answerWithinRows: 8,
  textureAfterRows: 32,
};

/** A REST the performer has committed to, with the bar it runs until. */
interface RestCommitment {
  untilBar: number;
  reason: string;
}

/**
 * Chooses an intention each tick and remembers commitments between ticks.
 *
 * Small and mutable on purpose: a decision that cannot outlive the tick that
 * made it is not a decision, it is a coin toss with extra steps.
 */
export class IntentionPlanner {
  private policy: IntentionPolicy;
  private rest: RestCommitment | null = null;
  /** Phrase index of the last phrase the performer rested in. */
  private lastRestPhrase: number | null = null;

  constructor(policy: Partial<IntentionPolicy> = {}) {
    this.policy = { ...DEFAULT_INTENTION_POLICY, ...policy };
  }

  setPolicy(policy: Partial<IntentionPolicy>): void {
    this.policy = { ...this.policy, ...policy };
  }

  getPolicy(): IntentionPolicy {
    return this.policy;
  }

  /** Transport stop, seek, or song change: commitments no longer apply. */
  reset(): void {
    this.rest = null;
    this.lastRestPhrase = null;
  }

  /** True while a committed REST is still running. */
  isResting(bar: number): boolean {
    return this.rest !== null && bar < this.rest.untilBar;
  }

  /**
   * Decide what the performer wants right now.
   *
   * Order matters and is musical, not arbitrary: a commitment already made
   * outranks a new idea; safety outranks taste; something about to happen
   * outranks something that already did; and filling silence is the last
   * resort, not the default.
   */
  decide(ctx: PerformanceContext): IntentionDecision {
    const p = this.policy;
    const bar = Math.floor(ctx.position.bar);
    const phrase = Math.floor(ctx.position.phrase);

    // 1. A commitment already made. Honour it — this is what makes REST a
    //    decision rather than a gap between dice rolls.
    if (this.rest) {
      if (bar < this.rest.untilBar) {
        return decision('REST', NO_TARGET, this.rest.reason, this.rest.untilBar - bar);
      }
      this.lastRestPhrase = phrase;
      this.rest = null;
    }

    // 2. Safety before taste. Runaway feedback is not a texture to ride.
    if ((ctx.energy.feedback ?? 0) >= p.feedbackCeiling) {
      return decision('RESET', { kind: 'mix', reason: 'feedback at the ceiling' },
        'feedback would run away', 1);
    }

    // 3. An owed rest. Taken at a phrase edge so the silence lands where the
    //    music already has a seam, and never twice in consecutive phrases —
    //    contrast needs something to contrast with.
    if (this.owesRest(ctx, phrase)) {
      const untilBar = bar + Math.max(1, p.restBars);
      this.rest = { untilBar, reason: `${p.restEveryPhrases} phrases of activity — taking space` };
      this.lastRestPhrase = phrase;
      return decision('REST', NO_TARGET, this.rest.reason, untilBar - bar);
    }

    // 4. Too much wet already in the air: stop adding to it.
    if ((ctx.energy.wet ?? 0) >= p.wetCeiling || ctx.energy.gesturesInFlight >= 2) {
      return decision('SPACE', { kind: 'mix', reason: 'wet energy high' },
        'let what is ringing be heard', 1);
    }

    // 5. The player just did something. Answer it rather than talk over it.
    const userMove = this.lastUserMove(ctx);
    if (userMove) {
      return decision(
        'ANSWER',
        userMove.channelId !== undefined
          ? { kind: 'channel', channelId: userMove.channelId, reason: `answering ${userMove.moveId}` }
          : { kind: 'mix', reason: `answering ${userMove.moveId}` },
        `the player fired ${userMove.moveId} ${ctx.row - userMove.row} rows ago`,
        1,
      );
    }

    // 6. A seam in the arrangement, or the end of a phrase: mark it.
    if (this.atTransition(ctx)) {
      return decision('TRANSITION', { kind: 'mix', reason: 'phrase or pattern edge' },
        'the arrangement is about to turn', 1);
    }

    // 7. Something strong about to sound: accent it. This is the one that
    //    needs look-ahead — by the time a snare has sounded, accenting it is
    //    late.
    const accent = this.accentCandidate(ctx);
    if (accent) {
      return decision(
        'ACCENT',
        { kind: 'channel', channelId: accent.channel, reason: 'strong onset approaching' },
        `onset on channel ${accent.channel} in ${(accent.row - ctx.row).toFixed(2)} rows`,
        1,
      );
    }

    // 8. Second half of a phrase with the mix still dry: build toward the edge.
    if (ctx.position.positionInPhrase >= 0.5 && (ctx.energy.wet ?? 0) < p.wetCeiling * 0.5) {
      return decision('BUILD', { kind: 'mix', reason: 'second half of the phrase' },
        'building toward the phrase edge', 1);
    }

    // 9. It played something, then nothing for a while. Fill, quietly.
    //    `Infinity` means it has never acted at all — the opening of a song is
    //    not "a long silence to fill", it is the music getting started, and
    //    filling it was the old behaviour this gate exists to remove.
    if (Number.isFinite(ctx.rowsSinceLastAction) && ctx.rowsSinceLastAction >= p.textureAfterRows) {
      return decision('TEXTURE', { kind: 'mix', reason: 'nothing for a while' },
        `${Math.round(ctx.rowsSinceLastAction)} rows since the last move`, 1);
    }

    // 10. Default: listen. Not a failed roll — an active choice to let the
    //     music play, revisited next tick.
    return decision('REST', NO_TARGET, 'nothing worth doing yet', 1);
  }

  /**
   * An owed rest: `restEveryPhrases` phrases in a row have been busy, and a
   * phrase has just turned.
   *
   * The run is counted from the Gate D phrase history rather than from a
   * counter this class keeps, so it stays right across a reset, a seek, or a
   * planner created mid-song — and a phrase that was already silent breaks
   * the run by itself, which is what stops two rests landing back to back.
   */
  private owesRest(ctx: PerformanceContext, phrase: number): boolean {
    if (ctx.position.positionInPhrase >= 0.25) return false;
    // At least one whole phrase of playing between rests. The phrase history
    // alone cannot say this: a phrase that contained a two-bar rest AND a move
    // is recorded as busy, so without this the performer would rest again the
    // moment the previous rest expired — two rests with a bar of music wedged
    // between them, which reads as the performer having lost the thread.
    if (this.lastRestPhrase !== null && phrase - this.lastRestPhrase < 2) return false;
    let busyRun = 0;
    for (let i = ctx.phraseHistory.length - 1; i >= 0; i--) {
      if (ctx.phraseHistory[i].wasRest) break;
      busyRun++;
    }
    return busyRun >= Math.max(1, this.policy.restEveryPhrases);
  }

  private lastUserMove(ctx: PerformanceContext) {
    const floor = ctx.row - this.policy.answerWithinRows;
    for (let i = ctx.recentMoves.length - 1; i >= 0; i--) {
      const m = ctx.recentMoves[i];
      if (m.row <= floor) break;
      if (m.source === 'live') return m;
    }
    return null;
  }

  private atTransition(ctx: PerformanceContext): boolean {
    const nearBarEnd = ctx.position.positionInBar >= 0.75;
    const lastBarOfPhrase =
      Math.floor(ctx.position.barInPhrase) >= ctx.clockSettings.phraseBars - 1;
    if (nearBarEnd && lastBarOfPhrase) return true;
    const arrangement = ctx.arrangement;
    if (!arrangement) return false;
    return nearBarEnd && (arrangement.isLastInOrder || arrangement.patternChangesNext);
  }

  /**
   * The strongest onset inside the accent window, preferring channels whose
   * profile says they carry the backbeat. Confidence is respected: an
   * unconfident guess about a channel's role does not get to steer a move
   * (`axisOr` falls back rather than pretending).
   */
  private accentCandidate(ctx: PerformanceContext): MusicalEvent | null {
    const events = ctx.upcoming[this.policy.accentWindow];
    let best: MusicalEvent | null = null;
    let bestScore = 0;
    for (const event of events) {
      if (event.strength < this.policy.accentStrength) continue;
      const profile = event.profile ?? ctx.channelProfiles.get(event.channel);
      // `free` and `unknown` are the honest fallbacks when the axis is not
      // confident — the profile's own vocabulary, not invented values.
      const rhythm = profile ? axisOr(profile.rhythmicRole, 0.5, 'free') : 'free';
      const family = profile ? axisOr(profile.instrumentFamily, 0.5, 'unknown') : 'unknown';
      const bonus =
        (rhythm === 'backbeat' ? 0.4 : rhythm === 'downbeat' ? 0.2 : 0) +
        (family === 'drums' || family === 'percussion' ? 0.2 : 0);
      const score = event.strength + bonus;
      if (score > bestScore) { bestScore = score; best = event; }
    }
    return best;
  }
}

function decision(
  intention: Intention,
  target: IntentionTarget,
  reason: string,
  holdBars: number,
): IntentionDecision {
  return { intention, target, reason, holdBars: Math.max(1, holdBars) };
}
