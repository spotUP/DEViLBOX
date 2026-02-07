/**
 * usePianoRollData - Convert tracker pattern data to piano roll notes
 * Includes copy/paste, quantize, slide/accent, and undo/redo integration
 */

import { useMemo, useCallback, useRef } from 'react';
import { useTrackerStore } from '../../stores';
import { useHistoryStore } from '../../stores/useHistoryStore';
import type { Pattern, TrackerCell } from '../../types/tracker';
import type { PianoRollNote, PianoRollClipboard } from '../../types/pianoRoll';
import { xmNoteToMidi, midiToXMNote } from '../../lib/xmConversions';

/**
 * Generate a unique ID for a note based on its position
 */
function generateNoteId(channelIndex: number, startRow: number): string {
  return `${channelIndex}-${startRow}`;
}

/**
 * Calculate note duration by scanning forward for note-off or next note
 */
function calculateNoteDuration(
  rows: TrackerCell[],
  startRow: number,
  patternLength: number
): number {
  for (let row = startRow + 1; row < patternLength; row++) {
    const cell = rows[row];
    // Note-off marker ends the note (97 = note off)
    if (cell.note === 97) {
      return row - startRow;
    }
    // Next note starts (not empty or note-off)
    if (cell.note && cell.note !== 0 && cell.note !== 97) {
      return row - startRow;
    }
  }
  // Note extends to end of pattern
  return patternLength - startRow;
}

/**
 * Convert a pattern to piano roll notes
 */
export function patternToPianoRollNotes(
  pattern: Pattern,
  channelIndex?: number
): PianoRollNote[] {
  const notes: PianoRollNote[] = [];
  const channels = channelIndex !== undefined
    ? [pattern.channels[channelIndex]].filter(Boolean)
    : pattern.channels;

  channels.forEach((channel, chIdx) => {
    const actualChannelIndex = channelIndex !== undefined ? channelIndex : chIdx;

    for (let row = 0; row < channel.rows.length; row++) {
      const cell = channel.rows[row];

      // Skip empty cells (0), rests (0), and note-offs (97)
      if (!cell.note || cell.note === 0 || cell.note === 97) {
        continue;
      }

      // Parse note to MIDI
      const midiNote = xmNoteToMidi(cell.note);
      if (midiNote === null) continue;

      // Calculate duration
      const duration = calculateNoteDuration(channel.rows, row, pattern.length);

      // Convert volume to velocity (XM volume 0x10-0x50 = 0-64, velocity is 0-127)
      const hasSetVolume = cell.volume >= 0x10 && cell.volume <= 0x50;
      const velocity = hasSetVolume
        ? Math.round(((cell.volume - 0x10) / 64) * 127)
        : 100; // Default velocity

      notes.push({
        id: generateNoteId(actualChannelIndex, row),
        channelIndex: actualChannelIndex,
        startRow: row,
        endRow: row + duration,
        midiNote,
        velocity,
        instrument: cell.instrument,
        slide: (cell.flag1 === 2 || cell.flag2 === 2),
        accent: (cell.flag1 === 1 || cell.flag2 === 1),
      });
    }
  });

  return notes;
}

/**
 * Save pattern state for undo before modification (deep clone)
 */
function saveForUndo(pattern: Pattern): Pattern {
  return JSON.parse(JSON.stringify(pattern));
}

/**
 * Record edit to history after modification
 */
function recordEdit(
  beforeState: Pattern,
  pattern: Pattern,
  patternIndex: number,
  description: string
): void {
  const pushAction = useHistoryStore.getState().pushAction;
  pushAction(
    'EDIT_CELL',
    description,
    patternIndex,
    beforeState,
    JSON.parse(JSON.stringify(pattern))
  );
}

/**
 * Hook to get piano roll notes from current pattern
 */
export function usePianoRollData(channelIndex?: number) {
  const { patterns, currentPatternIndex, setCell } = useTrackerStore();
  const pattern = patterns[currentPatternIndex];

  // Convert pattern to notes (support multi-channel when channelIndex is undefined)
  const notes = useMemo(() => {
    if (!pattern) return [];
    return patternToPianoRollNotes(pattern, channelIndex);
  }, [pattern, channelIndex]);

  // Add a note (with undo)
  const addNote = useCallback(
    (midiNote: number, startRow: number, duration: number, velocity: number = 100, chIndex?: number) => {
      const targetChannel = chIndex ?? channelIndex ?? 0;
      if (!pattern) return;

      const beforeState = saveForUndo(pattern);

      // Convert MIDI note to XM note number
      const xmNote = midiToXMNote(midiNote);

      // Convert velocity to volume (0-127 -> 0x10-0x50, XM set volume range)
      const volumeValue = Math.round((velocity / 127) * 64);
      const volume = 0x10 + volumeValue; // 0x10-0x50 = set volume 0-64

      // Set the note
      setCell(targetChannel, startRow, { note: xmNote, volume });

      // Add note-off at end if within pattern
      if (startRow + duration < (pattern?.length || 64)) {
        setCell(targetChannel, startRow + duration, { note: 97 }); // 97 = note off
      }

      // Record for undo
      const afterPattern = useTrackerStore.getState().patterns[currentPatternIndex];
      if (afterPattern) {
        recordEdit(beforeState, afterPattern, currentPatternIndex, 'Add note');
      }
    },
    [channelIndex, pattern, currentPatternIndex, setCell]
  );

  // Delete a note (with undo)
  const deleteNote = useCallback(
    (noteId: string) => {
      const [chIndexStr, startRowStr] = noteId.split('-');
      const chIndex = parseInt(chIndexStr, 10);
      const startRow = parseInt(startRowStr, 10);

      // Find the note to get its duration
      const note = notes.find((n) => n.id === noteId);
      if (!note || !pattern) return;

      const beforeState = saveForUndo(pattern);

      // Clear the note cell (0 = empty, 0 = no volume)
      setCell(chIndex, startRow, { note: 0, volume: 0 });

      // Clear any note-off that might be at the end
      if (note.endRow < (pattern?.length || 64)) {
        const endCell = pattern?.channels[chIndex]?.rows[note.endRow];
        if (endCell?.note === 97) { // 97 = note off
          setCell(chIndex, note.endRow, { note: 0 }); // 0 = empty
        }
      }

      const afterPattern = useTrackerStore.getState().patterns[currentPatternIndex];
      if (afterPattern) {
        recordEdit(beforeState, afterPattern, currentPatternIndex, 'Delete note');
      }
    },
    [notes, pattern, currentPatternIndex, setCell]
  );

  // Delete multiple notes at once (batch, single undo entry)
  const deleteNotes = useCallback(
    (noteIds: string[]) => {
      if (!pattern || noteIds.length === 0) return;
      const beforeState = saveForUndo(pattern);

      noteIds.forEach(noteId => {
        const [chIndexStr, startRowStr] = noteId.split('-');
        const chIndex = parseInt(chIndexStr, 10);
        const startRow = parseInt(startRowStr, 10);
        const note = notes.find((n) => n.id === noteId);
        if (!note) return;

        setCell(chIndex, startRow, { note: 0, volume: 0 });
        if (note.endRow < (pattern?.length || 64)) {
          // Read live pattern state to avoid stale closure reference
          const livePattern = useTrackerStore.getState().patterns[currentPatternIndex];
          const endCell = livePattern?.channels[chIndex]?.rows[note.endRow];
          if (endCell?.note === 97) {
            setCell(chIndex, note.endRow, { note: 0 });
          }
        }
      });

      const afterPattern = useTrackerStore.getState().patterns[currentPatternIndex];
      if (afterPattern) {
        recordEdit(beforeState, afterPattern, currentPatternIndex, `Delete ${noteIds.length} notes`);
      }
    },
    [notes, pattern, currentPatternIndex, setCell]
  );

  // Move a note (with undo)
  const moveNote = useCallback(
    (noteId: string, deltaRow: number, deltaPitch: number) => {
      const note = notes.find((n) => n.id === noteId);
      if (!note || !pattern) return;

      const beforeState = saveForUndo(pattern);

      const newStartRow = Math.max(0, note.startRow + deltaRow);
      const newMidiNote = Math.max(0, Math.min(127, note.midiNote + deltaPitch));
      const duration = note.endRow - note.startRow;

      // Delete old note (without undo - we'll record the whole move)
      const [chIndexStr, startRowStr] = noteId.split('-');
      const chIndex = parseInt(chIndexStr, 10);
      const startRow = parseInt(startRowStr, 10);
      setCell(chIndex, startRow, { note: 0, volume: 0 });
      if (note.endRow < (pattern?.length || 64)) {
        const endCell = pattern?.channels[chIndex]?.rows[note.endRow];
        if (endCell?.note === 97) {
          setCell(chIndex, note.endRow, { note: 0 });
        }
      }

      // Add new note at new position
      const xmNote = midiToXMNote(newMidiNote);
      const volumeValue = Math.round((note.velocity / 127) * 64);
      const volume = 0x10 + volumeValue;
      setCell(note.channelIndex, newStartRow, { note: xmNote, volume });
      if (newStartRow + duration < (pattern?.length || 64)) {
        setCell(note.channelIndex, newStartRow + duration, { note: 97 });
      }

      const afterPattern = useTrackerStore.getState().patterns[currentPatternIndex];
      if (afterPattern) {
        recordEdit(beforeState, afterPattern, currentPatternIndex, 'Move note');
      }
    },
    [notes, pattern, currentPatternIndex, setCell]
  );

  // Resize a note (with undo)
  const resizeNote = useCallback(
    (noteId: string, newEndRow: number) => {
      const note = notes.find((n) => n.id === noteId);
      if (!note || !pattern) return;

      const beforeState = saveForUndo(pattern);
      const newDuration = Math.max(1, newEndRow - note.startRow);

      // Delete old note
      const [chIndexStr, startRowStr] = noteId.split('-');
      const chIndex = parseInt(chIndexStr, 10);
      const startRow = parseInt(startRowStr, 10);
      setCell(chIndex, startRow, { note: 0, volume: 0 });
      if (note.endRow < (pattern?.length || 64)) {
        const endCell = pattern?.channels[chIndex]?.rows[note.endRow];
        if (endCell?.note === 97) {
          setCell(chIndex, note.endRow, { note: 0 });
        }
      }

      // Add note with new duration
      const xmNote = midiToXMNote(note.midiNote);
      const volumeValue = Math.round((note.velocity / 127) * 64);
      const volume = 0x10 + volumeValue;
      setCell(note.channelIndex, note.startRow, { note: xmNote, volume });
      if (note.startRow + newDuration < (pattern?.length || 64)) {
        setCell(note.channelIndex, note.startRow + newDuration, { note: 97 });
      }

      const afterPattern = useTrackerStore.getState().patterns[currentPatternIndex];
      if (afterPattern) {
        recordEdit(beforeState, afterPattern, currentPatternIndex, 'Resize note');
      }
    },
    [notes, pattern, currentPatternIndex, setCell]
  );

  // Set note velocity (with undo — for single clicks, not drag)
  const setNoteVelocity = useCallback(
    (noteId: string, velocity: number) => {
      const [chIndexStr, startRowStr] = noteId.split('-');
      const chIndex = parseInt(chIndexStr, 10);
      const startRow = parseInt(startRowStr, 10);
      if (!pattern) return;

      const beforeState = saveForUndo(pattern);

      // Convert velocity to XM volume (0-127 -> 0x10-0x50)
      const volumeValue = Math.round((velocity / 127) * 64);
      const volume = 0x10 + volumeValue; // 0x10-0x50 = set volume 0-64
      setCell(chIndex, startRow, { volume });

      const afterPattern = useTrackerStore.getState().patterns[currentPatternIndex];
      if (afterPattern) {
        recordEdit(beforeState, afterPattern, currentPatternIndex, 'Set velocity');
      }
    },
    [pattern, currentPatternIndex, setCell]
  );

  // Set velocity for multiple notes (with undo — for single clicks, not drag)
  const setMultipleVelocities = useCallback(
    (noteIds: string[], velocity: number) => {
      if (!pattern || noteIds.length === 0) return;
      const beforeState = saveForUndo(pattern);

      const volumeValue = Math.round((velocity / 127) * 64);
      const volume = 0x10 + volumeValue;

      noteIds.forEach(noteId => {
        const [chIndexStr, startRowStr] = noteId.split('-');
        const chIndex = parseInt(chIndexStr, 10);
        const startRow = parseInt(startRowStr, 10);
        setCell(chIndex, startRow, { volume });
      });

      const afterPattern = useTrackerStore.getState().patterns[currentPatternIndex];
      if (afterPattern) {
        recordEdit(beforeState, afterPattern, currentPatternIndex, `Set velocity (${noteIds.length} notes)`);
      }
    },
    [pattern, currentPatternIndex, setCell]
  );

  // ---- Velocity drag helpers (no per-move undo, only on begin/end) ----

  // Ref to hold undo snapshot during velocity drag
  const velocityDragBeforeRef = useRef<Pattern | null>(null);

  // Call on mouseDown to snapshot undo state before drag
  const beginVelocityDrag = useCallback(() => {
    if (!pattern) return;
    velocityDragBeforeRef.current = saveForUndo(pattern);
  }, [pattern]);

  // Apply velocity without recording undo (used during drag)
  const setVelocityNoUndo = useCallback(
    (noteId: string, velocity: number) => {
      const [chIndexStr, startRowStr] = noteId.split('-');
      const chIndex = parseInt(chIndexStr, 10);
      const startRow = parseInt(startRowStr, 10);
      const volumeValue = Math.round((velocity / 127) * 64);
      const volume = 0x10 + volumeValue;
      setCell(chIndex, startRow, { volume });
    },
    [setCell]
  );

  // Apply velocity to multiple notes without recording undo (used during drag)
  const setMultipleVelocitiesNoUndo = useCallback(
    (noteIds: string[], velocity: number) => {
      const volumeValue = Math.round((velocity / 127) * 64);
      const volume = 0x10 + volumeValue;
      noteIds.forEach(noteId => {
        const [chIndexStr, startRowStr] = noteId.split('-');
        const chIndex = parseInt(chIndexStr, 10);
        const startRow = parseInt(startRowStr, 10);
        setCell(chIndex, startRow, { volume });
      });
    },
    [setCell]
  );

  // Call on mouseUp to commit the single undo entry for the whole drag
  const endVelocityDrag = useCallback(() => {
    if (!velocityDragBeforeRef.current) return;
    const afterPattern = useTrackerStore.getState().patterns[currentPatternIndex];
    if (afterPattern) {
      recordEdit(velocityDragBeforeRef.current, afterPattern, currentPatternIndex, 'Adjust velocity');
    }
    velocityDragBeforeRef.current = null;
  }, [currentPatternIndex]);

  // Toggle slide on notes
  const toggleSlide = useCallback(
    (noteIds: string[], slide: boolean) => {
      if (!pattern || noteIds.length === 0) return;
      const beforeState = saveForUndo(pattern);

      noteIds.forEach(noteId => {
        const [chIndexStr, startRowStr] = noteId.split('-');
        const chIndex = parseInt(chIndexStr, 10);
        const startRow = parseInt(startRowStr, 10);
        setCell(chIndex, startRow, { flag2: slide ? 2 : 0 });
      });

      const afterPattern = useTrackerStore.getState().patterns[currentPatternIndex];
      if (afterPattern) {
        recordEdit(beforeState, afterPattern, currentPatternIndex, 'Toggle slide');
      }
    },
    [pattern, currentPatternIndex, setCell]
  );

  // Toggle accent on notes
  const toggleAccent = useCallback(
    (noteIds: string[], accent: boolean) => {
      if (!pattern || noteIds.length === 0) return;
      const beforeState = saveForUndo(pattern);

      noteIds.forEach(noteId => {
        const [chIndexStr, startRowStr] = noteId.split('-');
        const chIndex = parseInt(chIndexStr, 10);
        const startRow = parseInt(startRowStr, 10);
        setCell(chIndex, startRow, { flag1: accent ? 1 : 0 });
      });

      const afterPattern = useTrackerStore.getState().patterns[currentPatternIndex];
      if (afterPattern) {
        recordEdit(beforeState, afterPattern, currentPatternIndex, 'Toggle accent');
      }
    },
    [pattern, currentPatternIndex, setCell]
  );

  // Quantize notes to grid
  const quantizeNotes = useCallback(
    (noteIds: string[], gridDivision: number) => {
      if (!pattern || noteIds.length === 0) return;
      const beforeState = saveForUndo(pattern);

      const gridStep = Math.max(1, Math.floor(4 / gridDivision));

      noteIds.forEach(noteId => {
        const note = notes.find(n => n.id === noteId);
        if (!note) return;

        const quantizedRow = Math.round(note.startRow / gridStep) * gridStep;
        if (quantizedRow === note.startRow) return; // Already on grid

        const duration = note.endRow - note.startRow;

        // Delete old
        const [chIndexStr, startRowStr] = noteId.split('-');
        const chIndex = parseInt(chIndexStr, 10);
        const startRow = parseInt(startRowStr, 10);
        setCell(chIndex, startRow, { note: 0, volume: 0 });
        if (note.endRow < (pattern?.length || 64)) {
          // Read live pattern state to avoid stale closure reference
          const livePattern = useTrackerStore.getState().patterns[currentPatternIndex];
          const endCell = livePattern?.channels[chIndex]?.rows[note.endRow];
          if (endCell?.note === 97) {
            setCell(chIndex, note.endRow, { note: 0 });
          }
        }

        // Add at quantized position
        const xmNote = midiToXMNote(note.midiNote);
        const volumeValue = Math.round((note.velocity / 127) * 64);
        const volume = 0x10 + volumeValue;
        setCell(note.channelIndex, quantizedRow, { note: xmNote, volume });
        if (quantizedRow + duration < (pattern?.length || 64)) {
          setCell(note.channelIndex, quantizedRow + duration, { note: 97 });
        }
      });

      const afterPattern = useTrackerStore.getState().patterns[currentPatternIndex];
      if (afterPattern) {
        recordEdit(beforeState, afterPattern, currentPatternIndex, 'Quantize notes');
      }
    },
    [notes, pattern, currentPatternIndex, setCell]
  );

  // Paste notes from clipboard
  const pasteNotes = useCallback(
    (clipboard: PianoRollClipboard, targetRow: number, targetNote: number, targetChannel?: number) => {
      if (!pattern || clipboard.notes.length === 0) return;
      const beforeState = saveForUndo(pattern);

      const rowOffset = targetRow - clipboard.minRow;
      const noteOffset = targetNote - clipboard.minNote;
      const chTarget = targetChannel ?? channelIndex ?? 0;

      clipboard.notes.forEach(note => {
        const newStartRow = note.startRow + rowOffset;
        const newMidiNote = Math.max(0, Math.min(127, note.midiNote + noteOffset));
        const duration = note.endRow - note.startRow;

        if (newStartRow < 0 || newStartRow >= (pattern?.length || 64)) return;

        const xmNote = midiToXMNote(newMidiNote);
        const volumeValue = Math.round((note.velocity / 127) * 64);
        const volume = 0x10 + volumeValue;

        setCell(chTarget, newStartRow, { note: xmNote, volume });
        if (newStartRow + duration < (pattern?.length || 64)) {
          setCell(chTarget, newStartRow + duration, { note: 97 });
        }
      });

      const afterPattern = useTrackerStore.getState().patterns[currentPatternIndex];
      if (afterPattern) {
        recordEdit(beforeState, afterPattern, currentPatternIndex, 'Paste notes');
      }
    },
    [channelIndex, pattern, currentPatternIndex, setCell]
  );

  return {
    notes,
    pattern,
    addNote,
    deleteNote,
    deleteNotes,
    moveNote,
    resizeNote,
    setNoteVelocity,
    setMultipleVelocities,
    beginVelocityDrag,
    setVelocityNoUndo,
    setMultipleVelocitiesNoUndo,
    endVelocityDrag,
    toggleSlide,
    toggleAccent,
    quantizeNotes,
    pasteNotes,
  };
}
