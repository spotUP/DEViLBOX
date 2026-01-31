import { useEffect } from 'react';
import * as Tone from 'tone';
import { getPadMappingManager, type PadMapping } from '../midi/PadMappingManager';
import { ToneEngine } from '../engine/ToneEngine';
import { useInstrumentStore } from '../stores';

export function usePadTriggers() {
  const instruments = useInstrumentStore((state) => state.instruments);

  useEffect(() => {
    const padManager = getPadMappingManager();
    const engine = ToneEngine.getInstance();
    
    // Initialize manager
    padManager.init();

    const handleTrigger = (mapping: PadMapping, velocity: number) => {
      // Find instrument in store (requires store access inside callback or ref)
      // Since instruments can change, better to get fresh state or find by ID
      const instrument = instruments.find(i => i.id === mapping.targetInstrumentId);
      
      if (!instrument) return;

      const midiNote = mapping.targetNote ?? 60; // C4 default
      const noteName = Tone.Frequency(midiNote, "midi").toNote();
      
      // Map MIDI velocity (0-127) to 0-1 range
      const vel = velocity / 127;

      if (velocity > 0) {
        // Note On
        engine.triggerPolyNoteAttack(
          instrument.id, 
          noteName, 
          vel,
          { ...instrument, isLive: true } // Force Live mode for pad triggers
        );
      } else {
        // Note Off
        engine.triggerPolyNoteRelease(
          instrument.id,
          noteName,
          { ...instrument, isLive: true } // Force Live mode for pad triggers
        );
      }
    };

    const unsubscribe = padManager.onTrigger(handleTrigger);
    return unsubscribe;
  }, [instruments]); // Re-subscribe if instruments list changes (to capture new ones)
}
