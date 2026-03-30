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
  browDown_L: 1,
  browDown_R: 2,
  browOuterUp_L: 3,
  browOuterUp_R: 4,
  eyeLookUp_L: 5,
  eyeLookUp_R: 6,
  eyeLookDown_L: 7,
  eyeLookDown_R: 8,
  eyeLookIn_L: 9,
  eyeLookIn_R: 10,
  eyeLookOut_L: 11,
  eyeLookOut_R: 12,
  eyeBlink_L: 13,
  eyeBlink_R: 14,
  eyeSquint_L: 15,
  eyeSquint_R: 16,
  eyeWide_L: 17,
  eyeWide_R: 18,
  cheekPuff: 19,
  cheekSquint_L: 20,
  cheekSquint_R: 21,
  noseSneer_L: 22,
  noseSneer_R: 23,
  jawOpen: 24,
  jawForward: 25,
  jawLeft: 26,
  jawRight: 27,
  mouthFunnel: 28,
  mouthPucker: 29,
  mouthLeft: 30,
  mouthRight: 31,
  mouthRollUpper: 32,
  mouthRollLower: 33,
  mouthShrugUpper: 34,
  mouthShrugLower: 35,
  mouthClose: 36,
  mouthSmile_L: 37,
  mouthSmile_R: 38,
  mouthFrown_L: 39,
  mouthFrown_R: 40,
  mouthDimple_L: 41,
  mouthDimple_R: 42,
  mouthUpperUp_L: 43,
  mouthUpperUp_R: 44,
  mouthLowerDown_L: 45,
  mouthLowerDown_R: 46,
  mouthPress_L: 47,
  mouthPress_R: 48,
  mouthStretch_L: 49,
  mouthStretch_R: 50,
  tongueOut: 51,
} as const;

// Wireframe material — rendered on top
const wireframeMat = new THREE.MeshBasicMaterial({
  color: 0x00ccff,
  wireframe: true,
  transparent: true,
  opacity: 0.85,
});

// Flat-shaded transparent fill — rendered behind wireframe
const flatShadeMat = new THREE.MeshPhongMaterial({
  color: 0x004466,
  specular: 0x00aaff,
  shininess: 30,
  flatShading: true,
  transparent: true,
  opacity: 0.6,
  side: THREE.FrontSide,
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
  const prevMid = useRef(0);
  const prevHigh = useRef(0);
  const mouthPhase = useRef(0);

  // Visibility — fade in when speech is active, fade out when idle
  const smoothVisibility = useRef(0);

  // Head look-at targets — pick a random point, turn toward it, hold, pick another
  const headTargetY = useRef(0);       // target Y rotation (left/right)
  const headTargetX = useRef(0);       // target X rotation (up/down)
  const headCurrentY = useRef(0);
  const headCurrentX = useRef(0);
  const headHoldTimer = useRef(0);     // how long to hold the current target
  const headHoldDuration = useRef(2);  // randomized per target
  const headTurnSpeed = useRef(0.03);  // how fast to turn (varies)

  // Load the facecap model
  useEffect(() => {
    let cancelled = false;
    loadFacecap(gl).then((result) => {
      if (cancelled || !result) return;

      let morphMesh: THREE.Mesh | null = null;
      // For each mesh, add a flat-shade sibling sharing the same geometry.
      // Collect pairs first to avoid mutating during traverse.
      const pairs: { mesh: THREE.Mesh; parent: THREE.Object3D }[] = [];
      result.scene.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const m = c as THREE.Mesh;
          m.material = wireframeMat;
          m.renderOrder = 1;
          if (m.morphTargetInfluences && m.morphTargetInfluences.length > 0) {
            morphMesh = m;
          }
          if (m.parent) pairs.push({ mesh: m, parent: m.parent });
        }
      });
      // Add flat-shade twins as siblings (same parent = same transforms)
      for (const { mesh, parent } of pairs) {
        const flat = new THREE.Mesh(mesh.geometry, flatShadeMat);
        flat.morphTargetInfluences = mesh.morphTargetInfluences;
        flat.morphTargetDictionary = mesh.morphTargetDictionary;
        flat.position.copy(mesh.position);
        flat.rotation.copy(mesh.rotation);
        flat.scale.copy(mesh.scale);
        flat.renderOrder = 0;
        parent.add(flat);
      }
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

    // Fade in/out based on speech activity
    const visTarget = speechActive ? 1 : 0;
    smoothVisibility.current += (visTarget - smoothVisibility.current) * (speechActive ? 0.08 : 0.03);
    const vis = smoothVisibility.current;
    group.visible = vis > 0.01;
    wireframeMat.opacity = 0.85 * vis;
    flatShadeMat.opacity = 0.6 * vis;

    // Audio energy
    const bass = audio ? Math.min(1, (audio.bassEnergy + audio.subEnergy) * 2.5) : 0;
    const mid = audio ? Math.min(1, audio.midEnergy * 3) : 0;
    const high = audio ? Math.min(1, audio.highEnergy * 3) : 0;
    const beat = audio?.beat ?? false;

    // ── Morph target animation ──
    if (headMesh?.morphTargetInfluences) {
      const m = headMesh.morphTargetInfluences;

      // Compute energy derivatives — drives open/close motion on syllable boundaries
      const midDelta = Math.abs(mid - prevMid.current);
      const highDelta = Math.abs(high - prevHigh.current);
      prevMid.current = mid;
      prevHigh.current = high;

      // Phase oscillator — creates natural mouth cycling during sustained speech
      mouthPhase.current += (mid + high) * 0.3;

      if (speechActive) {
        // Jaw: combine absolute energy (baseline open) with delta (syllable pops)
        // and a phase oscillator for natural cycling
        const syllablePop = Math.min(1, midDelta * 8 + highDelta * 6);
        const phaseModulation = Math.sin(mouthPhase.current) * 0.3 + 0.3;
        const jawTarget = Math.min(0.35, mid * 0.15 + syllablePop * 0.2 + phaseModulation * 0.12);
        smoothJaw.current += (jawTarget - smoothJaw.current) * 0.5; // fast tracking
        m[MORPH.jawOpen] = smoothJaw.current;
        m[MORPH.mouthLowerDown_L] = smoothJaw.current * 0.4;
        m[MORPH.mouthLowerDown_R] = smoothJaw.current * 0.4;

        // Alternate between mouth shapes for variety
        const shapePhase = Math.sin(mouthPhase.current * 0.7);
        const funnel = shapePhase > 0.3 ? high * 0.5 : 0;
        const stretch = shapePhase < -0.3 ? mid * 0.4 : 0;
        m[MORPH.mouthFunnel] += (funnel - m[MORPH.mouthFunnel]) * 0.4;
        m[MORPH.mouthStretch_L] += (stretch - m[MORPH.mouthStretch_L]) * 0.4;
        m[MORPH.mouthStretch_R] += (stretch - m[MORPH.mouthStretch_R]) * 0.4;
        m[MORPH.mouthUpperUp_L] += (syllablePop * 0.3 - m[MORPH.mouthUpperUp_L]) * 0.3;
        m[MORPH.mouthUpperUp_R] += (syllablePop * 0.3 - m[MORPH.mouthUpperUp_R]) * 0.3;
      } else {
        // Close mouth smoothly when not speaking
        smoothJaw.current *= 0.85;
        m[MORPH.jawOpen] = smoothJaw.current;
        m[MORPH.mouthLowerDown_L] *= 0.85;
        m[MORPH.mouthLowerDown_R] *= 0.85;
        m[MORPH.mouthFunnel] *= 0.9;
        m[MORPH.mouthStretch_L] *= 0.9;
        m[MORPH.mouthStretch_R] *= 0.9;
        m[MORPH.mouthUpperUp_L] *= 0.9;
        m[MORPH.mouthUpperUp_R] *= 0.9;
      }

      // ── Smile — beats trigger, bass sustains ──
      const smileTarget = beat ? 0.4 : bass * 0.12;
      smoothSmile.current += (smileTarget - smoothSmile.current) * 0.12;
      m[MORPH.mouthSmile_L] = smoothSmile.current;
      m[MORPH.mouthSmile_R] = smoothSmile.current * 0.85; // slight asymmetry

      // ── Brows — reactive + idle micro-movement ──
      const browReactive = high * 0.3 + midDelta * 1.5 + (speechActive ? 0.08 : 0);
      const browIdle = Math.sin(t * 0.4) * 0.12 + Math.sin(t * 1.1) * 0.06;
      smoothBrow.current += (browReactive + browIdle - smoothBrow.current) * 0.2;
      m[MORPH.browInnerUp] = Math.max(0, Math.min(0.5, smoothBrow.current));
      // Asymmetric outer brows — one rises slightly more
      m[MORPH.browOuterUp_L] = Math.max(0, Math.sin(t * 0.3) * 0.15 + high * 0.2);
      m[MORPH.browOuterUp_R] = Math.max(0, Math.sin(t * 0.3 + 0.5) * 0.2 + high * 0.15);
      // Furrowed brows on heavy bass
      m[MORPH.browDown_L] = bass > 0.6 ? (bass - 0.6) * 0.4 : 0;
      m[MORPH.browDown_R] = bass > 0.6 ? (bass - 0.6) * 0.35 : 0;

      // ── Eyes — natural saccades + slow drift + blink ──
      // Smooth eye drift (looking around the room)
      const lookX = Math.sin(t * 0.23) * 0.6 + Math.sin(t * 0.71) * 0.3;
      const lookY = Math.sin(t * 0.17) * 0.4 + Math.cos(t * 0.53) * 0.2;
      // Map to look blend shapes (both eyes move together)
      m[MORPH.eyeLookIn_L] = Math.max(0, lookX);
      m[MORPH.eyeLookOut_L] = Math.max(0, -lookX);
      m[MORPH.eyeLookIn_R] = Math.max(0, -lookX);
      m[MORPH.eyeLookOut_R] = Math.max(0, lookX);
      m[MORPH.eyeLookUp_L] = Math.max(0, lookY) * 0.8;
      m[MORPH.eyeLookUp_R] = Math.max(0, lookY) * 0.8;
      m[MORPH.eyeLookDown_L] = Math.max(0, -lookY) * 0.8;
      m[MORPH.eyeLookDown_R] = Math.max(0, -lookY) * 0.8;

      // Blink — natural pattern (every 2-5s)
      blinkTimer.current += 0.016;
      if (blinkTimer.current > 2.5 + Math.sin(t * 0.1) * 1.5) {
        blinkTimer.current = 0;
        smoothBlink.current = 1;
      }
      smoothBlink.current *= 0.82;
      m[MORPH.eyeBlink_L] = smoothBlink.current;
      m[MORPH.eyeBlink_R] = smoothBlink.current;
      m[MORPH.eyeWide_L] = 0;
      m[MORPH.eyeWide_R] = 0;
      m[MORPH.eyeSquint_L] = 0;
      m[MORPH.eyeSquint_R] = 0;

      // ── Cheeks — puff on bass, squint on smile ──
      m[MORPH.cheekPuff] = bass > 0.7 ? (bass - 0.7) * 0.5 : 0;
      m[MORPH.cheekSquint_L] = smoothSmile.current * 0.4;
      m[MORPH.cheekSquint_R] = smoothSmile.current * 0.35;

      // ── Nose — subtle sneer on high energy ──
      m[MORPH.noseSneer_L] = high > 0.6 ? (high - 0.6) * 0.25 : 0;
      m[MORPH.noseSneer_R] = high > 0.6 ? (high - 0.6) * 0.2 : 0;

      // ── Jaw micro-movement — subtle breathing even when not speaking ──
      if (!speechActive) {
        const breathe = Math.sin(t * 0.8) * 0.04 + 0.04;
        m[MORPH.jawOpen] = breathe;
      }

      // ── Mouth micro-expressions when idle ──
      if (!speechActive) {
        // Mouth corner movement — reacting to music
        const mouthTwitch = Math.sin(t * 0.6) * 0.08;
        m[MORPH.mouthLeft] = Math.max(0, mouthTwitch);
        m[MORPH.mouthRight] = Math.max(0, -mouthTwitch);
        m[MORPH.mouthPucker] = Math.max(0, Math.sin(t * 0.25) * 0.1);
        m[MORPH.mouthPress_L] = bass * 0.15;
        m[MORPH.mouthPress_R] = bass * 0.15;
      } else {
        m[MORPH.mouthLeft] *= 0.9;
        m[MORPH.mouthRight] *= 0.9;
        m[MORPH.mouthPucker] *= 0.9;
        m[MORPH.mouthPress_L] *= 0.9;
        m[MORPH.mouthPress_R] *= 0.9;
      }
    }

    // ── Natural head movement — look at random targets ──
    headHoldTimer.current += 0.016;
    if (headHoldTimer.current > headHoldDuration.current) {
      // Pick a new target to look at
      headHoldTimer.current = 0;
      headHoldDuration.current = 1.5 + Math.random() * 4; // hold 1.5-5.5 seconds
      headTurnSpeed.current = 0.02 + Math.random() * 0.04; // vary turn speed

      // Sometimes look far left/right, sometimes just glance
      const range = Math.random() > 0.3 ? 0.2 : 0.4; // 70% subtle, 30% bigger turn
      headTargetY.current = (Math.random() - 0.5) * 2 * range;
      headTargetX.current = (Math.random() - 0.4) * 0.15; // mostly level, slight up/down bias
    }

    // Smooth interpolation toward target (ease-out feel)
    headCurrentY.current += (headTargetY.current - headCurrentY.current) * headTurnSpeed.current;
    headCurrentX.current += (headTargetX.current - headCurrentX.current) * headTurnSpeed.current;

    // Apply head rotation with beat impulse and breathing layered on
    if (beat) beatImpulse.current = 0.06;
    beatImpulse.current *= 0.93;

    group.rotation.y = headCurrentY.current;
    group.rotation.x = headCurrentX.current + beatImpulse.current;
    group.rotation.z = Math.sin(t * 0.15) * 0.02 + headCurrentY.current * 0.05; // slight head tilt when turning
    group.position.y = -0.05 + Math.sin(t * 0.8) * 0.005 + bass * 0.03; // gentle breathing bob
  });

  return (
    <group ref={groupRef} position={[0, -0.55, 0]} scale={1.25}>
      {sceneObj && <primitive object={sceneObj} />}
      {/* Cyan lights for flat shading + wireframe glow */}
      <pointLight position={[0, 0, 2]} color={0x00ccff} intensity={2} distance={6} />
      <pointLight position={[-1.5, 1, 1]} color={0x0066ff} intensity={0.8} distance={5} />
      <pointLight position={[1.5, 1, 1]} color={0x00ffcc} intensity={0.8} distance={5} />
    </group>
  );
};
