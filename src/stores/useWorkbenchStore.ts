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
  | 'pianoroll'
  | 'arrangement'
  | 'dj'
  | 'vj'
  | 'instrument';

/** Default window layout (world units, origin = top-left of canvas) */
const DEFAULT_WINDOWS: Record<WindowId, WindowState> = {
  tracker:     { x: 40,   y: 40,  width: 900, height: 600, zIndex: 1, visible: true,  minimized: false },
  pianoroll:   { x: 980,  y: 300, width: 700, height: 400, zIndex: 2, visible: false, minimized: false },
  arrangement: { x: 40,   y: 680, width: 900, height: 300, zIndex: 3, visible: false, minimized: false },
  dj:          { x: 40,   y: 40,  width: 1100,height: 500, zIndex: 4, visible: false, minimized: false },
  vj:          { x: 800,  y: 40,  width: 600, height: 400, zIndex: 5, visible: false, minimized: false },
  instrument:  { x: 980,  y: 40,  width: 700, height: 260, zIndex: 6, visible: true,  minimized: false },
};

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

  // Workspace snapshots
  saveWorkspace: (name: string) => void;
  loadWorkspace: (name: string) => void;
  deleteWorkspace: (name: string) => void;

  // Settings
  setMinimapVisible: (visible: boolean) => void;
  setSnapToGrid: (snap: boolean) => void;
  setGridSize: (size: number) => void;
  setUiSoundVolume: (vol: number) => void;
}

export const useWorkbenchStore = create<WorkbenchStore>()(
  persist(
    immer((set, get) => ({
      camera: { x: 0, y: 0, scale: 1 },
      windows: { ...DEFAULT_WINDOWS } as Record<string, WindowState>,
      maxZIndex: 10,
      workspaces: {},
      minimapVisible: true,
      uiSoundVolume: 0.3,
      snapToGrid: false,
      gridSize: 40,

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
          if (!state.windows[id]) return;
          state.windows[id].minimized = false;
          state.maxZIndex++;
          state.windows[id].zIndex = state.maxZIndex;
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
    })),
    {
      name: 'devilbox-workbench',
      version: 1,
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
