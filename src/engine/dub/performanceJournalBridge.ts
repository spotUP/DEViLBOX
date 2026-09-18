/**
 * Wires the Gate M1 journal to the live `DubRouter` stream.
 *
 * Like the Gate D memory bridge, this listens to the ROUTER rather than to
 * AutoDub, so the journal covers the whole performance — the AI's moves and
 * the user's hands in one document, in the order they happened. A journal of
 * only the AI's decisions would describe half a conversation.
 *
 * The AI's reasoning is stamped on afterwards: the router knows what fired,
 * and only AutoDub knows why, so the origin decides whether a reason is
 * attached at all. A move the user made has no intention behind it to record,
 * and inventing one would be the worst kind of note.
 */

import { subscribeDubRouter, subscribeDubRelease } from './DubRouter';
import {
  PerformanceJournalRecorder,
  type PerformanceJournal,
} from '@/lib/dub/performanceJournal';

let _recorder: PerformanceJournalRecorder | null = null;
let _detach: (() => void) | null = null;

/**
 * What the performer was thinking at the moment of a fire.
 *
 * Supplied by AutoDub rather than imported from it — the journal must not
 * depend on the performer existing, because the user can play without it.
 */
export interface PerformanceAnnotation {
  intention?: string;
  target?: { kind: 'channel' | 'mix' | 'none'; channelId?: number; reason?: string };
  reason?: string;
  state?: string;
  bar?: number;
  barInPhrase?: number;
}

let _annotate: (() => PerformanceAnnotation | null) | null = null;

/** AutoDub registers a reader here; without one, journal entries carry no why. */
export function setPerformanceAnnotator(fn: (() => PerformanceAnnotation | null) | null): void {
  _annotate = fn;
}

export function getPerformanceJournalRecorder(): PerformanceJournalRecorder {
  if (!_recorder) {
    _recorder = new PerformanceJournalRecorder();
    attachPerformanceJournal(_recorder);
  }
  return _recorder;
}

export function attachPerformanceJournal(recorder: PerformanceJournalRecorder): () => void {
  const offFire = subscribeDubRouter(event => {
    // Only the AI's fires carry reasoning. A hand on a pad had an intention
    // too, but it is not one this program has any business guessing at.
    const annotation = event.origin === 'ai' ? _annotate?.() ?? null : null;
    recorder.record({
      invocationId: event.invocationId,
      moveId: event.moveId,
      channelId: event.channelId,
      row: event.row,
      timeSec: event.timeSec,
      origin: event.origin,
      intention: annotation?.intention as never,
      target: annotation?.target as never,
      reason: annotation?.reason,
      state: annotation?.state,
      bar: annotation?.bar,
      barInPhrase: annotation?.barInPhrase,
    });
  });
  const offRelease = subscribeDubRelease(event => {
    recorder.noteRelease(event.invocationId, event.row, event.timeSec);
  });
  const detach = () => { offFire(); offRelease(); };
  _detach = detach;
  return detach;
}

/** The journal as it stands — for saving, for MCP, for the Gate O1 monitor. */
export function getPerformanceJournal(): PerformanceJournal {
  return getPerformanceJournalRecorder().snapshot();
}

/** Start a clean take. */
export function clearPerformanceJournal(): void {
  _recorder?.clear();
}

export function resetPerformanceJournal(): void {
  _detach?.();
  _detach = null;
  _recorder = null;
  _annotate = null;
}

/**
 * Load a journal recorded in a previous session.
 *
 * Replaces whatever is in memory: a loaded project's journal describes THAT
 * performance, and merging it with the current session's would produce a
 * record of a take nobody played.
 */
export function loadPerformanceJournal(journal: PerformanceJournal): void {
  const recorder = getPerformanceJournalRecorder();
  recorder.clear();
  for (const entry of journal.entries) recorder.record({ ...entry });
}
