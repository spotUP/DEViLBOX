/**
 * Instrument selection -> MIDI knobs. The MIDI controller always maps to
 * whatever instrument the user is looking at in the synth editor, not just on
 * MIDI note-on events.
 *
 * Lives here, called once at app init, so neither useMIDIStore nor
 * useInstrumentStore touches the other while its module loads (the store used
 * to subscribe from a microtask and then poll for the instrument store, S2).
 */
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useMIDIStore } from '@/stores/useMIDIStore';
import { getKnobBankForSynth } from './knobBanks';

let unsubscribe: (() => void) | null = null;

/** Subscribe once; a second call returns the existing subscription. Returns the unsubscribe. */
export function setupInstrumentSelectionSync(): () => void {
  if (unsubscribe) return unsubscribe;
  const stop = useInstrumentStore.subscribe((state, prevState) => {
    if (state.currentInstrumentId === prevState.currentInstrumentId) return;
    const instrument = state.instruments.find(i => i.id === state.currentInstrumentId);
    if (!instrument) return;

    // Defer to a microtask so the set() inside syncKnobsToSynth does not fire
    // subscribers synchronously in the middle of bulk instrument loading
    // (e.g. a song file import); it also keeps a whole song's worth of knob
    // syncs out of the import's own render pass.
    queueMicrotask(() => {
      const store = useMIDIStore.getState();
      const autoBank = getKnobBankForSynth(instrument.synthType);
      if (autoBank && store.knobBank !== autoBank) store.setKnobBank(autoBank);
      if (store.nksActiveSynthType !== instrument.synthType) store.syncKnobsToSynth(instrument.synthType);
    });
  });
  unsubscribe = () => { stop(); unsubscribe = null; };
  return unsubscribe;
}
