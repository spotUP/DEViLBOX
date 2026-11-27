/**
 * DJ 3D mixer pick targets (owner report 2026-11-27: "the 3d mixer is super
 * laggy ... is the hitboxes correct?").
 *
 * - Every control the mixer defines must resolve to at least one mesh in
 *   public/models/vestax-mixer.glb, read straight from the GLB node table with
 *   the same name sanitising GLTFLoader applies. A control without a mesh can
 *   never be picked.
 * - The hit slop picks the nearest control centre within the radius, so a
 *   press next to a 14 px knob still grabs it.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { pickNearestScreenPoint, CONTROL_HIT_RADIUS_PX, faderOffset, dragToValue } from '../control3DMapping';
import { useDJStore } from '@/stores/useDJStore';

vi.mock('@react-three/drei', () => ({
  useGLTF: Object.assign(vi.fn(), { preload: vi.fn() }),
  OrbitControls: () => null,
  View: () => null,
  PerspectiveCamera: () => null,
  Environment: () => null,
}));
vi.mock('@/engine/dj/DJEngine', () => ({ getDJEngine: vi.fn() }));
vi.mock('@/engine/dj/DJActions', () => ({}));
vi.mock('../DJ3DCameraControls', () => ({ CameraControlOverlay: () => null }));

const { buildMixerControls, getControlName } = await import('../MixerVestax3DView');

const root = resolve(__dirname, '../../../..');

/** Mesh objects as GLTFLoader names them (sanitised, parent linked). */
function glbMeshes(path: string): THREE.Mesh[] {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as {
    nodes: { name?: string; mesh?: number; children?: number[] }[];
  };
  const objs = gltf.nodes.map((n) => {
    const o: THREE.Object3D = n.mesh != null ? new THREE.Mesh() : new THREE.Group();
    o.name = THREE.PropertyBinding.sanitizeNodeName(n.name ?? '');
    return o;
  });
  gltf.nodes.forEach((n, i) => n.children?.forEach((c) => objs[i].add(objs[c])));
  return objs.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
}

describe('DJ 3D mixer hit targets', () => {
  it('every mixer control has a pickable mesh in vestax-mixer.glb', () => {
    const names = new Set(glbMeshes(resolve(root, 'public/models/vestax-mixer.glb')).map(getControlName));
    const { knobControls, faderControls, buttonControls } = buildMixerControls();
    const all = [...knobControls, ...faderControls, ...buttonControls].map((c) => c.meshName);
    expect(all.length).toBe(24);
    expect(all.filter((n) => !names.has(n))).toEqual([]);
  });

  it('a press near a small control picks the nearest centre within the slop', () => {
    const pts = [{ name: 'knob7', x: 100, y: 100 }, { name: 'knob8', x: 100, y: 130 }];
    expect(pickNearestScreenPoint(pts, 104, 108)).toBe('knob7');
    expect(pickNearestScreenPoint(pts, 100, 120)).toBe('knob8');
    expect(pickNearestScreenPoint(pts, 100 + CONTROL_HIT_RADIUS_PX + 1, 100)).toBeNull();
  });

  // Owner report 2026-11-27: the cue slider also moved the crossfader.
  it('the cue mix slider writes only the cue mix', () => {
    const cue = buildMixerControls().faderControls.find((f) => f.meshName === 'hfader1')!;
    const xf = useDJStore.getState().crossfaderPosition;
    cue.action(0.2);
    expect(useDJStore.getState().cueMix).toBeCloseTo(0.2);
    expect(useDJStore.getState().crossfaderPosition).toBe(xf);
  });

  // Owner report 2026-11-27: channel faders stopped short of the top.
  // DJActions.setDeckVolume clamps to 0..1, so the fader range must end at 1
  // and its top value must put the cap at the model's rest (top) position.
  it('a channel fader dragged to the top reaches max with the cap at the top', () => {
    for (const name of ['exp_fader1', 'fader1']) {
      const f = buildMixerControls().faderControls.find((c) => c.meshName === name)!;
      expect(f.max).toBe(1);
      const top = dragToValue(0, 1000, f.min, f.max);
      expect(top).toBe(1);
      expect(faderOffset(top, f)).toBeCloseTo(0);
      expect(faderOffset(f.min, f)).toBeCloseTo(-f.travel);
    }
  });
});
