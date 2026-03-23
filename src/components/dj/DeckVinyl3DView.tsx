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

import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
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

export interface TurntableSceneProps {
  deckId: 'A' | 'B' | 'C';
  orbitRef: React.RefObject<OrbitControlsImpl | null>;
  /** When true, skip per-scene lights and OrbitControls (used in unified scene) */
  embedded?: boolean;
}

export function TurntableScene({ deckId, orbitRef, embedded }: TurntableSceneProps) {
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
  const ledYRef = useRef(0); // animated Y offset for LED sink/pop
  const tonearmHitboxRef = useRef<THREE.Mesh>(null);
  const labelMeshRef = useRef<THREE.Mesh>(null);
  const labelTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const [rpm, setRpm] = useState(RPM_33);
  const [stylusLight, setStylusLight] = useState(true);
  const [powerOn, setPowerOn] = useState(false);
  const powerOnRef = useRef(false);
  powerOnRef.current = powerOn;

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

  const { clonedScene, platterMeshes, tonearmMeshes, platterCenter, tonearmPivot, pitchsliderMesh, ledMesh } = useMemo(() => {
    const cloned = gltfScene.clone(true);
    cloned.updateMatrixWorld(true);

    const platters: THREE.Mesh[] = [];
    const tonearms: THREE.Mesh[] = [];
    let swivleMesh: THREE.Mesh | null = null;
    let pitchsliderMesh: THREE.Mesh | null = null;
    let ledMesh: THREE.Mesh | null = null;

    cloned.traverse((child) => {
      if (!('isMesh' in child && child.isMesh)) return;
      const mesh = child as THREE.Mesh;
      const name = mesh.name;

      // Blender GLTF export uses node names directly (with .001 suffix for child meshes)
      if (name === 'Platter_2001' || name === 'Vinyl001') {
        platters.push(mesh);
      } else if (name === 'Cartridge_1' || name === 'Cartridge_2' || name === 'Swivle001') {
        tonearms.push(mesh);
        if (name === 'Swivle001') swivleMesh = mesh;
      } else if (name === 'Pitchslider') {
        pitchsliderMesh = mesh;
        mesh.matrixAutoUpdate = false;
      } else if (name === 'Led') {
        ledMesh = mesh;
      } else if (name === 'Glass_Cover_2001' || name === 'Hinges001' || name === 'Glass_Caps001') {
        mesh.visible = false;
      }
    });

    // Platter pivot: center of the Vinyl disc (thinnest, most accurate circle)
    const pCenter = new THREE.Vector3();
    const vinylMesh = platters.find((m) => m.name === 'Vinyl001');
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

    // Debug removed — mesh names confirmed working

    // Disable auto-update on animated meshes — we set .matrix directly each frame
    for (const m of platters) m.matrixAutoUpdate = false;
    for (const m of tonearms) m.matrixAutoUpdate = false;

    return { clonedScene: cloned, platterMeshes: platters, tonearmMeshes: tonearms, platterCenter: pCenter, tonearmPivot: tPivot, pitchsliderMesh: pitchsliderMesh as THREE.Mesh | null, ledMesh: ledMesh as THREE.Mesh | null };
  }, [gltfScene]);

  // ── Dynamic vinyl label texture ──────────────────────────────────────────
  // Renders artist/song name as circular text on the record label.
  useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    labelTextureRef.current = tex;
    return tex;
  }, []);

  // Redraw label when track changes
  useMemo(() => {
    const tex = labelTextureRef.current;
    if (!tex) return;
    const canvas = tex.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const S = canvas.width;
    const cx = S / 2, cy = S / 2;

    // Clear with label background color
    ctx.clearRect(0, 0, S, S);

    // Draw label disc background
    ctx.beginPath();
    ctx.arc(cx, cy, S / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();

    // Inner ring
    ctx.beginPath();
    ctx.arc(cx, cy, S * 0.38, 0, Math.PI * 2);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Spindle hole
    ctx.beginPath();
    ctx.arc(cx, cy, S * 0.03, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();

    // Deck ID in center
    ctx.fillStyle = accentColor;
    ctx.font = `bold ${S * 0.12}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`DECK ${deckId}`, cx, cy - S * 0.10);

    if (trackName) {
      // Draw song name as circular text (outer ring)
      const text = trackName.toUpperCase();
      const radius = S * 0.42;
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${S * 0.07}px monospace`;
      const charAngle = 0.07; // radians per character
      const totalAngle = Math.min(Math.PI * 1.8, text.length * charAngle);
      const startAngle = -Math.PI / 2 - totalAngle / 2;
      for (let i = 0; i < text.length; i++) {
        const angle = startAngle + (i / text.length) * totalAngle;
        ctx.save();
        ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        ctx.rotate(angle + Math.PI / 2);
        ctx.fillText(text[i], 0, 0);
        ctx.restore();
      }

      // Draw repeated in inner ring (bottom arc)
      const innerRadius = S * 0.28;
      ctx.fillStyle = '#888';
      ctx.font = `${S * 0.055}px monospace`;
      const innerStart = Math.PI / 2 - totalAngle / 2;
      for (let i = 0; i < text.length; i++) {
        const angle = innerStart + (i / text.length) * totalAngle;
        ctx.save();
        ctx.translate(cx + Math.cos(angle) * innerRadius, cy + Math.sin(angle) * innerRadius);
        ctx.rotate(angle + Math.PI / 2);
        ctx.fillText(text[i], 0, 0);
        ctx.restore();
      }

      // DEViLBOX branding in center
      ctx.fillStyle = '#666';
      ctx.font = `bold ${S * 0.06}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('DEViLBOX', cx, cy + S * 0.03);
      ctx.fillStyle = '#444';
      ctx.font = `${S * 0.04}px monospace`;
      ctx.fillText('RECORDS', cx, cy + S * 0.08);
    } else {
      // No track — show DEViLBOX logo
      ctx.fillStyle = accentColor;
      ctx.font = `bold ${S * 0.09}px monospace`;
      ctx.fillText('DEViLBOX', cx, cy + S * 0.03);
      ctx.fillStyle = '#555';
      ctx.font = `${S * 0.045}px monospace`;
      ctx.fillText('NO TRACK LOADED', cx, cy + S * 0.10);
    }

    tex.needsUpdate = true;
  }, [trackName, deckId, accentColor]);

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

      const physicsActive = isScratchActiveRef.current || physics.spinbackActive || physics.powerCutActive || physics.eBrakeActive;
      if (playing || physicsActive) {
        let rate = 1;
        if (physicsActive) {
          rate = physics.tick(delta);
        }

        platterAngleRef.current -= rps * rate * 2 * Math.PI * delta;

        // Feed physics rate to audio only during scratch (hand on vinyl).
        // Power-cut / eBrake are visual-only — audio stops immediately via button handler.
        if (isScratchActiveRef.current && Math.abs(rate - prevRateRef.current) > 0.01) {
          try { getDJEngine().getDeck(deckId).setScratchVelocity(rate); } catch { /* not ready */ }
          prevRateRef.current = rate;
        }

        if (isScratchActiveRef.current && !physics.touching && !physics.spinbackActive && !physics.powerCutActive && !physics.eBrakeActive) {
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
      // Label disc follows platter rotation
      if (labelMeshRef.current) {
        // Label is a flat disc in XZ plane (rotated -90° X), so Y-rotation = platter spin
        const lp = labelMeshRef.current.position;
        // Build: translate to label pos → rotate Y by platter angle → rotate X -90° for flat disc
        _compositeMat.makeTranslation(lp.x, lp.y, lp.z);
        _rotMat.makeRotationY(platterAngleRef.current);
        _compositeMat.multiply(_rotMat);
        _rotMat.makeRotationX(-Math.PI / 2);
        _compositeMat.multiply(_rotMat);
        labelMeshRef.current.matrix.copy(_compositeMat);
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

      // Tonearm on record only when playing, otherwise parked at rest
      const targetAngle = (playing && trackName)
        ? TONEARM_ANGLE_START + progress * (TONEARM_ANGLE_END - TONEARM_ANGLE_START)
        : TONEARM_ANGLE_REST;

      // Tighter tracking — delta*12 reaches target in ~5 frames at 60fps
      // (was delta*5 which felt floaty/laggy behind the playback position)
      tonearmAngleRef.current += (targetAngle - tonearmAngleRef.current) * Math.min(1, delta * 12);

      makeRotationAroundPivot(tonearmAngleRef.current, tonearmPivot, _compositeMat);
      for (const mesh of tonearmMeshes) {
        mesh.matrix.copy(_compositeMat);
      }
      // Tonearm drag hitbox follows the arm rotation
      if (tonearmHitboxRef.current) {
        // Position hitbox at the midpoint of the tonearm arm (between pivot and cartridge)
        // Pivot is at tonearmPivot, arm extends roughly 0.12m toward the record
        const midX = (tonearmPivot.x + (-0.049)) / 2; // midpoint between pivot and platter center
        const midZ = (tonearmPivot.z + (-0.010)) / 2;
        // Apply same rotation as tonearm, offset to arm center
        const cos = Math.cos(tonearmAngleRef.current);
        const sin = Math.sin(tonearmAngleRef.current);
        const dx = midX - tonearmPivot.x;
        const dz = midZ - tonearmPivot.z;
        const rx = tonearmPivot.x + dx * cos - dz * sin;
        const rz = tonearmPivot.z + dx * sin + dz * cos;
        tonearmHitboxRef.current.position.set(rx, tonearmPivot.y, rz);
        tonearmHitboxRef.current.rotation.set(0, tonearmAngleRef.current, 0);
        tonearmHitboxRef.current.updateMatrix();
      }
    }

    // ── Pitch slider follows pitch value ──
    if (pitchsliderMesh) {
      // SL-1200: pitch 0 = center of track, +pitch = slider moves toward back (-Z)
      // Full range: -8..+8 semitones maps to +4cm..-4cm Z offset in model space
      const pitchNorm = (playStateRef.current.pitchOffset ?? 0) / 8; // -1..+1
      const slideRange = 4.0; // cm of half-travel in model space
      const zOffset = -pitchNorm * slideRange; // inverted: positive pitch = back
      _compositeMat.makeTranslation(0, 0, zOffset);
      pitchsliderMesh.matrix.copy(_compositeMat);
    }

    // ── LED light: cylinder position is mechanical (stylusLight), glow needs power ──
    if (ledMesh) {
      // Cylinder position: only follows stylusLight (push in = retracted, pop out = extended)
      const targetY = stylusLight ? 0 : -3.0; // cm in model space
      ledYRef.current += (targetY - ledYRef.current) * Math.min(1, delta * 6);
      ledMesh.matrixAutoUpdate = false;
      _compositeMat.makeTranslation(0, ledYRef.current, 0);
      ledMesh.matrix.copy(_compositeMat);

      // Lamp glow: needs both power AND cylinder extended
      const mat = ledMesh.material as THREE.MeshStandardMaterial;
      if (mat && 'emissive' in mat) {
        const extended = ledYRef.current > -0.5;
        if (powerOn && stylusLight && extended) {
          mat.emissive.set(0xffdd44);
          mat.emissiveIntensity = 2.0;
        } else {
          mat.emissive.set(0x000000);
          mat.emissiveIntensity = 0;
        }
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
    if (!powerOnRef.current || !playStateRef.current.isPlaying) return;
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

  // ── Start/Stop button — quick motor-driven brake/start (~0.5s) ──────────

  const handleStartStopClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!powerOnRef.current) return; // Start/stop requires power
    try {
      const deck = getDJEngine().getDeck(deckId);
      const store = useDJStore.getState();
      const playing = store.decks[deckId].isPlaying;
      if (playing) {
        // Stop audio immediately, visual platter brakes via physics
        deck.pause();
        store.setDeckPlaying(deckId, false);
        physicsRef.current.triggerElectronicBrake();
      } else {
        // Start audio immediately, visual platter spins up via physics
        physicsRef.current.triggerMotorStart();
        void deck.play();
        store.setDeckPlaying(deckId, true);
      }
    } catch (err) { console.error('[TT] Start/Stop error:', err); }
  }, [deckId, powerOn]);

  // ── Power button — slow friction-only coast-down / motor spin-up ───────

  const handlePowerToggle = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (powerOn) {
      // Power off — everything shuts down
      setPowerOn(false);
      try {
        const deck = getDJEngine().getDeck(deckId);
        const store = useDJStore.getState();
        if (store.decks[deckId].isPlaying) {
          // Stop audio immediately, visual platter coasts via physics
          deck.pause();
          store.setDeckPlaying(deckId, false);
          physicsRef.current.triggerPowerCut();
        }
      } catch { /* not ready */ }
    } else {
      // Power on — just enables the deck, doesn't start spinning
      setPowerOn(true);
    }
  }, [deckId, powerOn]);

  // ── Pitch slider ─────────────────────────────────────────────────────────

  const handlePitchPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!powerOnRef.current) return;
    pitchDragRef.current = true;
    pitchDragStartYRef.current = e.nativeEvent.clientY;
    pitchDragStartValueRef.current = playStateRef.current.pitchOffset;
    // Capture pointer on the canvas so moves continue outside the mesh
    const canvas = (e.nativeEvent.target as HTMLElement)?.closest?.('canvas');
    if (canvas) canvas.setPointerCapture(e.nativeEvent.pointerId);
  }, []);

  // Use window-level move/up so dragging works even when pointer leaves the small hitbox
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!pitchDragRef.current) return;
      const dy = e.clientY - pitchDragStartYRef.current;
      const pitchDelta = (dy / 120) * 8; // 120px = full ±8 semitone range
      const newPitch = Math.max(-8, Math.min(8, pitchDragStartValueRef.current + pitchDelta));
      useDJStore.getState().setDeckPitch(deckId, newPitch);
    };
    const onUp = () => { pitchDragRef.current = false; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [deckId]);

  // Keep the Three.js handlers minimal — just stop propagation
  const handlePitchPointerMove = useCallback(() => {}, []);
  const handlePitchPointerUp = useCallback(() => { pitchDragRef.current = false; }, []);

  const handlePitchDoubleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    useDJStore.getState().setDeckPitch(deckId, 0);
  }, [deckId]);

  // ── 33/45 RPM toggle ─────────────────────────────────────────────────────

  const handleRpmClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const next = rpmRef.current === RPM_33 ? RPM_45 : RPM_33;
    rpmRef.current = next;
    setRpm(next);
  }, []);

  // ── Wheel nudge ──────────────────────────────────────────────────────────

  const handleWheel = useCallback((e: ThreeEvent<WheelEvent>) => {
    if (!powerOnRef.current || !playStateRef.current.isPlaying) return;
    e.stopPropagation();
    if (!isScratchActiveRef.current) enterScratch();
    const impulse = TurntablePhysics.deltaToImpulse(e.nativeEvent.deltaY, e.nativeEvent.deltaMode);
    physicsRef.current.applyImpulse(impulse);
  }, [enterScratch]);

  // ── Tonearm/pickup seek ──────────────────────────────────────────────────
  // Drag the pickup left/right to seek through the song.
  // Maps horizontal pixel movement to song position via tonearm angle.

  const pickupDragRef = useRef(false);
  const pickupDragStartXRef = useRef(0);
  const pickupDragStartProgressRef = useRef(0);

  const handlePickupDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    // Tonearm is mechanical — can always be moved physically, even with power off
    pickupDragRef.current = true;
    pickupDragStartXRef.current = e.nativeEvent.clientY;
    const { audioPosition: aPos, durationMs: dur, songPos: sPos, totalPositions: total, playbackMode: mode } = playStateRef.current;
    pickupDragStartProgressRef.current = mode === 'audio' && dur > 0
      ? (aPos / (dur / 1000))
      : total > 0 ? sPos / total : 0;
    (e.nativeEvent.target as HTMLElement)?.setPointerCapture?.(e.nativeEvent.pointerId);
  }, []);

  const handlePickupMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!pickupDragRef.current) return;
    const dy = e.nativeEvent.clientY - pickupDragStartXRef.current;
    // Map vertical drag to progress: drag down = forward in song, 200px = full song
    const progressDelta = dy / 200;
    const newProgress = Math.max(0, Math.min(1, pickupDragStartProgressRef.current + progressDelta));

    // Move tonearm immediately (visual feedback before audio seeks)
    tonearmAngleRef.current = TONEARM_ANGLE_START + newProgress * (TONEARM_ANGLE_END - TONEARM_ANGLE_START);

    try {
      const deck = getDJEngine().getDeck(deckId);
      const { playbackMode: mode, durationMs: dur, totalPositions: total } = playStateRef.current;
      if (mode === 'audio' && dur > 0) {
        deck.audioPlayer.seek(newProgress * dur / 1000);
      } else if (total > 0) {
        const targetPos = Math.round(newProgress * total);
        deck.replayer?.seekTo(targetPos, 0);
      }
    } catch { /* not ready */ }
  }, [deckId]);

  const handlePickupUp = useCallback(() => {
    pickupDragRef.current = false;
  }, []);

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
      {/* Per-scene lighting (skipped in unified/embedded mode) */}
      {!embedded && <ambientLight intensity={0.5} />}
      {!embedded && <directionalLight position={[2, 5, 3]} intensity={0.9} castShadow={false} />}
      {!embedded && <directionalLight position={[-2, 3, -1]} intensity={0.3} />}
      <pointLight position={[0, 0.05, 0]} color={accentColor} intensity={0.4} distance={0.6} />

      {/* Turntable model — scaled from cm to metres */}
      <primitive object={clonedScene} scale={MODEL_SCALE} />

      {/* Dynamic vinyl label — rotates with platter */}
      {labelTextureRef.current && (
        <mesh
          ref={labelMeshRef}
          position={[-0.049, 0.1068, -0.010]}
          rotation={[-Math.PI / 2, 0, 0]}
          matrixAutoUpdate={false}
        >
          <circleGeometry args={[0.048, 48]} />
          <meshStandardMaterial
            map={labelTextureRef.current}
            transparent
            roughness={0.7}
            metalness={0.05}
          />
        </mesh>
      )}

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

      {/* ── Start/Stop button — quick electronic brake ── */}
      <mesh position={[-0.2030, 0.0930, 0.1480]} onClick={handleStartStopClick}>
        <boxGeometry args={[0.0460, 0.0030, 0.0380]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* ── Power button — slow power-cut spin-down ── */}
      <mesh position={[-0.2120, 0.0970, 0.0980]} onClick={handlePowerToggle}>
        <boxGeometry args={[0.0280, 0.0230, 0.0260]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* Power LED — tinted window on the inward side of power switch, facing the platter */}
      <mesh position={[-0.1980, 0.0970, 0.0980]} rotation={[0, 0, 0]}>
        <planeGeometry args={[0.003, 0.012]} />
        <meshStandardMaterial
          color={powerOn ? '#00ff44' : '#111111'}
          emissive={powerOn ? '#00ff44' : '#000000'}
          emissiveIntensity={powerOn ? 4.0 : 0}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Power LED light cast toward the platter */}
      {powerOn && (
        <pointLight
          position={[-0.1960, 0.0970, 0.0980]}
          color="#00ff44"
          intensity={0.3}
          distance={0.12}
          decay={2}
        />
      )}

      {/* ── 33 RPM button + LED ── */}
      <mesh position={[-0.1640, 0.0920, 0.1610]} onClick={handleRpmClick}>
        <boxGeometry args={[0.0270, 0.0030, 0.0100]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh position={[-0.1570, 0.0935, 0.1570]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.007, 0.002]} />
        <meshStandardMaterial
          color={powerOn && rpm === RPM_33 ? accentColor : '#111111'}
          emissive={powerOn && rpm === RPM_33 ? accentColor : '#000000'}
          emissiveIntensity={powerOn && rpm === RPM_33 ? 3.0 : 0}
          depthWrite={false}
        />
      </mesh>

      {/* ── 45 RPM button + LED ── */}
      <mesh position={[-0.1370, 0.0920, 0.1610]} onClick={handleRpmClick}>
        <boxGeometry args={[0.0270, 0.0030, 0.0100]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh position={[-0.1300, 0.0935, 0.1570]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.007, 0.002]} />
        <meshStandardMaterial
          color={powerOn && rpm === RPM_45 ? accentColor : '#111111'}
          emissive={powerOn && rpm === RPM_45 ? accentColor : '#000000'}
          emissiveIntensity={powerOn && rpm === RPM_45 ? 3.0 : 0}
          depthWrite={false}
        />
      </mesh>

      {/* ── Pitch fader — generous hitbox so it's easy to grab ── */}
      <mesh
        position={[0.2070, 0.0930, 0.0200]}
        onPointerDown={handlePitchPointerDown}
        onPointerMove={handlePitchPointerMove}
        onPointerUp={handlePitchPointerUp}
        onPointerCancel={handlePitchPointerUp}
        onDoubleClick={handlePitchDoubleClick}
      >
        <boxGeometry args={[0.04, 0.04, 0.12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* Pitch center indicator LED — green dot when pitch is at 0% */}
      {(() => {
        const atCenter = powerOn && Math.abs(pitchOffset) < 0.15;
        return (
          <mesh position={[0.1950, 0.0935, 0.0660]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.002, 10]} />
            <meshStandardMaterial
              color={atCenter ? '#00ff44' : '#111111'}
              emissive={atCenter ? '#00ff44' : '#000000'}
              emissiveIntensity={atCenter ? 3.0 : 0}
              depthWrite={false}
            />
          </mesh>
        );
      })()}

      {/* ── Stylus light — click cylinder to push down (off), click button to pop up (on) ── */}
      {/* LED cylinder hitbox — click to retract */}
      <mesh position={[0.0400, 0.1070, 0.1530]} onClick={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); if (powerOnRef.current) setStylusLight(false); }}>
        <boxGeometry args={[0.0120, 0.0350, 0.0110]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* Cone spotlight aimed at platter center when extended */}
      {powerOn && stylusLight && (
        <group>
          <spotLight
            position={[0.0400, 0.1300, 0.1530]}
            color="#ffee88"
            intensity={1.5}
            angle={0.6}
            penumbra={0.5}
            distance={0.2}
            decay={2}
          />
          {/* Invisible target at platter center — spotLight looks at this */}
          <mesh position={[-0.049, 0.107, -0.010]} ref={(m) => {
            if (m) {
              const parent = m.parent;
              const spot = parent?.children.find(c => (c as any).isSpotLight) as THREE.SpotLight | undefined;
              if (spot) spot.target = m;
            }
          }}>
            <boxGeometry args={[0.001, 0.001, 0.001]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        </group>
      )}
      {/* Button next to cylinder — click to pop up (on) */}
      <mesh position={[0.0520, 0.0910, 0.1570]} onClick={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); if (powerOn) setStylusLight(true); }}>
        <boxGeometry args={[0.0090, 0.0010, 0.0090]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* ── Tonearm drag-to-seek — covers full arm, rotates with tonearm ── */}
      {/* Position set initially, updated each frame to follow tonearm rotation */}
      <mesh
        ref={tonearmHitboxRef}
        position={[0.05, 0.125, 0.0]}
        renderOrder={10}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); handlePickupDown(e); }}
        onPointerMove={handlePickupMove}
        onPointerUp={handlePickupUp}
        onPointerCancel={handlePickupUp}
      >
        <boxGeometry args={[0.015, 0.020, 0.18]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Per-scene orbit controls (skipped in unified/embedded mode) */}
      {!embedded && (
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
      )}
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
