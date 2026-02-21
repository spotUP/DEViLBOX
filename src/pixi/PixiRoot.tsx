/**
 * PixiRoot — Root layout container for the WebGL UI.
 * Uses @pixi/layout (Yoga flexbox) for the main app structure:
 *   NavBar (36px) | MainArea (flex:1) | StatusBar (24px)
 *
 * NOTE: The root container MUST use explicit pixel dimensions, not percentages.
 * @pixi/layout's Yoga calculateLayout() requires numeric width/height for root nodes
 * that have no parent layout to resolve percentages against.
 */

import { useEffect } from 'react';
import { useUIStore } from '@stores';
import { usePixiResponsive } from './hooks/usePixiResponsive';
import { PixiNavBar } from './shell/PixiNavBar';
import { PixiStatusBar } from './shell/PixiStatusBar';
import { PixiTrackerView } from './views/PixiTrackerView';
import { PixiDJView } from './views/PixiDJView';
import { PixiArrangementView } from './views/PixiArrangementView';


export const PixiRoot: React.FC = () => {
  const activeView = useUIStore(s => s.activeView);
  const { width, height } = usePixiResponsive();

  // Auto-open drumpads modal when drumpad view is active
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
      {/* Navigation bar */}
      <PixiNavBar />

      {/* Main content area — routes based on active view */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
        }}
      >
        {(activeView === 'tracker' || activeView === 'drumpad') && <PixiTrackerView />}
        {activeView === 'arrangement' && <PixiArrangementView />}
        {activeView === 'dj' && <PixiDJView />}
      </pixiContainer>

      {/* Status bar */}
      <PixiStatusBar />
    </pixiContainer>
  );
};
