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

export const PixiRoot: React.FC = () => {
  const { width, height } = usePixiResponsive();
  const collabStatus = useCollaborationStore(s => s.status);
  const activeView = useUIStore(s => s.activeView);

  const { app } = useApplication();
  const crtEnabled = useSettingsStore((s) => s.crtEnabled);
  const crtParams  = useSettingsStore((s) => s.crtParams);

  const crtRef = useRef<CRTRenderer | null>(null);

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

  // Apply filter to app.stage (not a @pixi/layout container — no Yoga hooks fire).
  // Removing/adding on crtEnabled avoids per-frame filter array churn.
  useTick(() => {
    const crt = crtRef.current;
    if (!crt || !app?.stage) return;

    if (crtEnabled) {
      if (!app.stage.filters?.includes(crt)) app.stage.filters = [crt];
      crt.updateParams(performance.now() / 1000, crtParams);
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
      {/* Navigation bar — pure Pixi */}
      <PixiNavBar />

      {/* Main content area — workbench fills remaining space */}
      <pixiContainer layout={{ flex: 1, width: '100%' }}>
        <WorkbenchContainer />
      </pixiContainer>

      {/* Status bar */}
      <PixiStatusBar />

      {/* Peer cursor overlay (collaboration) */}
      {collabStatus === 'connected' && (
        <PixiPeerCursor width={width} height={height} />
      )}
    </pixiContainer>
  );
};
