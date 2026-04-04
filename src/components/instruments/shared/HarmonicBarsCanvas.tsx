/**
 * HarmonicBarsCanvas — Shared interactive harmonic bar chart visualization.
 * Replaces inline copies in CMIControls and HarmonicSynthControls.
 */

import React, { useRef, useEffect, useCallback } from 'react';

interface HarmonicBarsCanvasProps {
  /** Harmonic amplitude values, 0-1 normalized */
  harmonics: number[];
  /** Number of harmonics to display */
  count: number;
  /** Canvas width in pixels */
  width: number;
  /** Canvas height in pixels */
  height: number;
  /** Bar fill color */
  barColor: string;
  /** Bar highlight color (top of bar or gradient start) */
  highlightColor: string;
  /** Background color */
  backgroundColor?: string;
  /** Grid line color */
  gridColor?: string;
  /** Border color (set to 'none' to disable) */
  borderColor?: string;
  /** Use gradient fill instead of solid + bright top (default false) */
  gradient?: boolean;
  /** Show harmonic number labels at bottom (default false) */
  showLabels?: boolean;
  /** Label color */
  labelColor?: string;
  /** Enable DPI scaling (default false) */
  hiDpi?: boolean;
  /** Called with normalized (0-1) coordinates when drag starts */
  onDragStart?: (nx: number, ny: number) => void;
  /** Called with normalized (0-1) coordinates during drag */
  onDrag?: (nx: number, ny: number) => void;
  /** Called when drag ends */
  onDragEnd?: () => void;
}

export const HarmonicBarsCanvas: React.FC<HarmonicBarsCanvasProps> = ({
  harmonics, count, width, height,
  barColor, highlightColor,
  backgroundColor = '#0a0a0a',
  gridColor = 'rgba(128,128,128,0.15)',
  borderColor,
  gradient = false,
  showLabels = false,
  labelColor = 'rgba(255,255,255,0.3)',
  hiDpi = false,
  onDragStart, onDrag, onDragEnd,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = hiDpi ? (window.devicePixelRatio || 1) : 1;
    const w = hiDpi ? canvas.clientWidth : width;
    const h = hiDpi ? canvas.clientHeight : height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    if (!hiDpi) {
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Bars
    const barW = w / count;
    const gap = gradient ? Math.max(1, barW * 0.1) : 0;

    for (let i = 0; i < count; i++) {
      const amp = Math.max(0, Math.min(1, harmonics[i] || 0));
      if (amp <= 0.001) continue;
      const barH = amp * h;
      const x = i * barW + (gradient ? gap / 2 : 1);
      const y = h - barH;
      const bw = gradient ? barW - gap : barW - 2;

      if (gradient) {
        const grad = ctx.createLinearGradient(x, y, x, h);
        grad.addColorStop(0, highlightColor);
        grad.addColorStop(1, barColor);
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, bw, barH);
      } else {
        ctx.fillStyle = barColor;
        ctx.fillRect(x, y, bw, barH);
        // Bright top
        ctx.fillStyle = highlightColor;
        ctx.fillRect(x, y, bw, 2);
      }

      // Labels
      if (showLabels && ((i + 1) % 4 === 1 || i === 0)) {
        ctx.fillStyle = labelColor;
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), x + bw / 2, h - 3);
      }
    }

    // Border
    if (borderColor && borderColor !== 'none') {
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, w, h);
    }
  }, [harmonics, count, width, height, barColor, highlightColor, backgroundColor, gridColor, borderColor, gradient, showLabels, labelColor, hiDpi]);

  const getCoords = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      nx: (e.clientX - rect.left) / rect.width,
      ny: (e.clientY - rect.top) / rect.height,
    };
  }, []);

  const hasInteraction = !!(onDragStart || onDrag || onDragEnd);

  return (
    <canvas
      ref={canvasRef}
      width={hiDpi ? undefined : width}
      height={hiDpi ? undefined : height}
      style={{
        cursor: hasInteraction ? 'crosshair' : undefined,
        borderRadius: 4,
        width: hiDpi ? '100%' : width,
        height: hiDpi ? height : height,
      }}
      onMouseDown={hasInteraction ? (e) => {
        dragging.current = true;
        const c = getCoords(e);
        onDragStart?.(c.nx, c.ny);
      } : undefined}
      onMouseMove={hasInteraction ? (e) => {
        if (dragging.current) {
          const c = getCoords(e);
          onDrag?.(c.nx, c.ny);
        }
      } : undefined}
      onMouseUp={hasInteraction ? () => { dragging.current = false; onDragEnd?.(); } : undefined}
      onMouseLeave={hasInteraction ? () => { dragging.current = false; onDragEnd?.(); } : undefined}
    />
  );
};
