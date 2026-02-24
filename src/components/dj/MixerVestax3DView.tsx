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

/** Check if a mesh name comes from the EXP namespace duplicate layer.
 * These are duplicate geometry from a 3D export namespace that occupy different positions. */
function isExpDuplicate(name: string): boolean {
  return /Klamz_uv_Death_DJ_02/i.test(name);
}

/** Simplify verbose mesh names to control identifiers.
 * GLTFLoader sanitizes names: spaces→underscores, colons→removed.
 * Runtime names look like "Mixer_knob1", "Mixer_fader1_1" */
function simplifyName(name: string): string {
  // Strip "Mixer_" or "Mixer " prefix
  let s = name.replace(/^Mixer[\s_]+/, '');
  // Strip FBXASC032 → space
  s = s.replace(/FBXASC032/g, ' ').trim();
  // Strip trailing _N suffixes (multi-primitive indices) until we match a control name
  const controlRe = /^(knob|fader|hfader|button|window)\d*$/;
  let stripped = s;
  while (!controlRe.test(stripped) && /_\d+$/.test(stripped)) {
    stripped = stripped.replace(/_\d+$/, '');
  }
  if (controlRe.test(stripped)) return stripped;
  return s;
}

/** Get the best control name for a mesh, checking itself and parent (for multi-primitive groups).
 * Returns 'static' for EXP namespace duplicates to prevent double-mapping. */
function getControlName(mesh: THREE.Object3D): string {
  // Skip EXP namespace duplicates — they occupy different positions and cause double-mapping
  if (isExpDuplicate(mesh.name) || (mesh.parent && isExpDuplicate(mesh.parent.name))) {
    return 'static';
  }
  const selfName = simplifyName(mesh.name);
  // For multi-primitive meshes, the parent Group has the real control name
  const parentName = mesh.parent ? simplifyName(mesh.parent.name) : '';
  // Check if self name matches a known control pattern
  const controlRe = /^(knob|fader|hfader|button|window)\d*$/;
  if (controlRe.test(selfName)) return selfName;
  if (controlRe.test(parentName)) return parentName;
  return selfName;
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
      restMatrices: THREE.Matrix4[];
      center: THREE.Vector3;
      type: 'knob' | 'fader' | 'hfader' | 'button' | 'vu' | 'static';
    }>();

    // Classify meshes
    let meshCount = 0;
    cloned.traverse((child) => {
      if (!('isMesh' in child && child.isMesh)) return;
      meshCount++;
      const mesh = child as THREE.Mesh;
      const sName = getControlName(mesh);

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

      // Force local matrix computation from position/rotation/scale
      mesh.updateMatrix();

      // Group meshes by control name (some names appear multiple times for multi-material)
      const existing = registry.get(sName);
      if (existing) {
        existing.meshes.push(mesh);
        existing.restMatrices.push(mesh.matrix.clone());
      } else {
        registry.set(sName, {
          meshes: [mesh],
          restMatrices: [mesh.matrix.clone()],
          center,
          type,
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

      // Rotate around Y-axis at the knob's center, composed with each mesh's rest matrix
      makeRotationAroundPivotY(angle, entry.center, _knobCompositeMat);
      for (let i = 0; i < entry.meshes.length; i++) {
        const mesh = entry.meshes[i];
        mesh.matrix.copy(entry.restMatrices[i]).multiply(_knobCompositeMat);
        mesh.matrixWorldNeedsUpdate = true;
      }
    }

    // Update fader positions based on current values
    for (const [meshName, control] of faderMap) {
      const entry = meshRegistry.get(meshName);
      if (!entry || entry.meshes.length === 0) continue;

      const value = control.readValue();
      const normalized = (value - control.min) / (control.max - control.min);

      // Fader slides along its axis
      const offset = (normalized - 0.5) * (control.axis === 'x' ? HFADER_TRAVEL : VFADER_TRAVEL);
      if (control.axis === 'x') {
        _faderTransMat.makeTranslation(offset, 0, 0);
      } else {
        _faderTransMat.makeTranslation(0, 0, -offset);
      }

      for (let i = 0; i < entry.meshes.length; i++) {
        const mesh = entry.meshes[i];
        mesh.matrix.copy(entry.restMatrices[i]).multiply(_faderTransMat);
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

  // ── Interaction via manual raycasting on canvas DOM element ──────────────────
  // R3F event bubbling through <primitive> is unreliable for cloned scenes.
  // Instead, we raycast manually on pointerdown and walk the hit mesh's userData.

  const { gl, camera, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pointer = useMemo(() => new THREE.Vector2(), []);

  /** Walk up from hit object to find the controlName in userData */
  const findControl = useCallback((hitObj: THREE.Object3D): string | null => {
    let obj: THREE.Object3D | null = hitObj;
    while (obj) {
      if (obj.userData.controlName) return obj.userData.controlName as string;
      obj = obj.parent;
    }
    return null;
  }, []);

  // Manual raycast helper
  const raycastControl = useCallback((e: PointerEvent): string | null => {
    const rect = gl.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const hit of hits) {
      const name = findControl(hit.object);
      if (name) return name;
    }
    return null;
  }, [gl, camera, scene, raycaster, pointer, findControl]);

  // DOM pointer events on the canvas element
  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;

      const controlName = raycastControl(e);
      if (!controlName) return;

      // Buttons: toggle immediately
      const button = buttonMap.get(controlName);
      if (button) { button.action(); return; }

      // Knobs: start drag
      const knob = knobMap.get(controlName);
      if (knob) {
        activeKnobRef.current = controlName;
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        dragStartValueRef.current = knob.readValue();
        return;
      }
      // Faders: start drag
      const fader = faderMap.get(controlName);
      if (fader) {
        activeFaderRef.current = controlName;
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        dragStartValueRef.current = fader.readValue();
      }
    };

    const onDblClick = (e: MouseEvent) => {
      const controlName = raycastControl(e as unknown as PointerEvent);
      if (!controlName) return;
      const knob = knobMap.get(controlName);
      if (knob) knob.action(knob.defaultValue);
    };

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
      activeKnobRef.current = null;
      activeFaderRef.current = null;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('dblclick', onDblClick);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('dblclick', onDblClick);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
  }, [gl, raycastControl, knobMap, faderMap, buttonMap]);

  return (
    <group scale={[MODEL_SCALE, MODEL_SCALE, MODEL_SCALE]}>
      <primitive object={sceneGroup} />
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
        enableRotate={false}
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
          RIGHT: undefined as unknown as THREE.MOUSE,
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
