import { AMIGA_PERIODS, noteToPeriod } from '@/lib/amiga/periodNotes';

/**
 * The Paula period a MIDI key asks the David Whittaker preview for: the period of the grid note the key names
 * (grid note = key - 11, ProTracker naming through periodNotes.ts, the naming the grid uses). The replayer turns it
 * into the note byte that sounds that period with the key's sample (dw_preview_key in davidwhittaker.c), from the
 * loaded module's own period table, sample fine_tune_period and the channel transpose the preview runs the sample
 * with, so no copy of the song's pitch data is needed here. Keys past the period table (C-0..B-5) clamp to its ends.
 */
export function dwPeriodForKey(midi: number): number {
  return noteToPeriod(Math.max(1, Math.min(AMIGA_PERIODS.length, Math.round(midi) - 11)));
}
