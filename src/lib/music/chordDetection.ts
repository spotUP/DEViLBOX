/**
 * chordDetection - Detect common chord names from a set of MIDI note numbers.
 *
 * Strategy:
 *   1. Extract pitch classes (note % 12) and deduplicate.
 *   2. For each candidate root (try the lowest note first, then all others),
 *      compute the set of intervals above that root mod 12.
 *   3. Match against a table of common chord patterns.
 *   4. Return the first match, or "" if none found.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Chord pattern table.
 * Each entry: [suffix, sorted interval set (0-based, root excluded)]
 * Intervals are in semitones relative to the root.
 */
const CHORD_PATTERNS: Array<[string, number[]]> = [
  // Triads
  ['maj',   [4, 7]],
  ['m',     [3, 7]],
  ['dim',   [3, 6]],
  ['aug',   [4, 8]],
  ['sus2',  [2, 7]],
  ['sus4',  [5, 7]],
  // Seventh chords
  ['maj7',  [4, 7, 11]],
  ['m7',    [3, 7, 10]],
  ['7',     [4, 7, 10]],
  ['m7b5',  [3, 6, 10]],
  ['dim7',  [3, 6, 9]],
  ['mMaj7', [3, 7, 11]],
  // Added-note chords
  ['add9',  [2, 4, 7]],
  ['madd9', [2, 3, 7]],
  ['6',     [4, 7, 9]],
  ['m6',    [3, 7, 9]],
];

/**
 * Detect a chord name from a list of MIDI note numbers.
 *
 * @param midiNotes - Array of MIDI note numbers (0-127).
 * @returns Chord name string like "Cmaj7", "Am", "Bdim", or "" if unrecognized.
 */
export function detectChord(midiNotes: number[]): string {
  if (midiNotes.length < 2) return '';

  // Pitch classes, deduplicated
  const pitchClasses = [...new Set(midiNotes.map(n => ((n % 12) + 12) % 12))];
  if (pitchClasses.length < 2) return '';

  // Root candidates: try the lowest-pitched note first (most common convention),
  // then fall back to trying all pitch classes.
  const lowestNote = Math.min(...midiNotes);
  const lowestPc = ((lowestNote % 12) + 12) % 12;
  const roots = [lowestPc, ...pitchClasses.filter(pc => pc !== lowestPc)];

  for (const root of roots) {
    // Build set of intervals above root (mod 12, exclude unison)
    const intervals = pitchClasses
      .map(pc => ((pc - root) + 12) % 12)
      .filter(i => i !== 0)
      .sort((a, b) => a - b);

    for (const [suffix, pattern] of CHORD_PATTERNS) {
      if (
        intervals.length === pattern.length &&
        intervals.every((v, i) => v === pattern[i])
      ) {
        return NOTE_NAMES[root] + suffix;
      }
    }
  }

  return '';
}
