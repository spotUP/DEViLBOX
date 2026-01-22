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

// Get color based on parameter (uses CSS variables for theming)
const getParameterColor = (parameter: string): string => {
  const colors: Record<string, string> = {
    cutoff: 'var(--color-synth-filter)',
    resonance: 'var(--color-synth-filter)',
    envMod: 'var(--color-synth-envelope)',
    decay: 'var(--color-synth-envelope)',
    accent: 'var(--color-synth-accent)',
    overdrive: 'var(--color-synth-drive)',
    distortion: 'var(--color-synth-drive)',
    volume: 'var(--color-synth-volume)',
    pan: 'var(--color-synth-pan)',
    delay: 'var(--color-synth-effects)',
    reverb: 'var(--color-synth-effects)',
  };
  return colors[parameter] || 'var(--color-synth-filter)';
};

const LANE_WIDTH = 20;

// Generate SVG path strings for a single curve (memoizable)
const generateCurvePaths = (
  curve: AutomationCurve,
  pLength: number,
  rowHeight: number
): { linePath: string; fillPath: string } => {
  const pathPoints: string[] = [];
  const fillPoints: string[] = [`M ${LANE_WIDTH} ${pLength * rowHeight}`];

  // Build line path
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

  return {
    linePath: pathPoints.join(' '),
    fillPath: fillPoints.join(' '),
  };
};

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

  // Memoize SVG path generation for current pattern curves
  const currentPaths = useMemo(() => {
    return curves.map(curve =>
      curve ? generateCurvePaths(curve, patternLength, rowHeight) : null
    );
  }, [curves, patternLength, rowHeight]);

  // Memoize SVG path generation for previous pattern curves
  const prevLen = prevPatternLength || patternLength;
  const prevPaths = useMemo(() => {
    return prevCurves.map(curve =>
      curve ? generateCurvePaths(curve, prevLen, rowHeight) : null
    );
  }, [prevCurves, prevLen, rowHeight]);

  // Memoize SVG path generation for next pattern curves
  const nextLen = nextPatternLength || patternLength;
  const nextPaths = useMemo(() => {
    return nextCurves.map(curve =>
      curve ? generateCurvePaths(curve, nextLen, rowHeight) : null
    );
  }, [nextCurves, nextLen, rowHeight]);

  // Check if any channel has automation data (including adjacent patterns)
  const hasAnyData = curves.some(c => c !== null) ||
                     prevCurves.some(c => c !== null) ||
                     nextCurves.some(c => c !== null);

  if (!hasAnyData) {
    return null; // Don't render anything if no automation data
  }

  const color = getParameterColor(parameter);

  // Calculate full virtual range (prev + current + next patterns)
  const prevHeight = prevLen * rowHeight;
  const currentHeight = patternLength * rowHeight;
  const nextHeight = nextLen * rowHeight;
  const totalVirtualHeight = prevHeight + currentHeight + nextHeight;

  // Helper to render curves using pre-computed paths
  const renderPatternCurves = (
    patternCurves: (AutomationCurve | null)[],
    paths: ({ linePath: string; fillPath: string } | null)[],
    pLength: number,
    startVirtualRow: number, // Virtual row index where this pattern starts
    opacity: number,
    keyPrefix: string
  ) => {
    return patternCurves.map((curve, channelIndex) => {
      if (!curve) return null;

      const pathData = paths[channelIndex];
      if (!pathData) return null;

      // Position this lane at the right edge of the channel
      const laneLeft = channelIndex * channelWidth + channelWidth - LANE_WIDTH - 4;
      const pHeight = pLength * rowHeight;
      const yOffset = startVirtualRow * rowHeight;

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
              d={pathData.fillPath}
              fill={color}
              fillOpacity={0.1 * opacity}
            />
            {/* Line */}
            <path
              d={pathData.linePath}
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
        prevPaths,
        prevLen,
        0, // Relative to this container's top (which is already offset)
        0.35,
        'prev'
      )}

      {/* Current pattern curves */}
      {renderPatternCurves(curves, currentPaths, patternLength, prevLen, 1, 'current')}

      {/* Next pattern curves (ghost, below) */}
      {nextCurves.length > 0 && renderPatternCurves(
        nextCurves,
        nextPaths,
        nextLen,
        prevLen + patternLength,
        0.35,
        'next'
      )}
    </div>
  );
};
