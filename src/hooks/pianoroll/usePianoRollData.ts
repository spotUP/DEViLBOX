/**
 * usePianoRollData - Convert tracker pattern data to piano roll notes
 */

import { useMemo, useCallback } from 'react';
import { useTrackerStore } from '../../stores';
import type { Pattern, TrackerCell } from '../../types/tracker';
import type { PianoRollNote } from '../../types/pianoRoll';
import { trackerNoteToMidi } from '../../midi/types';

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
    // Note-off marker ends the note
    if (cell.note === '===') {
      return row - startRow;
    }
    // Next note starts (not empty or note-off)
    if (cell.note && cell.note !== '---' && cell.note !== '===') {
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

      // Skip empty cells, rests, and note-offs
      if (!cell.note || cell.note === '---' || cell.note === '===') {
        continue;
      }

      // Parse note to MIDI
      const midiNote = trackerNoteToMidi(cell.note);
      if (midiNote === null) continue;

      // Calculate duration
      const duration = calculateNoteDuration(channel.rows, row, pattern.length);

      // Convert volume to velocity (tracker volume is 0x00-0x40, velocity is 0-127)
      const velocity = cell.volume !== null
        ? Math.round((cell.volume / 64) * 127)
        : 100; // Default velocity

      notes.push({
        id: generateNoteId(actualChannelIndex, row),
        channelIndex: actualChannelIndex,
        startRow: row,
        endRow: row + duration,
        midiNote,
        velocity,
        instrument: cell.instrument,
      });
    }
  });

  return notes;
}

/**
 * Hook to get piano roll notes from current pattern
 */
export function usePianoRollData(channelIndex?: number) {
  const { patterns, currentPatternIndex, setCell } = useTrackerStore();
  const pattern = patterns[currentPatternIndex];

  // Convert pattern to notes
  const notes = useMemo(() => {
    if (!pattern) return [];
    return patternToPianoRollNotes(pattern, channelIndex);
  }, [pattern, channelIndex]);

  // Add a note
  const addNote = useCallback(
    (midiNote: number, startRow: number, duration: number, velocity: number = 100, chIndex?: number) => {
      const targetChannel = chIndex ?? channelIndex ?? 0;

      // Convert MIDI note to tracker note string
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const octave = Math.floor(midiNote / 12) - 1;
      const noteName = noteNames[midiNote % 12];
      const trackerNote = noteName.includes('#')
        ? `${noteName}${octave}`
        : `${noteName}-${octave}`;

      // Convert velocity to volume (0-127 -> 0x00-0x40)
      const volume = Math.round((velocity / 127) * 64);

      // Set the note
      setCell(targetChannel, startRow, { note: trackerNote, volume });

      // Add note-off at end if within pattern
      if (startRow + duration < (pattern?.length || 64)) {
        setCell(targetChannel, startRow + duration, { note: '===' });
      }
    },
    [channelIndex, pattern, setCell]
  );

  // Delete a note
  const deleteNote = useCallback(
    (noteId: string) => {
      const [chIndexStr, startRowStr] = noteId.split('-');
      const chIndex = parseInt(chIndexStr, 10);
      const startRow = parseInt(startRowStr, 10);

      // Find the note to get its duration
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;

      // Clear the note cell
      setCell(chIndex, startRow, { note: '---', volume: null });

      // Clear any note-off that might be at the end
      if (note.endRow < (pattern?.length || 64)) {
        const endCell = pattern?.channels[chIndex]?.rows[note.endRow];
        if (endCell?.note === '===') {
          setCell(chIndex, note.endRow, { note: '---' });
        }
      }
    },
    [notes, pattern, setCell]
  );

  // Move a note
  const moveNote = useCallback(
    (noteId: string, deltaRow: number, deltaPitch: number) => {
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;

      const newStartRow = Math.max(0, note.startRow + deltaRow);
      const newMidiNote = Math.max(0, Math.min(127, note.midiNote + deltaPitch));
      const duration = note.endRow - note.startRow;

      // Delete old note
      deleteNote(noteId);

      // Add new note at new position
      addNote(newMidiNote, newStartRow, duration, note.velocity, note.channelIndex);
    },
    [notes, deleteNote, addNote]
  );

  // Resize a note
  const resizeNote = useCallback(
    (noteId: string, newEndRow: number) => {
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;

      const newDuration = Math.max(1, newEndRow - note.startRow);

      // Delete old note
      deleteNote(noteId);

      // Add note with new duration
      addNote(note.midiNote, note.startRow, newDuration, note.velocity, note.channelIndex);
    },
    [notes, deleteNote, addNote]
  );

  // Set note velocity
  const setNoteVelocity = useCallback(
    (noteId: string, velocity: number) => {
      const [chIndexStr, startRowStr] = noteId.split('-');
      const chIndex = parseInt(chIndexStr, 10);
      const startRow = parseInt(startRowStr, 10);

      const volume = Math.round((velocity / 127) * 64);
      setCell(chIndex, startRow, { volume });
    },
    [setCell]
  );

  return {
    notes,
    pattern,
    addNote,
    deleteNote,
    moveNote,
    resizeNote,
    setNoteVelocity,
  };
}
