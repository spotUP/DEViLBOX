/**
 * liveWindow.ts - live preview from sliding windows of the take so far.
 * Advisory only: the full-take pass replaces it at take end.
 */
import { PITCH_SAMPLE_RATE, type VoiceNote } from './pitchNotes';
import { trackRange, type PitchTracker } from './pitchTrack';
import { shapeNotes, type NoteShaping } from './voiceToNotes';

export const LIVE_WINDOW_SECONDS = 1.5;
export const LIVE_HOP_SECONDS = 0.25;
/** The window starts this far before the onset of a note it would cut, so the onset frame is inside. */
const ONSET_MARGIN_SECONDS = 0.05;

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

/**
 * Track the last window of `take`, shape it like the full take and merge into
 * `previous`. A previous note still sounding at the window start would be cut
 * there and re-heard with a late onset, so the window reaches back to just
 * before that note's onset.
 */
export async function previewStep(
  take: Float32Array,
  previous: readonly VoiceNote[],
  tracker: PitchTracker,
  shaping: NoteShaping,
): Promise<VoiceNote[]> {
  const windowLen = Math.round(LIVE_WINDOW_SECONDS * PITCH_SAMPLE_RATE);
  let fromSeconds = Math.max(0, take.length - windowLen) / PITCH_SAMPLE_RATE;
  const cut = previous.find((n) => n.startTimeSeconds < fromSeconds && n.startTimeSeconds + n.durationSeconds > fromSeconds);
  if (cut) {
    // Not into the note before it, which stays settled
    const before = previous.reduce(
      (end, n) => (n.startTimeSeconds + n.durationSeconds <= cut.startTimeSeconds ? Math.max(end, n.startTimeSeconds + n.durationSeconds) : end),
      0,
    );
    fromSeconds = Math.max(before, cut.startTimeSeconds - ONSET_MARGIN_SECONDS);
  }
  const from = Math.round(fromSeconds * PITCH_SAMPLE_RATE);
  const track = await tracker.track(take.subarray(from), trackRange(shaping));
  const notes = shapeNotes(track, shaping);
  return mergeWindowNotes(previous, notes, from / PITCH_SAMPLE_RATE);
}
