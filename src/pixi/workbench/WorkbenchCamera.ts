/**
 * WorkbenchCamera — Camera math for the infinite workbench.
 *
 * Pure utility module (no React, no Pixi imports) for coordinate
 * conversions and applying camera state to a Pixi container.
 */

import type { Container } from 'pixi.js';
import type { CameraState } from '@stores/useWorkbenchStore';

/**
 * Apply camera state to a Pixi container by setting its position and scale.
 * The container IS the "world" — its transform represents the camera offset.
 */
export function applyTransform(container: Container, camera: CameraState): void {
  container.x = camera.x;
  container.y = camera.y;
  container.scale.set(camera.scale);
}

/**
 * Convert screen coordinates → world coordinates.
 * (screen = pixel on canvas; world = logical workbench units)
 */
export function screenToWorld(sx: number, sy: number, camera: CameraState): { x: number; y: number } {
  return {
    x: (sx - camera.x) / camera.scale,
    y: (sy - camera.y) / camera.scale,
  };
}

/**
 * Convert world coordinates → screen coordinates.
 */
export function worldToScreen(wx: number, wy: number, camera: CameraState): { x: number; y: number } {
  return {
    x: wx * camera.scale + camera.x,
    y: wy * camera.scale + camera.y,
  };
}

/**
 * Clamp camera to prevent zooming too far out/in or panning too far.
 */
export function clampCamera(camera: CameraState, screenW: number, screenH: number): CameraState {
  const scale = Math.max(0.15, Math.min(4, camera.scale));
  // Allow generous panning — the workbench is "infinite"
  const padding = 2000 * scale;
  const x = Math.max(-padding, Math.min(screenW + padding, camera.x));
  const y = Math.max(-padding, Math.min(screenH + padding, camera.y));
  return { x, y, scale };
}
