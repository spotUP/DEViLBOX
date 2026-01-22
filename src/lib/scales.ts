/**
 * Musical scales and scale filtering utilities
 */

export interface Scale {
  name: string;
  intervals: number[]; // Semitone intervals from root note
  description?: string;
}

// Common musical scales (intervals are semitones from root)
export const SCALES: Record<string, Scale> = {
  chromatic: {
    name: 'Chromatic',
    intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    description: 'All notes',
  },
  major: {
    name: 'Major',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    description: 'Ionian mode',
  },
  minor: {
    name: 'Natural Minor',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    description: 'Aeolian mode',
  },
  harmonicMinor: {
    name: 'Harmonic Minor',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    description: 'Minor with raised 7th',
  },
  melodicMinor: {
    name: 'Melodic Minor',
    intervals: [0, 2, 3, 5, 7, 9, 11],
    description: 'Minor with raised 6th and 7th',
  },
  dorian: {
    name: 'Dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    description: 'Minor with raised 6th',
  },
  phrygian: {
    name: 'Phrygian',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    description: 'Minor with lowered 2nd',
  },
  lydian: {
    name: 'Lydian',
    intervals: [0, 2, 4, 6, 7, 9, 11],
    description: 'Major with raised 4th',
  },
  mixolydian: {
    name: 'Mixolydian',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    description: 'Major with lowered 7th',
  },
  locrian: {
    name: 'Locrian',
    intervals: [0, 1, 3, 5, 6, 8, 10],
    description: 'Diminished scale',
  },
  pentatonicMajor: {
    name: 'Pentatonic Major',
    intervals: [0, 2, 4, 7, 9],
    description: '5-note major scale',
  },
  pentatonicMinor: {
    name: 'Pentatonic Minor',
    intervals: [0, 3, 5, 7, 10],
    description: '5-note minor scale',
  },
  blues: {
    name: 'Blues',
    intervals: [0, 3, 5, 6, 7, 10],
    description: 'Minor pentatonic + blue note',
  },
  wholeTone: {
    name: 'Whole Tone',
    intervals: [0, 2, 4, 6, 8, 10],
    description: 'All whole steps',
  },
  diminished: {
    name: 'Diminished',
    intervals: [0, 2, 3, 5, 6, 8, 9, 11],
    description: 'Half-whole diminished',
  },
};

/**
 * Check if a note index is in a scale
 * @param noteIndex - Note index (0-11, C=0)
 * @param rootNote - Root note index (0-11, C=0)
 * @param scale - Scale definition
 */
export function isNoteInScale(noteIndex: number, rootNote: number, scale: Scale): boolean {
  // Validate input ranges
  if (noteIndex < 0 || noteIndex > 11) {
    console.error('noteIndex must be 0-11, got:', noteIndex);
    return false;
  }
  if (rootNote < 0 || rootNote > 11) {
    console.error('rootNote must be 0-11, got:', rootNote);
    return false;
  }

  // Calculate interval from root
  const interval = (noteIndex - rootNote + 12) % 12;
  return scale.intervals.includes(interval);
}

/**
 * Get all note indices that are in a scale
 * @param rootNote - Root note index (0-11, C=0)
 * @param scale - Scale definition
 */
export function getScaleNotes(rootNote: number, scale: Scale): number[] {
  // Validate input range
  if (rootNote < 0 || rootNote > 11) {
    console.error('rootNote must be 0-11, got:', rootNote);
    return [];
  }

  return scale.intervals.map((interval) => (rootNote + interval) % 12);
}

/**
 * Get scale name options for dropdown
 */
export function getScaleOptions(): Array<{ value: string; label: string; description?: string }> {
  return Object.entries(SCALES).map(([key, scale]) => ({
    value: key,
    label: scale.name,
    description: scale.description,
  }));
}
