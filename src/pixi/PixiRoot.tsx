/**
 * PixiRoot — Root layout container for the WebGL UI.
 *
 * Modern mode: PixiMainLayout (fixed zones: NavBar, MainView, BottomDock, StatusBar)
 * CRT filter still applies globally via app.stage.filters.
 *
 * NOTE: The root container MUST use explicit pixel dimensions, not percentages.
 * @pixi/layout's Yoga calculateLayout() requires numeric width/height for root nodes
 * that have no parent layout to resolve percentages against.
 */

import { useEffect, useRef } from 'react';
import { useApplication, useTick } from '@pixi/react';
import { isRapidScrolling } from './scrollPerf';
import { useUIStore, useSettingsStore } from '@stores';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { usePixiResponsive } from './hooks/usePixiResponsive';
import { PixiPeerCursor } from './views/collaboration/PixiPeerCursor';
import { PixiGlobalDropdownLayer } from './components/PixiGlobalDropdownLayer';
import { PixiMainLayout } from './shell/PixiMainLayout';
import { CRTRenderer } from './CRTRenderer';
import { Rectangle } from 'pixi.js';
import { getAverageFps } from './performance';
import { PixiNewSongWizard } from './dialogs/PixiNewSongWizard';
import { PixiInterpolateDialog } from './dialogs/PixiInterpolateDialog';
import { PixiHumanizeDialog } from './dialogs/PixiHumanizeDialog';
import { PixiScaleVolumeDialog } from './dialogs/PixiScaleVolumeDialog';
import { PixiFadeVolumeDialog } from './dialogs/PixiFadeVolumeDialog';
import { PixiStrumDialog } from './dialogs/PixiStrumDialog';
import { PixiAcidPatternDialog } from './dialogs/PixiAcidPatternDialog';
import { PixiRandomizeDialog } from './dialogs/PixiRandomizeDialog';

export const PixiRoot: React.FC = () => {
  const { width, height } = usePixiResponsive();
  const collabStatus = useCollaborationStore(s => s.status);
  const activeView = useUIStore(s => s.activeView);
  const modalOpen = useUIStore(s => s.modalOpen);
  const modalData = useUIStore(s => s.modalData);
  const closeModal = useUIStore(s => s.closeModal);

  const { app } = useApplication();
  const crtEnabled = useSettingsStore((s) => s.crtEnabled);
  const crtParams  = useSettingsStore((s) => s.crtParams);

  const crtRef = useRef<CRTRenderer | null>(null);
  // Hysteresis state: bloom off below 45fps, back on above 55fps
  const bloomEnabledRef = useRef(true);

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
  // internal RenderTexture is always exactly screen-sized.
  useEffect(() => {
    if (!app?.stage) return;
    app.stage.filterArea = new Rectangle(0, 0, width, height);
  }, [app, width, height]);

  // Apply CRT filter to app.stage.
  useTick(() => {
    if (isRapidScrolling()) return;
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
      {/* Modern fixed-zone shell */}
      <PixiMainLayout />

      {/* Global dropdown layer — above all window masks (zIndex 9999) */}
      <PixiGlobalDropdownLayer />

      {/* GL-native modals — inside scene graph so CRT shader catches them */}
      <pixiContainer zIndex={300} layout={{ position: 'absolute', width, height }}>
        <PixiNewSongWizard />
        <PixiInterpolateDialog isOpen={modalOpen === 'interpolate'} onClose={closeModal} />
        <PixiHumanizeDialog isOpen={modalOpen === 'humanize'} onClose={closeModal} />
        <PixiScaleVolumeDialog
          isOpen={modalOpen === 'scaleVolume'}
          onClose={closeModal}
          scope={(modalData?.scope as 'block' | 'track' | 'pattern') || 'block'}
        />
        <PixiFadeVolumeDialog
          isOpen={modalOpen === 'fadeVolume'}
          onClose={closeModal}
          scope={(modalData?.scope as 'block' | 'track' | 'pattern') || 'block'}
        />
        <PixiStrumDialog isOpen={modalOpen === 'strum'} onClose={closeModal} />
        <PixiAcidPatternDialog isOpen={modalOpen === 'acidPattern'} onClose={closeModal} />
        <PixiRandomizeDialog isOpen={modalOpen === 'randomize'} onClose={closeModal} />
      </pixiContainer>

      {/* Peer cursor overlay — above everything */}
      <pixiContainer
        zIndex={200}
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
