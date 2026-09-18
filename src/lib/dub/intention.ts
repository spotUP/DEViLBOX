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
import { NO_TARGET, lastPhrase } from './performanceContext';
import { axisOr } from './musicalChannelProfile';
import type { ChannelEventSource, LookAheadWindow, MusicalEvent } from './musicalEvents';
import { findCallToAnswer, responseRow } from './callResponse';

/** What the performer decided, and why. The reason reaches the fire log. */
export interface IntentionDecision {
  intention: Intention;
  target: IntentionTarget;
  reason: string;
  /**
   * Absolute row of the event this intention is aimed at, when it is aimed at
   * one. Gate E3's machine waits for it instead of firing on the tick that
   * happened to notice — a tick is up to 250 ms wide, which at 140 BPM is most
   * of an eighth note away from the hit it meant to mark.
   */
  targetRow?: number;
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
  /** Rows of silence after a melodic phrase before it counts as a call the
   *  performer may answer (Gate K3). */
  callGapRows: number;
  /** 0..1 — how readily this performer takes the whole mix away. */
  dropAppetite: number;
  /**
   * Rows the performer waits between accents.
   *
   * How OFTEN it accents has to be its own dial. It was an accident of the
   * look-ahead window: a wider window always contains an upcoming onset, so
   * the personas that look furthest ahead accented every single cycle. The
   * Gate N1 simulator measured Jammy — the most restrained persona there is —
   * accenting 221 times against Perry's none, which is exactly backwards.
   * Anticipation decides how EARLY it commits; this decides how often.
   */
  accentSpacingRows: number;
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
  callGapRows: 4,
  accentSpacingRows: 12,
  dropAppetite: 0.5,
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
  /**
   * Injected randomness, so a run is reproducible from a seed and the
   * simulator measures the same performer the product runs.
   */
  private rng: () => number = Math.random;
  private rest: RestCommitment | null = null;
  /** Phrase index of the last phrase the performer rested in. */
  private lastRestPhrase: number | null = null;
  /** Phrase the last drop happened in — one drop per seam, not one per tick. */
  private lastDropPhrase: number | null = null;
  /**
   * A drop the performer has decided on but not yet carried out.
   *
   * A drop interrupts whatever is held, so the state machine releases first
   * and acts on the following decision. Without a commitment the intention has
   * already moved on by then and the drop never happens — the Gate N4 soak
   * measured 32 decisions and zero drops.
   */
  private dropCommitment: { fromRow: number; untilRow: number } | null = null;

  constructor(policy: Partial<IntentionPolicy> = {}, rng?: () => number) {
    this.policy = { ...DEFAULT_INTENTION_POLICY, ...policy };
    if (rng) this.rng = rng;
  }

  setRng(rng: () => number): void {
    this.rng = rng;
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
    this.lastDropPhrase = null;
    this.dropCommitment = null;
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
  decide(ctx: PerformanceContext, sources?: readonly ChannelEventSource[]): IntentionDecision {
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

    // 1b. A drop already decided on: hold the intention until it is carried
    //     out or the window passes. `recentMoves` tells us it happened.
    if (this.dropCommitment) {
      const fired = ctx.recentMoves.some(m => m.row >= this.dropCommitment!.fromRow);
      if (fired || ctx.row >= this.dropCommitment.untilRow) {
        this.dropCommitment = null;
      } else {
        return decision('DROP', { kind: 'mix', reason: 'the phrase has turned' },
          'taking the mix away at the seam', 1);
      }
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

    // 5b. The MUSIC just said something and left a gap. Answering a phrase in
    //     the space behind it is the oldest conversation in dub — and it is
    //     the gap that matters: answering while the call is still sounding is
    //     talking over it.
    if (sources && sources.length > 0) {
      const call = findCallToAnswer(sources, ctx.row, {
        gapRows: p.callGapRows,
        profiles: ctx.channelProfiles,
      });
      if (call) {
        return decision(
          'ANSWER',
          { kind: 'channel', channelId: call.channel, reason: call.reason },
          `answering the phrase on channel ${call.channel}`,
          1,
          responseRow(call),
        );
      }
    }

    // 6. A seam in the arrangement, or the end of a phrase: mark it.
    if (this.atTransition(ctx)) {
      return decision('TRANSITION', { kind: 'mix', reason: 'phrase or pattern edge' },
        'the arrangement is about to turn', 1);
    }

    // 7. Something strong about to sound: accent it. This is the one that
    //    needs look-ahead — by the time a snare has sounded, accenting it is
    //    late.
    // Accents are spaced. Marking every hit is not accenting, it is doubling
    // the drummer.
    const accent = ctx.rowsSinceLastAction >= p.accentSpacingRows
      ? this.accentCandidate(ctx)
      : null;
    if (accent) {
      return decision(
        'ACCENT',
        { kind: 'channel', channelId: accent.channel, reason: 'strong onset approaching' },
        `onset on channel ${accent.channel} in ${(accent.row - ctx.row).toFixed(2)} rows`,
        1,
        accent.row,
      );
    }

    // 8. The phrase has just turned and the one before it was busy: DROP.
    //
    // A build that leads nowhere is not a build. The classic arc is to
    // accumulate through the end of a phrase and take the mix away at the
    // seam, and without this branch the performer never dropped at all — the
    // Gate N4 soak counted zero DROPs in thirty minutes, with BUILD filling
    // half of every phrase instead.
    const previousPhrase = lastPhrase(ctx);
    if (ctx.position.positionInPhrase < 0.08
        && previousPhrase && !previousPhrase.wasRest
        && p.dropAppetite >= 0.4
        && this.lastDropPhrase !== phrase) {
      this.lastDropPhrase = phrase;
      // Hold the decision for up to a bar so the release-then-act sequence can
      // complete; `recentMoves` clears it as soon as something fires.
      this.dropCommitment = {
        fromRow: ctx.row,
        untilRow: ctx.row + ctx.position.rowsPerBar,
      };
      return decision('DROP', { kind: 'mix', reason: 'the phrase has turned' },
        'taking the mix away at the seam', Math.max(1, Math.round(p.dropAppetite * 2)));
    }

    // 9. Approaching the phrase edge with the mix still dry: build toward it.
    //
    // The LAST part of the phrase, not the whole second half. Building for
    // eight bars is not tension, it is the new normal — and it was what the
    // performer did with half of its time.
    if (ctx.position.positionInPhrase >= 0.7
        && ctx.position.positionInPhrase < 0.95
        && (ctx.energy.wet ?? 0) < p.wetCeiling * 0.6) {
      return decision('BUILD', { kind: 'mix', reason: 'approaching the phrase edge' },
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

  /**
   * The last move the PLAYER made, if it is recent enough to answer.
   *
   * `origin`, not `source`: the AI's own fires are 'live' too, so filtering on
   * source made the performer answer itself — measured with the Gate N1
   * simulator as accents clustering on whichever channel it had just used.
   */
  private lastUserMove(ctx: PerformanceContext) {
    const floor = ctx.row - this.policy.answerWithinRows;
    for (let i = ctx.recentMoves.length - 1; i >= 0; i--) {
      const m = ctx.recentMoves[i];
      if (m.row <= floor) break;
      if (m.origin === 'user') return m;
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
    // The channel the performer aimed at last time. Scoring alone is
    // deterministic, so the highest-scoring channel wins every single accent:
    // the Gate N1 simulator measured 57 of 82 accents landing on one snare.
    // An engineer accents the backbeat OFTEN, not exclusively, so the channel
    // just used gives way when something else is close behind it.
    const lastTarget = [...ctx.recentMoves].reverse()
      .find(m => m.channelId !== undefined)?.channelId;
    let best: MusicalEvent | null = null;
    let bestScore = 0;
    const scored: Array<{ event: MusicalEvent; score: number }> = [];
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
      const repeatPenalty = event.channel === lastTarget ? 0.3 : 0;
      const score = event.strength + bonus - repeatPenalty;
      if (score > bestScore) { bestScore = score; best = event; }
      scored.push({ event, score });
    }
    if (!best) return null;

    // Among the candidates that are nearly as good as the best, choose rather
    // than always taking the top.
    //
    // Scoring alone is deterministic, and fires land at a similar phase in
    // every bar, so the same hit was next every time: the Gate N1 simulator
    // measured 57 of 82 accents on ONE channel. An engineer accents the
    // backbeat often, not exclusively — and "often" is a distribution, which a
    // maximum cannot express.
    const contenders = scored.filter(c => c.score >= bestScore * 0.8);
    if (contenders.length <= 1) return best;
    const total = contenders.reduce((sum, c) => sum + c.score, 0);
    let roll = this.rng() * total;
    for (const candidate of contenders) {
      roll -= candidate.score;
      if (roll <= 0) return candidate.event;
    }
    return best;
  }
}

function decision(
  intention: Intention,
  target: IntentionTarget,
  reason: string,
  holdBars: number,
  targetRow?: number,
): IntentionDecision {
  return { intention, target, reason, holdBars: Math.max(1, holdBars), targetRow };
}
