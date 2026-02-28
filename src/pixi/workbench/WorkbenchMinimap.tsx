/**
 * WorkbenchMinimap — Compact overview panel for the infinite workbench.
 *
 * - 150×100px panel rendered in Pixi Graphics
 * - All visible window rects mapped to minimap space as colored blocks
 * - Camera frustum shown as white outlined rectangle
 * - Click: spring-animate camera to clicked world position
 * - Drag frustum: pan camera live
 */

import React, { useCallback, useRef, useState } from 'react';
import type { FederatedPointerEvent, Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { springCameraTo, type CameraSpringHandle } from './WorkbenchExpose';
import { playMinimapClick } from './workbenchSounds';

const MAP_W = 150;
const MAP_H = 100;
const PADDING = 4; // inner padding px

// Per-window accent colours (cycled by index)
const WIN_COLORS = [
  0x4a9eff, 0xff6b4a, 0x4aff9e, 0xffcc4a, 0xcc4aff, 0x4affee,
];

interface Props {
  /** Screen width — used to compute the camera frustum rect */
  screenW: number;
  /** Screen height */
  screenH: number;
}

export const WorkbenchMinimap: React.FC<Props> = ({ screenW, screenH }) => {
  const theme = usePixiTheme();
  const camera  = useWorkbenchStore((s) => s.camera);
  const windows = useWorkbenchStore((s) => s.windows);
  const setCamera = useWorkbenchStore((s) => s.setCamera);

  const springRef = useRef<CameraSpringHandle | null>(null);
  const [dragging, setDragging] = useState(false);

  // Compute world bounding box across all windows (or fallback)
  const worldBounds = (() => {
    const wins = Object.values(windows).filter((w) => w.visible);
    if (wins.length === 0) return { x: 0, y: 0, w: 1920, h: 1080 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const w of wins) {
      minX = Math.min(minX, w.x);
      minY = Math.min(minY, w.y);
      maxX = Math.max(maxX, w.x + w.width);
      maxY = Math.max(maxY, w.y + w.height);
    }
    // Expand slightly so windows aren't right at the edge
    const margin = 200;
    return { x: minX - margin, y: minY - margin, w: (maxX - minX) + margin * 2, h: (maxY - minY) + margin * 2 };
  })();

  // World → minimap coordinate transform
  const innerW = MAP_W - PADDING * 2;
  const innerH = MAP_H - PADDING * 2;
  const worldToMap = useCallback((wx: number, wy: number) => ({
    x: PADDING + ((wx - worldBounds.x) / worldBounds.w) * innerW,
    y: PADDING + ((wy - worldBounds.y) / worldBounds.h) * innerH,
  }), [worldBounds, innerW, innerH]);

  // Minimap → world coordinate
  const mapToWorld = useCallback((mx: number, my: number) => ({
    x: worldBounds.x + ((mx - PADDING) / innerW) * worldBounds.w,
    y: worldBounds.y + ((my - PADDING) / innerH) * worldBounds.h,
  }), [worldBounds, innerW, innerH]);

  // Draw the minimap
  const drawMap = useCallback((g: GraphicsType) => {
    g.clear();

    // Background
    g.roundRect(0, 0, MAP_W, MAP_H, 4);
    g.fill({ color: 0x0a0a12, alpha: 0.92 });
    g.roundRect(0, 0, MAP_W, MAP_H, 4);
    g.stroke({ color: theme.border.color, alpha: 0.6, width: 1 });

    // Window rects
    const winEntries = Object.values(windows);
    winEntries.forEach((win, i) => {
      if (!win.visible) return;
      const tl = worldToMap(win.x, win.y);
      const br = worldToMap(win.x + win.width, win.y + win.height);
      const rectW = Math.max(2, br.x - tl.x);
      const rectH = Math.max(2, br.y - tl.y);
      const col = WIN_COLORS[i % WIN_COLORS.length];
      g.rect(tl.x, tl.y, rectW, rectH);
      g.fill({ color: col, alpha: win.minimized ? 0.15 : 0.35 });
      g.rect(tl.x, tl.y, rectW, rectH);
      g.stroke({ color: col, alpha: 0.7, width: 0.5 });
    });

    // Camera frustum
    // The camera shows a viewport of (screenW / scale) × (screenH / scale) world units
    // starting at screenToWorld(0,0)
    const frustumX = (0 - camera.x) / camera.scale;
    const frustumY = (0 - camera.y) / camera.scale;
    const frustumW = screenW / camera.scale;
    const frustumH = screenH / camera.scale;

    const ftl = worldToMap(frustumX, frustumY);
    const fbr = worldToMap(frustumX + frustumW, frustumY + frustumH);
    const fw = Math.max(4, fbr.x - ftl.x);
    const fh = Math.max(4, fbr.y - ftl.y);

    g.rect(ftl.x, ftl.y, fw, fh);
    g.fill({ color: 0xffffff, alpha: 0.06 });
    g.rect(ftl.x, ftl.y, fw, fh);
    g.stroke({ color: 0xffffff, alpha: 0.7, width: 1 });

    // Label
    g.rect(PADDING, MAP_H - 14, 40, 12);
    g.fill({ color: 0x000000, alpha: 0.4 });
  }, [camera, windows, screenW, screenH, worldToMap, theme]);

  // ─── Pointer interaction ────────────────────────────────────────────────────

  const dragStartRef = useRef<{
    mapX: number; mapY: number;
    camX: number; camY: number;
  } | null>(null);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    e.stopPropagation();
    const local = e.getLocalPosition(e.currentTarget as any);
    const mx = local.x;
    const my = local.y;

    // Check if click is inside frustum rect for drag
    const frustumX = (0 - camera.x) / camera.scale;
    const frustumY = (0 - camera.y) / camera.scale;
    const frustumW = screenW / camera.scale;
    const frustumH = screenH / camera.scale;
    const ftl = worldToMap(frustumX, frustumY);
    const fbr = worldToMap(frustumX + frustumW, frustumY + frustumH);

    const inFrustum = mx >= ftl.x && mx <= fbr.x && my >= ftl.y && my <= fbr.y;

    if (inFrustum) {
      // Drag frustum
      setDragging(true);
      dragStartRef.current = { mapX: mx, mapY: my, camX: camera.x, camY: camera.y };
    } else {
      // Click to warp: spring camera so clicked world pos is centered
      playMinimapClick();
      const worldPos = mapToWorld(mx, my);
      const targetX = screenW / 2 - worldPos.x * camera.scale;
      const targetY = screenH / 2 - worldPos.y * camera.scale;
      springRef.current?.cancel();
      springRef.current = springCameraTo({ x: targetX, y: targetY, scale: camera.scale });
    }

    const onMove = (me: PointerEvent) => {
      if (!dragStartRef.current) return;
      const dx = me.clientX - (e.clientX - local.x + dragStartRef.current.mapX);
      const dy = me.clientY - (e.clientY - local.y + dragStartRef.current.mapY);

      // Convert map delta to world delta, then to camera delta
      const worldDx = (dx / innerW) * worldBounds.w;
      const worldDy = (dy / innerH) * worldBounds.h;
      setCamera({
        x: dragStartRef.current.camX - worldDx * camera.scale,
        y: dragStartRef.current.camY - worldDy * camera.scale,
      });
    };

    const onUp = () => {
      setDragging(false);
      dragStartRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [camera, screenW, screenH, worldToMap, mapToWorld, innerW, innerH, worldBounds, setCamera]);

  return (
    <pixiContainer
      eventMode="static"
      cursor={dragging ? 'grabbing' : 'crosshair'}
      onPointerDown={handlePointerDown}
    >
      <pixiGraphics
        draw={drawMap}
        layout={{ width: MAP_W, height: MAP_H }}
      />
      {/* Zoom label */}
      <pixiBitmapText
        text={`${Math.round(camera.scale * 100)}%`}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
        tint={0x8080a0}
        x={PADDING + 2}
        y={MAP_H - 12}
      />
    </pixiContainer>
  );
};
