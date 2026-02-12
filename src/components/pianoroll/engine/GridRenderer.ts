/**
 * GridRenderer - Draws piano roll grid to an OffscreenCanvas
 *
 * Cached grid is invalidated on zoom, scroll, grid division, scale, or theme change.
 * The grid includes:
 * - Vertical lines at beat/measure/grid divisions
 * - Horizontal note lane shading (black key, out-of-scale)
 * - C-note separator lines
 * - Pattern end marker
 */

import { Viewport } from './Viewport';
import { isBlackKey } from '../../../types/pianoRoll';

export interface GridColors {
  background: string;
  laneDark: string;       // Black key lanes
  laneLight: string;      // White key lanes
  laneOutOfScale: string; // Dimmed out-of-scale lanes
  gridLine: string;       // Sub-beat grid lines
  beatLine: string;       // Beat (every 4 rows) lines
  measureLine: string;    // Measure (every 16 rows) lines
  cNoteLine: string;      // C-note horizontal separator
  patternEnd: string;     // Pattern end marker
  beyondPattern: string;  // Area beyond pattern end
}

export const DEFAULT_GRID_COLORS: GridColors = {
  background: '#0a0a0b',
  laneDark: 'rgba(255,255,255,0.06)',
  laneLight: 'rgba(255,255,255,0.02)',
  laneOutOfScale: 'rgba(0,0,0,0.45)',
  gridLine: 'rgba(255,255,255,0.06)',
  beatLine: 'rgba(255,255,255,0.15)',
  measureLine: 'rgba(255,255,255,0.28)',
  cNoteLine: 'rgba(255,255,255,0.18)',
  patternEnd: 'rgba(239,68,68,0.5)',
  beyondPattern: 'rgba(100,100,100,0.1)',
};

export class GridRenderer {
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private lastKey = '';
  colors: GridColors = { ...DEFAULT_GRID_COLORS };

  /**
   * Generate a cache key from current state.
   * If this key matches the last render, the cached grid can be reused.
   */
  private cacheKey(
    vp: Viewport,
    gridDivision: number,
    patternLength: number,
    scaleNotes: Set<number> | undefined,
    dpr: number,
  ): string {
    const scaleStr = scaleNotes ? Array.from(scaleNotes).sort().join(',') : 'chr';
    return `${vp.scrollX.toFixed(2)}_${vp.scrollY.toFixed(2)}_${vp.horizontalZoom}_${vp.verticalZoom}_${vp.width}_${vp.height}_${gridDivision}_${patternLength}_${scaleStr}_${dpr}`;
  }

  /**
   * Render the grid. Returns the OffscreenCanvas (reused if cache is valid).
   */
  render(
    vp: Viewport,
    gridDivision: number,
    patternLength: number,
    scaleNotes: Set<number> | undefined,
    dpr: number,
  ): OffscreenCanvas | null {
    const key = this.cacheKey(vp, gridDivision, patternLength, scaleNotes, dpr);
    if (key === this.lastKey && this.canvas) {
      return this.canvas;
    }

    const w = Math.ceil(vp.width * dpr);
    const h = Math.ceil(vp.height * dpr);
    if (w <= 0 || h <= 0) return null;

    // (Re)create canvas if size changed
    if (!this.canvas || this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas = new OffscreenCanvas(w, h);
      this.ctx = this.canvas.getContext('2d');
    }

    const ctx = this.ctx;
    if (!ctx) return null;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, vp.width, vp.height);

    const range = vp.getVisibleRange();

    // ---- Horizontal lanes (note rows) ----
    for (let midi = range.endNote; midi >= range.startNote; midi--) {
      const y = vp.noteToPixelY(midi);
      const laneH = vp.verticalZoom;

      if (y + laneH < 0 || y > vp.height) continue;

      const noteInOctave = midi % 12;
      const black = isBlackKey(midi);
      const outOfScale = scaleNotes !== undefined && !scaleNotes.has(noteInOctave);

      // Lane background
      if (outOfScale) {
        ctx.fillStyle = this.colors.laneOutOfScale;
        ctx.fillRect(0, y, vp.width, laneH);
      } else if (black) {
        ctx.fillStyle = this.colors.laneDark;
        ctx.fillRect(0, y, vp.width, laneH);
      } else {
        ctx.fillStyle = this.colors.laneLight;
        ctx.fillRect(0, y, vp.width, laneH);
      }

      // C-note separator
      if (noteInOctave === 0) {
        ctx.fillStyle = this.colors.cNoteLine;
        ctx.fillRect(0, y, vp.width, 1);
      }
    }

    // ---- Vertical grid lines ----
    const gridStep = vp.gridStep(gridDivision);
    // Align to grid step
    const firstGridRow = Math.floor(range.startRow / gridStep) * gridStep;

    for (let row = firstGridRow; row <= range.endRow; row += gridStep) {
      const x = vp.rowToPixelX(row);
      if (x < -1 || x > vp.width + 1) continue;

      const isMeasure = row % 16 === 0;
      const isBeat = row % 4 === 0;

      if (row > patternLength) {
        // Beyond pattern: subtle overlay
        ctx.fillStyle = this.colors.beyondPattern;
        ctx.fillRect(x, 0, 1, vp.height);
      } else if (isMeasure) {
        ctx.fillStyle = this.colors.measureLine;
        ctx.fillRect(x, 0, 1, vp.height);
      } else if (isBeat) {
        ctx.fillStyle = this.colors.beatLine;
        ctx.fillRect(x, 0, 1, vp.height);
      } else {
        ctx.fillStyle = this.colors.gridLine;
        ctx.fillRect(x, 0, 1, vp.height);
      }
    }

    // ---- Pattern end marker ----
    const endX = vp.rowToPixelX(patternLength);
    if (endX >= 0 && endX <= vp.width) {
      ctx.fillStyle = this.colors.patternEnd;
      ctx.fillRect(endX, 0, 2, vp.height);
    }

    this.lastKey = key;
    return this.canvas;
  }

  /** Force re-render on next call */
  invalidate(): void {
    this.lastKey = '';
  }
}
