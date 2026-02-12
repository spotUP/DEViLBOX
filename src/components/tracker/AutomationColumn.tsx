/**
 * AutomationColumn - Visual representation of automation curves in the pattern editor
 * Shows a narrow column next to each channel with the automation curve visualization
 */

import React, { useMemo } from 'react';
import { useAutomationStore } from '@stores';
import { interpolateAutomationValue } from '@typedefs/automation';

interface AutomationColumnProps {
  channelIndex: number;
  patternId: string;
  patternLength: number;
  rowHeight: number;
  scrollOffset: number;
  containerHeight: number;
  parameter?: string; // Default to 'cutoff'
}

import { getSectionColor } from '@hooks/useChannelAutomationParams';
import { getNKSParametersForSynth } from '@/midi/performance/synthParameterMaps';
import { useInstrumentStore, useTrackerStore } from '@stores';
import type { SynthType } from '@typedefs/instrument';

// Get color based on parameter's NKS section (resolved from instrument)
const useParameterColor = (parameter: string, channelIndex: number): string => {
  const patterns = useTrackerStore((s) => s.patterns);
  const currentPatternIndex = useTrackerStore((s) => s.currentPatternIndex);
  const instruments = useInstrumentStore((s) => s.instruments);

  return React.useMemo(() => {
    const pattern = patterns[currentPatternIndex];
    if (!pattern) return 'var(--color-synth-filter)';
    const channel = pattern.channels[channelIndex];
    if (!channel || channel.instrumentId === null) return 'var(--color-synth-filter)';
    const instrument = instruments.find((i) => i.id === channel.instrumentId);
    if (!instrument) return 'var(--color-synth-filter)';

    const nksParams = getNKSParametersForSynth(instrument.synthType as SynthType);
    const nksParam = nksParams.find((p) => p.id === parameter);
    return nksParam ? getSectionColor(nksParam.section) : 'var(--color-synth-filter)';
  }, [parameter, channelIndex, patterns, currentPatternIndex, instruments]);
};

export const AutomationColumn: React.FC<AutomationColumnProps> = ({
  channelIndex,
  patternId,
  patternLength,
  rowHeight,
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
      const value = interpolateAutomationValue(curve.points, row, curve.interpolation, curve.mode);
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
      const value = interpolateAutomationValue(curve.points, row, curve.interpolation, curve.mode);
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

  const color = useParameterColor(parameter, channelIndex);

  return (
    <div
      className="automation-column"
      style={{
        width: 24,
        height: patternLength * rowHeight,
        position: 'relative',
        background: 'var(--color-bg)',
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
  channelIndex?: number;
  onParameterChange?: (param: string) => void;
}> = ({ parameter, channelIndex = 0 }) => {
  const color = useParameterColor(parameter, channelIndex);

  return (
    <div
      className="flex items-center justify-center text-[8px] font-mono uppercase"
      style={{
        width: 24,
        height: '100%',
        background: 'var(--color-bg-secondary)',
        borderRight: '1px solid var(--color-border)',
        color: color,
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        transform: 'rotate(180deg)',
      }}
    >
      {(parameter.includes('.') ? parameter.split('.').pop()! : parameter).slice(0, 3)}
    </div>
  );
};
