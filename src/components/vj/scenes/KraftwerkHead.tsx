/**
 * KraftwerkHead — Wireframe head driven by speech synth + audio.
 *
 * Uses facecap.glb (52 ARKit blend shapes) for proper facial animation:
 * jawOpen, mouthSmile, eyeBlink, browInnerUp, etc.
 * Falls back to LeePerrySmith.glb (static, jaw-split) if facecap fails.
 * Rendered as cyan wireframe with bloom glow for Kraftwerk aesthetic.
 */

import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import type { VJSceneProps } from './types';
import { useSpeechActivityStore } from '@/stores/useSpeechActivityStore';

// Morph target indices (from facecap.glb extras.targetNames)
const MORPH = {
  browInnerUp: 0,
  eyeBlink_L: 13,
  eyeBlink_R: 14,
  eyeSquint_L: 15,
  eyeSquint_R: 16,
  jawOpen: 24,
  mouthFunnel: 28,
  mouthSmile_L: 37,
  mouthSmile_R: 38,
  mouthUpperUp_L: 43,
  mouthUpperUp_R: 44,
  mouthLowerDown_L: 45,
  mouthLowerDown_R: 46,
  mouthStretch_L: 49,
  mouthStretch_R: 50,
} as const;

// Wireframe material — shared
const wireframeMat = new THREE.MeshBasicMaterial({
  color: 0x00ccff,
  wireframe: true,
  transparent: true,
  opacity: 0.85,
});

// ─── Model loading with KTX2 + Meshopt ───────────────────────────────────────

type LoadResult = { scene: THREE.Group; headMesh: THREE.Mesh | null };
let cachedResult: LoadResult | null = null;
let loadPromise: Promise<LoadResult> | null = null;

function loadFacecap(renderer: THREE.WebGLRenderer): Promise<LoadResult> {
  if (cachedResult) {
    const cloned = cachedResult.scene.clone(true);
    let clonedHead: THREE.Mesh | null = null;
    cloned.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        const m = c as THREE.Mesh;
        m.material = wireframeMat;
        if (m.morphTargetInfluences && m.morphTargetInfluences.length > 0) {
          clonedHead = m;
        }
      }
    });
    return Promise.resolve({ scene: cloned, headMesh: clonedHead });
  }
  if (loadPromise) return loadPromise;

  loadPromise = MeshoptDecoder.ready.then(() => {
    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath('/basis/');
    ktx2Loader.detectSupport(renderer);

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.setKTX2Loader(ktx2Loader);

    return new Promise<LoadResult>((resolve, reject) => {
      loader.load(
        '/models/facecap.glb',
        (gltf) => {
          let headMesh: THREE.Mesh | null = null;
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.material = wireframeMat;
              if (mesh.morphTargetInfluences && mesh.morphTargetInfluences.length > 0) {
                headMesh = mesh;
              }
            }
          });
          cachedResult = { scene: gltf.scene, headMesh };
          ktx2Loader.dispose();
          resolve({ scene: gltf.scene.clone(true), headMesh });
        },
        undefined,
        (err) => {
          ktx2Loader.dispose();
          reject(err);
        },
      );
    });
  });

  return loadPromise;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const KraftwerkHead: React.FC<VJSceneProps> = ({ audioRef }) => {
  const groupRef = useRef<THREE.Group>(null);
  const headMeshRef = useRef<THREE.Mesh | null>(null);
  const [sceneObj, setSceneObj] = useState<THREE.Group | null>(null);
  const { gl } = useThree();

  // Smoothed animation state
  const smoothJaw = useRef(0);
  const smoothSmile = useRef(0);
  const smoothBrow = useRef(0);
  const smoothBlink = useRef(0);
  const beatImpulse = useRef(0);
  const blinkTimer = useRef(0);

  // Load the facecap model
  useEffect(() => {
    let cancelled = false;
    loadFacecap(gl).then((result) => {
      if (cancelled || !result) return;
      // Re-find the morph mesh on the cloned scene
      let morphMesh: THREE.Mesh | null = null;
      result.scene.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const m = c as THREE.Mesh;
          m.material = wireframeMat;
          if (m.morphTargetInfluences && m.morphTargetInfluences.length > 0) {
            morphMesh = m;
          }
        }
      });
      headMeshRef.current = morphMesh;
      setSceneObj(result.scene);
    }).catch((err) => {
      console.error('[KraftwerkHead] Failed to load facecap.glb:', err);
    });
    return () => { cancelled = true; };
  }, [gl]);

  useFrame((state) => {
    const audio = audioRef.current;
    const group = groupRef.current;
    const headMesh = headMeshRef.current;
    if (!group) return;

    const t = state.clock.elapsedTime;
    const speechActive = useSpeechActivityStore.getState().activeSpeechCount > 0;

    // Audio energy
    const bass = audio ? Math.min(1, (audio.bassEnergy + audio.subEnergy) * 2.5) : 0;
    const mid = audio ? Math.min(1, audio.midEnergy * 3) : 0;
    const high = audio ? Math.min(1, audio.highEnergy * 3) : 0;
    const beat = audio?.beat ?? false;

    // ── Morph target animation ──
    if (headMesh?.morphTargetInfluences) {
      const m = headMesh.morphTargetInfluences;

      // Jaw open — driven by mid energy when speech active
      const jawTarget = speechActive ? mid * 0.8 + high * 0.2 : 0;
      smoothJaw.current += (jawTarget - smoothJaw.current) * 0.35;
      m[MORPH.jawOpen] = smoothJaw.current;
      m[MORPH.mouthLowerDown_L] = smoothJaw.current * 0.3;
      m[MORPH.mouthLowerDown_R] = smoothJaw.current * 0.3;

      // Mouth funnel/stretch — adds character during speech
      if (speechActive) {
        m[MORPH.mouthFunnel] = high * 0.4;
        m[MORPH.mouthStretch_L] = mid * 0.2;
        m[MORPH.mouthStretch_R] = mid * 0.2;
        m[MORPH.mouthUpperUp_L] = mid * 0.15;
        m[MORPH.mouthUpperUp_R] = mid * 0.15;
      } else {
        m[MORPH.mouthFunnel] *= 0.9;
        m[MORPH.mouthStretch_L] *= 0.9;
        m[MORPH.mouthStretch_R] *= 0.9;
        m[MORPH.mouthUpperUp_L] *= 0.9;
        m[MORPH.mouthUpperUp_R] *= 0.9;
      }

      // Smile on beats
      const smileTarget = beat ? 0.5 : bass * 0.15;
      smoothSmile.current += (smileTarget - smoothSmile.current) * 0.15;
      m[MORPH.mouthSmile_L] = smoothSmile.current;
      m[MORPH.mouthSmile_R] = smoothSmile.current;

      // Brow raise with high energy
      const browTarget = high * 0.4 + (speechActive ? 0.15 : 0);
      smoothBrow.current += (browTarget - smoothBrow.current) * 0.2;
      m[MORPH.browInnerUp] = smoothBrow.current;

      // Periodic blink
      blinkTimer.current += 0.016;
      if (blinkTimer.current > 3 + Math.random() * 2) {
        blinkTimer.current = 0;
        smoothBlink.current = 1;
      }
      smoothBlink.current *= 0.85;
      m[MORPH.eyeBlink_L] = smoothBlink.current;
      m[MORPH.eyeBlink_R] = smoothBlink.current;

      // Eye squint on bass hits
      m[MORPH.eyeSquint_L] = bass * 0.3;
      m[MORPH.eyeSquint_R] = bass * 0.3;
    }

    // ── Ambient head motion ──
    group.rotation.y = Math.sin(t * 0.3) * 0.12;
    group.position.y = -1.4 + bass * 0.06;

    // Beat tilt
    if (beat) beatImpulse.current = 0.1;
    beatImpulse.current *= 0.92;
    group.rotation.x = beatImpulse.current;
    group.rotation.z = Math.sin(t * 0.2) * 0.03;
  });

  return (
    <group ref={groupRef} position={[0, -1.4, 3]} scale={1.8}>
      {sceneObj && <primitive object={sceneObj} />}
      {/* Cyan lights for wireframe glow */}
      <pointLight position={[0, 0, 2]} color={0x00ccff} intensity={2} distance={6} />
      <pointLight position={[-1.5, 1, 1]} color={0x0066ff} intensity={0.8} distance={5} />
      <pointLight position={[1.5, 1, 1]} color={0x00ffcc} intensity={0.8} distance={5} />
    </group>
  );
};
