/**
 * DJ3DOverlay — Unified Three.js 3D turntable + mixer scene for GL mode.
 *
 * Renders all 3 objects (2 turntables + 1 mixer) in a single Three.js scene
 * with one camera and unified orbit/pan/zoom controls.
 */

import React, { Suspense, useRef, useCallback, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useDJStore } from '@/stores/useDJStore';
import { TurntableScene } from './DeckVinyl3DView';
import { MixerScene } from './MixerVestax3DView';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

// ── Default camera position: DJ standing behind the decks, looking down ──────

const DEFAULT_CAM_POS: [number, number, number] = [0, 0.55, 0.65];
const DEFAULT_CAM_TARGET: [number, number, number] = [0, 0, -0.02];

// ── Camera Control Buttons ───────────────────────────────────────────────────

interface CameraButtonsProps {
  orbitRef: React.RefObject<OrbitControlsImpl | null>;
}

const CameraButtons: React.FC<CameraButtonsProps> = ({ orbitRef }) => {
  const dragMode = useRef<'rotate' | 'pan' | 'zoom' | null>(null);
  const lastPos = useRef({ x: 0, y: 0 });

  const onDragStart = useCallback((mode: 'rotate' | 'pan' | 'zoom', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragMode.current = mode;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragMode.current) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };

    const c = orbitRef.current;
    if (!c) return;

    switch (dragMode.current) {
      case 'rotate':
        c.setAzimuthalAngle(c.getAzimuthalAngle() - dx * 0.008);
        c.setPolarAngle(c.getPolarAngle() + dy * 0.008);
        c.update();
        break;
      case 'pan': {
        const cam = c.object;
        const forward = new THREE.Vector3();
        cam.getWorldDirection(forward);
        const right = new THREE.Vector3().crossVectors(cam.up, forward).normalize();
        const up = new THREE.Vector3().crossVectors(forward, right).normalize();
        const offset = right.multiplyScalar(dx * 0.002).addScaledVector(up, dy * 0.002);
        c.target.add(offset);
        cam.position.add(offset);
        c.update();
        break;
      }
      case 'zoom': {
        const dir = c.object.position.clone().sub(c.target).normalize();
        c.object.position.addScaledVector(dir, dy * 0.01);
        c.update();
        break;
      }
    }
  }, [orbitRef]);

  const onDragEnd = useCallback((e: React.PointerEvent) => {
    if (dragMode.current) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      dragMode.current = null;
    }
  }, []);

  const resetView = useCallback(() => {
    const c = orbitRef.current;
    if (!c) return;
    c.target.set(...DEFAULT_CAM_TARGET);
    c.object.position.set(...DEFAULT_CAM_POS);
    c.update();
  }, [orbitRef]);

  const pad = "w-10 h-10 flex items-center justify-center rounded bg-black/50 hover:bg-white/20 text-white/70 hover:text-text-primary text-[10px] leading-tight select-none cursor-grab active:cursor-grabbing border border-white/10 transition-colors touch-none";
  const btn = "w-10 h-6 flex items-center justify-center rounded bg-black/50 hover:bg-white/20 text-white/70 hover:text-text-primary text-[10px] select-none cursor-pointer border border-white/10 transition-colors";

  return (
    <div
      className="absolute bottom-2 right-2 flex flex-col gap-0.5 z-10 pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className={pad}
        title="Drag to rotate"
        onPointerDown={(e) => onDragStart('rotate', e)}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >Orbit</div>
      <div
        className={pad}
        title="Drag to pan"
        onPointerDown={(e) => onDragStart('pan', e)}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >Pan</div>
      <div
        className={pad}
        title="Drag up/down to zoom"
        onPointerDown={(e) => onDragStart('zoom', e)}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >Zoom</div>
      <button className={btn} title="Reset camera" onClick={resetView}>Reset</button>
    </div>
  );
};

// ── On-demand rendering: only re-render when decks are playing or camera moves ─
// Uses setInterval outside the render loop so it can kick-start rendering
// even when the canvas is idle (useFrame doesn't run in demand mode until invalidated).

function DemandInvalidator() {
  const { invalidate } = useThree();
  const invalidateRef = useRef(invalidate);
  invalidateRef.current = invalidate;

  useEffect(() => {
    let id: ReturnType<typeof setInterval>;
    const poll = () => {
      if (document.hidden) return;
      const decks = useDJStore.getState().decks;
      if (decks.A.isPlaying || decks.B.isPlaying || decks.C.isPlaying) {
        invalidateRef.current();
      }
    };
    // Poll at ~30fps — enough for smooth turntable animation, half the CPU cost
    id = setInterval(poll, 33);
    return () => clearInterval(id);
  }, []);

  return null;
}

// ── Unified 3D Scene ─────────────────────────────────────────────────────────

const UnifiedDJScene: React.FC<{
  orbitRef: React.RefObject<OrbitControlsImpl | null>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  thirdDeckActive: boolean;
}> = ({ orbitRef, canvasContainerRef, thirdDeckActive }) => {
  return (
    <>
      {/* Unified camera */}
      <PerspectiveCamera
        makeDefault
        position={DEFAULT_CAM_POS}
        fov={50}
        near={0.01}
        far={20}
      />

      {/* Unified lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[2, 5, 3]} intensity={0.8} />
      <directionalLight position={[-2, 3, -1]} intensity={0.3} />
      <spotLight position={[0, 4, 1]} intensity={1.5} angle={0.5} penumbra={0.6} />
      <pointLight position={[0, 0.1, 0]} color="#4488ff" intensity={0.6} distance={1.0} decay={2} />

      {/* Left turntable (Deck A) — SL-1200 ~0.45 wide at scale 0.01 */}
      <group position={[-0.40, 0, 0]}>
        <TurntableScene deckId="A" orbitRef={orbitRef} embedded />
      </group>

      {/* Center mixer — raised so top surface matches turntable surface */}
      <group position={[0, 0.15, 0]}>
        <MixerScene viewRef={canvasContainerRef} />
      </group>

      {/* Right turntable (Deck B) */}
      <group position={[0.40, 0, 0]}>
        <TurntableScene deckId="B" orbitRef={orbitRef} embedded />
      </group>

      {/* Third deck (Deck C) — next to Deck B */}
      {thirdDeckActive && (
        <group position={[0.85, 0, 0]}>
          <TurntableScene deckId="C" orbitRef={orbitRef} embedded />
        </group>
      )}

      {/* Unified orbit controls */}
      <OrbitControls
        ref={orbitRef}
        target={DEFAULT_CAM_TARGET}
        enableDamping
        dampingFactor={0.1}
        minPolarAngle={Math.PI * 0.05}
        maxPolarAngle={Math.PI * 0.48}
        minDistance={0.15}
        maxDistance={3.0}
        /* Disable default mouse buttons — camera is controlled via the drag pads */
        mouseButtons={{
          LEFT: undefined as unknown as THREE.MOUSE,
          MIDDLE: undefined as unknown as THREE.MOUSE,
          RIGHT: undefined as unknown as THREE.MOUSE,
        }}
      />
    </>
  );
};

export const DJ3DOverlay: React.FC = () => {
  const thirdDeckActive = useDJStore(s => s.thirdDeckActive);
  const orbitRef = useRef<OrbitControlsImpl>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={canvasContainerRef} className="w-full h-full relative" style={{ touchAction: 'none' }}>
      <Suspense fallback={
        <div className="flex items-center justify-center w-full h-full text-text-muted text-sm">
          Loading 3D scene...
        </div>
      }>
        <Canvas
          style={{ position: 'absolute', inset: 0 }}
          gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
          dpr={[1, 1.5]}
          frameloop="demand"
        >
          <color attach="background" args={['#0a0a0a']} />
          <DemandInvalidator />
          <UnifiedDJScene
            orbitRef={orbitRef}
            canvasContainerRef={canvasContainerRef}
            thirdDeckActive={thirdDeckActive}
          />
        </Canvas>
        <CameraButtons orbitRef={orbitRef} />
      </Suspense>
    </div>
  );
};
