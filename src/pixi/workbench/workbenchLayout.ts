/**
 * workbenchLayout — Shared UI chrome height constants.
 *
 * Used by PixiNavBar, WorkbenchContainer, and WorkbenchExpose to compute the
 * actual visible workbench area (total screen height minus nav + status bars).
 */

/** NavBar height: row1 (45px) + row2/tab bar (34px) */
export const NAV_H = 45 + 34; // 79px

/** Bottom status bar height */
export const STATUS_BAR_H = 32; // px

/**
 * Total UI chrome that sits outside the workbench canvas.
 * workbenchHeight = window.innerHeight - WORKBENCH_CHROME_H
 */
export const WORKBENCH_CHROME_H = NAV_H + STATUS_BAR_H; // 130px
