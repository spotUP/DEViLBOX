/**
 * MixerVestax3DView — 3D WebGL Vestax PMC-05 Pro III mixer for DJ mode.
 *
 * Loads the Vestax PMC-05 .glb model and renders it with Three.js via React Three Fiber.
 * Supports: interactive rotary knobs (EQ, trim, master, headphone, cue/mix),
 * channel faders, crossfader, CUE/PFL buttons, and animated VU meters.
 *
 * The GLB model has a FLAT hierarchy with mesh names like "Mixer knob", "Mixer fader1" etc.
 * Controls are classified by mesh name and mapped to DJ engine actions by spatial position.
 *
 * Lazy-loaded in DJView to avoid bloating the initial bundle.
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useDJStore, type DeckId } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL_PATH = '/models/vestax-mixer.glb';

// Model coordinate system: Y-up, X=left-right, Z=front-back (negative Z = back/rear)
// Scale factor: model is in cm-ish units, we normalize to ~0.3 meters tall
const MODEL_SCALE = 0.02;

// Knob rotation range (radians) — most DJ knobs rotate ~270°
const KNOB_MIN_ANGLE = -Math.PI * 0.75; // -135°
const KNOB_MAX_ANGLE = Math.PI * 0.75;  // +135°
const KNOB_RANGE = KNOB_MAX_ANGLE - KNOB_MIN_ANGLE;

// Fader travel (model units along Z-axis for vertical faders)
const VFADER_TRAVEL = 4.0; // approximate travel distance

// Crossfader travel (model units along X-axis)
const HFADER_TRAVEL = 3.0;

// Pre-allocated matrices for per-frame rotation
const _knobRotMat = new THREE.Matrix4();
const _knobTransMat = new THREE.Matrix4();
const _knobInvTransMat = new THREE.Matrix4();
const _knobCompositeMat = new THREE.Matrix4();

/** Compute rotation matrix around a Y-axis pivot point (model is Y-up) */
function makeRotationAroundPivotY(angle: number, pivot: THREE.Vector3, out: THREE.Matrix4): void {
  _knobTransMat.makeTranslation(pivot.x, pivot.y, pivot.z);
  _knobRotMat.makeRotationY(angle);
  _knobInvTransMat.makeTranslation(-pivot.x, -pivot.y, -pivot.z);
  out.copy(_knobTransMat).multiply(_knobRotMat).multiply(_knobInvTransMat);
}

// ── Control Definitions ──────────────────────────────────────────────────────

/** What a knob controls */
interface KnobControl {
  meshName: string;
  label: string;
  action: (value: number) => void;
  readValue: () => number;
  min: number;
  max: number;
  defaultValue: number;
  centerDetent?: boolean; // EQ knobs have center detent at 0dB
}

/** What a fader controls */
interface FaderControl {
  meshName: string;
  label: string;
  axis: 'x' | 'z'; // which axis the fader travels on
  action: (value: number) => void;
  readValue: () => number;
  min: number;
  max: number;
}

/** What a button controls */
interface ButtonControl {
  meshName: string;
  label: string;
  action: () => void;
  readActive: () => boolean;
}

// ── Mesh Name Helpers ────────────────────────────────────────────────────────

/** Simplify verbose mesh names: "Mixer Klamz_uv_Death_DJ_02:mixer_EXP:fader1" → "fader1" */
function simplifyName(name: string): string {
  // Strip "Mixer " prefix and namespace prefix
  let s = name.replace(/^Mixer\s+/, '');
  const colonIdx = s.lastIndexOf(':');
  if (colonIdx >= 0) s = s.substring(colonIdx + 1);
  // Strip trailing _1 (GLB artifact)
  s = s.replace(/_1$/, '');
  return s;
}

// ── Inner 3D Scene Component ─────────────────────────────────────────────────

function MixerScene() {
  const { scene: gltfScene } = useGLTF(MODEL_PATH);

  // Drag state refs
  const activeKnobRef = useRef<string | null>(null);
  const activeFaderRef = useRef<string | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragStartValueRef = useRef(0);

  // Control definitions (memoized)
  const { knobControls, faderControls, buttonControls } = useMemo(() => {
    const store = useDJStore.getState;

    const knobs: KnobControl[] = [
      // CH-1 (Deck A) strip — x ~ -9.6
      {
        meshName: 'knob2', label: 'CH1 Trim',
        action: (v) => { store().setDeckTrimGain('A', v); try { getDJEngine().getDeck('A').setTrimGain(v); } catch {} },
        readValue: () => store().decks.A.trimGain,
        min: -12, max: 12, defaultValue: 0, centerDetent: true,
      },
      {
        meshName: 'knob3', label: 'CH1 EQ High',
        action: (v) => { store().setDeckEQ('A', 'high', v); try { getDJEngine().getDeck('A').setEQ('high', v); } catch {} },
        readValue: () => store().decks.A.eqHigh,
        min: -24, max: 6, defaultValue: 0, centerDetent: true,
      },
      {
        meshName: 'knob4', label: 'CH1 EQ Mid',
        action: (v) => { store().setDeckEQ('A', 'mid', v); try { getDJEngine().getDeck('A').setEQ('mid', v); } catch {} },
        readValue: () => store().decks.A.eqMid,
        min: -24, max: 6, defaultValue: 0, centerDetent: true,
      },
      {
        meshName: 'knob5', label: 'CH1 EQ Low',
        action: (v) => { store().setDeckEQ('A', 'low', v); try { getDJEngine().getDeck('A').setEQ('low', v); } catch {} },
        readValue: () => store().decks.A.eqLow,
        min: -24, max: 6, defaultValue: 0, centerDetent: true,
      },

      // CH-2 (Deck B) strip — x ~ 3.3
      {
        meshName: 'knob13', label: 'CH2 Trim',
        action: (v) => { store().setDeckTrimGain('B', v); try { getDJEngine().getDeck('B').setTrimGain(v); } catch {} },
        readValue: () => store().decks.B.trimGain,
        min: -12, max: 12, defaultValue: 0, centerDetent: true,
      },
      {
        meshName: 'knob12', label: 'CH2 EQ High',
        action: (v) => { store().setDeckEQ('B', 'high', v); try { getDJEngine().getDeck('B').setEQ('high', v); } catch {} },
        readValue: () => store().decks.B.eqHigh,
        min: -24, max: 6, defaultValue: 0, centerDetent: true,
      },
      {
        meshName: 'knob11', label: 'CH2 EQ Mid',
        action: (v) => { store().setDeckEQ('B', 'mid', v); try { getDJEngine().getDeck('B').setEQ('mid', v); } catch {} },
        readValue: () => store().decks.B.eqMid,
        min: -24, max: 6, defaultValue: 0, centerDetent: true,
      },
      {
        meshName: 'knob10', label: 'CH2 EQ Low',
        action: (v) => { store().setDeckEQ('B', 'low', v); try { getDJEngine().getDeck('B').setEQ('low', v); } catch {} },
        readValue: () => store().decks.B.eqLow,
        min: -24, max: 6, defaultValue: 0, centerDetent: true,
      },

      // Center column — x ~ -3.2
      {
        meshName: 'knob9', label: 'Cue/Mix',
        action: (v) => store().setCueMix(v),
        readValue: () => store().cueMix,
        min: 0, max: 1, defaultValue: 0.5, centerDetent: true,
      },
      {
        meshName: 'knob8', label: 'Headphone Level',
        action: (v) => store().setCueVolume(v),
        readValue: () => store().cueVolume,
        min: 0, max: 1.5, defaultValue: 1,
      },
      {
        meshName: 'knob7', label: 'Master Level',
        action: (v) => { store().setMasterVolume(v); try { getDJEngine().getMixer().setMasterGain(v); } catch {} },
        readValue: () => store().masterVolume,
        min: 0, max: 1.5, defaultValue: 1,
      },
      {
        meshName: 'knob6', label: 'Booth Level',
        action: (v) => store().setBoothVolume(v),
        readValue: () => store().boothVolume,
        min: 0, max: 1.5, defaultValue: 1,
      },

      // Far-left — crossfader curve controls
      {
        meshName: 'knob', label: 'CF Curve',
        action: (v) => {
          // Map 0-1 to curve types: <0.33=cut, 0.33-0.66=smooth, >0.66=linear
          const curve = v < 0.33 ? 'cut' : v < 0.66 ? 'smooth' : 'linear';
          store().setCrossfaderCurve(curve);
          try { getDJEngine().getMixer().setCrossfaderCurve(curve); } catch {}
        },
        readValue: () => {
          const c = store().crossfaderCurve;
          return c === 'cut' ? 0.17 : c === 'smooth' ? 0.5 : 0.83;
        },
        min: 0, max: 1, defaultValue: 0.5,
      },
      {
        meshName: 'knob1', label: 'CF Reverse',
        action: (v) => store().setHamsterSwitch(v > 0.5),
        readValue: () => store().hamsterSwitch ? 1 : 0,
        min: 0, max: 1, defaultValue: 0,
      },

      // Far-right — headphone / monitor
      {
        meshName: 'knob14', label: 'Monitor Level',
        action: (v) => store().setBoothVolume(v),
        readValue: () => store().boothVolume,
        min: 0, max: 1.5, defaultValue: 1,
      },
      {
        meshName: 'knob15', label: 'Filter',
        action: (v) => {
          // Map 0-1 to filter position -1 to +1
          const pos = (v - 0.5) * 2;
          store().setDeckFilter('A', pos);
          store().setDeckFilter('B', pos);
          try {
            getDJEngine().getDeck('A').setFilter(pos, 1);
            getDJEngine().getDeck('B').setFilter(pos, 1);
          } catch {}
        },
        readValue: () => (store().decks.A.filterPosition + 1) / 2,
        min: 0, max: 1, defaultValue: 0.5, centerDetent: true,
      },
    ];

    const faders: FaderControl[] = [
      {
        meshName: 'fader1', label: 'CH1 Volume',
        axis: 'z',
        action: (v) => { store().setDeckVolume('A', v); try { getDJEngine().getDeck('A').setVolume(v); } catch {} },
        readValue: () => store().decks.A.volume,
        min: 0, max: 1.5,
      },
      {
        meshName: 'fader4', label: 'CH2 Volume',
        axis: 'z',
        action: (v) => { store().setDeckVolume('B', v); try { getDJEngine().getDeck('B').setVolume(v); } catch {} },
        readValue: () => store().decks.B.volume,
        min: 0, max: 1.5,
      },
      {
        meshName: 'hfader1', label: 'Crossfader',
        axis: 'x',
        action: (v) => {
          const hamster = store().hamsterSwitch;
          const pos = hamster ? 1 - v : v;
          store().setCrossfader(pos);
          try { getDJEngine().getMixer().setCrossfader(pos); } catch {};
        },
        readValue: () => {
          const hamster = store().hamsterSwitch;
          const pos = store().crossfaderPosition;
          return hamster ? 1 - pos : pos;
        },
        min: 0, max: 1,
      },
    ];

    const buttons: ButtonControl[] = [
      {
        meshName: 'button1', label: 'CUE CH1',
        action: () => { store().togglePFL('A'); },
        readActive: () => store().decks.A.pflEnabled,
      },
      {
        meshName: 'button2', label: 'CUE CH2',
        action: () => { store().togglePFL('B'); },
        readActive: () => store().decks.B.pflEnabled,
      },
    ];

    return { knobControls: knobs, faderControls: faders, buttonControls: buttons };
  }, []);

  // Build control lookup maps
  const knobMap = useMemo(() => {
    const map = new Map<string, KnobControl>();
    for (const k of knobControls) map.set(k.meshName, k);
    return map;
  }, [knobControls]);

  const faderMap = useMemo(() => {
    const map = new Map<string, FaderControl>();
    for (const f of faderControls) map.set(f.meshName, f);
    return map;
  }, [faderControls]);

  const buttonMap = useMemo(() => {
    const map = new Map<string, ButtonControl>();
    for (const b of buttonControls) map.set(b.meshName, b);
    return map;
  }, [buttonControls]);

  // ── Scene Setup: Clone & Classify Meshes ─────────────────────────────────

  const { sceneGroup, meshRegistry } = useMemo(() => {
    const cloned = gltfScene.clone(true);

    // Registry: meshName → { mesh, center, type }
    const registry = new Map<string, {
      meshes: THREE.Mesh[];
      center: THREE.Vector3;
      type: 'knob' | 'fader' | 'hfader' | 'button' | 'vu' | 'static';
      restMatrix?: THREE.Matrix4;
    }>();

    // Classify meshes
    cloned.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const sName = simplifyName(child.name);

      // Compute bounding box center
      child.geometry.computeBoundingBox();
      const box = child.geometry.boundingBox!;
      const center = new THREE.Vector3();
      box.getCenter(center);

      let type: 'knob' | 'fader' | 'hfader' | 'button' | 'vu' | 'static' = 'static';

      if (sName.startsWith('knob')) {
        type = 'knob';
      } else if (sName === 'fader1' || sName === 'fader4') {
        type = 'fader';
      } else if (sName === 'hfader1') {
        type = 'hfader';
      } else if (sName.startsWith('button')) {
        type = 'button';
      } else if (sName === 'window') {
        type = 'vu';
      }

      // Group meshes by simplified name (some names appear multiple times for multi-material)
      const existing = registry.get(sName);
      if (existing) {
        existing.meshes.push(child);
      } else {
        registry.set(sName, {
          meshes: [child],
          center,
          type,
          restMatrix: child.matrix.clone(),
        });
      }

      // Disable auto-update on interactive meshes for manual matrix control
      if (type === 'knob' || type === 'fader' || type === 'hfader') {
        child.matrixAutoUpdate = false;
      }

      // Make interactive meshes have pointer cursor
      if (type !== 'static' && type !== 'vu') {
        child.userData.interactive = true;
        child.userData.controlName = sName;
      }
    });

    return { sceneGroup: cloned, meshRegistry: registry };
  }, [gltfScene]);

  // ── Per-Frame Updates ────────────────────────────────────────────────────

  useFrame(() => {
    const store = useDJStore.getState();

    // Update knob rotations based on current values
    for (const [meshName, control] of knobMap) {
      const entry = meshRegistry.get(meshName);
      if (!entry || entry.meshes.length === 0) continue;

      const value = control.readValue();
      const normalized = (value - control.min) / (control.max - control.min);
      const angle = KNOB_MIN_ANGLE + normalized * KNOB_RANGE;

      // Rotate around Y-axis at the knob's center
      makeRotationAroundPivotY(angle, entry.center, _knobCompositeMat);
      for (const mesh of entry.meshes) {
        mesh.matrix.copy(_knobCompositeMat);
      }
    }

    // Update fader positions based on current values
    for (const [meshName, control] of faderMap) {
      const entry = meshRegistry.get(meshName);
      if (!entry || entry.meshes.length === 0 || !entry.restMatrix) continue;

      const value = control.readValue();
      const normalized = (value - control.min) / (control.max - control.min);

      // Fader slides along its axis
      const offset = (normalized - 0.5) * (control.axis === 'x' ? HFADER_TRAVEL : VFADER_TRAVEL);
      const translation = new THREE.Matrix4();
      if (control.axis === 'x') {
        translation.makeTranslation(offset, 0, 0);
      } else {
        translation.makeTranslation(0, 0, offset);
      }

      for (const mesh of entry.meshes) {
        mesh.matrix.copy(entry.restMatrix).multiply(translation);
      }
    }

    // Update VU meter emissive (window mesh)
    const vuEntry = meshRegistry.get('window');
    if (vuEntry) {
      // Blend VU color based on peak level of both decks
      const peakA = store.decks.A.peakDb ?? -60;
      const peakB = store.decks.B.peakDb ?? -60;
      const maxPeak = Math.max(peakA, peakB);

      // Map -60..0 dB to brightness 0..1
      const brightness = Math.max(0, Math.min(1, (maxPeak + 60) / 60));

      // Color: green → yellow → red
      const r = brightness > 0.6 ? 1 : brightness / 0.6;
      const g = brightness < 0.8 ? 1 : 1 - (brightness - 0.8) / 0.2;

      for (const mesh of vuEntry.meshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.emissive) {
          mat.emissive.setRGB(r * brightness * 0.5, g * brightness * 0.5, 0);
          mat.emissiveIntensity = brightness * 2;
        }
      }
    }

    // Update button emissive for PFL state
    for (const [meshName, control] of buttonMap) {
      const entry = meshRegistry.get(meshName);
      if (!entry) continue;
      const active = control.readActive();
      for (const mesh of entry.meshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.emissive) {
          mat.emissive.setRGB(active ? 1 : 0.1, active ? 0.4 : 0.1, active ? 0.1 : 0.1);
          mat.emissiveIntensity = active ? 1.5 : 0.2;
        }
      }
    }
  });

  // ── Interaction Handlers ──────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const mesh = e.object as THREE.Mesh;
    const controlName = mesh.userData.controlName as string | undefined;
    if (!controlName) return;

    // Check if it's a knob or fader
    const knob = knobMap.get(controlName);
    const fader = faderMap.get(controlName);
    const button = buttonMap.get(controlName);

    if (button) {
      button.action();
      return;
    }

    if (knob) {
      activeKnobRef.current = controlName;
      dragStartRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
      dragStartValueRef.current = knob.readValue();
      (e.nativeEvent.target as HTMLElement)?.setPointerCapture?.(e.nativeEvent.pointerId);
    } else if (fader) {
      activeFaderRef.current = controlName;
      dragStartRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
      dragStartValueRef.current = fader.readValue();
      (e.nativeEvent.target as HTMLElement)?.setPointerCapture?.(e.nativeEvent.pointerId);
    }
  }, [knobMap, faderMap, buttonMap]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    const knobName = activeKnobRef.current;
    const faderName = activeFaderRef.current;

    if (knobName) {
      const knob = knobMap.get(knobName);
      if (!knob) return;

      // Vertical drag maps to value change (drag up = increase)
      const dy = dragStartRef.current.y - e.nativeEvent.clientY;
      const sensitivity = 200; // pixels for full range
      const delta = (dy / sensitivity) * (knob.max - knob.min);
      const newValue = Math.max(knob.min, Math.min(knob.max, dragStartValueRef.current + delta));
      knob.action(newValue);
    }

    if (faderName) {
      const fader = faderMap.get(faderName);
      if (!fader) return;

      // Map drag direction to fader axis
      const d = fader.axis === 'x'
        ? e.nativeEvent.clientX - dragStartRef.current.x
        : dragStartRef.current.y - e.nativeEvent.clientY; // Y inverted: drag up = increase

      const sensitivity = 150;
      const delta = (d / sensitivity) * (fader.max - fader.min);
      const newValue = Math.max(fader.min, Math.min(fader.max, dragStartValueRef.current + delta));
      fader.action(newValue);
    }
  }, [knobMap, faderMap]);

  const handlePointerUp = useCallback(() => {
    activeKnobRef.current = null;
    activeFaderRef.current = null;
  }, []);

  const handleDoubleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const mesh = e.object as THREE.Mesh;
    const controlName = mesh.userData.controlName as string | undefined;
    if (!controlName) return;

    // Double-click resets knob to default
    const knob = knobMap.get(controlName);
    if (knob) {
      knob.action(knob.defaultValue);
    }
  }, [knobMap]);

  return (
    <group
      scale={[MODEL_SCALE, MODEL_SCALE, MODEL_SCALE]}
      rotation={[0, 0, 0]}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      <primitive object={sceneGroup} />
    </group>
  );
}

// ── Outer Component (Canvas wrapper) ─────────────────────────────────────────

export function MixerVestax3DView() {
  return (
    <div className="w-full h-full bg-black rounded-lg overflow-hidden">
      <Canvas
        camera={{ fov: 40, near: 0.01, far: 20, position: [0, 0.4, 0.25] }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.3 }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[2, 4, 2]} intensity={0.8} />
        <directionalLight position={[-1, 2, -1]} intensity={0.3} />
        <pointLight position={[0, 0.1, 0]} color="#60a5fa" intensity={0.3} distance={0.5} />

        <MixerScene />

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          enableRotate={true}
          minPolarAngle={Math.PI * 0.1}
          maxPolarAngle={Math.PI * 0.6}
          minDistance={0.15}
          maxDistance={0.8}
          target={[0, -0.1, 0]}
        />
      </Canvas>
    </div>
  );
}

// Preload model
useGLTF.preload(MODEL_PATH);

export default MixerVestax3DView;
