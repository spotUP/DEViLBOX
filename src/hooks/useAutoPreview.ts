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

  const triggerPreview = useCallback(() => {
    // Skip for non-tonal types
    if (SKIP_PREVIEW_TYPES.has(instrument.synthType)) return;

    const engine = getToneEngine();

    // Reset the release timer on every call
    if (releaseTimerRef.current !== null) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }

    // Attack on first call (or if previous note already released)
    if (!isPlayingRef.current) {
      isPlayingRef.current = true;
      engine.triggerPolyNoteAttack(instrumentId, PREVIEW_NOTE, PREVIEW_VELOCITY, instrument);
    }

    // Schedule release after idle period
    releaseTimerRef.current = setTimeout(() => {
      if (isPlayingRef.current) {
        isPlayingRef.current = false;
        // Use fresh config from store — parameters may have changed since attack
        const freshConfig = useInstrumentStore.getState().getInstrument(instrumentId);
        if (freshConfig) {
          engine.triggerPolyNoteRelease(instrumentId, PREVIEW_NOTE, freshConfig);
        }
      }
      releaseTimerRef.current = null;
    }, RELEASE_DELAY_MS);
  }, [instrumentId, instrument]);

  // Cleanup on unmount: release any active preview note immediately
  useEffect(() => {
    return () => {
      if (releaseTimerRef.current !== null) {
        clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
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
