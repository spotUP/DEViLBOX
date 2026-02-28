/**
 * WorkbenchBackground — Infinite dot-grid canvas background.
 *
 * Renders a dot grid that scales with the workbench camera.
 * Dots appear at gridSize intervals; a coarser grid appears at zoom-out.
 * Redraws whenever the camera or canvas dimensions change.
 */

import React, { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import type { CameraState } from '@stores/useWorkbenchStore';

interface Props {
  width: number;
  height: number;
  camera: CameraState;
  gridSize?: number; // base grid interval in world units (default 40)
}

export const WorkbenchBackground: React.FC<Props> = ({
  width,
  height,
  camera,
  gridSize = 40,
}) => {
  const drawBg = useCallback(
    (g: GraphicsType) => {
      g.clear();

      // Fill background
      g.rect(0, 0, width, height);
      g.fill({ color: 0x0e0e14 });

      const scale = camera.scale;
      const offsetX = camera.x;
      const offsetY = camera.y;

      // Dot size scales with zoom — min 1px, max 3px
      const dotRadius = Math.max(0.5, Math.min(1.5, scale * 0.8));

      // Base grid pitch in screen pixels
      const pitch = gridSize * scale;

      // If grid is too dense, use a coarser step
      const step = pitch < 8 ? Math.ceil(8 / pitch) : 1;
      const effectivePitch = pitch * step;

      if (effectivePitch > 200) {
        // Zoomed way out — skip dots
        return;
      }

      // Find the first dot position in screen space
      const startX = ((offsetX % effectivePitch) + effectivePitch) % effectivePitch;
      const startY = ((offsetY % effectivePitch) + effectivePitch) % effectivePitch;

      // Dot color/alpha — fade with zoom
      const alpha = Math.max(0.08, Math.min(0.35, scale * 0.4));

      g.setStrokeStyle({ width: 0 });

      let col = startX;
      while (col <= width) {
        let row = startY;
        while (row <= height) {
          g.circle(col, row, dotRadius);
          g.fill({ color: 0x6060a0, alpha });
          row += effectivePitch;
        }
        col += effectivePitch;
      }

      // Major grid — every 4 cells, slightly brighter
      const majorPitch = effectivePitch * 4;
      if (majorPitch < width * 2) {
        const mStartX = ((offsetX % majorPitch) + majorPitch) % majorPitch;
        const mStartY = ((offsetY % majorPitch) + majorPitch) % majorPitch;
        const mAlpha = Math.max(0.12, Math.min(0.5, scale * 0.5));
        const mRadius = Math.max(1, Math.min(2.5, scale * 1.2));

        let mCol = mStartX;
        while (mCol <= width) {
          let mRow = mStartY;
          while (mRow <= height) {
            g.circle(mCol, mRow, mRadius);
            g.fill({ color: 0x8080c0, alpha: mAlpha });
            mRow += majorPitch;
          }
          mCol += majorPitch;
        }
      }
    },
    [width, height, camera.x, camera.y, camera.scale, gridSize]
  );

  return (
    <pixiGraphics
      draw={drawBg}
      layout={{ position: 'absolute', width, height }}
    />
  );
};
