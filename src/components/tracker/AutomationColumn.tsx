/**
 * AutomationColumn - Visual representation of automation curves in the pattern editor
 * Shows a narrow column next to each channel with the automation curve visualization
 */

import React, { useMemo } from 'react';
import { useAutomationStore } from '@stores';
import type { AutomationCurve } from '@typedefs/automation';

interface AutomationColumnProps {
  channelIndex: number;
  patternId: string;
  patternLength: number;
  rowHeight: number;
  scrollOffset: number;
  containerHeight: number;
  parameter?: string; // Default to 'cutoff'
}

// Interpolate value between automation points
const getInterpolatedValue = (
  curve: AutomationCurve,
  row: number
): number | null => {
  if (!curve || curve.points.length === 0) return null;

  const points = curve.points;

  // Find surrounding points
  let before = null;
  let after = null;

  for (let i = 0; i < points.length; i++) {
    if (points[i].row <= row) {
      before = points[i];
    }
    if (points[i].row >= row) {
      after = points[i];
      break;
    }
  }

  // Exact match or single point cases
  if (before && before.row === row) return before.value;
  if (after && after.row === row) return after.value;
  if (!before && after) return after.value;
  if (before && !after) return before.value;

  // Interpolate
  if (before && after) {
    const t = (row - before.row) / (after.row - before.row);
    return before.value + (after.value - before.value) * t;
  }

  return null;
};

// Get color based on parameter type
const getParameterColor = (parameter: string): string => {
  switch (parameter) {
    case 'cutoff':
      return '#00d4aa'; // Teal
    case 'resonance':
      return '#00d4aa';
    case 'envMod':
      return '#7c3aed'; // Purple
    case 'decay':
      return '#7c3aed';
    case 'accent':
      return '#f59e0b'; // Orange
    case 'overdrive':
    case 'distortion':
      return '#ef4444'; // Red
    case 'volume':
      return '#22c55e'; // Green
    case 'pan':
      return '#3b82f6'; // Blue
    case 'delay':
    case 'reverb':
      return '#8b5cf6'; // Violet
    default:
      return '#00d4aa';
  }
};

export const AutomationColumn: React.FC<AutomationColumnProps> = ({
  channelIndex,
  patternId,
  patternLength,
  rowHeight,
  scrollOffset: _scrollOffset,
  containerHeight: _containerHeight,
  parameter = 'cutoff',
}) => {
  const { getAutomation } = useAutomationStore();

  // Get the automation curve for this channel and parameter
  const curve = useMemo(() => {
    return getAutomation(patternId, channelIndex, parameter);
  }, [patternId, channelIndex, parameter, getAutomation]);

  // Generate SVG path for the curve
  const { path, hasData } = useMemo(() => {
    if (!curve || curve.points.length === 0) {
      return { path: '', hasData: false };
    }

    const width = 24; // Column width
    const points: string[] = [];

    // Generate value for each row
    for (let row = 0; row < patternLength; row++) {
      const value = getInterpolatedValue(curve, row);
      if (value !== null) {
        const x = value * (width - 4) + 2; // Map 0-1 to 2-(width-2)
        const y = row * rowHeight + rowHeight / 2;
        points.push(`${row === 0 ? 'M' : 'L'} ${x} ${y}`);
      }
    }

    return {
      path: points.join(' '),
      hasData: points.length > 0,
    };
  }, [curve, patternLength, rowHeight]);

  // Generate fill area path (from the curve to the left edge)
  const fillPath = useMemo(() => {
    if (!curve || curve.points.length === 0) {
      return '';
    }

    const width = 24;
    const height = patternLength * rowHeight;
    const points: string[] = [];

    // Start from bottom-left
    points.push(`M 0 ${height}`);

    // Generate value for each row (going up)
    for (let row = patternLength - 1; row >= 0; row--) {
      const value = getInterpolatedValue(curve, row);
      if (value !== null) {
        const x = value * (width - 4) + 2;
        const y = row * rowHeight + rowHeight / 2;
        points.push(`L ${x} ${y}`);
      }
    }

    // Close to top-left and back to start
    points.push(`L 0 0`);
    points.push(`Z`);

    return points.join(' ');
  }, [curve, patternLength, rowHeight]);

  const color = getParameterColor(parameter);

  return (
    <div
      className="automation-column"
      style={{
        width: 24,
        height: patternLength * rowHeight,
        position: 'relative',
        background: '#0d0d0f',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {hasData ? (
        <svg
          width={24}
          height={patternLength * rowHeight}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {/* Fill area */}
          <path
            d={fillPath}
            fill={color}
            fillOpacity={0.15}
          />
          {/* Curve line */}
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Points */}
          {curve.points.map((point, i) => (
            <circle
              key={i}
              cx={point.value * 20 + 2}
              cy={point.row * rowHeight + rowHeight / 2}
              r={2}
              fill={color}
            />
          ))}
        </svg>
      ) : (
        // Empty state - subtle indicator
        <div
          className="absolute inset-0 flex items-center justify-center text-text-muted opacity-20"
          style={{ fontSize: 8 }}
        >
          ~
        </div>
      )}
    </div>
  );
};

// Header component for the automation column
export const AutomationColumnHeader: React.FC<{
  parameter: string;
  onParameterChange?: (param: string) => void;
}> = ({ parameter }) => {
  const color = getParameterColor(parameter);

  return (
    <div
      className="flex items-center justify-center text-[8px] font-mono uppercase"
      style={{
        width: 24,
        height: '100%',
        background: '#111113',
        borderRight: '1px solid var(--color-border)',
        color: color,
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        transform: 'rotate(180deg)',
      }}
    >
      {parameter.slice(0, 3)}
    </div>
  );
};
