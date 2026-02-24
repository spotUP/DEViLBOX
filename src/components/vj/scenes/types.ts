/**
 * VJ Scene type definitions and audio hooks for Three.js scenes.
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { AudioDataBus, type VJAudioFrame } from '@engine/vj/AudioDataBus';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VJScenePreset {
  name: string;
  component: React.ComponentType<VJSceneProps>;
  description?: string;
  category?: string;
}

export interface VJSceneProps {
  /** Audio data refreshed each frame */
  audioRef: React.RefObject<VJAudioFrame | null>;
}

// ─── Audio hook for R3F scenes ─────────────────────────────────────────────────

/**
 * Hook that provides audio data inside a Three.js scene (R3F useFrame).
 * Creates an AudioDataBus and updates it each frame.
 */
export function useVJAudio(): React.RefObject<VJAudioFrame | null> {
  const busRef = useRef<AudioDataBus | null>(null);
  const frameRef = useRef<VJAudioFrame | null>(null);

  // Create bus once (useMemo for synchronous init before first render)
  useMemo(() => {
    const bus = new AudioDataBus();
    bus.enable();
    busRef.current = bus;
  }, []);

  // Cleanup on unmount (useEffect handles cleanup, not useMemo)
  useEffect(() => {
    return () => busRef.current?.disable();
  }, []);

  // Update each frame
  useFrame(() => {
    const bus = busRef.current;
    if (bus) {
      bus.update();
      frameRef.current = bus.getFrame();
    }
  });

  return frameRef;
}
