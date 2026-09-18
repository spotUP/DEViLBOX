/**
 * Gate K3 — call and response over musical time.
 *
 * Gate E can answer the PLAYER (a move the user just fired). This answers the
 * MUSIC: a melodic phrase finishes, a gap opens behind it, and the engineer
 * fills that gap — the oldest conversation in dub, and the reason a version
 * sounds like two musicians rather than one player and one effects unit.
 *
 * The important part is the GAP, not the phrase. Answering while the call is
 * still sounding is talking over it; answering four bars later is not an
 * answer at all. So a call is only a call once it has stopped, and the window
 * to respond in is bounded by the next thing that channel does.
 *
 * Pure: onsets in, a response window out. No stores, no engine, no clock of
 * its own beyond the grid it is handed.
 */

import type { ChannelEventSource } from './musicalEvents';
import type { MusicalChannelProfile } from './musicalChannelProfile';
import { axisOr } from './musicalChannelProfile';

export interface CallResponse {
  /** Channel that made the call. */
  channel: number;
  /** Row of the last onset in the call. */
  callEndRow: number;
  /** First row the response may land on. */
  windowStartRow: number;
  /** Last row it may land on — the call's next onset, or the window limit. */
  windowEndRow: number;
  /** Onsets in the call. A single hit is not a phrase. */
  callLength: number;
  reason: string;
}

export interface CallResponseOptions {
  /** Rows of silence after the last onset before a phrase counts as finished. */
  gapRows: number;
  /** Minimum onsets for something to count as a call rather than a stray hit. */
  minCallLength?: number;
  /** How long the response window stays open, in rows. */
  windowRows?: number;
  /** Profiles, so only voices are treated as callers. */
  profiles?: ReadonlyMap<number, MusicalChannelProfile>;
  /** Confidence below which a profile does not get to rule a channel out. */
  minConfidence?: number;
}

/**
 * Find a call the performer could answer right now.
 *
 * Returns the most recent qualifying call whose response window contains
 * `row`, or null. Null is the normal case: most of the time the music is
 * mid-phrase and there is nothing to answer.
 */
export function findCallToAnswer(
  sources: readonly ChannelEventSource[],
  row: number,
  options: CallResponseOptions,
): CallResponse | null {
  const gapRows = Math.max(1, options.gapRows);
  const minCallLength = options.minCallLength ?? 2;
  const windowRows = options.windowRows ?? gapRows * 2;
  const minConfidence = options.minConfidence ?? 0.5;

  let best: CallResponse | null = null;

  for (const source of sources) {
    const profile = source.profile ?? options.profiles?.get(source.channel);
    if (profile && !isVoice(profile, minConfidence)) continue;

    const onsets = source.onsets
      .map(o => o.row)
      .filter(r => Number.isFinite(r))
      .sort((a, b) => a - b);
    if (onsets.length < minCallLength) continue;

    // Walk the onsets that have already happened, looking for the last one
    // followed by a gap. Onsets after `row` have not sounded yet and cannot be
    // part of a call — they are what the window has to end before.
    let callEndRow: number | null = null;
    let callLength = 0;
    let nextOnsetAfterCall: number | null = null;

    for (let i = 0; i < onsets.length; i++) {
      const onset = onsets[i];
      if (onset > row) { if (callEndRow !== null && nextOnsetAfterCall === null) nextOnsetAfterCall = onset; break; }
      const next = onsets[i + 1];
      const gapAfter = next === undefined ? Infinity : next - onset;
      if (gapAfter >= gapRows) {
        callEndRow = onset;
        callLength = countCall(onsets, i, gapRows);
        nextOnsetAfterCall = next ?? null;
      }
    }

    if (callEndRow === null || callLength < minCallLength) continue;

    const windowStartRow = callEndRow + gapRows;
    const hardEnd = callEndRow + gapRows + windowRows;
    const windowEndRow = nextOnsetAfterCall !== null
      ? Math.min(hardEnd, nextOnsetAfterCall)
      : hardEnd;

    // The window has to be open NOW, and it has to be a window: a call whose
    // next onset lands immediately after the gap leaves nothing to answer in.
    if (row < windowStartRow || row >= windowEndRow) continue;

    const candidate: CallResponse = {
      channel: source.channel,
      callEndRow,
      windowStartRow,
      windowEndRow,
      callLength,
      reason: `${callLength} onsets on channel ${source.channel}, then a gap`,
    };
    // Prefer the most recent call — the conversation is with whatever just
    // spoke, not with whichever channel happens to come first in the array.
    if (!best || candidate.callEndRow > best.callEndRow) best = candidate;
  }

  return best;
}

/**
 * Where in the window the response should land.
 *
 * Not at the very start: an answer that begins the instant the gap opens is
 * still overlapping the call's decay. A third of the way in leaves the call
 * room to finish and still lands well before the next phrase begins.
 */
export function responseRow(call: CallResponse): number {
  const span = call.windowEndRow - call.windowStartRow;
  return call.windowStartRow + span / 3;
}

/** Only voices call. A kick pattern is not a phrase awaiting an answer. */
function isVoice(profile: MusicalChannelProfile, minConfidence: number): boolean {
  const fn = axisOr(profile.musicalFunction, minConfidence, 'unknown');
  if (fn === 'foundation' || fn === 'groove') return false;
  const family = axisOr(profile.instrumentFamily, minConfidence, 'unknown');
  if (family === 'drums' || family === 'percussion') return false;
  return true;
}

/** How many onsets belong to the call ending at `endIndex`. */
function countCall(onsets: readonly number[], endIndex: number, gapRows: number): number {
  let count = 1;
  for (let i = endIndex; i > 0; i--) {
    if (onsets[i] - onsets[i - 1] >= gapRows) break;
    count++;
  }
  return count;
}
