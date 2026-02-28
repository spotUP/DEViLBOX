/**
 * PixiRoot — Root layout container for the WebGL UI.
 * Uses @pixi/layout (Yoga flexbox) for the main app structure:
 *   NavBar | MainArea (flex:1) | StatusBar
 *
 * NOTE: The root container MUST use explicit pixel dimensions, not percentages.
 * @pixi/layout's Yoga calculateLayout() requires numeric width/height for root nodes
 * that have no parent layout to resolve percentages against.
 */

import { useRef, useEffect } from 'react';
import { useTick } from '@pixi/react';
import type { Container as ContainerType } from 'pixi.js';
import { useUIStore, useSettingsStore } from '@stores';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { usePixiResponsive } from './hooks/usePixiResponsive';
import { PixiNavBar } from './shell/PixiNavBar';
import { PixiStatusBar } from './shell/PixiStatusBar';
import { PixiPeerCursor } from './views/collaboration/PixiPeerCursor';
import { WorkbenchContainer } from './workbench/WorkbenchContainer';
import { CRTRenderer } from './CRTRenderer';

export const PixiRoot: React.FC = () => {
  const { width, height } = usePixiResponsive();
  const collabStatus = useCollaborationStore(s => s.status);
  const activeView = useUIStore(s => s.activeView);

  const crtEnabled = useSettingsStore((s) => s.crtEnabled);
  const crtParams  = useSettingsStore((s) => s.crtParams);

  const rootContainerRef = useRef<ContainerType>(null);
  const crtRef = useRef<CRTRenderer | null>(null);

  // Keep drumpad modal auto-open behavior
  useEffect(() => {
    if (activeView === 'drumpad') {
      const s = useUIStore.getState();
      if (s.modalOpen !== 'drumpads') s.openModal('drumpads');
    }
  }, [activeView]);

  // Create CRTRenderer filter once on mount. PixiJS manages the RT internally.
  useEffect(() => {
    const filter = new CRTRenderer();
    crtRef.current = filter;
    return () => {
      filter.destroy();
      crtRef.current = null;
    };
  }, []);

  // Apply/remove the filter and update uniforms each frame.
  useTick(() => {
    const container = rootContainerRef.current;
    const crt = crtRef.current;
    if (!container || !crt) return;

    if (crtEnabled) {
      if (!container.filters?.includes(crt)) container.filters = [crt];
      crt.updateParams(performance.now() / 1000, crtParams);
    } else {
      if (container.filters?.length) container.filters = [];
    }
  });

  return (
    <pixiContainer
      ref={rootContainerRef}
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
