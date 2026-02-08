/**
 * useGridPattern - Hook to sync grid sequencer state with TrackerCell[]
 *
 * Provides a bidirectional mapping between the grid view's step-based format
 * and the tracker's TrackerCell format.
 */

import { useState, useCallback, useMemo } from 'react';
import { useTrackerStore } from '../stores/useTrackerStore';
import type { TrackerCell } from '@typedefs/tracker';
import { xmNoteToString, stringNoteToXM } from '@/lib/xmConversions';

// Note names for the grid (one octave)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export interface GridStep {
  noteIndex: number | null;  // 0-11 (C to B), null = rest
  octaveShift: number;       // -1, 0, or 1 (relative to base octave like db303)
  accent: boolean;           // Louder note, filter opens more
  slide: boolean;            // Glide pitch from previous note (no envelope retrigger)
  tie: boolean;              // Note sustains from previous step
  mute: boolean;             // TT-303: Silent step (data preserved)
  hammer: boolean;           // TT-303: Legato without pitch glide
  velocity: number;          // 0-127 (MIDI velocity)
}

export interface GridPattern {
  steps: GridStep[];
  baseOctave: number;
  length: number;
}

const EMPTY_STEP: GridStep = {
  noteIndex: null,
  octaveShift: 0,
  accent: false,
  slide: false,
  tie: false,
  mute: false,
  hammer: false,
  velocity: 100, // Default velocity
};

/**
 * Parse tracker note (numeric XM format) to grid format
 */
function parseTrackerNote(xmNote: number, baseOctave: number): { noteIndex: number; octaveShift: number } | null {
  // Skip empty (0) and note-off (97)
  if (!xmNote || xmNote === 0 || xmNote === 97) {
    return null;
  }

  // Convert XM note to string for parsing
  const noteStr = xmNoteToString(xmNote);

  // Parse note like "C-4", "F#3", "D#5"
  const match = noteStr.match(/^([A-G])(#?)(-?\d)$/);
  if (!match) return null;

  const [, noteLetter, sharp, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);
  const noteName = noteLetter + (sharp || '');

  const noteIndex = NOTE_NAMES.indexOf(noteName as typeof NOTE_NAMES[number]);
  if (noteIndex === -1) return null;

  const octaveShift = octave - baseOctave;

  // Clamp to valid range
  if (octaveShift < -1 || octaveShift > 1) {
    // Out of grid range - still return but clamped
    return { noteIndex, octaveShift: Math.max(-1, Math.min(1, octaveShift)) };
  }

  return { noteIndex, octaveShift };
}

/**
 * Convert grid step to tracker note (numeric XM format)
 */
function gridStepToTrackerNote(step: GridStep, baseOctave: number): number {
  if (step.noteIndex === null) {
    return 0; // Empty cell
  }

  const noteName = NOTE_NAMES[step.noteIndex];
  const octave = baseOctave + step.octaveShift;

  // Format with separator for natural notes, then convert to XM
  let noteStr: string;
  if (noteName.includes('#')) {
    noteStr = `${noteName}${octave}`;
  } else {
    noteStr = `${noteName}-${octave}`;
  }

  return stringNoteToXM(noteStr);
}

/**
 * Convert TrackerCell[] to GridPattern
 */
export function trackerCellsToGrid(cells: TrackerCell[], baseOctave: number, maxSteps: number): GridPattern {
  const steps: GridStep[] = [];

  for (let i = 0; i < maxSteps; i++) {
    const cell = cells[i];

    if (!cell) {
      steps.push({ ...EMPTY_STEP });
      continue;
    }

    const parsed = parseTrackerNote(cell.note, baseOctave);

    // Tie detection: check if current note is the same as the previous note
    // A tie means the note sustains from the previous step without retriggering
    let isTie = false;
    if (i > 0 && parsed && cells[i - 1]) {
      const prevParsed = parseTrackerNote(cells[i - 1].note, baseOctave);
      if (prevParsed &&
          prevParsed.noteIndex === parsed.noteIndex &&
          prevParsed.octaveShift === parsed.octaveShift) {
        isTie = true;
      }
    }

    steps.push({
      noteIndex: parsed?.noteIndex ?? null,
      octaveShift: parsed?.octaveShift ?? 0,
      accent: (cell.flag1 === 1 || cell.flag2 === 1),
      slide: (cell.flag1 === 2 || cell.flag2 === 2),
      tie: isTie,
      mute: (cell.flag1 === 3 || cell.flag2 === 3),    // TT-303 mute flag
      hammer: (cell.flag1 === 4 || cell.flag2 === 4),  // TT-303 hammer flag
      velocity: cell.volume ?? 100, // Convert volume (0-64) to velocity (0-127) - or use as-is if already MIDI velocity
    });
  }

  return {
    steps,
    baseOctave,
    length: maxSteps,
  };
}

/**
 * Convert GridPattern to TrackerCell[]
 */
export function gridToTrackerCells(pattern: GridPattern, instrumentId: number = 1): TrackerCell[] {
  return pattern.steps.map((step) => {
    const note = gridStepToTrackerNote(step, pattern.baseOctave);
    // Convert velocity to XM volume (0-127 -> 0x10-0x50)
    const volumeValue = step.noteIndex !== null ? Math.round((step.velocity / 127) * 64) : 0;
    const volume = step.noteIndex !== null ? 0x10 + volumeValue : 0;

    // Encode flags: 1=accent, 2=slide, 3=mute, 4=hammer
    // Use flag1 for accent/mute, flag2 for slide/hammer
    let flag1: number | undefined = undefined;
    let flag2: number | undefined = undefined;

    if (step.accent) flag1 = 1;
    else if (step.mute) flag1 = 3;

    if (step.slide) flag2 = 2;
    else if (step.hammer) flag2 = 4;

    return {
      note,
      instrument: note !== 0 ? instrumentId : 0, // Use instrumentId for notes, 0 for empty cells
      volume,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0,
      flag1,
      flag2,
    };
  });
}

/**
 * Hook to manage grid pattern state
 */
export function useGridPattern(channelIndex: number) {
  const { patterns, currentPatternIndex, setCell, resizePattern, resizeAllPatterns } = useTrackerStore();
  const [baseOctave, setBaseOctave] = useState(3);

  const currentPattern = patterns[currentPatternIndex];
  const channel = currentPattern?.channels[channelIndex];
  const cells = channel?.rows || [];

  // Get maxSteps from actual pattern length
  const maxSteps = currentPattern?.length || 16;

  // Update pattern length when maxSteps changes
  const setMaxSteps = useCallback(
    (newLength: number) => {
      resizePattern(currentPatternIndex, newLength);
    },
    [currentPatternIndex, resizePattern]
  );

  // Convert cells to grid format
  const gridPattern = useMemo(() => {
    return trackerCellsToGrid(cells, baseOctave, maxSteps);
  }, [cells, baseOctave, maxSteps]);

  // Set note at step
  const setNote = useCallback(
    (stepIndex: number, noteIndex: number | null, octaveShift: number = 0) => {
      if (stepIndex < 0 || stepIndex >= maxSteps) return;

      const note =
        noteIndex !== null
          ? gridStepToTrackerNote({ noteIndex, octaveShift, accent: false, slide: false, tie: false, mute: false, hammer: false, velocity: 100 }, baseOctave)
          : 0; // 0 = empty cell

      // When setting a note, ensure instrument is set if currently 0 (no instrument)
      const currentCell = cells[stepIndex];
      const currentInstrument = currentCell?.instrument || 0;

      // If note is being set (not cleared) and current instrument is 0, use channel default or 1
      if (note !== 0 && currentInstrument === 0) {
        const instrument = channel?.instrumentId ?? 1;
        setCell(channelIndex, stepIndex, { note, instrument });
      } else {
        setCell(channelIndex, stepIndex, { note });
      }
    },
    [channelIndex, setCell, baseOctave, maxSteps, cells, channel]
  );

  // Toggle accent at step
  const toggleAccent = useCallback(
    (stepIndex: number) => {
      if (stepIndex < 0 || stepIndex >= cells.length) return;
      const current = (cells[stepIndex]?.flag1 === 1 || cells[stepIndex]?.flag2 === 1);
      setCell(channelIndex, stepIndex, { flag1: current ? 0 : 1 });
    },
    [channelIndex, cells, setCell]
  );

  // Toggle slide at step
  const toggleSlide = useCallback(
    (stepIndex: number) => {
      if (stepIndex < 0 || stepIndex >= cells.length) return;
      const current = (cells[stepIndex]?.flag1 === 2 || cells[stepIndex]?.flag2 === 2);
      setCell(channelIndex, stepIndex, { flag2: current ? 0 : 2 });
    },
    [channelIndex, cells, setCell]
  );

  // Toggle octave shift at step
  const setOctaveShift = useCallback(
    (stepIndex: number, shift: number) => {
      if (stepIndex < 0 || stepIndex >= cells.length) return;

      const cell = cells[stepIndex];
      if (!cell?.note) return;

      const parsed = parseTrackerNote(cell.note, baseOctave);
      if (!parsed) return;

      // Calculate new note with shifted octave
      const newNote = gridStepToTrackerNote(
        { noteIndex: parsed.noteIndex, octaveShift: shift, accent: false, slide: false, tie: false, mute: false, hammer: false, velocity: 100 },
        baseOctave
      );

      setCell(channelIndex, stepIndex, { note: newNote });
    },
    [channelIndex, cells, setCell, baseOctave]
  );

  // Clear step
  const clearStep = useCallback(
    (stepIndex: number) => {
      if (stepIndex < 0 || stepIndex >= maxSteps) return;
      setCell(channelIndex, stepIndex, { note: 0, flag1: 0, flag2: 0 }); // 0 = empty cell
    },
    [channelIndex, setCell, maxSteps]
  );

  // Clear all steps
  const clearAll = useCallback(() => {
    for (let i = 0; i < maxSteps; i++) {
      setCell(channelIndex, i, { note: 0, flag1: 0, flag2: 0 }); // 0 = empty cell
    }
  }, [channelIndex, setCell, maxSteps]);

  // Set velocity at step
  const setVelocity = useCallback(
    (stepIndex: number, velocity: number) => {
      if (stepIndex < 0 || stepIndex >= cells.length) return;
      const clampedVelocity = Math.max(0, Math.min(127, velocity));
      setCell(channelIndex, stepIndex, { volume: clampedVelocity });
    },
    [channelIndex, cells, setCell]
  );

  // Toggle mute at step (TT-303 extension: silent step, data preserved)
  const toggleMute = useCallback(
    (stepIndex: number) => {
      if (stepIndex < 0 || stepIndex >= cells.length) return;
      const current = (cells[stepIndex]?.flag1 === 3 || cells[stepIndex]?.flag2 === 3);
      // Mute uses flag1=3, clear accent if setting mute
      setCell(channelIndex, stepIndex, { flag1: current ? 0 : 3 });
    },
    [channelIndex, cells, setCell]
  );

  // Toggle hammer at step (TT-303 extension: legato without pitch glide)
  const toggleHammer = useCallback(
    (stepIndex: number) => {
      if (stepIndex < 0 || stepIndex >= cells.length) return;
      const current = (cells[stepIndex]?.flag1 === 4 || cells[stepIndex]?.flag2 === 4);
      // Hammer uses flag2=4, clear slide if setting hammer
      setCell(channelIndex, stepIndex, { flag2: current ? 0 : 4 });
    },
    [channelIndex, cells, setCell]
  );

  return {
    gridPattern,
    baseOctave,
    setBaseOctave,
    maxSteps,
    setMaxSteps,
    resizeAllPatterns,
    setNote,
    toggleAccent,
    toggleSlide,
    toggleMute,
    toggleHammer,
    setOctaveShift,
    setVelocity,
    clearStep,
    clearAll,
  };
}
