/**
 * DeckVinyl3DView — 3D WebGL turntable for DJ mode.
 *
 * Loads a Technics SL-1200 .glb model and renders it with Three.js via React Three Fiber.
 * Supports: spinning platter, vinyl scratch via pointer drag, tonearm position tracking,
 * interactive power button, pitch slider drag, and orbit camera controls.
 *
 * The GLB model has a FLAT hierarchy: all 41 meshes are siblings under one parent node,
 * identified by their **material name** (French-authored model). All node transforms are
 * identity — geometry vertex positions are in world space.
 *
 * Instead of reparenting meshes into groups (which was fragile), we apply per-mesh
 * rotation matrices directly each frame: platter meshes rotate around the platter center,
 * tonearm meshes rotate around the tonearm pivot.
 *
 * Lazy-loaded in DJDeck to avoid bloating the initial bundle.
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { TurntablePhysics, OMEGA_NORMAL } from '@/engine/turntable/TurntablePhysics';

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL_PATH = '/models/turntable.glb';

const DECK_ACCENT: Record<string, string> = {
  A: '#60a5fa',
  B: '#f87171',
  C: '#34d399',
};

/**
 * Mesh classification by MATERIAL name (French-authored GLB, mesh.name is just "Object_N").
 *
 * IMPORTANT: "plateau" (0.41×0.31) is the turntable BODY/CHASSIS, NOT the spinning platter!
 * The actual platter parts are the rubber mat, record, label, center spindle, and rim rings.
 * "mesure_vitesse" / "mesure_vitesse_milieu" are speed indicators on the body (off-center).
 */
const PLATTER_MATERIALS = new Set([
  'caoutchouc',               // rubber mat on platter (0.247)
  'surface_disque',           // vinyl record surface (0.236)
  'milieu_disque',            // center record label (0.070)
  'bitoniau',                 // center spindle/nub (0.008)
  'tour_plateau',             // platter chrome rim ring (0.275)
  'tour_plateau_et_ronds',    // outer strobe ring (0.280)
]);

const TONEARM_MATERIALS = new Set([
  'bras', 'tete', 'tetemetal', 'poids', 'mesure_tete',
]);

const POWER_LED_MATERIALS = new Set(['voyant']);
const PITCH_SLIDER_MATERIALS = new Set(['bouton_vit', 'dessus_bouton_vit']);

// Tonearm rotation range (radians around Z axis, from rest to inner groove)
// (model is Z-up; root node converts Z-up → Y-up for Three.js)
const TONEARM_ANGLE_REST = -0.05;   // Slightly off-record
const TONEARM_ANGLE_START = 0.0;    // Outer groove (start of track)
const TONEARM_ANGLE_END = 0.45;     // Inner groove (end of track)

// Pre-allocated matrices for per-frame rotation (avoids GC pressure)
const _rotMat = new THREE.Matrix4();
const _transMat = new THREE.Matrix4();
const _invTransMat = new THREE.Matrix4();
const _compositeMat = new THREE.Matrix4();

/** Compute rotation matrix around a Z-axis pivot point (model is Z-up) */
function makeRotationAroundPivot(angle: number, pivot: THREE.Vector3, out: THREE.Matrix4): void {
  // M = T(pivot) * Rz(angle) * T(-pivot)
  _transMat.makeTranslation(pivot.x, pivot.y, pivot.z);
  _rotMat.makeRotationZ(angle);
  _invTransMat.makeTranslation(-pivot.x, -pivot.y, -pivot.z);
  out.copy(_transMat).multiply(_rotMat).multiply(_invTransMat);
}

// ── Inner 3D Scene Component ─────────────────────────────────────────────────

interface TurntableSceneProps {
  deckId: 'A' | 'B' | 'C';
}

function TurntableScene({ deckId }: TurntableSceneProps) {
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

  // Store subscriptions
  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);
  const effectiveBPM = useDJStore((s) => s.decks[deckId].effectiveBPM);
  const songPos = useDJStore((s) => s.decks[deckId].songPos);
  const totalPositions = useDJStore((s) => s.decks[deckId].totalPositions);
  const audioPosition = useDJStore((s) => s.decks[deckId].audioPosition);
  const durationMs = useDJStore((s) => s.decks[deckId].durationMs);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);
  const pitchOffset = useDJStore((s) => s.decks[deckId].pitchOffset);
  const trackName = useDJStore((s) => s.decks[deckId].trackName);

  // Keep latest values in refs for useFrame
  const playStateRef = useRef({ isPlaying, effectiveBPM, songPos, totalPositions, audioPosition, durationMs, playbackMode, pitchOffset });
  playStateRef.current = { isPlaying, effectiveBPM, songPos, totalPositions, audioPosition, durationMs, playbackMode, pitchOffset };

  const accentColor = DECK_ACCENT[deckId] ?? '#60a5fa';

  // ── Clone scene and classify meshes (NO reparenting) ──────────────────────

  const { clonedScene, platterMeshes, tonearmMeshes, platterCenter, tonearmPivot, powerLedMesh } = useMemo(() => {
    const cloned = gltfScene.clone(true);
    cloned.updateMatrixWorld(true);

    const getMaterialName = (mesh: THREE.Mesh): string => {
      return (mesh.material instanceof THREE.Material) ? mesh.material.name.toLowerCase() : '';
    };

    // Classify meshes by material name
    const platters: THREE.Mesh[] = [];
    const tonearms: THREE.Mesh[] = [];
    let led: THREE.Mesh | null = null;
    let slider: THREE.Mesh | null = null;

    cloned.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const matName = getMaterialName(child);

      if (PLATTER_MATERIALS.has(matName)) {
        platters.push(child);
      } else if (TONEARM_MATERIALS.has(matName)) {
        tonearms.push(child);
      } else if (POWER_LED_MATERIALS.has(matName)) {
        led = child;
      } else if (PITCH_SLIDER_MATERIALS.has(matName)) {
        slider = child;
      }
    });

    // Compute platter center from bounding box of all platter meshes
    const pCenter = new THREE.Vector3();
    if (platters.length > 0) {
      const box = new THREE.Box3();
      for (const m of platters) box.expandByObject(m);
      box.getCenter(pCenter);
    }

    // Compute tonearm pivot: mounting post at back-right corner of tonearm bounding box
    const tPivot = new THREE.Vector3();
    if (tonearms.length > 0) {
      const box = new THREE.Box3();
      for (const m of tonearms) box.expandByObject(m);
      tPivot.set(box.max.x, (box.min.y + box.max.y) / 2, box.max.z);
    }

    // Disable auto-update on platter/tonearm meshes — we'll set .matrix directly
    for (const m of platters) m.matrixAutoUpdate = false;
    for (const m of tonearms) m.matrixAutoUpdate = false;

    console.log(`[3DTurntable] Platter: ${platters.length} meshes, center=(${pCenter.x.toFixed(3)}, ${pCenter.y.toFixed(3)}, ${pCenter.z.toFixed(3)})`);
    console.log(`[3DTurntable] Tonearm: ${tonearms.length} meshes, pivot=(${tPivot.x.toFixed(3)}, ${tPivot.y.toFixed(3)}, ${tPivot.z.toFixed(3)})`);

    return {
      clonedScene: cloned,
      platterMeshes: platters,
      tonearmMeshes: tonearms,
      platterCenter: pCenter,
      tonearmPivot: tPivot,
      powerLedMesh: led as THREE.Mesh | null,
      pitchSliderMesh: slider as THREE.Mesh | null,
    };
  }, [gltfScene]);

  // Update LED on play state change
  useEffect(() => {
    if (!powerLedMesh) return;
    const mat = powerLedMesh.material;
    if (mat instanceof THREE.MeshStandardMaterial) {
      if (isPlaying) {
        mat.emissive = new THREE.Color('#ff2020');
        mat.emissiveIntensity = 2;
      } else {
        mat.emissive = new THREE.Color('#200000');
        mat.emissiveIntensity = 0.3;
      }
      mat.needsUpdate = true;
    }
  }, [isPlaying, powerLedMesh]);

  // ── Animation: platter rotation + tonearm position ───────────────────────

  useFrame((_state, delta) => {
    const { isPlaying: playing, effectiveBPM: bpm, songPos: sPos, totalPositions: total,
      audioPosition: aPos, durationMs: dur, playbackMode: mode } = playStateRef.current;
    const physics = physicsRef.current;

    // ── Platter rotation ──
    if (platterMeshes.length > 0) {
      const baseBPM = bpm || 120;
      const rps = (baseBPM / 120) * 0.5556; // 33⅓ RPM normalized

      if (playing || isScratchActiveRef.current) {
        let rate = 1;
        if (isScratchActiveRef.current || physics.spinbackActive || physics.powerCutActive) {
          rate = physics.tick(delta);
        }

        platterAngleRef.current += rps * rate * 2 * Math.PI * delta;

        // Forward rate to DeckEngine scratch API
        if (isScratchActiveRef.current && Math.abs(rate - prevRateRef.current) > 0.01) {
          try { getDJEngine().getDeck(deckId).setScratchVelocity(rate); } catch { /* not ready */ }
          prevRateRef.current = rate;
        }

        // Check if physics settled — exit scratch
        if (isScratchActiveRef.current && !physics.touching && !physics.spinbackActive && !physics.powerCutActive) {
          if (Math.abs(rate - 1.0) < 0.02) {
            isScratchActiveRef.current = false;
            try { getDJEngine().getDeck(deckId).stopScratch(50); } catch { /* not ready */ }
            useDJStore.getState().setDeckScratchActive(deckId, false);
            prevRateRef.current = 1;
          }
        }
      }
      // When not playing (and not scratching), platter is stationary

      // Apply rotation matrix to each platter mesh (rotates vertices around platter center)
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

      // Smooth interpolation
      tonearmAngleRef.current += (targetAngle - tonearmAngleRef.current) * Math.min(1, delta * 5);

      makeRotationAroundPivot(tonearmAngleRef.current, tonearmPivot, _compositeMat);
      for (const mesh of tonearmMeshes) {
        mesh.matrix.copy(_compositeMat);
      }
    }
  });

  // ── Scratch interaction (pointer on platter) ──────────────────────────────

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

  // ── Power button interaction ──────────────────────────────────────────────

  const handlePowerClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    try {
      const deck = getDJEngine().getDeck(deckId);
      const store = useDJStore.getState();
      if (store.decks[deckId].isPlaying) {
        deck.stop();
        store.setDeckPlaying(deckId, false);
      } else {
        deck.play();
        store.setDeckPlaying(deckId, true);
      }
    } catch { /* not ready */ }
  }, [deckId]);

  // ── Pitch slider drag ────────────────────────────────────────────────────

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

  // ── Wheel handler for nudge ──────────────────────────────────────────────

  const handleWheel = useCallback((e: ThreeEvent<WheelEvent>) => {
    if (!playStateRef.current.isPlaying) return;
    e.stopPropagation();

    if (!isScratchActiveRef.current) {
      enterScratch();
    }

    const impulse = TurntablePhysics.deltaToImpulse(e.nativeEvent.deltaY, e.nativeEvent.deltaMode);
    physicsRef.current.applyImpulse(impulse);
  }, [enterScratch]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[2, 4, 2]} intensity={0.8} castShadow={false} />
      <directionalLight position={[-1, 2, -1]} intensity={0.3} />
      <pointLight position={[0, -0.05, 0]} color={accentColor} intensity={0.5} distance={0.5} />

      {/* The turntable model (untouched hierarchy) */}
      <primitive object={clonedScene} />

      {/* Invisible interaction meshes */}
      {/* Platter — large cylinder for scratch interaction */}
      <mesh
        position={[0, 0.045, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={handlePlatterPointerDown}
        onPointerMove={handlePlatterPointerMove}
        onPointerUp={handlePlatterPointerUp}
        onPointerCancel={handlePlatterPointerUp}
        onWheel={handleWheel}
        visible={false}
      >
        <circleGeometry args={[0.15, 32]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Power button */}
      <mesh
        position={[0.14, 0.035, 0.12]}
        onClick={handlePowerClick}
        visible={false}
      >
        <boxGeometry args={[0.025, 0.02, 0.025]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Pitch slider */}
      <mesh
        position={[-0.16, 0.035, 0.0]}
        onPointerDown={handlePitchPointerDown}
        onPointerMove={handlePitchPointerMove}
        onPointerUp={handlePitchPointerUp}
        onPointerCancel={handlePitchPointerUp}
        visible={false}
      >
        <boxGeometry args={[0.02, 0.02, 0.12]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Camera controls */}
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.1}
        minPolarAngle={Math.PI * 0.1}
        maxPolarAngle={Math.PI * 0.45}
        minDistance={0.25}
        maxDistance={0.7}
        mouseButtons={{
          LEFT: undefined as unknown as THREE.MOUSE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
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
  return (
    <div className="w-full h-full min-h-[200px]" style={{ touchAction: 'none' }}>
      <Canvas
        camera={{
          position: [0.15, 0.35, 0.35],
          fov: 45,
          near: 0.01,
          far: 10,
        }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.2;
        }}
      >
        <TurntableScene deckId={deckId} />
      </Canvas>
    </div>
  );
}

// Preload the model
useGLTF.preload(MODEL_PATH);

export default DeckVinyl3DView;
