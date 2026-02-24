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
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useDJStore, type DeckId } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { CameraControlOverlay } from './DJ3DCameraControls';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

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
const _faderTransMat = new THREE.Matrix4();

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
    let meshCount = 0;
    cloned.traverse((child) => {
      if (!('isMesh' in child && child.isMesh)) return;
      meshCount++;
      const mesh = child as THREE.Mesh;
      const sName = simplifyName(mesh.name);

      // Compute bounding box center
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
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
        existing.meshes.push(mesh);
      } else {
        registry.set(sName, {
          meshes: [mesh],
          center,
          type,
          restMatrix: mesh.matrix.clone(),
        });
      }

      // Disable auto-update on interactive meshes for manual matrix control
      if (type === 'knob' || type === 'fader' || type === 'hfader') {
        mesh.matrixAutoUpdate = false;
      }

      // Make interactive meshes have pointer cursor
      if (type !== 'static' && type !== 'vu') {
        mesh.userData.interactive = true;
        mesh.userData.controlName = sName;
      }
    });

    // Log classified controls
    const interactiveCount = [...registry.entries()].filter(([, v]) => v.type !== 'static').length;
    console.log(`[Mixer3D] ${meshCount} meshes, ${registry.size} groups, ${interactiveCount} interactive`);

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
        mesh.matrixWorldNeedsUpdate = true;
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
      if (control.axis === 'x') {
        _faderTransMat.makeTranslation(offset, 0, 0);
      } else {
        _faderTransMat.makeTranslation(0, 0, offset);
      }

      for (const mesh of entry.meshes) {
        mesh.matrix.copy(entry.restMatrix).multiply(_faderTransMat);
        mesh.matrixWorldNeedsUpdate = true;
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

  // ── Interaction via R3F events on <primitive> + DOM drag continuation ────────
  // R3F fires events on <primitive> children; e.object = the actual hit mesh.
  // For continuous drag (mouse may leave the mesh), we use DOM pointer capture.

  const { gl } = useThree();

  /** Walk up from hit object to find the controlName in userData */
  const findControl = useCallback((hitObj: THREE.Object3D): string | null => {
    let obj: THREE.Object3D | null = hitObj;
    while (obj) {
      if (obj.userData.controlName) return obj.userData.controlName as string;
      obj = obj.parent;
    }
    return null;
  }, []);

  const handlePointerDown = useCallback((e: { object: THREE.Object3D; nativeEvent: PointerEvent; stopPropagation: () => void }) => {
    if (e.nativeEvent.button !== 0) return;
    e.stopPropagation();

    const controlName = findControl(e.object);
    if (!controlName) return;

    // Buttons: toggle immediately
    const button = buttonMap.get(controlName);
    if (button) { button.action(); return; }

    // Knobs/Faders: start drag
    const knob = knobMap.get(controlName);
    if (knob) {
      activeKnobRef.current = controlName;
      dragStartRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
      dragStartValueRef.current = knob.readValue();
      return;
    }
    const fader = faderMap.get(controlName);
    if (fader) {
      activeFaderRef.current = controlName;
      dragStartRef.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
      dragStartValueRef.current = fader.readValue();
    }
  }, [findControl, knobMap, faderMap, buttonMap]);

  const handleDblClick = useCallback((e: { object: THREE.Object3D; stopPropagation: () => void }) => {
    e.stopPropagation();
    const controlName = findControl(e.object);
    if (!controlName) return;
    const knob = knobMap.get(controlName);
    if (knob) knob.action(knob.defaultValue);
  }, [findControl, knobMap]);

  // DOM listeners for drag continuation (pointermove/pointerup on document)
  // Using document-level listeners ensures we get events even if R3F's event
  // system intercepts canvas events during raycasting.
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const knobName = activeKnobRef.current;
      if (knobName) {
        const knob = knobMap.get(knobName);
        if (!knob) return;
        const dy = dragStartRef.current.y - e.clientY;
        const delta = (dy / 200) * (knob.max - knob.min);
        const newVal = Math.max(knob.min, Math.min(knob.max, dragStartValueRef.current + delta));
        knob.action(newVal);
        return;
      }
      const faderName = activeFaderRef.current;
      if (faderName) {
        const fader = faderMap.get(faderName);
        if (!fader) return;
        const d = fader.axis === 'x'
          ? e.clientX - dragStartRef.current.x
          : dragStartRef.current.y - e.clientY;
        const delta = (d / 150) * (fader.max - fader.min);
        fader.action(Math.max(fader.min, Math.min(fader.max, dragStartValueRef.current + delta)));
      }
    };

    const onPointerUp = () => {
      if (activeKnobRef.current || activeFaderRef.current) {
        activeKnobRef.current = null;
        activeFaderRef.current = null;
      }
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
  }, [gl, knobMap, faderMap]);

  return (
    <group scale={[MODEL_SCALE, MODEL_SCALE, MODEL_SCALE]}>
      <primitive
        object={sceneGroup}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDblClick}
      />
    </group>
  );
}

// ── Outer Component (Canvas wrapper) ─────────────────────────────────────────

export function MixerVestax3DView() {
  const orbitRef = useRef<OrbitControlsImpl>(null);

  return (
    <div className="relative w-full h-full min-h-[200px]" style={{ touchAction: 'none' }}>
      <Canvas
        camera={{
          position: [0, 0.45, 0.45],
          fov: 42,
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
        <ambientLight intensity={0.4} />
        <directionalLight position={[2, 4, 2]} intensity={0.8} castShadow={false} />
        <directionalLight position={[-1, 2, -1]} intensity={0.3} />
        <pointLight position={[0, 0.05, 0]} color="#60a5fa" intensity={0.4} distance={0.5} />

        <MixerScene />

        <OrbitControls
          ref={orbitRef}
          enablePan={false}
          enableZoom={false}
          enableDamping
          dampingFactor={0.1}
          minPolarAngle={Math.PI * 0.05}
          maxPolarAngle={Math.PI * 0.6}
          minDistance={0.1}
          maxDistance={2.0}
          target={[0, -0.05, 0] as unknown as THREE.Vector3}
          mouseButtons={{
            LEFT: undefined as unknown as THREE.MOUSE,
            MIDDLE: undefined as unknown as THREE.MOUSE,
            RIGHT: THREE.MOUSE.ROTATE,
          }}
        />
      </Canvas>
      <CameraControlOverlay orbitRef={orbitRef} />
    </div>
  );
}

// Preload model
useGLTF.preload(MODEL_PATH);

export default MixerVestax3DView;
