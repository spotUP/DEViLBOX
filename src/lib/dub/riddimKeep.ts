/**
 * Which channel a riddim breakdown must NOT mute.
 *
 * A riddim is drums AND BASS. `riddimSection` mutes every channel whose ROLE
 * is melodic, which is correct only while the roles are. Measured 2026-09-22
 * on `world class dub.mod`, the roles are:
 *
 *     ["pad", "percussion", "pad", "percussion"]     names: Pad 1, Snare, Pad 2, Kick
 *
 * No channel is labelled `bass` at all, so the move muted both "pads" — one of
 * which is the bass line: channel 0 reads pitch 34-39, monophonic, 24 onsets
 * at density 0.375. The owner heard the result and said exactly what it was:
 * "i only heard drums no bass".
 *
 * Rather than wait for role detection to be perfect, the move guarantees its
 * own musical invariant: if nothing on the channel list is already going to
 * survive as bass, keep the lowest-register melodic channel. A riddim without
 * its bass is not a riddim, and the register is evidence the labels are not.
 */

/** The little a caller has to know about a channel to make this decision. */
export interface RiddimChannelPitch {
  channelIndex: number;
  /** Median MIDI-ish note number across the song, or null when silent. */
  medianNote: number | null;
}

/**
 * Highest note still considered bass register.
 *
 * MOD note 48 is C-4 in DEViLBOX's 1-96 numbering. Amiga basslines sit well
 * below it — the measured one medians at 37 — while skanks, leads and pads sit
 * above. Picked as a ceiling, not a divider: it only has to exclude parts no
 * one would call the bass.
 */
export const BASS_REGISTER_CEILING = 48;

/**
 * The melodic channel to spare, or null when the breakdown already keeps a
 * bass (a channel labelled `bass` was never a mute candidate in the first
 * place, so the caller passes only the ones it intends to mute).
 *
 * @param candidates the channels the move is about to mute
 * @param bassSurvives true when some channel outside `candidates` is bass
 */
export function riddimChannelToKeep(
  candidates: readonly RiddimChannelPitch[],
  bassSurvives: boolean,
): number | null {
  // Something already holds the bottom end — mute the lot, as before.
  if (bassSurvives) return null;
  if (candidates.length <= 1) return null; // muting nothing, or the only part

  let keep: RiddimChannelPitch | null = null;
  for (const c of candidates) {
    if (c.medianNote === null) continue;                 // silent: not the bass
    if (c.medianNote > BASS_REGISTER_CEILING) continue;  // too high to be the bass
    // Lowest wins; ties go to the earlier channel, which is stable across runs.
    if (keep === null || c.medianNote < keep.medianNote!) keep = c;
  }
  return keep ? keep.channelIndex : null;
}

/** Median of the notes actually played, or null when the channel is silent. */
export function medianNoteOf(notes: readonly number[]): number | null {
  const played = notes.filter((n) => n > 0 && n < 97).sort((a, b) => a - b);
  if (played.length === 0) return null;
  const mid = played.length >> 1;
  return played.length % 2 === 1
    ? played[mid]
    : Math.round((played[mid - 1] + played[mid]) / 2);
}
