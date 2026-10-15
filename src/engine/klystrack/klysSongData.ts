/**
 * The klystrack song data the WASM engine extracts after a load (its 'songData' message), applied to the
 * format store. ONE builder and ONE writer: KlysView and the engine registry each wrote klysNative from
 * this message before, and only KlysView nested the FM fields the instrument editor reads (inst.fm), so
 * whichever ran last decided whether the instrument editor worked.
 */
import { useFormatStore } from '@stores/useFormatStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import type { KlysNativeData, KlysNativeInstrument } from '@/types/tracker';
import type { KlysSongData } from './KlysEngine';
import { klysInstrumentId } from './klysInstrumentFields';

type EngineInstrument = NonNullable<KlysSongData['instruments'][number]>;

/** One engine instrument in the store's shape: the flat fm* fields nested under `fm`. */
export function klysInstrumentFromEngine(i: EngineInstrument): KlysNativeInstrument {
  const { fmFlags, fmModulation, fmFeedback, fmWave, fmHarmonic, fmAdsr, fmAttackStart, ...rest } = i;
  return {
    ...rest,
    fm: {
      flags: fmFlags, modulation: fmModulation, feedback: fmFeedback, wave: fmWave,
      harmonic: fmHarmonic, adsr: fmAdsr, attackStart: fmAttackStart,
    },
  };
}

/** `current` with the engine's patterns, sequences and instruments. */
export function klysNativeWithSongData(current: KlysNativeData, data: KlysSongData): KlysNativeData {
  return {
    ...current,
    patterns: data.patterns,
    sequences: data.sequences,
    instruments: data.instruments
      .filter((i): i is EngineInstrument => i !== null)
      .map(klysInstrumentFromEngine),
  };
}

/** Write the engine's song data into the loaded song's klysNative (nothing loaded: nothing to update). */
export function applyKlysSongData(data: KlysSongData): void {
  const current = useFormatStore.getState().klysNative;
  if (!current) return;
  const klysNative = klysNativeWithSongData(current, data);
  useFormatStore.setState({ klysNative, klysInstrumentUndoStack: [], klysInstrumentRedoStack: [] });
  // The instrument list shows the file's names: an unnamed instrument stays empty (the list shows its number).
  const { instruments, updateInstrument } = useInstrumentStore.getState();
  klysNative.instruments.forEach((inst, index) => {
    const config = instruments.find((c) => c.id === klysInstrumentId(index));
    if (config && config.name !== inst.name) updateInstrument(config.id, { name: inst.name });
  });
}
