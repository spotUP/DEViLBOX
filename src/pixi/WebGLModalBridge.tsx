/**
 * WebGLModalBridge — Lazily renders DOM modals in WebGL mode.
 *
 * In WebGL mode, the main App.tsx returns early with just <PixiApp />,
 * so none of the DOM modals (Settings, FileBrowser, Help, etc.) get mounted.
 * This bridge subscribes to useUIStore and lazily renders the needed modals
 * as DOM overlays on top of the WebGL canvas.
 *
 * All modals render null when inactive, so there's zero cost when idle.
 */

import { lazy, Suspense, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '@stores';

const LazySettingsModal = lazy(() =>
  import('@/components/dialogs/SettingsModal').then(m => ({ default: m.SettingsModal }))
);
const LazyEditInstrumentModal = lazy(() =>
  import('@/components/instruments/EditInstrumentModal').then(m => ({ default: m.EditInstrumentModal }))
);
const LazyMasterEffectsModal = lazy(() =>
  import('@/components/effects').then(m => ({ default: m.MasterEffectsModal }))
);
const LazyInstrumentEffectsModal = lazy(() =>
  import('@/components/effects').then(m => ({ default: m.InstrumentEffectsModal }))
);


export const WebGLModalBridge: React.FC = () => {
  const modalOpen = useUIStore(s => s.modalOpen);
  const closeModal = useUIStore(s => s.closeModal);
  const dialogOpen = useUIStore(s => s.dialogOpen);
  const closeDialogCommand = useUIStore(s => s.closeDialogCommand);
  const openModal = useUIStore(s => s.openModal);

  // Portal container on document.body — ensures modals render above
  // PixiDOMOverlay divs (z-index 10) which are also direct body children.
  // Without this, modals inside the React root div sit at stacking layer 0,
  // below the PixiDOMOverlay divs.
  const portalRef = useRef<HTMLDivElement | null>(null);
  if (!portalRef.current) {
    const div = document.createElement('div');
    div.id = 'webgl-modal-portal';
    div.style.position = 'relative';
    div.style.zIndex = '100';
    document.body.appendChild(div);
    portalRef.current = div;
  }
  useEffect(() => {
    return () => {
      portalRef.current?.remove();
      portalRef.current = null;
    };
  }, []);

  // Bridge dialogOpen commands (from keyboard shortcuts) to modalOpen state.
  // In DOM mode, TrackerView handles this. In WebGL mode, this bridge does it.
  useEffect(() => {
    if (!dialogOpen) return;
    switch (dialogOpen) {
      case 'interpolate-volume':
      case 'interpolate-effect':
        openModal('interpolate');
        break;
      case 'humanize':
        openModal('humanize');
        break;
      case 'find-replace':
        openModal('findReplace');
        break;
      case 'groove-settings':
        openModal('grooveSettings');
        break;
      case 'scale-volume-block':
        openModal('scaleVolume', { scope: 'block' });
        break;
      case 'scale-volume-track':
        openModal('scaleVolume', { scope: 'track' });
        break;
      case 'scale-volume-pattern':
        openModal('scaleVolume', { scope: 'pattern' });
        break;
      case 'keyboard-help':
        openModal('shortcutSheet');
        break;
      case 'advanced-edit':
        openModal('advancedEdit');
        break;
      case 'fade-volume':
        openModal('fadeVolume');
        break;
      case 'strum':
        openModal('strum');
        break;
      case 'effect-picker':
        openModal('effectPicker');
        break;
      case 'undo-history':
        openModal('undoHistory');
        break;
      case 'automation':
        openModal('automation');
        break;
      case 'collaboration':
        openModal('collaboration');
        break;
      case 'randomize':
        openModal('randomize');
        break;
      case 'acid-pattern':
        openModal('acidPattern');
        break;
      case 'tempo-tap':
        // Tap tempo is handled inline, no modal needed
        break;
    }
    closeDialogCommand();
  }, [dialogOpen, closeDialogCommand, openModal]);

  return createPortal(
    <Suspense fallback={null}>
      {/* Only 4 DOM modals remain — Phase 5 will convert these to GL */}
      {modalOpen === 'settings' && (
        <LazySettingsModal onClose={closeModal} />
      )}
      {modalOpen === 'instruments' && (
        <LazyEditInstrumentModal isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'masterFx' && (
        <LazyMasterEffectsModal isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'instrumentFx' && (
        <LazyInstrumentEffectsModal isOpen={true} onClose={closeModal} />
      )}
    </Suspense>,
    portalRef.current!,
  );
};
