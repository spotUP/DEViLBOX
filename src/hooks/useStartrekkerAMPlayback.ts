/**
 * useStartrekkerAMPlayback — Subscribe to StarTrekker AM voice state
 * to get real-time playback position for a specific instrument.
 */
import { useState, useEffect } from 'react';
import { StartrekkerAMEngine } from '@/engine/startrekker-am/StartrekkerAMEngine';

export function useStartrekkerAMPlayback(instrumentId: number, synthType: string | undefined): {
  isPlaying: boolean;
  position: number;  // 0-1 fraction, -1 if not playing
} {
  const [position, setPosition] = useState(-1);

  useEffect(() => {
    if (synthType !== 'StartrekkerAMSynth' && synthType !== 'Sampler') return;
    if (!StartrekkerAMEngine.hasInstance()) return;

    const engine = StartrekkerAMEngine.getInstance();
    const unsub = engine.onVoiceState(() => {
      const pos = engine.getInstrumentPosition(instrumentId);
      setPosition(pos);
    });

    return unsub;
  }, [instrumentId, synthType]);

  return {
    isPlaying: position >= 0,
    position,
  };
}
