import { dmIndexToNote, noteToDMIndex } from '@/lib/import/formats/DigitalMugicianNotes';

/**
 * The replayer's note byte a MIDI key plays for an instrument of finetune group `fineTune`.
 * The grid names a note by the period the replayer plays (the note byte looked up in the
 * instrument's finetune group, which runs up to a semitone flat), and shows grid note key - 11,
 * so the byte is the one whose period in that group is named by that note.
 */
export function dmNoteForKey(midi: number, fineTune = 0): number {
  const grid = midi - 11;
  const base = fineTune << 6;
  for (let n = 0; n < 64; n++) if (dmIndexToNote(n + base) === grid) return n;
  return noteToDMIndex(grid);
}
