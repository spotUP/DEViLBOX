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

import React, { createContext, useCallback, useContext, useRef, useEffect } from 'react';
import type { FederatedPointerEvent, Container as ContainerType, Graphics as GraphicsType } from 'pixi.js';
import { useWorkbenchStore, type CameraState } from '@stores/useWorkbenchStore';
import { applyTransform } from './WorkbenchCamera';
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
  // NOTE: camera is NOT in React state — it is applied imperatively via a
  // Zustand store subscription below.  This prevents WorkbenchContainer (and
  // all PixiWindow children) from re-rendering on every pan/zoom frame.
  const windows    = useWorkbenchStore((s) => s.windows);
  const panCamera  = useWorkbenchStore((s) => s.panCamera);
  const zoomCamera = useWorkbenchStore((s) => s.zoomCamera);

  // World container ref (camera transform applied here)
  const worldRef = useRef<ContainerType>(null);

  // Snap guide line Graphics ref
  const snapGfxRef   = useRef<GraphicsType>(null);
  const snapLinesRef = useRef<SnapLine[]>([]);
  const snapAlphaRef = useRef<number>(0);
  const snapFadeRaf  = useRef<number>(0);

  // Active camera spring
  const springRef = useRef<CameraSpringHandle | null>(null);

  // Apply camera transform imperatively via store subscription — no React re-render.
  useEffect(() => {
    const apply = (cam: CameraState) => {
      if (worldRef.current) applyTransform(worldRef.current, cam);
      if (snapGfxRef.current && snapLinesRef.current.length > 0) {
        redrawSnapLines(snapGfxRef.current, snapLinesRef.current, snapAlphaRef.current, cam.scale);
      }
    };
    // Apply immediately with current state, then subscribe to future changes.
    apply(useWorkbenchStore.getState().camera);
    return useWorkbenchStore.subscribe((s) => s.camera, apply);
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

  // ─── Background pan ────────────────────────────────────────────────────────

  const panDragRef = useRef<{ lastX: number; lastY: number } | null>(null);

  const handleBgPointerDown = useCallback((e: FederatedPointerEvent) => {
    cancelSpring();
    panDragRef.current = { lastX: e.globalX, lastY: e.globalY };

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
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [panCamera, cancelSpring]);

  // ─── Wheel zoom ────────────────────────────────────────────────────────────

  const handleBgWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    cancelSpring();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    zoomCamera(delta, e.clientX, e.clientY);
  }, [zoomCamera, cancelSpring]);

  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    canvas.addEventListener('wheel', handleBgWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleBgWheel);
  }, [handleBgWheel]);

  useEffect(() => () => cancelSpring(), [cancelSpring]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const contextValue: WorkbenchContextValue = { focusWindow, setSnapLines };

  return (
    <WorkbenchContext.Provider value={contextValue}>
      <pixiContainer layout={{ width, height: '100%' }} eventMode="static">
        {/* Background — subscribes to camera directly; no prop needed */}
        <WorkbenchBackground width={width} height={height} />

        {/* Pan hit area */}
        <pixiContainer
          layout={{ position: 'absolute', width, height }}
          eventMode="static"
          cursor="default"
          onPointerDown={handleBgPointerDown}
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
      </pixiContainer>
    </WorkbenchContext.Provider>
  );
};
