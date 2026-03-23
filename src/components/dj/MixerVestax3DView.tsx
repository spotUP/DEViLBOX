/* @refresh reset */
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
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, OrbitControls, View, PerspectiveCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { CameraControlOverlay } from './DJ3DCameraControls';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL_PATH = '/models/vestax-mixer.glb';

// Model coordinate system: Y-up, X=left-right, Z=front-back (negative Z = back/rear)
// Scale factor: model is in cm-ish units, we normalize to ~0.3 meters tall
const MODEL_SCALE = 0.01;

// Knob rotation range (radians) — most DJ knobs rotate ~270°
const KNOB_MIN_ANGLE = -Math.PI * 0.75; // -135°
const KNOB_MAX_ANGLE = Math.PI * 0.75;  // +135°
const KNOB_RANGE = KNOB_MAX_ANGLE - KNOB_MIN_ANGLE;


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
  axis: 'x' | 'y' | 'z'; // 3D translation axis
  dragAxis: 'x' | 'y'; // mouse drag axis: 'x'=horizontal, 'y'=vertical
  travel: number; // travel distance in model units
  action: (value: number) => void;
  readValue: () => number;
  min: number;
  max: number;
  defaultValue: number; // value at rest position in the 3D model
}

/** What a button controls */
interface ButtonControl {
  meshName: string;
  label: string;
  action: () => void;
  readActive: () => boolean;
}

// ── Mesh Name Helpers ────────────────────────────────────────────────────────

/** Check if a mesh name comes from the EXP namespace layer. */
function isExpNamespace(name: string): boolean {
  return /Klamz_uv_Death_DJ_02/i.test(name);
}

/** Simplify verbose mesh names to control identifiers.
 * GLTFLoader sanitizes names: spaces→underscores, colons→removed.
 * Runtime names look like "Mixer_knob1", "Mixer_fader1_1",
 * "Mixer_Klamz_uv_Death_DJ_02mixer_EXPfader1_1" */
function simplifyName(name: string): string {
  // Strip "Mixer_" or "Mixer " prefix
  let s = name.replace(/^Mixer[\s_]+/, '');
  // Handle long namespaced EXP names: extract control name after the EXP prefix
  const expMatch = s.match(/Klamz_uv_Death_DJ_02mixer_EXP(.+)/);
  if (expMatch) s = expMatch[1];
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
 * EXP-namespace controls get an "exp_" prefix so they don't collide with the simple-namespace
 * controls that share the same base name but occupy different physical positions. */
function getControlName(mesh: THREE.Object3D): string {
  const isExp = isExpNamespace(mesh.name) || (mesh.parent != null && isExpNamespace(mesh.parent.name));
  const selfName = simplifyName(mesh.name);
  const parentName = mesh.parent ? simplifyName(mesh.parent.name) : '';
  const controlRe = /^(knob|fader|hfader|button|window)\d*$/;
  let base = selfName;
  if (!controlRe.test(base) && controlRe.test(parentName)) base = parentName;
  // Prefix EXP-namespace interactive controls to distinguish from simple-namespace
  if (isExp && controlRe.test(base)) return 'exp_' + base;
  return base;
}

// ── Inner 3D Scene Component ─────────────────────────────────────────────────

export function MixerScene({ viewRef }: { viewRef: React.RefObject<HTMLDivElement | null> }) {
  const { scene: gltfScene } = useGLTF(MODEL_PATH);
  const { camera, scene: threeScene, invalidate } = useThree();

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
        action: (v) => { store().setMasterVolume(v); try { getDJEngine().mixer.setMasterVolume(v); } catch {} },
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
          try { getDJEngine().setCrossfaderCurve(curve); } catch {}
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
        meshName: 'knob15', label: 'Filter',
        action: (v) => {
          // Map 0-1 to filter position -1 to +1
          const pos = (v - 0.5) * 2;
          store().setDeckFilter('A', pos);
          store().setDeckFilter('B', pos);
          try {
            getDJEngine().getDeck('A').setFilterPosition(pos);
            getDJEngine().getDeck('B').setFilterPosition(pos);
          } catch {}
        },
        readValue: () => (store().decks.A.filterPosition + 1) / 2,
        min: 0, max: 1, defaultValue: 0.5, centerDetent: true,
      },
    ];

    const faders: FaderControl[] = [
      {
        meshName: 'exp_fader1', label: 'CH1 Volume',
        axis: 'y', dragAxis: 'y', travel: 5.0, defaultValue: 0.75,
        action: (v) => { store().setDeckVolume('A', v); try { getDJEngine().getDeck('A').setVolume(v); } catch {} },
        readValue: () => store().decks.A.volume,
        min: 0, max: 1.5,
      },
      {
        meshName: 'fader1', label: 'CH2 Volume',
        axis: 'y', dragAxis: 'y', travel: 5.0, defaultValue: 0.75,
        action: (v) => { store().setDeckVolume('B', v); try { getDJEngine().getDeck('B').setVolume(v); } catch {} },
        readValue: () => store().decks.B.volume,
        min: 0, max: 1.5,
      },
      {
        meshName: 'fader4', label: 'Master Volume',
        axis: 'y', dragAxis: 'y', travel: 5.0, defaultValue: 0.75,
        action: (v) => { store().setMasterVolume(v); try { getDJEngine().mixer.setMasterVolume(v); } catch {} },
        readValue: () => store().masterVolume,
        min: 0, max: 1.5,
      },
      {
        meshName: 'hfader1', label: 'Crossfader',
        axis: 'x', dragAxis: 'x', travel: 4.0, defaultValue: 0.5,
        action: (v) => {
          const hamster = store().hamsterSwitch;
          const pos = hamster ? 1 - v : v;
          store().setCrossfader(pos);
          try { getDJEngine().setCrossfader(pos); } catch {};
        },
        readValue: () => {
          const hamster = store().hamsterSwitch;
          const pos = store().crossfaderPosition;
          return hamster ? 1 - pos : pos;
        },
        min: 0, max: 1,
      },
      {
        meshName: 'exp_hfader1', label: 'Crossfader Alt',
        axis: 'x', dragAxis: 'x', travel: 4.0, defaultValue: 0.5,
        action: (v) => {
          const hamster = store().hamsterSwitch;
          const pos = hamster ? 1 - v : v;
          store().setCrossfader(pos);
          try { getDJEngine().setCrossfader(pos); } catch {};
        },
        readValue: () => {
          const hamster = store().hamsterSwitch;
          const pos = store().crossfaderPosition;
          return hamster ? 1 - pos : pos;
        },
        min: 0, max: 1,
      },
      {
        meshName: 'knob14', label: 'CF Monitor',
        axis: 'x', dragAxis: 'x', travel: 3.0, defaultValue: 1,
        action: (v) => store().setSessionMonitorVolume(v),
        readValue: () => store().sessionMonitorVolume,
        min: 0, max: 1.5,
      },
    ];

    const buttons: ButtonControl[] = [
      {
        meshName: 'button1', label: 'CUE CH1',
        action: () => {
          const s = store();
          const next = !s.decks.A.pflEnabled;
          s.togglePFL('A');
          try { getDJEngine().mixer.setPFL('A', next); } catch {}
        },
        readActive: () => store().decks.A.pflEnabled,
      },
      {
        meshName: 'button2', label: 'CUE CH2',
        action: () => {
          const s = store();
          const next = !s.decks.B.pflEnabled;
          s.togglePFL('B');
          try { getDJEngine().mixer.setPFL('B', next); } catch {}
        },
        readActive: () => store().decks.B.pflEnabled,
      },
      {
        meshName: 'exp_button1', label: 'CUE CH1 Alt',
        action: () => {
          const s = store();
          const next = !s.decks.A.pflEnabled;
          s.togglePFL('A');
          try { getDJEngine().mixer.setPFL('A', next); } catch {}
        },
        readActive: () => store().decks.A.pflEnabled,
      },
      {
        meshName: 'exp_button2', label: 'CUE CH2 Alt',
        action: () => {
          const s = store();
          const next = !s.decks.B.pflEnabled;
          s.togglePFL('B');
          try { getDJEngine().mixer.setPFL('B', next); } catch {}
        },
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

      if (sName.startsWith('knob') || sName.startsWith('exp_knob')) {
        type = 'knob';
      } else if (/^(exp_)?fader\d+$/.test(sName)) {
        type = 'fader';
      } else if (/^(exp_)?hfader\d+$/.test(sName)) {
        type = 'hfader';
      } else if (sName.startsWith('button') || sName.startsWith('exp_button')) {
        type = 'button';
      } else if (sName === 'window' || sName === 'exp_window') {
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

      // Fix PBR properties — GLB export from Maya specular workflow needs metalness tuning
      if (mesh.material && 'metalness' in mesh.material) {
        const m = mesh.material as THREE.MeshStandardMaterial;
        const name = m.name || '';
        mesh.material = m.clone();
        const mc = mesh.material as THREE.MeshStandardMaterial;

        // ── Textured materials ──
        if (name.includes('Cylinder06')) {
          // Brushed aluminum body/frame (Anis_Metal_Spec.jpg)
          // Low metalness so texture reads via diffuse (no envMap in unified scene)
          mc.metalness = 0.15; mc.roughness = 0.4;
          mc.color.set(0xcccccc);
        } else if (name.includes('FaceplateSG')) {
          // Main faceplate — silver-gray with brushed metal grain
          mc.metalness = 0.15; mc.roughness = 0.4;
          mc.color.set(0x888888);
        } else if (name.includes('windowSG')) {
          // VU meter (InputLevel.jpg) — dark with blue emissive glow
          mc.emissive = new THREE.Color(0x2060cc);
          mc.emissiveIntensity = 0.5;
          mc.roughness = 0.2;
        } else if (name.includes('pCylinder1SG')) {
          // Noise pattern texture
          mc.metalness = 0.3; mc.roughness = 0.5;
        } else if (name.includes('BoxFBX') || name.includes('OuterSG')) {
          // Degenerate mesh in this OBJ — no visible geometry
          mc.metalness = 0.05; mc.roughness = 0.5;
        // ── Untextured materials ──
        } else if (name.includes('fader')) {
          mc.metalness = 0.7; mc.roughness = 0.2;
        } else if (name.includes('knobSG')) {
          mc.color.set(0x1a1a1a); mc.metalness = 0.1; mc.roughness = 0.75;
        } else if (name.includes('polySurface1SG')) {
          // Upper knob panel — dark matte surface (backplate labels unavailable in this mesh's UVs)
          mc.metalness = 0.1; mc.roughness = 0.6;
          mc.color.set(0x111111);
        } else if (name.includes('Cylinder05') || name.includes('polySurface') || name.includes('pCylinder7')) {
          mc.metalness = 0.6; mc.roughness = 0.35;
        } else if (name.includes('Rectangle01')) {
          mc.metalness = 0.5; mc.roughness = 0.4;
        } else {
          mc.metalness = 0.4; mc.roughness = 0.45;
        }
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

    return { sceneGroup: cloned, meshRegistry: registry };
  }, [gltfScene]);

  // ── Dynamic VU meter canvas texture ──────────────────────────────────────
  // Renders LED segments per-deck onto a canvas, used as emissiveMap on windowSG.
  const vuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const vuTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const vuBaseImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    vuCanvasRef.current = canvas;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    vuTextureRef.current = tex;

    // Load the base InputLevel image as background
    const img = new Image();
    img.src = '/models/vestax/Textures/InputLevel.jpg';
    img.onload = () => { vuBaseImageRef.current = img; };

    // Apply to all windowSG meshes
    const vuEntry = meshRegistry.get('window');
    if (vuEntry) {
      for (const mesh of vuEntry.meshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveMap = tex;
        mat.emissive = new THREE.Color(0xffffff);
        mat.emissiveIntensity = 1.5;
        mat.needsUpdate = true;
      }
    }

    return () => { tex.dispose(); };
  }, [meshRegistry]);

  // ── Async texture loading ────────────────────────────────────────────────
  // gltfScene.clone(true) drops embedded blob textures. Load all from source.
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    const texCache = new Map<string, THREE.Texture>();
    let pending = 0;

    const loadTex = (path: string, srgb: boolean, cb: (t: THREE.Texture) => void) => {
      const cached = texCache.get(path);
      if (cached) { cb(cached); return; }
      pending++;
      loader.load(path, (tex) => {
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
        texCache.set(path, tex);
        cb(tex);
        pending--;
        invalidate();
        if (pending === 0) setTimeout(() => invalidate(), 100);
      });
    };

    sceneGroup.traverse((child) => {
      if (!('isMesh' in child && child.isMesh)) return;
      const mc = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (!mc?.name) return;

      // Brushed aluminum body — diffuse texture lost during clone
      if (mc.name.includes('Cylinder06') && !mc.map) {
        loadTex('/models/vestax/Textures/Anis_Metal_Spec.jpg', true, (tex) => {
          mc.map = tex;
          mc.needsUpdate = true;
        });
      }
      // Faceplate — add brushed metal as roughness map for grain
      if (mc.name.includes('FaceplateSG') && !mc.roughnessMap) {
        loadTex('/models/vestax/Textures/Anis_Metal_Spec.jpg', false, (tex) => {
          mc.roughnessMap = tex;
          mc.needsUpdate = true;
        });
      }
    });
  }, [sceneGroup, invalidate]);

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

      // Offset relative to default position (rest position in 3D model = defaultValue)
      const defaultNorm = (control.defaultValue - control.min) / (control.max - control.min);
      const delta = normalized - defaultNorm;
      if (control.axis === 'x') {
        _faderTransMat.makeTranslation(delta * control.travel, 0, 0);
      } else if (control.axis === 'y') {
        _faderTransMat.makeTranslation(0, delta * control.travel, 0);
      } else {
        _faderTransMat.makeTranslation(0, 0, delta * control.travel);
      }

      for (let i = 0; i < entry.meshes.length; i++) {
        const mesh = entry.meshes[i];
        mesh.matrix.copy(entry.restMatrices[i]).multiply(_faderTransMat);
        mesh.matrixWorldNeedsUpdate = true;
      }
    }

    // Update VU meter canvas texture
    const canvas = vuCanvasRef.current;
    const vuTex = vuTextureRef.current;
    const baseImg = vuBaseImageRef.current;
    if (canvas && vuTex) {
      const ctx = canvas.getContext('2d')!;
      const W = canvas.width, H = canvas.height;

      // Draw base image (labels: INPUT LEVEL, PGM-1, PGM-2, dB markings)
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      if (baseImg) ctx.drawImage(baseImg, 0, 0, W, H);

      // LED segment positions (normalized 0-1 in texture space, mapped to canvas)
      // 7 segments from bottom (-20dB) to top (+6dB)
      const segmentDbValues = [-20, -10, -6, -3, 0, 3, 6]; // bottom to top
      const segY0 = 0.625; // bottom segment center (normalized)
      const segY6 = 0.44;  // top segment center (normalized)
      const segH = 0.018;  // segment height
      // PGM-1: two dash columns at ~x=0.38,0.44  PGM-2: ~x=0.54,0.58
      const pgm1X = [0.375, 0.385, 0.430, 0.450]; // outer dash, inner dash pairs
      const pgm2X = [0.535, 0.545, 0.570, 0.580];

      // Read real-time audio levels from deck meters (not static peakDb)
      let peakA = -60, peakB = -60;
      try {
        const engine = getDJEngine();
        if (store.decks.A.isPlaying) peakA = engine.getDeck('A').getLevel();
        if (store.decks.B.isPlaying) peakB = engine.getDeck('B').getLevel();
      } catch { /* engine not ready */ }

      for (let i = 0; i < 7; i++) {
        const db = segmentDbValues[i];
        const t = i / 6; // 0=bottom, 1=top
        const cy = (segY0 + (segY6 - segY0) * t) * H;

        // LED color by dB level: green < 0dB, yellow 0-3dB, red > 3dB
        let ledColor: string;
        if (db >= 3) ledColor = '#ff2200';
        else if (db >= 0) ledColor = '#ffaa00';
        else ledColor = '#00dd44';

        // PGM-1 (Deck A)
        const litA = peakA >= db;
        if (litA) {
          ctx.fillStyle = ledColor;
          // Outer dash
          ctx.fillRect(pgm1X[0] * W, cy - segH * H / 2, (pgm1X[1] - pgm1X[0]) * W, segH * H);
          // Inner dash
          ctx.fillRect(pgm1X[2] * W, cy - segH * H / 2, (pgm1X[3] - pgm1X[2]) * W, segH * H);
        }

        // PGM-2 (Deck B)
        const litB = peakB >= db;
        if (litB) {
          ctx.fillStyle = ledColor;
          ctx.fillRect(pgm2X[0] * W, cy - segH * H / 2, (pgm2X[1] - pgm2X[0]) * W, segH * H);
          ctx.fillRect(pgm2X[2] * W, cy - segH * H / 2, (pgm2X[3] - pgm2X[2]) * W, segH * H);
        }
      }

      vuTex.needsUpdate = true;
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

  const scene = threeScene; // alias for raycasting below
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

  // Manual raycast helper — uses the View div bounds (not gl.domElement) so NDC
  // is computed relative to the mixer's viewport, not the full shared canvas.
  const raycastControl = useCallback((e: PointerEvent): string | null => {
    const rect = viewRef.current?.getBoundingClientRect();
    if (!rect) return null;
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const hit of hits) {
      const name = findControl(hit.object);
      if (name) return name;
    }
    return null;
  }, [viewRef, camera, scene, raycaster, pointer, findControl]);

  // DOM pointer events on the View div element (not gl.domElement — that's the
  // shared canvas which is pointer-events:none). The View div sits on top and
  // receives clicks for the mixer's screen region.
  useEffect(() => {
    const target = viewRef.current;
    if (!target) return;

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
      if (knob) { knob.action(knob.defaultValue); return; }
      const fader = faderMap.get(controlName);
      if (fader) fader.action(fader.defaultValue);
    };

    const onPointerMove = (e: PointerEvent) => {
      const knobName = activeKnobRef.current;
      if (knobName) {
        const knob = knobMap.get(knobName);
        if (!knob) return;
        const dy = dragStartRef.current.y - e.clientY;
        // Tighter sensitivity (150px = full range, matches standard Knob component)
        const delta = (dy / 150) * (knob.max - knob.min);
        let newVal = Math.max(knob.min, Math.min(knob.max, dragStartValueRef.current + delta));
        // Snap to center detent (default value) when crossing it
        if (knob.centerDetent) {
          const detent = knob.defaultValue;
          const snapRange = (knob.max - knob.min) * 0.02; // 2% of range
          if (Math.abs(newVal - detent) < snapRange) newVal = detent;
        }
        knob.action(newVal);
        return;
      }
      const faderName = activeFaderRef.current;
      if (faderName) {
        const fader = faderMap.get(faderName);
        if (!fader) return;
        const d = fader.dragAxis === 'x'
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

    target.addEventListener('pointerdown', onPointerDown);
    target.addEventListener('dblclick', onDblClick);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    return () => {
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('dblclick', onDblClick);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
  }, [viewRef, raycastControl, knobMap, faderMap, buttonMap]);

  return (
    <group scale={[MODEL_SCALE, MODEL_SCALE, MODEL_SCALE]}>
      <primitive object={sceneGroup} />
    </group>
  );
}

// ── Outer Component ───────────────────────────────────────────────────────────

export function MixerVestax3DView() {
  const orbitRef = useRef<OrbitControlsImpl>(null);
  // viewDivRef is passed to MixerScene so it can attach DOM listeners and
  // compute NDC relative to the mixer's viewport (not the shared canvas bounds).
  const viewDivRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative w-full h-full min-h-[200px]" style={{ touchAction: 'none' }}>
      {/* View registers with the shared Canvas in DJView via View.Port. */}
      <View ref={viewDivRef} className="absolute inset-0">
        <PerspectiveCamera
          makeDefault
          position={[0, 0.45, 0.45]}
          fov={42}
          near={0.01}
          far={10}
        />
        {/* Environment map for PBR reflections + key lighting */}
        <Environment preset="studio" environmentIntensity={0.6} />
        <ambientLight intensity={0.15} />
        <spotLight position={[0, 6, 2]} intensity={1.5} angle={0.4} penumbra={0.6} castShadow={false} />
        <directionalLight position={[-1, 2, -1]} intensity={0.3} />
        <pointLight position={[0, 0.06, 0]} color="#4488ff" intensity={1.0} distance={0.35} decay={2} />

        <MixerScene viewRef={viewDivRef} />

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
      </View>
      <CameraControlOverlay orbitRef={orbitRef} />
    </div>
  );
}

// Preload model
useGLTF.preload(MODEL_PATH);

export default MixerVestax3DView;
