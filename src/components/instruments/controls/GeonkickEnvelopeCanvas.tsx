/**
 * GeonkickEnvelopeCanvas — drag-point envelope editor for Geonkick percussion synth.
 *
 * Renders a curve through an array of {x, y} points (x,y in [0,1]).
 * Points are draggable. Click empty space on curve to add a point.
 * Right-click a point to remove it (minimum 2 points preserved).
 * First point is locked to x=0, last point to x=1.
 * Linear interpolation between points (matching Geonkick internal).
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';

export interface EnvelopePoint {
  x: number;
  y: number;
}

interface GeonkickEnvelopeCanvasProps {
  points: EnvelopePoint[];
  onChange: (points: EnvelopePoint[]) => void;
  width?: number;
  height?: number;
  yLabel?: string;
  accentColor?: string;
}

const PADDING_LEFT = 40;
const PADDING_RIGHT = 12;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 24;
const POINT_RADIUS = 6;
const POINT_HIT_RADIUS = 12;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export const GeonkickEnvelopeCanvas: React.FC<GeonkickEnvelopeCanvasProps> = ({
  points,
  onChange,
  width = 400,
  height = 150,
  yLabel = 'Value',
  accentColor = '#60a5fa',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const pointsRef = useRef(points);
  const [, forceRender] = useState(0);

  // Keep ref in sync
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  // Coordinate transforms
  const plotW = width - PADDING_LEFT - PADDING_RIGHT;
  const plotH = height - PADDING_TOP - PADDING_BOTTOM;

  const toCanvasX = useCallback((nx: number) => PADDING_LEFT + nx * plotW, [plotW]);
  const toCanvasY = useCallback((ny: number) => PADDING_TOP + (1 - ny) * plotH, [plotH]);
  const fromCanvasX = useCallback((cx: number) => clamp((cx - PADDING_LEFT) / plotW, 0, 1), [plotW]);
  const fromCanvasY = useCallback((cy: number) => clamp(1 - (cy - PADDING_TOP) / plotH, 0, 1), [plotH]);

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);

    // Grid lines at 25% intervals
    ctx.strokeStyle = '#1e2a3a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const frac = i / 4;
      // Vertical
      const gx = toCanvasX(frac);
      ctx.beginPath();
      ctx.moveTo(gx, PADDING_TOP);
      ctx.lineTo(gx, PADDING_TOP + plotH);
      ctx.stroke();
      // Horizontal
      const gy = toCanvasY(frac);
      ctx.beginPath();
      ctx.moveTo(PADDING_LEFT, gy);
      ctx.lineTo(PADDING_LEFT + plotW, gy);
      ctx.stroke();
    }

    // Axis labels
    ctx.fillStyle = '#6b7280';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    // X axis labels
    for (let i = 0; i <= 4; i++) {
      const frac = i / 4;
      ctx.fillText(`${Math.round(frac * 100)}%`, toCanvasX(frac), height - 4);
    }
    // Y axis labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const frac = i / 4;
      ctx.fillText(`${frac.toFixed(2)}`, PADDING_LEFT - 4, toCanvasY(frac) + 3);
    }

    // Y axis label (rotated)
    ctx.save();
    ctx.translate(10, PADDING_TOP + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px sans-serif';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    const pts = pointsRef.current;
    if (pts.length < 2) return;

    // Filled area under curve
    ctx.beginPath();
    ctx.moveTo(toCanvasX(pts[0].x), toCanvasY(0));
    for (const p of pts) {
      ctx.lineTo(toCanvasX(p.x), toCanvasY(p.y));
    }
    ctx.lineTo(toCanvasX(pts[pts.length - 1].x), toCanvasY(0));
    ctx.closePath();
    ctx.fillStyle = accentColor + '18';
    ctx.fill();

    // Curve line
    ctx.beginPath();
    ctx.moveTo(toCanvasX(pts[0].x), toCanvasY(pts[0].y));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toCanvasX(pts[i].x), toCanvasY(pts[i].y));
    }
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Points
    for (let i = 0; i < pts.length; i++) {
      const cx = toCanvasX(pts[i].x);
      const cy = toCanvasY(pts[i].y);
      const isActive = dragIndexRef.current === i;

      ctx.beginPath();
      ctx.arc(cx, cy, isActive ? POINT_RADIUS + 2 : POINT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? '#ffffff' : accentColor;
      ctx.fill();
      ctx.strokeStyle = '#0d1117';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [width, height, plotW, plotH, toCanvasX, toCanvasY, yLabel, accentColor]);

  useEffect(() => {
    draw();
  }, [draw, points]);

  // Hit test: find point near cursor
  const findPointAt = useCallback(
    (cx: number, cy: number): number | null => {
      const pts = pointsRef.current;
      for (let i = 0; i < pts.length; i++) {
        const dx = toCanvasX(pts[i].x) - cx;
        const dy = toCanvasY(pts[i].y) - cy;
        if (Math.sqrt(dx * dx + dy * dy) < POINT_HIT_RADIUS) return i;
      }
      return null;
    },
    [toCanvasX, toCanvasY],
  );

  const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      cx: e.clientX - rect.left,
      cy: e.clientY - rect.top,
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const { cx, cy } = getCanvasCoords(e);
      const hitIdx = findPointAt(cx, cy);

      if (hitIdx !== null) {
        dragIndexRef.current = hitIdx;
        isDraggingRef.current = true;
        draw();
      }
    },
    [findPointAt, getCanvasCoords, draw],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDraggingRef.current || dragIndexRef.current === null) return;
      const { cx, cy } = getCanvasCoords(e);
      const pts = [...pointsRef.current];
      const idx = dragIndexRef.current;

      let nx = fromCanvasX(cx);
      const ny = fromCanvasY(cy);

      // First point locked to x=0, last to x=1
      if (idx === 0) {
        nx = 0;
      } else if (idx === pts.length - 1) {
        nx = 1;
      } else {
        // Constrain between neighbors
        nx = clamp(nx, pts[idx - 1].x + 0.001, pts[idx + 1].x - 0.001);
      }

      pts[idx] = { x: nx, y: ny };
      pointsRef.current = pts;
      onChange(pts);
      draw();
    },
    [fromCanvasX, fromCanvasY, getCanvasCoords, onChange, draw],
  );

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      dragIndexRef.current = null;
      isDraggingRef.current = false;
      draw();
    }
  }, [draw]);

  // Click to add a point (only if not dragging)
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isDraggingRef.current) return;
      const { cx, cy } = getCanvasCoords(e);
      // Don't add if clicking an existing point
      if (findPointAt(cx, cy) !== null) return;

      const nx = fromCanvasX(cx);
      const ny = fromCanvasY(cy);

      // Only add within the plot area
      if (nx <= 0 || nx >= 1) return;

      const pts = [...pointsRef.current];
      // Insert in sorted order
      let insertIdx = pts.length;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i].x > nx) {
          insertIdx = i;
          break;
        }
      }
      pts.splice(insertIdx, 0, { x: nx, y: ny });
      pointsRef.current = pts;
      onChange(pts);
      draw();
    },
    [findPointAt, fromCanvasX, fromCanvasY, getCanvasCoords, onChange, draw],
  );

  // Right-click to remove a point (keep min 2)
  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const { cx, cy } = getCanvasCoords(e);
      const hitIdx = findPointAt(cx, cy);
      if (hitIdx === null) return;

      const pts = [...pointsRef.current];
      if (pts.length <= 2) return;

      // Don't remove first or last — they're anchors
      if (hitIdx === 0 || hitIdx === pts.length - 1) return;

      pts.splice(hitIdx, 1);
      pointsRef.current = pts;
      onChange(pts);
      draw();
    },
    [findPointAt, getCanvasCoords, onChange, draw],
  );

  // Handle mouse-up outside the canvas
  useEffect(() => {
    const onUp = () => {
      if (isDraggingRef.current) {
        dragIndexRef.current = null;
        isDraggingRef.current = false;
        draw();
      }
    };
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, [draw]);

  // Also handle mouse-move outside canvas for smooth dragging
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || dragIndexRef.current === null) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      const pts = [...pointsRef.current];
      const idx = dragIndexRef.current;

      let nx = fromCanvasX(cx);
      const ny = fromCanvasY(cy);

      if (idx === 0) {
        nx = 0;
      } else if (idx === pts.length - 1) {
        nx = 1;
      } else {
        nx = clamp(nx, pts[idx - 1].x + 0.001, pts[idx + 1].x - 0.001);
      }

      pts[idx] = { x: nx, y: ny };
      pointsRef.current = pts;
      onChange(pts);
      draw();
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, [fromCanvasX, fromCanvasY, onChange, draw]);

  // Force re-render when points change to update the ref-based draw
  useEffect(() => {
    forceRender((n) => n + 1);
  }, [points]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, cursor: 'crosshair' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    />
  );
};
