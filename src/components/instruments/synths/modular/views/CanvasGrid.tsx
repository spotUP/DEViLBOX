/**
 * CanvasGrid - Background grid for canvas view
 *
 * Renders a repeating dot grid that scales with zoom.
 */

import React from 'react';

interface CanvasGridProps {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export const CanvasGrid: React.FC<CanvasGridProps> = ({ zoom, offsetX, offsetY }) => {
  const gridSize = 16; // 16px grid spacing at zoom=1
  const scaledSize = gridSize * zoom;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    >
      <defs>
        <pattern
          id="canvas-grid"
          width={scaledSize}
          height={scaledSize}
          patternUnits="userSpaceOnUse"
          x={offsetX}
          y={offsetY}
        >
          <circle
            cx={scaledSize / 2}
            cy={scaledSize / 2}
            r={Math.max(0.8, zoom * 1.2)}
            fill="var(--color-text-muted)"
            opacity="0.3"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#canvas-grid)" />
    </svg>
  );
};
