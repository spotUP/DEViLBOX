/**
 * KraftwerkHeadOverlay — Transparent R3F canvas with the wireframe head,
 * rendered on top of Milkdrop/projectM visualizers.
 *
 * Always visible in VJ view. Mouth animates when speech synths are active.
 * Uses alpha:true so the visualizer shows through.
 */

import React, { Suspense } from 'react';
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
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 5 }}
    >
      <Canvas
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.5 }}
        camera={{ position: [0, 0, 4], fov: 45, near: 0.1, far: 100 }}
        style={{ width: '100%', height: '100%', background: 'transparent' }}
      >
        <ambientLight intensity={0.15} />
        <Suspense fallback={null}>
          <SceneWithAudio />
        </Suspense>
      </Canvas>
    </div>
  );
};
