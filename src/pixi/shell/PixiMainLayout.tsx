/**
 * PixiMainLayout — Fixed-zone shell orchestrator for the modern GL layout.
 *
 * Structure:
 *   NavBar (52px)
 *   MainView (flex: 1, changes per active view tab)
 *   BottomDock (resizable 0–360px, default 220px)
 *   StatusBar (28px)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApplication } from '@pixi/react';
import type { Container as ContainerType, Texture } from 'pixi.js';
import { Rectangle } from 'pixi.js';
import { usePixiResponsive } from '../hooks/usePixiResponsive';
import { useUIStore } from '@stores/useUIStore';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { PixiNavBar } from './PixiNavBar';
import { PixiStatusBar } from './PixiStatusBar';
import { PixiBottomDock, type DockTab } from './PixiBottomDock';
import { PixiExposeOverlay } from './PixiExposeOverlay';
import {
  MODERN_NAV_H,
  MODERN_STATUS_BAR_H,
  MODERN_DOCK_DEFAULT_H,
  TITLE_H,
} from '../workbench/workbenchLayout';

// Main view components (lazy import pattern — zero-prop components)
import { PixiTrackerView } from '../views/PixiTrackerView';
import { PixiArrangementView } from '../views/PixiArrangementView';
import { PixiPianoRollView } from '../views/PixiPianoRollView';
import { PixiDJView } from '../views/PixiDJView';
import { PixiVJView } from '../views/PixiVJView';
import { PixiMixerView } from '../views/PixiMixerView';
import { WorkbenchContainer } from '../workbench/WorkbenchContainer';

// ─── View router ─────────────────────────────────────────────────────────────

type MainViewId = 'tracker' | 'arrangement' | 'pianoroll' | 'dj' | 'vj' | 'mixer' | 'studio';

// Views that are always mounted (hidden when inactive) to avoid @pixi/layout BindingError.
// WorkbenchContainer is excluded — it contains its own copies of these views inside
// PixiWindows, so always-mounting it would cause duplicate Yoga node conflicts.
type AlwaysMountedViewId = Exclude<MainViewId, 'studio'>;

const ALWAYS_MOUNTED_VIEWS: Record<AlwaysMountedViewId, React.ComponentType> = {
  tracker: PixiTrackerView,
  arrangement: PixiArrangementView,
  pianoroll: PixiPianoRollView,
  dj: PixiDJView,
  vj: PixiVJView,
  mixer: PixiMixerView,
};

// Map UIStore activeView to our MainViewId (some views map to tracker)
function resolveMainView(activeView: string): MainViewId {
  if (activeView === 'studio') return 'studio';
  if (activeView in ALWAYS_MOUNTED_VIEWS) return activeView as MainViewId;
  // 'drumpad' or any unknown → default to tracker
  return 'tracker';
}

// ─── PixiMainLayout ──────────────────────────────────────────────────────────

export const PixiMainLayout: React.FC = () => {
  const { width, height } = usePixiResponsive();
  const { app } = useApplication();
  const activeView = useUIStore((s) => s.activeView);
  const viewExposeActive = useUIStore((s) => s.viewExposeActive);

  // Refs to view containers for thumbnail capture
  const viewRefsMap = useRef<Record<string, ContainerType | null>>({});
  const thumbnailsRef = useRef<Record<string, Texture>>({});
  const [thumbnails, setThumbnails] = useState<Record<string, Texture>>({});

  // Dock state (local — will be persisted to store later)
  const [dockHeight, setDockHeight] = useState(MODERN_DOCK_DEFAULT_H);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab>('device');
  const [dockUndocked, setDockUndocked] = useState(false);

  // When undocked, dock takes 0 height (content renders as floating overlay)
  const effectiveDockH = (dockCollapsed || dockUndocked) ? 0 : dockHeight;
  const mainViewH = height - MODERN_NAV_H - MODERN_STATUS_BAR_H - effectiveDockH;

  const handleDockResize = useCallback((newH: number) => {
    setDockHeight(newH);
    if (newH <= 0) setDockCollapsed(true);
  }, []);

  const handleDockCollapse = useCallback(() => {
    setDockCollapsed(true);
  }, []);

  const handleDockExpand = useCallback(() => {
    setDockCollapsed(false);
    setDockUndocked(false);
    if (dockHeight <= 0) setDockHeight(MODERN_DOCK_DEFAULT_H);
  }, [dockHeight]);

  const handleUndock = useCallback(() => {
    setDockUndocked(true);
  }, []);

  const handleRedock = useCallback(() => {
    setDockUndocked(false);
    setDockCollapsed(false);
    if (dockHeight <= 0) setDockHeight(MODERN_DOCK_DEFAULT_H);
  }, [dockHeight]);

  // Determine which view component to render
  const mainViewId = resolveMainView(activeView);

  // ─── Thumbnail capture for Exposé ──────────────────────────────────────────

  // Capture current view thumbnail when switching away
  const prevViewRef = useRef(mainViewId);
  useEffect(() => {
    if (prevViewRef.current !== mainViewId) {
      // Capture outgoing view before it hides
      const outgoing = prevViewRef.current;
      const container = viewRefsMap.current[outgoing];
      if (container && app?.renderer) {
        try {
          // Destroy old thumbnail
          thumbnailsRef.current[outgoing]?.destroy(true);
          const tex = app.renderer.generateTexture({
            target: container,
            frame: new Rectangle(0, 0, width, Math.max(100, mainViewH)),
            resolution: 0.35,
          });
          thumbnailsRef.current[outgoing] = tex;
          setThumbnails({ ...thumbnailsRef.current });
        } catch { /* ignore capture failures */ }
      }
      prevViewRef.current = mainViewId;
    }
  }, [mainViewId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Capture all visible views when Exposé opens
  useEffect(() => {
    if (!viewExposeActive || !app?.renderer) return;
    const viewH = Math.max(100, mainViewH);

    // Capture current view first (it's visible)
    const current = viewRefsMap.current[mainViewId];
    if (current) {
      try {
        thumbnailsRef.current[mainViewId]?.destroy(true);
        const tex = app.renderer.generateTexture({
          target: current,
          frame: new Rectangle(0, 0, width, viewH),
          resolution: 0.35,
        });
        thumbnailsRef.current[mainViewId] = tex;
      } catch { /* ignore */ }
    }

    // Capture hidden views by briefly making them visible
    for (const viewId of Object.keys(ALWAYS_MOUNTED_VIEWS)) {
      if (viewId === mainViewId) continue; // already captured
      const container = viewRefsMap.current[viewId];
      if (!container) continue;
      try {
        container.visible = true;
        thumbnailsRef.current[viewId]?.destroy(true);
        const tex = app.renderer.generateTexture({
          target: container,
          frame: new Rectangle(0, 0, width, viewH),
          resolution: 0.35,
        });
        thumbnailsRef.current[viewId] = tex;
        container.visible = false;
      } catch {
        container.visible = false;
      }
    }

    setThumbnails({ ...thumbnailsRef.current });
  }, [viewExposeActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Force compact toolbar in modern layout for maximum vertical space
  useEffect(() => {
    useUIStore.getState().setCompactToolbar(true);
  }, []);

  // ─── Sync workbench window dimensions with zone dimensions ────────────────
  // Views like PixiTrackerView read their size from useWorkbenchStore.windows[id].
  // In the modern fixed-zone layout, keep those window entries in sync so views
  // fill the zone correctly. Height includes TITLE_H so views compute
  // contentH = height - TITLE_H correctly.
  // NOTE: Skip when in studio mode — the workbench manages its own window positions.
  useEffect(() => {
    if (mainViewId === 'studio') return;
    const store = useWorkbenchStore.getState();
    // Map our view IDs to workbench window IDs
    const viewToWindowId: Record<string, string> = {
      tracker: 'tracker',
      arrangement: 'arrangement',
      pianoroll: 'pianoroll',
      dj: 'dj',
      vj: 'vj',
      mixer: 'mixer',
    };
    const winId = viewToWindowId[mainViewId];
    if (winId && store.windows[winId]) {
      // Only resize — don't move, to preserve workbench positions
      store.resizeWindow(winId, width, mainViewH + TITLE_H);
      if (!store.windows[winId].visible) store.showWindow(winId);
    }
    // Also sync dock views (instrument, master-fx)
    for (const dockWinId of ['instrument', 'master-fx']) {
      if (store.windows[dockWinId]) {
        store.resizeWindow(dockWinId, width, effectiveDockH + TITLE_H);
      }
    }
  }, [mainViewId, width, mainViewH, effectiveDockH]);

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      {/* NavBar */}
      <pixiContainer zIndex={100} layout={{ width, height: MODERN_NAV_H, flexShrink: 0 }}>
        <PixiNavBar
          dockCollapsed={dockCollapsed}
          onExpandDock={handleDockExpand}
        />
      </pixiContainer>

      {/* Main view zone — always-mounted views are stacked; only the active one is visible.
          WorkbenchContainer is conditionally mounted (it has its own sub-views that
          would conflict with Yoga layout nodes if always mounted). */}
      <pixiContainer
        zIndex={0}
        layout={{
          width,
          height: Math.max(100, mainViewH),
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {(Object.entries(ALWAYS_MOUNTED_VIEWS) as [AlwaysMountedViewId, React.ComponentType][]).map(
          ([viewId, ViewComponent]) => {
            const isActive = viewId === mainViewId;
            return (
              <pixiContainer
                key={viewId}
                ref={(c: ContainerType | null) => { viewRefsMap.current[viewId] = c; }}
                visible={isActive}
                eventMode={isActive ? 'auto' : 'none'}
                layout={{
                  position: 'absolute',
                  width,
                  height: Math.max(100, mainViewH),
                  flexDirection: 'column',
                }}
              >
                <ViewComponent />
              </pixiContainer>
            );
          }
        )}
        {/* Studio/Workbench — conditionally mounted */}
        {mainViewId === 'studio' && (
          <pixiContainer
            key="studio"
            ref={(c: ContainerType | null) => { viewRefsMap.current['studio'] = c; }}
            visible
            eventMode="auto"
            layout={{
              position: 'absolute',
              width,
              height: Math.max(100, mainViewH),
              flexDirection: 'column',
            }}
          >
            <WorkbenchContainer />
          </pixiContainer>
        )}
      </pixiContainer>

      {/* Bottom dock */}
      <pixiContainer
        zIndex={100}
        visible={!dockCollapsed && !dockUndocked}
        eventMode={(!dockCollapsed && !dockUndocked) ? 'auto' : 'none'}
        layout={{
          width,
          height: (dockCollapsed || dockUndocked) ? 0 : effectiveDockH,
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <PixiBottomDock
          width={width}
          height={dockHeight}
          activeTab={dockTab}
          onChangeTab={setDockTab}
          onResize={handleDockResize}
          onCollapse={handleDockCollapse}
          onUndock={handleUndock}
        />
      </pixiContainer>

      {/* Status bar */}
      <pixiContainer zIndex={100} layout={{ width, height: MODERN_STATUS_BAR_H, flexShrink: 0 }}>
        <PixiStatusBar />
      </pixiContainer>

      {/* Floating dock overlay — undocked mode.
          Renders as absolute overlay above the main view, near the bottom. */}
      <pixiContainer
        zIndex={500}
        visible={dockUndocked}
        eventMode={dockUndocked ? 'auto' : 'none'}
        layout={{
          position: 'absolute',
          bottom: MODERN_STATUS_BAR_H + 8,
          left: 40,
          width: Math.min(width - 80, 1200),
          height: dockHeight,
        }}
      >
        <PixiBottomDock
          width={Math.min(width - 80, 1200)}
          height={dockHeight}
          activeTab={dockTab}
          onChangeTab={setDockTab}
          onResize={handleDockResize}
          onCollapse={handleRedock}
          onUndock={handleRedock}
        />
      </pixiContainer>

      {/* View Exposé overlay — macOS Mission Control style view switcher */}
      <pixiContainer
        zIndex={1000}
        layout={{ position: 'absolute', width, height }}
      >
        <PixiExposeOverlay width={width} height={height} thumbnails={thumbnails} />
      </pixiContainer>
    </pixiContainer>
  );
};
