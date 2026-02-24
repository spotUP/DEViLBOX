/**
 * DJ3DCameraControls — On-screen drag-handle camera controls for 3D DJ views.
 *
 * Three drag pads: Rotate (drag to orbit), Pan (drag to slide), Zoom (drag up/down).
 * Plus a reset button. Mouse is never captured by OrbitControls — all mouse
 * interaction on the 3D canvas is reserved for music controls (knobs, faders, scratch).
 *
 * Usage:
 *   const orbitRef = useRef<OrbitControlsImpl>(null);
 *   <Canvas>
 *     <OrbitControls ref={orbitRef} enableZoom={false} enableRotate={false} enablePan={false} ... />
 *   </Canvas>
 *   <CameraControlOverlay orbitRef={orbitRef} />
 */

import React, { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

// ── Types ────────────────────────────────────────────────────────────────────

interface CameraControlOverlayProps {
  orbitRef: React.RefObject<OrbitControlsImpl | null>;
  rotateSensitivity?: number;
  panSensitivity?: number;
  zoomSensitivity?: number;
}

// Saved initial state for reset
const initialStates = new WeakMap<OrbitControlsImpl, { target: [number, number, number]; position: [number, number, number] }>();

function saveInitialState(controls: OrbitControlsImpl) {
  if (!initialStates.has(controls)) {
    const { target, object } = controls;
    initialStates.set(controls, {
      target: [target.x, target.y, target.z],
      position: [object.position.x, object.position.y, object.position.z],
    });
  }
}

type DragMode = 'rotate' | 'pan' | 'zoom' | null;

/** Drag-handle camera controls overlaid in the corner of a 3D view */
export const CameraControlOverlay: React.FC<CameraControlOverlayProps> = ({
  orbitRef,
  rotateSensitivity = 0.008,
  panSensitivity = 0.002,
  zoomSensitivity = 0.01,
}) => {
  const dragMode = useRef<DragMode>(null);
  const lastPos = useRef({ x: 0, y: 0 });

  // Force re-render once orbit controls are available
  const [, setReady] = React.useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 200); return () => clearTimeout(t); }, []);

  const getControls = useCallback(() => {
    const c = orbitRef.current;
    if (c) saveInitialState(c);
    return c;
  }, [orbitRef]);

  const onDragStart = useCallback((mode: DragMode, e: React.PointerEvent) => {
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

    const c = getControls();
    if (!c) return;

    switch (dragMode.current) {
      case 'rotate': {
        c.setAzimuthalAngle(c.getAzimuthalAngle() - dx * rotateSensitivity);
        c.setPolarAngle(c.getPolarAngle() + dy * rotateSensitivity);
        c.update();
        break;
      }
      case 'pan': {
        const cam = c.object;
        const forward = new THREE.Vector3();
        cam.getWorldDirection(forward);
        // Camera-relative right and up vectors
        const right = new THREE.Vector3().crossVectors(cam.up, forward).normalize();
        const up = new THREE.Vector3().crossVectors(forward, right).normalize();
        const offset = right.multiplyScalar(dx * panSensitivity).addScaledVector(up, dy * panSensitivity);
        c.target.add(offset);
        cam.position.add(offset);
        c.update();
        break;
      }
      case 'zoom': {
        const dir = c.object.position.clone().sub(c.target).normalize();
        c.object.position.addScaledVector(dir, dy * zoomSensitivity);
        c.update();
        break;
      }
    }
  }, [getControls, rotateSensitivity, panSensitivity, zoomSensitivity]);

  const onDragEnd = useCallback((e: React.PointerEvent) => {
    if (dragMode.current) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      dragMode.current = null;
    }
  }, []);

  const resetView = useCallback(() => {
    const c = getControls();
    if (!c) return;
    const saved = initialStates.get(c);
    if (saved) {
      c.target.set(...saved.target);
      c.object.position.set(...saved.position);
      c.update();
    }
  }, [getControls]);

  const pad = "w-10 h-10 flex items-center justify-center rounded bg-black/50 hover:bg-white/20 text-white/70 hover:text-white text-[10px] leading-tight select-none cursor-grab active:cursor-grabbing border border-white/10 transition-colors touch-none";
  const btn = "w-10 h-6 flex items-center justify-center rounded bg-black/50 hover:bg-white/20 text-white/70 hover:text-white text-[10px] select-none cursor-pointer border border-white/10 transition-colors";

  return (
    <div
      className="absolute bottom-1 right-1 flex flex-col gap-0.5 z-10 pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className={pad}
        title="Drag to rotate"
        onPointerDown={(e) => onDragStart('rotate', e)}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >🔄<br/>Orbit</div>
      <div
        className={pad}
        title="Drag to pan"
        onPointerDown={(e) => onDragStart('pan', e)}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >✋<br/>Pan</div>
      <div
        className={pad}
        title="Drag up/down to zoom"
        onPointerDown={(e) => onDragStart('zoom', e)}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >🔍<br/>Zoom</div>
      <button className={btn} title="Reset camera" onClick={resetView}>⊙ Reset</button>
    </div>
  );
};
