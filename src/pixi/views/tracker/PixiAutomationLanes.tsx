/**
 * PixiAutomationLanes — Per-channel automation curve overlay for WebGL mode.
 * Renders automation paths with control points, click-to-add/drag-to-draw/double-click-to-remove.
 * Ghost curves for adjacent patterns at 50% alpha.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { useAutomationStore, useInstrumentStore, useTrackerStore, useTransportStore, useCursorStore } from '@stores';
import { interpolateAutomationValue } from '@typedefs/automation';
import type { AutomationCurve } from '@typedefs/automation';
import { getNKSParametersForSynth } from '@/midi/performance/synthParameterMaps';
import { NKSSection } from '@/midi/performance/types';
import type { SynthType } from '@typedefs/instrument';
import { useRegisterLaneStore } from '@stores/useRegisterLaneStore';

import { AUTOMATION_LANE_WIDTH, AUTOMATION_LANE_MIN } from '@hooks/views/usePatternEditor';

const LANE_WIDTH = 24;

/** Map NKS section to a hex color for Pixi rendering */
function sectionToHex(section: string): number {
  switch (section) {
    case NKSSection.FILTER: return 0x4488ff;
    case NKSSection.ENVELOPE: return 0xff8844;
    case NKSSection.SYNTHESIS: return 0x44ff88;
    case NKSSection.LFO:
    case NKSSection.MODULATION: return 0xaa44ff;
    case NKSSection.EFFECTS: return 0xff44aa;
    case NKSSection.OUTPUT:
    case NKSSection.MIXER: return 0x88ff44;
    default: return 0x4488ff;
  }
}

/** Resolve NKS section color for a parameter on a channel */
function resolveParamColor(channelIndex: number, paramId: string): number {
  const { patterns, currentPatternIndex } = useTrackerStore.getState();
  const pat = patterns[currentPatternIndex];
  if (!pat) return 0x4488ff;
  const ch = pat.channels[channelIndex];
  if (!ch || ch.instrumentId === null) return 0x4488ff;
  const inst = useInstrumentStore.getState().instruments.find(i => i.id === ch.instrumentId);
  if (!inst) return 0x4488ff;
  const nksParams = getNKSParametersForSynth(inst.synthType as SynthType);
  const nksParam = nksParams.find(p => p.id === paramId);
  return nksParam ? sectionToHex(nksParam.section) : 0x4488ff;
}

interface PixiAutomationLanesProps {
  width: number;
  height: number;
  patternId: string;
  patternLength: number;
  rowHeight: number;
  channelCount: number;
  channelOffsets: number[];
  channelWidths: number[];
  scrollLeft: number;
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
  channelOffsets,
  channelWidths,
  scrollLeft,
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

  // Scroll sync — align with PixiPatternEditor's center-cursor scroll model.
  // The pattern editor draws row r at: gridTop + centerLineTop + (r - currentRow) * rowHeight
  // where gridTop=48 from editor top. Lanes container is at parent top=28, so grid
  // starts 20px below lanes' y=0. We compute scrollOffset so that
  // drawCurves(yOffset = -scrollOffset) positions row r at the same screen y.
  const isPlaying = useTransportStore(s => s.isPlaying);
  const playbackRow = useTransportStore(s => s.currentRow);
  const cursorRow = useCursorStore(s => s.cursor.rowIndex);
  const currentRow = isPlaying ? playbackRow : cursorRow;
  const GRID_OFFSET = 20; // lanes at top:28, grid at editor's HEADER_HEIGHT=48 → 20px gap
  const gridHeight = height - GRID_OFFSET; // approximate grid area (ignoring h-scrollbar)
  const centerLineTop = Math.floor(gridHeight / 2) - rowHeight / 2;
  // Row r is drawn at y = r*rowH - scrollOffset. We want that = GRID_OFFSET + centerLineTop + (r-currentRow)*rowH
  // So: scrollOffset = r*rowH - GRID_OFFSET - centerLineTop - (r-currentRow)*rowH = currentRow*rowH - GRID_OFFSET - centerLineTop
  const scrollOffset = currentRow * rowHeight - GRID_OFFSET - centerLineTop;

  const [dragState, setDragState] = useState<{ curveId: string; channelIndex: number } | null>(null);
  const lastClickRef = useRef<{ time: number; row: number }>({ time: 0, row: -1 });

  // Filter out params shown as register lanes
  const registerLanes = useRegisterLaneStore(s => s.lanes);
  const registerParamIds = useMemo(() => new Set(registerLanes.map(l => l.paramId)), [registerLanes]);

  // Per-channel active parameters (multi-lane support)
  const channelParameterLists = useMemo(() => {
    const result: string[][] = [];
    for (let i = 0; i < channelCount; i++) {
      const lane = channelLanes.get(i);
      const explicit = lane?.activeParameters?.length
        ? [...lane.activeParameters]
        : lane?.activeParameter ? [lane.activeParameter] : [];
      // Also include any params that have curves with data
      const curvesForCh = allCurves.filter(
        (c) => c.patternId === patternId && c.channelIndex === i && c.points.length > 0
      );
      const fromCurves = curvesForCh.map(c => c.parameter);
      const merged = [...explicit];
      for (const p of fromCurves) {
        if (!merged.includes(p)) merged.push(p);
      }
      // Exclude params shown as register lanes
      const filtered = merged.filter(p => !registerParamIds.has(p));
      result.push(filtered.length > 0 ? filtered : (merged.length > 0 ? [] : [parameter]));
    }
    return result;
  }, [channelCount, channelLanes, parameter, allCurves, patternId, registerParamIds]);

  const channelParameters = useMemo(
    () => channelParameterLists.map(pl => pl[0] || parameter),
    [channelParameterLists, parameter],
  );

  // Multi-lane curve groups: Map<channelIndex, Array<{curve, param}>>
  const channelCurveGroups = useMemo(() => {
    const result = new Map<number, Array<{ curve: AutomationCurve; param: string }>>();
    for (let i = 0; i < channelCount; i++) {
      const params = channelParameterLists[i];
      const group: Array<{ curve: AutomationCurve; param: string }> = [];
      for (const p of params) {
        const curve = allCurves.find(
          c => c.patternId === patternId && c.channelIndex === i && c.parameter === p
        );
        if (curve && curve.points.length > 0) group.push({ curve, param: p });
      }
      result.set(i, group);
    }
    return result;
  }, [patternId, channelCount, channelParameterLists, allCurves]);

  // Primary curves (first param per channel, backward compat)
  const curves = useMemo(() => {
    const result: (AutomationCurve | null)[] = [];
    for (let i = 0; i < channelCount; i++) {
      const group = channelCurveGroups.get(i);
      result.push(group && group.length > 0 ? group[0].curve : null);
    }
    return result;
  }, [channelCount, channelCurveGroups]);

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

  const hasMultiLane = Array.from(channelCurveGroups.values()).some(g => g.length > 1);
  const hasAnyData = curves.some(c => c !== null) ||
    prevCurves.some(c => c !== null) ||
    nextCurves.some(c => c !== null) ||
    hasMultiLane;

  // Lane X position: in the dedicated automation area at the right edge of channel
  const getAutoArea = (ch: number) => {
    const group = channelCurveGroups.get(ch);
    const laneCount = group ? Math.max(1, group.length) : 1;
    return laneCount <= 1 ? AUTOMATION_LANE_WIDTH
      : Math.max(AUTOMATION_LANE_WIDTH, laneCount * AUTOMATION_LANE_MIN + 4);
  };
  const getLaneLeft = (ch: number) => {
    const autoArea = getAutoArea(ch);
    const group = channelCurveGroups.get(ch);
    const laneCount = group ? Math.max(1, group.length) : 1;
    const areaLeft = (channelOffsets[ch] ?? 0) + (channelWidths[ch] ?? 0) - autoArea - scrollLeft;
    if (laneCount > 1) {
      return areaLeft + 1; // primary at slot 0
    }
    return areaLeft + (autoArea - LANE_WIDTH) / 2;
  };
  const getLaneWidth = (ch: number) => {
    const autoArea = getAutoArea(ch);
    const group = channelCurveGroups.get(ch);
    const laneCount = group ? Math.max(1, group.length) : 1;
    return laneCount > 1 ? Math.max(4, Math.floor(autoArea / laneCount) - 2) : LANE_WIDTH;
  };

  // Interaction handlers
  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(e.currentTarget);

    for (let ch = 0; ch < channelCount; ch++) {
      const laneLeft = getLaneLeft(ch);
      const lw = getLaneWidth(ch);
      if (local.x >= laneLeft && local.x <= laneLeft + lw) {
        const curve = curves[ch];
        if (!curve) continue;

        const row = Math.floor((local.y + scrollOffset) / rowHeight);
        if (row < 0 || row >= patternLength) continue;

        const value = Math.max(0, Math.min(1, (local.x - laneLeft - 1) / (lw - 2)));

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
  }, [channelOffsets, channelWidths, scrollLeft, channelCount, curves, channelCurveGroups, rowHeight, patternLength, addPoint, removePoint, scrollOffset]);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (!dragState) return;
    const local = e.getLocalPosition(e.currentTarget);
    const curve = curves[dragState.channelIndex];
    if (!curve) return;

    const laneLeft = getLaneLeft(dragState.channelIndex);
    const lw = getLaneWidth(dragState.channelIndex);
    const row = Math.floor((local.y + scrollOffset) / rowHeight);
    if (row < 0 || row >= patternLength) return;

    const value = Math.max(0, Math.min(1, (local.x - laneLeft - 1) / (lw - 2)));
    addPoint(curve.id, row, value);
  }, [dragState, curves, channelOffsets, channelWidths, channelCurveGroups, scrollLeft, rowHeight, patternLength, addPoint, scrollOffset]);

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
    const accentColor = theme.accent.color;

    for (let ch = 0; ch < curvesArray.length; ch++) {
      const curve = curvesArray[ch];
      if (!curve) continue;

      const laneLeft = getLaneLeft(ch);
      const lw = getLaneWidth(ch);

      // Build path points
      const points: { x: number; y: number }[] = [];
      for (let row = 0; row < pLength; row++) {
        const val = interpolateAutomationValue(curve.points, row, curve.interpolation, curve.mode);
        if (val !== null) {
          const x = laneLeft + val * (lw - 2) + 1;
          const y = yOffset + row * rowHeight + rowHeight / 2;
          points.push({ x, y });
        }
      }

      if (points.length < 2) continue;

      // Fill area between curve and right edge of lane
      const rightX = laneLeft + lw;
      g.moveTo(rightX, points[0].y);
      g.lineTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        g.lineTo(points[i].x, points[i].y);
      }
      g.lineTo(rightX, points[points.length - 1].y);
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
          const x = laneLeft + pt.value * (lw - 2) + 1;
          const y = yOffset + pt.row * rowHeight + rowHeight / 2;
          g.circle(x, y, 2);
          g.fill({ color: accentColor, alpha: 0.8 });
        }
      }
    }
  };

  // Draw a single curve with a specific color
  const drawSingleCurve = (
    g: GraphicsType,
    curve: AutomationCurve,
    pLength: number,
    laneLeft: number,
    laneWidth: number,
    yOffset: number,
    color: number,
    alpha: number,
    showPoints: boolean
  ) => {
    const points: { x: number; y: number }[] = [];
    for (let row = 0; row < pLength; row++) {
      const val = interpolateAutomationValue(curve.points, row, curve.interpolation, curve.mode);
      if (val !== null) {
        const x = laneLeft + val * (laneWidth - 2) + 1;
        const y = yOffset + row * rowHeight + rowHeight / 2;
        points.push({ x, y });
      }
    }
    if (points.length < 2) return;

    // Fill
    const rightX = laneLeft + laneWidth;
    g.moveTo(rightX, points[0].y);
    g.lineTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.lineTo(rightX, points[points.length - 1].y);
    g.closePath();
    g.fill({ color, alpha: 0.08 * alpha });

    // Stroke
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.stroke({ color, alpha: 0.6 * alpha, width: 1.5 });

    // Points
    if (showPoints) {
      for (const pt of curve.points) {
        const x = laneLeft + pt.value * (laneWidth - 2) + 1;
        const y = yOffset + pt.row * rowHeight + rowHeight / 2;
        g.circle(x, y, 2);
        g.fill({ color, alpha: 0.8 });
      }
    }
  };

  // Main draw callback
  const draw = useCallback((g: GraphicsType) => {
    g.clear();
    if (!hasAnyData) return;

    // Pattern extent in scroll-adjusted coordinates
    const patTop = -scrollOffset;
    const patBot = patternLength * rowHeight - scrollOffset;

    // Draw lane background strips spanning the full pattern height
    for (let ch = 0; ch < channelCount; ch++) {
      const autoArea = getAutoArea(ch);
      const areaLeft = (channelOffsets[ch] ?? 0) + (channelWidths[ch] ?? 0) - autoArea - scrollLeft;
      if (areaLeft + autoArea < 0 || areaLeft > width) continue;
      g.rect(areaLeft, patTop, autoArea, patBot - patTop);
      g.fill({ color: theme.accent.color, alpha: 0.04 });
      g.moveTo(areaLeft, patTop);
      g.lineTo(areaLeft, patBot);
      g.stroke({ color: theme.accent.color, alpha: 0.12, width: 1 });
    }

    const prevLen = prevPatternId ? (prevPatternLength || patternLength) : 0;

    // Ghost: previous pattern curves
    if (prevCurves.length > 0 && prevLen > 0) {
      drawCurves(g, prevCurves, prevLen, -(prevLen * rowHeight) - scrollOffset, 0.5, false);
    }

    // Current pattern curves (primary lane)
    drawCurves(g, curves, patternLength, -scrollOffset, 1, true);

    // Multi-lane: additional curves per channel with section-colored strokes
    for (const [ch, group] of channelCurveGroups.entries()) {
      if (group.length <= 1) continue;
      const autoArea = getAutoArea(ch);
      const areaLeft = (channelOffsets[ch] ?? 0) + (channelWidths[ch] ?? 0) - autoArea - scrollLeft;
      const perLane = Math.floor(autoArea / group.length);

      for (let laneIdx = 1; laneIdx < group.length; laneIdx++) {
        const { curve, param } = group[laneIdx];
        const laneLeft = areaLeft + laneIdx * perLane + 1;
        const laneWidth = Math.max(4, perLane - 2);
        const paramColor = resolveParamColor(ch, param);
        drawSingleCurve(g, curve, patternLength, laneLeft, laneWidth, -scrollOffset, paramColor, 1, true);
      }
    }

    // Ghost: next pattern curves
    if (nextCurves.length > 0) {
      const nextLen = nextPatternLength || patternLength;
      drawCurves(g, nextCurves, nextLen, patternLength * rowHeight - scrollOffset, 0.5, false);
    }
  }, [hasAnyData, curves, prevCurves, nextCurves, channelCurveGroups, patternLength, prevPatternLength, nextPatternLength, prevPatternId, rowHeight, channelOffsets, channelWidths, scrollLeft, channelCount, width, height, theme, scrollOffset]);

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
