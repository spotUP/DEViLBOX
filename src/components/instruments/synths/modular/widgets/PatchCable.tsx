/**
 * PatchCable - SVG bezier cable rendering
 *
 * Renders a smooth bezier curve between two ports.
 * Uses cubic bezier formula from openDAW reference.
 */

import React from 'react';
import type { SignalType } from '../../../../../types/modular';

interface PatchCableProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  signal?: SignalType;
  isSelected?: boolean;
  onClick?: () => void;
}

const SIGNAL_COLORS: Record<SignalType, string> = {
  audio: '#10b981', // green
  cv: '#eab308',    // yellow
  gate: '#ef4444',  // red
  trigger: '#3b82f6', // blue
};

export const PatchCable: React.FC<PatchCableProps> = ({
  x1,
  y1,
  x2,
  y2,
  color,
  signal = 'audio',
  isSelected = false,
  onClick,
}) => {
  // Cubic bezier control points (openDAW formula)
  const dx = x2 - x1;
  const controlPointOffset = Math.min(Math.abs(dx) * 0.5, 100);

  const c1x = x1 + controlPointOffset;
  const c1y = y1;
  const c2x = x2 - controlPointOffset;
  const c2y = y2;

  const pathData = `M ${x1},${y1} C ${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`;

  const strokeColor = color || SIGNAL_COLORS[signal];

  return (
    <g onClick={onClick} className="cursor-pointer">
      {/* Invisible thick line for easier clicking */}
      <path
        d={pathData}
        stroke="transparent"
        strokeWidth="12"
        fill="none"
        className="pointer-events-auto"
      />

      {/* Visible cable */}
      <path
        d={pathData}
        stroke={strokeColor}
        strokeWidth={isSelected ? '3' : '2'}
        fill="none"
        className="transition-all pointer-events-none"
        style={{
          filter: isSelected ? `drop-shadow(0 0 4px ${strokeColor})` : 'none',
        }}
      />

      {/* Connection points */}
      <circle cx={x1} cy={y1} r="2" fill={strokeColor} className="pointer-events-none" />
      <circle cx={x2} cy={y2} r="2" fill={strokeColor} className="pointer-events-none" />
    </g>
  );
};
