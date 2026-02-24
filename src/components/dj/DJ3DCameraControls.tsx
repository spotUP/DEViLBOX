/**
 * DJ3DCameraControls — On-screen zoom/rotate/reset buttons for 3D DJ views.
 *
 * Replaces scroll-wheel zoom (which conflicts with vinyl scratching) with
 * click-and-drag or click-to-step buttons overlaid on each 3D canvas.
 *
 * Usage:
 *   // Inside the Canvas:
 *   <CameraController ref={controllerRef} target={[0,0,0]} minDist={0.1} maxDist={2} />
 *
 *   // Outside the Canvas (HTML overlay):
 *   <CameraControlOverlay controllerRef={controllerRef} />
 */

import React, { useRef, useImperativeHandle, forwardRef, useCallback, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CameraControllerHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  rotateLeft: () => void;
  rotateRight: () => void;
  rotateUp: () => void;
  rotateDown: () => void;
  resetView: () => void;
}

interface CameraControllerProps {
  target?: [number, number, number];
  minDistance?: number;
  maxDistance?: number;
  minPolarAngle?: number;
  maxPolarAngle?: number;
  enableDamping?: boolean;
  /** Allow right-click drag to rotate (default true) */
  enableMouseRotate?: boolean;
}

// ── R3F Camera Controller (goes inside Canvas) ──────────────────────────────

/**
 * Spherical-coordinate camera controller without scroll-wheel zoom.
 * Supports right-click drag rotation and imperative zoom/rotate via ref.
 */
export const CameraController = forwardRef<CameraControllerHandle, CameraControllerProps>(
  function CameraController(
    {
      target = [0, 0, 0],
      minDistance = 0.1,
      maxDistance = 2.0,
      minPolarAngle = Math.PI * 0.05,
      maxPolarAngle = Math.PI * 0.45,
      enableDamping = true,
      enableMouseRotate = true,
    },
    ref
  ) {
    const { camera, gl } = useThree();
    const targetVec = useRef(new THREE.Vector3(...target));

    // Spherical coordinates (radius, polar, azimuthal)
    const spherical = useRef(new THREE.Spherical());
    const sphericalTarget = useRef(new THREE.Spherical());
    const initialSpherical = useRef(new THREE.Spherical());
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const dragSphericalStart = useRef(new THREE.Spherical());

    // Initialize spherical from current camera position
    useEffect(() => {
      const offset = new THREE.Vector3().subVectors(camera.position, targetVec.current);
      spherical.current.setFromVector3(offset);
      sphericalTarget.current.copy(spherical.current);
      initialSpherical.current.copy(spherical.current);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Clamp helper
    const clampSpherical = useCallback(
      (s: THREE.Spherical) => {
        s.radius = Math.max(minDistance, Math.min(maxDistance, s.radius));
        s.phi = Math.max(minPolarAngle, Math.min(maxPolarAngle, s.phi));
      },
      [minDistance, maxDistance, minPolarAngle, maxPolarAngle]
    );

    // Expose imperative controls
    const ZOOM_STEP = 0.06;
    const ROTATE_STEP = Math.PI / 24; // 7.5°

    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => {
          sphericalTarget.current.radius -= ZOOM_STEP;
          clampSpherical(sphericalTarget.current);
        },
        zoomOut: () => {
          sphericalTarget.current.radius += ZOOM_STEP;
          clampSpherical(sphericalTarget.current);
        },
        rotateLeft: () => {
          sphericalTarget.current.theta -= ROTATE_STEP;
        },
        rotateRight: () => {
          sphericalTarget.current.theta += ROTATE_STEP;
        },
        rotateUp: () => {
          sphericalTarget.current.phi -= ROTATE_STEP;
          clampSpherical(sphericalTarget.current);
        },
        rotateDown: () => {
          sphericalTarget.current.phi += ROTATE_STEP;
          clampSpherical(sphericalTarget.current);
        },
        resetView: () => {
          sphericalTarget.current.copy(initialSpherical.current);
        },
      }),
      [clampSpherical]
    );

    // Right-click drag rotation
    useEffect(() => {
      if (!enableMouseRotate) return;
      const canvas = gl.domElement;

      const onContextMenu = (e: MouseEvent) => e.preventDefault();

      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 2) return; // right-click only
        isDragging.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY };
        dragSphericalStart.current.copy(sphericalTarget.current);
        canvas.setPointerCapture(e.pointerId);
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!isDragging.current) return;
        const dx = (e.clientX - dragStart.current.x) / canvas.clientWidth;
        const dy = (e.clientY - dragStart.current.y) / canvas.clientHeight;
        sphericalTarget.current.theta = dragSphericalStart.current.theta - dx * Math.PI;
        sphericalTarget.current.phi = dragSphericalStart.current.phi + dy * Math.PI * 0.5;
        clampSpherical(sphericalTarget.current);
      };

      const onPointerUp = (e: PointerEvent) => {
        if (e.button !== 2) return;
        isDragging.current = false;
        canvas.releasePointerCapture(e.pointerId);
      };

      canvas.addEventListener('contextmenu', onContextMenu);
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      return () => {
        canvas.removeEventListener('contextmenu', onContextMenu);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
      };
    }, [gl, enableMouseRotate, clampSpherical]);

    const _offset = useRef(new THREE.Vector3());

    // Per-frame: lerp spherical → camera position
    useFrame(() => {
      const s = spherical.current;
      const st = sphericalTarget.current;
      const factor = enableDamping ? 0.12 : 1;
      s.radius += (st.radius - s.radius) * factor;
      s.phi += (st.phi - s.phi) * factor;
      s.theta += (st.theta - s.theta) * factor;

      _offset.current.setFromSpherical(s);
      camera.position.copy(targetVec.current).add(_offset.current);
      camera.lookAt(targetVec.current);
    });

    return null;
  }
);

// ── HTML Overlay (goes outside Canvas) ──────────────────────────────────────

interface CameraControlOverlayProps {
  controllerRef: React.RefObject<CameraControllerHandle | null>;
}

/** Compact zoom/rotate buttons overlaid in the corner of a 3D view */
export const CameraControlOverlay: React.FC<CameraControlOverlayProps> = ({ controllerRef }) => {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Force re-render once controller is available
  const [, setMounted] = React.useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 100); return () => clearTimeout(t); }, []);

  const startRepeat = useCallback((action: () => void) => {
    action(); // immediate first
    intervalRef.current = setInterval(action, 80);
  }, []);

  const stopRepeat = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stopRepeat(), [stopRepeat]);

  const btn = "w-6 h-6 flex items-center justify-center rounded bg-black/50 hover:bg-white/20 text-white/70 hover:text-white text-xs select-none cursor-pointer border border-white/10 transition-colors";

  const call = (method: keyof CameraControllerHandle) => () => controllerRef.current?.[method]();

  return (
    <div
      className="absolute bottom-1 right-1 flex flex-col gap-0.5 z-10 pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Zoom buttons */}
      <div className="flex gap-0.5">
        <button
          className={btn}
          title="Zoom in"
          onPointerDown={() => startRepeat(call('zoomIn'))}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
        >
          +
        </button>
        <button
          className={btn}
          title="Zoom out"
          onPointerDown={() => startRepeat(call('zoomOut'))}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
        >
          −
        </button>
      </div>
      {/* Rotate buttons */}
      <div className="flex gap-0.5">
        <button
          className={btn}
          title="Rotate left"
          onPointerDown={() => startRepeat(call('rotateLeft'))}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
        >
          ◀
        </button>
        <button
          className={btn}
          title="Rotate right"
          onPointerDown={() => startRepeat(call('rotateRight'))}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
        >
          ▶
        </button>
      </div>
      <div className="flex gap-0.5">
        <button
          className={btn}
          title="Tilt up"
          onPointerDown={() => startRepeat(call('rotateUp'))}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
        >
          ▲
        </button>
        <button
          className={btn}
          title="Tilt down"
          onPointerDown={() => startRepeat(call('rotateDown'))}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
        >
          ▼
        </button>
      </div>
      {/* Reset */}
      <button
        className={btn + " w-full"}
        title="Reset camera"
        onClick={call('resetView')}
      >
        ⊙
      </button>
    </div>
  );
};
