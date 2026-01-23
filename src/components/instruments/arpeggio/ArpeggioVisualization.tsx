/**
 * ArpeggioVisualization - Waveform-style pattern visualization
 *
 * Displays the arpeggio pattern as a visual graph showing:
 * - Note offsets as vertical bars
 * - Current playback position
 * - Volume/gate as opacity/width modifiers
 */

import React, { useMemo } from 'react';
import type { ArpeggioStep, ArpeggioMode } from '@typedefs/instrument';

interface ArpeggioVisualizationProps {
  steps: ArpeggioStep[];
  currentStep: number;
  isPlaying: boolean;
  mode: ArpeggioMode;
  height?: number;
}

export const ArpeggioVisualization: React.FC<ArpeggioVisualizationProps> = ({
  steps,
  currentStep,
  isPlaying,
  mode,
  height = 80,
}) => {
  // Calculate visualization data
  const vizData = useMemo(() => {
    if (steps.length === 0) return { min: -12, max: 12, range: 24 };

    const offsets = steps.map((s) => s.noteOffset);
    const min = Math.min(...offsets, -12);
    const max = Math.max(...offsets, 12);
    const range = max - min || 24;

    return { min, max, range };
  }, [steps]);

  // Center line Y position (where offset 0 is)
  const centerY = height / 2;

  // Scale factor for note offsets
  const scale = (height - 20) / Math.max(vizData.range, 24);

  return (
    <div className="relative bg-gray-900/50 rounded-lg border border-gray-800 overflow-hidden">
      {/* Background grid */}
      <svg width="100%" height={height} className="absolute inset-0">
        {/* Horizontal center line (root note) */}
        <line
          x1="0"
          y1={centerY}
          x2="100%"
          y2={centerY}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {/* Octave lines */}
        {[-12, 12].map((offset) => {
          const y = centerY - offset * scale;
          if (y < 0 || y > height) return null;
          return (
            <line
              key={offset}
              x1="0"
              y1={y}
              x2="100%"
              y2={y}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
            />
          );
        })}
      </svg>

      {/* Steps visualization */}
      <svg width="100%" height={height} className="relative z-10">
        {steps.map((step, index) => {
          const stepWidth = 100 / steps.length;
          const x = index * stepWidth + stepWidth * 0.1;
          const barWidth = stepWidth * 0.8;

          // Calculate bar height and position
          const barHeight = Math.abs(step.noteOffset) * scale;
          const y = step.noteOffset >= 0 ? centerY - barHeight : centerY;

          // Visual modifiers
          const volume = (step.volume ?? 100) / 100;
          const gate = (step.gate ?? 100) / 100;
          const isActive = isPlaying && currentStep === index;

          // Colors based on direction and effects
          let fillColor = step.noteOffset >= 0 ? '#22c55e' : '#ef4444';
          if (step.effect === 'accent') fillColor = '#f59e0b';
          if (step.effect === 'slide') fillColor = '#3b82f6';
          if (step.effect === 'skip') fillColor = '#6b7280';

          // Opacity based on volume and active state
          const opacity = isActive ? 1 : 0.3 + volume * 0.5;

          return (
            <g key={index}>
              {/* Active indicator background */}
              {isActive && (
                <rect
                  x={`${x - stepWidth * 0.05}%`}
                  y="0"
                  width={`${stepWidth}%`}
                  height={height}
                  fill="rgba(234, 179, 8, 0.1)"
                />
              )}

              {/* Bar */}
              <rect
                x={`${x}%`}
                y={step.noteOffset >= 0 ? y : centerY}
                width={`${barWidth * gate}%`}
                height={barHeight || 2}
                fill={fillColor}
                opacity={opacity}
                rx="2"
                className="transition-all duration-75"
              />

              {/* Root indicator (small line at offset 0) */}
              {step.noteOffset === 0 && (
                <rect
                  x={`${x}%`}
                  y={centerY - 1}
                  width={`${barWidth * gate}%`}
                  height="2"
                  fill="#fff"
                  opacity={isActive ? 1 : 0.5}
                  rx="1"
                />
              )}

              {/* Step number */}
              <text
                x={`${x + barWidth / 2}%`}
                y={height - 4}
                fontSize="8"
                textAnchor="middle"
                fill={isActive ? '#eab308' : '#6b7280'}
                fontFamily="monospace"
              >
                {index}
              </text>
            </g>
          );
        })}

        {/* Mode indicator */}
        <g>
          {mode === 'pingpong' && (
            <text
              x="4"
              y="12"
              fontSize="9"
              fill="#818cf8"
              className="uppercase"
            >
              <tspan>Ping-pong</tspan>
            </text>
          )}
          {mode === 'oneshot' && (
            <text
              x="4"
              y="12"
              fontSize="9"
              fill="#f97316"
              className="uppercase"
            >
              <tspan>One-shot</tspan>
            </text>
          )}
          {mode === 'random' && (
            <text
              x="4"
              y="12"
              fontSize="9"
              fill="#ec4899"
              className="uppercase"
            >
              <tspan>Random</tspan>
            </text>
          )}
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute bottom-1 right-1 flex items-center gap-2 text-[8px] text-gray-600">
        <span className="flex items-center gap-0.5">
          <span className="w-2 h-2 bg-green-500 rounded-sm" /> +
        </span>
        <span className="flex items-center gap-0.5">
          <span className="w-2 h-2 bg-red-500 rounded-sm" /> -
        </span>
        <span className="flex items-center gap-0.5">
          <span className="w-2 h-2 bg-orange-500 rounded-sm" /> Acc
        </span>
      </div>
    </div>
  );
};
