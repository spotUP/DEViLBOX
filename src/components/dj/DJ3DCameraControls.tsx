/**
 * DJ3DCameraControls — On-screen zoom/rotate/reset buttons for 3D DJ views.
 *
 * Works alongside OrbitControls (from @react-three/drei) which handles the
 * actual camera math. The overlay buttons programmatically adjust the
 * OrbitControls instance. Scroll-wheel zoom is disabled on OrbitControls
 * to avoid conflict with vinyl scratching.
 *
 * Usage:
 *   const orbitRef = useRef<OrbitControlsImpl>(null);
 *
 *   <Canvas>
 *     <OrbitControls ref={orbitRef} enableZoom={false} ... />
 *   </Canvas>
 *   <CameraControlOverlay orbitRef={orbitRef} />
 */

import React, { useRef, useCallback, useEffect } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

// ── Types ────────────────────────────────────────────────────────────────────

interface CameraControlOverlayProps {
  orbitRef: React.RefObject<OrbitControlsImpl | null>;
  zoomStep?: number;
  rotateStep?: number;
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

/** Compact zoom/rotate buttons overlaid in the corner of a 3D view */
export const CameraControlOverlay: React.FC<CameraControlOverlayProps> = ({
  orbitRef,
  zoomStep = 0.06,
  rotateStep = Math.PI / 24,
}) => {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Force re-render once orbit controls are available
  const [, setReady] = React.useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 200); return () => clearTimeout(t); }, []);

  const startRepeat = useCallback((action: () => void) => {
    action();
    intervalRef.current = setInterval(action, 80);
  }, []);

  const stopRepeat = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => () => stopRepeat(), [stopRepeat]);

  const getControls = useCallback(() => {
    const c = orbitRef.current;
    if (c) saveInitialState(c);
    return c;
  }, [orbitRef]);

  const zoomIn = useCallback(() => {
    const c = getControls();
    if (!c) return;
    // Move camera closer along the view direction
    const dir = c.object.position.clone().sub(c.target).normalize();
    c.object.position.addScaledVector(dir, -zoomStep);
    c.update();
  }, [getControls, zoomStep]);

  const zoomOut = useCallback(() => {
    const c = getControls();
    if (!c) return;
    const dir = c.object.position.clone().sub(c.target).normalize();
    c.object.position.addScaledVector(dir, zoomStep);
    c.update();
  }, [getControls, zoomStep]);

  const rotateLeft = useCallback(() => {
    const c = getControls();
    if (!c) return;
    c.setAzimuthalAngle(c.getAzimuthalAngle() - rotateStep);
    c.update();
  }, [getControls, rotateStep]);

  const rotateRight = useCallback(() => {
    const c = getControls();
    if (!c) return;
    c.setAzimuthalAngle(c.getAzimuthalAngle() + rotateStep);
    c.update();
  }, [getControls, rotateStep]);

  const rotateUp = useCallback(() => {
    const c = getControls();
    if (!c) return;
    c.setPolarAngle(c.getPolarAngle() - rotateStep);
    c.update();
  }, [getControls, rotateStep]);

  const rotateDown = useCallback(() => {
    const c = getControls();
    if (!c) return;
    c.setPolarAngle(c.getPolarAngle() + rotateStep);
    c.update();
  }, [getControls, rotateStep]);

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

  const btn = "w-6 h-6 flex items-center justify-center rounded bg-black/50 hover:bg-white/20 text-white/70 hover:text-white text-xs select-none cursor-pointer border border-white/10 transition-colors";

  return (
    <div
      className="absolute bottom-1 right-1 flex flex-col gap-0.5 z-10 pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex gap-0.5">
        <button className={btn} title="Zoom in"
          onPointerDown={() => startRepeat(zoomIn)} onPointerUp={stopRepeat} onPointerLeave={stopRepeat}>+</button>
        <button className={btn} title="Zoom out"
          onPointerDown={() => startRepeat(zoomOut)} onPointerUp={stopRepeat} onPointerLeave={stopRepeat}>−</button>
      </div>
      <div className="flex gap-0.5">
        <button className={btn} title="Rotate left"
          onPointerDown={() => startRepeat(rotateLeft)} onPointerUp={stopRepeat} onPointerLeave={stopRepeat}>◀</button>
        <button className={btn} title="Rotate right"
          onPointerDown={() => startRepeat(rotateRight)} onPointerUp={stopRepeat} onPointerLeave={stopRepeat}>▶</button>
      </div>
      <div className="flex gap-0.5">
        <button className={btn} title="Tilt up"
          onPointerDown={() => startRepeat(rotateUp)} onPointerUp={stopRepeat} onPointerLeave={stopRepeat}>▲</button>
        <button className={btn} title="Tilt down"
          onPointerDown={() => startRepeat(rotateDown)} onPointerUp={stopRepeat} onPointerLeave={stopRepeat}>▼</button>
      </div>
      <button className={btn + " w-full"} title="Reset camera" onClick={resetView}>⊙</button>
    </div>
  );
};
