/**
 * useGridPattern - Hook to sync grid sequencer state with TrackerCell[]
 *
 * Provides a bidirectional mapping between the grid view's step-based format
 * and the tracker's TrackerCell format.
 */

import { useState, useCallback, useMemo } from 'react';
import { useTrackerStore } from '../stores/useTrackerStore';
import type { TrackerCell } from '@typedefs/tracker';

// Note names for the grid (one octave)
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export interface GridStep {
  noteIndex: number | null;  // 0-11 (C to B), null = rest
  octaveShift: number;       // -1, 0, or 1
  accent: boolean;
  slide: boolean;
  tie: boolean;
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
};

/**
 * Parse tracker note string to grid format
 */
function parseTrackerNote(note: string | null, baseOctave: number): { noteIndex: number; octaveShift: number } | null {
  if (!note || note === '===' || note === '---') {
    return null;
  }

  // Parse note like "C-4", "F#3", "D#5"
  const match = note.match(/^([A-G])(#?)(-?\d)$/);
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
 * Convert grid step to tracker note string
 */
function gridStepToTrackerNote(step: GridStep, baseOctave: number): string | null {
  if (step.noteIndex === null) {
    return null;
  }

  const noteName = NOTE_NAMES[step.noteIndex];
  const octave = baseOctave + step.octaveShift;

  // Format with separator for natural notes
  if (noteName.includes('#')) {
    return `${noteName}${octave}`;
  }
  return `${noteName}-${octave}`;
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

    steps.push({
      noteIndex: parsed?.noteIndex ?? null,
      octaveShift: parsed?.octaveShift ?? 0,
      accent: cell.accent || false,
      slide: cell.slide || false,
      tie: false, // TODO: Implement tie detection
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
export function gridToTrackerCells(pattern: GridPattern): TrackerCell[] {
  return pattern.steps.map((step) => ({
    note: gridStepToTrackerNote(step, pattern.baseOctave),
    instrument: null,
    volume: null,
    effect: null,
    accent: step.accent,
    slide: step.slide,
  }));
}

/**
 * Hook to manage grid pattern state
 */
export function useGridPattern(channelIndex: number) {
  const { patterns, currentPatternIndex, setCell, resizePattern, resizeAllPatterns } = useTrackerStore();
  const [baseOctave, setBaseOctave] = useState(3);

  const currentPattern = patterns[currentPatternIndex];
  const channel = currentPattern?.channels[channelIndex];
  const cells = useMemo(() => channel?.rows || [], [channel?.rows]);

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
          ? gridStepToTrackerNote({ noteIndex, octaveShift, accent: false, slide: false, tie: false }, baseOctave)
          : null;

      setCell(channelIndex, stepIndex, { note });
    },
    [channelIndex, setCell, baseOctave, maxSteps]
  );

  // Toggle accent at step
  const toggleAccent = useCallback(
    (stepIndex: number) => {
      if (stepIndex < 0 || stepIndex >= cells.length) return;
      const current = cells[stepIndex]?.accent || false;
      setCell(channelIndex, stepIndex, { accent: !current });
    },
    [channelIndex, cells, setCell]
  );

  // Toggle slide at step
  const toggleSlide = useCallback(
    (stepIndex: number) => {
      if (stepIndex < 0 || stepIndex >= cells.length) return;
      const current = cells[stepIndex]?.slide || false;
      setCell(channelIndex, stepIndex, { slide: !current });
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
        { noteIndex: parsed.noteIndex, octaveShift: shift, accent: false, slide: false, tie: false },
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
      setCell(channelIndex, stepIndex, { note: null, accent: false, slide: false });
    },
    [channelIndex, setCell, maxSteps]
  );

  // Clear all steps
  const clearAll = useCallback(() => {
    for (let i = 0; i < maxSteps; i++) {
      setCell(channelIndex, i, { note: null, accent: false, slide: false });
    }
  }, [channelIndex, setCell, maxSteps]);

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
    setOctaveShift,
    clearStep,
    clearAll,
  };
}
