/**
 * WorkbenchTilt — CSS 3D perspective tilt for the workbench canvas.
 *
 * Applies a hardware-accelerated CSS perspective + rotateY/rotateX transform
 * to the Pixi <canvas> element, creating a "tilted desk" effect.
 * Cursor position drives ±3° parallax while tilted.
 *
 * Usage:
 *   startTilt()         — spring-animates to full tilt; keeps RAF running for parallax
 *   stopTilt(onDone?)   — spring-animates back to flat; calls onDone when canvas is restored
 */

import { springEase } from './springPhysics';

// ─── Constants ────────────────────────────────────────────────────────────────

const TILT_Y_DEG     = 20;    // Y-axis rotation (horizontal lean)
const TILT_X_DEG     = -8;    // X-axis rotation (vertical tilt)
const PARALLAX_DEG   = 3;     // max cursor-driven parallax per axis
const TILT_IN_MS     = 450;   // spring-in duration
const TILT_OUT_MS    = 380;   // spring-out duration
const PERSPECTIVE_PX = 1200;  // CSS perspective depth

// ─── Module-level state — one animation at a time ────────────────────────────

let rafId     = 0;
let parallaxX = 0;  // degrees, from cursor position
let parallaxY = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function onMouseMove(e: MouseEvent): void {
  parallaxX = ((e.clientX / window.innerWidth)  * 2 - 1) * PARALLAX_DEG;
  parallaxY = ((e.clientY / window.innerHeight) * 2 - 1) * PARALLAX_DEG;
}

function getCanvas(): HTMLCanvasElement | null {
  return document.querySelector('canvas');
}

/**
 * Write the CSS 3D transform onto the canvas element.
 * @param tiltProgress  0 = flat, 1 = full tilt (can slightly exceed 1 during overshoot)
 */
function applyTransform(canvas: HTMLCanvasElement, tiltProgress: number): void {
  if (tiltProgress < 0.002) {
    canvas.style.transform      = '';
    canvas.style.transformOrigin = '';
    return;
  }
  const rotY = (tiltProgress * TILT_Y_DEG + parallaxX).toFixed(2);
  const rotX = (tiltProgress * TILT_X_DEG + parallaxY).toFixed(2);
  canvas.style.transformOrigin = '50% 50%';
  canvas.style.transform =
    `perspective(${PERSPECTIVE_PX}px) rotateY(${rotY}deg) rotateX(${rotX}deg)`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Begin tilt animation.
 * After the spring settles the RAF loop keeps running so cursor parallax
 * stays live until stopTilt() is called.
 */
export function startTilt(): void {
  cancelAnimationFrame(rafId);
  document.addEventListener('mousemove', onMouseMove);

  const canvas = getCanvas();
  if (!canvas) return;

  const startTime = performance.now();

  const tick = () => {
    const elapsed = performance.now() - startTime;
    const t       = Math.min(1, elapsed / TILT_IN_MS);
    // Underdamped spring with slight overshoot (capped at 1.1×)
    const p = Math.min(1.1, springEase(t, 5, 9));
    applyTransform(canvas, p);
    // Keep looping after spring settles so parallax remains responsive
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
}

/**
 * Animate back to flat.
 * @param onDone  Optional callback fired when the canvas has fully returned to flat.
 */
export function stopTilt(onDone?: () => void): void {
  cancelAnimationFrame(rafId);
  document.removeEventListener('mousemove', onMouseMove);
  // Clear parallax so the return goes straight to center
  parallaxX = 0;
  parallaxY = 0;

  const canvas = getCanvas();
  if (!canvas) {
    onDone?.();
    return;
  }

  const startTime = performance.now();

  const tick = () => {
    const elapsed = performance.now() - startTime;
    const t       = Math.min(1, elapsed / TILT_OUT_MS);
    // Smoothstep — crisp return with no overshoot
    const ease = t * t * (3 - 2 * t);
    const p    = 1 - ease;
    applyTransform(canvas, p);

    if (t < 1) {
      rafId = requestAnimationFrame(tick);
    } else {
      applyTransform(canvas, 0);
      onDone?.();
    }
  };

  rafId = requestAnimationFrame(tick);
}
