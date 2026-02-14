/**
 * useAutoPreview - Triggers a short preview note when synth parameters change,
 * so the oscilloscope always shows the current waveform shape.
 */

import { useRef, useCallback, useEffect } from 'react';
import { getToneEngine } from '@engine/ToneEngine';
import { useInstrumentStore } from '@stores';
import type { InstrumentConfig, SynthType } from '@typedefs/instrument';

const PREVIEW_NOTE = 'C4';
const PREVIEW_VELOCITY = 0.3;
const RELEASE_DELAY_MS = 600;
const PREVIEW_DEBOUNCE_MS = 400; // Wait 400ms after last change before triggering preview

/** Synth types that don't produce useful audio from a simple note trigger */
const SKIP_PREVIEW_TYPES: Set<SynthType> = new Set([
  'Sam',
  'V2Speech' as SynthType,
  'DrumKit' as SynthType,
  'ChiptuneModule' as SynthType,
  'Player',
  // MAME speech synths - preview note just produces a tone, not useful
  'MAMESP0250' as SynthType,
  'MAMEMEA8000' as SynthType,
  'MAMEVotrax' as SynthType,
  'MAMEUPD931' as SynthType,
  // MAME TMS5220 - knob preview plays MIDI tones, not speech
  'MAMETMS5220' as SynthType,
  // ROM-based drum machines
  'MAMETR707' as SynthType,
]);

export function useAutoPreview(instrumentId: number, instrument: InstrumentConfig) {
  const isPlayingRef = useRef(false);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerPreview = useCallback(() => {
    // Auto-preview disabled - user will trigger notes manually
    // Parameters still update live on manually triggered notes and during transport playback
    return;
  }, []);

  // Cleanup on unmount: release any active preview note immediately
  useEffect(() => {
    return () => {
      // Clear debounce timer
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // Clear release timer
      if (releaseTimerRef.current !== null) {
        clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
      // Release any active preview note
      if (isPlayingRef.current) {
        isPlayingRef.current = false;
        try {
          const engine = getToneEngine();
          const freshConfig = useInstrumentStore.getState().getInstrument(instrumentId);
          if (freshConfig) {
            engine.triggerPolyNoteRelease(instrumentId, PREVIEW_NOTE, freshConfig);
          }
        } catch {
          // Engine may not be available during teardown
        }
      }
    };
  }, [instrumentId]);

  return { triggerPreview };
}
