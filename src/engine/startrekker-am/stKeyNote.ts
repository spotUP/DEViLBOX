import { noteToPeriod } from '@/lib/amiga/periodNotes';

/**
 * The Amiga period a MOD keyboard key plays for StarTrekker AM: the grid note the key stands for (key - 11)
 * in the one Amiga naming (period 428 = C-2 = note 25, periodNotes.ts), the period a cell with that note has.
 */
export function stPeriodForKey(midi: number): number {
  const p = noteToPeriod(midi - 11);
  return p >= 113 && p <= 856 ? p : 0;   // the replayer's ProTracker range
}
