/**
 * liveWindow.ts - live preview from sliding windows of the take so far.
 * Advisory only: the full-take pass replaces it at take end.
 */
import { PITCH_SAMPLE_RATE, type VoiceNote } from './pitchNotes';
import type { PitchRange, PitchTracker } from './pitchTrack';
import { shapeNotes, type NoteShaping } from './voiceToNotes';

export const LIVE_WINDOW_SECONDS = 1.5;
export const LIVE_HOP_SECONDS = 0.25;

/**
 * Merge notes found in a window into the preview: notes that ended before the
 * window began are final and kept; everything from the window start on is
 * replaced by the window's notes (shifted to take time).
 */
export function mergeWindowNotes(
  previous: readonly VoiceNote[],
  windowNotes: readonly VoiceNote[],
  windowStartSeconds: number,
): VoiceNote[] {
  const settled = previous.filter(
    (n) => n.startTimeSeconds + n.durationSeconds <= windowStartSeconds,
  );
  const shifted = windowNotes.map((n) => ({
    ...n,
    startTimeSeconds: n.startTimeSeconds + windowStartSeconds,
  }));
  return [...settled, ...shifted];
}

/** Track the last window of `take`, shape it like the full take and merge into `previous`. */
export async function previewStep(
  take: Float32Array,
  previous: readonly VoiceNote[],
  tracker: PitchTracker,
  shaping: NoteShaping,
  range?: PitchRange,
): Promise<VoiceNote[]> {
  const windowLen = Math.round(LIVE_WINDOW_SECONDS * PITCH_SAMPLE_RATE);
  const from = Math.max(0, take.length - windowLen);
  const track = await tracker.track(take.subarray(from), range);
  const notes = shapeNotes(track, shaping);
  return mergeWindowNotes(previous, notes, from / PITCH_SAMPLE_RATE);
}
