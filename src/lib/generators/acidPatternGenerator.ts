/**
 * Acid Pattern Generator
 * Inspired by classic TB-303 programming techniques
 *
 * Generates random TB-303 style acid bassline patterns with:
 * - Configurable density (how many notes)
 * - Configurable spread (note range)
 * - Random accents and slides
 * - Multiple musical scales
 */

import type { TrackerCell } from '@typedefs/tracker';
import { midiToXMNote } from '@/lib/xmConversions';

// Musical scales (semitone intervals from root)
export type Scale =
  | 'MINOR'
  | 'MAJOR'
  | 'DORIAN'
  | 'MIXOLYDIAN'
  | 'PHRYGIAN'
  | 'HARMONIC_MINOR'
  | 'PHRYGIAN_DOMINANT'
  | 'MELODIC_MINOR'
  | 'LYDIAN_DOMINANT'
  | 'HUNGARIAN_MINOR';

// Runtime array of all scale values for iteration
export const ALL_SCALES: Scale[] = [
  'MINOR',
  'MAJOR',
  'DORIAN',
  'MIXOLYDIAN',
  'PHRYGIAN',
  'HARMONIC_MINOR',
  'PHRYGIAN_DOMINANT',
  'MELODIC_MINOR',
  'LYDIAN_DOMINANT',
  'HUNGARIAN_MINOR',
];

type ScaleIntervals = [number, number, number, number, number, number, number];

const SCALES: Record<Scale, ScaleIntervals> = {
  'MINOR': [0, 2, 3, 5, 7, 8, 10],
  'MAJOR': [0, 2, 4, 5, 7, 9, 11],
  'DORIAN': [0, 2, 3, 5, 7, 9, 10],
  'MIXOLYDIAN': [0, 2, 4, 5, 7, 9, 10],
  'PHRYGIAN': [0, 1, 3, 5, 7, 8, 10],
  'HARMONIC_MINOR': [0, 2, 3, 5, 7, 8, 11],
  'PHRYGIAN_DOMINANT': [0, 1, 4, 5, 7, 8, 10],
  'MELODIC_MINOR': [0, 2, 3, 5, 7, 9, 11],
  'LYDIAN_DOMINANT': [0, 2, 4, 6, 7, 9, 10],
  'HUNGARIAN_MINOR': [0, 2, 3, 6, 7, 8, 11],
};

export interface AcidPatternParams {
  patternLength?: number;     // Number of steps (default: 16)
  density?: number;            // 0-100: How many notes (default: 60)
  spread?: number;             // 0-100: Note range variety (default: 60)
  accentsDensity?: number;     // 0-100: How many accents (default: 50)
  slidesDensity?: number;      // 0-100: How many slides (default: 40)
  scale?: Scale;               // Musical scale (default: MINOR)
  rootNote?: string;           // Root note like "C2" (default: "C2")
  instrumentId?: number;       // Instrument to use (default: 0)
}

interface GeneratedStep {
  note: number | null;         // Scale degree (0-6)
  octave: -1 | 0 | 1 | null;   // Octave offset
  accent: boolean | null;
  slide: boolean | null;
}

/**
 * Random integer between min and max (inclusive)
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Randomly select n elements from array using Fisher-Yates shuffle
 */
function arrayRand<T>(arr: T[], count: number): T[] {
  const copy = [...arr];
  const result: T[] = [];
  const n = Math.min(count, arr.length);

  for (let i = 0; i < n; i++) {
    const randomIndex = Math.floor(Math.random() * (copy.length - i)) + i;
    [copy[i], copy[randomIndex]] = [copy[randomIndex], copy[i]];
    result.push(copy[i]);
  }

  return result;
}

/**
 * Convert scale degree + octave to MIDI note number
 */
function getNoteInScale(
  scaleDegree: number,
  scale: ScaleIntervals,
  rootMidi: number,
  octave: number
): number {
  return scale[scaleDegree] + rootMidi + (12 * octave);
}

/**
 * Convert note name to MIDI number
 */
function noteNameToMidi(noteName: string): number {
  const noteMap: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
    'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
  };

  // Parse note name (e.g., "C2", "F#3", "Bb1")
  const match = noteName.match(/^([A-G][b#]?)(-?\d+)$/);
  if (!match) {
    console.warn(`Invalid note name: ${noteName}, using C2`);
    return 36; // C2
  }

  const [, note, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);
  const baseNote = noteMap[note];

  if (baseNote === undefined) {
    console.warn(`Invalid note: ${note}, using C`);
    return 36; // C2
  }

  return baseNote + (octave + 1) * 12;
}


/**
 * Generate raw pattern steps
 */
function generateSteps(params: Required<Omit<AcidPatternParams, 'scale' | 'rootNote' | 'instrumentId'>>): GeneratedStep[] {
  const { patternLength, density, spread, accentsDensity, slidesDensity } = params;

  // Create array of all possible step positions
  const allSteps = Array.from({ length: patternLength }, (_, i) => i);

  // Calculate how many notes to generate based on density
  const seqDensity = Math.round(patternLength * (density / 100));
  const notesToGenerate = randomInt(Math.round(seqDensity / 2), seqDensity);

  // Randomly select which steps will have notes
  const selectedSteps = arrayRand(allSteps, notesToGenerate);

  // Randomly assign accents and slides to selected steps
  const maxAccents = Math.max(1, Math.round((notesToGenerate / 2) * (accentsDensity / 100)));
  const maxSlides = Math.round((notesToGenerate / 2) * (slidesDensity / 100));

  const accents = arrayRand(selectedSteps, randomInt(1, maxAccents));
  const slides = arrayRand(selectedSteps, randomInt(0, maxSlides));

  // Calculate note variety based on spread
  const scaleSize = 7; // 7 notes in scale
  const noteSpread = Math.round((scaleSize - 1) * (spread / 100));
  const availableScaleDegrees = Array.from({ length: scaleSize }, (_, i) => i);
  const selectedNotes = arrayRand(availableScaleDegrees, Math.max(1, noteSpread));

  // Some steps will use random notes from selectedNotes
  const randomNoteSteps = arrayRand(selectedSteps, randomInt(0, notesToGenerate));

  // Generate pattern
  return allSteps.map((stepIndex) => {
    // Empty step (rest)
    if (!selectedSteps.includes(stepIndex)) {
      return {
        note: null,
        octave: null,
        accent: null,
        slide: null,
      };
    }

    // Note step
    const octave = randomInt(-1, 1) as -1 | 0 | 1;
    const note = randomNoteSteps.includes(stepIndex) && selectedNotes.length > 0
      ? selectedNotes[randomInt(0, selectedNotes.length - 1)]
      : 0; // Default to root

    return {
      note,
      octave,
      accent: accents.includes(stepIndex),
      slide: slides.includes(stepIndex),
    };
  });
}

/**
 * Generate acid pattern and convert to tracker format
 */
export function generateAcidPattern(params: AcidPatternParams = {}): TrackerCell[] {
  // Default parameters
  const {
    patternLength = 16,
    density = 60,
    spread = 60,
    accentsDensity = 50,
    slidesDensity = 40,
    scale = 'MINOR',
    rootNote = 'C2',
    instrumentId = 1, // Default to instrument 1 (0 = no instrument)
  } = params;

  // Generate raw steps
  const steps = generateSteps({
    patternLength,
    density,
    spread,
    accentsDensity,
    slidesDensity,
  });

  // Get scale intervals and root MIDI note
  const scaleIntervals = SCALES[scale];
  const rootMidi = noteNameToMidi(rootNote);

  // Convert to tracker cells
  return steps.map((step): TrackerCell => {
    if (step.note === null || step.octave === null) {
      // Empty cell (rest)
      return {
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
        effTyp2: 0,
        eff2: 0,
      };
    }

    // Convert scale degree + octave to MIDI note
    const midiNote = getNoteInScale(step.note, scaleIntervals, rootMidi, step.octave);
    const xmNote = midiToXMNote(midiNote);

    // Generate volume (accented notes are louder)
    const baseVolume = 48; // 0x30
    const accentVolume = 64; // 0x40 (max)
    const volumeValue = step.accent ? accentVolume : randomInt(baseVolume, baseVolume + 8);
    const volume = 0x10 + volumeValue; // 0x10-0x50 = XM set volume range

    return {
      note: xmNote,
      instrument: instrumentId,
      volume,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0,
      accent: step.accent || false,
      slide: step.slide || false,
    };
  });
}

/**
 * Get friendly name for scale
 */
export function getScaleName(scale: Scale): string {
  const names: Record<Scale, string> = {
    'MINOR': 'Minor (Natural)',
    'MAJOR': 'Major',
    'DORIAN': 'Dorian',
    'MIXOLYDIAN': 'Mixolydian',
    'PHRYGIAN': 'Phrygian',
    'HARMONIC_MINOR': 'Harmonic Minor',
    'PHRYGIAN_DOMINANT': 'Phrygian Dominant',
    'MELODIC_MINOR': 'Melodic Minor',
    'LYDIAN_DOMINANT': 'Lydian Dominant',
    'HUNGARIAN_MINOR': 'Hungarian Minor',
  };
  return names[scale];
}
