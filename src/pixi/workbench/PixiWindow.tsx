/**
 * PixiWindow — Floating window chrome for the infinite workbench.
 *
 * Features (Phase 1+2):
 *  - Title bar: drag to move, chrome buttons (close/minimize/focus)
 *  - 8 resize handles (corners + edges)
 *  - Spring pop-in animation on open; spring pop-out on close
 *  - Squash-and-stretch on landing
 *  - Momentum/throw: track velocity during drag, apply on release
 *  - Edge bounce: reflect velocity when window leaves viewport
 *  - Minimize: spring-collapse to compact strip at bottom of viewport
 *
 * Animation strategy: direct Pixi container manipulation via ref
 * (avoids 60fps React re-renders during animation).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Rectangle } from 'pixi.js';
import type { Container as ContainerType, FederatedPointerEvent, Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { useWorkbenchStore, type WindowState, type CameraState } from '@stores/useWorkbenchStore';
import {
  springEase,
  squashStretch,
  VelocityTracker,
  stepMomentum,
  applyEdgeBounce,
  type MomentumState,
} from './springPhysics';
import { useSetSnapLines } from './WorkbenchContainer';
import { computeSnap } from './windowSnap';
import { playWindowOpen, playWindowClose, playSnap } from './workbenchSounds';

export const TITLE_H = 28;
const HANDLE_SIZE = 8;
const MIN_W = 200;
const MIN_H = 150;

/** Duration of open/close spring animation in ms */
const SPRING_DURATION = 500;

/** Minimum velocity to trigger momentum throw (world units/sec) */
const THROW_THRESHOLD = 120;

/** Height of a minimized window strip (title bar only) */
const MINIMIZED_H = TITLE_H + 4;
/** Spacing between minimized windows in screen space */
const MINIMIZED_SLOT_W = 200;

type ResizeDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

// ─── Resize handle ────────────────────────────────────────────────────────────

interface ResizeHandleProps {
  dir: ResizeDir;
  winState: WindowState;
  camera: CameraState;
  onResizeStart: (dir: ResizeDir, e: FederatedPointerEvent) => void;
}

const CURSOR_MAP: Record<ResizeDir, string> = {
  nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize',
  e: 'e-resize',   se: 'se-resize', s: 's-resize',
  sw: 'sw-resize', w: 'w-resize',
};

const ResizeHandle: React.FC<ResizeHandleProps> = ({ dir, winState, onResizeStart }) => {
  const { width: w, height: h } = winState;
  const s = HANDLE_SIZE;
  let hx = 0, hy = 0, hw = s, hh = s;

  switch (dir) {
    case 'nw': hx = 0;     hy = 0;     hw = s;      hh = s;      break;
    case 'n':  hx = s;     hy = 0;     hw = w-s*2;  hh = s;      break;
    case 'ne': hx = w-s;   hy = 0;     hw = s;      hh = s;      break;
    case 'e':  hx = w-s;   hy = s;     hw = s;      hh = h-s*2;  break;
    case 'se': hx = w-s;   hy = h-s;   hw = s;      hh = s;      break;
    case 's':  hx = s;     hy = h-s;   hw = w-s*2;  hh = s;      break;
    case 'sw': hx = 0;     hy = h-s;   hw = s;      hh = s;      break;
    case 'w':  hx = 0;     hy = s;     hw = s;      hh = h-s*2;  break;
  }

  const drawHandle = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, hw, hh);
    g.fill({ color: 0xffffff, alpha: 0 });
  }, [hw, hh]);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    onResizeStart(dir, e);
  }, [dir, onResizeStart]);

  return (
    <pixiContainer x={hx} y={hy}>
      <pixiGraphics
        draw={drawHandle}
        eventMode="static"
        cursor={CURSOR_MAP[dir]}
        onPointerDown={handlePointerDown}
        layout={{ width: hw, height: hh }}
      />
    </pixiContainer>
  );
};

// ─── PixiWindow ───────────────────────────────────────────────────────────────

interface PixiWindowProps {
  id: string;
  title: string;
  camera: CameraState;
  /** Screen dimensions — needed for edge bounce viewport calc */
  screenW: number;
  screenH: number;
  /** NavBar height — used as origin for pop-in animation */
  navBarH?: number;
  /** Called when the green focus (◎) button is clicked */
  onFocus?: (id: string) => void;
  children?: React.ReactNode;
}

export const PixiWindow: React.FC<PixiWindowProps> = ({
  id, title, camera, screenW, screenH, onFocus, children,
}) => {
  const theme = usePixiTheme();
  const winState = useWorkbenchStore((s) => s.windows[id]);
  const bringToFront   = useWorkbenchStore((s) => s.bringToFront);
  const moveWindow     = useWorkbenchStore((s) => s.moveWindow);
  const resizeWindow   = useWorkbenchStore((s) => s.resizeWindow);
  const hideWindow     = useWorkbenchStore((s) => s.hideWindow);
  const minimizeWindow = useWorkbenchStore((s) => s.minimizeWindow);
  const restoreWindow  = useWorkbenchStore((s) => s.restoreWindow);
  const snapToGrid        = useWorkbenchStore((s) => s.snapToGrid);
  const gridSize          = useWorkbenchStore((s) => s.gridSize);
  const activeWindowId    = useWorkbenchStore((s) => s.activeWindowId);
  const setActiveWindowId = useWorkbenchStore((s) => s.setActiveWindowId);
  const setSnapLines      = useSetSnapLines();

  const focused = activeWindowId === id;
  const [animVisible, setAnimVisible] = useState(winState?.visible ?? false);

  // Ref to the outer container for direct Pixi manipulation
  const outerRef = useRef<ContainerType>(null);

  // Track previous visibility to detect changes
  const prevVisibleRef = useRef<boolean>(winState?.visible ?? false);

  // Animation RAF handle
  const animRafRef = useRef<number>(0);
  const animStartRef = useRef<number>(0);
  const animDirRef = useRef<'open' | 'close'>('open');

  // Drag state
  const dragRef = useRef<{
    active: boolean;
    startGX: number; startGY: number;
    startWX: number; startWY: number;
  } | null>(null);

  // Velocity tracker for throw
  const velocityTrackerRef = useRef(new VelocityTracker());

  // Momentum RAF handle
  const momentumRafRef = useRef<number>(0);

  // Resize state
  const resizeRef = useRef<{
    active: boolean;
    dir: ResizeDir;
    startGX: number; startGY: number;
    startWX: number; startWY: number;
    startW: number;  startH: number;
  } | null>(null);

  // Live store ref (avoid stale closure)
  const storeRef = useRef({ moveWindow, resizeWindow, winState, camera, screenW, screenH, snapToGrid, gridSize, setSnapLines });
  storeRef.current = { moveWindow, resizeWindow, winState, camera, screenW, screenH, snapToGrid, gridSize, setSnapLines };

  // ─── Spring open/close animation ────────────────────────────────────────────

  const runSpring = useCallback((dir: 'open' | 'close', onDone?: () => void) => {
    cancelAnimationFrame(animRafRef.current);
    animDirRef.current = dir;
    animStartRef.current = performance.now();

    if (dir === 'open') setAnimVisible(true);

    const tick = () => {
      const elapsed = performance.now() - animStartRef.current;
      const t = Math.min(1, elapsed / SPRING_DURATION);

      let progress = dir === 'open' ? springEase(t) : 1 - springEase(1 - t, 8, 6);
      // Clamp negative values (spring can dip below 0 on close)
      progress = Math.max(0, progress);

      const sq = squashStretch(dir === 'open' ? t : 1 - t);
      const sx = progress * sq.scaleX;
      const sy = progress * sq.scaleY;

      // Direct Pixi manipulation for smooth animation
      const el = outerRef.current;
      if (el) {
        el.scale.x = sx;
        el.scale.y = sy;
        // Keep pivot at center
        const w = storeRef.current.winState?.width ?? 400;
        const h = storeRef.current.winState?.height ?? 300;
        el.pivot.set(w / 2, h / 2);
        el.x = (storeRef.current.winState?.x ?? 0) + w / 2;
        el.y = (storeRef.current.winState?.y ?? 0) + h / 2;
      }

      if (t < 1) {
        animRafRef.current = requestAnimationFrame(tick);
      } else {
        // Animation complete
        if (el) {
          el.scale.set(1);
          el.pivot.set(0, 0);
          el.x = storeRef.current.winState?.x ?? 0;
          el.y = storeRef.current.winState?.y ?? 0;
        }
        if (dir === 'close') setAnimVisible(false);
        onDone?.();
      }
    };

    animRafRef.current = requestAnimationFrame(tick);
  }, []);

  // Watch for visibility changes
  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    const isVisible = winState?.visible ?? false;
    prevVisibleRef.current = isVisible;

    if (isVisible && !wasVisible) {
      // Window just opened
      playWindowOpen();
      runSpring('open');
    } else if (!isVisible && wasVisible) {
      // Window just closed — animate out, then mark invisible
      runSpring('close');
    }
  }, [winState?.visible, runSpring]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRafRef.current);
      cancelAnimationFrame(momentumRafRef.current);
    };
  }, []);

  // ─── Viewport edge bounds (world space) ─────────────────────────────────────

  const getViewportBounds = useCallback(() => {
    const cam = storeRef.current.camera;
    const sw = storeRef.current.screenW;
    const sh = storeRef.current.screenH;
    return {
      viewL: (0 - cam.x) / cam.scale,
      viewT: (0 - cam.y) / cam.scale,
      viewR: (sw - cam.x) / cam.scale,
      viewB: (sh - cam.y) / cam.scale,
    };
  }, []);

  // ─── Title bar drag + momentum ──────────────────────────────────────────────

  const handleTitlePointerDown = useCallback((e: FederatedPointerEvent) => {
    e.stopPropagation();
    bringToFront(id);
    setActiveWindowId(id);

    // Cancel any active momentum
    cancelAnimationFrame(momentumRafRef.current);

    const w = storeRef.current.winState;
    dragRef.current = {
      active: true,
      startGX: e.globalX,
      startGY: e.globalY,
      startWX: w.x,
      startWY: w.y,
    };
    velocityTrackerRef.current.reset();
    velocityTrackerRef.current.push(e.globalX, e.globalY);

    let wasSnapped = false; // track snap state to play sound only on first snap

    const onMove = (me: PointerEvent) => {
      if (!dragRef.current?.active) return;
      const { startGX, startGY, startWX, startWY } = dragRef.current;
      const cam = storeRef.current.camera;
      const dx = (me.clientX - startGX) / cam.scale;
      const dy = (me.clientY - startGY) / cam.scale;
      const proposedX = startWX + dx;
      const proposedY = startWY + dy;
      // Snap against other windows and grid
      const allWindows = useWorkbenchStore.getState().windows;
      const ws = storeRef.current.winState;
      const snapResult = computeSnap(
        id, proposedX, proposedY, ws.width, ws.height,
        allWindows, storeRef.current.snapToGrid, storeRef.current.gridSize, 20,
      );
      storeRef.current.moveWindow(id, snapResult.x, snapResult.y);
      storeRef.current.setSnapLines(snapResult.lines);
      if (snapResult.snapped && !wasSnapped) playSnap();
      wasSnapped = snapResult.snapped;
      velocityTrackerRef.current.push(me.clientX, me.clientY);
    };

    const onUp = (me: PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      // Clear snap guide lines (triggers 300ms fade-out)
      storeRef.current.setSnapLines([]);

      // Compute throw velocity
      velocityTrackerRef.current.push(me.clientX, me.clientY);
      const cam = storeRef.current.camera;
      const { vx, vy } = velocityTrackerRef.current.getVelocity(cam.scale);
      const speed = Math.sqrt(vx * vx + vy * vy);

      if (speed > THROW_THRESHOLD) {
        // Start momentum simulation
        const w = storeRef.current.winState;
        let momentum: MomentumState = {
          x: w.x, y: w.y, vx, vy, prevTime: performance.now(),
        };

        const momentumTick = () => {
          const now = performance.now();
          const { next, done } = stepMomentum(momentum, now);

          // Check edge bounce
          const ww = storeRef.current.winState.width;
          const wh = storeRef.current.winState.height;
          const bounds = getViewportBounds();
          const bounced = applyEdgeBounce(
            next.x, next.y, ww, wh, next.vx, next.vy,
            bounds.viewL, bounds.viewT, bounds.viewR, bounds.viewB,
          );
          momentum = { ...next, vx: bounced.vx, vy: bounced.vy };

          // Direct container manipulation + store sync
          const el = outerRef.current;
          if (el) {
            el.x = momentum.x;
            el.y = momentum.y;
          }
          storeRef.current.moveWindow(id, momentum.x, momentum.y);

          if (!done) {
            momentumRafRef.current = requestAnimationFrame(momentumTick);
          }
        };

        momentumRafRef.current = requestAnimationFrame(momentumTick);
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [id, bringToFront, setActiveWindowId, getViewportBounds]);

  // ─── Resize ────────────────────────────────────────────────────────────────

  const handleResizeStart = useCallback((dir: ResizeDir, e: FederatedPointerEvent) => {
    e.stopPropagation();
    bringToFront(id);
    const w = storeRef.current.winState;
    resizeRef.current = {
      active: true, dir,
      startGX: e.globalX, startGY: e.globalY,
      startWX: w.x,       startWY: w.y,
      startW: w.width,    startH: w.height,
    };

    const onMove = (me: PointerEvent) => {
      if (!resizeRef.current?.active) return;
      const { dir: d, startGX, startGY, startWX, startWY, startW, startH } = resizeRef.current;
      const cam = storeRef.current.camera;
      const dx = (me.clientX - startGX) / cam.scale;
      const dy = (me.clientY - startGY) / cam.scale;

      let newX = startWX, newY = startWY, newW = startW, newH = startH;

      if (d.includes('e')) newW = Math.max(MIN_W, startW + dx);
      if (d.includes('w')) { newW = Math.max(MIN_W, startW - dx); newX = startWX + (startW - newW); }
      if (d.includes('s')) newH = Math.max(MIN_H, startH + dy);
      if (d.includes('n')) { newH = Math.max(MIN_H, startH - dy); newY = startWY + (startH - newH); }

      storeRef.current.resizeWindow(id, newW, newH, newX, newY);
    };

    const onUp = () => {
      resizeRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [id, bringToFront]);

  // ─── Minimize / restore ────────────────────────────────────────────────────

  const handleMinimize = useCallback((e: FederatedPointerEvent) => {
    e.stopPropagation();
    if (winState.minimized) {
      // Restore: spring open from compact strip
      restoreWindow(id);
      runSpring('open');
    } else {
      // Minimize: spring close (scale Y to near 0), store minimized state
      minimizeWindow(id);
      runSpring('close', () => {
        // After animation: leave visible=true, minimized=true
        // The minimized strip is rendered via the minimized branch below
      });
    }
  }, [id, winState?.minimized, minimizeWindow, restoreWindow, runSpring]);

  // ─── Drawing callbacks ─────────────────────────────────────────────────────

  const { width: w, height: h } = winState;
  const contentH = h - TITLE_H;

  const drawFrame = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, w, h);
    g.fill({ color: 0x12121c, alpha: 0.96 });
    const borderColor = focused ? theme.accent.color : theme.border.color;
    const borderAlpha = focused ? 0.8 : 0.4;
    g.rect(0, 0, w, h);
    g.stroke({ color: borderColor, alpha: borderAlpha, width: 1 });
    g.rect(0, 0, w, TITLE_H);
    g.fill({ color: focused ? 0x1c1c30 : 0x16161f });
    g.rect(0, TITLE_H - 1, w, 1);
    g.fill({ color: theme.border.color, alpha: 0.5 });
  }, [w, h, focused, theme]);

  const drawMinimizedFrame = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, MINIMIZED_SLOT_W, MINIMIZED_H);
    g.fill({ color: 0x16161f, alpha: 0.96 });
    g.rect(0, 0, MINIMIZED_SLOT_W, MINIMIZED_H);
    g.stroke({ color: theme.accent.color, alpha: 0.4, width: 1 });
  }, [theme]);

  const drawButtons = useCallback((g: GraphicsType) => {
    g.clear();
    // Invisible full-size rect anchors pixi bounds so the layout engine
    // doesn't scale the graphics to fit and distort the circles.
    g.rect(0, 0, w, TITLE_H);
    g.fill({ color: 0x000000, alpha: 0 });
    // Red = close/hide
    g.circle(w - 12, TITLE_H / 2, 4);
    g.fill({ color: 0xe05050, alpha: 0.9 });
    // Green = focus/fit this window
    g.circle(w - 28, TITLE_H / 2, 4);
    g.fill({ color: 0x40b060, alpha: 0.9 });
  }, [w]);

  const handlePointerDownWindow = useCallback((_e: FederatedPointerEvent) => {
    bringToFront(id);
    setActiveWindowId(id);
  }, [id, bringToFront, setActiveWindowId]);

  // Limit chrome button hit area to the rightmost button zone (2 buttons × 16px + 4px pad).
  // Without this, the full-size invisible anchor rect would intercept all title bar clicks.
  const chromeHitArea = useMemo(() => new Rectangle(w - 36, 0, 36, TITLE_H), [w]);

  const handleChromePointerDown = useCallback((e: FederatedPointerEvent) => {
    const lx = e.getLocalPosition((e.currentTarget as any)).x;
    if (lx > w - 20) { e.stopPropagation(); playWindowClose(); runSpring('close', () => hideWindow(id)); }
    else if (lx > w - 36) { e.stopPropagation(); onFocus?.(id); }
  }, [w, id, hideWindow, onFocus, runSpring]);

  // ─── Render ────────────────────────────────────────────────────────────────

  // Not visible AND animation complete → don't render
  if (!animVisible && !(winState?.visible)) return null;

  // Minimized strip rendering
  if (winState.minimized) {
    return (
      <pixiContainer
        x={winState.x}
        y={winState.y}
        zIndex={winState.zIndex}
        eventMode="static"
        onPointerDown={handlePointerDownWindow}
      >
        <pixiGraphics
          draw={drawMinimizedFrame}
          layout={{ position: 'absolute', width: MINIMIZED_SLOT_W, height: MINIMIZED_H }}
        />
        <pixiBitmapText
          text={title.toUpperCase()}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
          tint={theme.textSecondary.color}
          x={8}
          y={MINIMIZED_H / 2 - 4}
        />
        {/* Restore on click */}
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerDown={(e: FederatedPointerEvent) => { e.stopPropagation(); handleMinimize(e); }}
          layout={{ position: 'absolute', width: MINIMIZED_SLOT_W, height: MINIMIZED_H }}
        />
      </pixiContainer>
    );
  }

  return (
    <pixiContainer
      ref={outerRef}
      x={winState.x}
      y={winState.y}
      zIndex={winState.zIndex}
      eventMode="static"
      onPointerDown={handlePointerDownWindow}
    >
      {/* Window frame */}
      <pixiGraphics
        draw={drawFrame}
        layout={{ position: 'absolute', width: w, height: h }}
      />

      {/* Chrome buttons (close / focus) — hitArea limited to button zone so title drag still works */}
      <pixiGraphics
        draw={drawButtons}
        eventMode="static"
        hitArea={chromeHitArea}
        onPointerDown={handleChromePointerDown}
        cursor="pointer"
        layout={{ position: 'absolute', width: w, height: TITLE_H }}
      />

      {/* Title bar drag area (avoids the chrome button zone — 2 buttons × 16px + 4px pad) */}
      <pixiContainer
        eventMode="static"
        cursor="move"
        onPointerDown={handleTitlePointerDown}
        layout={{ position: 'absolute', width: w - 44, height: TITLE_H }}
      />

      {/* Title text */}
      <pixiBitmapText
        text={title.toUpperCase()}
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
        tint={focused ? theme.accent.color : theme.textSecondary.color}
        x={12}
        y={TITLE_H / 2 - 5}
      />

      {/* Content area */}
      <pixiContainer
        y={TITLE_H}
        layout={{ width: w, height: contentH, overflow: 'hidden' }}
      >
        {children}
      </pixiContainer>

      {/* 8 resize handles */}
      {(['nw','n','ne','e','se','s','sw','w'] as ResizeDir[]).map((dir) => (
        <ResizeHandle
          key={dir}
          dir={dir}
          winState={winState}
          camera={camera}
          onResizeStart={handleResizeStart}
        />
      ))}
    </pixiContainer>
  );
};
