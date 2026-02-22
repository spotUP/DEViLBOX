/**
 * ArrangementGridRenderer - Draws arrangement grid to an OffscreenCanvas
 *
 * Cached grid invalidated on zoom, scroll, track layout, or theme change.
 * Draws vertical bar/beat lines and horizontal track separators with
 * alternating track lane backgrounds.
 *
 * Adapted from src/components/pianoroll/engine/GridRenderer.ts
 */

import { ArrangementViewport } from './ArrangementViewport';
import type { TrackLayoutEntry } from './TrackLayout';

export interface ArrangementGridColors {
  background: string;
  trackEven: string;
  trackOdd: string;
  trackSeparator: string;
  gridLine: string;          // Sub-beat grid lines
  beatLine: string;          // Beat lines
  barLine: string;           // Bar (measure) lines
  fourBarLine: string;       // Every 4 bars accent
  beyondEnd: string;         // Beyond arrangement end
}

export const DEFAULT_ARRANGEMENT_GRID_COLORS: ArrangementGridColors = {
  background: '#0c0c0e',
  trackEven: 'rgba(255,255,255,0.02)',
  trackOdd: 'rgba(255,255,255,0.05)',
  trackSeparator: 'rgba(255,255,255,0.08)',
  gridLine: 'rgba(255,255,255,0.02)',
  beatLine: 'rgba(255,255,255,0.05)',
  barLine: 'rgba(255,255,255,0.10)',
  fourBarLine: 'rgba(255,255,255,0.16)',
  beyondEnd: 'rgba(100,100,100,0.06)',
};

export class ArrangementGridRenderer {
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private lastKey = '';
  colors: ArrangementGridColors = { ...DEFAULT_ARRANGEMENT_GRID_COLORS };

  private cacheKey(
    vp: ArrangementViewport,
    entries: TrackLayoutEntry[],
    speed: number,
    beatsPerBar: number,
    totalRows: number,
    dpr: number,
  ): string {
    const trackStr = entries.map(e => `${e.y}_${e.height}`).join(',');
    return `${vp.scrollRow.toFixed(2)}_${vp.scrollY.toFixed(1)}_${vp.pixelsPerRow}_${vp.width}_${vp.height}_${speed}_${beatsPerBar}_${totalRows}_${dpr}_${trackStr}`;
  }

  render(
    vp: ArrangementViewport,
    entries: TrackLayoutEntry[],
    speed: number,
    beatsPerBar: number,
    totalRows: number,
    dpr: number,
  ): OffscreenCanvas | null {
    const key = this.cacheKey(vp, entries, speed, beatsPerBar, totalRows, dpr);
    if (key === this.lastKey && this.canvas) {
      return this.canvas;
    }

    const w = Math.ceil(vp.width * dpr);
    const h = Math.ceil(vp.height * dpr);
    if (w <= 0 || h <= 0) return null;

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

    // ---- Track lane backgrounds ----
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.visible) continue;
      const screenY = vp.trackYToScreenY(entry.y);
      if (screenY + entry.height < 0 || screenY > vp.height) continue;

      // Alternating background
      ctx.fillStyle = i % 2 === 0 ? this.colors.trackEven : this.colors.trackOdd;
      ctx.fillRect(0, screenY, vp.width, entry.height);

      // Separator line at bottom
      ctx.fillStyle = this.colors.trackSeparator;
      ctx.fillRect(0, screenY + entry.height, vp.width, 1);
    }

    // ---- Vertical grid lines ----
    const rowsPerBeat = speed;
    const rowsPerBar = speed * beatsPerBar;
    const rowsPer4Bars = rowsPerBar * 4;
    const range = vp.getVisibleRowRange();

    // Step size based on zoom level to avoid iterating thousands of rows
    let gridStep = 1;
    if (vp.pixelsPerRow < 1) gridStep = rowsPerBar;
    else if (vp.pixelsPerRow < 2) gridStep = rowsPerBeat;

    const firstRow = Math.max(0, Math.floor(range.startRow / gridStep) * gridStep);

    // Beyond-end overlay (single fill)
    if (totalRows < range.endRow) {
      const beyondX = vp.rowToPixelX(totalRows);
      if (beyondX < vp.width) {
        ctx.fillStyle = this.colors.beyondEnd;
        ctx.fillRect(beyondX, 0, vp.width - beyondX, vp.height);
      }
    }

    for (let row = firstRow; row <= Math.min(range.endRow, totalRows); row += gridStep) {
      const x = vp.rowToPixelX(row);
      if (x < -1 || x > vp.width + 1) continue;

      const is4Bar = row % rowsPer4Bars === 0;
      const isBar = row % rowsPerBar === 0;
      const isBeat = row % rowsPerBeat === 0;

      if (is4Bar) {
        ctx.fillStyle = this.colors.fourBarLine;
        ctx.fillRect(x, 0, 1, vp.height);
      } else if (isBar) {
        ctx.fillStyle = this.colors.barLine;
        ctx.fillRect(x, 0, 1, vp.height);
      } else if (isBeat) {
        ctx.fillStyle = this.colors.beatLine;
        ctx.fillRect(x, 0, 1, vp.height);
      } else if (vp.pixelsPerRow >= 2) {
        ctx.fillStyle = this.colors.gridLine;
        ctx.fillRect(x, 0, 1, vp.height);
      }
    }

    this.lastKey = key;
    return this.canvas;
  }

  invalidate(): void {
    this.lastKey = '';
  }
}
