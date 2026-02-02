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

    // NUMERIC KEYBOARD MAPPING
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input fields
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      // Map Numpad 1-9 to Pad Indices 0-8 (Bank A)
      const numpadMap: Record<string, number> = {
        '1': 0, '2': 1, '3': 2,
        '4': 3, '5': 4, '6': 5,
        '7': 6, '8': 7, '9': 8,
        // Also support standard number keys
        'Digit1': 0, 'Digit2': 1, 'Digit3': 2,
        'Digit4': 3, 'Digit5': 4, 'Digit6': 5,
        'Digit7': 6, 'Digit8': 7, 'Digit9': 8,
        // Also support explicit Numpad codes
        'Numpad1': 0, 'Numpad2': 1, 'Numpad3': 2,
        'Numpad4': 3, 'Numpad5': 4, 'Numpad6': 5,
        'Numpad7': 6, 'Numpad8': 7, 'Numpad9': 8
      };

      const padIndex = numpadMap[e.code] || numpadMap[e.key];
      if (padIndex !== undefined) {
        // Find mapping for this pad index (Standard mapping: Ch 10, Note 36 + i)
        const inputNote = 36 + padIndex;
        const mapping = padManager.getMapping(9, inputNote);
        if (mapping) {
          handleTrigger(mapping, 127);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      const numpadMap: Record<string, number> = {
        '1': 0, '2': 1, '3': 2,
        '4': 3, '5': 4, '6': 5,
        '7': 6, '8': 7, '9': 8,
        'Digit1': 0, 'Digit2': 1, 'Digit3': 2,
        'Digit4': 3, 'Digit5': 4, 'Digit6': 5,
        'Digit7': 6, 'Digit8': 7, 'Digit9': 8,
        'Numpad1': 0, 'Numpad2': 1, 'Numpad3': 2,
        'Numpad4': 3, 'Numpad5': 4, 'Numpad6': 5,
        'Numpad7': 6, 'Numpad8': 7, 'Numpad9': 8
      };

      const padIndex = numpadMap[e.code] || numpadMap[e.key];
      if (padIndex !== undefined) {
        const inputNote = 36 + padIndex;
        const mapping = padManager.getMapping(9, inputNote);
        if (mapping) {
          handleTrigger(mapping, 0);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      unsubscribe();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []); // Only run once on mount
}
