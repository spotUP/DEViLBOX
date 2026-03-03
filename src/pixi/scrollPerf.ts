/**
 * Scroll Performance Manager
 *
 * Diagnoses and fixes the 30fps ceiling during keyboard-held scrolling.
 *
 * KEY FINDING: @pixi/layout's Yoga prerender is NOT the bottleneck (< 0.5ms).
 * The issue is specific to held keyboard keys — trackpad and playback are fine.
 */

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

/** Register the PixiJS app — call once from PixiAppContent. */
export function setScrollPerfApp(_pixiApp: unknown): void {
  // Reserved for future use
}

/** True while rapid scrolling is active — useTick callbacks can skip work. */
export function isRapidScrolling(): boolean {
  return false; // Disabled — Yoga suppression proved ineffective
}

// Keep these exports so existing call sites don't break
export function notifyScrollEvent(): void {
  // no-op — Yoga suppression proved ineffective
}
