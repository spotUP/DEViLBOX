/**
 * PixiArrangementAutomationLane — Renders a single automation lane below track clips.
 *
 * Draws a polyline connecting automation points with linear interpolation.
 * Supports click-to-add, drag-to-move, and double-click-to-remove points.
 */

import { useCallback, useRef } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../../fonts';
import { usePixiTheme } from '../../theme';
import type { TimelineAutomationLane } from '@/types/arrangement';

interface PixiArrangementAutomationLaneProps {
  lane: TimelineAutomationLane;
  width: number;
  height: number;
  scrollBeat: number;
  pixelsPerBeat: number;
  totalRows: number;
  onAddPoint: (row: number, value: number) => void;
  onMovePoint: (index: number, row: number, value: number) => void;
  onRemovePoint: (index: number) => void;
}

const POINT_RADIUS = 5;
const HIT_RADIUS = 8;

/** Convert a row + value to canvas x/y */
function rowToX(row: number, scrollBeat: number, pixelsPerBeat: number): number {
  return (row - scrollBeat) * pixelsPerBeat;
}

function valueToY(value: number, height: number): number {
  return (1 - value) * height;
}

function xToRow(x: number, scrollBeat: number, pixelsPerBeat: number): number {
  return x / pixelsPerBeat + scrollBeat;
}

function yToValue(y: number, height: number): number {
  return 1 - Math.max(0, Math.min(1, y / height));
}

/** Find the index of a point near the given canvas coordinates, or -1 */
function findNearestPoint(
  points: TimelineAutomationLane['points'],
  cx: number,
  cy: number,
  scrollBeat: number,
  pixelsPerBeat: number,
  height: number,
): number {
  for (let i = 0; i < points.length; i++) {
    const px = rowToX(points[i].row, scrollBeat, pixelsPerBeat);
    const py = valueToY(points[i].value, height);
    const dx = px - cx;
    const dy = py - cy;
    if (Math.sqrt(dx * dx + dy * dy) <= HIT_RADIUS) return i;
  }
  return -1;
}

export const PixiArrangementAutomationLane: React.FC<PixiArrangementAutomationLaneProps> = ({
  lane,
  width,
  height,
  scrollBeat,
  pixelsPerBeat,
  onAddPoint,
  onMovePoint,
  onRemovePoint,
}) => {
  const theme = usePixiTheme();
  const dragRef = useRef<{ index: number; pointerId: number } | null>(null);
  const lastClickRef = useRef<{ time: number; index: number }>({ time: 0, index: -1 });

  const drawLane = useCallback((g: GraphicsType) => {
    g.clear();

    // Background
    g.rect(0, 0, width, height);
    g.fill({ color: 0x000000, alpha: 0.45 });

    // Top/bottom borders
    g.rect(0, 0, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.4 });
    g.rect(0, height - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.2 });

    // Dashed center line at value=1.0 (top for volume)
    // Draw as short segments
    const defaultY = valueToY(1.0, height);
    const dashLen = 6;
    const gapLen = 4;
    for (let x = 0; x < width; x += dashLen + gapLen) {
      g.rect(x, defaultY - 0.5, Math.min(dashLen, width - x), 1);
      g.fill({ color: 0xffffff, alpha: 0.1 });
    }

    // Draw line connecting points
    const pts = lane.points;
    if (pts.length >= 2) {
      for (let i = 0; i < pts.length - 1; i++) {
        const x1 = rowToX(pts[i].row, scrollBeat, pixelsPerBeat);
        const y1 = valueToY(pts[i].value, height);
        const x2 = rowToX(pts[i + 1].row, scrollBeat, pixelsPerBeat);
        const y2 = valueToY(pts[i + 1].value, height);
        // Only draw if in visible range
        if (x2 < 0 || x1 > width) continue;
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke({ color: 0x60a5fa, alpha: 0.8, width: 1.5 });
      }
    }

    // Extend flat line from last point to right edge
    if (pts.length >= 1) {
      const last = pts[pts.length - 1];
      const lx = rowToX(last.row, scrollBeat, pixelsPerBeat);
      const ly = valueToY(last.value, height);
      if (lx < width) {
        g.moveTo(lx, ly);
        g.lineTo(width, ly);
        g.stroke({ color: 0x60a5fa, alpha: 0.3, width: 1 });
      }
    }

    // Draw point circles
    for (const pt of pts) {
      const px = rowToX(pt.row, scrollBeat, pixelsPerBeat);
      const py = valueToY(pt.value, height);
      if (px < -POINT_RADIUS || px > width + POINT_RADIUS) continue;
      g.circle(px, py, POINT_RADIUS);
      g.fill({ color: 0x3b82f6, alpha: 1 });
      g.circle(px, py, POINT_RADIUS);
      g.stroke({ color: 0xffffff, alpha: 0.6, width: 1 });
    }
  }, [lane.points, width, height, scrollBeat, pixelsPerBeat, theme]);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    const localX = e.localX;
    const localY = e.localY;
    const now = Date.now();

    const hitIdx = findNearestPoint(lane.points, localX, localY, scrollBeat, pixelsPerBeat, height);

    // Double-click on existing point = remove
    if (hitIdx >= 0 && now - lastClickRef.current.time < 300 && lastClickRef.current.index === hitIdx) {
      onRemovePoint(hitIdx);
      lastClickRef.current = { time: 0, index: -1 };
      return;
    }

    if (hitIdx >= 0) {
      // Start drag on existing point
      lastClickRef.current = { time: now, index: hitIdx };
      dragRef.current = { index: hitIdx, pointerId: e.pointerId };
    } else {
      // Click on empty area = add point
      lastClickRef.current = { time: now, index: -1 };
      const row = Math.max(0, xToRow(localX, scrollBeat, pixelsPerBeat));
      const value = yToValue(localY, height);
      onAddPoint(Math.round(row), value);
    }
  }, [lane.points, scrollBeat, pixelsPerBeat, height, onAddPoint, onRemovePoint]);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();

    const localX = e.localX;
    const localY = e.localY;
    const row = Math.max(0, xToRow(localX, scrollBeat, pixelsPerBeat));
    const value = yToValue(localY, height);
    onMovePoint(dragRef.current.index, Math.round(row), value);
  }, [scrollBeat, pixelsPerBeat, height, onMovePoint]);

  const handlePointerUp = useCallback((e: FederatedPointerEvent) => {
    if (dragRef.current && dragRef.current.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  }, []);

  const drawLabel = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(2, 2, 36, 12, 2);
    g.fill({ color: 0x1e293b, alpha: 0.7 });
  }, []);

  // Abbreviate the parameter name for the label
  const paramLabel = lane.parameter.length > 3
    ? lane.parameter.slice(0, 3).toUpperCase()
    : lane.parameter.toUpperCase();

  return (
    <pixiContainer
      layout={{ width, height }}
      eventMode="static"
      cursor="crosshair"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <pixiGraphics draw={drawLane} layout={{ position: 'absolute', width, height }} />

      {/* Parameter label */}
      <pixiGraphics draw={drawLabel} layout={{ position: 'absolute', left: 2, top: 2, width: 38, height: 14 }} />
      <pixiBitmapText
        text={paramLabel}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
        tint={0x94a3b8}
        layout={{ position: 'absolute', left: 5, top: 3 }}
      />
    </pixiContainer>
  );
};
