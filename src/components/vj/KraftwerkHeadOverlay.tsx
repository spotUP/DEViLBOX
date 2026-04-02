/**
 * KraftwerkHeadOverlay — Transparent R3F canvas with the wireframe head,
 * rendered on top of Milkdrop/projectM visualizers.
 *
 * Always visible in VJ view. Mouth animates when speech synths are active.
 * Uses alpha:true so the visualizer shows through.
 *
 * Handles WebGL context loss by remounting the R3F Canvas.
 */

import React, { Suspense, useCallback, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useVJAudio } from './scenes/types';
import { KraftwerkHead } from './scenes/KraftwerkHead';

const SceneWithAudio: React.FC = () => {
  const audioRef = useVJAudio();
  return (
    <>
      <KraftwerkHead audioRef={audioRef} />
      <EffectComposer>
        <Bloom
          intensity={1.0}
          luminanceThreshold={0.2}
          luminanceSmoothing={0.7}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
};

export const KraftwerkHeadOverlay: React.FC = () => {
  // Increment key to force-remount the Canvas after context restore
  const [canvasKey, setCanvasKey] = useState(0);
  const contextLostRef = useRef(false);

  const handleCreated = useCallback((state: { gl: THREE.WebGLRenderer }) => {
    const canvas = state.gl.domElement;

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

    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
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
