/* @refresh reset */
/**
 * DeckVinyl3DView — 3D WebGL turntable for DJ mode.
 *
 * Loads a Technics SL-1200GR .glb model (12 named mesh nodes, PBR textures, Y-up, cm units).
 * Supports: spinning platter, vinyl scratch via pointer drag, tonearm position tracking,
 * and orbit camera controls.
 *
 * Model node structure (all identity transforms — geometry is in world/cm space):
 *   Platter_2          — spinning platter disc
 *   Vinyl              — vinyl record (spins with platter)
 *   Tonearm_2          — tonearm arm
 *   Swivle             — tonearm bearing/swivel (pivot point for tonearm rotation)
 *   Cartridge          — stylus cartridge (part of tonearm assembly)
 *   Main_Body_2        — deck chassis
 *   Miscellaneous      — buttons, knobs, labels
 *   Antiskating_Dial_Cap — antiskating control
 *   Glass_Cover_2      — dust cover (hidden for DJ use)
 *   Hinges / Glass_Caps / Feet_Plus — structural parts
 *
 * MODEL_SCALE = 0.01 converts cm → metres. Platter and tonearm meshes are animated
 * via direct matrix writes (makeRotationY). Tonearm pivot is derived from Swivle bbox.
 *
 * Lazy-loaded in DJDeck to avoid bloating the initial bundle.
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useGLTF, OrbitControls, View, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { TurntablePhysics, OMEGA_NORMAL } from '@/engine/turntable/TurntablePhysics';
import { CameraControlOverlay } from './DJ3DCameraControls';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL_PATH = '/models/turntable.glb';

/** Scale: model is in cm, Three.js world is in metres. */
const MODEL_SCALE = 0.01;

const DECK_ACCENT: Record<string, string> = {
  A: '#60a5fa',
  B: '#f87171',
  C: '#34d399',
};

// RPM speed constants
const RPM_33 = 33;
const RPM_45 = 45;
const RPS_33 = 33.333 / 60;
const RPS_45 = 45 / 60;

// Tonearm rotation range (radians around Y axis at the Swivle bearing).
// Rest = tonearm lifted/parked (slightly clockwise of start).
// The tonearm in the model is at the outer-groove position (TONEARM_ANGLE_START = 0).
const TONEARM_ANGLE_REST = 0.30;    // lifted/parked, off the record
const TONEARM_ANGLE_START = 0.0;    // outer groove (model's default position)
const TONEARM_ANGLE_END = -0.35;    // inner groove

// Pre-allocated matrices for per-frame rotation (avoids GC pressure)
const _rotMat = new THREE.Matrix4();
const _transMat = new THREE.Matrix4();
const _invTransMat = new THREE.Matrix4();
const _compositeMat = new THREE.Matrix4();

/** Compute rotation matrix around a Y-axis pivot point (model is Y-up). */
function makeRotationAroundPivot(angle: number, pivot: THREE.Vector3, out: THREE.Matrix4): void {
  // M = T(pivot) * Ry(angle) * T(-pivot)
  _transMat.makeTranslation(pivot.x, pivot.y, pivot.z);
  _rotMat.makeRotationY(angle);
  _invTransMat.makeTranslation(-pivot.x, -pivot.y, -pivot.z);
  out.copy(_transMat).multiply(_rotMat).multiply(_invTransMat);
}

// ── Inner 3D Scene Component ─────────────────────────────────────────────────

interface TurntableSceneProps {
  deckId: 'A' | 'B' | 'C';
  orbitRef: React.RefObject<OrbitControlsImpl | null>;
}

function TurntableScene({ deckId, orbitRef }: TurntableSceneProps) {
  const { scene: gltfScene } = useGLTF(MODEL_PATH);

  // Refs
  const physicsRef = useRef(new TurntablePhysics());
  const platterAngleRef = useRef(0);
  const tonearmAngleRef = useRef(TONEARM_ANGLE_REST);
  const isScratchActiveRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerTimeRef = useRef(0);
  const prevRateRef = useRef(1);
  const pitchDragRef = useRef(false);
  const pitchDragStartYRef = useRef(0);
  const pitchDragStartValueRef = useRef(0);
  const rpmRef = useRef(RPM_33);

  // Store subscriptions
  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);
  const songPos = useDJStore((s) => s.decks[deckId].songPos);
  const totalPositions = useDJStore((s) => s.decks[deckId].totalPositions);
  const audioPosition = useDJStore((s) => s.decks[deckId].audioPosition);
  const durationMs = useDJStore((s) => s.decks[deckId].durationMs);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);
  const pitchOffset = useDJStore((s) => s.decks[deckId].pitchOffset);
  const trackName = useDJStore((s) => s.decks[deckId].trackName);

  const playStateRef = useRef({ isPlaying, songPos, totalPositions, audioPosition, durationMs, playbackMode, pitchOffset });
  playStateRef.current = { isPlaying, songPos, totalPositions, audioPosition, durationMs, playbackMode, pitchOffset };

  const accentColor = DECK_ACCENT[deckId] ?? '#60a5fa';

  // ── Clone scene and classify meshes ───────────────────────────────────────

  const { clonedScene, platterMeshes, tonearmMeshes, platterCenter, tonearmPivot } = useMemo(() => {
    const cloned = gltfScene.clone(true);
    cloned.updateMatrixWorld(true);

    const platters: THREE.Mesh[] = [];
    const tonearms: THREE.Mesh[] = [];
    let swivleMesh: THREE.Mesh | null = null;

    cloned.traverse((child) => {
      if (!('isMesh' in child && child.isMesh)) return;
      const mesh = child as THREE.Mesh;
      const name = mesh.name;

      // Three.js GLTF loader appends _1 to mesh nodes when both the transform node
      // and mesh node share the same name in the GLB file.
      if (name === 'Platter_2_1' || name === 'Vinyl_1') {
        platters.push(mesh);
      } else if (name === 'Tonearm_2_1' || name === 'Swivle_1' || name === 'Cartridge_1') {
        tonearms.push(mesh);
        if (name === 'Swivle_1') swivleMesh = mesh;
      } else if (name === 'Glass_Cover_2_1' || name === 'Hinges_1' || name === 'Glass_Caps_1') {
        mesh.visible = false;
      }
    });

    // Platter pivot: center of the Vinyl disc (thinnest, most accurate circle)
    const pCenter = new THREE.Vector3();
    const vinylMesh = platters.find((m) => m.name === 'Vinyl_1');
    if (vinylMesh) {
      vinylMesh.geometry.computeBoundingBox();
      vinylMesh.geometry.boundingBox!.getCenter(pCenter);
    } else if (platters.length > 0) {
      const box = new THREE.Box3();
      for (const m of platters) {
        m.geometry.computeBoundingBox();
        if (m.geometry.boundingBox) box.union(m.geometry.boundingBox);
      }
      box.getCenter(pCenter);
    }

    // Tonearm pivot: center of the Swivle (bearing) mesh
    const tPivot = new THREE.Vector3();
    if (swivleMesh) {
      (swivleMesh as THREE.Mesh).geometry.computeBoundingBox();
      (swivleMesh as THREE.Mesh).geometry.boundingBox!.getCenter(tPivot);
    }

    // Disable auto-update on animated meshes — we set .matrix directly each frame
    for (const m of platters) m.matrixAutoUpdate = false;
    for (const m of tonearms) m.matrixAutoUpdate = false;

    console.log(`[3DTurntable] Platter: ${platters.length} meshes, pivot=(${pCenter.x.toFixed(2)}, ${pCenter.y.toFixed(2)}, ${pCenter.z.toFixed(2)}) cm`);
    console.log(`[3DTurntable] Tonearm: ${tonearms.length} meshes, pivot=(${tPivot.x.toFixed(2)}, ${tPivot.y.toFixed(2)}, ${tPivot.z.toFixed(2)}) cm`);

    return { clonedScene: cloned, platterMeshes: platters, tonearmMeshes: tonearms, platterCenter: pCenter, tonearmPivot: tPivot };
  }, [gltfScene]);

  // ── Animation: platter rotation + tonearm position ───────────────────────

  useFrame((_state, delta) => {
    const { isPlaying: playing, songPos: sPos, totalPositions: total,
      audioPosition: aPos, durationMs: dur, playbackMode: mode } = playStateRef.current;
    const physics = physicsRef.current;

    // ── Platter rotation ──
    if (platterMeshes.length > 0) {
      const baseRps = rpmRef.current === RPM_45 ? RPS_45 : RPS_33;
      const pitchMultiplier = Math.pow(2, playStateRef.current.pitchOffset / 12);
      const rps = baseRps * pitchMultiplier;

      if (playing || isScratchActiveRef.current) {
        let rate = 1;
        if (isScratchActiveRef.current || physics.spinbackActive || physics.powerCutActive) {
          rate = physics.tick(delta);
        }

        platterAngleRef.current -= rps * rate * 2 * Math.PI * delta;

        if (isScratchActiveRef.current && Math.abs(rate - prevRateRef.current) > 0.01) {
          try { getDJEngine().getDeck(deckId).setScratchVelocity(rate); } catch { /* not ready */ }
          prevRateRef.current = rate;
        }

        if (isScratchActiveRef.current && !physics.touching && !physics.spinbackActive && !physics.powerCutActive) {
          if (Math.abs(rate - 1.0) < 0.02) {
            isScratchActiveRef.current = false;
            try { getDJEngine().getDeck(deckId).stopScratch(50); } catch { /* not ready */ }
            useDJStore.getState().setDeckScratchActive(deckId, false);
            prevRateRef.current = 1;
          }
        }
      }

      makeRotationAroundPivot(platterAngleRef.current, platterCenter, _compositeMat);
      for (const mesh of platterMeshes) {
        mesh.matrix.copy(_compositeMat);
      }
    }

    // ── Tonearm follows song position ──
    if (tonearmMeshes.length > 0) {
      let progress = 0;
      if (mode === 'audio' && dur > 0) {
        progress = aPos / (dur / 1000);
      } else if (mode === 'tracker' && total > 0) {
        progress = sPos / total;
      }
      progress = Math.max(0, Math.min(1, progress));

      const targetAngle = trackName
        ? TONEARM_ANGLE_START + progress * (TONEARM_ANGLE_END - TONEARM_ANGLE_START)
        : TONEARM_ANGLE_REST;

      tonearmAngleRef.current += (targetAngle - tonearmAngleRef.current) * Math.min(1, delta * 5);

      makeRotationAroundPivot(tonearmAngleRef.current, tonearmPivot, _compositeMat);
      for (const mesh of tonearmMeshes) {
        mesh.matrix.copy(_compositeMat);
      }
    }
  });

  // ── Scratch interaction ───────────────────────────────────────────────────

  const enterScratch = useCallback(() => {
    if (isScratchActiveRef.current) return;
    isScratchActiveRef.current = true;
    useDJStore.getState().setDeckScratchActive(deckId, true);
    try { getDJEngine().getDeck(deckId).startScratch(); } catch { /* not ready */ }
  }, [deckId]);

  const handlePlatterPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.nativeEvent.target as HTMLElement)?.setPointerCapture?.(e.nativeEvent.pointerId);
    if (!playStateRef.current.isPlaying) return;
    enterScratch();
    lastPointerRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
    lastPointerTimeRef.current = performance.now();
    physicsRef.current.setTouching(true);
    physicsRef.current.setHandVelocity(0);
  }, [enterScratch]);

  const handlePlatterPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!lastPointerRef.current) return;
    const dx = e.nativeEvent.clientX - lastPointerRef.current.x;
    const now = performance.now();
    const dt = Math.max(0.001, (now - lastPointerTimeRef.current) / 1000);
    lastPointerTimeRef.current = now;
    const pixelVelocity = -dx / dt;
    const omega = (pixelVelocity / 400) * OMEGA_NORMAL;
    physicsRef.current.setHandVelocity(omega);
    lastPointerRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
  }, []);

  const handlePlatterPointerUp = useCallback(() => {
    lastPointerRef.current = null;
    physicsRef.current.setTouching(false);
  }, []);

  // ── Power button ─────────────────────────────────────────────────────────

  const handlePowerClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    try {
      const deck = getDJEngine().getDeck(deckId);
      const store = useDJStore.getState();
      if (store.decks[deckId].isPlaying) {
        deck.pause();
        store.setDeckPlaying(deckId, false);
      } else {
        deck.play();
        store.setDeckPlaying(deckId, true);
      }
    } catch { /* not ready */ }
  }, [deckId]);

  // ── Pitch slider ─────────────────────────────────────────────────────────

  const handlePitchPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    pitchDragRef.current = true;
    pitchDragStartYRef.current = e.nativeEvent.clientY;
    pitchDragStartValueRef.current = playStateRef.current.pitchOffset;
    (e.nativeEvent.target as HTMLElement)?.setPointerCapture?.(e.nativeEvent.pointerId);
  }, []);

  const handlePitchPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!pitchDragRef.current) return;
    const dy = e.nativeEvent.clientY - pitchDragStartYRef.current;
    const pitchDelta = (dy / 200) * 8;
    const newPitch = Math.max(-8, Math.min(8, pitchDragStartValueRef.current + pitchDelta));
    useDJStore.getState().setDeckPitch(deckId, newPitch);
  }, [deckId]);

  const handlePitchPointerUp = useCallback(() => {
    pitchDragRef.current = false;
  }, []);

  const handlePitchDoubleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    useDJStore.getState().setDeckPitch(deckId, 0);
  }, [deckId]);

  // ── 33/45 RPM toggle ─────────────────────────────────────────────────────

  const handleRpmClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    rpmRef.current = rpmRef.current === RPM_33 ? RPM_45 : RPM_33;
    console.log(`[3DTurntable] RPM set to ${rpmRef.current}`);
  }, []);

  // ── Wheel nudge ──────────────────────────────────────────────────────────

  const handleWheel = useCallback((e: ThreeEvent<WheelEvent>) => {
    if (!playStateRef.current.isPlaying) return;
    e.stopPropagation();
    if (!isScratchActiveRef.current) enterScratch();
    const impulse = TurntablePhysics.deltaToImpulse(e.nativeEvent.deltaY, e.nativeEvent.deltaMode);
    physicsRef.current.applyImpulse(impulse);
  }, [enterScratch]);

  // Hitbox positions are in world-space metres (model cm × MODEL_SCALE = 0.01).
  // Coordinate system (from tonearm/platter pivot data):
  //   X+ = right side,  X- = left side
  //   Y+ = up,          surface ≈ 0.106 m
  //   Z+ = front,       Z- = back (tonearm pivot at Z=-0.0995 confirms this)
  //
  // Platter:  Vinyl bbox centre (-4.937, 10.669, -1.029) × 0.01 → (-0.049, 0.107, -0.010)
  //           Vinyl radius 15.948 cm × 0.01 → 0.159 m
  //
  // SL-1200GR layout (estimated from real unit dimensions 453×353mm):
  //   Start/Stop button: left-front  → X≈-17.5cm, Z≈+12cm
  //   Pitch fader:       right side  → X≈+17cm,   Z≈+2cm (centre), spans ~18cm
  //   33/45 RPM:         left-front  → X≈-12cm,   Z≈+13cm
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 5, 3]} intensity={0.9} castShadow={false} />
      <directionalLight position={[-2, 3, -1]} intensity={0.3} />
      <pointLight position={[0, 0.05, 0]} color={accentColor} intensity={0.4} distance={0.6} />

      {/* Turntable model — scaled from cm to metres */}
      <primitive object={clonedScene} scale={MODEL_SCALE} />

      {/* Platter interaction (scratch / wheel nudge) */}
      <mesh
        position={[-0.049, 0.108, -0.010]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={handlePlatterPointerDown}
        onPointerMove={handlePlatterPointerMove}
        onPointerUp={handlePlatterPointerUp}
        onPointerCancel={handlePlatterPointerUp}
        onWheel={handleWheel}
      >
        <circleGeometry args={[0.159, 32]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Start/Stop button — left-front of deck (SL-1200GR) */}
      <mesh position={[-0.175, 0.105, 0.12]} onClick={handlePowerClick}>
        <boxGeometry args={[0.05, 0.02, 0.05]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Pitch fader — right side of deck, vertical slider (SL-1200GR) */}
      <mesh
        position={[0.175, 0.105, 0.02]}
        onPointerDown={handlePitchPointerDown}
        onPointerMove={handlePitchPointerMove}
        onPointerUp={handlePitchPointerUp}
        onPointerCancel={handlePitchPointerUp}
        onDoubleClick={handlePitchDoubleClick}
      >
        <boxGeometry args={[0.025, 0.02, 0.18]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* 33/45 RPM selector — left-front, right of Start/Stop (SL-1200GR) */}
      <mesh position={[-0.12, 0.105, 0.13]} onClick={handleRpmClick}>
        <boxGeometry args={[0.06, 0.02, 0.04]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <OrbitControls
        ref={orbitRef}
        enablePan={false}
        enableZoom={false}
        enableRotate={false}
        enableDamping
        dampingFactor={0.1}
        minPolarAngle={Math.PI * 0.05}
        maxPolarAngle={Math.PI * 0.45}
        minDistance={0.1}
        maxDistance={2.0}
        mouseButtons={{
          LEFT: undefined as unknown as THREE.MOUSE,
          MIDDLE: undefined as unknown as THREE.MOUSE,
          RIGHT: undefined as unknown as THREE.MOUSE,
        }}
      />
    </>
  );
}

// ── Outer wrapper component ──────────────────────────────────────────────────

interface DeckVinyl3DViewProps {
  deckId: 'A' | 'B' | 'C';
}

function DeckVinyl3DView({ deckId }: DeckVinyl3DViewProps) {
  const orbitRef = useRef<OrbitControlsImpl>(null);

  return (
    <div className="relative w-full h-full min-h-[200px]" style={{ touchAction: 'none' }}>
      {/* View registers with the shared Canvas in DJView via View.Port (drei scissor rendering).
          PerspectiveCamera makeDefault sets the per-view virtual camera. */}
      <View className="absolute inset-0">
        <PerspectiveCamera
          makeDefault
          position={[0.20, 0.42, 0.50]}
          fov={45}
          near={0.01}
          far={10}
        />
        <TurntableScene deckId={deckId} orbitRef={orbitRef} />
      </View>
      <CameraControlOverlay orbitRef={orbitRef} />
    </div>
  );
}

// Preload the model
useGLTF.preload(MODEL_PATH);

export default DeckVinyl3DView;
