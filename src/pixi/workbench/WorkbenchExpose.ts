/**
 * WorkbenchExpose — Camera calculation utilities for overview and focus modes.
 *
 * Provides:
 *  - fitAllWindows()    — camera state that fits every visible window
 *  - fitWindow()        — camera state that centres one window at 85% of screen
 *  - springCameraTo()  — RAF-driven spring animation updating useWorkbenchStore
 */

import type { CameraState, WindowState } from '@stores/useWorkbenchStore';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { springEase } from './springPhysics';

// ─── Camera target calculations ───────────────────────────────────────────────

interface Rect { x: number; y: number; w: number; h: number }

/** World-space bounding rect of a set of windows */
function boundingRect(wins: WindowState[]): Rect | null {
  if (wins.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of wins) {
    minX = Math.min(minX, w.x);
    minY = Math.min(minY, w.y);
    maxX = Math.max(maxX, w.x + w.width);
    maxY = Math.max(maxY, w.y + w.height);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Compute the camera state that fits ALL visible windows into the viewport
 * with the given padding fraction (default 5% on each side).
 */
export function fitAllWindows(
  windows: Record<string, WindowState>,
  screenW: number,
  screenH: number,
  padding = 0.05,
): CameraState {
  const visible = Object.values(windows).filter((w) => w.visible && !w.minimized);
  const rect = boundingRect(visible);

  if (!rect) {
    return { x: 0, y: 0, scale: 1 };
  }

  const padX = screenW * padding;
  const padY = screenH * padding;
  const availW = screenW - padX * 2;
  const availH = screenH - padY * 2;

  const scaleX = availW / rect.w;
  const scaleY = availH / rect.h;
  const scale = Math.min(scaleX, scaleY, 2); // cap at 2× zoom

  // Centre the bounding rect in screen
  const worldCentreX = rect.x + rect.w / 2;
  const worldCentreY = rect.y + rect.h / 2;
  const x = screenW / 2 - worldCentreX * scale;
  const y = screenH / 2 - worldCentreY * scale;

  return { x, y, scale };
}

/**
 * Compute the camera state that centres a single window and fits it
 * at targetFill fraction of the smaller screen dimension (default 85%).
 */
export function fitWindow(
  win: WindowState,
  screenW: number,
  screenH: number,
  targetFill = 0.85,
): CameraState {
  const scaleX = (screenW * targetFill) / win.width;
  const scaleY = (screenH * targetFill) / win.height;
  const scale = Math.min(scaleX, scaleY, 2);

  const worldCentreX = win.x + win.width / 2;
  const worldCentreY = win.y + win.height / 2;
  const x = screenW / 2 - worldCentreX * scale;
  const y = screenH / 2 - worldCentreY * scale;

  return { x, y, scale };
}

// ─── Spring camera animation ──────────────────────────────────────────────────

/** Handle returned by springCameraTo() — call cancel() to abort */
export interface CameraSpringHandle {
  cancel: () => void;
}

const CAMERA_SPRING_DURATION = 400; // ms

/**
 * Smoothly animate the camera from its current state to `target`.
 *
 * Uses springEase for a slight bounce landing. Updates useWorkbenchStore
 * directly via setCamera on each RAF frame.
 *
 * @returns a handle with cancel() to abort the animation early
 */
export function springCameraTo(
  target: CameraState,
  onDone?: () => void,
): CameraSpringHandle {
  let rafId = 0;
  let cancelled = false;

  // Capture start state at animation begin time
  const startCamera = { ...useWorkbenchStore.getState().camera };
  const startTime = performance.now();

  const tick = () => {
    if (cancelled) return;
    const elapsed = performance.now() - startTime;
    const t = Math.min(1, elapsed / CAMERA_SPRING_DURATION);
    // Slightly underdamped spring — subtle overshoot for camera focus feels
    const ease = springEase(t, 7, 9);

    const camera: CameraState = {
      x:     startCamera.x     + (target.x     - startCamera.x)     * ease,
      y:     startCamera.y     + (target.y     - startCamera.y)     * ease,
      scale: startCamera.scale + (target.scale - startCamera.scale) * ease,
    };

    useWorkbenchStore.getState().setCamera(camera);

    if (t < 1) {
      rafId = requestAnimationFrame(tick);
    } else {
      // Snap to exact target
      useWorkbenchStore.getState().setCamera(target);
      onDone?.();
    }
  };

  rafId = requestAnimationFrame(tick);

  return { cancel: () => { cancelled = true; cancelAnimationFrame(rafId); } };
}

// ─── Built-in workspace presets ───────────────────────────────────────────────

import type { WorkspaceSnapshot } from '@stores/useWorkbenchStore';

export const BUILTIN_WORKSPACES: Record<string, WorkspaceSnapshot> = {
  Compose: {
    camera: { x: 0, y: 0, scale: 1 },
    windows: {
      tracker:    { x: 40,  y: 40,  width: 900, height: 600, zIndex: 1, visible: true,  minimized: false },
      instrument: { x: 980, y: 40,  width: 700, height: 260, zIndex: 2, visible: true,  minimized: false },
      pianoroll:  { x: 980, y: 320, width: 700, height: 340, zIndex: 3, visible: false, minimized: false },
      arrangement:{ x: 40,  y: 680, width: 900, height: 300, zIndex: 4, visible: false, minimized: false },
      dj:         { x: 40,  y: 40,  width: 1100,height: 500, zIndex: 5, visible: false, minimized: false },
      vj:         { x: 800, y: 40,  width: 600, height: 400, zIndex: 6, visible: false, minimized: false },
    },
  },
  Mix: {
    camera: { x: 0, y: 0, scale: 1 },
    windows: {
      dj:         { x: 40,  y: 40,  width: 1100,height: 500, zIndex: 1, visible: true,  minimized: false },
      tracker:    { x: 40,  y: 580, width: 900, height: 400, zIndex: 2, visible: true,  minimized: false },
      instrument: { x: 980, y: 580, width: 700, height: 260, zIndex: 3, visible: false, minimized: false },
      pianoroll:  { x: 980, y: 300, width: 700, height: 340, zIndex: 4, visible: false, minimized: false },
      arrangement:{ x: 40,  y: 980, width: 900, height: 300, zIndex: 5, visible: false, minimized: false },
      vj:         { x: 800, y: 40,  width: 600, height: 400, zIndex: 6, visible: false, minimized: false },
    },
  },
  Full: {
    camera: { x: -20, y: -20, scale: 0.55 },
    windows: {
      tracker:    { x: 40,  y: 40,  width: 900, height: 600, zIndex: 1, visible: true, minimized: false },
      instrument: { x: 980, y: 40,  width: 700, height: 260, zIndex: 2, visible: true, minimized: false },
      pianoroll:  { x: 980, y: 320, width: 700, height: 340, zIndex: 3, visible: true, minimized: false },
      arrangement:{ x: 40,  y: 680, width: 900, height: 300, zIndex: 4, visible: true, minimized: false },
      dj:         { x: 980, y: 680, width: 700, height: 300, zIndex: 5, visible: true, minimized: false },
      vj:         { x: 40,  y: 1020,width: 600, height: 400, zIndex: 6, visible: false, minimized: false },
    },
  },
};
