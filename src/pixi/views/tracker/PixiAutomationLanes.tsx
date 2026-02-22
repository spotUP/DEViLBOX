/**
 * PixiAutomationLanes — Per-channel automation curve overlay for WebGL mode.
 * Renders automation paths with control points, click-to-add/drag-to-draw/double-click-to-remove.
 * Ghost curves for adjacent patterns at 50% alpha.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { useAutomationStore } from '@stores';
import { interpolateAutomationValue } from '@typedefs/automation';
import type { AutomationCurve } from '@typedefs/automation';

const LANE_WIDTH = 20;

interface PixiAutomationLanesProps {
  width: number;
  height: number;
  patternId: string;
  patternLength: number;
  rowHeight: number;
  channelCount: number;
  parameter?: string;
  prevPatternId?: string;
  prevPatternLength?: number;
  nextPatternId?: string;
  nextPatternLength?: number;
}

export const PixiAutomationLanes: React.FC<PixiAutomationLanesProps> = ({
  width,
  height,
  patternId,
  patternLength,
  rowHeight,
  channelCount,
  parameter = 'cutoff',
  prevPatternId,
  prevPatternLength,
  nextPatternId,
  nextPatternLength,
}) => {
  const theme = usePixiTheme();
  const allCurves = useAutomationStore(s => s.curves);
  const addPoint = useAutomationStore(s => s.addPoint);
  const removePoint = useAutomationStore(s => s.removePoint);
  const channelLanes = useAutomationStore(s => s.channelLanes);

  const [dragState, setDragState] = useState<{ curveId: string; channelIndex: number } | null>(null);
  const lastClickRef = useRef<{ time: number; row: number }>({ time: 0, row: -1 });

  // Per-channel active parameter
  const channelParameters = useMemo(() => {
    const result: string[] = [];
    for (let i = 0; i < channelCount; i++) {
      const lane = channelLanes.get(i);
      result.push(lane?.activeParameter || parameter);
    }
    return result;
  }, [channelCount, channelLanes, parameter]);

  // Get curves for current pattern
  const curves = useMemo(() => {
    const result: (AutomationCurve | null)[] = [];
    for (let i = 0; i < channelCount; i++) {
      const chParam = channelParameters[i];
      const curve = allCurves.find(
        c => c.patternId === patternId && c.channelIndex === i && c.parameter === chParam
      );
      result.push(curve && curve.points.length > 0 ? curve : null);
    }
    return result;
  }, [patternId, channelCount, channelParameters, allCurves]);

  // Ghost curves for prev/next patterns
  const prevCurves = useMemo(() => {
    if (!prevPatternId) return [];
    return Array.from({ length: channelCount }, (_, i) => {
      const chParam = channelParameters[i];
      const curve = allCurves.find(
        c => c.patternId === prevPatternId && c.channelIndex === i && c.parameter === chParam
      );
      return curve && curve.points.length > 0 ? curve : null;
    });
  }, [prevPatternId, channelCount, channelParameters, allCurves]);

  const nextCurves = useMemo(() => {
    if (!nextPatternId) return [];
    return Array.from({ length: channelCount }, (_, i) => {
      const chParam = channelParameters[i];
      const curve = allCurves.find(
        c => c.patternId === nextPatternId && c.channelIndex === i && c.parameter === chParam
      );
      return curve && curve.points.length > 0 ? curve : null;
    });
  }, [nextPatternId, channelCount, channelParameters, allCurves]);

  const hasAnyData = curves.some(c => c !== null) ||
    prevCurves.some(c => c !== null) ||
    nextCurves.some(c => c !== null);

  // Interaction handlers
  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(e.currentTarget);
    const channelWidth = width / channelCount;

    for (let ch = 0; ch < channelCount; ch++) {
      const laneLeft = (ch + 1) * channelWidth - LANE_WIDTH - 4;
      if (local.x >= laneLeft && local.x <= laneLeft + LANE_WIDTH) {
        const curve = curves[ch];
        if (!curve) continue;

        const row = Math.floor(local.y / rowHeight);
        if (row < 0 || row >= patternLength) continue;

        const value = Math.max(0, Math.min(1, (local.x - laneLeft - 1) / (LANE_WIDTH - 2)));

        // Double-click detection
        const now = Date.now();
        if (lastClickRef.current.row === row && now - lastClickRef.current.time < 300) {
          const existingPoint = curve.points.find(p => p.row === row);
          if (existingPoint) {
            removePoint(curve.id, row);
          }
          lastClickRef.current = { time: 0, row: -1 };
          return;
        }
        lastClickRef.current = { time: now, row };

        addPoint(curve.id, row, value);
        setDragState({ curveId: curve.id, channelIndex: ch });
        return;
      }
    }
  }, [width, channelCount, curves, rowHeight, patternLength, addPoint, removePoint]);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (!dragState) return;
    const local = e.getLocalPosition(e.currentTarget);
    const curve = curves[dragState.channelIndex];
    if (!curve) return;

    const channelWidth = width / channelCount;
    const laneLeft = (dragState.channelIndex + 1) * channelWidth - LANE_WIDTH - 4;
    const row = Math.floor(local.y / rowHeight);
    if (row < 0 || row >= patternLength) return;

    const value = Math.max(0, Math.min(1, (local.x - laneLeft - 1) / (LANE_WIDTH - 2)));
    addPoint(curve.id, row, value);
  }, [dragState, curves, width, channelCount, rowHeight, patternLength, addPoint]);

  const handlePointerUp = useCallback(() => {
    setDragState(null);
  }, []);

  // Draw helper for a set of curves
  const drawCurves = (
    g: GraphicsType,
    curvesArray: (AutomationCurve | null)[],
    pLength: number,
    yOffset: number,
    alpha: number,
    showPoints: boolean
  ) => {
    const channelWidth = width / channelCount;
    const accentColor = theme.accent.color;

    for (let ch = 0; ch < curvesArray.length; ch++) {
      const curve = curvesArray[ch];
      if (!curve) continue;

      const laneLeft = (ch + 1) * channelWidth - LANE_WIDTH - 4;

      // Build path points
      const points: { x: number; y: number }[] = [];
      for (let row = 0; row < pLength; row++) {
        const val = interpolateAutomationValue(curve.points, row, curve.interpolation, curve.mode);
        if (val !== null) {
          const x = laneLeft + val * (LANE_WIDTH - 2) + 1;
          const y = yOffset + row * rowHeight + rowHeight / 2;
          points.push({ x, y });
        }
      }

      if (points.length < 2) continue;

      // Fill area
      g.moveTo(laneLeft + LANE_WIDTH, yOffset);
      for (let i = points.length - 1; i >= 0; i--) {
        g.lineTo(points[i].x, points[i].y);
      }
      g.lineTo(laneLeft + LANE_WIDTH, yOffset + pLength * rowHeight);
      g.closePath();
      g.fill({ color: accentColor, alpha: 0.1 * alpha });

      // Stroke line
      g.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        g.lineTo(points[i].x, points[i].y);
      }
      g.stroke({ color: accentColor, alpha: 0.6 * alpha, width: 1.5 });

      // Control points
      if (showPoints) {
        for (const pt of curve.points) {
          const x = laneLeft + pt.value * (LANE_WIDTH - 2) + 1;
          const y = yOffset + pt.row * rowHeight + rowHeight / 2;
          g.circle(x, y, 2);
          g.fill({ color: accentColor, alpha: 0.8 });
        }
      }
    }
  };

  // Main draw callback
  const draw = useCallback((g: GraphicsType) => {
    g.clear();
    if (!hasAnyData) return;

    const prevLen = prevPatternId ? (prevPatternLength || patternLength) : 0;

    // Ghost: previous pattern curves
    if (prevCurves.length > 0 && prevLen > 0) {
      drawCurves(g, prevCurves, prevLen, -(prevLen * rowHeight), 0.5, false);
    }

    // Current pattern curves
    drawCurves(g, curves, patternLength, 0, 1, true);

    // Ghost: next pattern curves
    if (nextCurves.length > 0) {
      const nextLen = nextPatternLength || patternLength;
      drawCurves(g, nextCurves, nextLen, patternLength * rowHeight, 0.5, false);
    }
  }, [hasAnyData, curves, prevCurves, nextCurves, patternLength, prevPatternLength, nextPatternLength, prevPatternId, rowHeight, width, channelCount, theme]);

  if (!hasAnyData) return null;

  return (
    <pixiGraphics
      draw={draw}
      eventMode="static"
      cursor="crosshair"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerUpOutside={handlePointerUp}
      layout={{ position: 'absolute', width, height }}
    />
  );
};
