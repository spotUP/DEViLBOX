/**
 * TimelineRulerRenderer - Draws bar numbers, beat ticks, and markers
 *
 * Rendered to its own OffscreenCanvas with caching.
 * 36px tall with larger bar numbers, beat subdivisions, and graduated ticks.
 */

import { ArrangementViewport } from './ArrangementViewport';
import type { ArrangementMarker } from '@/types/arrangement';

const RULER_HEIGHT = 36;
const BAR_FONT = 'bold 12px Inter, system-ui, sans-serif';
const BEAT_FONT = '9px Inter, system-ui, sans-serif';
const MARKER_FONT = '9px Inter, system-ui, sans-serif';

export interface RulerColors {
  background: string;
  text: string;
  beatText: string;
  tick: string;
  beatTick: string;
  barLine: string;
  markerFlag: string;
  markerText: string;
  loopRegion: string;
}

export const DEFAULT_RULER_COLORS: RulerColors = {
  background: '#111114',
  text: '#aaaabc',
  beatText: '#666677',
  tick: 'rgba(255,255,255,0.1)',
  beatTick: 'rgba(255,255,255,0.25)',
  barLine: 'rgba(255,255,255,0.45)',
  markerFlag: '#f59e0b',
  markerText: '#ffffffcc',
  loopRegion: 'rgba(34,197,94,0.15)',
};

export class TimelineRulerRenderer {
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private lastKey = '';
  colors: RulerColors = { ...DEFAULT_RULER_COLORS };

  get height(): number {
    return RULER_HEIGHT;
  }

  private cacheKey(
    vp: ArrangementViewport,
    speed: number,
    beatsPerBar: number,
    markers: ArrangementMarker[],
    loopStart: number | null,
    loopEnd: number | null,
    dpr: number,
  ): string {
    const markerStr = markers.map(m => `${m.row}_${m.type}_${m.name}_${m.color}`).join(',');
    return `${vp.scrollRow.toFixed(2)}_${vp.pixelsPerRow}_${vp.width}_${speed}_${beatsPerBar}_${markerStr}_${loopStart}_${loopEnd}_${dpr}`;
  }

  render(
    vp: ArrangementViewport,
    speed: number,
    beatsPerBar: number,
    markers: ArrangementMarker[],
    loopStart: number | null,
    loopEnd: number | null,
    dpr: number,
  ): OffscreenCanvas | null {
    const key = this.cacheKey(vp, speed, beatsPerBar, markers, loopStart, loopEnd, dpr);
    if (key === this.lastKey && this.canvas) {
      return this.canvas;
    }

    const w = Math.ceil(vp.width * dpr);
    const h = Math.ceil(RULER_HEIGHT * dpr);
    if (w <= 0) return null;

    if (!this.canvas || this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas = new OffscreenCanvas(w, h);
      this.ctx = this.canvas.getContext('2d');
    }

    const ctx = this.ctx;
    if (!ctx) return null;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, vp.width, RULER_HEIGHT);

    // Bottom border (stronger)
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, RULER_HEIGHT - 1, vp.width, 1);

    const rowsPerBeat = speed;
    const rowsPerBar = speed * beatsPerBar;
    const range = vp.getVisibleRowRange();

    // Loop region highlight
    if (loopStart !== null && loopEnd !== null && loopEnd > loopStart) {
      const lx = vp.rowToPixelX(loopStart);
      const lw = (loopEnd - loopStart) * vp.pixelsPerRow;
      ctx.fillStyle = this.colors.loopRegion;
      ctx.fillRect(lx, 0, lw, RULER_HEIGHT);

      // Loop start handle (vertical bar with triangle)
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(lx - 1, 0, 3, RULER_HEIGHT);
      ctx.beginPath();
      ctx.moveTo(lx + 1, RULER_HEIGHT - 8);
      ctx.lineTo(lx - 5, RULER_HEIGHT);
      ctx.lineTo(lx + 7, RULER_HEIGHT);
      ctx.closePath();
      ctx.fill();

      // Loop end handle (vertical bar with triangle)
      const ex = lx + lw;
      ctx.fillRect(ex - 1, 0, 3, RULER_HEIGHT);
      ctx.beginPath();
      ctx.moveTo(ex + 1, RULER_HEIGHT - 8);
      ctx.lineTo(ex - 5, RULER_HEIGHT);
      ctx.lineTo(ex + 7, RULER_HEIGHT);
      ctx.closePath();
      ctx.fill();
    }

    // Determine tick spacing based on zoom
    let tickStep = 1;
    if (vp.pixelsPerRow < 1) tickStep = rowsPerBar;
    else if (vp.pixelsPerRow < 3) tickStep = rowsPerBeat;

    const firstRow = Math.floor(range.startRow / tickStep) * tickStep;

    for (let row = Math.max(0, firstRow); row <= range.endRow; row += tickStep) {
      const x = vp.rowToPixelX(row);
      if (x < -50 || x > vp.width + 50) continue;

      const isBar = row % rowsPerBar === 0;
      const isBeat = row % rowsPerBeat === 0;

      if (isBar) {
        const barNum = Math.floor(row / rowsPerBar) + 1;

        // Bar tick - full height from middle to bottom
        ctx.fillStyle = this.colors.barLine;
        ctx.fillRect(x, 14, 1, RULER_HEIGHT - 14);

        // Bar number (larger, bolder)
        ctx.font = BAR_FONT;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.colors.text;
        ctx.fillText(`${barNum}`, x + 4, 10);
      } else if (isBeat && vp.pixelsPerRow >= 2) {
        // Beat tick - shorter than bar
        ctx.fillStyle = this.colors.beatTick;
        ctx.fillRect(x, 22, 1, RULER_HEIGHT - 22);

        // Beat subdivision label ("1.2", "1.3", etc.) when zoomed in enough
        if (vp.pixelsPerRow >= 4) {
          const barNum = Math.floor(row / rowsPerBar) + 1;
          const beatInBar = Math.floor((row % rowsPerBar) / rowsPerBeat) + 1;
          ctx.font = BEAT_FONT;
          ctx.textBaseline = 'middle';
          ctx.fillStyle = this.colors.beatText;
          ctx.fillText(`${barNum}.${beatInBar}`, x + 3, 18);
        }
      } else if (vp.pixelsPerRow >= 4) {
        // Sub-beat tick - shortest
        ctx.fillStyle = this.colors.tick;
        ctx.fillRect(x, 28, 1, RULER_HEIGHT - 28);
      }
    }

    // Markers
    ctx.font = MARKER_FONT;
    for (const marker of markers) {
      if (marker.row < range.startRow || marker.row > range.endRow) continue;
      const mx = vp.rowToPixelX(marker.row);

      // Flag
      const flagColor = marker.color || this.colors.markerFlag;
      ctx.fillStyle = flagColor;
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx + 8, 4);
      ctx.lineTo(mx, 8);
      ctx.fill();

      // Label
      ctx.fillStyle = this.colors.markerText;
      ctx.fillText(marker.name, mx + 10, 5);

      // Vertical line
      ctx.fillStyle = `${flagColor}66`;
      ctx.fillRect(mx, 0, 1, RULER_HEIGHT);
    }

    this.lastKey = key;
    return this.canvas;
  }

  invalidate(): void {
    this.lastKey = '';
  }
}
