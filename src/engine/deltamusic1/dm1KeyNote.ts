import { noteToDM1Index } from '@/lib/import/formats/DeltaMusic1Notes';

/**
 * The replayer's note (a period-table index; the track transpose is 0 for a key) a MIDI key
 * plays: the grid note is key - 11 and the grid names a note by the period it plays.
 */
export function dm1NoteForKey(midi: number): number {
  return noteToDM1Index(midi - 11);
}
