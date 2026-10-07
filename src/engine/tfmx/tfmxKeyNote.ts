/**
 * The TFMX note (0-63, the pattern note byte) a MIDI key plays: the grid shows note + 13 for the byte
 * (TFMXParser.tfmxNoteToXM) and the key stands for grid note key - 11.
 */
export function tfmxNoteForKey(midi: number): number {
  return Math.max(0, Math.min(63, midi - 24));
}
