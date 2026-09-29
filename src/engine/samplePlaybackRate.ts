/**
 * The speed a sample instrument plays at for a written note: 1 = the sample
 * as recorded, 2 = an octave up (twice as fast, half as long).
 *
 * The two ways the engine pitches samples:
 * - period playback (MOD): the cell's own Amiga period when it has one (what
 *   the replayer plays - a finetuned or off-table period), else the period
 *   for the note in ProTracker naming (src/lib/amiga/periodNotes.ts: note 25
 *   = C-2 = 428, about the sample's recorded speed), clocked at
 *   periodMultiplier over the sample's own rate;
 * - otherwise the note against the sample's base note, a semitone per step
 *   (the keyboard path's freq(note) / freq(baseNote)).
 *
 * The analyzer uses it to judge a sample as it SOUNDS in the song (a drum
 * played three octaves up is not the thump its raw spectrum shows), and the
 * playback tracker to move the editor's playhead at the note's speed.
 */
import type { InstrumentConfig } from '@typedefs/instrument';
import { noteToMidi } from '@/lib/xmConversions';
import { cellPeriod } from '@/lib/amiga/periodNotes';

const AMIGA_PAL_CLOCK = 3546895;

export function samplePlaybackRate(inst: InstrumentConfig | undefined, xmNote: number, storedPeriod?: number): number {
  if (!inst || !(xmNote >= 1 && xmNote <= 96)) return 1;
  const mod = inst.metadata?.modPlayback;
  if (mod?.usePeriodPlayback) {
    const period = cellPeriod({ note: xmNote, period: storedPeriod }, mod.finetune ?? 0);
    if (period <= 0) return 1;
    return (mod.periodMultiplier || AMIGA_PAL_CLOCK) / period / (inst.sample?.sampleRate || 8363);
  }
  return 2 ** ((noteToMidi(xmNote) - noteToMidi(inst.sample?.baseNote ?? 'C4')) / 12);
}
