/**
 * The replayer's note (a period-table index, 1-84; the track transpose is 0 for a key) a MIDI key
 * plays. The grid shows the index itself as the note (the parser takes note + transpose as the
 * grid note), and shows grid note key - 11.
 */
export function dm2NoteForKey(midi: number): number {
  return Math.max(1, Math.min(84, midi - 11));
}
