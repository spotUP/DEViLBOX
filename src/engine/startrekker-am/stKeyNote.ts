/**
 * The Amiga period a MOD keyboard key plays for StarTrekker AM, in the grid's naming (the parser
 * numbers notes from the period table's first entry, 856 = note 1; the grid shows note n for the
 * key MIDI n + 11, as for every Amiga format).
 */
const PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

/** Period of the grid note a key stands for (0 outside the replayer's three octaves). */
export function stPeriodForKey(midi: number): number {
  return PERIODS[midi - 11 - 1] ?? 0;
}
