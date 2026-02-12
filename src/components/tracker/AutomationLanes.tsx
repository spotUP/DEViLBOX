/**
 * AutomationLanes - Overlay showing automation curves for all channels
 * Positioned to align with channel columns in the pattern editor
 */

import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useAutomationStore, useInstrumentStore, useTrackerStore } from '@stores';
import { interpolateAutomationValue } from '@typedefs/automation';
import type { AutomationCurve } from '@typedefs/automation';
import { getSectionColor } from '@hooks/useChannelAutomationParams';
import { getNKSParametersForSynth } from '@/midi/performance/synthParameterMaps';
import type { SynthType } from '@typedefs/instrument';

interface AutomationLanesProps {
  patternId: string;
  patternLength: number;
  rowHeight: number;
  channelCount: number;
  channelWidth: number;
  rowNumWidth: number;
  scrollOffset: number;
  visibleStart: number;
  parameter?: string;
  // For showing ghost curves from adjacent patterns
  prevPatternId?: string;
  prevPatternLength?: number;
  nextPatternId?: string;
  nextPatternLength?: number;
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

const LANE_WIDTH = 20;

export const AutomationLanes: React.FC<AutomationLanesProps> = ({
  patternId,
  patternLength,
  rowHeight,
  channelCount,
  channelWidth,
  rowNumWidth,
  scrollOffset: _scrollOffset,
  visibleStart,
  parameter = 'cutoff',
  prevPatternId,
  prevPatternLength,
  nextPatternId,
  nextPatternLength,
}) => {
  // Subscribe directly to curves array to ensure re-render on changes
  const allCurves = useAutomationStore((state) => state.curves);
  const addPoint = useAutomationStore((state) => state.addPoint);
  const removePoint = useAutomationStore((state) => state.removePoint);

  // Drag state
  const [dragState, setDragState] = useState<{
    curveId: string;
    row: number;
    channelIndex: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get automation curves for all channels (current pattern)
  const curves = useMemo(() => {
    const result: (AutomationCurve | null)[] = [];
    for (let i = 0; i < channelCount; i++) {
      // Find curve matching this pattern, channel, and parameter
      const curve = allCurves.find(
        (c) =>
          c.patternId === patternId &&
          c.channelIndex === i &&
          c.parameter === parameter
      );
      result.push(curve && curve.points.length > 0 ? curve : null);
    }
    return result;
  }, [patternId, channelCount, parameter, allCurves]);

  // Get automation curves for previous pattern
  const prevCurves = useMemo(() => {
    if (!prevPatternId) return [];
    const result: (AutomationCurve | null)[] = [];
    for (let i = 0; i < channelCount; i++) {
      const curve = allCurves.find(
        (c) =>
          c.patternId === prevPatternId &&
          c.channelIndex === i &&
          c.parameter === parameter
      );
      result.push(curve && curve.points.length > 0 ? curve : null);
    }
    return result;
  }, [prevPatternId, channelCount, parameter, allCurves]);

  // Get automation curves for next pattern
  const nextCurves = useMemo(() => {
    if (!nextPatternId) return [];
    const result: (AutomationCurve | null)[] = [];
    for (let i = 0; i < channelCount; i++) {
      const curve = allCurves.find(
        (c) =>
          c.patternId === nextPatternId &&
          c.channelIndex === i &&
          c.parameter === parameter
      );
      result.push(curve && curve.points.length > 0 ? curve : null);
    }
    return result;
  }, [nextPatternId, channelCount, parameter, allCurves]);

  const color = useParameterColor(parameter);
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
    yOffset: number
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
    const value = Math.max(0, Math.min(1, (mouseX - 1) / (LANE_WIDTH - 2)));

    // Add or update point
    addPoint(curve.id, row, value);
    setDragState({ curveId: curve.id, row, channelIndex });
  }, [patternLength, rowHeight, addPoint]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const curve = curves[dragState.channelIndex];
    if (!curve) return;

    const laneLeft = dragState.channelIndex * channelWidth + channelWidth - LANE_WIDTH - 4;
    const yOffset = prevLen * rowHeight;

    const mouseY = e.clientY - rect.top - yOffset;
    const row = Math.floor(mouseY / rowHeight);

    if (row < 0 || row >= patternLength) return;

    const mouseX = e.clientX - rect.left - laneLeft;
    const value = Math.max(0, Math.min(1, (mouseX - 1) / (LANE_WIDTH - 2)));

    // Update point
    addPoint(curve.id, row, value);
  }, [dragState, curves, channelWidth, prevLen, rowHeight, patternLength, addPoint]);

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

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

  // Check if any channel has automation data (including adjacent patterns)
  const hasAnyData = curves.some(c => c !== null) ||
                     prevCurves.some(c => c !== null) ||
                     nextCurves.some(c => c !== null);

  if (!hasAnyData) {
    return null; // Don't render anything if no automation data
  }

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

      // Position this lane at the right edge of the channel
      const laneLeft = channelIndex * channelWidth + channelWidth - LANE_WIDTH - 4;
      const pHeight = pLength * rowHeight;
      const yOffset = startVirtualRow * rowHeight;

      // Build SVG path
      const pathPoints: string[] = [];
      const fillPoints: string[] = [`M ${LANE_WIDTH} ${pHeight}`];

      for (let row = 0; row < pLength; row++) {
        const value = interpolateAutomationValue(curve.points, row, curve.interpolation, curve.mode);
        if (value !== null) {
          const x = value * (LANE_WIDTH - 2) + 1;
          const y = row * rowHeight + rowHeight / 2;
          pathPoints.push(`${pathPoints.length === 0 ? 'M' : 'L'} ${x} ${y}`);
        }
      }

      // Build fill path (going backwards)
      for (let row = pLength - 1; row >= 0; row--) {
        const value = interpolateAutomationValue(curve.points, row, curve.interpolation, curve.mode);
        if (value !== null) {
          const x = value * (LANE_WIDTH - 2) + 1;
          const y = row * rowHeight + rowHeight / 2;
          fillPoints.push(`L ${x} ${y}`);
        }
      }
      fillPoints.push(`L ${LANE_WIDTH} 0 Z`);

      return (
        <div
          key={`${keyPrefix}-${channelIndex}`}
          style={{
            position: 'absolute',
            left: laneLeft,
            top: yOffset,
            width: LANE_WIDTH,
            height: pHeight,
            cursor: isCurrentPattern ? 'crosshair' : 'default',
          }}
          onMouseDown={isCurrentPattern ? (e) => handleMouseDown(e, curve, channelIndex, laneLeft, yOffset) : undefined}
          onDoubleClick={isCurrentPattern ? (e) => handleDoubleClick(e, curve, yOffset) : undefined}
        >
          <svg width={LANE_WIDTH} height={pHeight}>
            {/* Fill */}
            <path
              d={fillPoints.join(' ')}
              fill={color}
              fillOpacity={0.1 * opacity}
            />
            {/* Line */}
            <path
              d={pathPoints.join(' ')}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeOpacity={0.6 * opacity}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Points - only show for current pattern */}
            {opacity === 1 && curve.points.map((point, i) => (
              <circle
                key={i}
                cx={point.value * (LANE_WIDTH - 2) + 1}
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

  return (
    <div
      ref={containerRef}
      className="automation-lanes"
      style={{
        position: 'absolute',
        // Container includes prev+current+next patterns
        // Position so current pattern (at yOffset=prevLen*rowHeight within container) aligns with screen row 0
        top: _scrollOffset - (visibleStart * rowHeight) - (prevLen * rowHeight),
        left: rowNumWidth,
        right: 0,
        height: totalVirtualHeight,
        zIndex: 5,
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
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

      {/* Current pattern curves */}
      {renderPatternCurves(curves, patternLength, prevLen, 1, 'current', true)}

      {/* Next pattern curves (ghost, below) */}
      {nextCurves.length > 0 && renderPatternCurves(
        nextCurves,
        nextLen,
        prevLen + patternLength,
        0.5,
        'next',
        false
      )}
    </div>
  );
};
