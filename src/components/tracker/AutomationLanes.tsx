/**
 * AutomationLanes - Overlay showing automation curves for all channels
 * Positioned to align with channel columns in the pattern editor
 */

import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useAutomationStore, useInstrumentStore, useTrackerStore } from '@stores';
import { interpolateAutomationValue } from '@typedefs/automation';
import type { AutomationCurve, AutomationPreset } from '@typedefs/automation';
import { getSectionColor } from '@hooks/useChannelAutomationParams';
import { getNKSParametersForSynth } from '@/midi/performance/synthParameterMaps';
import { AUTOMATION_LANE_WIDTH, AUTOMATION_LANE_MIN } from '@hooks/views/usePatternEditor';
import type { SynthType } from '@typedefs/instrument';
import { ContextMenu, type MenuItemType } from '@components/common/ContextMenu';
import { Trash2, Eraser } from 'lucide-react';

/**
 * Resolve a human-readable label for an automation parameter id.
 * Handles NKS params (e.g. 'sampler.volume' → 'Volume') and register params
 * (e.g. 'paula.0.volume' → 'Paula Ch 1 — Volume').
 */
function resolveParamLabel(paramId: string, channelIndex: number): string {
  // Try NKS params first via the channel's instrument
  try {
    const pat = useTrackerStore.getState().patterns[useTrackerStore.getState().currentPatternIndex];
    const inst = pat?.channels[channelIndex]?.instrumentId != null
      ? useInstrumentStore.getState().instruments.find(i => i.id === pat.channels[channelIndex].instrumentId)
      : null;
    if (inst) {
      const nksParam = getNKSParametersForSynth(inst.synthType as SynthType).find(p => p.id === paramId);
      if (nksParam) return nksParam.name;
    }
  } catch { /* fall through */ }

  // Register-format param (paula.N.X, fur.N.X, sid.N.X, etc.)
  // Format: <chip>.<channel>.<param>
  const parts = paramId.split('.');
  if (parts.length >= 3) {
    const [chip, ch, ...rest] = parts;
    const chipName = chip.charAt(0).toUpperCase() + chip.slice(1);
    const paramName = rest.join('.').replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
    const chNum = (parseInt(ch, 10) || 0) + 1;
    return `${chipName} Ch ${chNum} — ${paramName}`;
  }
  // <chip>.<param>
  if (parts.length === 2) {
    const [chip, name] = parts;
    return `${chip.charAt(0).toUpperCase()}${chip.slice(1)} — ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  }
  return paramId;
}

interface AutomationLanesProps {
  patternId: string;
  patternLength: number;
  rowHeight: number;
  channelCount: number;
  channelOffsets: number[];
  channelWidths: number[];
  rowNumWidth: number;
  scrollOffset?: number;   // legacy — parent wrapper handles positioning
  visibleStart?: number;   // legacy — parent wrapper handles positioning
  containerHeight?: number; // legacy — parent wrapper handles positioning
  parameter?: string;
  prevPatternId?: string;
  prevPatternLength?: number;
  nextPatternId?: string;
  nextPatternLength?: number;
  /** Offset to add to channel indices when reading/writing automation store.
   *  Used by MusicLine per-channel instances where each PatternEditorCanvas
   *  shows 1 channel but needs to map to the correct store channel index. */
  channelIndexOffset?: number;
}

/** Resolve parameter color from NKS section of the first channel that has automation */
function useParameterColor(parameter: string): string {
  const patterns = useTrackerStore((s) => s.patterns);
  const currentPatternIndex = useTrackerStore((s) => s.currentPatternIndex);
  const instruments = useInstrumentStore((s) => s.instruments);

  return useMemo(() => {
    const pattern = patterns[currentPatternIndex];
    if (!pattern) return 'var(--color-synth-filter)';
    // Check first channel's instrument for section info
    for (const ch of pattern.channels) {
      if (ch.instrumentId === null) continue;
      const inst = instruments.find((i) => i.id === ch.instrumentId);
      if (!inst) continue;
      const nksParams = getNKSParametersForSynth(inst.synthType as SynthType);
      const nksParam = nksParams.find((p) => p.id === parameter);
      if (nksParam) return getSectionColor(nksParam.section);
    }
    return 'var(--color-synth-filter)';
  }, [parameter, patterns, currentPatternIndex, instruments]);
}

const LANE_WIDTH = 48;

export const AutomationLanes: React.FC<AutomationLanesProps> = React.memo(({
  patternId,
  patternLength,
  rowHeight,
  channelCount,
  channelOffsets,
  channelWidths,
  rowNumWidth,
  parameter = 'cutoff',
  prevPatternId,
  prevPatternLength,
  nextPatternId,
  nextPatternLength,
  channelIndexOffset = 0,
}) => {
  // When rendering a per-channel format instance (MusicLine), local channel 0
  // maps to store channel `channelIndexOffset`. Apply this offset when querying
  // the automation store so curves are read/written to the correct channel.
  const chOff = channelIndexOffset;
  // Subscribe directly to curves array to ensure re-render on changes
  const allCurves = useAutomationStore((state) => state.curves);
  const addPoint = useAutomationStore((state) => state.addPoint);
  const removePoint = useAutomationStore((state) => state.removePoint);
  const channelLanes = useAutomationStore((state) => state.channelLanes);
  const presets = useAutomationStore((state) => state.presets);
  const applyPreset = useAutomationStore((state) => state.applyPreset);
  const clearPoints = useAutomationStore((state) => state.clearPoints);
  const removeCurve = useAutomationStore((state) => state.removeCurve);

  // Right-click context menu state for the active lane
  const [laneCtxMenu, setLaneCtxMenu] = useState<{
    x: number;
    y: number;
    curveId: string;
  } | null>(null);

  // Apply a preset's points to a curve, scaled to fit the current pattern length.
  // Presets are authored against a 64-row pattern; rescale row indices linearly.
  const applyPresetScaled = useCallback((curveId: string, preset: AutomationPreset) => {
    const PRESET_BASE_ROWS = 64;
    const scale = (patternLength - 1) / (PRESET_BASE_ROWS - 1);
    const scaledPreset: AutomationPreset = {
      ...preset,
      points: preset.points.map((p) => ({
        ...p,
        row: Math.round(p.row * scale),
      })),
    };
    applyPreset(curveId, scaledPreset);
  }, [patternLength, applyPreset]);

  // Lane right-click handler — opens the preset/clear/remove menu
  const handleLaneContextMenu = useCallback((e: React.MouseEvent, curveId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setLaneCtxMenu({ x: e.clientX, y: e.clientY, curveId });
  }, []);

  // Build context menu items: presets submenu + clear + remove
  const laneCtxMenuItems = useMemo<MenuItemType[]>(() => {
    if (!laneCtxMenu) return [];
    const curveId = laneCtxMenu.curveId;
    return [
      {
        id: 'apply-preset',
        label: 'Apply Preset',
        submenu: presets.map((preset) => ({
          id: `preset-${preset.id}`,
          label: preset.name,
          onClick: () => applyPresetScaled(curveId, preset),
        })),
      },
      { type: 'divider' as const },
      {
        id: 'clear-points',
        label: 'Clear Points',
        icon: <Eraser size={14} />,
        onClick: () => clearPoints(curveId),
      },
      {
        id: 'remove-curve',
        label: 'Remove Lane',
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => removeCurve(curveId),
      },
    ];
  }, [laneCtxMenu, presets, applyPresetScaled, clearPoints, removeCurve]);

  // Drag state — captures the lane geometry at mousedown so we don't have to
  // recompute (and possibly miscompute, for multi-lane) on every mousemove.
  const [dragState, setDragState] = useState<{
    curveId: string;
    row: number;
    channelIndex: number;
    laneLeft: number;
    laneWidth: number;
    yOffset: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resolve per-channel active parameters (multi-lane support)
  // Combines explicitly active params with any params that already have curve data
  const channelParameterLists = useMemo(() => {
    const result: string[][] = [];
    for (let i = 0; i < channelCount; i++) {
      const lane = channelLanes.get(i);
      const explicit = lane?.activeParameters?.length
        ? [...lane.activeParameters]
        : lane?.activeParameter ? [lane.activeParameter] : [];
      // Also include any params that have curves with data (even if not explicitly active)
      const curvesForCh = allCurves.filter(
        (c) => c.patternId === patternId && c.channelIndex === (i + chOff) && c.points.length > 0
      );
      const fromCurves = curvesForCh.map(c => c.parameter);
      // Merge: explicit first, then any from curves not already in the list
      const merged = [...explicit];
      for (const p of fromCurves) {
        if (!merged.includes(p)) merged.push(p);
      }
      result.push(merged.length > 0 ? merged : [parameter]);
    }
    return result;
  }, [channelCount, channelLanes, parameter, allCurves, patternId]);

  // Legacy single-param alias for backward compatibility
  const channelParameters = useMemo(
    () => channelParameterLists.map(pl => pl[0] || parameter),
    [channelParameterLists, parameter],
  );

  // Get all automation curves for all channels × all params (current pattern)
  // Returns Map<channelIndex, Array<{curve, param}>>
  const channelCurveGroups = useMemo(() => {
    const result = new Map<number, Array<{ curve: AutomationCurve; param: string }>>();
    for (let i = 0; i < channelCount; i++) {
      const params = channelParameterLists[i];
      const group: Array<{ curve: AutomationCurve; param: string }> = [];
      for (const p of params) {
        const curve = allCurves.find(
          (c) => c.patternId === patternId && c.channelIndex === (i + chOff) && c.parameter === p
        );
        if (curve && curve.points.length > 0) {
          group.push({ curve, param: p });
        }
      }
      result.set(i, group);
    }
    return result;
  }, [patternId, channelCount, channelParameterLists, allCurves]);

  // Flatten for backward-compat (first param curve per channel)
  const curves = useMemo(() => {
    const result: (AutomationCurve | null)[] = [];
    for (let i = 0; i < channelCount; i++) {
      const group = channelCurveGroups.get(i);
      result.push(group && group.length > 0 ? group[0].curve : null);
    }
    return result;
  }, [channelCount, channelCurveGroups]);

  // Get ALL automation curves for previous pattern (all params, not just primary)
  const prevCurveGroups = useMemo(() => {
    if (!prevPatternId) return new Map<number, Array<{ curve: AutomationCurve; param: string }>>();
    const result = new Map<number, Array<{ curve: AutomationCurve; param: string }>>();
    for (let i = 0; i < channelCount; i++) {
      const params = channelParameterLists[i];
      const group: Array<{ curve: AutomationCurve; param: string }> = [];
      for (const p of params) {
        const curve = allCurves.find(
          (c) => c.patternId === prevPatternId && c.channelIndex === (i + chOff) && c.parameter === p
        );
        if (curve && curve.points.length > 0) group.push({ curve, param: p });
      }
      // Also include curves not in explicit params
      for (const c of allCurves) {
        if (c.patternId === prevPatternId && c.channelIndex === (i + chOff) && c.points.length > 0
            && !group.some(g => g.param === c.parameter)) {
          group.push({ curve: c, param: c.parameter });
        }
      }
      result.set(i, group);
    }
    return result;
  }, [prevPatternId, channelCount, channelParameterLists, allCurves]);

  const prevCurves = useMemo(() => {
    if (!prevPatternId) return [];
    const result: (AutomationCurve | null)[] = [];
    for (let i = 0; i < channelCount; i++) {
      const group = prevCurveGroups.get(i);
      result.push(group && group.length > 0 ? group[0].curve : null);
    }
    return result;
  }, [prevPatternId, channelCount, prevCurveGroups]);

  // Get ALL automation curves for next pattern (all params, not just primary)
  const nextCurveGroups = useMemo(() => {
    if (!nextPatternId) return new Map<number, Array<{ curve: AutomationCurve; param: string }>>();
    const result = new Map<number, Array<{ curve: AutomationCurve; param: string }>>();
    for (let i = 0; i < channelCount; i++) {
      const params = channelParameterLists[i];
      const group: Array<{ curve: AutomationCurve; param: string }> = [];
      for (const p of params) {
        const curve = allCurves.find(
          (c) => c.patternId === nextPatternId && c.channelIndex === (i + chOff) && c.parameter === p
        );
        if (curve && curve.points.length > 0) group.push({ curve, param: p });
      }
      for (const c of allCurves) {
        if (c.patternId === nextPatternId && c.channelIndex === (i + chOff) && c.points.length > 0
            && !group.some(g => g.param === c.parameter)) {
          group.push({ curve: c, param: c.parameter });
        }
      }
      result.set(i, group);
    }
    return result;
  }, [nextPatternId, channelCount, channelParameterLists, allCurves]);

  const nextCurves = useMemo(() => {
    if (!nextPatternId) return [];
    const result: (AutomationCurve | null)[] = [];
    for (let i = 0; i < channelCount; i++) {
      const group = nextCurveGroups.get(i);
      result.push(group && group.length > 0 ? group[0].curve : null);
    }
    return result;
  }, [nextPatternId, channelCount, nextCurveGroups]);

  // Use the first channel's active parameter for color (cosmetic — each channel
  // could theoretically have its own parameter but one color is sufficient for overlay)
  const colorParam = channelParameters.find(p => p !== parameter) || parameter;
  const color = useParameterColor(colorParam);
  const prevLen = prevPatternId ? (prevPatternLength || patternLength) : 0;
  const nextLen = nextPatternId ? (nextPatternLength || patternLength) : 0;

  // Calculate full virtual range (prev + current + next patterns)
  const prevHeight = prevLen * rowHeight;
  const currentHeight = patternLength * rowHeight;
  const nextHeight = nextLen * rowHeight;
  const totalVirtualHeight = prevHeight + currentHeight + nextHeight;

  // Mouse event handlers for editing (must be before conditional return)
  const handleMouseDown = useCallback((
    e: React.MouseEvent,
    curve: AutomationCurve,
    channelIndex: number,
    laneLeft: number,
    yOffset: number,
    laneWidth: number = LANE_WIDTH,
  ) => {
    if (e.button !== 0) return; // Only left click

    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Calculate row and value from mouse position
    const mouseY = e.clientY - rect.top - yOffset;
    const row = Math.floor(mouseY / rowHeight);

    if (row < 0 || row >= patternLength) return;

    const mouseX = e.clientX - rect.left - laneLeft;
    const value = Math.max(0, Math.min(1, (mouseX - 1) / (laneWidth - 2)));

    // Add or update point
    addPoint(curve.id, row, value);
    setDragState({ curveId: curve.id, row, channelIndex, laneLeft, laneWidth, yOffset });
  }, [patternLength, rowHeight, addPoint]);

  // Document-level mouse move/up so the drag continues even when the cursor
  // strays outside the lane and back in. Without this, the lane's onMouseMove
  // stops firing the moment the cursor leaves its bounding box.
  React.useEffect(() => {
    if (!dragState) return;
    const handleDocMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseY = e.clientY - rect.top - dragState.yOffset;
      const row = Math.floor(mouseY / rowHeight);
      if (row < 0 || row >= patternLength) return;
      const mouseX = e.clientX - rect.left - dragState.laneLeft;
      const value = Math.max(0, Math.min(1, (mouseX - 1) / (dragState.laneWidth - 2)));
      addPoint(dragState.curveId, row, value);
    };
    const handleDocUp = () => setDragState(null);
    document.addEventListener('mousemove', handleDocMove);
    document.addEventListener('mouseup', handleDocUp);
    return () => {
      document.removeEventListener('mousemove', handleDocMove);
      document.removeEventListener('mouseup', handleDocUp);
    };
  }, [dragState, rowHeight, patternLength, addPoint]);

  // Legacy no-op stubs (lane divs still spread these but the document
  // listeners above do the actual work).
  const handleMouseMove = useCallback(() => {}, []);
  const handleMouseUp = useCallback(() => {}, []);

  const handleDoubleClick = useCallback((
    e: React.MouseEvent,
    curve: AutomationCurve,
    yOffset: number
  ) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseY = e.clientY - rect.top - yOffset;
    const row = Math.floor(mouseY / rowHeight);

    if (row < 0 || row >= patternLength) return;

    // Remove point at this row if it exists
    const existingPoint = curve.points.find(p => p.row === row);
    if (existingPoint) {
      removePoint(curve.id, row);
    }
  }, [patternLength, rowHeight, removePoint]);

  // Check if any channel has automation data (including multi-lane and adjacent patterns)
  const hasMultiLane = Array.from(channelCurveGroups.values()).some(g => g.length > 1);
  const hasPrevMultiLane = Array.from(prevCurveGroups.values()).some(g => g.length > 1);
  const hasNextMultiLane = Array.from(nextCurveGroups.values()).some(g => g.length > 1);
  const hasAnyData = curves.some(c => c !== null) ||
                     prevCurves.some(c => c !== null) ||
                     nextCurves.some(c => c !== null) ||
                     hasMultiLane || hasPrevMultiLane || hasNextMultiLane;

  if (!hasAnyData) {
    return null; // Don't render anything if no automation data
  }

  // Helper: render additional (non-primary) curves for a curve group
  const renderMultiLaneCurves = (
    groups: Map<number, Array<{ curve: AutomationCurve; param: string }>>,
    pLength: number,
    startVirtualRow: number,
    opacity: number,
    keyPrefix: string,
    isInteractive: boolean,
  ) => {
    return Array.from(groups.entries()).map(([channelIndex, group]) => {
      if (group.length <= 1) return null;
      const chOffset = channelOffsets[channelIndex] - rowNumWidth;
      const chWidth = channelWidths[channelIndex];
      if (chWidth < 40) return null;

      const laneCount = group.length;
      const autoArea = Math.max(AUTOMATION_LANE_WIDTH, laneCount * AUTOMATION_LANE_MIN + 4);
      const areaLeft = chOffset + chWidth - autoArea;
      const perLane = Math.floor(autoArea / laneCount);

      return group.slice(1).map((entry, laneIdx) => {
        const { curve, param } = entry;
        const laneWidth = Math.max(4, perLane - 2);
        const laneLeft = areaLeft + (laneIdx + 1) * perLane + 1;
        const pHeight = pLength * rowHeight;
        const yOffset = startVirtualRow * rowHeight;

        const paramColor = (() => {
          const patterns = useTrackerStore.getState().patterns;
          const pat = patterns[useTrackerStore.getState().currentPatternIndex];
          if (!pat) return 'var(--color-synth-pan)';
          const ch = pat.channels[channelIndex];
          if (!ch || ch.instrumentId === null) return 'var(--color-synth-pan)';
          const inst = useInstrumentStore.getState().instruments.find(i => i.id === ch.instrumentId);
          if (!inst) return 'var(--color-synth-pan)';
          const nksParams = getNKSParametersForSynth(inst.synthType as SynthType);
          const nksParam = nksParams.find(p => p.id === param);
          return nksParam ? getSectionColor(nksParam.section) : 'var(--color-synth-pan)';
        })();

        const pathPoints: string[] = [];
        let firstX: number | null = null;
        let lastX: number | null = null;
        for (let row = 0; row < pLength; row++) {
          const value = interpolateAutomationValue(curve.points, row, curve.interpolation, curve.mode);
          if (value !== null) {
            const x = value * (laneWidth - 2) + 1;
            const y = row * rowHeight + rowHeight / 2;
            if (firstX === null) {
              // Extend the path up to y=0 so adjacent patterns visually connect
              firstX = x;
              pathPoints.push(`M ${x} 0`);
              pathPoints.push(`L ${x} ${y}`);
            } else {
              pathPoints.push(`L ${x} ${y}`);
            }
            lastX = x;
          }
        }
        // Extend the path down to y=pHeight so adjacent patterns visually connect
        if (lastX !== null) {
          pathPoints.push(`L ${lastX} ${pHeight}`);
        }

        // Build fill polygon: left edge → curve → back to left edge
        const fillPoints: string[] = [];
        if (firstX !== null && lastX !== null) {
          fillPoints.push(`M 0 0`);
          fillPoints.push(`L 0 ${pHeight}`);
          fillPoints.push(`L ${lastX} ${pHeight}`);
          for (let row = pLength - 1; row >= 0; row--) {
            const value = interpolateAutomationValue(curve.points, row, curve.interpolation, curve.mode);
            if (value !== null) {
              const x = value * (laneWidth - 2) + 1;
              const y = row * rowHeight + rowHeight / 2;
              fillPoints.push(`L ${x} ${y}`);
            }
          }
          fillPoints.push(`L ${firstX} 0`);
          fillPoints.push(`Z`);
        }

        return (
          <div
            key={`${keyPrefix}-multi-${channelIndex}-${laneIdx}`}
            title={`CH ${(channelIndex + 1).toString().padStart(2, '0')} — ${resolveParamLabel(param, channelIndex)}`}
            style={{
              position: 'absolute',
              left: laneLeft,
              top: yOffset,
              width: laneWidth,
              height: pHeight,
              cursor: isInteractive ? 'crosshair' : 'default',
              pointerEvents: isInteractive ? 'auto' : 'none',
            }}
            onMouseDown={isInteractive ? (e) => handleMouseDown(e, curve, channelIndex, laneLeft, yOffset, laneWidth) : undefined}
            onMouseMove={isInteractive ? handleMouseMove : undefined}
            onMouseUp={isInteractive ? handleMouseUp : undefined}
            onContextMenu={isInteractive ? (e) => handleLaneContextMenu(e, curve.id) : undefined}
            onDoubleClick={isInteractive ? (e) => handleDoubleClick(e, curve, yOffset) : undefined}
          >
            <svg width={laneWidth} height={pHeight}>
              {fillPoints.length > 0 && (
                <path
                  d={fillPoints.join(' ')}
                  fill={paramColor}
                  fillOpacity={0.18 * opacity}
                  stroke="none"
                />
              )}
              <path
                d={pathPoints.join(' ')}
                fill="none"
                stroke={paramColor}
                strokeWidth={1.5}
                strokeOpacity={0.8 * opacity}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {opacity === 1 && curve.points.map((point, i) => (
                <circle
                  key={i}
                  cx={point.value * (laneWidth - 2) + 1}
                  cy={point.row * rowHeight + rowHeight / 2}
                  r={2}
                  fill={paramColor}
                  fillOpacity={0.8}
                />
              ))}
            </svg>
          </div>
        );
      });
    });
  };

  // Helper to render curves for a single pattern at a virtual y position
  const renderPatternCurves = (
    patternCurves: (AutomationCurve | null)[],
    pLength: number,
    startVirtualRow: number, // Virtual row index where this pattern starts
    opacity: number,
    keyPrefix: string,
    isCurrentPattern: boolean
  ) => {
    return patternCurves.map((curve, channelIndex) => {
      if (!curve) return null;

      const chOffset = channelOffsets[channelIndex] - rowNumWidth;
      const chWidth = channelWidths[channelIndex];
      
      // Skip if channel is too narrow (collapsed)
      if (chWidth < 20) return null;

      // Position in the dedicated automation area at the right edge
      const group = channelCurveGroups.get(channelIndex);
      const laneCount = group ? Math.max(1, group.length) : 1;
      // Match usePatternEditor layout formula
      const autoArea = laneCount <= 1 ? AUTOMATION_LANE_WIDTH
        : Math.max(AUTOMATION_LANE_WIDTH, laneCount * AUTOMATION_LANE_MIN + 4);
      const areaLeft = chOffset + chWidth - autoArea;
      const perLane = Math.floor(autoArea / laneCount);
      const effectiveLaneWidth = laneCount > 1 ? Math.max(4, perLane - 2) : LANE_WIDTH;
      // Primary lane is always at slot 0 (leftmost in the automation area)
      const laneLeft = laneCount > 1 ? areaLeft + 1 : areaLeft + (autoArea - LANE_WIDTH) / 2;
      const pHeight = pLength * rowHeight;
      const yOffset = startVirtualRow * rowHeight;

      // Build SVG path. Extend first point up to y=0 and last point down to
      // y=pHeight so adjacent patterns (prev/current/next ghost stacks) connect
      // visually with no gap between them.
      const lw = effectiveLaneWidth;
      const pathPoints: string[] = [];

      let firstX: number | null = null;
      let lastX: number | null = null;
      for (let row = 0; row < pLength; row++) {
        const value = interpolateAutomationValue(curve.points, row, curve.interpolation, curve.mode);
        if (value !== null) {
          const x = value * (lw - 2) + 1;
          const y = row * rowHeight + rowHeight / 2;
          if (firstX === null) {
            firstX = x;
            pathPoints.push(`M ${x} 0`);
            pathPoints.push(`L ${x} ${y}`);
          } else {
            pathPoints.push(`L ${x} ${y}`);
          }
          lastX = x;
        }
      }
      if (lastX !== null) {
        pathPoints.push(`L ${lastX} ${pHeight}`);
      }

      // Build fill path: filled area between the LEFT edge and the curve.
      // (left edge) M 0 0 → L 0 pHeight → up the curve → L firstX 0 → Z
      const fillPoints: string[] = [];
      if (firstX !== null && lastX !== null) {
        fillPoints.push(`M 0 0`);
        fillPoints.push(`L 0 ${pHeight}`);
        fillPoints.push(`L ${lastX} ${pHeight}`);
        // Walk curve points in reverse so we close back toward y=0
        for (let row = pLength - 1; row >= 0; row--) {
          const value = interpolateAutomationValue(curve.points, row, curve.interpolation, curve.mode);
          if (value !== null) {
            const x = value * (lw - 2) + 1;
            const y = row * rowHeight + rowHeight / 2;
            fillPoints.push(`L ${x} ${y}`);
          }
        }
        fillPoints.push(`L ${firstX} 0`);
        fillPoints.push(`Z`);
      }

      return (
        <div
          key={`${keyPrefix}-${channelIndex}`}
          title={`CH ${(channelIndex + 1).toString().padStart(2, '0')} — ${resolveParamLabel(curve.parameter, channelIndex)}`}
          style={{
            position: 'absolute',
            left: laneLeft,
            top: yOffset,
            width: lw,
            height: pHeight,
            cursor: isCurrentPattern ? 'crosshair' : 'default',
            pointerEvents: 'auto',
          }}
          onMouseDown={isCurrentPattern ? (e) => handleMouseDown(e, curve, channelIndex, laneLeft, yOffset, lw) : undefined}
          onMouseMove={isCurrentPattern ? handleMouseMove : undefined}
          onMouseUp={isCurrentPattern ? handleMouseUp : undefined}
          onContextMenu={isCurrentPattern ? (e) => handleLaneContextMenu(e, curve.id) : undefined}
          onDoubleClick={isCurrentPattern ? (e) => handleDoubleClick(e, curve, yOffset) : undefined}
        >
          <svg width={lw} height={pHeight}>
            {/* Filled area between the left edge and the curve */}
            {fillPoints.length > 0 && (
              <path
                d={fillPoints.join(' ')}
                fill={color}
                fillOpacity={0.18 * opacity}
                stroke="none"
              />
            )}
            {/* Line */}
            <path
              d={pathPoints.join(' ')}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeOpacity={0.8 * opacity}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Points - only show for current pattern */}
            {opacity === 1 && curve.points.map((point, i) => (
              <circle
                key={i}
                cx={point.value * (lw - 2) + 1}
                cy={point.row * rowHeight + rowHeight / 2}
                r={2}
                fill={color}
                fillOpacity={0.8}
              />
            ))}
          </svg>
        </div>
      );
    });
  };

  // Virtual row positions (matches PatternEditor's virtualIndex system)
  // Previous pattern: virtualIndex from -prevLen to -1
  // Current pattern: virtualIndex from 0 to patternLength-1
  // Next pattern: virtualIndex from patternLength to patternLength+nextLen-1

  // Parent wrapper positions this at baseY and gives full pattern height.
  // Content renders relative to row 0 of the current pattern.

  return (
    <div
      ref={containerRef}
      className="automation-lanes"
      data-automation-lane
      style={{
        position: 'relative',
        left: rowNumWidth,
        width: `calc(100% - ${rowNumWidth}px)`,
        height: totalVirtualHeight,
        pointerEvents: 'none',
      }}
    >

      {/* Previous pattern curves (ghost, above) */}
      {prevCurves.length > 0 && renderPatternCurves(
        prevCurves,
        prevLen,
        0, // At top of container
        0.5,
        'prev',
        false
      )}
      {hasPrevMultiLane && renderMultiLaneCurves(prevCurveGroups, prevLen, 0, 0.5, 'prev', false)}

      {/* Current pattern curves (primary lane per channel) */}
      {renderPatternCurves(curves, patternLength, prevLen, 1, 'current', true)}

      {/* Multi-lane: additional parameter curves per channel (side by side in automation area) */}
      {hasMultiLane && renderMultiLaneCurves(channelCurveGroups, patternLength, prevLen, 1, 'current', true)}

      {/* Next pattern curves (ghost, below) */}
      {nextCurves.length > 0 && renderPatternCurves(
        nextCurves,
        nextLen,
        prevLen + patternLength,
        0.5,
        'next',
        false
      )}
      {hasNextMultiLane && renderMultiLaneCurves(nextCurveGroups, nextLen, prevLen + patternLength, 0.5, 'next', false)}

      {/* Right-click context menu for lane operations */}
      {laneCtxMenu && (
        <ContextMenu
          items={laneCtxMenuItems}
          position={{ x: laneCtxMenu.x, y: laneCtxMenu.y }}
          onClose={() => setLaneCtxMenu(null)}
        />
      )}
    </div>
  );
});
