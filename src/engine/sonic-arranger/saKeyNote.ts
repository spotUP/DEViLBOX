/**
 * The replayer's note (an index into its period table, 1-108) a MIDI key plays: the grid note is
 * key - 11 and the parser shows SA note - 36 (index 49 = period 856 = grid 13).
 */
export function saNoteForKey(midi: number): number {
  return Math.max(1, Math.min(108, midi + 25));
}
