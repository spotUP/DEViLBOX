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
import { useUIStore } from '@stores';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { usePixiResponsive } from './hooks/usePixiResponsive';
import { PixiNavBar } from './shell/PixiNavBar';
import { PixiStatusBar } from './shell/PixiStatusBar';
import { PixiPeerCursor } from './views/collaboration/PixiPeerCursor';
import { WorkbenchContainer } from './workbench/WorkbenchContainer';

export const PixiRoot: React.FC = () => {
  const { width, height } = usePixiResponsive();
  const collabStatus = useCollaborationStore(s => s.status);
  const activeView = useUIStore(s => s.activeView);

  // Keep drumpad modal auto-open behavior
  useEffect(() => {
    if (activeView === 'drumpad') {
      const s = useUIStore.getState();
      if (s.modalOpen !== 'drumpads') s.openModal('drumpads');
    }
  }, [activeView]);

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
