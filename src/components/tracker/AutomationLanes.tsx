/**
 * AutomationLanes - Overlay showing automation curves for all channels
 * Positioned to align with channel columns in the pattern editor
 */

import React, { useMemo } from 'react';
import { useAutomationStore } from '@stores';
import type { AutomationCurve } from '@typedefs/automation';

interface AutomationLanesProps {
  patternId: string;
  patternLength: number;
  rowHeight: number;
  channelCount: number;
  channelWidth: number;
  rowNumWidth: number;
  scrollOffset: number;
  parameter?: string;
  // For showing ghost curves from adjacent patterns
  prevPatternId?: string;
  prevPatternLength?: number;
  nextPatternId?: string;
  nextPatternLength?: number;
}

// Interpolate value between automation points
const getInterpolatedValue = (
  curve: AutomationCurve | null,
  row: number
): number | null => {
  if (!curve || curve.points.length === 0) return null;

  const points = curve.points;
  let before = null;
  let after = null;

  for (let i = 0; i < points.length; i++) {
    if (points[i].row <= row) before = points[i];
    if (points[i].row >= row) {
      after = points[i];
      break;
    }
  }

  if (before && before.row === row) return before.value;
  if (after && after.row === row) return after.value;
  if (!before && after) return after.value;
  if (before && !after) return before.value;

  if (before && after) {
    const t = (row - before.row) / (after.row - before.row);
    return before.value + (after.value - before.value) * t;
  }

  return null;
};

// Get color based on parameter
const getParameterColor = (parameter: string): string => {
  const colors: Record<string, string> = {
    cutoff: '#00d4aa',
    resonance: '#00d4aa',
    envMod: '#7c3aed',
    decay: '#7c3aed',
    accent: '#f59e0b',
    overdrive: '#ef4444',
    distortion: '#ef4444',
    volume: '#22c55e',
    pan: '#3b82f6',
    delay: '#8b5cf6',
    reverb: '#8b5cf6',
  };
  return colors[parameter] || '#00d4aa';
};

const LANE_WIDTH = 20;

export const AutomationLanes: React.FC<AutomationLanesProps> = ({
  patternId,
  patternLength,
  rowHeight,
  channelCount,
  channelWidth,
  rowNumWidth,
  scrollOffset: _scrollOffset,
  parameter = 'cutoff',
  prevPatternId,
  prevPatternLength,
  nextPatternId,
  nextPatternLength,
}) => {
  // Subscribe directly to curves array to ensure re-render on changes
  const allCurves = useAutomationStore((state) => state.curves);

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

  const color = getParameterColor(parameter);
  const prevLen = prevPatternLength || patternLength;
  const nextLen = nextPatternLength || patternLength;

  // Calculate full virtual range (prev + current + next patterns)
  const prevHeight = prevLen * rowHeight;
  const currentHeight = patternLength * rowHeight;
  const nextHeight = nextLen * rowHeight;
  const totalVirtualHeight = prevHeight + currentHeight + nextHeight;

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
    keyPrefix: string
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
        const value = getInterpolatedValue(curve, row);
        if (value !== null) {
          const x = value * (LANE_WIDTH - 2) + 1;
          const y = row * rowHeight + rowHeight / 2;
          pathPoints.push(`${pathPoints.length === 0 ? 'M' : 'L'} ${x} ${y}`);
        }
      }

      // Build fill path (going backwards)
      for (let row = pLength - 1; row >= 0; row--) {
        const value = getInterpolatedValue(curve, row);
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
          }}
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
  const prevStartRow = -prevLen;
  // currentStartRow = 0 and nextStartRow = patternLength (implicit)

  return (
    <div
      className="automation-lanes pointer-events-none"
      style={{
        position: 'absolute',
        top: prevStartRow * rowHeight, // Start at negative position for prev pattern
        left: rowNumWidth,
        right: 0,
        height: totalVirtualHeight,
        zIndex: 5,
      }}
    >
      {/* Previous pattern curves (ghost, above) */}
      {prevCurves.length > 0 && renderPatternCurves(
        prevCurves,
        prevLen,
        0, // Relative to this container's top (which is already offset)
        0.35,
        'prev'
      )}

      {/* Current pattern curves */}
      {renderPatternCurves(curves, patternLength, prevLen, 1, 'current')}

      {/* Next pattern curves (ghost, below) */}
      {nextCurves.length > 0 && renderPatternCurves(
        nextCurves,
        nextLen,
        prevLen + patternLength,
        0.35,
        'next'
      )}
    </div>
  );
};
