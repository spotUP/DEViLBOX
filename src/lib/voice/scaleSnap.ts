/**
 * scaleSnap.ts - move detected pitches onto the notes of a key.
 *
 * Pure. A sung note between two scale notes goes to the nearer one; an exact
 * tie goes to the lower note.
 */
import type { VoiceNote } from './pitchNotes';

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
} as const;

export type ScaleName = keyof typeof SCALES;

export const SCALE_LABELS: Record<ScaleName, string> = {
  major: 'Major',
  minor: 'Minor',
  dorian: 'Dorian',
  mixolydian: 'Mixolydian',
  pentatonicMajor: 'Major Pentatonic',
  pentatonicMinor: 'Minor Pentatonic',
};

export const TONIC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export interface KeySnap {
  /** Pitch class of the key's first note, 0 = C */
  tonic: number;
  scale: ScaleName;
}

/** The nearest MIDI note that belongs to the key. */
export function snapMidiToKey(midi: number, key: KeySnap): number {
  const degrees: readonly number[] = SCALES[key.scale];
  const inKey = (m: number) => degrees.includes((((m - key.tonic) % 12) + 12) % 12);
  for (let d = 0; d <= 6; d++) {
    if (inKey(midi - d)) return midi - d;
    if (inKey(midi + d)) return midi + d;
  }
  return midi;
}

export function snapNotesToKey<T extends VoiceNote>(notes: readonly T[], key: KeySnap): T[] {
  return notes.map((n) => ({ ...n, pitchMidi: snapMidiToKey(n.pitchMidi, key) }));
}
