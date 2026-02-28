/**
 * springPhysics — Spring animation utilities for the workbench.
 *
 * Implements an underdamped spring model for bouncy UI animations.
 * All functions are pure with no side effects.
 */

// ─── Spring Easing ────────────────────────────────────────────────────────────

/**
 * Underdamped spring easing function.
 *
 * Formula: f(t) = 1 - e^(-damping * t) * cos(freq * t)
 *
 * @param t       Normalized time [0, 1] mapped over total animation duration
 * @param damping Exponential decay rate (higher = less bounce, settles faster)
 * @param freq    Oscillation frequency in radians (higher = faster wobble)
 * @returns       Position value — exceeds 1.0 during overshoot, settles at 1.0
 *
 * Good presets:
 *   - Snappy (slight bounce): damping=8,  freq=12 → ~1.04 overshoot
 *   - Default (nice bounce):  damping=6,  freq=10 → ~1.08 overshoot
 *   - Wobbly (lots of bounce):damping=3,  freq=12 → ~1.25 overshoot
 */
export function springEase(t: number, damping = 6, freq = 10): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.exp(-damping * t) * Math.cos(freq * t);
}

/**
 * Reverse spring — goes from 1 → 0 (for close/hide animation).
 */
export function springEaseOut(t: number, damping = 8, freq = 6): number {
  return 1 - springEase(1 - t, damping, freq);
}

// ─── Squash & Stretch ─────────────────────────────────────────────────────────

/**
 * Squash-and-stretch scale values for a landing window.
 *
 * Near progress=0.85 (just past peak overshoot), compress scaleY and
 * widen scaleX briefly, then return to 1.0.
 *
 * @param progress  Spring progress [0, 1]
 * @returns { scaleX, scaleY } — multiply onto window scale
 */
export function squashStretch(progress: number): { scaleX: number; scaleY: number } {
  if (progress < 0.75 || progress >= 1) {
    return { scaleX: 1, scaleY: 1 };
  }
  // Landing zone: 0.75 → 1.0
  const landing = (progress - 0.75) / 0.25; // 0→1 within landing zone
  const squashAmount = Math.sin(landing * Math.PI) * 0.06; // peaks at 0.06 at center
  return {
    scaleX: 1 + squashAmount * 0.4,
    scaleY: 1 - squashAmount,
  };
}

// ─── Velocity Tracker ─────────────────────────────────────────────────────────

/** Circular buffer of recent pointer samples for velocity estimation */
interface VelocitySample {
  x: number;
  y: number;
  t: number;
}

const SAMPLE_COUNT = 6;
const MAX_VELOCITY = 3000; // world units per second

export class VelocityTracker {
  private samples: VelocitySample[] = [];

  push(x: number, y: number): void {
    this.samples.push({ x, y, t: performance.now() });
    if (this.samples.length > SAMPLE_COUNT) {
      this.samples.shift();
    }
  }

  /** Compute velocity in world units/second over the last few samples */
  getVelocity(cameraScale: number): { vx: number; vy: number } {
    if (this.samples.length < 2) return { vx: 0, vy: 0 };

    // Use oldest and newest sample for stable estimate
    const oldest = this.samples[0];
    const newest = this.samples[this.samples.length - 1];
    const dt = (newest.t - oldest.t) / 1000; // seconds

    if (dt < 0.005) return { vx: 0, vy: 0 }; // Too fast, ignore

    // Convert from screen delta to world delta
    const vx = ((newest.x - oldest.x) / cameraScale) / dt;
    const vy = ((newest.y - oldest.y) / cameraScale) / dt;

    // Clamp
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > MAX_VELOCITY) {
      const factor = MAX_VELOCITY / speed;
      return { vx: vx * factor, vy: vy * factor };
    }

    return { vx, vy };
  }

  reset(): void {
    this.samples = [];
  }
}

// ─── Momentum Simulation ──────────────────────────────────────────────────────

/** Friction coefficient per second (0.85 = loses 15% velocity each second) */
const FRICTION = 0.88;
const VELOCITY_THRESHOLD = 60; // world units/sec below which momentum stops

export interface MomentumState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  prevTime: number;
}

/**
 * Advance momentum state by one frame.
 * @returns updated state + `done` flag
 */
export function stepMomentum(
  state: MomentumState,
  now: number,
): { next: MomentumState; done: boolean } {
  const dt = Math.min((now - state.prevTime) / 1000, 0.05); // cap at 50ms
  const friction = Math.pow(FRICTION, dt * 60); // frame-rate independent

  const vx = state.vx * friction;
  const vy = state.vy * friction;
  const x = state.x + vx * dt;
  const y = state.y + vy * dt;

  const speed = Math.sqrt(vx * vx + vy * vy);
  const done = speed < VELOCITY_THRESHOLD;

  return { next: { x, y, vx, vy, prevTime: now }, done };
}

// ─── Edge Bounce ─────────────────────────────────────────────────────────────

/** Fraction of velocity retained after bounce */
const BOUNCE_RESTITUTION = 0.45;
const EDGE_PADDING = 60; // world units of overlap before bounce triggers

/**
 * Check if the window has gone past the viewport edges and reflect velocity.
 * Returns updated velocity components + a squash direction if bounced.
 *
 * @param wx       Window world x
 * @param wy       Window world y
 * @param ww       Window world width
 * @param wh       Window world height
 * @param vx       Current x velocity
 * @param vy       Current y velocity
 * @param viewL    Left viewport edge in world units
 * @param viewT    Top viewport edge in world units
 * @param viewR    Right viewport edge in world units
 * @param viewB    Bottom viewport edge in world units
 */
export function applyEdgeBounce(
  wx: number, wy: number, ww: number, wh: number,
  vx: number, vy: number,
  viewL: number, viewT: number, viewR: number, viewB: number,
): { vx: number; vy: number; bounceX: boolean; bounceY: boolean } {
  let newVx = vx;
  let newVy = vy;
  let bounceX = false;
  let bounceY = false;

  // Left edge
  if (wx < viewL - EDGE_PADDING && vx < 0) {
    newVx = Math.abs(vx) * BOUNCE_RESTITUTION;
    bounceX = true;
  }
  // Right edge (use center of window for right edge check)
  if (wx + ww > viewR + EDGE_PADDING && vx > 0) {
    newVx = -Math.abs(vx) * BOUNCE_RESTITUTION;
    bounceX = true;
  }
  // Top edge
  if (wy < viewT - EDGE_PADDING && vy < 0) {
    newVy = Math.abs(vy) * BOUNCE_RESTITUTION;
    bounceY = true;
  }
  // Bottom edge
  if (wy + wh > viewB + EDGE_PADDING && vy > 0) {
    newVy = -Math.abs(vy) * BOUNCE_RESTITUTION;
    bounceY = true;
  }

  return { vx: newVx, vy: newVy, bounceX, bounceY };
}
