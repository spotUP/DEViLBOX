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
