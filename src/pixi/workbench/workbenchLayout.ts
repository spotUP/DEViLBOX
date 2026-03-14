/**
 * workbenchLayout — Shared UI chrome height constants.
 *
 * Used by PixiNavBar, WorkbenchContainer, and WorkbenchExpose to compute the
 * actual visible workbench area (total screen height minus nav + status bars).
 */

/** NavBar height: row1 (45px) + row2/tab bar (34px) — legacy workbench mode */
export const NAV_H = 45 + 34; // 79px

/** Bottom status bar height — legacy workbench mode */
export const STATUS_BAR_H = 32; // px

/**
 * Total UI chrome that sits outside the workbench canvas.
 * workbenchHeight = window.innerHeight - WORKBENCH_CHROME_H
 */
export const WORKBENCH_CHROME_H = NAV_H + STATUS_BAR_H; // 130px

// ─── Modern shell layout constants ───────────────────────────────────────────

/** Single-row nav bar + project tab bar row */
export const MODERN_NAV_H = 76; // 52px main nav + 24px project tab bar

/** Slim status bar */
export const MODERN_STATUS_BAR_H = 28;

/** Bottom dock defaults */
export const MODERN_DOCK_DEFAULT_H = 220;
export const MODERN_DOCK_TAB_H = 32;
export const MODERN_DOCK_MIN_H = 0;
export const MODERN_DOCK_MAX_H = 360;

/** Modern total chrome (nav + status, excluding dock) */
export const MODERN_CHROME_H = MODERN_NAV_H + MODERN_STATUS_BAR_H; // 80px

// ─── Shared window constants (extracted from PixiWindow to break circular imports) ─

/** PixiWindow title bar height */
export const TITLE_H = 28;
