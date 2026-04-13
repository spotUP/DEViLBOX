/**
 * useWorkbenchStore — Infinite canvas workbench state.
 *
 * Tracks camera position/scale, window positions/sizes/z-order,
 * workspace snapshots, and workbench UI settings.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  visible: boolean;
  minimized: boolean;
  maximized: boolean;
  /** Saved geometry + camera for restore after maximize */
  preMaximize?: { x: number; y: number; width: number; height: number; camera: CameraState };
}

export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

export interface WorkspaceSnapshot {
  camera: CameraState;
  windows: Record<string, WindowState>;
}

export type WindowId =
  | 'tracker'
  | 'dj'
  | 'vj'
  | 'instrument'
  | 'mixer'
  | 'master-fx'
  | 'split';

// ─── 3D Tilt Presets ──────────────────────────────────────────────────────────

export type TiltPreset = 'desk' | 'scroller' | 'cockpit' | 'widescreen' | 'tower';

export interface TiltParams {
  /** Top edge inset fraction (0–0.3) — how much narrower the top is */
  inset: number;
  /** Top edge vertical shift fraction (0–0.3) — perspective foreshortening */
  topShift: number;
  /** Bottom edge inset fraction — for reverse/symmetric perspectives */
  bottomInset: number;
  /** Bottom edge vertical shift fraction */
  bottomShift: number;
  /** Barrel distortion strength (0 = none, 0.3 = mild fisheye, 0.8 = extreme) */
  barrel: number;
  /** Chromatic aberration strength (0 = none, subtle RGB split at edges) */
  chromatic: number;
  /** Vignette darkness at edges (0 = none, 1 = full black corners) */
  vignette: number;
}

export const TILT_PRESETS: Record<TiltPreset, { label: string; params: TiltParams }> = {
  desk:       { label: 'Desk',       params: { inset: 0.07,  topShift: 0.04,  bottomInset: 0,     bottomShift: 0,    barrel: 0,    chromatic: 0,     vignette: 0 } },
  scroller:   { label: 'Scroller',   params: { inset: 0.20,  topShift: 0.15,  bottomInset: 0,     bottomShift: 0,    barrel: 0,    chromatic: 0,     vignette: 0 } },
  cockpit:    { label: 'Cockpit',    params: { inset: 0.28,  topShift: 0.22,  bottomInset: 0,     bottomShift: 0,    barrel: 0.15, chromatic: 0.003, vignette: 0.3 } },
  widescreen: { label: 'Widescreen', params: { inset: 0.10,  topShift: 0.02,  bottomInset: 0.10,  bottomShift: 0.02, barrel: 0,    chromatic: 0,     vignette: 0 } },
  tower:      { label: 'Tower',      params: { inset: 0,     topShift: 0,     bottomInset: 0.18,  bottomShift: 0.12, barrel: 0,    chromatic: 0,     vignette: 0 } },
};

export const TILT_PRESET_ORDER: TiltPreset[] = ['desk', 'scroller', 'cockpit', 'widescreen', 'tower'];

/** Total height of NavBar + StatusBar chrome (matches workbenchLayout.ts WORKBENCH_CHROME_H) */
const CHROME_H = 130;

/** Default window layout computed from screen dimensions at load time. */
function computeDefaultWindows(): Record<WindowId, WindowState> {
  const ww = typeof window !== 'undefined' ? window.innerWidth  : 1280;
  const wh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const workbenchH = Math.max(400, wh - CHROME_H);
  const gap = 20;

  // Row 1: Tracker (left, main) + VJ (right)
  const trackerW = Math.max(700, Math.round((ww - gap * 3) * 0.65));
  const trackerH = Math.max(400, Math.round(workbenchH * 0.6));
  const vjW = Math.max(400, ww - trackerW - gap * 3);
  const vjH = trackerH;

  // Row 2: Instrument + Piano Roll + Mixer (tiled below tracker row)
  const row2Y = trackerH + gap * 2;
  const row2H = Math.max(250, workbenchH - trackerH - gap * 3);
  const instrW = 700;
  const mixerW = Math.min(900, ww - gap * 2);

  // Row 3 (below row 2)
  const row3Y = row2Y + row2H + gap;
  const arrH = 300;

  // DJ gets its own area offset to the right
  const djW = Math.min(1100, ww - gap * 2);

  return {
    tracker:     { x: gap,                    y: gap,   width: trackerW,  height: trackerH,  zIndex: 1, visible: true,  minimized: false, maximized: false },
    instrument:  { x: gap,                    y: row2Y, width: instrW,    height: row2H,     zIndex: 6, visible: true,  minimized: false, maximized: false },
    mixer:       { x: gap,                    y: row3Y, width: mixerW, height: 220, zIndex: 7, visible: false, minimized: false, maximized: false },
    'master-fx': { x: mixerW + gap * 2,       y: row3Y + arrH + gap, width: 280,  height: 360,  zIndex: 8, visible: false, minimized: false, maximized: false },
    dj:          { x: trackerW + gap * 2,     y: gap,   width: djW,       height: 500,       zIndex: 4, visible: false, minimized: false, maximized: false },
    vj:          { x: trackerW + gap * 2,     y: gap,   width: vjW,       height: vjH,       zIndex: 5, visible: false, minimized: false, maximized: false },
    split:       { x: gap,                    y: gap,   width: ww - gap * 2, height: trackerH, zIndex: 9, visible: false, minimized: false, maximized: false },
  };
}

interface WorkbenchStore {
  // Camera state
  camera: CameraState;

  // Window state
  windows: Record<string, WindowState>;
  maxZIndex: number;

  // Workspace snapshots (named layouts)
  workspaces: Record<string, WorkspaceSnapshot>;

  // UI settings
  minimapVisible: boolean;
  uiSoundVolume: number;
  snapToGrid: boolean;
  gridSize: number;

  // 3D tilt state (not persisted — resets to flat on page load)
  isTilted: boolean;
  tiltPreset: TiltPreset;

  // Exposé state (not persisted — resets on page load)
  exposeActive: boolean;
  preExposeCam: CameraState | null;

  // ─── Actions ───────────────────────────────────────────────────────────────

  setCamera: (camera: Partial<CameraState>) => void;
  panCamera: (dx: number, dy: number) => void;
  zoomCamera: (delta: number, pivotX: number, pivotY: number) => void;

  // Window management
  showWindow: (id: string) => void;
  hideWindow: (id: string) => void;
  toggleWindow: (id: string) => void;
  bringToFront: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, width: number, height: number, x?: number, y?: number) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  maximizeWindow: (id: string, viewportW: number, viewportH: number) => void;

  // Workspace snapshots
  saveWorkspace: (name: string) => void;
  loadWorkspace: (name: string) => void;
  deleteWorkspace: (name: string) => void;

  // Settings
  setMinimapVisible: (visible: boolean) => void;
  setSnapToGrid: (snap: boolean) => void;
  setGridSize: (size: number) => void;
  setUiSoundVolume: (vol: number) => void;
  setTilted: (tilted: boolean) => void;
  setTiltPreset: (preset: TiltPreset) => void;
  cycleTiltPreset: () => void;
  /** Toggle Exposé (fit-all-windows overview). */
  toggleExpose: () => void;
  setExposeActive: (active: boolean) => void;

  /** The window that last received a pointerdown — null when background is clicked. */
  activeWindowId: string | null;
  setActiveWindowId: (id: string | null) => void;

  /** Multi-selection of windows (Shift+click or rectangle select). */
  selectedWindowIds: string[];
  toggleWindowSelection: (id: string) => void;
  setSelectedWindowIds: (ids: string[]) => void;
  clearSelection: () => void;

  /** Reset all windows to defaults and camera to origin. */
  resetLayout: () => void;
}

export const useWorkbenchStore = create<WorkbenchStore>()(
  persist(
    immer((set, get) => ({
      camera: { x: 0, y: 0, scale: 1 },
      windows: computeDefaultWindows() as Record<string, WindowState>,
      maxZIndex: 10,
      workspaces: {},
      minimapVisible: true,
      uiSoundVolume: 0.3,
      snapToGrid: false,
      gridSize: 40,
      isTilted: false,
      tiltPreset: 'desk' as TiltPreset,
      exposeActive: false,
      preExposeCam: null,
      activeWindowId: null,
      selectedWindowIds: [],

      // ─── Camera ────────────────────────────────────────────────────────────

      setCamera: (camera) =>
        set((state) => {
          Object.assign(state.camera, camera);
        }),

      panCamera: (dx, dy) =>
        set((state) => {
          state.camera.x += dx;
          state.camera.y += dy;
        }),

      zoomCamera: (delta, pivotX, pivotY) =>
        set((state) => {
          const oldScale = state.camera.scale;
          const newScale = Math.max(0.15, Math.min(4, oldScale * (1 + delta)));
          // Zoom toward pivot point (screen coordinates)
          const scaleRatio = newScale / oldScale;
          state.camera.x = pivotX - (pivotX - state.camera.x) * scaleRatio;
          state.camera.y = pivotY - (pivotY - state.camera.y) * scaleRatio;
          state.camera.scale = newScale;
        }),

      // ─── Windows ───────────────────────────────────────────────────────────

      showWindow: (id) =>
        set((state) => {
          if (!state.windows[id]) return;
          state.windows[id].visible = true;
          state.windows[id].minimized = false;
          // Bring to front
          state.maxZIndex++;
          state.windows[id].zIndex = state.maxZIndex;
        }),

      hideWindow: (id) =>
        set((state) => {
          if (!state.windows[id]) return;
          state.windows[id].visible = false;
          if (state.activeWindowId === id) state.activeWindowId = null;
        }),

      toggleWindow: (id) => {
        const win = get().windows[id];
        if (!win) return;
        if (win.visible && !win.minimized) {
          get().hideWindow(id);
        } else {
          get().showWindow(id);
        }
      },

      bringToFront: (id) =>
        set((state) => {
          if (!state.windows[id]) return;
          // Only update if not already on top
          if (state.windows[id].zIndex < state.maxZIndex) {
            state.maxZIndex++;
            state.windows[id].zIndex = state.maxZIndex;
          }
        }),

      moveWindow: (id, x, y) =>
        set((state) => {
          if (!state.windows[id]) return;
          state.windows[id].x = x;
          state.windows[id].y = y;
        }),

      resizeWindow: (id, width, height, x, y) =>
        set((state) => {
          if (!state.windows[id]) return;
          state.windows[id].width = Math.max(200, width);
          state.windows[id].height = Math.max(150, height);
          if (x !== undefined) state.windows[id].x = x;
          if (y !== undefined) state.windows[id].y = y;
        }),

      minimizeWindow: (id) =>
        set((state) => {
          if (!state.windows[id]) return;
          state.windows[id].minimized = true;
        }),

      restoreWindow: (id) =>
        set((state) => {
          const win = state.windows[id];
          if (!win) return;
          win.minimized = false;
          // If restoring from maximize, put geometry back
          if (win.maximized && win.preMaximize) {
            win.x = win.preMaximize.x;
            win.y = win.preMaximize.y;
            win.width = win.preMaximize.width;
            win.height = win.preMaximize.height;
            win.maximized = false;
            win.preMaximize = undefined;
          }
          state.maxZIndex++;
          win.zIndex = state.maxZIndex;
        }),

      maximizeWindow: (id, viewportW, viewportH) =>
        set((state) => {
          const win = state.windows[id];
          if (!win) return;
          win.preMaximize = {
            x: win.x, y: win.y, width: win.width, height: win.height,
            camera: { ...state.camera },
          };
          win.x = 0;
          win.y = 0;
          win.width = viewportW;
          win.height = viewportH;
          win.maximized = true;
          state.maxZIndex++;
          win.zIndex = state.maxZIndex;
        }),

      // ─── Workspaces ────────────────────────────────────────────────────────

      saveWorkspace: (name) =>
        set((state) => {
          state.workspaces[name] = {
            camera: { ...state.camera },
            windows: Object.fromEntries(
              Object.entries(state.windows).map(([id, w]) => [id, { ...w }])
            ),
          };
        }),

      loadWorkspace: (name) =>
        set((state) => {
          const ws = state.workspaces[name];
          if (!ws) return;
          state.camera = { ...ws.camera };
          // Restore each window (preserve any windows not in snapshot)
          for (const [id, w] of Object.entries(ws.windows)) {
            if (state.windows[id]) {
              Object.assign(state.windows[id], w);
            }
          }
        }),

      deleteWorkspace: (name) =>
        set((state) => {
          delete state.workspaces[name];
        }),

      // ─── Settings ──────────────────────────────────────────────────────────

      setMinimapVisible: (visible) =>
        set((state) => { state.minimapVisible = visible; }),

      setSnapToGrid: (snap) =>
        set((state) => { state.snapToGrid = snap; }),

      setGridSize: (size) =>
        set((state) => { state.gridSize = Math.max(10, size); }),

      setUiSoundVolume: (vol) =>
        set((state) => { state.uiSoundVolume = Math.max(0, Math.min(1, vol)); }),

      setTilted: (tilted) =>
        set((state) => { state.isTilted = tilted; }),

      setTiltPreset: (preset) =>
        set((state) => { state.tiltPreset = preset; }),

      cycleTiltPreset: () =>
        set((state) => {
          const idx = TILT_PRESET_ORDER.indexOf(state.tiltPreset);
          state.tiltPreset = TILT_PRESET_ORDER[(idx + 1) % TILT_PRESET_ORDER.length];
        }),

      toggleExpose: () =>
        set((state) => {
          if (state.exposeActive) {
            // Deactivate — WorkbenchContainer will spring back to preExposeCam
            state.exposeActive = false;
          } else {
            // Activate — save current camera so we can restore later
            state.preExposeCam = { ...state.camera };
            state.exposeActive = true;
          }
        }),

      setExposeActive: (active) =>
        set((state) => {
          state.exposeActive = active;
          if (!active) state.preExposeCam = null;
        }),

      setActiveWindowId: (id) =>
        set((state) => { state.activeWindowId = id; }),

      toggleWindowSelection: (id) =>
        set((state) => {
          const idx = state.selectedWindowIds.indexOf(id);
          if (idx >= 0) state.selectedWindowIds.splice(idx, 1);
          else state.selectedWindowIds.push(id);
        }),

      setSelectedWindowIds: (ids) =>
        set((state) => { state.selectedWindowIds = ids; }),

      clearSelection: () =>
        set((state) => { state.selectedWindowIds = []; }),

      resetLayout: () =>
        set((state) => {
          const defaults = computeDefaultWindows();
          state.windows = Object.fromEntries(
            Object.entries(defaults).map(([id, w]) => [id, { ...w }])
          ) as Record<string, WindowState>;
          state.camera = { x: 0, y: 0, scale: 1 };
          state.maxZIndex = 10;
        }),
    })),
    {
      name: 'devilbox-workbench',
      version: 3,
      migrate: (_persisted, version) => {
        // v2→v3: window positions were corrupted by zone sync moveWindow(0,0).
        // Discard old windows and use fresh defaults.
        if (version < 3) {
          return {
            ...(_persisted as Record<string, unknown>),
            windows: computeDefaultWindows(),
            camera: { x: 0, y: 0, scale: 1 },
          };
        }
        return _persisted as Record<string, unknown>;
      },
      partialize: (state) => ({
        camera: state.camera,
        windows: state.windows,
        maxZIndex: state.maxZIndex,
        workspaces: state.workspaces,
        minimapVisible: state.minimapVisible,
        snapToGrid: state.snapToGrid,
        gridSize: state.gridSize,
        uiSoundVolume: state.uiSoundVolume,
      }),
    }
  )
);
