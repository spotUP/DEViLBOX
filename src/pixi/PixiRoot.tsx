/**
 * PixiRoot — Root layout container for the WebGL UI.
 * Uses @pixi/layout (Yoga flexbox) for the main app structure:
 *   NavBar | MainArea (flex:1) | StatusBar
 *
 * NOTE: The root container MUST use explicit pixel dimensions, not percentages.
 * @pixi/layout's Yoga calculateLayout() requires numeric width/height for root nodes
 * that have no parent layout to resolve percentages against.
 */

import { useEffect } from 'react';
import { useApplication, useTick } from '@pixi/react';
import { useUIStore, useSettingsStore } from '@stores';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { usePixiResponsive } from './hooks/usePixiResponsive';
import { PixiNavBar } from './shell/PixiNavBar';
import { PixiStatusBar } from './shell/PixiStatusBar';
import { PixiPeerCursor } from './views/collaboration/PixiPeerCursor';
import { WorkbenchContainer } from './workbench/WorkbenchContainer';
import { CRTRenderer } from './CRTRenderer';
import { useRef } from 'react';
import { Rectangle } from 'pixi.js';
import type { Container as ContainerType } from 'pixi.js';
import { usePixiTheme } from './theme';
import { getAverageFps } from './performance';
import { NAV_H, STATUS_BAR_H } from './workbench/workbenchLayout';

export const PixiRoot: React.FC = () => {
  const { width, height } = usePixiResponsive();
  const collabStatus = useCollaborationStore(s => s.status);
  const activeView = useUIStore(s => s.activeView);

  const { app } = useApplication();
  const crtEnabled = useSettingsStore((s) => s.crtEnabled);
  const crtParams  = useSettingsStore((s) => s.crtParams);

  const crtRef = useRef<CRTRenderer | null>(null);
  // Hysteresis state: bloom off below 45fps, back on above 55fps
  const bloomEnabledRef = useRef(true);
  const navBarLayerRef    = useRef<ContainerType>(null);
  const statusBarLayerRef = useRef<ContainerType>(null);
  const theme = usePixiTheme();

  // Enable texture cache for static chrome layers
  useEffect(() => {
    navBarLayerRef.current?.cacheAsTexture(true);
    statusBarLayerRef.current?.cacheAsTexture(true);
  }, []);

  // Invalidate on theme change (colors change)
  useEffect(() => {
    navBarLayerRef.current?.updateCacheTexture();
    statusBarLayerRef.current?.updateCacheTexture();
  }, [theme]);

  // Keep drumpad modal auto-open behavior
  useEffect(() => {
    if (activeView === 'drumpad') {
      const s = useUIStore.getState();
      if (s.modalOpen !== 'drumpads') s.openModal('drumpads');
    }
  }, [activeView]);

  // Create CRTRenderer filter once on mount.
  useEffect(() => {
    const filter = new CRTRenderer();
    crtRef.current = filter;
    return () => {
      // Remove from stage before destroying
      if (app?.stage?.filters?.includes(filter)) app.stage.filters = [];
      filter.destroy();
      crtRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep stage.filterArea in sync with the screen dimensions so the CRT filter's
  // internal RenderTexture is always exactly screen-sized.  Without this, PixiJS
  // computes the RT size from app.stage's full bounding box (which includes all
  // workbench content, potentially far off-screen on the infinite canvas).  A huge
  // RT causes vTextureCoord to be a tiny fraction of [0,1], making the curvature
  // shader magnify small objects (e.g. window chrome buttons) into giant blobs.
  useEffect(() => {
    if (!app?.stage) return;
    app.stage.filterArea = new Rectangle(0, 0, width, height);
  }, [app, width, height]);

  // Apply filter to app.stage (not a @pixi/layout container — no Yoga hooks fire).
  // Removing/adding on crtEnabled avoids per-frame filter array churn.
  useTick(() => {
    const crt = crtRef.current;
    if (!crt || !app?.stage) return;

    if (crtEnabled) {
      if (!app.stage.filters?.includes(crt)) app.stage.filters = [crt];

      // Adaptive quality: hysteresis — bloom off below 45fps, stays off until > 55fps
      const fps = getAverageFps();
      if (bloomEnabledRef.current  && fps < 45) bloomEnabledRef.current = false;
      if (!bloomEnabledRef.current && fps > 55) bloomEnabledRef.current = true;

      crt.updateParams(performance.now() / 1000, {
        ...crtParams,
        bloomIntensity: bloomEnabledRef.current ? crtParams.bloomIntensity : 0,
      });
    } else {
      if (app.stage.filters?.length) app.stage.filters = [];
    }
  });

  return (
    <pixiContainer
      layout={{
        width,
        height,
        flexDirection: 'column',
      }}
    >
      {/* Navigation bar — pure Pixi; explicit height prevents implicit child dependency */}
      <pixiContainer ref={navBarLayerRef} layout={{ width: '100%', height: NAV_H }}>
        <PixiNavBar />
      </pixiContainer>

      {/* Main content area — workbench fills remaining space */}
      <pixiContainer layout={{ flex: 1, width: '100%' }}>
        <WorkbenchContainer />
      </pixiContainer>

      {/* Status bar; explicit height prevents implicit child dependency */}
      <pixiContainer ref={statusBarLayerRef} layout={{ width: '100%', height: STATUS_BAR_H }}>
        <PixiStatusBar />
      </pixiContainer>

      {/* Peer cursor overlay — always mounted to avoid @pixi/layout BindingError */}
      <pixiContainer
        alpha={collabStatus === 'connected' ? 1 : 0}
        renderable={collabStatus === 'connected'}
        eventMode={collabStatus === 'connected' ? 'auto' : 'none'}
        layout={{ position: 'absolute', width, height }}
      >
        <PixiPeerCursor width={width} height={height} />
      </pixiContainer>
    </pixiContainer>
  );
};
