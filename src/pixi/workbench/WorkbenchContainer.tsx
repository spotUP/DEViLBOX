/**
 * WorkbenchContainer — Infinite canvas root container.
 *
 * - Applies camera transform (pan/zoom) to the world container
 * - Handles background pan (pointer drag) and wheel zoom
 * - Renders WorkbenchBackground + all visible PixiWindows
 * - Exposé (Alt+Tab): spring-fit all windows; release to restore
 * - Focus (green ◎ button): spring-fit a single window at 85% screen
 * - Snap guide lines: drawn imperatively via a Graphics ref, fade out 300ms
 * - Provides WorkbenchContext (camera + focusWindow + setSnapLines)
 */

import React, { createContext, useCallback, useContext, useMemo, useRef, useEffect, useState } from 'react';
import { useApplication, useTick } from '@pixi/react';
import { Rectangle, Graphics } from 'pixi.js';
import type { FederatedPointerEvent, Container as ContainerType, Graphics as GraphicsType, BitmapText as BitmapTextType } from 'pixi.js';
import { useWorkbenchStore, TILT_PRESETS, type CameraState } from '@stores/useWorkbenchStore';
import { applyTransform } from './WorkbenchCamera';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { WorkbenchBackground } from './WorkbenchBackground';
import { PixiWindow, TITLE_H } from './PixiWindow';
import { usePixiResponsive } from '../hooks/usePixiResponsive';
import {
  fitAllWindows,
  fitWindows,
  springCameraTo,
  BUILTIN_WORKSPACES,
  type CameraSpringHandle,
} from './WorkbenchExpose';
import { WORKBENCH_CHROME_H, STATUS_BAR_H } from './workbenchLayout';
import type { SnapLine } from './windowSnap';
import { WindowTether } from './WindowTether';
import { playFocusZoom } from './workbenchSounds';
import { WorkbenchTiltRenderer } from './WorkbenchTilt';
import { PixiButton } from '../components/PixiButton';
import { WorkbenchCameraControls } from './WorkbenchCameraControls';
import { PixiTrackerView } from '../views/PixiTrackerView';
import { PixiDJView } from '../views/PixiDJView';
import { PixiInstrumentEditor } from '../views/PixiInstrumentEditor';
import { PixiMasterFxView } from '../views/PixiMasterFxView';
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
  dj:          { title: 'DJ',               component: PixiDJView },
  // VJ excluded — creates separate WebGL contexts (ProjectM/butterchurn/Three.js)
  // that interfere with PixiJS when always-mounted. VJ is conditionally mounted
  // as a full-screen view in PixiMainLayout instead.
  instrument:  { title: 'Instrument Editor',component: PixiInstrumentEditorWindow },
  'master-fx': { title: 'Master FX',        component: PixiMasterFxView },
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
  const camera            = useWorkbenchStore((s) => s.camera);
  const windows           = useWorkbenchStore((s) => s.windows);
  const panCamera         = useWorkbenchStore((s) => s.panCamera);
  const zoomCamera        = useWorkbenchStore((s) => s.zoomCamera);
  const isTilted          = useWorkbenchStore((s) => s.isTilted);
  const tiltPreset        = useWorkbenchStore((s) => s.tiltPreset);
  const setActiveWindowId    = useWorkbenchStore((s) => s.setActiveWindowId);
  const activeWindowId       = useWorkbenchStore((s) => s.activeWindowId);
  const toggleWindowSelection = useWorkbenchStore((s) => s.toggleWindowSelection);
  const setSelectedWindowIds = useWorkbenchStore((s) => s.setSelectedWindowIds);
  const clearSelection       = useWorkbenchStore((s) => s.clearSelection);

  // World container ref (camera transform applied here)
  const worldRef = useRef<ContainerType>(null);
  // Zoom level indicator — updated imperatively alongside camera
  const zoomTextRef = useRef<BitmapTextType | null>(null);

  // Refs so the camera subscription (useEffect([])) always reads fresh values
  // Use workbench area height (excludes NavBar + StatusBar chrome) for accurate culling
  const viewportWRef = useRef(width);
  const viewportHRef = useRef(height - WORKBENCH_CHROME_H);
  viewportWRef.current = width;
  viewportHRef.current = height - WORKBENCH_CHROME_H;

  // Map from windowId → PixiWindow outer Container — populated via onMount callback
  const windowContainerRefs = useRef<Map<string, ContainerType>>(new Map());

  const handleWindowMount = useCallback((winId: string, container: ContainerType | null) => {
    if (container) windowContainerRefs.current.set(winId, container);
    else windowContainerRefs.current.delete(winId);
  }, []);

  // Snap guide line Graphics ref
  const snapGfxRef   = useRef<GraphicsType>(null);
  const snapLinesRef = useRef<SnapLine[]>([]);
  const snapAlphaRef = useRef<number>(0);
  const snapFadeRaf  = useRef<number>(0);

  // Rectangle selection state
  const selRectRef = useRef<{ startX: number; startY: number; curX: number; curY: number } | null>(null);
  const selGfxRef  = useRef<GraphicsType>(null);

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
  const tiltPresetRef   = useRef(tiltPreset);
  tiltPresetRef.current = tiltPreset;
  const rootContainerRef = useRef<ContainerType>(null);

  // Apply camera transform imperatively via store subscription — no React re-render.
  useEffect(() => {
    const apply = (cam: CameraState) => {
      if (worldRef.current) applyTransform(worldRef.current, cam);

      // ── Off-screen culling ──────────────────────────────────────────────────
      const vw = viewportWRef.current;
      const vh = viewportHRef.current;
      const wins = useWorkbenchStore.getState().windows;
      for (const [winId, container] of windowContainerRefs.current) {
        const win = wins[winId];
        if (!win) continue;
        // Window AABB in screen space
        const sx = cam.x + win.x * cam.scale;
        const sy = cam.y + win.y * cam.scale;
        const sw = win.width  * cam.scale;
        const sh = win.height * cam.scale;
        // Render only if it overlaps the viewport (with 1px tolerance)
        container.renderable = sx + sw >= -1 && sy + sh >= -1 && sx <= vw + 1 && sy <= vh + 1;
      }
      // ─────────────────────────────────────────────────────────────────────────

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

  // Actual visible workbench height (excludes NavBar + StatusBar chrome)
  const workbenchH = height - WORKBENCH_CHROME_H;

  // ─── Focus window (green ◎ button) ─────────────────────────────────────────

  const focusWindow = useCallback((id: string) => {
    const s = useWorkbenchStore.getState();
    const win = s.windows[id];
    if (!win || !win.visible) return;
    playFocusZoom();

    if (win.maximized) {
      // Restore: put geometry back, animate camera back to saved position
      const savedCamera = win.preMaximize?.camera ?? { x: 0, y: 0, scale: 1 };
      s.restoreWindow(id);
      startSpring(savedCamera);
    } else {
      // Maximize: fill the entire workbench viewport
      s.maximizeWindow(id, width, workbenchH);
      startSpring({ x: 0, y: 0, scale: 1 });
    }
  }, [width, workbenchH, startSpring]);

  // ─── Control bar actions ────────────────────────────────────────────────────

  const handleFitAll = useCallback(() => {
    const s = useWorkbenchStore.getState();
    // If there's a single active window and no multi-selection, fit that window
    // If there's a multi-selection, fit those windows
    // Otherwise fit all
    if (s.selectedWindowIds.length > 0) {
      startSpring(fitWindows(s.selectedWindowIds, s.windows, width, workbenchH));
    } else if (s.activeWindowId) {
      startSpring(fitWindows([s.activeWindowId], s.windows, width, workbenchH));
    } else {
      startSpring(fitAllWindows(s.windows, width, workbenchH));
    }
  }, [width, workbenchH, startSpring]);

  const handleResetCamera = useCallback(() => {
    startSpring({ x: 0, y: 0, scale: 1 });
  }, [startSpring]);

  // Drag-pad callbacks for WorkbenchCameraControls
  const handlePadPan = useCallback((dx: number, dy: number) => {
    cancelSpring();
    panCamera(dx, dy);
  }, [panCamera, cancelSpring]);

  const handlePadZoom = useCallback((delta: number) => {
    cancelSpring();
    zoomCamera(delta, width / 2, workbenchH / 2);
  }, [zoomCamera, cancelSpring, width, workbenchH]);

  const handleWindowSelect = useCallback((id: string) => {
    toggleWindowSelection(id);
  }, [toggleWindowSelection]);

  const handleLoadWorkspace = useCallback((name: string) => {
    const preset = BUILTIN_WORKSPACES[name];
    if (!preset) return;
    const s = useWorkbenchStore.getState();
    // Apply window positions from preset
    for (const [id, ws] of Object.entries(preset.windows)) {
      s.moveWindow(id, ws.x, ws.y);
      s.resizeWindow(id, ws.width, ws.height);
      if (ws.visible) s.showWindow(id); else s.hideWindow(id);
    }
    startSpring(preset.camera);
  }, [startSpring]);

  // ─── Exposé (store-driven toggle + legacy Alt+Tab hold) ─────────────────────

  const exposeActive = useWorkbenchStore((s) => s.exposeActive);
  const preExposeCam = useWorkbenchStore((s) => s.preExposeCam);
  const exposeCameraRef = useRef<CameraState | null>(null);

  // React to store toggle (from NavBar button)
  useEffect(() => {
    if (exposeActive) {
      startSpring(fitAllWindows(useWorkbenchStore.getState().windows, width, workbenchH));
    } else if (preExposeCam) {
      // Restore saved camera when deactivating
      const saved = preExposeCam;
      startSpring(saved, () => {
        useWorkbenchStore.getState().setExposeActive(false);
      });
    }
  }, [exposeActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Legacy Alt+Tab hold (keep as fallback for non-macOS)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !e.altKey || e.repeat) return;
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
      exposeCameraRef.current = { ...useWorkbenchStore.getState().camera };
      startSpring(fitAllWindows(useWorkbenchStore.getState().windows, width, workbenchH));
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (!exposeCameraRef.current) return;
      e.preventDefault();
      const saved = exposeCameraRef.current;
      startSpring(saved, () => { exposeCameraRef.current = null; });
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
    };
  }, [width, workbenchH, startSpring]);

  // ─── Cmd/Ctrl held state (for Cmd+drag pan) ──────────────────────────────────

  const [cmdHeld, setCmdHeld] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Meta' || e.key === 'Control') setCmdHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta' || e.key === 'Control') setCmdHeld(false);
    };
    // Also clear when window loses focus (Cmd+Tab etc.)
    const onBlur = () => setCmdHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    window.addEventListener('blur',    onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
      window.removeEventListener('blur',    onBlur);
    };
  }, []);

  // ─── Background pan hit area draw ──────────────────────────────────────────
  // Empty containers have 0×0 pixi bounds so they're never hit-tested.
  // An invisible full-size rect anchors bounds so clicks on empty space register.

  const drawBgHitArea = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color, alpha: 0 });
  }, [width, height]);

  // ─── Background pan ────────────────────────────────────────────────────────

  const panDragRef = useRef<{ lastX: number; lastY: number } | null>(null);

  const handleBgPointerDown = useCallback((e: FederatedPointerEvent) => {
    setActiveWindowId(null);
    cancelSpring();

    const nativeEvent = e.nativeEvent as PointerEvent;

    // Shift+drag on background → rectangle selection
    if (nativeEvent.shiftKey) {
      const cam = useWorkbenchStore.getState().camera;
      const worldX = (e.globalX - cam.x) / cam.scale;
      const worldY = (e.globalY - cam.y) / cam.scale;
      selRectRef.current = { startX: worldX, startY: worldY, curX: worldX, curY: worldY };
      document.body.style.cursor = 'crosshair';

      const onMove = (me: PointerEvent) => {
        if (!selRectRef.current) return;
        const cam2 = useWorkbenchStore.getState().camera;
        selRectRef.current.curX = (me.clientX - cam2.x) / cam2.scale;
        selRectRef.current.curY = (me.clientY - cam2.y) / cam2.scale;
        // Redraw selection rectangle
        const g = selGfxRef.current;
        if (g) {
          const r = selRectRef.current;
          const rx = Math.min(r.startX, r.curX);
          const ry = Math.min(r.startY, r.curY);
          const rw = Math.abs(r.curX - r.startX);
          const rh = Math.abs(r.curY - r.startY);
          g.clear();
          g.rect(rx, ry, rw, rh);
          g.fill({ color: theme.accentHighlight.color, alpha: 0.08 });
          g.stroke({ color: theme.accentHighlight.color, alpha: 0.5, width: Math.max(0.5, 1 / cam2.scale) });
        }
        // Compute which windows intersect
        const wins = useWorkbenchStore.getState().windows;
        const r = selRectRef.current;
        const rx = Math.min(r.startX, r.curX);
        const ry = Math.min(r.startY, r.curY);
        const rw = Math.abs(r.curX - r.startX);
        const rh = Math.abs(r.curY - r.startY);
        const ids: string[] = [];
        for (const [wId, w] of Object.entries(wins)) {
          if (!w.visible || w.minimized) continue;
          // Intersect check
          if (w.x + w.width > rx && w.x < rx + rw && w.y + w.height > ry && w.y < ry + rh) {
            ids.push(wId);
          }
        }
        setSelectedWindowIds(ids);
      };

      const onUp = () => {
        selRectRef.current = null;
        selGfxRef.current?.clear();
        document.body.style.cursor = '';
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      return;
    }

    // Normal click on background: clear selection and pan
    clearSelection();
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
  }, [panCamera, cancelSpring, setActiveWindowId, clearSelection, setSelectedWindowIds]);

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
    zoomCamera(delta, width / 2, height / 2);
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
    root.hitArea = new Rectangle(0, 0, width, workbenchH);
  }, [width, workbenchH]);

  // ─── Rendering mask ─────────────────────────────────────────────────────────
  // Clip all workbench rendering so PixiJS cannot paint window content on top
  // of the StatusBar pixels.
  //
  // The mask is in world/screen space (Graphics not added to the display list,
  // so its origin is at screen (0,0)).  The workbench container is positioned
  // at screen y=NAV_H by @pixi/layout's flex layout, so its content spans
  // screen y=NAV_H to y=windowHeight-STATUS_BAR_H.  The mask must cover that
  // full range, i.e. from screen y=0 to y=height-STATUS_BAR_H.
  //
  // We do NOT need to stop the mask at y=NAV_H: the NavBar has zIndex=100 and
  // renders on top of any workbench content that bleeds into its area.
  useEffect(() => {
    const root = rootContainerRef.current;
    if (!root) return;
    const mask = new Graphics();
    mask.rect(0, 0, width, height - STATUS_BAR_H).fill({ color: 0xffffff });
    root.mask = mask;
    return () => {
      root.mask = null;
      mask.destroy();
    };
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
      tilt.renderFrame(world, tiltFactorRef.current, TILT_PRESETS[tiltPresetRef.current].params);
    }
  });

  // ─── Window render order ─────────────────────────────────────────────────────
  // Sort by zIndex ascending so the highest-zIndex window renders last = on top.
  // This replaces sortableChildren on worldRef. worldRef has no layout prop so
  // its children are NOT Yoga-tracked — React can freely reorder them via
  // insertBefore without triggering @pixi/layout BindingErrors.
  const sortedWindowEntries = useMemo(() => {
    return Object.entries(WINDOW_CONTENT).sort(([idA], [idB]) => {
      const zA = windows[idA]?.zIndex ?? 0;
      const zB = windows[idB]?.zIndex ?? 0;
      return zA - zB;
    });
  }, [windows]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const contextValue: WorkbenchContextValue = { camera, focusWindow, setSnapLines };

  return (
    <WorkbenchContext.Provider value={contextValue}>
      <pixiContainer ref={rootContainerRef} layout={{ width, height: '100%' }} eventMode="static">
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
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
          tint={theme.textMuted.color}
          alpha={0.5}
          layout={{ position: 'absolute', bottom: 8, left: 10 }}
        />

        {/* Drag-handle camera controls — screen space, bottom-right corner */}
        <WorkbenchCameraControls
          onPan={handlePadPan}
          onZoom={handlePadZoom}
          onFitAll={handleFitAll}
          onReset={handleResetCamera}
        />

        {/* Control bar — screen space, top-right corner */}
        <pixiContainer
          layout={{
            position: 'absolute',
            top: 8,
            right: 10,
            flexDirection: 'row',
            gap: 4,
            alignItems: 'center',
          }}
          eventMode="static"
        >
          <PixiButton label="COMPOSE" variant="ft2" size="sm" onClick={() => handleLoadWorkspace('Compose')} />
          <PixiButton label="MIX" variant="ft2" size="sm" onClick={() => handleLoadWorkspace('Mix')} />
          <PixiButton label="FULL" variant="ft2" size="sm" onClick={() => handleLoadWorkspace('Full')} />
          <PixiButton label="3D" variant={isTilted ? 'ft2' : 'ghost'} color={isTilted ? 'blue' : undefined} size="sm" active={isTilted} onClick={() => useWorkbenchStore.getState().setTilted(!isTilted)} />
          {isTilted && (
            <PixiButton label={TILT_PRESETS[tiltPreset].label} variant="ft2" color="blue" size="sm" onClick={() => useWorkbenchStore.getState().cycleTiltPreset()} />
          )}
        </pixiContainer>

        {/* World container — camera transform via ref.
            NO layout prop: worldRef is not a Yoga container, so its children
            (window wrappers) are never Yoga-tracked. This prevents @pixi/layout
            BindingErrors when React reorders wrappers via insertBefore.
            NO sortableChildren: React sorts windows by zIndex instead (see
            sortedWindowEntries above) — highest zIndex renders last = on top. */}
        <pixiContainer ref={worldRef}>
          {/* Tether: Instrument Editor ↔ Tracker — behind windows */}
          <WindowTether fromId="instrument" toId="tracker" />

          {/* Windows — rendered in ascending zIndex order (highest = last = on top) */}
          {sortedWindowEntries.map(([id, { title, component: ViewComponent }]) => {
            const win = windows[id];
            return (
              <pixiContainer key={id}>
                {win?.visible && (
                  <PixiWindow
                    id={id}
                    title={title}
                    camera={camera}
                    screenW={width}
                    screenH={height}
                    onFocus={focusWindow}
                    onMount={handleWindowMount}
                    onSelect={handleWindowSelect}
                  >
                    <pixiContainer
                      layout={{
                        width: win.width,
                        height: win.height - TITLE_H,
                        flexDirection: 'column',
                      }}
                      interactiveChildren={id === activeWindowId}
                      eventMode={id === activeWindowId ? 'auto' : 'none'}
                    >
                      <ViewComponent />
                    </pixiContainer>
                  </PixiWindow>
                )}
              </pixiContainer>
            );
          })}

          {/* Selection rectangle — drawn imperatively during Shift+drag */}
          <pixiGraphics
            ref={selGfxRef}
            draw={() => {}}
            zIndex={9998}
          />

          {/* Snap guide lines — drawn imperatively, always on top */}
          <pixiGraphics
            ref={snapGfxRef}
            draw={() => {}}
            zIndex={9999}
          />
        </pixiContainer>

        {/* Cmd/Ctrl+drag pan overlay — above windows, active only when Cmd/Ctrl is held.
            eventMode="none" when inactive so all events fall through normally. */}
        <pixiContainer
          layout={{ position: 'absolute', width, height }}
          eventMode={cmdHeld ? 'static' : 'none'}
          cursor={cmdHeld ? 'grab' : 'default'}
          onPointerDown={handleBgPointerDown}
        />
      </pixiContainer>
    </WorkbenchContext.Provider>
  );
};
