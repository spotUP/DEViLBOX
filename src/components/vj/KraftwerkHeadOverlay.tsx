/**
 * KraftwerkHeadOverlay — Transparent R3F canvas with the wireframe head,
 * rendered on top of Milkdrop/projectM visualizers.
 *
 * Always visible in VJ view. Mouth animates when speech synths are active.
 * Uses alpha:true so the visualizer shows through.
 *
 * Handles WebGL context loss by remounting the R3F Canvas.
 */

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useVJAudio } from './scenes/types';
import { KraftwerkHead } from './scenes/KraftwerkHead';
import { useSpeechActivityStore } from '@/stores/useSpeechActivityStore';
import { useVocoderStore } from '@/stores/useVocoderStore';

const SceneWithAudio: React.FC = () => {
  const audioRef = useVJAudio();
  return (
    <>
      <KraftwerkHead audioRef={audioRef} />
      <EffectComposer>
        <Bloom
          intensity={1.2}
          luminanceThreshold={0.15}
          luminanceSmoothing={0.6}
          mipmapBlur
        />
      </EffectComposer>
      <DemandInvalidator />
    </>
  );
};

/** Drives the demand-mode render loop: invalidates each frame while the head is
 *  visible or fading, and kicks a fresh invalidation when speech/vocoder starts. */
const DemandInvalidator: React.FC = () => {
  const { invalidate } = useThree();
  const needsRenderRef = useRef(false);

  // Subscribe to speech/vocoder stores — kick a render when activity starts
  useEffect(() => {
    const unsubs = [
      useSpeechActivityStore.subscribe((s) => {
        if (s.activeSpeechCount > 0) { needsRenderRef.current = true; invalidate(); }
      }),
      useVocoderStore.subscribe((s) => {
        if (s.isActive) { needsRenderRef.current = true; invalidate(); }
      }),
    ];
    // Kick one initial frame so KraftwerkHead can evaluate visibility
    invalidate();
    return () => unsubs.forEach(u => u());
  }, [invalidate]);

  // While the head is visible (or fading out), keep invalidating
  useFrame(() => {
    const speechActive = useSpeechActivityStore.getState().activeSpeechCount > 0;
    const vocoderActive = useVocoderStore.getState().isActive;
    if (speechActive || vocoderActive || needsRenderRef.current) {
      needsRenderRef.current = speechActive || vocoderActive;
      invalidate();
    }
  });

  return null;
};

export const KraftwerkHeadOverlay: React.FC = () => {
  // Increment key to force-remount the Canvas after context restore
  const [canvasKey, setCanvasKey] = useState(0);
  const contextLostRef = useRef(false);
  // Store listener refs for cleanup
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const onLostRef = useRef<((e: Event) => void) | null>(null);
  const onRestoredRef = useRef<(() => void) | null>(null);

  const handleCreated = useCallback((state: { gl: THREE.WebGLRenderer }) => {
    const canvas = state.gl.domElement;

    // Remove previous listeners if canvas changed (remount)
    if (canvasElRef.current && canvasElRef.current !== canvas) {
      if (onLostRef.current) canvasElRef.current.removeEventListener('webglcontextlost', onLostRef.current);
      if (onRestoredRef.current) canvasElRef.current.removeEventListener('webglcontextrestored', onRestoredRef.current);
    }

    const onLost = (e: Event) => {
      e.preventDefault(); // tell browser we want a restore
      contextLostRef.current = true;
      console.warn('[KraftwerkHead] WebGL context lost — waiting for restore');
    };

    const onRestored = () => {
      console.warn('[KraftwerkHead] WebGL context restored — remounting Canvas');
      contextLostRef.current = false;
      // Force full remount so R3F rebuilds its renderer, scene, and effects
      setCanvasKey(k => k + 1);
    };

    canvasElRef.current = canvas;
    onLostRef.current = onLost;
    onRestoredRef.current = onRestored;

    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
  }, []);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      const canvas = canvasElRef.current;
      if (canvas) {
        if (onLostRef.current) canvas.removeEventListener('webglcontextlost', onLostRef.current);
        if (onRestoredRef.current) canvas.removeEventListener('webglcontextrestored', onRestoredRef.current);
      }
    };
  }, []);

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 5 }}
    >
      <Canvas
        key={canvasKey}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.5 }}
        camera={{ position: [0, 0, 4], fov: 45, near: 0.1, far: 100 }}
        style={{ width: '100%', height: '100%', background: 'transparent' }}
        onCreated={handleCreated}
      >
        <ambientLight intensity={0.15} />
        <Suspense fallback={null}>
          <SceneWithAudio />
        </Suspense>
      </Canvas>
    </div>
  );
};
