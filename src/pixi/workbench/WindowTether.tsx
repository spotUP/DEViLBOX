/**
 * WindowTether — Animated glowing bezier line between two workbench windows.
 *
 * Drawn in world space inside the camera-transformed container.
 * Pulse: opacity oscillates at ~0.5 Hz between 0.25 and 0.55.
 * Glow: two passes — wide dim halo + narrow bright core.
 *
 * Positions are read via getState() each RAF frame so the tether
 * tracks window drag without triggering React re-renders.
 */

import React, { useEffect, useRef } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { usePixiTheme } from '../theme';
import { TITLE_H } from './PixiWindow';

interface WindowTetherProps {
  fromId: string;
  toId: string;
  /** Current camera scale — used to keep line width constant on screen */
  cameraScale: number;
}

export const WindowTether: React.FC<WindowTetherProps> = ({ fromId, toId, cameraScale }) => {
  const theme = usePixiTheme();

  // Subscribe only to visibility — positions are read via getState() in RAF loop
  const fromActive = useWorkbenchStore(
    (s) => !!(s.windows[fromId]?.visible && !s.windows[fromId]?.minimized),
  );
  const toActive = useWorkbenchStore(
    (s) => !!(s.windows[toId]?.visible && !s.windows[toId]?.minimized),
  );
  const active = fromActive && toActive;

  const gfxRef   = useRef<GraphicsType>(null);
  const rafRef   = useRef<number>(0);
  // Keep refs in sync with latest props so RAF loop always reads current values
  const scaleRef = useRef(cameraScale);
  const colorRef = useRef(theme.accent.color);
  scaleRef.current = cameraScale;
  colorRef.current = theme.accent.color;

  useEffect(() => {
    const g = gfxRef.current;
    if (!active) {
      cancelAnimationFrame(rafRef.current);
      g?.clear();
      return;
    }

    const startTime = performance.now();

    const tick = () => {
      const g2 = gfxRef.current;
      if (!g2) return;

      const { windows } = useWorkbenchStore.getState();
      const from = windows[fromId];
      const to   = windows[toId];

      if (!from?.visible || from.minimized || !to?.visible || to.minimized) {
        g2.clear();
        return; // Stop looping — effect will restart when visibility changes
      }

      // Pulse alpha 0.25→0.55 at ~0.5 Hz
      const t     = (performance.now() - startTime) / 1000;
      const alpha = 0.25 + 0.15 * (Math.sin(t * Math.PI) * 0.5 + 0.5);

      // Attachment: right-centre of `from` → left-centre of `to`
      const x1 = from.x + from.width;
      const y1 = from.y + TITLE_H / 2;
      const x2 = to.x;
      const y2 = to.y + TITLE_H / 2;

      // Cubic bezier control points — horizontal tangents
      const cpX   = Math.abs(x2 - x1) * 0.35 + 40;
      const s     = scaleRef.current;
      const lineW = Math.max(0.5, 1.5 / s);
      const color = colorRef.current;

      g2.clear();
      // Outer glow pass (wide, faint)
      g2.moveTo(x1, y1);
      g2.bezierCurveTo(x1 + cpX, y1, x2 - cpX, y2, x2, y2);
      g2.stroke({ color, alpha: alpha * 0.2, width: lineW * 6 });
      // Core line
      g2.moveTo(x1, y1);
      g2.bezierCurveTo(x1 + cpX, y1, x2 - cpX, y2, x2, y2);
      g2.stroke({ color, alpha, width: lineW });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      gfxRef.current?.clear();
    };
  }, [active, fromId, toId]);

  return <pixiGraphics ref={gfxRef} />;
};
