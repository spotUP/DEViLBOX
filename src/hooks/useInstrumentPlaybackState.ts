/**
 * useInstrumentPlaybackState — Track whether a specific instrument is currently
 * being played by the song (via ToneEngine or WASM engine).
 *
 * Returns { isPlaying, position } where position is 0-1 for sample instruments.
 * Updates at ~15Hz via requestAnimationFrame polling.
 */
import { useState, useEffect, useRef } from 'react';
import { getToneEngine } from '@engine/ToneEngine';
import { StartrekkerAMEngine } from '@/engine/startrekker-am/StartrekkerAMEngine';

export function useInstrumentPlaybackState(
  instrumentId: number,
  synthType: string | undefined,
  sampleDuration: number | undefined,
): { isPlaying: boolean; position: number } {
  const [state, setState] = useState({ isPlaying: false, position: 0 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    // StarTrekker AM — use the WASM voice state subscription
    if (synthType === 'StartrekkerAMSynth' && StartrekkerAMEngine.hasInstance()) {
      const engine = StartrekkerAMEngine.getInstance();
      const unsub = engine.onVoiceState(() => {
        const pos = engine.getInstrumentPosition(instrumentId);
        setState({ isPlaying: pos >= 0, position: Math.max(0, pos) });
      });
      return unsub;
    }

    // ToneEngine — poll active Player state via rAF
    let active = true;
    const poll = () => {
      if (!active) return;

      try {
        const engine = getToneEngine();
        // Check if this instrument has an active Player that's currently playing
        const instrument = engine.getInstrument(instrumentId, undefined as any);
        if (instrument && 'state' in instrument) {
          const player = instrument as any;
          if (player.state === 'started' && sampleDuration && sampleDuration > 0) {
            // Estimate position from Tone.js transport time
            const progress = player.progress ?? 0; // Tone.Player.progress: 0-1
            setState({ isPlaying: true, position: progress });
          } else {
            setState(prev => prev.isPlaying ? { isPlaying: false, position: 0 } : prev);
          }
        }
      } catch {
        // Engine not ready
      }

      rafRef.current = requestAnimationFrame(poll);
    };

    // Start polling at ~15Hz (every 4th rAF at 60fps)
    let frameCount = 0;
    const throttledPoll = () => {
      if (!active) return;
      frameCount++;
      if (frameCount % 4 === 0) {
        poll();
      } else {
        rafRef.current = requestAnimationFrame(throttledPoll);
      }
    };
    rafRef.current = requestAnimationFrame(throttledPoll);

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [instrumentId, synthType, sampleDuration]);

  return state;
}
