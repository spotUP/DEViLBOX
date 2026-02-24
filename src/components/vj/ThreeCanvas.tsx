/**
 * ThreeCanvas — R3F Canvas wrapper for VJ 3D scenes.
 *
 * Manages scene selection, audio hook, and post-processing.
 * Each scene receives a shared audioRef for audio-reactive animation.
 */

import React, { Suspense, useCallback, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { useVJAudio, type VJScenePreset } from './scenes/types';
import { ReactiveParticles } from './scenes/ReactiveParticles';
import { AudioTerrain } from './scenes/AudioTerrain';
import { WireframeSphere } from './scenes/WireframeSphere';

// ─── Scene registry ────────────────────────────────────────────────────────────

const SCENES: VJScenePreset[] = [
  { name: 'Reactive Particles', component: ReactiveParticles, category: 'Particles', description: 'Audio-reactive particle cloud' },
  { name: 'Audio Terrain', component: AudioTerrain, category: 'Landscape', description: 'Frequency-driven terrain mesh' },
  { name: 'Wireframe Sphere', component: WireframeSphere, category: 'Geometry', description: 'Pulsing wireframe icosphere' },
];

export { SCENES as THREE_SCENES };

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ThreeCanvasHandle {
  nextScene: () => void;
  prevScene: () => void;
  randomScene: () => void;
  loadSceneByIndex: (idx: number) => void;
  getSceneNames: () => string[];
  getCurrentIndex: () => number;
}

interface ThreeCanvasProps {
  onReady?: (sceneCount: number) => void;
  onSceneChange?: (idx: number, name: string) => void;
}

// ─── Inner scene renderer (inside R3F context) ─────────────────────────────────

const SceneRenderer: React.FC<{ sceneIdx: number }> = ({ sceneIdx }) => {
  const audioRef = useVJAudio();
  const SceneComponent = SCENES[sceneIdx]?.component;
  if (!SceneComponent) return null;
  return <SceneComponent audioRef={audioRef} />;
};

const PostEffects: React.FC = () => (
  <EffectComposer>
    <Bloom
      intensity={0.8}
      luminanceThreshold={0.3}
      luminanceSmoothing={0.9}
      mipmapBlur
    />
    <ChromaticAberration
      blendFunction={BlendFunction.NORMAL}
      offset={new THREE.Vector2(0.001, 0.001)}
    />
  </EffectComposer>
);

// ─── Component ─────────────────────────────────────────────────────────────────

export const ThreeCanvas = React.forwardRef<ThreeCanvasHandle, ThreeCanvasProps>(
  ({ onReady, onSceneChange }, ref) => {
    const [sceneIdx, setSceneIdx] = useState(0);
    const idxRef = useRef(0);

    // Report ready on mount
    React.useEffect(() => {
      onReady?.(SCENES.length);
      if (SCENES.length > 0) {
        onSceneChange?.(0, SCENES[0].name);
      }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const doLoadScene = useCallback((idx: number) => {
      const clamped = ((idx % SCENES.length) + SCENES.length) % SCENES.length;
      setSceneIdx(clamped);
      idxRef.current = clamped;
      onSceneChange?.(clamped, SCENES[clamped].name);
    }, [onSceneChange]);

    React.useImperativeHandle(ref, () => ({
      nextScene: () => doLoadScene(idxRef.current + 1),
      prevScene: () => doLoadScene(idxRef.current - 1),
      randomScene: () => doLoadScene(Math.floor(Math.random() * SCENES.length)),
      loadSceneByIndex: doLoadScene,
      getSceneNames: () => SCENES.map(s => s.name),
      getCurrentIndex: () => idxRef.current,
    }), [doLoadScene]);

    return (
      <Canvas
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.5 }}
        camera={{ position: [0, 2, 6], fov: 60, near: 0.1, far: 100 }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#000000']} />
        <ambientLight intensity={0.15} />
        <Suspense fallback={null}>
          <SceneRenderer sceneIdx={sceneIdx} />
          <PostEffects />
        </Suspense>
      </Canvas>
    );
  }
);
ThreeCanvas.displayName = 'ThreeCanvas';
