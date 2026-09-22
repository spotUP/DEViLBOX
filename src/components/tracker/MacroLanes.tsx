/**
 * MacroLanes - Overlay showing internal macro values (cutoff, resonance, etc.) for all channels
 * Positioned to align with channel columns in the pattern editor
 */

import React, { useMemo, useCallback, useRef, useState } from 'react';
import { useTrackerStore, useEditorStore } from '@stores';
import type { Pattern, TrackerCell } from '@typedefs';

interface MacroLanesProps {
  pattern: Pattern;
  rowHeight: number;
  channelCount: number;
  channelOffsets: number[];
  channelWidths: number[];
  rowNumWidth: number;
}

// Get color based on parameter
// ... (rest of the helper functions)
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

export const MacroLanes: React.FC<MacroLanesProps> = React.memo(({
  pattern,
  rowHeight,
  channelCount,
  channelOffsets,
  channelWidths,
  rowNumWidth: _rowNumWidth,
}) => {
  const columnVisibility = useEditorStore((state) => state.columnVisibility);
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

  const handlePointerMove = useCallback((e: React.PointerEvent | React.MouseEvent) => {
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

  const endDrawing = useCallback(() => {
    setIsDrawing(false);
    activeLaneRef.current = null;
    setActiveLane(null);
  }, [setIsDrawing, setActiveLane]);

  const handlePointerDown = (channelIndex: number, parameter: string, e: React.PointerEvent) => {
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
    // Capture so a lane drawn with a finger keeps drawing when the finger
    // crosses into the next lane, and releases on pointercancel — the shape
    // in src/components/controls/Fader.tsx.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no capture here */ }
    setIsDrawing(true);
    const lane = { channelIndex, parameter };
    activeLaneRef.current = lane;
    setActiveLane(lane);
    handlePointerMove(e);
  };

  // A pointer released outside any lane still ends the draw. `pointerup` and
  // `pointercancel` both count — the second is the one a mouse never sends and
  // a finger does, when the browser takes the pointer away.
  React.useEffect(() => {
    if (!isDrawing) return;
    window.addEventListener('pointerup', endDrawing);
    window.addEventListener('pointercancel', endDrawing);
    return () => {
      window.removeEventListener('pointerup', endDrawing);
      window.removeEventListener('pointercancel', endDrawing);
    };
  }, [isDrawing, endDrawing]);

  if (parameters.length === 0) return null;

  return (
    <div
      className="macro-lanes"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: pattern.length * rowHeight,
        zIndex: 5,
        pointerEvents: 'none' // Sub-elements will have pointerEvents: 'auto'
      }}
    >
      {pattern.channels.map((channel, channelIndex) => {
        if (channelIndex >= channelCount) return null;
        if (channel.collapsed) return null;

        const colX = channelOffsets[channelIndex];
        const channelWidth = channelWidths[channelIndex];

        return parameters.map((param) => {
          const { linePath, points } = generateMacroPaths(channel.rows, param, rowHeight);
          const color = getParameterColor(param);
          
          const paramIndex = parameters.indexOf(param);
          const laneLeft = colX + channelWidth - (parameters.length - paramIndex) * (LANE_WIDTH + 2) - 4;

          return (
            <div
              key={`${channelIndex}-${param}`}
              onPointerDown={(e) => handlePointerDown(channelIndex, param, e)}
              onPointerMove={handlePointerMove}
              className="group cursor-crosshair"
              style={{
                touchAction: 'none',
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
});