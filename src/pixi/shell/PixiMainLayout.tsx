/**
 * PixiMainLayout — Fixed-zone shell orchestrator for the modern GL layout.
 *
 * Structure:
 *   NavBar (52px)
 *   MainView (flex: 1, changes per active view tab)
 *   BottomDock (resizable 0–360px, default 220px)
 *   StatusBar (28px)
 */

import React, { useEffect, useRef, useState, Component, type ErrorInfo } from 'react';
import { useApplication } from '@pixi/react';
import type { Container as ContainerType, Texture } from 'pixi.js';
import { Rectangle } from 'pixi.js';
import { usePixiResponsive } from '../hooks/usePixiResponsive';
import { useUIStore } from '@stores/useUIStore';
import { useAIStore } from '@stores/useAIStore';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { drainBindingErrorCount } from '../PixiApp';
import { PixiNavBar } from './PixiNavBar';
import { PixiStatusBar } from './PixiStatusBar';
import { PixiExposeOverlay } from './PixiExposeOverlay';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import {
  MODERN_NAV_H,
  MODERN_STATUS_BAR_H,
  TITLE_H,
} from '../workbench/workbenchLayout';

// Main view components (lazy import pattern — zero-prop components)
import { PixiTrackerView } from '../views/PixiTrackerView';
import { PixiDJView } from '../views/PixiDJView';
import { PixiVJView } from '../views/PixiVJView';
import { PixiDrumPadManager } from '../dialogs/PixiDrumPadManager';
import { WorkbenchContainer } from '../workbench/WorkbenchContainer';

// ─── View Error Boundary ─────────────────────────────────────────────────────
// Catches render errors in individual views so one broken view doesn't blank
// the entire app. Shows an error message and a "Reset to Tracker" button.

interface ViewErrorBoundaryProps {
  viewId: string;
  children: React.ReactNode;
  theme: ReturnType<typeof usePixiTheme>;
}

interface ViewErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ViewErrorBoundary extends Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  state: ViewErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[PixiMainLayout] View "${this.props.viewId}" crashed:`, error, info.componentStack);
  }

  handleReset = () => {
    // Reset to tracker view and clear error state for ALL view error boundaries
    useUIStore.getState().setActiveView('tracker');
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const { viewId, theme } = this.props;
      // Render a visible error message — use explicit pixel sizes (not %)
      // to guarantee it's visible even if parent layout is broken
      return (
        <pixiContainer layout={{ width: 600, height: 200, justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 12 }}>
          <pixiBitmapText
            text={`View "${viewId}" failed to render`}
            style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 16, fill: 0xffffff }}
            tint={theme.accent.color}
          />
          <pixiBitmapText
            text={this.state.error?.message?.slice(0, 120) || 'Unknown error'}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
            tint={theme.textMuted.color}
          />
          <pixiBitmapText
            text="Click here to reset to Tracker view"
            style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 13, fill: 0xffffff }}
            tint={theme.accentHighlight.color}
            eventMode="static"
            cursor="pointer"
            onPointerUp={this.handleReset}
          />
        </pixiContainer>
      );
    }
    return this.props.children;
  }
}

// ─── View router ─────────────────────────────────────────────────────────────

type MainViewId = 'tracker' | 'dj' | 'vj' | 'studio' | 'drumpad';

// Views that are always mounted (hidden when inactive) to avoid @pixi/layout BindingError.
// WorkbenchContainer and VJ are excluded — WorkbenchContainer contains its own copies
// of views inside PixiWindows (duplicate Yoga conflicts); VJ creates separate WebGL
// contexts (ProjectM/butterchurn/Three.js) that waste GPU and can interfere with PixiJS
// when always-mounted.
type AlwaysMountedViewId = Exclude<MainViewId, 'studio' | 'vj'>;

const ALWAYS_MOUNTED_VIEWS: Record<AlwaysMountedViewId, React.ComponentType> = {
  tracker: PixiTrackerView,
  dj: PixiDJView,
  drumpad: PixiDrumPadManager,
};

// Map UIStore activeView to our MainViewId (some views map to tracker)
function resolveMainView(activeView: string): MainViewId {
  if (activeView === 'studio' || activeView === 'vj') return activeView as MainViewId;
  if (activeView in ALWAYS_MOUNTED_VIEWS) return activeView as MainViewId;
  // Unknown views → default to tracker
  return 'tracker';
}

// ─── PixiMainLayout ──────────────────────────────────────────────────────────

export const PixiMainLayout: React.FC = () => {
  const theme = usePixiTheme();
  const { width: rawWidth, height } = usePixiResponsive();
  const { app } = useApplication();
  const activeView = useUIStore((s) => s.activeView);
  const viewExposeActive = useUIStore((s) => s.viewExposeActive);
  const aiPanelOpen = useAIStore((s) => s.isOpen);

  // Shrink main content when AI panel is open
  const width = aiPanelOpen ? Math.max(400, rawWidth - 380) : rawWidth;

  // Refs to view containers for thumbnail capture
  const viewRefsMap = useRef<Record<string, ContainerType | null>>({});
  const thumbnailsRef = useRef<Record<string, Texture>>({});
  const [thumbnails, setThumbnails] = useState<Record<string, Texture>>({});

  // Determine which view component to render
  const mainViewId = resolveMainView(activeView);

  // Fullscreen views hide nav + status bar (matching DOM AppLayout.isFullscreenView)
  const isFullscreenView = mainViewId === 'vj';
  const editorFullscreen = useUIStore(s => s.editorFullscreen);
  // VJ hides everything; editor fullscreen hides status bar but keeps nav (with tab bar hidden inside it)
  const hideAllChrome = isFullscreenView;
  const hideStatusBar = isFullscreenView || editorFullscreen;

  const mainViewH = hideAllChrome
    ? height
    : hideStatusBar
      ? height - MODERN_NAV_H
      : height - MODERN_NAV_H - MODERN_STATUS_BAR_H;

  // ─── Yoga BindingError recovery ────────────────────────────────────────────
  // When BindingErrors are suppressed, trigger a renderer resize to force
  // @pixi/layout to recalculate the Yoga tree (fixes 0×0 computed layout nodes).
  // NOTE: Do NOT call React forceUpdate here — it causes a massive re-render
  // that may itself trigger more BindingErrors, creating an infinite CPU loop.
  useEffect(() => {
    const timer = setInterval(() => {
      const errors = drainBindingErrorCount();
      if (errors > 0) {
        console.warn(`[PixiMainLayout] ${errors} BindingError(s) detected — triggering layout recovery`);
        if (app?.renderer) {
          app.renderer.resize(width, height);
        }
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [app, width, height]);

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
          const oldTex = thumbnailsRef.current[outgoing];
          const tex = app.renderer.generateTexture({
            target: container,
            frame: new Rectangle(0, 0, width, Math.max(100, mainViewH)),
            resolution: 0.35,
          });
          thumbnailsRef.current[outgoing] = tex;
          setThumbnails({ ...thumbnailsRef.current });
          // Destroy old texture AFTER React has re-rendered with the new one
          requestAnimationFrame(() => { oldTex?.destroy(true); });
        } catch { /* ignore capture failures */ }
      }
      prevViewRef.current = mainViewId;
    }
  }, [mainViewId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Capture all visible views when Exposé opens
  useEffect(() => {
    if (!viewExposeActive || !app?.renderer) return;

    // Delay capture by one rAF frame to let React reconciliation + PixiJS
    // render group updates complete. Without this, generateTexture can
    // encounter destroyed display objects and crash with null alphaMode /
    // renderPipeId errors.
    const rafId = requestAnimationFrame(() => {
      if (!app?.renderer) return;
      const viewH = Math.max(100, mainViewH);
      const oldTextures: (import('pixi.js').Texture | undefined)[] = [];

      // Capture current view first (it's visible)
      const current = viewRefsMap.current[mainViewId];
      if (current) {
        try {
          oldTextures.push(thumbnailsRef.current[mainViewId]);
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
          oldTextures.push(thumbnailsRef.current[viewId]);
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
      // Destroy old textures after React re-renders with new ones
      requestAnimationFrame(() => { oldTextures.forEach(t => t?.destroy(true)); });
    });

    return () => cancelAnimationFrame(rafId);
  }, [viewExposeActive]); // eslint-disable-line react-hooks/exhaustive-deps

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
      dj: 'dj',
      vj: 'vj',
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
        store.resizeWindow(dockWinId, width, TITLE_H);
      }
    }
  }, [mainViewId, width, mainViewH]);

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      {/* NavBar — hidden in VJ fullscreen only (tab bar hidden inside it for editor fullscreen) */}
      {!hideAllChrome && (
        <pixiContainer zIndex={100} layout={{ width, height: MODERN_NAV_H, flexShrink: 0 }}>
          <PixiNavBar />
        </pixiContainer>
      )}

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
                <ViewErrorBoundary viewId={viewId} theme={theme}>
                  <ViewComponent />
                </ViewErrorBoundary>
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
            <ViewErrorBoundary viewId="studio" theme={theme}>
              <WorkbenchContainer />
            </ViewErrorBoundary>
          </pixiContainer>
        )}
        {/* VJ — conditionally mounted (creates separate WebGL contexts for
            ProjectM/butterchurn/Three.js that waste GPU when always-mounted) */}
        {mainViewId === 'vj' && (
          <pixiContainer
            key="vj"
            ref={(c: ContainerType | null) => { viewRefsMap.current['vj'] = c; }}
            visible
            eventMode="auto"
            layout={{
              position: 'absolute',
              width,
              height: Math.max(100, mainViewH),
              flexDirection: 'column',
            }}
          >
            <ViewErrorBoundary viewId="vj" theme={theme}>
              <PixiVJView />
            </ViewErrorBoundary>
          </pixiContainer>
        )}
      </pixiContainer>

      {/* Status bar — hidden in VJ and editor fullscreen */}
      {!hideStatusBar && (
        <pixiContainer zIndex={100} layout={{ width, height: MODERN_STATUS_BAR_H, flexShrink: 0 }}>
          <PixiStatusBar />
        </pixiContainer>
      )}

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
