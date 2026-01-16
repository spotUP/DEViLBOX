/**
 * TD3PatternTranslator - Convert between tracker pattern format and TD-3 format
 *
 * Handles the conversion of:
 * - Tracker note strings (e.g., "C-4", "F#3") to TD-3 note encoding
 * - TD-3 note encoding back to tracker format
 * - TrackerCell arrays to TD3Step arrays
 */

import type { TD3Note, TD3Step } from '../types';
import type { TrackerCell } from '@typedefs/tracker';

// TD-3 supports notes from C2 to C5 (3 octaves + upper C)
const TD3_BASE_OCTAVE = 2;
const TD3_MAX_OCTAVE_OFFSET = 2; // 0, 1, or 2

// Note name to semitone offset
const NOTE_TO_SEMITONE: Record<string, number> = {
  'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
  'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
};

// Semitone offset to note name
const SEMITONE_TO_NOTE: string[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

/**
 * Parse a tracker note string into components
 * @param note Tracker note like "C-4", "F#3", "D#5"
 * @returns Parsed note with semitone and octave, or null if invalid
 */
export function parseTrackerNote(note: string): { semitone: number; octave: number } | null {
  if (!note || note === '===' || note === '---') {
    return null;
  }

  // Parse note like "C-4", "F#3", "D#5"
  const match = note.match(/^([A-G])(#?)(-?\d)$/);
  if (!match) return null;

  const [, noteLetter, sharp, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);
  const noteName = noteLetter + (sharp || '');
  const semitone = NOTE_TO_SEMITONE[noteName];

  if (semitone === undefined) return null;

  return { semitone, octave };
}

/**
 * Convert tracker note to TD-3 note format
 * @param trackerNote Tracker note string like "C-4", "F#3"
 * @param baseOctave The base octave for the TD-3 pattern (default 2)
 * @returns TD3Note or null if the note can't be represented
 */
export function trackerNoteToTD3(trackerNote: string | null, baseOctave: number = TD3_BASE_OCTAVE): TD3Note | null {
  if (!trackerNote) return null;

  const parsed = parseTrackerNote(trackerNote);
  if (!parsed) return null;

  const { semitone, octave } = parsed;

  // Calculate octave offset from base
  let octaveOffset = octave - baseOctave;

  // Handle upper C (C at the top of the range)
  let upperC = false;
  if (semitone === 0 && octaveOffset === TD3_MAX_OCTAVE_OFFSET + 1) {
    // This is the upper C
    upperC = true;
    octaveOffset = TD3_MAX_OCTAVE_OFFSET;
  }

  // Check if note is in range
  if (octaveOffset < 0 || octaveOffset > TD3_MAX_OCTAVE_OFFSET) {
    // Note is out of TD-3 range
    return null;
  }

  return {
    value: semitone,
    octave: octaveOffset,
    upperC,
  };
}

/**
 * Convert TD-3 note to tracker note format
 * @param td3Note TD-3 note
 * @param baseOctave The base octave (default 2)
 * @returns Tracker note string like "C-4"
 */
export function td3NoteToTracker(td3Note: TD3Note, baseOctave: number = TD3_BASE_OCTAVE): string {
  let octave = baseOctave + td3Note.octave;

  // Handle upper C
  if (td3Note.upperC && td3Note.value === 0) {
    octave += 1;
  }

  const noteName = SEMITONE_TO_NOTE[td3Note.value];

  // Format with separator for natural notes, no separator for sharps
  if (noteName.includes('#')) {
    return `${noteName}${octave}`;
  }
  return `${noteName}-${octave}`;
}

/**
 * Convert a TrackerCell to a TD3Step
 */
export function trackerCellToTD3Step(cell: TrackerCell, baseOctave: number = TD3_BASE_OCTAVE): TD3Step {
  // Check for rest (no note or note off)
  const isRest = !cell.note || cell.note === '===' || cell.note === '---';

  const step: TD3Step = {
    note: isRest ? null : trackerNoteToTD3(cell.note, baseOctave),
    accent: cell.accent || false,
    slide: cell.slide || false,
    tie: false, // TODO: Implement tie detection based on consecutive same notes
  };

  return step;
}

/**
 * Convert a TD3Step to a TrackerCell
 */
export function td3StepToTrackerCell(step: TD3Step, baseOctave: number = TD3_BASE_OCTAVE): TrackerCell {
  const cell: TrackerCell = {
    note: step.note ? td3NoteToTracker(step.note, baseOctave) : null,
    instrument: null,
    volume: null,
    effect: null,
    accent: step.accent,
    slide: step.slide,
  };

  return cell;
}

/**
 * Convert an array of TrackerCells to TD3Steps (max 16 steps)
 */
export function trackerPatternToTD3Steps(
  cells: TrackerCell[],
  baseOctave: number = TD3_BASE_OCTAVE
): { steps: TD3Step[]; warnings: string[] } {
  const warnings: string[] = [];
  const steps: TD3Step[] = [];

  // TD-3 only supports 16 steps
  const maxSteps = 16;
  if (cells.length > maxSteps) {
    warnings.push(`Pattern has ${cells.length} rows, only first ${maxSteps} will be exported`);
  }

  for (let i = 0; i < Math.min(cells.length, maxSteps); i++) {
    const cell = cells[i];
    const step = trackerCellToTD3Step(cell, baseOctave);

    // Check if note was out of range
    if (cell.note && !step.note && cell.note !== '===' && cell.note !== '---') {
      warnings.push(`Row ${i + 1}: Note ${cell.note} is out of TD-3 range (C2-C5)`);
    }

    steps.push(step);
  }

  // Pad to 16 steps if needed
  while (steps.length < maxSteps) {
    steps.push({
      note: null,
      accent: false,
      slide: false,
      tie: false,
    });
  }

  return { steps, warnings };
}

/**
 * Convert TD3Steps to TrackerCells
 */
export function td3StepsToTrackerCells(
  steps: TD3Step[],
  baseOctave: number = TD3_BASE_OCTAVE
): TrackerCell[] {
  return steps.map((step) => td3StepToTrackerCell(step, baseOctave));
}

/**
 * Analyze a pattern to suggest the best base octave for export
 */
export function suggestBaseOctave(cells: TrackerCell[]): number {
  const octaveCounts = new Map<number, number>();

  for (const cell of cells) {
    const parsed = parseTrackerNote(cell.note || '');
    if (parsed) {
      const count = octaveCounts.get(parsed.octave) || 0;
      octaveCounts.set(parsed.octave, count + 1);
    }
  }

  if (octaveCounts.size === 0) return TD3_BASE_OCTAVE;

  // Find the most common octave
  let maxCount = 0;
  let bestOctave = TD3_BASE_OCTAVE;

  octaveCounts.forEach((count, octave) => {
    if (count > maxCount) {
      maxCount = count;
      bestOctave = octave;
    }
  });

  // Adjust to be a valid TD-3 base octave
  return Math.max(1, Math.min(4, bestOctave));
}

/**
 * Check if a pattern can be exported to TD-3 without issues
 */
export function validatePatternForTD3Export(cells: TrackerCell[], baseOctave: number = TD3_BASE_OCTAVE): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (cells.length === 0) {
    errors.push('Pattern is empty');
    return { valid: false, errors, warnings };
  }

  if (cells.length > 16) {
    warnings.push(`Pattern has ${cells.length} rows, only first 16 will be exported`);
  }

  let notesOutOfRange = 0;

  for (let i = 0; i < Math.min(cells.length, 16); i++) {
    const cell = cells[i];
    if (cell.note && cell.note !== '===' && cell.note !== '---') {
      const td3Note = trackerNoteToTD3(cell.note, baseOctave);
      if (!td3Note) {
        notesOutOfRange++;
      }
    }
  }

  if (notesOutOfRange > 0) {
    warnings.push(`${notesOutOfRange} note(s) are out of TD-3 range and will be skipped`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
