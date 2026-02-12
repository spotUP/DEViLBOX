/**
 * MacroLanes - Overlay showing internal macro values (cutoff, resonance, etc.) for all channels
 * Positioned to align with channel columns in the pattern editor
 */

import React, { useMemo, useCallback, useRef, useState } from 'react';
import { useTrackerStore } from '@stores';
import type { Pattern, TrackerCell } from '@typedefs';

interface MacroLanesProps {
  pattern: Pattern;
  rowHeight: number;
  channelCount: number;
  channelWidth: number;
  rowNumWidth: number;
}

// Get color based on parameter
const getParameterColor = (parameter: string): string => {
  const colors: Record<string, string> = {
    cutoff: '#22c55e',    // Green
    resonance: '#eab308', // Yellow
    envMod: '#06b6d4',    // Cyan
    pan: '#3b82f6',       // Blue
  };
  return colors[parameter] || '#22c55e';
};

const LANE_WIDTH = 14; // Slightly wider for interaction

// Generate SVG path strings for a single macro parameter
const generateMacroPaths = (
  cells: TrackerCell[],
  parameter: 'cutoff' | 'resonance' | 'envMod' | 'pan',
  rowHeight: number
): { linePath: string; points: { x: number; y: number }[] } => {
  const pathPoints: string[] = [];
  const points: { x: number; y: number }[] = [];

  for (let row = 0; row < cells.length; row++) {
    const value = cells[row][parameter];
    if (value !== undefined && value !== null) {
      // Scale 0-255 to 0-(LANE_WIDTH-2)
      const x = (value / 255) * (LANE_WIDTH - 4) + 2;
      const y = row * rowHeight + rowHeight / 2;
      pathPoints.push(`${pathPoints.length === 0 ? 'M' : 'L'} ${x} ${y}`);
      points.push({ x, y });
    }
  }

  return {
    linePath: pathPoints.join(' '),
    points,
  };
};

export const MacroLanes: React.FC<MacroLanesProps> = ({
  pattern,
  rowHeight,
  channelCount,
  channelWidth,
  rowNumWidth,
}) => {
  const columnVisibility = useTrackerStore((state) => state.columnVisibility);
  const setCell = useTrackerStore((state) => state.setCell);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeLane, setActiveLane] = useState<{ channelIndex: number, parameter: string } | null>(null);
  const activeLaneRef = useRef<{ channelIndex: number, parameter: string } | null>(null);

  const parameters: ('cutoff' | 'resonance' | 'envMod' | 'pan')[] = useMemo(() => {
    const active: ('cutoff' | 'resonance' | 'envMod' | 'pan')[] = [];
    if (columnVisibility.cutoff) active.push('cutoff');
    if (columnVisibility.resonance) active.push('resonance');
    if (columnVisibility.envMod) active.push('envMod');
    if (columnVisibility.pan) active.push('pan');
    return active;
  }, [columnVisibility]);

  const handleMouseMove = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!isDrawing || !activeLaneRef.current) return;

    const { channelIndex, parameter } = activeLaneRef.current;

    // Find the SVG element's bounding rect
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    // Calculate row from Y position
    const relativeY = e.clientY - rect.top;
    const rowIndex = Math.floor(relativeY / rowHeight);

    // Calculate value from X position within the lane
    if (rowIndex >= 0 && rowIndex < pattern.length) {
      // In a 14px lane, we use 2px padding on each side
      const laneX = e.clientX - rect.left;
      const normalizedX = Math.max(0, Math.min(1, (laneX - 2) / (LANE_WIDTH - 4)));
      const value = Math.round(normalizedX * 255);

      setCell(channelIndex, rowIndex, { [parameter]: value });
    }
  }, [isDrawing, pattern.length, rowHeight, setCell]);

  const handleGlobalMouseUp = useCallback(() => {
    setIsDrawing(false);
    activeLaneRef.current = null;
    setActiveLane(null);
  }, [setIsDrawing, setActiveLane]);

  const handleMouseDown = (channelIndex: number, parameter: string, e: React.MouseEvent) => {
    if (e.shiftKey) {
      // Clear point on shift-click
      const rect = e.currentTarget.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const rowIndex = Math.floor(relativeY / rowHeight);
      if (rowIndex >= 0 && rowIndex < pattern.length) {
        setCell(channelIndex, rowIndex, { [parameter]: undefined });
      }
      return;
    }
    setIsDrawing(true);
    const lane = { channelIndex, parameter };
    activeLaneRef.current = lane;
    setActiveLane(lane);
    handleMouseMove(e);
  };

  React.useEffect(() => {
    if (isDrawing) {
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isDrawing, handleGlobalMouseUp]);

  if (parameters.length === 0) return null;

  return (
    <div
      className="macro-lanes"
      style={{
        position: 'absolute',
        top: 0,
        left: rowNumWidth,
        right: 0,
        height: pattern.length * rowHeight,
        zIndex: 5,
        pointerEvents: 'none' // Sub-elements will have pointerEvents: 'auto'
      }}
    >
      {pattern.channels.map((channel, channelIndex) => {
        if (channelIndex >= channelCount) return null;

        return parameters.map((param) => {
          const { linePath, points } = generateMacroPaths(channel.rows, param, rowHeight);
          const color = getParameterColor(param);
          
          const paramIndex = parameters.indexOf(param);
          const laneLeft = channelIndex * channelWidth + channelWidth - (parameters.length - paramIndex) * (LANE_WIDTH + 2) - 4;

          return (
            <div
              key={`${channelIndex}-${param}`}
              onMouseDown={(e) => handleMouseDown(channelIndex, param, e)}
              onMouseMove={handleMouseMove}
              className="group cursor-crosshair"
              style={{
                position: 'absolute',
                left: laneLeft,
                top: 0,
                width: LANE_WIDTH,
                height: pattern.length * rowHeight,
                pointerEvents: 'auto',
                backgroundColor: isDrawing && activeLane?.channelIndex === channelIndex && activeLane?.parameter === param
                  ? 'rgba(255,255,255,0.05)' 
                  : 'transparent'
              }}
            >
              {/* Background track */}
              <div className="absolute inset-y-0 left-[2px] right-[2px] bg-white/5 opacity-0 group-hover:opacity-100" />
              
              <svg width={LANE_WIDTH} height={pattern.length * rowHeight}>
                {linePath && (
                  <path
                    d={linePath}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.5}
                    strokeOpacity={0.6}
                  />
                )}
                {points.map((pt, i) => (
                  <rect
                    key={i}
                    x={pt.x - 1.5}
                    y={pt.y - 1.5}
                    width={3}
                    height={3}
                    fill={color}
                    fillOpacity={0.9}
                    className="shadow-glow"
                  />
                ))}
              </svg>
            </div>
          );
        });
      })}
    </div>
  );
};