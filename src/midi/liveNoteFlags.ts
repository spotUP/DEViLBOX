/**
 * Live MIDI note conventions for 303-style playing (matches TB-3PO / schwung-303):
 *   - Accent: velocity >= 100 triggers the accent envelope.
 *   - Slide: a note-on arriving while another note is still held (legato
 *     overlap) slides to the new pitch without retriggering envelopes.
 *     Only meaningful in monophonic mode.
 */

export const LIVE_ACCENT_VELOCITY_THRESHOLD = 100;

export interface LiveNoteFlags {
  accent: boolean;
  slide: boolean;
}

/**
 * @param velocity raw MIDI velocity 0-127
 * @param heldNoteCount notes already held BEFORE this note-on
 * @param polyphonic true when the engine plays polyphonically (no slide)
 */
export function deriveLiveNoteFlags(
  velocity: number,
  heldNoteCount: number,
  polyphonic: boolean
): LiveNoteFlags {
  return {
    accent: velocity >= LIVE_ACCENT_VELOCITY_THRESHOLD,
    slide: !polyphonic && heldNoteCount > 0,
  };
}
