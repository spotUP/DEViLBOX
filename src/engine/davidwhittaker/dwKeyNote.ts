/** The replayer's note (an index into its period table) a MIDI key plays: grid note = key - 11, grid = index + 25. */
export function dwNoteForKey(midi: number): number {
  return Math.max(0, Math.min(0x7f, midi - 36));
}
