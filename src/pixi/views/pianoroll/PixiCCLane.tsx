/**
 * PixiCCLane — CC/automation parameter lane for the piano roll.
 *
 * Renders a horizontal lane showing automation curve points for a specific
 * MIDI CC or automation parameter. Supports:
 * - Click to add points
 * - Drag to move points
 * - Double-click to remove points
 * - Visual curve interpolation between points
 *
 * Aligned with the note grid (same horizontal scroll + zoom).
 */

import { useCallback, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { LANE_CUTOFF, LANE_RESONANCE, LANE_ENVMOD, LANE_PAN } from '../../colors';

interface CCPoint {
  row: number;
  value: number; // 0-1 normalized
}

interface PixiCCLaneProps {
  width: number;
  height: number;
  scrollBeat: number;
  pixelsPerBeat: number;
  totalBeats: number;
  parameter: string; // e.g., 'pitchBend', 'modWheel', 'aftertouch', 'cutoff'
  points: CCPoint[];
  color?: number;
  onPointAdd?: (row: number, value: number) => void;
  onPointMove?: (index: number, row: number, value: number) => void;
  onPointRemove?: (index: number) => void;
}

const PARAM_COLORS: Record<string, number> = {
  pitchBend: 0xff6b6b,
  modWheel: 0x4a9eff,
  aftertouch: 0xcc5de8,
  cutoff: LANE_CUTOFF,
  resonance: LANE_RESONANCE,
  envMod: LANE_ENVMOD,
  pan: LANE_PAN,
  volume: 0x51cf66,
};

const HIT_RADIUS = 8;

export const PixiCCLane: React.FC<PixiCCLaneProps> = ({
  width,
  height,
  scrollBeat,
  pixelsPerBeat,
  totalBeats: _totalBeats,
  parameter,
  points,
  color,
  onPointAdd,
  onPointMove,
  onPointRemove,
}) => {
  const theme = usePixiTheme();
  const laneColor = color ?? PARAM_COLORS[parameter] ?? 0x4a9eff;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const lastClickRef = useRef<{ time: number; row: number }>({ time: 0, row: -1 });

  const rowToX = (row: number) => (row - scrollBeat) * pixelsPerBeat;
  const xToRow = (x: number) => Math.round(x / pixelsPerBeat + scrollBeat);
  const valueToY = (value: number) => height - value * (height - 4) - 2;
  const yToValue = (y: number) => Math.max(0, Math.min(1, (height - y - 2) / (height - 4)));

  const draw = useCallback((g: GraphicsType) => {
    g.clear();

    // Background
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color, alpha: 0.5 });

    // Grid lines
    const gridDiv = 4;
    for (let i = Math.floor(scrollBeat); i < scrollBeat + width / pixelsPerBeat + 1; i++) {
      const x = rowToX(i);
      if (x < 0 || x > width) continue;
      const isMajor = i % gridDiv === 0;
      g.moveTo(x, 0);
      g.lineTo(x, height);
      g.stroke({ color: theme.border.color, alpha: isMajor ? 0.3 : 0.1, width: 1 });
    }

    // Center line (0.5 value)
    const midY = valueToY(0.5);
    g.moveTo(0, midY);
    g.lineTo(width, midY);
    g.stroke({ color: theme.textMuted.color, alpha: 0.2, width: 1 });

    if (points.length === 0) return;

    // Draw curve line
    const sortedPoints = [...points].sort((a, b) => a.row - b.row);
    const screenPoints = sortedPoints.map(p => ({ x: rowToX(p.row), y: valueToY(p.value) }));

    if (screenPoints.length > 0) {
      // Fill area under curve
      g.moveTo(screenPoints[0].x, height);
      for (const sp of screenPoints) {
        g.lineTo(sp.x, sp.y);
      }
      g.lineTo(screenPoints[screenPoints.length - 1].x, height);
      g.closePath();
      g.fill({ color: laneColor, alpha: 0.1 });

      // Stroke line
      g.moveTo(screenPoints[0].x, screenPoints[0].y);
      for (let i = 1; i < screenPoints.length; i++) {
        g.lineTo(screenPoints[i].x, screenPoints[i].y);
      }
      g.stroke({ color: laneColor, alpha: 0.7, width: 1.5 });

      // Points
      for (const sp of screenPoints) {
        g.circle(sp.x, sp.y, 3);
        g.fill({ color: laneColor, alpha: 0.9 });
      }
    }
  }, [width, height, scrollBeat, pixelsPerBeat, points, laneColor, theme]);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(e.currentTarget);
    const row = xToRow(local.x);
    const value = yToValue(local.y);

    // Check for hit on existing point
    for (let i = 0; i < points.length; i++) {
      const px = rowToX(points[i].row);
      const py = valueToY(points[i].value);
      if (Math.hypot(px - local.x, py - local.y) < HIT_RADIUS) {
        // Double-click detection
        const now = Date.now();
        if (lastClickRef.current.row === i && now - lastClickRef.current.time < 300) {
          onPointRemove?.(i);
          lastClickRef.current = { time: 0, row: -1 };
          return;
        }
        lastClickRef.current = { time: now, row: i };
        setDragIndex(i);
        return;
      }
    }

    // Add new point
    lastClickRef.current = { time: Date.now(), row: -1 };
    onPointAdd?.(row, value);
  }, [points, onPointAdd, onPointRemove, rowToX, valueToY, xToRow, yToValue]);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (dragIndex === null) return;
    const local = e.getLocalPosition(e.currentTarget);
    const row = xToRow(local.x);
    const value = yToValue(local.y);
    onPointMove?.(dragIndex, row, value);
  }, [dragIndex, onPointMove, xToRow, yToValue]);

  const handlePointerUp = useCallback(() => {
    setDragIndex(null);
  }, []);

  return (
    <pixiContainer layout={{ width, height }}>
      <pixiGraphics
        draw={draw}
        eventMode="static"
        cursor="crosshair"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerUpOutside={handlePointerUp}
        layout={{ width, height }}
      />
      {/* Label */}
      <pixiBitmapText
        text={parameter}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
        tint={laneColor}
        layout={{ position: 'absolute', left: 4, top: 2 }}
      />
    </pixiContainer>
  );
};
