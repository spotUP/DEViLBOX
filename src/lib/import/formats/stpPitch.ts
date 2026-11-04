/**
 * SoundTracker Pro II note byte <-> grid note, through src/lib/amiga/periodNotes.ts.
 *
 * STP stores a 1-based note byte (0 = empty). OpenMPT reads it as
 * note = NOTE_MIDDLEC - 36 + byte = 25 + byte (C-5 = 61 = Amiga period 428, the
 * MOD identity, matching the 8287 Hz the parser gives samples). In grid naming
 * (428 = C-2 = note 25) that is: byte 36 plays period 428, so
 * grid note = periodToNote(428) + (byte - 36) = byte - 11, and byte 48 plays
 * period 214 = C-3 = note 37 (noname.stp's most common byte).
 *
 * Bytes 1..11 would play below the table's lowest period (1712 = note 1), so they
 * clamp to note 1 (C-0); the export of such a cell writes byte 12. Measured:
 * noname.stp holds no byte below 12.
 */
import { AMIGA_PERIODS, periodToNote, noteToPeriod } from '@/lib/amiga/periodNotes';

/** The STP byte that plays the reference period 428 (OpenMPT note 61 = C-5). */
const STP_BYTE_AT_PERIOD_428 = 36;
const REFERENCE_PERIOD = 428;

/** Grid note (1..72) for an STP note byte; 0 for an empty byte. */
export function stpByteToGridNote(stpByte: number): number {
  if (stpByte <= 0) return 0;
  const note = periodToNote(REFERENCE_PERIOD) + (stpByte - STP_BYTE_AT_PERIOD_428);
  return Math.max(1, Math.min(AMIGA_PERIODS.length, note));
}

/** STP note byte for a grid note, via the note's period; 0 for no note or out of range. */
export function gridNoteToStpByte(gridNote: number): number {
  const period = noteToPeriod(gridNote);
  if (!(period > 0)) return 0;
  return STP_BYTE_AT_PERIOD_428 + (periodToNote(period) - periodToNote(REFERENCE_PERIOD));
}
