/**
 * WorkbenchBackground — Infinite dot-grid canvas background.
 *
 * Renders a dot grid that scales with the workbench camera.
 * Dots appear at gridSize intervals; a coarser grid appears at zoom-out.
 * Redraws whenever the camera or canvas dimensions change.
 */

import React, { useCallback, useLayoutEffect, useRef } from 'react';
import type { Container as ContainerType, Graphics as GraphicsType } from 'pixi.js';
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
  const dotsContainerRef = useRef<ContainerType>(null);

  // ── Compute effective pitch (depends on scale only) ──────────────────────
  const pitch = gridSize * camera.scale;
  const step = pitch < 8 ? Math.ceil(8 / pitch) : 1;
  const effectivePitch = pitch * step;

  // ── Reposition dots container on pan — no graphics rebuild ───────────────
  useLayoutEffect(() => {
    const el = dotsContainerRef.current;
    if (!el) return;
    if (effectivePitch > 200) {
      el.x = 0; el.y = 0;
      return;
    }
    // Shift so dot[0] aligns with the camera pan offset
    const startX = ((camera.x % effectivePitch) + effectivePitch) % effectivePitch;
    const startY = ((camera.y % effectivePitch) + effectivePitch) % effectivePitch;
    el.x = startX - effectivePitch;
    el.y = startY - effectivePitch;
  }, [camera.x, camera.y, effectivePitch]);

  // ── Solid background — only resizes on viewport change ───────────────────
  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: 0x0e0e14 });
  }, [width, height]);

  // ── Dot grid — redraws only when zoom or viewport changes ────────────────
  // Draw from 0 to bufW/bufH (one extra tile on all sides).
  // Container position (above) handles the pan offset.
  const drawDots = useCallback((g: GraphicsType) => {
    g.clear();
    const p = gridSize * camera.scale;
    const s = p < 8 ? Math.ceil(8 / p) : 1;
    const ep = p * s;
    if (ep > 200) return;

    const bufW = width  + ep * 2;
    const bufH = height + ep * 2;
    const dotRadius = Math.max(0.5, Math.min(1.5, camera.scale * 0.8));
    const alpha     = Math.max(0.08, Math.min(0.35, camera.scale * 0.4));

    g.setStrokeStyle({ width: 0 });

    // Minor dots — one batch fill
    let col = 0;
    while (col <= bufW) {
      let row = 0;
      while (row <= bufH) {
        g.circle(col, row, dotRadius);
        row += ep;
      }
      col += ep;
    }
    g.fill({ color: 0x6060a0, alpha });

    // Major dots (every 4 cells) — one batch fill
    const majorPitch = ep * 4;
    if (majorPitch < bufW * 2) {
      const mAlpha  = Math.max(0.12, Math.min(0.5, camera.scale * 0.5));
      const mRadius = Math.max(1, Math.min(2.5, camera.scale * 1.2));
      let mCol = 0;
      while (mCol <= bufW) {
        let mRow = 0;
        while (mRow <= bufH) {
          g.circle(mCol, mRow, mRadius);
          mRow += majorPitch;
        }
        mCol += majorPitch;
      }
      g.fill({ color: 0x8080c0, alpha: mAlpha });
    }
  }, [width, height, camera.scale, gridSize]); // ← NO camera.x, camera.y

  const dotsW = width  + effectivePitch * 2;
  const dotsH = height + effectivePitch * 2;

  return (
    <>
      <pixiGraphics
        draw={drawBg}
        layout={{ position: 'absolute', width, height }}
      />
      <pixiContainer
        ref={dotsContainerRef}
        layout={{ position: 'absolute', width: 0, height: 0 }}
      >
        <pixiGraphics
          draw={drawDots}
          layout={{ position: 'absolute', width: dotsW, height: dotsH }}
        />
      </pixiContainer>
    </>
  );
};
