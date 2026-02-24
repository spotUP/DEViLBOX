/**
 * PixiRoot — Root layout container for the WebGL UI.
 * Uses @pixi/layout (Yoga flexbox) for the main app structure:
 *   NavBar (36px) | MainArea (flex:1) | StatusBar (24px)
 *
 * NOTE: The root container MUST use explicit pixel dimensions, not percentages.
 * @pixi/layout's Yoga calculateLayout() requires numeric width/height for root nodes
 * that have no parent layout to resolve percentages against.
 */

import { lazy, Suspense, useEffect } from 'react';
import { useUIStore } from '@stores';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { usePixiResponsive } from './hooks/usePixiResponsive';
import { usePixiTransition } from './hooks/usePixiTransition';
import { PixiNavBar } from './shell/PixiNavBar';
import { PixiStatusBar } from './shell/PixiStatusBar';
import { PixiTrackerView } from './views/PixiTrackerView';
import { PixiDJView } from './views/PixiDJView';
import { PixiArrangementView } from './views/PixiArrangementView';
import { PixiPianoRollView } from './views/PixiPianoRollView';
import { PixiVJView } from './views/PixiVJView';
import { PixiDOMOverlay } from './components/PixiDOMOverlay';
import { PixiPeerCursor } from './views/collaboration/PixiPeerCursor';
import { CollaborationToolbar } from '@components/collaboration/CollaborationToolbar';

const LazyCollaborationSplitView = lazy(() =>
  import('@components/collaboration/CollaborationSplitView').then(m => ({ default: m.CollaborationSplitView }))
);


const COLLAB_TOOLBAR_HEIGHT = 36;

/** Renders the content for a given view — extracted for transition support */
const PixiViewContent: React.FC<{
  view: string;
  isCollabSplit: boolean;
  showPatterns: boolean;
  modalOpen: string | null;
}> = ({ view, isCollabSplit, showPatterns, modalOpen }) => {
  if (view === 'tracker' && isCollabSplit) {
    return (
      <PixiDOMOverlay
        layout={{ width: '100%', height: '100%' }}
        style={{ overflow: 'hidden' }}
      >
        <Suspense fallback={<div style={{ color: '#606068', padding: 16 }}>Loading collab...</div>}>
          <LazyCollaborationSplitView
            onShowPatterns={() => useUIStore.getState().togglePatterns()}
            onShowExport={() => useUIStore.getState().openModal('export')}
            onShowHelp={(tab) => useUIStore.getState().openModal('help', { initialTab: tab || 'shortcuts' })}
            onShowMasterFX={() => { const s = useUIStore.getState(); s.modalOpen === 'masterFx' ? s.closeModal() : s.openModal('masterFx'); }}
            onShowInstrumentFX={() => { const s = useUIStore.getState(); s.modalOpen === 'instrumentFx' ? s.closeModal() : s.openModal('instrumentFx'); }}
            onShowInstruments={() => useUIStore.getState().openModal('instruments')}
            onShowDrumpads={() => useUIStore.getState().openModal('drumpads')}
            showPatterns={showPatterns}
            showMasterFX={modalOpen === 'masterFx'}
            showInstrumentFX={modalOpen === 'instrumentFx'}
          />
        </Suspense>
      </PixiDOMOverlay>
    );
  }
  if ((view === 'tracker' || view === 'drumpad') && !isCollabSplit) return <PixiTrackerView />;
  if (view === 'arrangement') return <PixiArrangementView />;
  if (view === 'dj') return <PixiDJView />;
  if (view === 'pianoroll') return <PixiPianoRollView />;
  if (view === 'vj') return <PixiVJView />;
  return null;
};

export const PixiRoot: React.FC = () => {
  const activeView = useUIStore(s => s.activeView);
  const showPatterns = useUIStore(s => s.showPatterns);
  const modalOpen = useUIStore(s => s.modalOpen);
  const { width, height } = usePixiResponsive();
  const collabStatus = useCollaborationStore(s => s.status);
  const collabViewMode = useCollaborationStore(s => s.viewMode);
  const isCollabSplit = collabStatus === 'connected' && collabViewMode === 'split';
  const transition = usePixiTransition(activeView);

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

      {/* Collaboration toolbar (shown when collab split mode active) */}
      {isCollabSplit && (
        <PixiDOMOverlay
          layout={{ width: '100%', height: COLLAB_TOOLBAR_HEIGHT }}
          style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        >
          <CollaborationToolbar />
        </PixiDOMOverlay>
      )}

      {/* Main content area — routes based on active view */}
      <pixiContainer
        layout={{
          flex: 1,
          width: '100%',
        }}
      >
        {/* Previous view (animating out during transition) */}
        {transition.isTransitioning && transition.prevView && (
          <pixiContainer
            alpha={transition.prevAlpha}
            x={transition.prevX}
            layout={{ position: 'absolute', width: '100%', height: '100%' }}
          >
            <PixiViewContent
              view={transition.prevView}
              isCollabSplit={isCollabSplit}
              showPatterns={showPatterns}
              modalOpen={modalOpen}
            />
          </pixiContainer>
        )}

        {/* Current view (animating in during transition, static otherwise) */}
        <pixiContainer
          alpha={transition.nextAlpha}
          x={transition.nextX}
          layout={{ position: 'absolute', width: '100%', height: '100%' }}
        >
          <PixiViewContent
            view={activeView}
            isCollabSplit={isCollabSplit}
            showPatterns={showPatterns}
            modalOpen={modalOpen}
          />
        </pixiContainer>
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
