/**
 * Factory motion (R2f): the damped spring every cartoony move rides on, and its reduced-motion twin.
 * Pure: the panel steps it with the frame delta; tests step it with fixed deltas.
 */
import type { Peaks } from '@/engine/uprough/r2Peaks';

/** Stiffness and damping of the spring: low damping overshoots (the pop), high damping settles. */
export interface SpringTuning { k: number; c: number }

export const POP: SpringTuning = { k: 180, c: 11 };
export const SETTLE: SpringTuning = { k: 120, c: 22 };

/** Length of the fade that replaces a spring when the user asks for reduced motion. */
export const REDUCED_FADE_SECONDS = 0.18;

export class Spring {
  value: number;
  velocity = 0;
  target: number;
  private from: number;
  private fadeLeft = 0;
  private readonly tuning: SpringTuning;
  private readonly reduced: boolean;

  constructor(value = 0, tuning: SpringTuning = POP, reduced = false) {
    this.tuning = tuning;
    this.reduced = reduced;
    this.value = value;
    this.target = value;
    this.from = value;
  }

  /** Move toward `to`. A reduced spring fades linearly instead of overshooting. */
  to(target: number): void {
    this.target = target;
    this.from = this.value;
    this.fadeLeft = REDUCED_FADE_SECONDS;
  }

  /** Jump with no motion. */
  snap(value: number): void {
    this.value = value; this.target = value; this.from = value; this.velocity = 0; this.fadeLeft = 0;
  }

  /** Give the spring a velocity kick (a bounce). A reduced spring ignores it. */
  kick(velocity: number): void {
    if (!this.reduced) this.velocity += velocity;
  }

  step(dt: number): number {
    if (this.reduced) {
      this.fadeLeft = Math.max(0, this.fadeLeft - dt);
      const f = 1 - this.fadeLeft / REDUCED_FADE_SECONDS;
      this.value = this.from + (this.target - this.from) * f;
      return this.value;
    }
    // Semi-implicit Euler in small slices, so a long frame cannot blow the spring up.
    let left = Math.min(dt, 0.1);
    while (left > 0) {
      const h = Math.min(left, 1 / 240);
      this.velocity += (this.tuning.k * (this.target - this.value) - this.tuning.c * this.velocity) * h;
      this.value += this.velocity * h;
      left -= h;
    }
    return this.value;
  }

  get settled(): boolean {
    return Math.abs(this.target - this.value) < 1e-3 && Math.abs(this.velocity) < 1e-3;
  }
}

/** True when the user asked the system for less motion. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * The pop-in of a thing that appeared `elapsed` seconds ago: scale overshoots then settles; opacity rises. With reduced
 * motion the scale stays 1 and only the opacity fades.
 */
export function popIn(elapsed: number, reduced: boolean): { scale: number; alpha: number } {
  if (elapsed <= 0) return { scale: reduced ? 1 : 0, alpha: 0 };
  if (reduced) return { scale: 1, alpha: Math.min(1, elapsed / REDUCED_FADE_SECONDS) };
  const decay = Math.exp(-7 * elapsed);
  return { scale: 1 - decay * Math.cos(16 * elapsed), alpha: Math.min(1, elapsed / 0.06) };
}

/** The drop of a stamp plate `elapsed` seconds after it lands: a damped bounce, 0 at rest (px of squash, 0..1). */
export function stampBounce(elapsed: number, reduced: boolean): number {
  if (reduced || elapsed <= 0) return 0;
  return Math.exp(-9 * elapsed) * Math.abs(Math.cos(18 * elapsed));
}

/**
 * The record press (R2f-32): the texture waveform grows into the master waveform. `t` is a Spring's value (0 = the texture
 * peaks, 1 = the master peaks; clamped, so a spring overshoot never draws past the master). Reduced motion returns the
 * master peaks at once. Buckets are interpolated in the int8 domain the wire carries; the ends return the inputs themselves.
 */
export function growHeights(from: Peaks, to: Peaks, t: number, reduced = prefersReducedMotion()): Peaks {
  if (reduced || t >= 1) return to;
  if (t <= 0) return from;
  const at = (a: readonly number[], n: number, i: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor((i / n) * a.length))]!);
  const lerp = (a: number, b: number): number => a + (b - a) * t;
  const n = to.n;
  return {
    n, len: to.len, scale: lerp(from.scale, to.scale),
    min: Array.from({ length: n }, (_, i) => lerp(at(from.min, n, i), to.min[i]!)),
    max: Array.from({ length: n }, (_, i) => lerp(at(from.max, n, i), to.max[i]!)),
  };
}

/** Pixels per second the conveyor ticks and its chips travel. */
export const CONVEYOR_SPEED = 60;
/** A chip is 40 px wide; it rides from the left edge to the right edge of the band. */
export const CHIP_WIDTH = 40;
/** The band is busy while an event arrived within this many milliseconds. */
export const BAND_IDLE_MS = 1000;

/** Left edge of a chip born at `bornAtSec`: 0 at birth, rising with `speed` (px/s), capped where its right edge meets `widthPx`. */
export function chipPosition(bornAtSec: number, nowSec: number, widthPx: number, speed: number): number {
  return Math.min(Math.max(0, widthPx - CHIP_WIDTH), Math.max(0, (nowSec - bornAtSec) * speed));
}

/** True while the last real event arrived less than `idleMs` ago: the band never moves on a bare `busy` flag (R2f-56b). */
export function bandBusy(nowMs: number, lastEventAtMs: number | undefined, idleMs = BAND_IDLE_MS): boolean {
  return lastEventAtMs !== undefined && nowMs - lastEventAtMs < idleMs;
}
