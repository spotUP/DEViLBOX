/**
 * The period a typed key plays on an Amiga-period Sampler instrument.
 *
 * In an Amiga-mode song the replayer plays a sample at AMIGA_PAL_HALF / period
 * Hz whatever rate the sample buffer was stored at (TrackerReplayer passes the
 * cell's period to ToneEngine). A key carries no period, so ToneEngine fell back
 * to the sample's base note: C3 at its stored rate, which is an octave under
 * the song for the grid note the key stands for (grid note n = MIDI n + 11; the
 * Amiga naming is 25 = C-2 = period 428 = 8287 Hz) and off by the rate ratio for
 * every format that stores a different rate. The key now takes the same period
 * the grid note has, from the one table every Amiga cell uses.
 */
import { noteToPeriod } from '@/lib/amiga/periodNotes';

/** Grid note of a Tone note name ("C2" -> 25), the inverse of xmNoteToToneJS. */
export function gridNoteOfName(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d+)$/.exec(name.replace('-', ''));
  if (!m) return 0;
  const semis: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = 12 * (parseInt(m[3], 10) + 1) + semis[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return midi - 11;
}

/**
 * Period for a key, or `given` when the caller already has one (the replayer),
 * or undefined when the instrument does not play by period or the song is an
 * XM-style one (note numbers, not periods).
 */
export function keyboardPeriod(
  modPlayback: { usePeriodPlayback?: boolean } | undefined,
  note: string,
  amigaMode: boolean,
  given?: number,
): number | undefined {
  if (given) return given;
  if (!modPlayback?.usePeriodPlayback || !amigaMode) return undefined;
  return noteToPeriod(gridNoteOfName(note)) || undefined;
}
