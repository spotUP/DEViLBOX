/**
 * Viewport - Coordinate math for piano roll canvas
 *
 * Converts between pixel coordinates and musical coordinates (row/beat, MIDI note).
 * Handles zoom, scroll, and grid snapping including triplet divisions.
 */

export interface ViewportState {
  scrollX: number;       // Horizontal scroll offset (rows)
  scrollY: number;       // Vertical scroll offset (MIDI note base)
  horizontalZoom: number; // Pixels per row (4-64)
  verticalZoom: number;  // Pixels per semitone (8-32)
  width: number;         // Canvas width in CSS pixels
  height: number;        // Canvas height in CSS pixels
}

export interface VisibleRange {
  startRow: number;
  endRow: number;
  startNote: number;   // Lowest visible MIDI note
  endNote: number;     // Highest visible MIDI note
}

/**
 * Note range center offset.
 * scrollY + NOTE_CENTER_OFFSET gives the MIDI note at the top of the viewport.
 */
const NOTE_CENTER_OFFSET = 60;

export class Viewport {
  scrollX = 0;
  scrollY = 0;
  horizontalZoom = 16;
  verticalZoom = 12;
  width = 800;
  height = 400;

  /** Update viewport from external state */
  update(state: Partial<ViewportState>): void {
    if (state.scrollX !== undefined) this.scrollX = state.scrollX;
    if (state.scrollY !== undefined) this.scrollY = state.scrollY;
    if (state.horizontalZoom !== undefined) this.horizontalZoom = state.horizontalZoom;
    if (state.verticalZoom !== undefined) this.verticalZoom = state.verticalZoom;
    if (state.width !== undefined) this.width = state.width;
    if (state.height !== undefined) this.height = state.height;
  }

  // ---- Row (X axis) conversions ----

  /** Convert a row position to pixel X */
  rowToPixelX(row: number): number {
    return (row - this.scrollX) * this.horizontalZoom;
  }

  /** Convert pixel X to fractional row position */
  pixelXToRow(x: number): number {
    return x / this.horizontalZoom + this.scrollX;
  }

  // ---- Note (Y axis) conversions ----

  /** Convert a MIDI note number to pixel Y (top of the note lane) */
  noteToPixelY(midiNote: number): number {
    return (this.scrollY + NOTE_CENTER_OFFSET - midiNote) * this.verticalZoom;
  }

  /** Convert pixel Y to MIDI note number */
  pixelYToNote(y: number): number {
    return this.scrollY + NOTE_CENTER_OFFSET - y / this.verticalZoom;
  }

  // ---- Snap ----

  /**
   * Snap a row position to the nearest grid line.
   * @param row Fractional row position
   * @param gridDivision Grid division (1, 2, 3, 4, 6, 8, 12, 16)
   * @returns Snapped row position
   */
  snapRow(row: number, gridDivision: number): number {
    const gridStep = this.gridStep(gridDivision);
    return Math.round(row / gridStep) * gridStep;
  }

  /**
   * Get the grid step size in rows for a given division.
   * Supports triplets: division 3 = 4/3, 6 = 2/3, 12 = 1/3
   */
  gridStep(gridDivision: number): number {
    return 4 / gridDivision;
  }

  // ---- Visible range ----

  /** Get the range of rows and notes currently visible */
  getVisibleRange(): VisibleRange {
    const startRow = Math.floor(this.scrollX);
    const endRow = Math.ceil(this.scrollX + this.width / this.horizontalZoom) + 1;
    const endNote = Math.ceil(this.scrollY + NOTE_CENTER_OFFSET);
    const startNote = Math.floor(this.scrollY + NOTE_CENTER_OFFSET - this.height / this.verticalZoom) - 1;
    return {
      startRow: Math.max(0, startRow),
      endRow,
      startNote: Math.max(0, startNote),
      endNote: Math.min(127, endNote),
    };
  }

  /** Number of visible rows (fractional) */
  get visibleRows(): number {
    return this.width / this.horizontalZoom;
  }

  /** Number of visible semitones (fractional) */
  get visibleNotes(): number {
    return this.height / this.verticalZoom;
  }
}
