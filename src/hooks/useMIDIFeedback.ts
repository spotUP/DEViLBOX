/**
 * useMIDIFeedback — MPK Mini pad LED feedback and OLED display sync
 *
 * Subscribes to transport, knob bank, and instrument state to:
 * - Flash pad LEDs on beat during playback
 * - Update the OLED display with BPM, bank name, and instrument info
 *
 * Only active when an MPK Mini MK3 is connected.
 */

import { useEffect, useRef } from 'react';
import { getMPKMiniDisplay } from '../midi/MPKMiniDisplay';
import { useTransportStore } from '../stores/useTransportStore';
import { useMIDIStore } from '../stores/useMIDIStore';
import { useInstrumentStore } from '../stores/useInstrumentStore';

export function useMIDIFeedback(): void {
  const isConnectedRef = useRef(false);

  // Subscribe to relevant state slices
  const bpm = useTransportStore(s => s.bpm);
  const knobBank = useMIDIStore(s => s.knobBank);
  const isInitialized = useMIDIStore(s => s.isInitialized);
  const currentInstrumentId = useInstrumentStore(s => s.currentInstrumentId);
  const instruments = useInstrumentStore(s => s.instruments);

  // Check connection on mount and when MIDI initializes
  useEffect(() => {
    if (!isInitialized) return;
    const display = getMPKMiniDisplay();
    isConnectedRef.current = display.checkConnection();

    if (isConnectedRef.current) {
      display.clearAllPadLEDs();
    }

    return () => {
      if (isConnectedRef.current) {
        display.clearAllPadLEDs();
      }
    };
  }, [isInitialized]);

  // Update OLED display when BPM, knob bank, or instrument changes
  useEffect(() => {
    if (!isConnectedRef.current) return;

    const display = getMPKMiniDisplay();
    const currentInstrument = instruments.find(i => i.id === currentInstrumentId);
    const instrumentName = currentInstrument?.name;

    display.updateStatusDisplay(bpm, knobBank, instrumentName);
  }, [bpm, knobBank, currentInstrumentId, instruments]);

  // Flash pad LEDs based on transport playback position (beat indicator)
  useEffect(() => {
    if (!isConnectedRef.current) return;

    const display = getMPKMiniDisplay();
    let prevRow = -1;
    let wasPlaying = false;

    const unsubscribe = useTransportStore.subscribe((state) => {
      if (!isConnectedRef.current) return;

      const { isPlaying, currentRow } = state;

      // Flash pad 0 on each beat (every 4 rows in standard 4/4 time)
      if (isPlaying && currentRow !== prevRow) {
        const beatIndex = currentRow % 4;
        if (beatIndex === 0) {
          display.flashPad(0, 80);
        }
      }

      // Clear all LEDs when playback stops
      if (!isPlaying && wasPlaying) {
        display.clearAllPadLEDs();
      }

      prevRow = currentRow;
      wasPlaying = isPlaying;
    });

    return unsubscribe;
  }, []);
}
