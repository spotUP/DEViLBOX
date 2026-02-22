/**
 * PixiMacroLanes — Per-channel macro value visualization (cutoff, resonance, envMod, pan).
 * Draws inline cell data as colored paths overlaid on pattern channels.
 * Supports interactive drawing and shift-click to clear.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { useTrackerStore } from '@stores';
import type { TrackerCell } from '@typedefs/tracker';

const LANE_WIDTH = 14;

// Parameter colors (Pixi hex)
const PARAM_COLORS: Record<string, number> = {
  cutoff: 0x22c55e,    // Green
  resonance: 0xeab308, // Yellow
  envMod: 0x06b6d4,    // Cyan
  pan: 0x3b82f6,       // Blue
};

interface PixiMacroLanesProps {
  width: number;
  height: number;
  patternLength: number;
  rowHeight: number;
  channelCount: number;
}

export const PixiMacroLanes: React.FC<PixiMacroLanesProps> = ({
  width,
  height,
  patternLength,
  rowHeight,
  channelCount,
}) => {
  const columnVisibility = useTrackerStore(s => s.columnVisibility);
  const patterns = useTrackerStore(s => s.patterns);
  const currentPatternIndex = useTrackerStore(s => s.currentPatternIndex);
  const setCell = useTrackerStore(s => s.setCell);

  const [isDrawing, setIsDrawing] = useState(false);
  const activeLaneRef = useRef<{ channelIndex: number; parameter: string } | null>(null);

  const pattern = patterns[currentPatternIndex];

  // Active parameters based on column visibility
  const parameters = useMemo(() => {
    const active: string[] = [];
    if (columnVisibility.cutoff) active.push('cutoff');
    if (columnVisibility.resonance) active.push('resonance');
    if (columnVisibility.envMod) active.push('envMod');
    if (columnVisibility.pan) active.push('pan');
    return active;
  }, [columnVisibility]);

  // Compute which lane a pointer is in
  const getLaneInfo = useCallback((localX: number, localY: number) => {
    if (!pattern || parameters.length === 0) return null;

    const channelWidth = width / channelCount;
    for (let ch = 0; ch < channelCount; ch++) {
      const chRight = (ch + 1) * channelWidth;
      for (let pi = 0; pi < parameters.length; pi++) {
        const laneLeft = chRight - (parameters.length - pi) * (LANE_WIDTH + 2) - 4;
        if (localX >= laneLeft && localX <= laneLeft + LANE_WIDTH) {
          const row = Math.floor(localY / rowHeight);
          if (row >= 0 && row < patternLength) {
            const normalizedX = Math.max(0, Math.min(1, (localX - laneLeft - 2) / (LANE_WIDTH - 4)));
            return { channelIndex: ch, parameter: parameters[pi], row, value: Math.round(normalizedX * 255), laneLeft };
          }
        }
      }
    }
    return null;
  }, [pattern, parameters, width, channelCount, rowHeight, patternLength]);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(e.currentTarget);
    const info = getLaneInfo(local.x, local.y);
    if (!info) return;

    // Shift-click to clear
    if (e.shiftKey) {
      setCell(info.channelIndex, info.row, { [info.parameter]: undefined });
      return;
    }

    setIsDrawing(true);
    activeLaneRef.current = { channelIndex: info.channelIndex, parameter: info.parameter };
    setCell(info.channelIndex, info.row, { [info.parameter]: info.value });
  }, [getLaneInfo, setCell]);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (!isDrawing || !activeLaneRef.current) return;
    const local = e.getLocalPosition(e.currentTarget);
    const { channelIndex, parameter } = activeLaneRef.current;

    const row = Math.floor(local.y / rowHeight);
    if (row < 0 || row >= patternLength) return;

    const channelWidth = width / channelCount;
    const chRight = (channelIndex + 1) * channelWidth;
    const pi = parameters.indexOf(parameter);
    const laneLeft = chRight - (parameters.length - pi) * (LANE_WIDTH + 2) - 4;
    const normalizedX = Math.max(0, Math.min(1, (local.x - laneLeft - 2) / (LANE_WIDTH - 4)));
    const value = Math.round(normalizedX * 255);

    setCell(channelIndex, row, { [parameter]: value });
  }, [isDrawing, rowHeight, patternLength, width, channelCount, parameters, setCell]);

  const handlePointerUp = useCallback(() => {
    setIsDrawing(false);
    activeLaneRef.current = null;
  }, []);

  // Draw all macro lanes
  const draw = useCallback((g: GraphicsType) => {
    g.clear();
    if (!pattern || parameters.length === 0) return;

    const channelWidth = width / channelCount;

    for (let ch = 0; ch < Math.min(channelCount, pattern.channels.length); ch++) {
      const channel = pattern.channels[ch];
      if (!channel || channel.collapsed) continue;

      const chRight = (ch + 1) * channelWidth;

      for (let pi = 0; pi < parameters.length; pi++) {
        const param = parameters[pi];
        const color = PARAM_COLORS[param] || 0x22c55e;
        const laneLeft = chRight - (parameters.length - pi) * (LANE_WIDTH + 2) - 4;

        // Build path from cell data
        const points: { x: number; y: number }[] = [];
        for (let row = 0; row < channel.rows.length; row++) {
          const cell = channel.rows[row] as TrackerCell & Record<string, number | undefined>;
          const value = cell[param];
          if (value !== undefined && value !== null) {
            const x = laneLeft + (value / 255) * (LANE_WIDTH - 4) + 2;
            const y = row * rowHeight + rowHeight / 2;
            points.push({ x, y });
          }
        }

        if (points.length < 1) continue;

        // Draw line path
        if (points.length >= 2) {
          g.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            g.lineTo(points[i].x, points[i].y);
          }
          g.stroke({ color, alpha: 0.6, width: 1.5 });
        }

        // Draw data points as small squares
        for (const pt of points) {
          g.rect(pt.x - 1.5, pt.y - 1.5, 3, 3);
          g.fill({ color, alpha: 0.9 });
        }
      }
    }
  }, [pattern, parameters, width, channelCount, rowHeight]);

  if (!pattern || parameters.length === 0) return null;

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
