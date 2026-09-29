/**
 * Amiga period <-> tracker note, in ProTracker naming - the one naming every
 * Amiga-period cell in DEViLBOX uses (owner decision 2026-09-29).
 *
 *   period 856 = note 13 = C-1
 *   period 428 = note 25 = C-2
 *   period 214 = note 37 = C-3   (ProTracker's range is C-1..B-3, notes 13-48)
 *
 * The table extends an octave below and two above ProTracker's for the
 * formats that use them (1712 = note 1 = C-0 ... 28 = note 72 = B-5).
 *
 * Before this module the conversion was written out in some forty files
 * under five namings (this one, FT2's +24, an index -12, and two more), so
 * a MOD loaded one way exported two octaves off and grids written back
 * through the shared MOD encoder landed in the wrong octave. Every importer,
 * encoder, exporter and the replayer's fallback go through these two
 * functions.
 */
import { getPeriodExtended } from '@/engine/effects/PeriodTables';

/** Finetune-0 periods, index 0 = note 1 (C-0). */
export const AMIGA_PERIODS: readonly number[] = [
  1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 961, 907,  // C-0 (extended)
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,            // C-1
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,            // C-2
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,            // C-3
  107, 101, 95, 90, 85, 80, 75, 71, 67, 63, 60, 56,                      // C-4 (extended)
  53, 50, 47, 45, 42, 40, 37, 35, 33, 31, 30, 28,                        // C-5 (extended)
];

/** Note 13 (C-1) - the first note of ProTracker's own three octaves. */
export const PT_FIRST_NOTE = 13;
/** Note 48 (B-3) - the last. */
export const PT_LAST_NOTE = 48;

/** The note a period plays (nearest table entry); 0 for no period. */
export function periodToNote(period: number): number {
  if (!(period > 0)) return 0;
  let best = 0, bestDiff = Infinity;
  for (let i = 0; i < AMIGA_PERIODS.length; i++) {
    const diff = Math.abs(AMIGA_PERIODS[i] - period);
    if (diff < bestDiff) { bestDiff = diff; best = i + 1; }
  }
  return best;
}

/**
 * The note a period plays, read within ProTracker's own three octaves
 * (C-1..B-3, notes 13-48): the nearest of those, however far outside the
 * period lies. The classic ProTracker-family reading; 0 for no period.
 */
export function periodToPtNote(period: number): number {
  if (!(period > 0)) return 0;
  let best = PT_FIRST_NOTE, bestDiff = Infinity;
  for (let n = PT_FIRST_NOTE; n <= PT_LAST_NOTE; n++) {
    const diff = Math.abs(AMIGA_PERIODS[n - 1] - period);
    if (diff < bestDiff) { bestDiff = diff; best = n; }
  }
  return best;
}

/**
 * The period for a note (1 = C-0 ... 72 = B-5); 0 for no note or out of
 * range. A finetune (-8..7) takes ProTracker's finetuned table.
 */
export function noteToPeriod(note: number, finetune = 0): number {
  const n = Math.round(note);
  if (n < 1 || n > AMIGA_PERIODS.length) return 0;
  // PeriodTables numbers notes from its own origin: its 48 is period 428.
  if (finetune) return getPeriodExtended(n + 23, finetune);
  return AMIGA_PERIODS[n - 1];
}

/**
 * The period a cell plays: its own stored period while that still names the
 * cell's note (a finetuned or off-table period - Cinter's, SoundFX's - kept
 * byte-exact), else its note's period. An edit that moves the note (typing,
 * transposing, pasting a note without its period) leaves the old period
 * naming another note, so it stops counting - wherever it is read, with no
 * edit path having to remember to clear it. 0 for no note.
 */
export function cellPeriod(cell: { note?: number; period?: number } | undefined, finetune = 0): number {
  if (!cell || !cell.note || cell.note < 1 || cell.note > 96) return 0;
  // Readers clamp to ProTracker's three octaves or read the whole table; either naming counts.
  if (cell.period && cell.period > 0 && (periodToNote(cell.period) === cell.note || periodToPtNote(cell.period) === cell.note)) return cell.period;
  return noteToPeriod(cell.note, finetune);
}
