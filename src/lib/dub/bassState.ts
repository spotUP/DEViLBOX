/**
 * Is this a bass-feature moment?
 *
 * Phase 1 of `thoughts/shared/plans/2026-09-22-bass-as-musical-target.md`.
 *
 * The governing rule of that plan, and the reason this module exists at all:
 *
 * > Never boost bass merely because the bass is currently quiet.
 *
 * Quiet bass can be intentional. A dub engineer does not think "bass is low,
 * therefore raise it" — that is a tonal-balance corrector, and it is exactly
 * what this must not become. They think "I have taken the harmony away, the
 * bass is one of two things left, and this is the top of a phrase, so now the
 * low end becomes the gesture." The trigger is STRUCTURAL.
 *
 * So the opportunity test below is deliberately hard to pass, and its most
 * important property is that it can answer NO. Bass emphasis should be rare
 * and intentional; a version of this that fires often is broken even if every
 * individual decision looks defensible.
 *
 * Pure, like `dubTargetProfile`: it measures nothing itself. Identity comes
 * from the `DubTargetProfile` list, structure from `MusicalPosition`, and
 * history from the performance journal. Keeping it pure is what lets the
 * negative cases be tested without an audio graph.
 */

import type { DubTargetProfile } from './dubTargetProfile';
import type { MusicalPosition } from './musicalClock';
import type { JournalEntry } from './performanceJournal';

/**
 * A bass emphasis is a phrase-scale event, so two within this many bars is
 * repetition rather than performance. Sixteen bars is the default phrase
 * length, so this is "not twice in the same phrase, and not in the next one".
 */
export const BASS_EMPHASIS_COOLDOWN_BARS = 16;

/**
 * How near a phrase boundary counts as "at" it.
 *
 * Bass emphasis lands on the downbeat of a new phrase. A quarter of a bar
 * either side is close enough for a performer that decides on a tick rather
 * than exactly on the beat.
 */
const PHRASE_EDGE_BARS = 0.25;

/** Above this share of channels playing, the arrangement is not sparse. */
const SPARSE_ARRANGEMENT_RATIO = 0.5;

/**
 * A bass channel must score at least this on `bassEmphasis` to be one.
 *
 * Exported because the `bassEmphasis` move refuses any other target with the
 * same number: what counts as the low end has to be one definition, or the
 * opportunity test and the gesture can disagree about which channel they mean.
 */
export const BASS_TARGET_THRESHOLD = 0.6;

export interface BassState {
  /** Channels that read as the low end, best first. */
  channelIds: number[];
  /** Is any of them actually sounding? */
  audible: boolean;
  /** How much of the arrangement the bass carries, 0..1. */
  energy: number;
  /** How self-similar the bass figure is, 0..1. A riff, or a wandering line. */
  repetition: number;
  /** Is the arrangement already stripped back, so there is room to push? */
  currentlyExposed: boolean;
  /** Has a bass emphasis fired recently enough to make another one repetition? */
  recentlyEmphasised: boolean;
  /** How structurally significant this moment is, 0..1. */
  phraseImportance: number;
}

/** Everything the opportunity test needs that is not in `BassState`. */
export interface BassOpportunity {
  /** The verdict. */
  take: boolean;
  /** Why, in words — for the journal, and so a NO can be understood. */
  reason: string;
  /** Which channel to act on, when the answer is yes. */
  channelId: number | null;
}

/** Moves that count as a bass emphasis for the cooldown. */
const BASS_EMPHASIS_MOVES = new Set(['bassEmphasis', 'bassThrow', 'subSwell', 'subHarmonic']);

/**
 * Did the arrangement just get stripped back?
 *
 * These are the moves that REMOVE material. After one of them the bass is
 * exposed by the performer's own doing, which is the strongest reason there is
 * to then push it — the plan's "the bass boost becomes the payoff of the drop".
 */
const STRIPPING_MOVES = new Set(['versionDrop', 'riddimSection', 'masterDrop', 'channelMute']);

/** Bars between two rows, given the grid in force. */
function barsBetween(fromRow: number, toRow: number, rowsPerBar: number): number {
  if (!Number.isFinite(rowsPerBar) || rowsPerBar <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs(toRow - fromRow) / rowsPerBar;
}

/**
 * How structurally significant the current position is.
 *
 * A phrase boundary is the strongest; a bar line is weak on its own. Anything
 * mid-phrase is close to nothing, which is the point — an arbitrary 250 ms
 * tick is not a musical moment and must not read as one.
 */
export function phraseImportanceAt(position: MusicalPosition): number {
  const intoPhrase = position.positionInPhrase;
  const nearStart = intoPhrase <= PHRASE_EDGE_BARS / Math.max(1, position.rowsPerPhrase / position.rowsPerBar);
  // Distance to the nearest phrase edge, in phrases.
  const toEdge = Math.min(intoPhrase, 1 - intoPhrase);
  if (nearStart || toEdge < 0.03) return 1;
  if (position.barInPhrase === 0) return 0.8;
  // Halfway through a phrase is a secondary landmark — the classic 8-bar turn.
  if (Math.abs(intoPhrase - 0.5) < 0.03) return 0.6;
  if (position.positionInBar < 0.05) return 0.25;
  return 0.05;
}

/**
 * Build the bass picture from measurements taken elsewhere.
 *
 * `journal` is read newest-last, as `PerformanceJournal.entries` stores it.
 */
export function buildBassState(
  profiles: readonly DubTargetProfile[],
  position: MusicalPosition,
  journal: readonly JournalEntry[],
  currentRow: number,
): BassState {
  const bass = profiles
    .filter(p => p.targets.bassEmphasis >= BASS_TARGET_THRESHOLD)
    .slice()
    .sort((a, b) => b.targets.bassEmphasis - a.targets.bassEmphasis);

  const playing = profiles.filter(p => p.availability.playingNow);
  const audible = bass.some(p => p.availability.playingNow);

  // How much of what is sounding is the bass. Not a spectrum measurement —
  // the arrangement's weight, which is what decides whether there is room.
  const totalImportance = playing.reduce((n, p) => n + p.risks.arrangementImportance, 0);
  const bassImportance = bass
    .filter(p => p.availability.playingNow)
    .reduce((n, p) => n + p.risks.arrangementImportance, 0);
  const energy = totalImportance > 0 ? Math.min(1, bassImportance / totalImportance) : 0;

  const repetition = bass.length > 0
    ? bass.reduce((n, p) => n + p.identity.repetition, 0) / bass.length
    : 0;

  // Sparse means most of the arrangement is NOT sounding. A four-channel tune
  // with two channels playing is exposed; the same two out of sixteen is
  // exposed by a wide margin.
  const currentlyExposed = profiles.length > 0
    && playing.length / profiles.length <= SPARSE_ARRANGEMENT_RATIO;

  const rowsPerBar = position.rowsPerBar;
  const recentlyEmphasised = journal.some(e =>
    BASS_EMPHASIS_MOVES.has(e.moveId)
    && barsBetween(e.row, currentRow, rowsPerBar) < BASS_EMPHASIS_COOLDOWN_BARS,
  );

  return {
    channelIds: bass.map(p => p.channelId),
    audible,
    energy,
    repetition,
    currentlyExposed,
    recentlyEmphasised,
    phraseImportance: phraseImportanceAt(position),
  };
}

/**
 * Should the performer push the bass right now?
 *
 * Every NO carries its reason, because a performer that cannot explain why it
 * did nothing is indistinguishable from one that is broken — and because the
 * journal is what makes a long performance reviewable.
 *
 * The conditions are AND-ed on purpose. Any one of them alone is the
 * tonal-balance corrector this must not be.
 */
export function bassOpportunity(
  state: BassState,
  journal: readonly JournalEntry[],
  currentRow: number,
  rowsPerBar: number,
): BassOpportunity {
  const no = (reason: string): BassOpportunity => ({ take: false, reason, channelId: null });

  if (state.channelIds.length === 0) return no('no channel reads as the low end');
  if (!state.audible) return no('the bass is not sounding');
  if (state.recentlyEmphasised) {
    return no(`a bass emphasis fired within ${BASS_EMPHASIS_COOLDOWN_BARS} bars`);
  }

  // The payoff case: the performer has just taken material away, so the bass
  // is exposed BY ITS OWN DOING. This is the strongest reason there is, and it
  // does not need a phrase boundary — the drop was the structural event.
  const justStripped = journal.some(e =>
    STRIPPING_MOVES.has(e.moveId)
    && barsBetween(e.row, currentRow, rowsPerBar) <= 2,
  );
  if (justStripped && state.currentlyExposed) {
    return { take: true, reason: 'the arrangement was just stripped back', channelId: state.channelIds[0] };
  }

  if (state.phraseImportance < 0.6) {
    return no('not a structurally significant moment');
  }
  if (!state.currentlyExposed && state.energy < 0.5) {
    return no('the arrangement is full and the bass is not carrying it');
  }

  return {
    take: true,
    reason: state.currentlyExposed
      ? 'a sparse arrangement at a phrase boundary'
      : 'the bass is carrying the groove at a phrase boundary',
    channelId: state.channelIds[0],
  };
}
