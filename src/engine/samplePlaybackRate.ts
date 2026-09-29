/**
 * The speed a sample instrument plays at for a written note: 1 = the sample
 * as recorded, 2 = an octave up (twice as fast, half as long).
 *
 * The two ways the engine pitches samples:
 * - period playback (MOD): the cell's own Amiga period when it has one -
 *   what the replayer plays (import paths disagree on the note NUMBER a
 *   period gets, the period is the truth) - else the period for the note,
 *   clocked at
 *   periodMultiplier, over the sample's own rate. Notes follow the MOD codec's
 *   XM naming (MODParser / MODEncoder: XM 37 = period 856, XM 49 = 428,
 *   PeriodTables' internal note = XM - 1), so XM 49 plays the sample at about
 *   its recorded speed and XM 61 (ProTracker's C-3) twice as fast;
 * - otherwise the note against the sample's base note, a semitone per step
 *   (the keyboard path's freq(note) / freq(baseNote)).
 *
 * The analyzer uses it to judge a sample as it SOUNDS in the song (a drum
 * played three octaves up is not the thump its raw spectrum shows), and the
 * playback tracker to move the editor's playhead at the note's speed.
 */
import type { InstrumentConfig } from '@typedefs/instrument';
import { noteToMidi } from '@/lib/xmConversions';
import { getPeriodExtended } from '@/engine/effects/PeriodTables';

const AMIGA_PAL_CLOCK = 3546895;

export function samplePlaybackRate(inst: InstrumentConfig | undefined, xmNote: number, cellPeriod?: number): number {
  if (!inst || !(xmNote >= 1 && xmNote <= 96)) return 1;
  const mod = inst.metadata?.modPlayback;
  if (mod?.usePeriodPlayback) {
    const period = cellPeriod && cellPeriod > 0 ? cellPeriod : getPeriodExtended(Math.round(xmNote) - 1, mod.finetune ?? 0);
    if (period <= 0) return 1;
    return (mod.periodMultiplier || AMIGA_PAL_CLOCK) / period / (inst.sample?.sampleRate || 8363);
  }
  return 2 ** ((noteToMidi(xmNote) - noteToMidi(inst.sample?.baseNote ?? 'C4')) / 12);
}
