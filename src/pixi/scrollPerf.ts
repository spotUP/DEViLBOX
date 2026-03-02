/**
 * Scroll Performance Manager
 *
 * Diagnoses and fixes the 30fps ceiling during keyboard-held scrolling.
 *
 * KEY FINDING: @pixi/layout's Yoga prerender is NOT the bottleneck (< 0.5ms).
 * The issue is specific to held keyboard keys — trackpad and playback are fine.
 */

import type { Application } from 'pixi.js';

let app: Application | null = null;

// ── Keyboard repeat rate diagnosis ──────────────────────────────────────────
// Measure the actual interval between keydown repeat events
let _keyTimes: number[] = [];
let _lastKeyTime = 0;
let _diagPrinted = false;

/** Call from the keydown handler to measure keyboard repeat rate. */
export function diagKeyRepeatRate(): void {
  const now = performance.now();
  if (_lastKeyTime > 0) {
    const dt = now - _lastKeyTime;
    if (dt < 200) { // only count repeat events (< 200ms apart)
      _keyTimes.push(dt);
      if (_keyTimes.length >= 30 && !_diagPrinted) {
        _diagPrinted = true;
        const avg = _keyTimes.reduce((a, b) => a + b, 0) / _keyTimes.length;
        const min = Math.min(..._keyTimes);
        const max = Math.max(..._keyTimes);
        console.log(`[scrollPerf] KEY REPEAT RATE: avg=${avg.toFixed(1)}ms min=${min.toFixed(1)}ms max=${max.toFixed(1)}ms (${(1000 / avg).toFixed(0)} Hz)`);
      }
    } else {
      // Reset for new hold sequence
      _keyTimes = [];
      _diagPrinted = false;
    }
  }
  _lastKeyTime = now;
}

// ── Frame timing diagnosis ──────────────────────────────────────────────────
// Measure how long the entire frame takes including keydown processing + render

let _frameStart = 0;
let _frameDurations: number[] = [];
let _frameDiagPrinted = false;

/** Call at the START of the keydown handler (before any work). */
export function diagFrameStart(): void {
  _frameStart = performance.now();
}

/** Call at the END of the keydown handler (after all work). */
export function diagFrameEnd(): void {
  if (_frameStart > 0) {
    const dt = performance.now() - _frameStart;
    _frameDurations.push(dt);
    if (_frameDurations.length >= 30 && !_frameDiagPrinted) {
      _frameDiagPrinted = true;
      const avg = _frameDurations.reduce((a, b) => a + b, 0) / _frameDurations.length;
      const max = Math.max(..._frameDurations);
      console.log(`[scrollPerf] KEYDOWN HANDLER TIME: avg=${avg.toFixed(2)}ms max=${max.toFixed(2)}ms`);
      _frameDurations = [];
      _frameDiagPrinted = false;
    }
  }
}

/** Register the PixiJS app — call once from PixiAppContent. */
export function setScrollPerfApp(pixiApp: Application): void {
  app = pixiApp;
}

/** True while rapid scrolling is active — useTick callbacks can skip work. */
export function isRapidScrolling(): boolean {
  return false; // Disabled — Yoga suppression proved ineffective
}

// Keep these exports so existing call sites don't break
export function notifyScrollEvent(): void {
  // no-op — Yoga suppression proved ineffective
}
