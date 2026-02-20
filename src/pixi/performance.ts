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
const IDLE_TIMEOUT_MS = 2000;

/**
 * Attach an FPS limiter to a PixiJS app.
 * Drops to IDLE_FPS after IDLE_TIMEOUT_MS of no user interaction.
 * Returns a cleanup function.
 */
export function attachFPSLimiter(app: Application): () => void {
  if (!app?.ticker) return () => {};

  let lastActivityMs = performance.now();
  let isIdle = false;

  const markActive = () => {
    lastActivityMs = performance.now();
    if (isIdle) {
      isIdle = false;
      app.ticker.maxFPS = ACTIVE_FPS;
    }
  };

  const checkIdle = () => {
    if (!isIdle && performance.now() - lastActivityMs > IDLE_TIMEOUT_MS) {
      isIdle = true;
      app.ticker.maxFPS = IDLE_FPS;
    }
  };

  // Listen for user activity
  const events = ['pointerdown', 'pointermove', 'wheel', 'keydown'] as const;
  for (const evt of events) {
    window.addEventListener(evt, markActive, { passive: true });
  }

  // Check periodically
  const intervalId = setInterval(checkIdle, 500);

  // Set initial FPS
  app.ticker.maxFPS = ACTIVE_FPS;

  return () => {
    for (const evt of events) {
      window.removeEventListener(evt, markActive);
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
