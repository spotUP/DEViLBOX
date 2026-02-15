/**
 * PatchCable - SVG cable rendering
 *
 * Renders smart orthogonal routes between ports with rounded corners.
 * Routes avoid UI elements by using horizontal/vertical segments.
 */

import React from 'react';
import type { SignalType } from '../../../../../types/modular';
import { calculateCablePath } from '../utils/cableRouting';

interface PatchCableProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  signal?: SignalType;
  isSelected?: boolean;
  onClick?: () => void;
  useOrthogonal?: boolean; // Use orthogonal routing (default: true)
  laneOffset?: number; // Horizontal lane offset for cable spreading
  obstacles?: { x: number; y: number; w: number; h: number }[]; // Module bounding boxes
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
  useOrthogonal = true,
  laneOffset = 0,
  obstacles = [],
}) => {
  // Calculate cable path (orthogonal or bezier) with lane offset for spreading and obstacle avoidance
  const pathData = calculateCablePath(x1, y1, x2, y2, useOrthogonal, 8, laneOffset, obstacles);

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
        strokeWidth={isSelected ? '4' : '3'}
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
