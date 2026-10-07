/**
 * A sample of an instrument was edited: the loop moved, or the sample data changed.
 *
 * The instrument store is the one place the edit lands (useInstrumentStore.updateInstrument).
 * Everything that plays the sample is told from here, so a drag in a sample editor is heard by
 * every player of that sample and not only drawn:
 *
 *  - the keyboard voice (ToneEngine's Sampler / Player): ToneEngine.applySampleLoop, called by the
 *    store, or a rebuild when the data changed;
 *  - the libopenmpt song player (MOD, XM, IT, S3M): it plays its own copy of the module, held in
 *    the OpenMPT soundlib; the edit is written into that copy and the player hot-reloads it at the
 *    current position (OpenMPTEditBridge.syncSampleEdit);
 *  - the other native engines, which play the bytes the song was loaded with: the song is marked
 *    sample-edited, so the next play loads the module the native export writes from the stores
 *    (editedModuleForPlay), as it does for a grid edit.
 */
import type { SampleConfig } from '@typedefs/instrument';
import { markSampleEdited } from './gridBaseline';

export interface SampleEdit {
  /** loop on/off, type, start or end moved */
  loop: boolean;
  /** the sample's PCM, rate, base note or slice changed: voices must be rebuilt */
  data: boolean;
}

/** What differs between two states of one instrument's sample. */
export function classifySampleEdit(before: SampleConfig | undefined, after: SampleConfig | undefined): SampleEdit {
  if (!before || !after) return { loop: false, data: before !== after };
  const loop = before.loop !== after.loop || (before.loopType ?? 'off') !== (after.loopType ?? 'off')
    || before.loopStart !== after.loopStart || before.loopEnd !== after.loopEnd;
  const data = before.url !== after.url || before.audioBuffer !== after.audioBuffer
    || before.baseNote !== after.baseNote || before.sampleRate !== after.sampleRate
    || before.multiMap !== after.multiMap || before.sliceStart !== after.sliceStart || before.sliceEnd !== after.sliceEnd;
  return { loop, data };
}

/** Tell the song players that hold their own copy of the sample. */
export function propagateSampleEditToSong(instrumentId: number, sample: SampleConfig | undefined, edit: SampleEdit): void {
  if (!sample || (!edit.loop && !edit.data)) return;
  markSampleEdited();
  void import('@engine/libopenmpt/OpenMPTEditBridge')
    .then((bridge) => bridge.syncSampleEdit(instrumentId, sample, edit))
    .catch((err) => console.warn('[sampleEdit] the libopenmpt copy of the sample could not be updated:', err));
}
