/**
 * DeltaMusic1Notes.ts - Delta Music 1.0 period table and its note naming.
 *
 * The replayer plays a note row as Periods[note + transpose] (DeltaMusic10
 * CalculateFrequency; the arpeggio adds its step to the same index). The
 * table is not one semitone per index: 1016 is missing between 1076 and 960,
 * so indices 1..33 sit one semitone lower than their neighbours above 34
 * would suggest, and 72..83 all hold 113.
 *
 * Names follow the one Amiga naming (src/lib/amiga/periodNotes.ts, period
 * 428 = C-2): a DM1 pitch is named by the period it plays. Index 25 (1712) is
 * C-0 = note 1, index 36 (856) is C-1 = 13. Indices 1..24 (6848..1808) lie
 * below C-0, which a grid cell cannot hold; they read as C-0. Indices 72..83
 * read as B-3 (113), what they play. The pattern codec keeps every note byte
 * exact through its `period` carrier.
 */
import { noteToPeriod, periodToNote } from '@/lib/amiga/periodNotes';

/** Source: NostalgicPlayer DeltaMusic10/Tables.cs (84 entries, index 0 = no note). */
export const DM1_PERIODS: readonly number[] = [
     0, 6848, 6464, 6096, 5760, 5424, 5120, 4832, 4560, 4304, 4064, 3840,
  3616, 3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920,
  1808, 1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076,  960,  904,
   856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  452,
   428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
   214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
   113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,  113,
];

/** Last index with its own period (71 = 113); 72..83 repeat it. */
const DM1_LAST_DISTINCT = 71;

/**
 * The note a DM1 period index plays (note byte + track transpose), in
 * periodNotes naming; 0 for no note. The player adds note and transpose as
 * bytes, so the index wraps at 256; past the table's end it is clamped to
 * the last entry.
 */
export function dm1IndexToNote(index: number): number {
  const i = index & 0xff;
  if (i === 0) return 0;
  return periodToNote(DM1_PERIODS[Math.min(i, DM1_PERIODS.length - 1)]);
}

/**
 * The DM1 period index that plays a note (periodNotes naming), for writing a
 * grid note back as a note byte; 0 for no note. Notes the table lacks (10 =
 * A-0, between 1076 and 960) take the nearest period.
 */
export function noteToDM1Index(note: number): number {
  const period = noteToPeriod(note);
  if (!(period > 0)) return 0;
  let best = 0, bestDiff = Infinity;
  for (let i = 1; i <= DM1_LAST_DISTINCT; i++) {
    const diff = Math.abs(DM1_PERIODS[i] - period);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
}
