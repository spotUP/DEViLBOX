/**
 * SoundMonNotes.ts - BP SoundMon period table and its note naming.
 *
 * The replayer plays a note row as bpper[note + transpose - 1] (Soundmon2.2.s
 * bpnext: `add.b tr,d3; ext.w d3; move.w -2(a4,d3.w)` - a byte add, sign
 * extended), a 48-entry table from 856 (C-1). The table below is the
 * NostalgicPlayer/FlodJS extension of it, indexed note + 35, so note 1 is
 * index 36 (856) and the out-of-table notes some modules reach keep a pitch.
 *
 * Names follow the one Amiga naming (src/lib/amiga/periodNotes.ts, period
 * 428 = C-2): a SoundMon pitch is named by the period it plays. Note 1 (856)
 * is C-1 = 13; note -11 (1712) is C-0 = 1. Notes below -11 lie below C-0,
 * which a grid cell cannot hold; they read as C-0. The pattern codec keeps
 * every note byte exact through its `period` carrier.
 */
import { noteToPeriod, periodToNote } from '@/lib/amiga/periodNotes';

/** Source: FlodJS BPPlayer PERIODS (84 entries, index = note + 35). */
export const BP_PERIODS: readonly number[] = [
  6848, 6464, 6080, 5760, 5440, 5120, 4832, 4576, 4320, 4064, 3840, 3616,
  3424, 3232, 3040, 2880, 2720, 2560, 2416, 2288, 2160, 2032, 1920, 1808,
  1712, 1616, 1520, 1440, 1360, 1280, 1208, 1144, 1080, 1016,  960,  904,
   856,  808,  760,  720,  680,  640,  604,  572,  540,  508,  480,  452,
   428,  404,  380,  360,  340,  320,  302,  286,  270,  254,  240,  226,
   214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
   107,  101,   95,   90,   85,   80,   76,   72,   68,   64,   60,   57,
];

const BP_INDEX_OFFSET = 35;

/** The player's byte add of note and transpose, sign-extended. */
export function bpPlayedNote(note: number, transpose: number): number {
  return ((note + transpose) << 24) >> 24;
}

/**
 * The note a SoundMon note value plays (after transpose, see bpPlayedNote),
 * in periodNotes naming; 0 for no note or a value outside the table.
 */
export function bpNoteToNote(played: number): number {
  const idx = played + BP_INDEX_OFFSET;
  if (idx < 0 || idx >= BP_PERIODS.length) return 0;
  return periodToNote(BP_PERIODS[idx]);
}

/**
 * The SoundMon note value that plays a note (periodNotes naming), for
 * writing a grid note back as a note byte; 0 for no note.
 */
export function noteToBpNote(note: number): number {
  const period = noteToPeriod(note);
  if (!(period > 0)) return 0;
  let best = 0, bestDiff = Infinity;
  for (let i = 0; i < BP_PERIODS.length; i++) {
    const diff = Math.abs(BP_PERIODS[i] - period);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  const value = best - BP_INDEX_OFFSET;
  // Value 0 means "no note", so B-0 (904) cannot be written without a
  // transpose; it takes C-1 (value 1), the nearest playable pitch.
  return value === 0 ? 1 : value;
}
