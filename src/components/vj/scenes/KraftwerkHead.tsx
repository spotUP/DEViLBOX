/**
 * KraftwerkHead — Wireframe head driven by speech synth + audio.
 *
 * Uses facecap.glb (52 ARKit blend shapes) for proper facial animation:
 * jawOpen, mouthSmile, eyeBlink, browInnerUp, etc.
 * Falls back to LeePerrySmith.glb (static, jaw-split) if facecap fails.
 * Rendered as cyan wireframe with bloom glow for Kraftwerk aesthetic.
 * Also activates when the vocoder is running (DJ robot voice mode).
 */

import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import type { VJSceneProps } from './types';
import { useSpeechActivityStore } from '@/stores/useSpeechActivityStore';
import { useVocoderStore } from '@/stores/useVocoderStore';
import { useSettingsStore } from '@/stores/useSettingsStore';

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
// Base + bright colors for audio-reactive glow (lerped in useFrame)
const WIRE_COLOR_BASE = new THREE.Color(0x00ccff);
const WIRE_COLOR_BRIGHT = new THREE.Color(0x88eeff);

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

// Spike hair material — bright cyan lines with additive glow
const spikeMat = new THREE.LineBasicMaterial({
  color: 0x00eeff,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
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
  // Audio-reactive glow (material color brightness)
  const smoothGlow = useRef(0);

  // Spike hair system
  const spikeMeshRef = useRef<THREE.LineSegments | null>(null);
  const spikeDataRef = useRef<{
    origins: Float32Array;     // base positions (scalp vertices)
    normals: Float32Array;     // outward direction per spike
    phases: Float32Array;      // per-spike random phase offset for wave motion
    basePositions: Float32Array; // attribute buffer (interleaved: origin, tip, origin, tip...)
    count: number;
    spikeScale: number;        // multiplier: maps 0-0.3 range to head geometry local coords
  } | null>(null);

  // Head look-at targets — pick a random point, turn toward it, hold, pick another
  const headTargetY = useRef(0);       // target Y rotation (left/right)
  const headTargetX = useRef(0);       // target X rotation (up/down)
  const headCurrentY = useRef(0);
  const headCurrentX = useRef(0);
  const headHoldTimer = useRef(0);     // how long to hold the current target
  const headHoldDuration = useRef(2);  // randomized per target
  const headTurnSpeed = useRef(0.03);  // how fast to turn (varies)

  // ── Max Headroom glitch state ──
  const glitchFrozen = useRef(false);
  const glitchFreezeTimer = useRef(0);
  const glitchNextFreezeIn = useRef(1.5);
  const glitchSnapTarget = useRef<number[]>([]);
  const glitchIntensity = useRef(0);
  const headJerkTimer = useRef(0);

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

      // ── Create spike hair from scalp vertices ──
      // The facecap.glb uses KHR_mesh_quantization — vertex positions are in
      // a large coordinate space (thousands of units), not 0-1 normalized.
      // Spike lengths must be scaled to match, and the spikeMesh must share
      // the same parent + transforms as the head mesh so positions align.
      if (morphMesh) {
        const headGeo = (morphMesh as THREE.Mesh).geometry;
        const posAttr = headGeo.getAttribute('position');
        const normAttr = headGeo.getAttribute('normal');
        if (posAttr && normAttr) {
          // Compute head bounding box for scale-independent thresholds
          const headBounds = new THREE.Box3().setFromBufferAttribute(posAttr as THREE.BufferAttribute);
          const headSize = new THREE.Vector3();
          headBounds.getSize(headSize);
          // Upper 40% of head = scalp region (above eyes)
          const yThreshold = headBounds.min.y + headSize.y * 0.55;
          // Deduplicate granularity relative to head size
          const dedupeScale = 1.0 / (headSize.y * 0.01);

          // Collect scalp vertices (top of head)
          const scalpVerts: { x: number; y: number; z: number; nx: number; ny: number; nz: number }[] = [];
          const seen = new Set<string>();
          for (let i = 0; i < posAttr.count; i++) {
            const x = posAttr.getX(i);
            const y = posAttr.getY(i);
            const z = posAttr.getZ(i);
            const nx = normAttr.getX(i);
            const ny = normAttr.getY(i);
            const nz = normAttr.getZ(i);
            // Scalp region: upper portion of head, normals pointing up/outward
            if (ny > 0.3 && y > yThreshold) {
              const key = `${(x * dedupeScale) | 0},${(y * dedupeScale) | 0},${(z * dedupeScale) | 0}`;
              if (!seen.has(key)) {
                seen.add(key);
                scalpVerts.push({ x, y, z, nx, ny, nz });
              }
            }
          }

          // Subsample if too many (aim for ~120 spikes)
          const maxSpikes = 120;
          let spikes = scalpVerts;
          if (spikes.length > maxSpikes) {
            const step = spikes.length / maxSpikes;
            const sampled = [];
            for (let i = 0; i < maxSpikes; i++) {
              sampled.push(spikes[Math.floor(i * step)]);
            }
            spikes = sampled;
          }

          const count = spikes.length;
          if (count > 0) {
            const origins = new Float32Array(count * 3);
            const normals = new Float32Array(count * 3);
            const phases = new Float32Array(count);
            // Line segments: 2 vertices per spike (base + tip)
            const positions = new Float32Array(count * 2 * 3);

            for (let i = 0; i < count; i++) {
              const s = spikes[i];
              origins[i * 3] = s.x;
              origins[i * 3 + 1] = s.y;
              origins[i * 3 + 2] = s.z;
              normals[i * 3] = s.nx;
              normals[i * 3 + 1] = s.ny;
              normals[i * 3 + 2] = s.nz;
              phases[i] = Math.random() * Math.PI * 2;
              // Initial positions (base = tip, zero length)
              positions[i * 6] = s.x;
              positions[i * 6 + 1] = s.y;
              positions[i * 6 + 2] = s.z;
              positions[i * 6 + 3] = s.x;
              positions[i * 6 + 4] = s.y;
              positions[i * 6 + 5] = s.z;
            }

            const spikeGeo = new THREE.BufferGeometry();
            spikeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            const spikeMesh = new THREE.LineSegments(spikeGeo, spikeMat);
            spikeMesh.renderOrder = 2;
            spikeMesh.frustumCulled = false;

            // Add as sibling of morphMesh with same transforms so spike
            // positions (in head geometry local coords) map correctly
            const meshObj = morphMesh as THREE.Mesh;
            if (meshObj.parent) {
              spikeMesh.position.copy(meshObj.position);
              spikeMesh.rotation.copy(meshObj.rotation);
              spikeMesh.scale.copy(meshObj.scale);
              meshObj.parent.add(spikeMesh);
            } else {
              result.scene.add(spikeMesh);
            }
            spikeMeshRef.current = spikeMesh;

            // Scale factor: maps animation range (0-0.3) to head geometry coords.
            // At max audio, spike = ~10% of head height.
            const spikeScale = headSize.y * 0.33;

            spikeDataRef.current = { origins, normals, phases, basePositions: positions, count, spikeScale };
          }
        }
      }

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
    const vocoderState = useVocoderStore.getState();
    const vocoderActive = vocoderState.isActive;
    const vocoderAmplitude = vocoderState.amplitude;
    const isActive = speechActive || vocoderActive;

    // Fade in/out based on speech or vocoder activity
    const visTarget = isActive ? 1 : 0;
    smoothVisibility.current += (visTarget - smoothVisibility.current) * (isActive ? 0.08 : 0.03);
    const vis = smoothVisibility.current;
    group.visible = vis > 0.01;
    wireframeMat.opacity = 0.85 * vis;
    flatShadeMat.opacity = 0.6 * vis;

    // Audio-reactive wireframe glow — pulse material color brighter with audio
    {
      const a = audioRef.current;
      const glowBass = a ? Math.min(1, (a.bassEnergy + a.subEnergy) * 2.5) : 0;
      const glowRms = a?.rms ?? 0;
      const glowBeat = a?.beat ? 1 : 0;
      const glowTarget = Math.min(1, glowBass * 0.5 + glowRms * 0.3 + glowBeat * 0.5);
      smoothGlow.current += (glowTarget - smoothGlow.current) * 0.25;
      wireframeMat.color.lerpColors(WIRE_COLOR_BASE, WIRE_COLOR_BRIGHT, smoothGlow.current);
    }

    // Audio energy
    const bass = audio ? Math.min(1, (audio.bassEnergy + audio.subEnergy) * 2.5) : 0;
    const mid = audio ? Math.min(1, audio.midEnergy * 3) : 0;
    const high = audio ? Math.min(1, audio.highEnergy * 3) : 0;
    const beat = audio?.beat ?? false;
    const maxHeadroom = useSettingsStore.getState().maxHeadroomMode;

    // ── Max Headroom: glitch freeze/snap system ──
    const dt = 0.016;
    if (maxHeadroom && isActive) {
      // Audio-reactive glitch intensity
      const gi = Math.min(1, bass * 0.6 + (beat ? 0.4 : 0) + mid * 0.2);
      glitchIntensity.current += (gi - glitchIntensity.current) * 0.15;

      if (glitchFrozen.current) {
        glitchFreezeTimer.current -= dt;
        if (glitchFreezeTimer.current <= 0) {
          // End freeze → snap to random expression
          glitchFrozen.current = false;
          if (headMesh?.morphTargetInfluences) {
            const m = headMesh.morphTargetInfluences;
            const snap = glitchSnapTarget.current;
            for (let i = 0; i < snap.length && i < m.length; i++) m[i] = snap[i];
          }
          glitchNextFreezeIn.current = 0.3 + Math.random() * (2.0 - glitchIntensity.current * 1.5);
        }
      } else {
        glitchNextFreezeIn.current -= dt;
        if (glitchNextFreezeIn.current <= 0) {
          // Enter freeze — generate random snap targets
          glitchFrozen.current = true;
          glitchFreezeTimer.current = 0.05 + Math.random() * (0.35 - glitchIntensity.current * 0.2);
          const count = headMesh?.morphTargetInfluences?.length ?? 52;
          const snap = new Array(count).fill(0);
          snap[MORPH.jawOpen] = Math.random() * 0.6;
          snap[MORPH.mouthSmile_L] = Math.random() * 0.7;
          snap[MORPH.mouthSmile_R] = Math.random() * 0.65;
          snap[MORPH.browInnerUp] = Math.random() * 0.7;
          snap[MORPH.browOuterUp_L] = Math.random() * 0.5;
          snap[MORPH.browOuterUp_R] = Math.random() * 0.5;
          snap[MORPH.eyeWide_L] = Math.random() * 0.8;
          snap[MORPH.eyeWide_R] = Math.random() * 0.8;
          const blinkSnap = Math.random() > 0.7 ? 1 : 0;
          snap[MORPH.eyeBlink_L] = blinkSnap;
          snap[MORPH.eyeBlink_R] = blinkSnap;
          snap[MORPH.mouthFunnel] = Math.random() * 0.4;
          snap[MORPH.mouthPucker] = Math.random() * 0.3;
          snap[MORPH.cheekPuff] = Math.random() * 0.3;
          snap[MORPH.noseSneer_L] = Math.random() * 0.3;
          snap[MORPH.noseSneer_R] = Math.random() * 0.3;
          snap[MORPH.mouthStretch_L] = Math.random() * 0.4;
          snap[MORPH.mouthStretch_R] = Math.random() * 0.4;
          glitchSnapTarget.current = snap;
        }
      }
    } else if (!isActive) {
      // Reset glitch state when head fades out
      glitchFrozen.current = false;
      glitchNextFreezeIn.current = 1.5;
      glitchIntensity.current = 0;
    }

    // ── Morph target animation (skipped during Max Headroom freeze) ──
    const skipMorphs = maxHeadroom && glitchFrozen.current;
    if (headMesh?.morphTargetInfluences && !skipMorphs) {
      const m = headMesh.morphTargetInfluences;

      // Exaggeration multipliers for Max Headroom mode
      const jawMax = maxHeadroom ? 0.65 : 0.35;
      const vocoderJawMax = maxHeadroom ? 0.7 : 0.45;
      const smileBeat = maxHeadroom ? 0.7 : 0.4;
      const smileBass = maxHeadroom ? 0.3 : 0.12;
      const browClamp = maxHeadroom ? 0.9 : 0.5;
      const browScale = maxHeadroom ? 2.0 : 1.0;
      const blinkBase = maxHeadroom ? 1.0 : 2.5;
      const eyeWideBase = maxHeadroom ? 0.3 : 0;

      // Compute energy derivatives — drives open/close motion on syllable boundaries
      const midDelta = Math.abs(mid - prevMid.current);
      const highDelta = Math.abs(high - prevHigh.current);
      prevMid.current = mid;
      prevHigh.current = high;

      // Phase oscillator — creates natural mouth cycling during sustained speech
      // When vocoder is active, also drive from mic amplitude for mouth variety
      const vocoderDrive = vocoderActive ? vocoderAmplitude * 8 : 0;
      const phaseSpeed = maxHeadroom ? 0.5 : 0.3;
      mouthPhase.current += (mid + high + vocoderDrive) * phaseSpeed;

      if (speechActive || vocoderActive) {
        const vocAmp = vocoderActive ? Math.min(1, vocoderAmplitude * 15) : 0;

        const syllablePop = Math.min(1, midDelta * 8 + highDelta * 6);
        const phaseModulation = Math.sin(mouthPhase.current) * 0.3 + 0.3;
        const speechJaw = Math.min(jawMax, mid * 0.15 + syllablePop * 0.2 + phaseModulation * 0.12);
        const vocoderJaw = Math.min(vocoderJawMax, vocAmp * 0.35 + Math.sin(mouthPhase.current) * vocAmp * 0.1);
        const jawTarget = vocoderActive ? Math.max(speechJaw, vocoderJaw) : speechJaw;
        smoothJaw.current += (jawTarget - smoothJaw.current) * 0.5;
        m[MORPH.jawOpen] = smoothJaw.current;
        m[MORPH.mouthLowerDown_L] = smoothJaw.current * 0.4;
        m[MORPH.mouthLowerDown_R] = smoothJaw.current * 0.4;

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
      const smileTarget = beat ? smileBeat : bass * smileBass;
      smoothSmile.current += (smileTarget - smoothSmile.current) * 0.12;
      m[MORPH.mouthSmile_L] = smoothSmile.current;
      m[MORPH.mouthSmile_R] = smoothSmile.current * 0.85;

      // ── Brows — reactive + idle micro-movement ──
      const browReactive = (high * 0.3 + midDelta * 1.5 + (speechActive ? 0.08 : 0)) * browScale;
      const browIdle = Math.sin(t * 0.4) * 0.12 + Math.sin(t * 1.1) * 0.06;
      smoothBrow.current += (browReactive + browIdle - smoothBrow.current) * 0.2;
      m[MORPH.browInnerUp] = Math.max(0, Math.min(browClamp, smoothBrow.current));
      m[MORPH.browOuterUp_L] = Math.max(0, Math.sin(t * 0.3) * 0.15 + high * 0.2);
      m[MORPH.browOuterUp_R] = Math.max(0, Math.sin(t * 0.3 + 0.5) * 0.2 + high * 0.15);
      m[MORPH.browDown_L] = bass > 0.6 ? (bass - 0.6) * 0.4 : 0;
      m[MORPH.browDown_R] = bass > 0.6 ? (bass - 0.6) * 0.35 : 0;

      // ── Eyes — natural saccades + slow drift + blink ──
      const eyeScale = maxHeadroom ? 1.5 : 1.0;
      const lookX = (Math.sin(t * 0.23) * 0.6 + Math.sin(t * 0.71) * 0.3) * eyeScale;
      const lookY = (Math.sin(t * 0.17) * 0.4 + Math.cos(t * 0.53) * 0.2) * eyeScale;
      m[MORPH.eyeLookIn_L] = Math.max(0, lookX);
      m[MORPH.eyeLookOut_L] = Math.max(0, -lookX);
      m[MORPH.eyeLookIn_R] = Math.max(0, -lookX);
      m[MORPH.eyeLookOut_R] = Math.max(0, lookX);
      m[MORPH.eyeLookUp_L] = Math.max(0, lookY) * 0.8;
      m[MORPH.eyeLookUp_R] = Math.max(0, lookY) * 0.8;
      m[MORPH.eyeLookDown_L] = Math.max(0, -lookY) * 0.8;
      m[MORPH.eyeLookDown_R] = Math.max(0, -lookY) * 0.8;

      // Blink — erratic in Max Headroom, natural otherwise
      blinkTimer.current += 0.016;
      if (blinkTimer.current > blinkBase + Math.sin(t * 0.1) * 1.5) {
        blinkTimer.current = 0;
        smoothBlink.current = 1;
      }
      smoothBlink.current *= 0.82;
      m[MORPH.eyeBlink_L] = smoothBlink.current;
      m[MORPH.eyeBlink_R] = smoothBlink.current;
      m[MORPH.eyeWide_L] = eyeWideBase;
      m[MORPH.eyeWide_R] = eyeWideBase;
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
        const breatheAmp = maxHeadroom ? 0.08 : 0.04;
        const breathe = Math.sin(t * (maxHeadroom ? 1.5 : 0.8)) * breatheAmp + breatheAmp;
        m[MORPH.jawOpen] = breathe;
      }

      // ── Mouth micro-expressions when idle ──
      if (!speechActive) {
        const twitch = Math.sin(t * (maxHeadroom ? 2.0 : 0.6)) * (maxHeadroom ? 0.15 : 0.08);
        m[MORPH.mouthLeft] = Math.max(0, twitch);
        m[MORPH.mouthRight] = Math.max(0, -twitch);
        m[MORPH.mouthPucker] = Math.max(0, Math.sin(t * 0.25) * (maxHeadroom ? 0.2 : 0.1));
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

    // ── Animate hair spikes — music-reactive extrusion ──
    const spikeData = spikeDataRef.current;
    const spikeMesh = spikeMeshRef.current;
    if (spikeData && spikeMesh) {
      const { origins, normals, phases, basePositions, count, spikeScale } = spikeData;
      const posAttr = spikeMesh.geometry.getAttribute('position') as THREE.BufferAttribute;

      for (let i = 0; i < count; i++) {
        const phase = phases[i];
        // Each spike responds to a mix of bass, mid, high with its own phase
        const wave = Math.sin(t * 4.0 + phase * 3.0) * 0.5 + 0.5;
        const bassWave = Math.sin(t * 2.0 + phase) * bass;
        const midPulse = mid * Math.sin(t * 6.0 + phase * 2.0);
        const highSparkle = high * (Math.sin(t * 12.0 + phase * 5.0) > 0.3 ? 1.0 : 0.0);
        const beatPop = beat ? 0.5 : 0;

        // Combine into normalized spike length (0 to ~0.3)
        let length = 0.02 + wave * 0.03 // idle gentle wave
          + bassWave * 0.12             // bass pumps
          + midPulse * 0.08             // mid ripples
          + highSparkle * 0.06          // high frequency sparkle
          + beatPop * 0.1;             // beat pop
        // Max Headroom: erratic per-spike flutter
        if (maxHeadroom && isActive && Math.random() > 0.9) {
          length += 0.15 * glitchIntensity.current;
        }
        length = Math.max(0.01, Math.min(0.3, length));

        // Scale to head geometry coordinates and fade with visibility
        length *= vis * spikeScale;

        const ox = origins[i * 3];
        const oy = origins[i * 3 + 1];
        const oz = origins[i * 3 + 2];
        const nx = normals[i * 3];
        const ny = normals[i * 3 + 1];
        const nz = normals[i * 3 + 2];

        // Base vertex stays at origin
        basePositions[i * 6] = ox;
        basePositions[i * 6 + 1] = oy;
        basePositions[i * 6 + 2] = oz;
        // Tip vertex extends along normal
        basePositions[i * 6 + 3] = ox + nx * length;
        basePositions[i * 6 + 4] = oy + ny * length;
        basePositions[i * 6 + 5] = oz + nz * length;
      }

      posAttr.needsUpdate = true;
      spikeMat.opacity = 0.9 * vis;
    }

    // ── Head movement ──
    if (maxHeadroom && isActive) {
      // Jerky Max Headroom head: mostly instant snaps
      const gi = glitchIntensity.current;
      headJerkTimer.current -= dt;
      if (headJerkTimer.current <= 0) {
        headJerkTimer.current = 0.2 + Math.random() * (1.5 - gi * 1.0);
        const range = 0.15 + Math.random() * 0.45;
        headTargetY.current = (Math.random() - 0.5) * 2 * range;
        headTargetX.current = (Math.random() - 0.4) * 0.25;
        // 75% instant snap, 25% smooth
        if (Math.random() > 0.25) {
          headCurrentY.current = headTargetY.current;
          headCurrentX.current = headTargetX.current;
        }
      }
      headCurrentY.current += (headTargetY.current - headCurrentY.current) * 0.15;
      headCurrentX.current += (headTargetX.current - headCurrentX.current) * 0.15;
      if (beat) {
        beatImpulse.current = 0.12;
        headCurrentY.current += (Math.random() - 0.5) * 0.1;
      }
    } else {
      // Normal smooth head movement
      headHoldTimer.current += dt;
      if (headHoldTimer.current > headHoldDuration.current) {
        headHoldTimer.current = 0;
        headHoldDuration.current = 1.5 + Math.random() * 4;
        headTurnSpeed.current = 0.02 + Math.random() * 0.04;
        const range = Math.random() > 0.3 ? 0.2 : 0.4;
        headTargetY.current = (Math.random() - 0.5) * 2 * range;
        headTargetX.current = (Math.random() - 0.4) * 0.15;
      }
      headCurrentY.current += (headTargetY.current - headCurrentY.current) * headTurnSpeed.current;
      headCurrentX.current += (headTargetX.current - headCurrentX.current) * headTurnSpeed.current;
      if (beat) beatImpulse.current = 0.06;
    }
    beatImpulse.current *= 0.93;

    group.rotation.y = headCurrentY.current;
    group.rotation.x = headCurrentX.current + beatImpulse.current;
    group.rotation.z = Math.sin(t * 0.15) * 0.02 + headCurrentY.current * 0.05;
    group.position.y = -0.05 + Math.sin(t * 0.8) * 0.005 + bass * 0.03;
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
