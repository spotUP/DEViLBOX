/**
 * wobblePhysics — Compiz-style wobbly window deformation for PixiWindow.
 *
 * Since we can't easily render a Container through a deformed mesh grid,
 * we approximate the wobble with skew + rotation based on drag velocity.
 * A spring-damper system smoothly returns the deformation to rest.
 *
 * The result is applied to the container's skew.x / skew.y properties.
 */

/** Spring stiffness — higher = snappier return to rest */
const STIFFNESS = 12;
/** Damping ratio — higher = less oscillation */
const DAMPING = 0.65;
/** How much drag velocity maps to skew (radians per world-unit/s) */
const VELOCITY_TO_SKEW = 0.00012;
/** Maximum skew in radians (~5 degrees) */
const MAX_SKEW = 0.09;
/** Threshold below which we snap to zero */
const EPSILON = 0.0002;

export interface WobbleState {
  /** Current skew X (radians) */
  skewX: number;
  /** Current skew Y (radians) */
  skewY: number;
  /** Skew velocity X */
  vSkewX: number;
  /** Skew velocity Y */
  vSkewY: number;
  /** Whether currently being dragged */
  dragging: boolean;
  /** Target skew during drag (from velocity) */
  targetSkewX: number;
  targetSkewY: number;
}

export function createWobbleState(): WobbleState {
  return {
    skewX: 0, skewY: 0,
    vSkewX: 0, vSkewY: 0,
    dragging: false,
    targetSkewX: 0, targetSkewY: 0,
  };
}

/**
 * Call during drag to set the target skew based on drag velocity.
 * @param state   Current wobble state
 * @param dragVx  Drag velocity X in world units/sec
 * @param dragVy  Drag velocity Y in world units/sec
 */
export function wobbleDragUpdate(state: WobbleState, dragVx: number, dragVy: number): void {
  state.dragging = true;
  // Map horizontal drag velocity to Y skew (lean in direction of movement)
  // and vertical drag velocity to X skew
  state.targetSkewX = clamp(-dragVy * VELOCITY_TO_SKEW, -MAX_SKEW, MAX_SKEW);
  state.targetSkewY = clamp(dragVx * VELOCITY_TO_SKEW, -MAX_SKEW, MAX_SKEW);
}

/**
 * Call when drag ends — spring will return to rest.
 */
export function wobbleDragEnd(state: WobbleState): void {
  state.dragging = false;
  state.targetSkewX = 0;
  state.targetSkewY = 0;
}

/**
 * Step the spring simulation forward by dt seconds.
 * @returns true if still animating (not at rest)
 */
export function wobbleStep(state: WobbleState, dt: number): boolean {
  // Clamp dt to prevent explosion on tab-switch
  dt = Math.min(dt, 0.05);

  const targetX = state.dragging ? state.targetSkewX : 0;
  const targetY = state.dragging ? state.targetSkewY : 0;

  // Spring force: F = -k * displacement - d * velocity
  const dispX = state.skewX - targetX;
  const dispY = state.skewY - targetY;

  const forceX = -STIFFNESS * dispX - DAMPING * state.vSkewX * 2 * Math.sqrt(STIFFNESS);
  const forceY = -STIFFNESS * dispY - DAMPING * state.vSkewY * 2 * Math.sqrt(STIFFNESS);

  // Semi-implicit Euler integration
  state.vSkewX += forceX * dt;
  state.vSkewY += forceY * dt;
  state.skewX += state.vSkewX * dt;
  state.skewY += state.vSkewY * dt;

  // Check if at rest
  const energy = Math.abs(state.skewX - targetX) + Math.abs(state.skewY - targetY)
    + Math.abs(state.vSkewX) + Math.abs(state.vSkewY);

  if (energy < EPSILON && !state.dragging) {
    state.skewX = 0;
    state.skewY = 0;
    state.vSkewX = 0;
    state.vSkewY = 0;
    return false;
  }

  return true;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
