/**
 * Scroll Performance Manager
 *
 * Suppresses @pixi/layout's Yoga layout traversal during rapid cursor scrolling.
 * The LayoutSystem runs a full recursive traversal of the entire scene tree on
 * every frame via prerender(). During arrow-key scrolling, no layout changes
 * occur — all rendering is imperative (MegaText + Graphics). Suppressing Yoga
 * during scroll recovers ~15-20ms per frame, preventing vsync frame doubling
 * (30fps → 60fps).
 *
 * After scrolling stops (150ms debounce), re-enables autoUpdate and triggers
 * one catch-up layout pass.
 */

import type { Application } from 'pixi.js';

let app: Application | null = null;
let scrollCount = 0;
let lastScrollTime = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let rapid = false;

const SCROLL_THRESHOLD = 2;    // events within window to trigger rapid mode
const DEBOUNCE_MS = 150;       // ms after last scroll to exit rapid mode

/** Register the PixiJS app — call once from PixiAppContent. */
export function setScrollPerfApp(pixiApp: Application): void {
  app = pixiApp;
}

/** Call on each cursor up/down movement. */
export function notifyScrollEvent(): void {
  const now = performance.now();

  if (now - lastScrollTime > DEBOUNCE_MS) {
    scrollCount = 0;
  }
  lastScrollTime = now;
  scrollCount++;

  if (scrollCount >= SCROLL_THRESHOLD && !rapid) {
    rapid = true;
    setLayoutAutoUpdate(false);
  }

  // Reset debounce timer
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(exitRapidScroll, DEBOUNCE_MS);
}

/** True while rapid scrolling is active — useTick callbacks can skip work. */
export function isRapidScrolling(): boolean {
  return rapid;
}

function exitRapidScroll(): void {
  rapid = false;
  scrollCount = 0;
  debounceTimer = null;
  setLayoutAutoUpdate(true);

  // Trigger one catch-up layout pass
  if (app?.stage) {
    const layoutSystem = (app.renderer as any).layout;
    if (layoutSystem?.update) {
      layoutSystem.update(app.stage);
    }
  }
}

function setLayoutAutoUpdate(enabled: boolean): void {
  if (!app) return;
  const layoutSystem = (app.renderer as any).layout;
  if (layoutSystem && 'autoUpdate' in layoutSystem) {
    layoutSystem.autoUpdate = enabled;
  }
}
