/**
 * VJ Scene type definitions and audio hooks for Three.js scenes.
 */

import { useRef } from 'react';
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
 * Uses the shared AudioDataBus singleton and updates it each frame.
 */
export function useVJAudio(): React.RefObject<VJAudioFrame | null> {
  const busRef = useRef<AudioDataBus | null>(null);
  const frameRef = useRef<VJAudioFrame | null>(null);

  if (!busRef.current) {
    busRef.current = AudioDataBus.getShared();
  }

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
