/**
 * The klystrack song data the WASM engine extracts after a load (its 'songData' message), applied to the
 * format store. ONE builder and ONE writer: KlysView and the engine registry each wrote klysNative from
 * this message before, and only KlysView nested the FM fields the instrument editor reads (inst.fm), so
 * whichever ran last decided whether the instrument editor worked.
 */
import { useFormatStore } from '@stores/useFormatStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import type { KlysNativeData, KlysNativeInstrument } from '@/types/tracker';
import { KlysEngine, type KlysSongData } from './KlysEngine';
import { klysStubInstrument } from '@/lib/import/formats/KlysParser';
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

/**
 * `current` with the engine's patterns, sequences and instruments.
 *
 * Instrument position IS the instrument index (InstrumentConfig.id - 1), so the list keeps every slot. The worklet
 * posts null for a slot whose klys_get_instrument_data read failed; that slot keeps what the store already holds
 * (the parser's placeholder), never shifts the later ones.
 *
 * A song whose instruments were edited ('edited', a reopened project) keeps them: the engine's copy is the original
 * file's, and applying it would throw the edits away.
 */
export function klysNativeWithSongData(current: KlysNativeData, data: KlysSongData): KlysNativeData {
  const base = { ...current, patterns: data.patterns, sequences: data.sequences };
  if (current.instrumentsFrom === 'edited') return base;
  return {
    ...base,
    instrumentsFrom: 'engine',
    instruments: data.instruments.map((i, index) => (i ? klysInstrumentFromEngine(i) : current.instruments[index] ?? klysStubInstrument())),
  };
}

/** One store instrument in the engine's shape (the inverse of klysInstrumentFromEngine). */
export function klysInstrumentToEngine(i: KlysNativeInstrument): EngineInstrument {
  const { fm, ...rest } = i;
  return {
    ...rest,
    fmFlags: fm.flags, fmModulation: fm.modulation, fmFeedback: fm.feedback, fmWave: fm.wave,
    fmHarmonic: fm.harmonic, fmAdsr: fm.adsr, fmAttackStart: fm.attackStart,
  };
}

/** Write the engine's song data into the loaded song's klysNative (nothing loaded: nothing to update). */
export function applyKlysSongData(data: KlysSongData): void {
  const current = useFormatStore.getState().klysNative;
  if (!current) return;
  const klysNative = klysNativeWithSongData(current, data);
  if (current.instrumentsFrom === 'edited') {
    // A reopened project: the edits live in the store; the engine holds the original file's instruments.
    const engine = KlysEngine.getInstance();
    current.instruments.forEach((inst, index) => engine.setInstrumentData(index, klysInstrumentToEngine(inst)));
    useFormatStore.setState({ klysNative });
  } else {
    useFormatStore.setState({ klysNative, klysInstrumentUndoStack: [], klysInstrumentRedoStack: [] });
  }
  // The instrument list shows the file's names: an unnamed instrument stays empty (the list shows its number).
  const { instruments, updateInstrument } = useInstrumentStore.getState();
  klysNative.instruments.forEach((inst, index) => {
    const config = instruments.find((c) => c.id === klysInstrumentId(index));
    if (config && config.name !== inst.name) updateInstrument(config.id, { name: inst.name });
  });
}
