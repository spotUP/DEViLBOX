/**
 * Value -> transform mapping for the controls on the DJ 3D models (Vestax
 * mixer, SL-1200 deck). One place, so the mesh and the drag agree.
 *
 * Invariants (camera looks down from the front: screen up = -Z, right = +X):
 *  - Knob: higher value = clockwise seen from above; mid-range = pointer at 12 o'clock.
 *  - Fader: `travel` is the signed distance along its axis from min to max
 *    (negative for an up-fader, whose max is toward the back, -Z).
 *  - Drag: up / right raises the value.
 */

/** Total knob sweep, 270 degrees. */
export const KNOB_SWEEP = Math.PI * 1.5;

function normalize(value: number, min: number, max: number): number {
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/** Rotation about +Y (up). Positive Y rotation is counter-clockwise seen from above, hence the sign. */
export function knobAngleY(value: number, min: number, max: number): number {
  return (0.5 - normalize(value, min, max)) * KNOB_SWEEP;
}

export interface FaderTravel {
  min: number;
  max: number;
  /** Value the untouched model shows (where the cap sits in the mesh data). */
  restValue: number;
  /** Signed distance along the axis from min to max, model units. */
  travel: number;
}

/** Offset of the fader cap from its rest position, along its axis. */
export function faderOffset(value: number, f: FaderTravel): number {
  return (normalize(value, f.min, f.max) - normalize(f.restValue, f.min, f.max)) * f.travel;
}

/** New value after dragging `pixels` (positive = up or right) from `startValue`. */
export function dragToValue(startValue: number, pixels: number, min: number, max: number, pixelsFullRange = 150): number {
  return Math.max(min, Math.min(max, startValue + (pixels / pixelsFullRange) * (max - min)));
}

/**
 * Hit slop for the small 3D controls. A Vestax knob is about 14 px across in
 * the default DJ 3D camera, so a press that misses the mesh still picks the
 * control whose centre is within this many pixels.
 */
export const CONTROL_HIT_RADIUS_PX = 24;

export interface ScreenPoint {
  name: string;
  x: number;
  y: number;
}

/** Name of the point nearest (x, y) within `radiusPx`, or null. */
export function pickNearestScreenPoint(points: readonly ScreenPoint[], x: number, y: number, radiusPx = CONTROL_HIT_RADIUS_PX): string | null {
  let best: string | null = null;
  let bestD2 = radiusPx * radiusPx;
  for (const p of points) {
    const dx = p.x - x;
    const dy = p.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) { bestD2 = d2; best = p.name; }
  }
  return best;
}
