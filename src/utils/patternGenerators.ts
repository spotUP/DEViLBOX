/**
 * Pattern Generators - Utility functions for generating common patterns
 * Used by channel context menus for quick pattern fills
 */

import type { TrackerCell, NoteValue } from '@typedefs/tracker';

export interface GeneratorOptions {
  patternLength: number;
  instrumentId: number;
  note: NoteValue;
  velocity?: number; // 0-64 (0x40)
  accent?: boolean;
}

// Create an empty cell
const emptyCell = (): TrackerCell => ({
  note: null,
  instrument: null,
  volume: null,
  effect: null,
});

// Create a note cell
const noteCell = (
  note: NoteValue,
  instrument: number,
  volume: number = 0x40,
  accent: boolean = false
): TrackerCell => ({
  note,
  instrument,
  volume,
  effect: null,
  accent,
});

/**
 * Generate 4/4 kick pattern (every 4 rows)
 * Classic house/techno beat on 1, 2, 3, 4
 */
export function generate4on4(opts: GeneratorOptions): TrackerCell[] {
  const { patternLength, instrumentId, note, velocity = 0x40, accent } = opts;
  const cells: TrackerCell[] = [];

  for (let i = 0; i < patternLength; i++) {
    if (i % 4 === 0) {
      // Accent on downbeat (every 16 rows)
      const isDownbeat = i % 16 === 0;
      cells.push(noteCell(note, instrumentId, velocity, accent || isDownbeat));
    } else {
      cells.push(emptyCell());
    }
  }

  return cells;
}

/**
 * Generate offbeat pattern (every 4 rows, offset by 2)
 * Classic hi-hat offbeat
 */
export function generateOffbeat(opts: GeneratorOptions): TrackerCell[] {
  const { patternLength, instrumentId, note, velocity = 0x38, accent } = opts;
  const cells: TrackerCell[] = [];

  for (let i = 0; i < patternLength; i++) {
    if ((i + 2) % 4 === 0) {
      cells.push(noteCell(note, instrumentId, velocity, accent));
    } else {
      cells.push(emptyCell());
    }
  }

  return cells;
}

/**
 * Generate 8th notes (every 2 rows)
 */
export function generate8ths(opts: GeneratorOptions): TrackerCell[] {
  const { patternLength, instrumentId, note, velocity = 0x38, accent } = opts;
  const cells: TrackerCell[] = [];

  for (let i = 0; i < patternLength; i++) {
    if (i % 2 === 0) {
      // Accent on downbeats
      const isDownbeat = i % 8 === 0;
      cells.push(noteCell(note, instrumentId, isDownbeat ? velocity : velocity - 8, accent));
    } else {
      cells.push(emptyCell());
    }
  }

  return cells;
}

/**
 * Generate 16th notes (every row)
 */
export function generate16ths(opts: GeneratorOptions): TrackerCell[] {
  const { patternLength, instrumentId, note, velocity = 0x30, accent } = opts;
  const cells: TrackerCell[] = [];

  for (let i = 0; i < patternLength; i++) {
    // Vary velocity for groove
    const isDownbeat = i % 4 === 0;
    const isUpbeat = i % 2 === 0;
    const vel = isDownbeat ? velocity : isUpbeat ? velocity - 8 : velocity - 16;
    cells.push(noteCell(note, instrumentId, Math.max(0x10, vel), accent));
  }

  return cells;
}

/**
 * Generate snare on 2 and 4 (backbeat)
 */
export function generateBackbeat(opts: GeneratorOptions): TrackerCell[] {
  const { patternLength, instrumentId, note, velocity = 0x40, accent } = opts;
  const cells: TrackerCell[] = [];

  for (let i = 0; i < patternLength; i++) {
    // Hit on beat 2 (row 4) and beat 4 (row 12) of each 16-row bar
    if (i % 16 === 4 || i % 16 === 12) {
      cells.push(noteCell(note, instrumentId, velocity, accent));
    } else {
      cells.push(emptyCell());
    }
  }

  return cells;
}

/**
 * Generate random pattern with given density
 */
export function generateRandom(
  opts: GeneratorOptions,
  density: number = 0.3 // 0-1, percentage of rows to fill
): TrackerCell[] {
  const { patternLength, instrumentId, note, velocity = 0x40, accent } = opts;
  const cells: TrackerCell[] = [];

  for (let i = 0; i < patternLength; i++) {
    if (Math.random() < density) {
      // Random velocity variation
      const vel = Math.max(0x20, velocity - Math.floor(Math.random() * 16));
      // Random accent (25% chance)
      const hasAccent = accent || Math.random() < 0.25;
      cells.push(noteCell(note, instrumentId, vel, hasAccent));
    } else {
      cells.push(emptyCell());
    }
  }

  return cells;
}

/**
 * Generate build pattern (increasing density)
 * Good for transitions
 */
export function generateBuild(opts: GeneratorOptions): TrackerCell[] {
  const { patternLength, instrumentId, note, velocity = 0x40, accent } = opts;
  const cells: TrackerCell[] = [];

  // Divide pattern into 4 sections with increasing density
  const sectionLength = patternLength / 4;

  for (let i = 0; i < patternLength; i++) {
    const section = Math.floor(i / sectionLength);
    let interval: number;

    switch (section) {
      case 0: interval = 8; break;  // Every 8 rows
      case 1: interval = 4; break;  // Every 4 rows
      case 2: interval = 2; break;  // Every 2 rows
      case 3: interval = 1; break;  // Every row
      default: interval = 4;
    }

    if (i % interval === 0) {
      // Velocity increases with section
      const vel = Math.min(0x40, velocity - 16 + section * 8);
      cells.push(noteCell(note, instrumentId, vel, accent));
    } else {
      cells.push(emptyCell());
    }
  }

  return cells;
}

/**
 * Generate breakdown pattern (sparse, minimal)
 */
export function generateBreakdown(opts: GeneratorOptions): TrackerCell[] {
  const { patternLength, instrumentId, note, velocity = 0x30, accent } = opts;
  const cells: TrackerCell[] = [];

  for (let i = 0; i < patternLength; i++) {
    // Only on first beat of each bar (every 16 rows)
    if (i % 16 === 0) {
      cells.push(noteCell(note, instrumentId, velocity, accent));
    } else {
      cells.push(emptyCell());
    }
  }

  return cells;
}

/**
 * Generate syncopated bass pattern
 * Good for 303 lines
 */
export function generateSyncopated(opts: GeneratorOptions): TrackerCell[] {
  const { patternLength, instrumentId, note, velocity = 0x40, accent } = opts;
  const cells: TrackerCell[] = [];

  // Syncopation pattern: 1, &, 3, &a (in 16th notes)
  const pattern = [0, 3, 8, 11, 14]; // Positions in a 16-row bar

  for (let i = 0; i < patternLength; i++) {
    const posInBar = i % 16;
    if (pattern.includes(posInBar)) {
      // Add slide on some notes for 303 feel
      const hasSlide = posInBar === 3 || posInBar === 11;
      const cell = noteCell(note, instrumentId, velocity, accent);
      cell.slide = hasSlide;
      cells.push(cell);
    } else {
      cells.push(emptyCell());
    }
  }

  return cells;
}

/**
 * Generate walking bass pattern
 * Simple ascending/descending pattern
 */
export function generateWalking(opts: GeneratorOptions): TrackerCell[] {
  const { patternLength, instrumentId, note, velocity = 0x38 } = opts;
  const cells: TrackerCell[] = [];

  // Parse base note to get MIDI-like value
  const baseNote = note || 'C-4';
  const noteNames = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

  const getNote = (semitones: number): NoteValue => {
    if (!baseNote) return 'C-4';
    const baseName = baseNote.substring(0, 2);
    const baseOctave = parseInt(baseNote.substring(2));
    const baseIndex = noteNames.indexOf(baseName);
    if (baseIndex === -1) return baseNote;

    const newIndex = (baseIndex + semitones + 12) % 12;
    const octaveOffset = Math.floor((baseIndex + semitones) / 12);
    return `${noteNames[newIndex]}${baseOctave + octaveOffset}` as NoteValue;
  };

  // Walk pattern (relative semitones)
  const walkPattern = [0, 5, 7, 5]; // Root, 5th, 7th, 5th

  for (let i = 0; i < patternLength; i++) {
    if (i % 4 === 0) {
      const patternIndex = Math.floor(i / 4) % walkPattern.length;
      const walkNote = getNote(walkPattern[patternIndex]);
      cells.push(noteCell(walkNote, instrumentId, velocity, false));
    } else {
      cells.push(emptyCell());
    }
  }

  return cells;
}

/**
 * Generate hi-hat pattern with open/closed variation
 */
export function generateHiHats(
  opts: GeneratorOptions,
  openNote: NoteValue = 'A#3'
): TrackerCell[] {
  const { patternLength, instrumentId, note, velocity = 0x38, accent } = opts;
  const cells: TrackerCell[] = [];

  for (let i = 0; i < patternLength; i++) {
    if (i % 2 === 0) {
      // Open hat on offbeats (every 8 rows, offset by 4)
      const isOpen = (i + 4) % 8 === 0;
      const hatNote = isOpen ? openNote : note;
      const vel = isOpen ? velocity : velocity - 8;
      cells.push(noteCell(hatNote, instrumentId, vel, accent));
    } else {
      cells.push(emptyCell());
    }
  }

  return cells;
}

/**
 * Clear channel (all empty cells)
 */
export function generateClear(patternLength: number): TrackerCell[] {
  return Array(patternLength).fill(null).map(() => emptyCell());
}

// Export generator types for menu building
export type GeneratorType =
  | '4on4'
  | 'offbeat'
  | '8ths'
  | '16ths'
  | 'backbeat'
  | 'random'
  | 'build'
  | 'breakdown'
  | 'syncopated'
  | 'walking'
  | 'hiHats'
  | 'clear';

// Generator registry with metadata
export const GENERATORS: Record<GeneratorType, {
  name: string;
  description: string;
  category: 'drums' | 'bass' | 'general';
  generate: (opts: GeneratorOptions) => TrackerCell[];
}> = {
  '4on4': {
    name: '4/4 Kicks',
    description: 'Every 4 rows on beat',
    category: 'drums',
    generate: generate4on4,
  },
  offbeat: {
    name: 'Offbeat',
    description: 'Every 4 rows, offset by 2',
    category: 'drums',
    generate: generateOffbeat,
  },
  '8ths': {
    name: '8th Notes',
    description: 'Every 2 rows',
    category: 'general',
    generate: generate8ths,
  },
  '16ths': {
    name: '16th Notes',
    description: 'Every row',
    category: 'general',
    generate: generate16ths,
  },
  backbeat: {
    name: 'Backbeat (2&4)',
    description: 'Snare on beats 2 and 4',
    category: 'drums',
    generate: generateBackbeat,
  },
  random: {
    name: 'Random',
    description: '30% density random fill',
    category: 'general',
    generate: (opts) => generateRandom(opts, 0.3),
  },
  build: {
    name: 'Build',
    description: 'Increasing density for transitions',
    category: 'general',
    generate: generateBuild,
  },
  breakdown: {
    name: 'Breakdown',
    description: 'Sparse, minimal pattern',
    category: 'general',
    generate: generateBreakdown,
  },
  syncopated: {
    name: 'Syncopated',
    description: 'Offbeat acid pattern',
    category: 'bass',
    generate: generateSyncopated,
  },
  walking: {
    name: 'Walking Bass',
    description: 'Simple ascending pattern',
    category: 'bass',
    generate: generateWalking,
  },
  hiHats: {
    name: 'Hi-Hats',
    description: 'Open/closed hat pattern',
    category: 'drums',
    generate: generateHiHats,
  },
  clear: {
    name: 'Clear',
    description: 'Remove all notes',
    category: 'general',
    generate: (opts) => generateClear(opts.patternLength),
  },
};
