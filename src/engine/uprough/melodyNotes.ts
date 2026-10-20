/**
 * The Up Rough melody decision: tools/hiphop.py `melody_bar_notes` and its helpers `_snap_to_scale`, `_snap_to_chord`
 * and `_scale_step` (plan 2026-10-19 O6h). The motif is transposed by the bar's chord root (roots above 6 fold down an
 * octave), every note is snapped to the key, and the bar-final note takes the repeat variation (one scale degree up on
 * odd variations, two down on even ones) and is then held off a minor 2nd, tritone or major 7th over the chord.
 *
 * The host reads the chord through STYLES[style].harmony; the song file does not carry the harmony, so the caller passes
 * the chord intervals (CHORDS[harmony], min7 when the name is unknown). Python's % and // floor on negatives; mod() and
 * Math.floor mirror them. Parity fixture: tools/softsynth-fixtures/gen_song_melody.py.
 */
import type { MelodyBarNote } from './voices/melodyBar';

/** hiphop.MODES: scale degrees in semitones per mode. */
export const MODES: Readonly<Record<string, readonly number[]>> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  minor_pent: [0, 3, 5, 7, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

/** hiphop.CHORDS: chord voicings as intervals over the root, per harmonic language. */
export const CHORDS: Readonly<Record<string, readonly number[]>> = {
  min7: [0, 3, 7, 10],
  min9: [0, 3, 7, 10, 14],
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  add9: [0, 4, 7, 14],
  sus: [0, 5, 7, 10],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  dom9: [0, 4, 7, 10, 14],
  min11: [0, 3, 7, 10, 17],
  min13: [0, 3, 7, 10, 21],
};

/** hiphop._DISSONANT_OVER_CHORD: minor 2nd, tritone, major 7th. */
const DISSONANT_OVER_CHORD: readonly number[] = [1, 6, 11];
const CHORD_OFFSETS: readonly number[] = [-1, 1, -2, 2, -3, 3, -4, 4, -5, 5, 6];

/** Python's a % b (sign of b). */
const mod = (a: number, b: number): number => ((a % b) + b) % b;

const modeIntervals = (mode: string | null): readonly number[] | null => {
  const ivs = mode === null ? undefined : MODES[mode];
  return ivs && ivs.length ? ivs : null;
};

/** hiphop._snap_to_scale: the nearest scale note, the lower one on a tie; unchanged when the mode is unknown. */
export function snapToScale(semi: number, tonic: number, mode: string | null): number {
  const ivs = modeIntervals(mode);
  if (!ivs) return semi;
  const pc = mod(semi - tonic, 12);
  if (ivs.includes(pc)) return semi;
  const below = ivs.filter((v) => v < pc);
  const above = ivs.filter((v) => v > pc);
  if (!below.length) return semi + (Math.min(...above) - pc);
  const lo = Math.max(...below);
  if (!above.length) return semi + (lo - pc);
  const hi = Math.min(...above);
  return semi + ((pc - lo) <= (hi - pc) ? lo - pc : hi - pc);
}

/** hiphop._snap_to_chord: the nearest chord tone, only when `semi` clashes with the chord root. */
export function snapToChord(semi: number, chordRoot: number, intervals: readonly number[]): number {
  if (!intervals.length) return semi;
  if (!DISSONANT_OVER_CHORD.includes(mod(semi - chordRoot, 12))) return semi;
  const tones = new Set(intervals.map((i) => mod(chordRoot + i, 12)));
  if (tones.has(mod(semi, 12))) return semi;
  for (const off of CHORD_OFFSETS) if (tones.has(mod(semi + off, 12))) return semi + off;
  return semi;
}

/** hiphop._scale_step: move `steps` scale degrees; `steps` semitones when the mode is unknown. */
export function scaleStep(semi: number, tonic: number, mode: string | null, steps: number): number {
  const ivs = modeIntervals(mode);
  if (!ivs) return semi + steps;
  const snapped = snapToScale(semi, tonic, mode);
  const pc = mod(snapped - tonic, 12);
  const octBase = snapped - pc;
  const idx = Math.max(ivs.indexOf(pc), 0);
  const j = idx + steps;
  return octBase + ivs[mod(j, ivs.length)]! + 12 * Math.floor(j / ivs.length);
}

export interface MelodyBarNotesOptions {
  /** The bar index (render_section passes variation=b); 0 leaves the bar-final note as the motif drew it. */
  variation: number;
  chordRoot: number;
  mode: string | null;
  tonic: number;
  /** CHORDS[STYLES[style].harmony], CHORDS.min7 when the harmony is unknown. */
  chordIntervals: readonly number[];
}

/** hiphop.melody_bar_notes: the notes one bar plays. */
export function melodyBarNotes(motif: readonly MelodyBarNote[], o: MelodyBarNotesOptions): MelodyBarNote[] {
  return motif.map((n, i) => {
    let semi = n.semi + (o.chordRoot > 6 ? o.chordRoot - 12 : o.chordRoot);
    semi = snapToScale(semi, o.tonic, o.mode);
    if (i === motif.length - 1) {
      if (o.variation) semi = scaleStep(semi, o.tonic, o.mode, mod(o.variation, 2) ? 1 : -2);
      semi = snapToChord(semi, o.tonic + o.chordRoot, o.chordIntervals);
    }
    return { semi, step: n.step, durSteps: n.durSteps };
  });
}
