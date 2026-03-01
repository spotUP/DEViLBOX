/**
 * WorkbenchContainer — Infinite canvas root container.
 *
 * - Applies camera transform (pan/zoom) to the world container
 * - Handles background pan (pointer drag) and wheel zoom
 * - Renders WorkbenchBackground + all visible PixiWindows
 * - Exposé (Tab key): spring-fit all windows; release to restore
 * - Focus (green ◎ button): spring-fit a single window at 85% screen
 * - Snap guide lines: drawn imperatively via a Graphics ref, fade out 300ms
 * - Provides WorkbenchContext (camera + focusWindow + setSnapLines)
 */

import React, { createContext, useCallback, useContext, useRef, useEffect, useState } from 'react';
import { useApplication, useTick } from '@pixi/react';
import { Rectangle } from 'pixi.js';
import type { FederatedPointerEvent, Container as ContainerType, Graphics as GraphicsType, BitmapText as BitmapTextType } from 'pixi.js';
import { useWorkbenchStore, type CameraState } from '@stores/useWorkbenchStore';
import { applyTransform } from './WorkbenchCamera';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { WorkbenchBackground } from './WorkbenchBackground';
import { PixiWindow, TITLE_H } from './PixiWindow';
import { usePixiResponsive } from '../hooks/usePixiResponsive';
import {
  fitAllWindows,
  fitWindow,
  springCameraTo,
  type CameraSpringHandle,
} from './WorkbenchExpose';
import type { SnapLine } from './windowSnap';
import { WindowTether } from './WindowTether';
import { playFocusZoom } from './workbenchSounds';
import { WorkbenchTiltRenderer } from './WorkbenchTilt';
import { PixiTrackerView } from '../views/PixiTrackerView';
import { PixiDJView } from '../views/PixiDJView';
import { PixiArrangementView } from '../views/PixiArrangementView';
import { PixiPianoRollView } from '../views/PixiPianoRollView';
import { PixiVJView } from '../views/PixiVJView';
import { PixiInstrumentEditor } from '../views/PixiInstrumentEditor';
import { useInstrumentStore } from '@stores/useInstrumentStore';

/** Wrapper that pulls the current instrument from the store — no props needed. */
const PixiInstrumentEditorWindow: React.FC = () => {
  const instrument = useInstrumentStore((s) =>
    s.instruments.find((i) => i.id === s.currentInstrumentId) ?? s.instruments[0]
  );
  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);

  if (!instrument) return null;

  return (
    <PixiInstrumentEditor
      synthType={instrument.synthType}
      config={instrument as unknown as Record<string, unknown>}
      onChange={(updates) => updateInstrument(instrument.id, updates)}
      instrumentName={instrument.name}
    />
  );
};

// ─── Workbench Context ────────────────────────────────────────────────────────

interface WorkbenchContextValue {
  camera: CameraState;
  /** Spring-animate camera to focus on window `id` at 85% of screen */
  focusWindow: (id: string) => void;
  /**
   * Called by PixiWindow during drag with current snap guide lines.
   * Pass empty array to clear (starts fade-out).
   */
  setSnapLines: (lines: SnapLine[]) => void;
}

export const WorkbenchContext = createContext<WorkbenchContextValue>({
  camera: { x: 0, y: 0, scale: 1 },
  focusWindow: () => {},
  setSnapLines: () => {},
});

export function useWorkbenchCamera(): CameraState {
  return useContext(WorkbenchContext).camera;
}

export function useFocusWindow(): (id: string) => void {
  return useContext(WorkbenchContext).focusWindow;
}

export function useSetSnapLines(): (lines: SnapLine[]) => void {
  return useContext(WorkbenchContext).setSnapLines;
}

// ─── Window definitions ───────────────────────────────────────────────────────

const WINDOW_CONTENT: Record<string, { title: string; component: React.ComponentType }> = {
  tracker:     { title: 'Tracker',          component: PixiTrackerView },
  pianoroll:   { title: 'Piano Roll',       component: PixiPianoRollView },
  arrangement: { title: 'Arrangement',      component: PixiArrangementView },
  dj:          { title: 'DJ',               component: PixiDJView },
  vj:          { title: 'VJ',               component: PixiVJView },
  instrument:  { title: 'Instrument Editor',component: PixiInstrumentEditorWindow },
};

// ─── Guide line draw ──────────────────────────────────────────────────────────

const SNAP_LINE_COLOR  = 0x4a9eff;
const FADE_DURATION_MS = 300;

function redrawSnapLines(g: GraphicsType, lines: SnapLine[], alpha: number, cameraScale: number): void {
  g.clear();
  if (alpha <= 0.01 || lines.length === 0) return;
  // Line width 1px on screen regardless of zoom
  const lineW = Math.max(0.5, 1 / cameraScale);
  for (const line of lines) {
    if (line.axis === 'x') {
      g.moveTo(line.value, line.from);
      g.lineTo(line.value, line.to);
    } else {
      g.moveTo(line.from, line.value);
      g.lineTo(line.to, line.value);
    }
    g.stroke({ color: SNAP_LINE_COLOR, alpha, width: lineW });
  }
}

// ─── WorkbenchContainer ───────────────────────────────────────────────────────

export const WorkbenchContainer: React.FC = () => {
  const { width, height } = usePixiResponsive();
  const theme = usePixiTheme();
  // Camera is read reactively here only for passing to props/context; the world
  // container transform is still applied imperatively via the subscription below.
  const camera     = useWorkbenchStore((s) => s.camera);
  const windows    = useWorkbenchStore((s) => s.windows);
  const panCamera  = useWorkbenchStore((s) => s.panCamera);
  const zoomCamera = useWorkbenchStore((s) => s.zoomCamera);
  const isTilted   = useWorkbenchStore((s) => s.isTilted);

  // World container ref (camera transform applied here)
  const worldRef = useRef<ContainerType>(null);
  // Zoom level indicator — updated imperatively alongside camera
  const zoomTextRef = useRef<BitmapTextType | null>(null);

  // Snap guide line Graphics ref
  const snapGfxRef   = useRef<GraphicsType>(null);
  const snapLinesRef = useRef<SnapLine[]>([]);
  const snapAlphaRef = useRef<number>(0);
  const snapFadeRaf  = useRef<number>(0);

  // Active camera spring
  const springRef = useRef<CameraSpringHandle | null>(null);

  // ─── WebGL tilt ─────────────────────────────────────────────────────────────
  const { app } = useApplication();
  const tiltRendererRef = useRef<WorkbenchTiltRenderer | null>(null);
  // Animated tilt factor 0 (flat) → 1 (full tilt), spring-eased
  const tiltFactorRef   = useRef(0);
  // Refs so the useTick callback always reads current values
  const isTiltedRef     = useRef(isTilted);
  isTiltedRef.current   = isTilted;
  const rootContainerRef = useRef<ContainerType>(null);

  // Apply camera transform imperatively via store subscription — no React re-render.
  useEffect(() => {
    const apply = (cam: CameraState) => {
      if (worldRef.current) applyTransform(worldRef.current, cam);
      if (snapGfxRef.current && snapLinesRef.current.length > 0) {
        redrawSnapLines(snapGfxRef.current, snapLinesRef.current, snapAlphaRef.current, cam.scale);
      }
      // Update zoom level indicator imperatively
      if (zoomTextRef.current) {
        zoomTextRef.current.text = `${Math.round(cam.scale * 100)}%`;
      }
    };
    // Apply immediately with current state, then subscribe to future changes.
    apply(useWorkbenchStore.getState().camera);
    return useWorkbenchStore.subscribe((s) => apply(s.camera));
  }, []);

  // ─── Snap guide lines ───────────────────────────────────────────────────────

  const setSnapLines = useCallback((lines: SnapLine[]) => {
    cancelAnimationFrame(snapFadeRaf.current);
    snapLinesRef.current = lines;
    const g = snapGfxRef.current;
    if (!g) return;

    if (lines.length > 0) {
      // Show immediately at full opacity
      snapAlphaRef.current = 1;
      redrawSnapLines(g, lines, 1, useWorkbenchStore.getState().camera.scale);
    } else {
      // Fade out
      const startAlpha = snapAlphaRef.current;
      const startTime  = performance.now();

      const fade = () => {
        const elapsed = performance.now() - startTime;
        const t       = Math.min(1, elapsed / FADE_DURATION_MS);
        const alpha   = startAlpha * (1 - t);
        snapAlphaRef.current = alpha;
        redrawSnapLines(g, snapLinesRef.current.length > 0 ? snapLinesRef.current : [], alpha, useWorkbenchStore.getState().camera.scale);
        // Keep old lines visible while fading
        if (t < 1) {
          snapFadeRaf.current = requestAnimationFrame(fade);
        } else {
          snapLinesRef.current = [];
          g.clear();
        }
      };
      snapFadeRaf.current = requestAnimationFrame(fade);
    }
  }, []);

  // Cleanup fade RAF on unmount
  useEffect(() => () => { cancelAnimationFrame(snapFadeRaf.current); }, []);

  // ─── Camera spring ──────────────────────────────────────────────────────────

  const cancelSpring = useCallback(() => {
    springRef.current?.cancel();
    springRef.current = null;
  }, []);

  const startSpring = useCallback((target: CameraState, onDone?: () => void) => {
    cancelSpring();
    springRef.current = springCameraTo(target, onDone);
  }, [cancelSpring]);

  // ─── Focus window (green ◎ button) ─────────────────────────────────────────

  const focusWindow = useCallback((id: string) => {
    const win = useWorkbenchStore.getState().windows[id];
    if (!win || !win.visible) return;
    playFocusZoom();
    startSpring(fitWindow(win, width, height));
  }, [width, height, startSpring]);

  // ─── Exposé (Tab hold) ────────────────────────────────────────────────────

  const exposeCameraRef = useRef<CameraState | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.repeat) return;
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
      exposeCameraRef.current = { ...useWorkbenchStore.getState().camera };
      startSpring(fitAllWindows(useWorkbenchStore.getState().windows, width, height));
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const saved = exposeCameraRef.current;
      if (saved) startSpring(saved, () => { exposeCameraRef.current = null; });
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
    };
  }, [width, height, startSpring]);

  // ─── Space-pan (Space held + drag anywhere) ─────────────────────────────────

  const [spaceHeld, setSpaceHeld] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
      setSpaceHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
    };
  }, []);

  // ─── Background pan hit area draw ──────────────────────────────────────────
  // Empty containers have 0×0 pixi bounds so they're never hit-tested.
  // An invisible full-size rect anchors bounds so clicks on empty space register.

  const drawBgHitArea = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: 0x000000, alpha: 0 });
  }, [width, height]);

  // ─── Background pan ────────────────────────────────────────────────────────

  const panDragRef = useRef<{ lastX: number; lastY: number } | null>(null);

  const handleBgPointerDown = useCallback((e: FederatedPointerEvent) => {
    cancelSpring();
    panDragRef.current = { lastX: e.globalX, lastY: e.globalY };
    document.body.style.cursor = 'grabbing';

    const onMove = (me: PointerEvent) => {
      if (!panDragRef.current) return;
      const dx = me.clientX - panDragRef.current.lastX;
      const dy = me.clientY - panDragRef.current.lastY;
      panDragRef.current.lastX = me.clientX;
      panDragRef.current.lastY = me.clientY;
      panCamera(dx, dy);
    };

    const onUp = () => {
      panDragRef.current = null;
      document.body.style.cursor = '';
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [panCamera, cancelSpring]);

  // ─── Wheel zoom ────────────────────────────────────────────────────────────

  const handleBgWheel = useCallback((e: WheelEvent) => {
    // Ctrl/Cmd + scroll = always zoom the canvas (bypass window check).
    // Without modifier, bail if the pointer is over a window (let the view scroll).
    if (!e.ctrlKey && !e.metaKey) {
      const cam = useWorkbenchStore.getState().camera;
      const worldX = (e.clientX - cam.x) / cam.scale;
      const worldY = (e.clientY - cam.y) / cam.scale;
      const wins = useWorkbenchStore.getState().windows;
      const overWindow = Object.values(wins).some(
        (w) => w.visible && !w.minimized &&
          worldX >= w.x && worldX <= w.x + w.width &&
          worldY >= w.y && worldY <= w.y + w.height,
      );
      if (overWindow) return;
    }

    e.preventDefault();
    cancelSpring();
    const delta = Math.max(-0.4, Math.min(0.4, -e.deltaY * 0.001));
    zoomCamera(delta, e.clientX, e.clientY);
  }, [zoomCamera, cancelSpring]);

  // ─── Middle mouse pan ───────────────────────────────────────────────────────

  const handleMiddleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    cancelSpring();
    panDragRef.current = { lastX: e.clientX, lastY: e.clientY };
    document.body.style.cursor = 'grabbing';

    const onMove = (me: MouseEvent) => {
      if (!panDragRef.current) return;
      const dx = me.clientX - panDragRef.current.lastX;
      const dy = me.clientY - panDragRef.current.lastY;
      panDragRef.current.lastX = me.clientX;
      panDragRef.current.lastY = me.clientY;
      panCamera(dx, dy);
    };
    const onUp = () => {
      panDragRef.current = null;
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }, [panCamera, cancelSpring]);

  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    canvas.addEventListener('wheel',     handleBgWheel,         { passive: false });
    canvas.addEventListener('mousedown', handleMiddleMouseDown);
    return () => {
      canvas.removeEventListener('wheel',     handleBgWheel);
      canvas.removeEventListener('mousedown', handleMiddleMouseDown);
    };
  }, [handleBgWheel, handleMiddleMouseDown]);

  useEffect(() => () => cancelSpring(), [cancelSpring]);

  // ─── Tilt renderer lifecycle ────────────────────────────────────────────────
  // Created after the root container mounts; destroyed on unmount.
  useEffect(() => {
    const root = rootContainerRef.current;
    if (!root || !app) return;
    const renderer = new WorkbenchTiltRenderer(app, root, width, height);
    tiltRendererRef.current = renderer;
    return () => {
      renderer.destroy();
      tiltRendererRef.current = null;
    };
  // Re-create if dimensions change (resize)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, width, height]);

  // ─── Event hit-area clipping ────────────────────────────────────────────────
  // Prevent world windows panned above y=0 (into NavBar screen space) from
  // intercepting pointer events on NavBar buttons. hitArea is tested in the
  // root container's local coordinates — clicks at local y < 0 are rejected,
  // so PixiJS falls through to the NavBar which renders below this container.
  useEffect(() => {
    const root = rootContainerRef.current;
    if (!root) return;
    root.hitArea = new Rectangle(0, 0, width, height);
  }, [width, height]);

  // ─── Tilt per-frame tick ─────────────────────────────────────────────────────
  // Spring-animates tiltFactor and triggers the GL render-to-texture pass.
  // Runs inside the Pixi ticker (UPDATE priority → before main scene render).
  useTick((ticker) => {
    const target = isTiltedRef.current ? 1 : 0;
    const current = tiltFactorRef.current;
    if (Math.abs(target - current) < 0.001 && Math.abs(target) < 0.001) return;

    // Exponential smoothing: ~300ms settle time
    const dt = Math.min(ticker.deltaMS / 1000, 0.05);
    const next = current + (target - current) * (1 - Math.exp(-dt * 6));
    tiltFactorRef.current = Math.abs(next - target) < 0.001 ? target : next;

    const tiltActive = tiltFactorRef.current > 0.005;
    const tilt = tiltRendererRef.current;
    const world = worldRef.current;
    if (!tilt || !world) return;

    tilt.setActive(tiltActive, world);
    if (tiltActive) {
      tilt.renderFrame(world, tiltFactorRef.current);
    }
  });

  // ─── Render ────────────────────────────────────────────────────────────────

  const contextValue: WorkbenchContextValue = { camera, focusWindow, setSnapLines };

  return (
    <WorkbenchContext.Provider value={contextValue}>
      <pixiContainer ref={rootContainerRef} layout={{ width, height: '100%' }} eventMode="static" sortableChildren>
        <WorkbenchBackground width={width} height={height} camera={camera} />

        {/* Pan hit area — invisible rect gives pixi proper bounds for hit-testing */}
        <pixiGraphics
          draw={drawBgHitArea}
          layout={{ position: 'absolute', width, height }}
          eventMode="static"
          cursor="grab"
          onPointerDown={handleBgPointerDown}
        />

        {/* Zoom level indicator — screen space, bottom-left corner */}
        <pixiBitmapText
          ref={zoomTextRef}
          text="100%"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          alpha={0.5}
          layout={{ position: 'absolute', bottom: 8, left: 10 }}
        />

        {/* World container — camera transform via ref */}
        <pixiContainer
          ref={worldRef}
          layout={{ position: 'absolute', width, height }}
          sortableChildren
        >
          {/* Windows */}
          {Object.entries(WINDOW_CONTENT).map(([id, { title, component: ViewComponent }]) => {
            const win = windows[id];
            if (!win?.visible) return null;
            return (
              <PixiWindow
                key={id}
                id={id}
                title={title}
                camera={camera}
                screenW={width}
                screenH={height}
                onFocus={focusWindow}
              >
                <pixiContainer
                  layout={{
                    width: win.width,
                    height: win.height - TITLE_H,
                    flexDirection: 'column',
                  }}
                >
                  <ViewComponent />
                </pixiContainer>
              </PixiWindow>
            );
          })}

          {/* Tether: Instrument Editor ↔ Tracker */}
          <WindowTether fromId="instrument" toId="tracker" />

          {/* Snap guide lines — drawn imperatively, always on top */}
          <pixiGraphics
            ref={snapGfxRef}
            draw={() => {}}
            zIndex={9999}
          />
        </pixiContainer>

        {/* Space-pan overlay — above windows, active only when Space is held.
            eventMode="none" when inactive so all events fall through normally. */}
        <pixiContainer
          layout={{ position: 'absolute', width, height }}
          eventMode={spaceHeld ? 'static' : 'none'}
          cursor={spaceHeld ? 'grab' : 'default'}
          onPointerDown={handleBgPointerDown}
        />
      </pixiContainer>
    </WorkbenchContext.Provider>
  );
};
