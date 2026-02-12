/**
 * ArrangementViewport - Coordinate transforms for the arrangement timeline
 *
 * X-axis: rows (horizontal zoom = pixels per row)
 * Y-axis: pixel-based scroll through variable-height tracks (not uniform grid)
 *
 * Adapted from src/components/pianoroll/engine/Viewport.ts
 */

export interface ArrangementViewportState {
  scrollRow: number;       // Horizontal scroll offset (rows)
  scrollY: number;         // Vertical scroll offset (pixels)
  pixelsPerRow: number;    // Horizontal zoom (0.5-32)
  width: number;           // Canvas width in CSS pixels
  height: number;          // Canvas height in CSS pixels
}

export interface VisibleRowRange {
  startRow: number;
  endRow: number;
}

export class ArrangementViewport {
  scrollRow = 0;
  scrollY = 0;
  pixelsPerRow = 4;
  width = 800;
  height = 400;

  update(state: Partial<ArrangementViewportState>): void {
    if (state.scrollRow !== undefined) this.scrollRow = state.scrollRow;
    if (state.scrollY !== undefined) this.scrollY = state.scrollY;
    if (state.pixelsPerRow !== undefined) this.pixelsPerRow = state.pixelsPerRow;
    if (state.width !== undefined) this.width = state.width;
    if (state.height !== undefined) this.height = state.height;
  }

  // ---- Row (X axis) conversions ----

  /** Convert a global row position to pixel X */
  rowToPixelX(row: number): number {
    return (row - this.scrollRow) * this.pixelsPerRow;
  }

  /** Convert pixel X to fractional row position */
  pixelXToRow(x: number): number {
    return x / this.pixelsPerRow + this.scrollRow;
  }

  // ---- Y axis (pixel-based, not uniform) ----

  /** Convert a Y pixel in track-space to screen Y */
  trackYToScreenY(trackY: number): number {
    return trackY - this.scrollY;
  }

  /** Convert screen Y to track-space Y */
  screenYToTrackY(screenY: number): number {
    return screenY + this.scrollY;
  }

  // ---- Snap ----

  /**
   * Snap a row position to the nearest grid line.
   * @param row Fractional row position
   * @param snapDivision Grid division (1=row, 4=beat at speed 6, 24=bar, etc.)
   */
  snapRow(row: number, snapDivision: number): number {
    if (snapDivision <= 0) return Math.round(row);
    return Math.round(row / snapDivision) * snapDivision;
  }

  // ---- Visible range ----

  /** Get the range of rows currently visible */
  getVisibleRowRange(): VisibleRowRange {
    const startRow = Math.floor(this.scrollRow);
    const endRow = Math.ceil(this.scrollRow + this.width / this.pixelsPerRow) + 1;
    return {
      startRow: Math.max(0, startRow),
      endRow,
    };
  }

  /** Number of visible rows (fractional) */
  get visibleRows(): number {
    return this.width / this.pixelsPerRow;
  }
}
