import { useEffect } from 'react';
import * as Tone from 'tone';
import { getPadMappingManager, type PadMapping } from '../midi/PadMappingManager';
import { ToneEngine } from '../engine/ToneEngine';
import { useInstrumentStore, useTrackerStore, useTransportStore, useSettingsStore } from '../stores';
import { stringNoteToXM } from '../lib/xmConversions';

export function usePadTriggers() {
  // Use store references for recording logic to avoid re-subscribing on every tick
  // We'll get fresh state inside handleTrigger
  
  useEffect(() => {
    const padManager = getPadMappingManager();
    const engine = ToneEngine.getInstance();
    
    // Initialize manager
    padManager.init();

    const handleTrigger = (mapping: PadMapping, velocity: number) => {
      // Find instrument in store
      const currentInstruments = useInstrumentStore.getState().instruments;
      const instrument = currentInstruments.find(i => i.id === mapping.targetInstrumentId);
      
      if (!instrument) return;

      const midiNote = mapping.targetNote ?? 60; // C4 default
      const noteName = Tone.Frequency(midiNote, "midi").toNote();
      
      // Format for XM: C4 -> C-4, C#4 -> C#4
      const trackerNote = noteName.length === 2 
        ? noteName.charAt(0) + '-' + noteName.charAt(1) 
        : noteName;
      
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

        // RECORDING LOGIC
        const tStore = useTrackerStore.getState();
        const transStore = useTransportStore.getState();

        if (tStore.recordMode) {
          // Determine target row (playback row if playing, cursor row if stopped)
          const targetRow = transStore.isPlaying ? transStore.currentRow : tStore.cursor.rowIndex;
          
          // Determine target channel
          let targetChannel = tStore.cursor.channelIndex;
          
          // Use multi-channel allocation if enabled (for drum kits)
          if (tStore.multiRecEnabled && transStore.isPlaying) {
            targetChannel = tStore.findBestChannel();
          }

          // Convert to XM note number
          const xmNote = stringNoteToXM(trackerNote);

          // Write to pattern
          tStore.setCell(targetChannel, targetRow, {
            note: xmNote,
            instrument: instrument.id
          });

          // Advance cursor if not playing (standard tracker behavior)
          if (!transStore.isPlaying && tStore.editStep > 0) {
            const currentPattern = tStore.patterns.find(p => p.id === tStore.currentPatternId);
            if (currentPattern) {
              const nextRow = (targetRow + tStore.editStep) % currentPattern.length;
              tStore.moveCursorToRow(nextRow);
            }
          }
        }
      } else {
        // Note Off
        engine.triggerPolyNoteRelease(
          instrument.id,
          noteName,
          { ...instrument, isLive: true } // Force Live mode for pad triggers
        );

        // RECORD RELEASE (optional, usually not for drums but good for consistency)
        const tStore = useTrackerStore.getState();
        const transStore = useTransportStore.getState();
        const settings = useSettingsStore.getState();

        if (tStore.recordMode && transStore.isPlaying && settings.recReleaseEnabled) {
          // Find where the note was recorded and place a key-off (97)
          // For simplicity, we just use the current playback row
          // In a real tracker, we'd track WHICH channel this specific pad hit was recorded into
          // But for pads (usually drums), release recording is often unwanted.
        }
      }
    };

    const unsubscribe = padManager.onTrigger(handleTrigger);
    return unsubscribe;
  }, []); // Only run once on mount
}
