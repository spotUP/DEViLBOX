/**
 * windowSnap — Edge-to-edge snap detection for the workbench.
 *
 * While dragging a window, tests its 4 edges against:
 *   1. All 4 edges of every other visible, non-minimized window
 *   2. The grid (multiples of gridSize world units)
 *
 * Returns the snapped position and guide lines to render.
 *
 * All coordinates are in world space.
 */

import type { WindowState } from '@stores/useWorkbenchStore';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single snap guide line (world space) */
export interface SnapLine {
  /** Axis the line runs along */
  axis: 'x' | 'y';
  /** Fixed coordinate (x-value for vertical line, y-value for horizontal) */
  value: number;
  /** Start of the line along the other axis */
  from: number;
  /** End of the line along the other axis */
  to: number;
}

export interface SnapResult {
  /** Snapped window x (world units) */
  x: number;
  /** Snapped window y (world units) */
  y: number;
  /** Whether any snap is active */
  snapped: boolean;
  /** Guide lines to draw */
  lines: SnapLine[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GUIDE_EXTEND = 600; // how far guide lines extend past the snapped edge (world units)

// ─── Main snap function ───────────────────────────────────────────────────────

/**
 * Compute the snapped position for a window being dragged.
 *
 * @param dragId       ID of the window being dragged
 * @param proposedX    Current drag x (before snap)
 * @param proposedY    Current drag y (before snap)
 * @param winW         Dragged window width
 * @param winH         Dragged window height
 * @param windows      All window states (from store)
 * @param snapToGrid   Whether grid snap is enabled
 * @param gridSize     Grid pitch in world units
 * @param threshold    Snap distance in world units
 */
export function computeSnap(
  dragId: string,
  proposedX: number,
  proposedY: number,
  winW: number,
  winH: number,
  windows: Record<string, WindowState>,
  snapToGrid: boolean,
  gridSize: number,
  threshold: number,
): SnapResult {
  let snapX = proposedX;
  let snapY = proposedY;
  const lines: SnapLine[] = [];

  // Dragged window edges (proposed)
  const dL = proposedX;
  const dR = proposedX + winW;
  const dT = proposedY;
  const dB = proposedY + winH;

  let bestDX = threshold + 1; // best x-axis snap distance found so far
  let bestDY = threshold + 1; // best y-axis snap distance found so far

  // ─── Window-to-window snap ───────────────────────────────────────────────

  for (const [id, win] of Object.entries(windows)) {
    if (id === dragId) continue;
    if (!win.visible || win.minimized) continue;

    const wL = win.x;
    const wR = win.x + win.width;
    const wT = win.y;
    const wB = win.y + win.height;

    // ── X-axis: test left/right edges of dragged vs left/right of target ──
    const xCandidates: Array<{ delta: number; snapVal: number; lineX: number }> = [
      { delta: dL - wL, snapVal: wL,      lineX: wL },      // left→left
      { delta: dL - wR, snapVal: wR,      lineX: wR },      // left→right
      { delta: dR - wL, snapVal: wL - winW, lineX: wL },    // right→left
      { delta: dR - wR, snapVal: wR - winW, lineX: wR },    // right→right
    ];

    for (const { delta, snapVal, lineX } of xCandidates) {
      const dist = Math.abs(delta);
      if (dist < threshold && dist < bestDX) {
        bestDX = dist;
        snapX = snapVal;
        // Vertical guide line (x = fixed, runs along y)
        const minY = Math.min(dT, wT) - GUIDE_EXTEND / 4;
        const maxY = Math.max(dB, wB) + GUIDE_EXTEND / 4;
        // Replace any previous x-axis line
        const idx = lines.findIndex((l) => l.axis === 'x');
        const line: SnapLine = { axis: 'x', value: lineX, from: minY, to: maxY };
        if (idx >= 0) lines[idx] = line; else lines.push(line);
      }
    }

    // ── Y-axis: test top/bottom edges of dragged vs top/bottom of target ──
    const yCandidates: Array<{ delta: number; snapVal: number; lineY: number }> = [
      { delta: dT - wT, snapVal: wT,      lineY: wT },      // top→top
      { delta: dT - wB, snapVal: wB,      lineY: wB },      // top→bottom
      { delta: dB - wT, snapVal: wT - winH, lineY: wT },    // bottom→top
      { delta: dB - wB, snapVal: wB - winH, lineY: wB },    // bottom→bottom
    ];

    for (const { delta, snapVal, lineY } of yCandidates) {
      const dist = Math.abs(delta);
      if (dist < threshold && dist < bestDY) {
        bestDY = dist;
        snapY = snapVal;
        const minX = Math.min(dL, wL) - GUIDE_EXTEND / 4;
        const maxX = Math.max(dR, wR) + GUIDE_EXTEND / 4;
        const idx = lines.findIndex((l) => l.axis === 'y');
        const line: SnapLine = { axis: 'y', value: lineY, from: minX, to: maxX };
        if (idx >= 0) lines[idx] = line; else lines.push(line);
      }
    }
  }

  // ─── Grid snap ────────────────────────────────────────────────────────────

  if (snapToGrid && gridSize > 0) {
    // Only apply grid snap if no window-snap was closer
    if (bestDX > threshold) {
      const nearestGridX = Math.round(proposedX / gridSize) * gridSize;
      const gridDelta = Math.abs(proposedX - nearestGridX);
      if (gridDelta < threshold) {
        snapX = nearestGridX;
        lines.push({ axis: 'x', value: nearestGridX, from: proposedY - GUIDE_EXTEND / 2, to: proposedY + winH + GUIDE_EXTEND / 2 });
      }
    }

    if (bestDY > threshold) {
      const nearestGridY = Math.round(proposedY / gridSize) * gridSize;
      const gridDelta = Math.abs(proposedY - nearestGridY);
      if (gridDelta < threshold) {
        snapY = nearestGridY;
        lines.push({ axis: 'y', value: nearestGridY, from: proposedX - GUIDE_EXTEND / 2, to: proposedX + winW + GUIDE_EXTEND / 2 });
      }
    }
  }

  return {
    x: snapX,
    y: snapY,
    snapped: lines.length > 0,
    lines,
  };
}
