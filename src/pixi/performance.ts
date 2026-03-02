/**
 * PixiJS Performance Utilities
 *
 * - FPS limiter for idle state (saves power when nothing changes)
 * - Object pool for recycling Container instances in virtual lists
 * - Dirty-flag rendering helper
 */

import type { Application } from 'pixi.js';

// ─── FPS Limiter ────────────────────────────────────────────────────────────

const ACTIVE_FPS = 60;
const IDLE_FPS = 10;
const IDLE_TIMEOUT_MS = 1000; // drop to idle 1 second after last activity

// ─── Rolling FPS Monitor ───────────────────────────────────────────────────

const ROLLING_WINDOW = 30;
const _frameTimes: number[] = [];
let   _lastFrameMs = 0;

/** Record a frame tick — called from the Pixi ticker inside attachFPSLimiter */
function _trackFrame(nowMs: number): void {
  if (_lastFrameMs > 0) {
    _frameTimes.push(nowMs - _lastFrameMs);
    if (_frameTimes.length > ROLLING_WINDOW) _frameTimes.shift();
  }
  _lastFrameMs = nowMs;
}

/** 30-frame rolling average FPS. Returns 60 until enough frames have been tracked. */
export function getAverageFps(): number {
  if (_frameTimes.length < 5) return 60;
  const avgMs = _frameTimes.reduce((a, b) => a + b, 0) / _frameTimes.length;
  return avgMs > 0 ? 1000 / avgMs : 60;
}

/** Optional callback to check if audio is playing — set via setIsPlayingFn() */
let _isPlayingFn: (() => boolean) | null = null;

/** Register a callback that reports whether audio playback is active.
 *  Called from PixiAppContent after stores are available. */
export function setIsPlayingFn(fn: () => boolean): void {
  _isPlayingFn = fn;
}

/**
 * Attach an FPS limiter to a PixiJS app.
 * Drops to IDLE_FPS after IDLE_TIMEOUT_MS of no user interaction.
 * Returns a cleanup function.
 */
export function attachFPSLimiter(app: Application): () => void {
  if (!app?.ticker) return () => {};

  // Reset FPS tracking state — handles HMR hot-reload correctly
  _frameTimes.length = 0;
  _lastFrameMs = 0;

  // Track per-frame timing for FPS monitor
  const frameTracker = () => _trackFrame(performance.now());
  app.ticker.add(frameTracker);

  let lastActivityMs = performance.now();
  let isIdle = false;

  let _disposed = false;

  const markActive = () => {
    if (_disposed || !app.ticker) return;
    lastActivityMs = performance.now();
    if (isIdle) {
      isIdle = false;
      app.ticker.maxFPS = ACTIVE_FPS;
    }
  };

  const checkIdle = () => {
    if (_disposed || !app.ticker) return;
    // Treat audio playback as activity — prevents Pixi ticker dropping to
    // idle FPS while the pattern editor is scrolling and VU meters animate.
    if (_isPlayingFn && _isPlayingFn()) {
      markActive();
      return;
    }

    if (!isIdle && performance.now() - lastActivityMs > IDLE_TIMEOUT_MS) {
      isIdle = true;
      app.ticker.maxFPS = IDLE_FPS;
      // Force one final render so the last active frame persists on-screen
      // (prevents black screen when FPS drops to idle with preserveDrawingBuffer)
      try { app.renderer.render(app.stage); } catch { /* app may be destroyed */ }
    }
  };

  // Listen for user activity — use capture phase so stopPropagation() in
  // keyboard handlers doesn't prevent us from seeing keydown events.
  const events = ['pointerdown', 'pointermove', 'wheel', 'keydown'] as const;
  for (const evt of events) {
    window.addEventListener(evt, markActive, { passive: true, capture: true });
  }

  // Check periodically
  const intervalId = setInterval(checkIdle, 500);

  // Set initial FPS
  app.ticker.maxFPS = ACTIVE_FPS;

  return () => {
    _disposed = true;
    try { app.ticker?.remove(frameTracker); } catch { /* app may be destroyed */ }
    for (const evt of events) {
      window.removeEventListener(evt, markActive, { capture: true });
    }
    clearInterval(intervalId);
  };
}

// ─── Object Pool ────────────────────────────────────────────────────────────

/**
 * Simple object pool for recycling objects in virtual scrolling lists.
 * Avoids GC pressure from frequent create/destroy cycles.
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;

  constructor(factory: () => T, reset: (obj: T) => void, initialSize = 0) {
    this.factory = factory;
    this.reset = reset;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  release(obj: T): void {
    this.reset(obj);
    this.pool.push(obj);
  }

  get size(): number {
    return this.pool.length;
  }
}

// ─── Dirty Flag Helper ──────────────────────────────────────────────────────

/**
 * Creates a dirty-flag tracker for a PixiJS Graphics draw callback.
 * Only redraws when deps change (shallow comparison).
 */
export function createDirtyTracker<T extends unknown[]>(): {
  isDirty: (...deps: T) => boolean;
} {
  let prevDeps: T | null = null;

  return {
    isDirty: (...deps: T): boolean => {
      if (prevDeps === null) {
        prevDeps = deps;
        return true;
      }
      for (let i = 0; i < deps.length; i++) {
        if (deps[i] !== prevDeps[i]) {
          prevDeps = deps;
          return true;
        }
      }
      return false;
    },
  };
}
