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
import { CameraControlOverlay } from './DJ3DCameraControls';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

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
const POWER_BUTTON_MATERIALS = new Set(['bouton_marche_arret']);
const PITCH_SLIDER_MATERIALS = new Set(['bouton_vit', 'dessus_bouton_vit']);
const RPM_BUTTON_MATERIALS = new Set(['bouton_vitesse']);

// RPM speed constants: 33⅓ = 0.5556 rps, 45 = 0.75 rps
const RPM_33 = 33;
const RPM_45 = 45;
const RPS_33 = 33.333 / 60; // 0.5556 revolutions per second
const RPS_45 = 45 / 60;     // 0.75 revolutions per second

// Tonearm rotation range (radians around Z axis, from rest to inner groove)
// Negative Z rotation = clockwise from above = tonearm sweeps inward toward center
const TONEARM_ANGLE_REST = 0.05;    // Slightly off-record (outward)
const TONEARM_ANGLE_START = 0.0;    // Outer groove (start of track)
const TONEARM_ANGLE_END = -0.45;    // Inner groove (end of track)

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
  const rpmRef = useRef(RPM_33);  // Active RPM: 33 or 45

  // Store subscriptions
  const isPlaying = useDJStore((s) => s.decks[deckId].isPlaying);
  const songPos = useDJStore((s) => s.decks[deckId].songPos);
  const totalPositions = useDJStore((s) => s.decks[deckId].totalPositions);
  const audioPosition = useDJStore((s) => s.decks[deckId].audioPosition);
  const durationMs = useDJStore((s) => s.decks[deckId].durationMs);
  const playbackMode = useDJStore((s) => s.decks[deckId].playbackMode);
  const pitchOffset = useDJStore((s) => s.decks[deckId].pitchOffset);
  const trackName = useDJStore((s) => s.decks[deckId].trackName);

  // Keep latest values in refs for useFrame
  const playStateRef = useRef({ isPlaying, songPos, totalPositions, audioPosition, durationMs, playbackMode, pitchOffset });
  playStateRef.current = { isPlaying, songPos, totalPositions, audioPosition, durationMs, playbackMode, pitchOffset };

  const accentColor = DECK_ACCENT[deckId] ?? '#60a5fa';

  // ── Clone scene and classify meshes (NO reparenting) ──────────────────────

  const { clonedScene, platterMeshes, tonearmMeshes, platterCenter, tonearmPivot, powerLedMesh, powerButtonMesh, rpmButtonMesh, pitchSliderMesh } = useMemo(() => {
    const cloned = gltfScene.clone(true);
    cloned.updateMatrixWorld(true);

    const getMaterialName = (mesh: THREE.Mesh): string => {
      const mat = mesh.material as THREE.Material;
      return mat && mat.name ? mat.name.toLowerCase() : '';
    };

    // Classify meshes by material name
    const platters: THREE.Mesh[] = [];
    const tonearms: THREE.Mesh[] = [];
    let led: THREE.Mesh | null = null;
    let powerBtn: THREE.Mesh | null = null;
    let slider: THREE.Mesh | null = null;
    let rpmBtn: THREE.Mesh | null = null;
    let counterweight: THREE.Mesh | null = null as THREE.Mesh | null;  // 'poids' — near the actual pivot bearing

    cloned.traverse((child) => {
      if (!('isMesh' in child && child.isMesh)) return;
      const mesh = child as THREE.Mesh;
      const matName = getMaterialName(mesh);

      if (PLATTER_MATERIALS.has(matName)) {
        platters.push(mesh);
      } else if (TONEARM_MATERIALS.has(matName)) {
        tonearms.push(mesh);
        if (matName === 'poids') counterweight = mesh;
      } else if (POWER_LED_MATERIALS.has(matName)) {
        led = mesh;
      } else if (POWER_BUTTON_MATERIALS.has(matName)) {
        powerBtn = mesh;
      } else if (PITCH_SLIDER_MATERIALS.has(matName)) {
        slider = mesh;
      } else if (RPM_BUTTON_MATERIALS.has(matName)) {
        rpmBtn = mesh;
      }
    });

    // Compute platter center from GEOMETRY bounding boxes (local/model space, Z-up).
    // IMPORTANT: Must NOT use expandByObject() which returns world-space coords (Y-up)
    // because the rotation matrix is applied as a local transform before the root node's
    // Z→Y conversion. Using world coords would shift the pivot point incorrectly.
    const pCenter = new THREE.Vector3();
    if (platters.length > 0) {
      const box = new THREE.Box3();
      for (const m of platters) {
        m.geometry.computeBoundingBox();
        if (m.geometry.boundingBox) box.union(m.geometry.boundingBox);
      }
      box.getCenter(pCenter);
    }

    // Compute tonearm pivot from geometry bounding boxes (local/model space, Z-up).
    // The pivot bearing is between the counterweight ('poids') and the arm ('bras').
    // Use the counterweight's center X as the pivot X (it sits right behind the bearing),
    // and overall tonearm center Y and max Z for the vertical axis of rotation.
    const tPivot = new THREE.Vector3();
    if (tonearms.length > 0) {
      const armBox = new THREE.Box3();
      for (const m of tonearms) {
        m.geometry.computeBoundingBox();
        if (m.geometry.boundingBox) armBox.union(m.geometry.boundingBox);
      }

      if (counterweight) {
        // Pivot is at the counterweight's inner edge (the side closest to the arm)
        counterweight.geometry.computeBoundingBox();
        const cwBox = counterweight.geometry.boundingBox!;
        // The bearing is between the counterweight center and the arm —
        // use the counterweight's edge closest to the platter center as pivot X
        const cwCenterX = (cwBox.min.x + cwBox.max.x) / 2;
        const armCenterX = (armBox.min.x + armBox.max.x) / 2;
        // Pick the counterweight edge facing the arm
        const pivotX = cwCenterX < armCenterX ? cwBox.max.x : cwBox.min.x;
        tPivot.set(pivotX, (armBox.min.y + armBox.max.y) / 2, armBox.max.z);
      } else {
        // Fallback: use bounding box extremes (less accurate)
        tPivot.set(armBox.max.x, (armBox.min.y + armBox.max.y) / 2, armBox.max.z);
      }
    }

    // Disable auto-update on platter/tonearm meshes — we'll set .matrix directly
    for (const m of platters) m.matrixAutoUpdate = false;
    for (const m of tonearms) m.matrixAutoUpdate = false;

    // Log positions for debugging interactive mesh placement
    const logMeshPos = (label: string, mesh: THREE.Mesh | null) => {
      if (!mesh) return;
      const b = new THREE.Box3();
      mesh.geometry.computeBoundingBox();
      if (mesh.geometry.boundingBox) b.copy(mesh.geometry.boundingBox);
      const c = new THREE.Vector3();
      b.getCenter(c);
      console.log(`[3DTurntable] ${label}: center=(${c.x.toFixed(4)}, ${c.y.toFixed(4)}, ${c.z.toFixed(4)}), size=(${(b.max.x-b.min.x).toFixed(4)}, ${(b.max.y-b.min.y).toFixed(4)}, ${(b.max.z-b.min.z).toFixed(4)})`);
    };
    console.log(`[3DTurntable] Platter: ${platters.length} meshes, center=(${pCenter.x.toFixed(3)}, ${pCenter.y.toFixed(3)}, ${pCenter.z.toFixed(3)})`);
    console.log(`[3DTurntable] Tonearm: ${tonearms.length} meshes, pivot=(${tPivot.x.toFixed(3)}, ${tPivot.y.toFixed(3)}, ${tPivot.z.toFixed(3)})${counterweight ? ' (from counterweight)' : ' (fallback)'}`);
    logMeshPos('Counterweight', counterweight);
    logMeshPos('PowerBtn', powerBtn);
    logMeshPos('PitchSlider', slider);
    logMeshPos('RPMButton', rpmBtn);

    return {
      clonedScene: cloned,
      platterMeshes: platters,
      tonearmMeshes: tonearms,
      platterCenter: pCenter,
      tonearmPivot: tPivot,
      powerLedMesh: led as THREE.Mesh | null,
      powerButtonMesh: powerBtn as THREE.Mesh | null,
      pitchSliderMesh: slider as THREE.Mesh | null,
      rpmButtonMesh: rpmBtn as THREE.Mesh | null,
    };
  }, [gltfScene]);

  // Update LED on play state change
  useEffect(() => {
    if (!powerLedMesh) return;
    const mat = powerLedMesh.material;
    if (mat && 'emissive' in mat) {
      const stdMat = mat as THREE.MeshStandardMaterial;
      if (isPlaying) {
        stdMat.emissive = new THREE.Color('#ff2020');
        stdMat.emissiveIntensity = 2;
      } else {
        stdMat.emissive = new THREE.Color('#200000');
        stdMat.emissiveIntensity = 0.3;
      }
      stdMat.needsUpdate = true;
    }
  }, [isPlaying, powerLedMesh]);

  // Update RPM button visual feedback (highlight active speed)
  useEffect(() => {
    if (!rpmButtonMesh) return;
    // We'll update RPM visuals in useFrame since rpmRef changes don't trigger re-render
  }, [rpmButtonMesh]);

  // ── Animation: platter rotation + tonearm position ───────────────────────

  useFrame((_state, delta) => {
    const { isPlaying: playing, songPos: sPos, totalPositions: total,
      audioPosition: aPos, durationMs: dur, playbackMode: mode } = playStateRef.current;
    const physics = physicsRef.current;

    // ── Platter rotation ──
    // Real turntable: constant RPM regardless of music tempo.
    // Pitch offset scales platter speed (like a real pitch fader).
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
        deck.pause();
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
    // Map vertical drag: 200px = ±8 semitones range
    const pitchDelta = (dy / 200) * 8;
    const newPitch = Math.max(-8, Math.min(8, pitchDragStartValueRef.current + pitchDelta));
    useDJStore.getState().setDeckPitch(deckId, newPitch);
  }, [deckId]);

  const handlePitchPointerUp = useCallback(() => {
    pitchDragRef.current = false;
  }, []);

  // Double-click pitch slider to reset to 0
  const handlePitchDoubleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    useDJStore.getState().setDeckPitch(deckId, 0);
  }, [deckId]);

  // ── 33/45 RPM button interaction ──────────────────────────────────────────

  const handleRpmClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    // Toggle between 33 and 45
    const newRpm = rpmRef.current === RPM_33 ? RPM_45 : RPM_33;
    rpmRef.current = newRpm;
    console.log(`[3DTurntable] RPM set to ${newRpm}`);
    // Visual feedback — update the RPM button material color
    if (rpmButtonMesh) {
      const mat = rpmButtonMesh.material;
      if (mat && 'emissive' in mat) {
        const stdMat = mat as THREE.MeshStandardMaterial;
        stdMat.emissive = new THREE.Color(newRpm === RPM_45 ? '#ffaa00' : '#444444');
        stdMat.emissiveIntensity = newRpm === RPM_45 ? 0.8 : 0.2;
        stdMat.needsUpdate = true;
      }
    }
  }, [rpmButtonMesh]);

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

      {/* Invisible interaction meshes — must NOT use visible={false} (breaks raycasting) */}
      {/* Platter — large cylinder for scratch interaction */}
      <mesh
        position={[0, 0.045, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={handlePlatterPointerDown}
        onPointerMove={handlePlatterPointerMove}
        onPointerUp={handlePlatterPointerUp}
        onPointerCancel={handlePlatterPointerUp}
        onWheel={handleWheel}
      >
        <circleGeometry args={[0.15, 32]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Power button — use hitbox only (model-cloned meshes with visible=false can't raycast) */}
      <mesh
        position={[0.14, 0.035, 0.12]}
        onClick={handlePowerClick}
      >
        <boxGeometry args={[0.03, 0.025, 0.03]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Pitch slider — draggable, double-click to reset */}
      <mesh
        position={[-0.16, 0.035, 0.0]}
        onPointerDown={handlePitchPointerDown}
        onPointerMove={handlePitchPointerMove}
        onPointerUp={handlePitchPointerUp}
        onPointerCancel={handlePitchPointerUp}
        onDoubleClick={handlePitchDoubleClick}
      >
        <boxGeometry args={[0.025, 0.025, 0.12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* 33/45 RPM speed selector — clickable to toggle */}
      <mesh
        position={[0.14, 0.035, 0.06]}
        onClick={handleRpmClick}
      >
        <boxGeometry args={[0.04, 0.02, 0.025]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Camera controls — scroll-wheel zoom disabled to avoid scratch conflict */}
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
        <TurntableScene deckId={deckId} orbitRef={orbitRef} />
      </Canvas>
      <CameraControlOverlay orbitRef={orbitRef} />
    </div>
  );
}

// Preload the model
useGLTF.preload(MODEL_PATH);

export default DeckVinyl3DView;
