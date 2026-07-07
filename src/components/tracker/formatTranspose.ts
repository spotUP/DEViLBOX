/**
 * Note transposition rule shared by the format-mode pattern editor.
 *
 * Format editors (Furnace, JamCracker, SF2, GTUltra, MusicLine) store notes as 1-based
 * values where 0 = empty and values >= 0xBD are note-off / special rows. Transposition must
 * skip those and clamp the result to the playable range [1, 0xBC].
 *
 * Returns the new note value, or null when the cell should be left untouched (empty,
 * note-off/special, or the shift is a no-op after clamping).
 */
export const FORMAT_NOTE_MIN = 1;
export const FORMAT_NOTE_MAX = 0xbc; // 188 — last playable note; >= 0xBD is note-off/special

export function transposeFormatNote(note: number, semitones: number): number | null {
  if (!(note >= FORMAT_NOTE_MIN && note <= FORMAT_NOTE_MAX)) return null;
  const next = Math.max(FORMAT_NOTE_MIN, Math.min(FORMAT_NOTE_MAX, note + semitones));
  return next === note ? null : next;
}
