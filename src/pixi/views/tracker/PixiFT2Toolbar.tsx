/**
 * PixiFT2Toolbar — FT2-style toolbar for WebGL tracker view.
 * Renders the actual DOM FT2Toolbar component via PixiDOMOverlay
 * for pixel-perfect parity with the DOM tracker view.
 *
 * Wires all callback props to useUIStore modal actions.
 */

import { useCallback, useEffect, useState } from 'react';
import { PixiDOMOverlay } from '../../components/PixiDOMOverlay';
import { useUIStore } from '@stores';

/**
 * Height of the DOM FT2Toolbar:
 * - Content area (toolbar rows + visualizer): min-h-[120px] → ~120px
 * - Menu bar buttons row: py-1 + buttons → ~28px
 * Total: ~148px, rounded up to account for padding/gaps
 */
const FT2_TOOLBAR_DOM_HEIGHT = 160;

/**
 * Lazy-loaded wrapper for the DOM FT2Toolbar component.
 * Uses dynamic import() to avoid circular dependency issues.
 */
const FT2ToolbarOverlay: React.FC = () => {
  const [Comp, setComp] = useState<React.ComponentType<any> | null>(null);
  const modalOpen = useUIStore(s => s.modalOpen);

  useEffect(() => {
    import('@components/tracker/FT2Toolbar').then(m => setComp(() => m.FT2Toolbar));
  }, []);

  const handleShowExport = useCallback(() => {
    useUIStore.getState().openModal('export');
  }, []);

  const handleShowHelp = useCallback((tab?: string) => {
    useUIStore.getState().openModal('help', { initialTab: tab || 'shortcuts' });
  }, []);

  const handleShowMasterFX = useCallback(() => {
    const s = useUIStore.getState();
    s.modalOpen === 'masterFx' ? s.closeModal() : s.openModal('masterFx');
  }, []);

  const handleShowInstrumentFX = useCallback(() => {
    const s = useUIStore.getState();
    s.modalOpen === 'instrumentFx' ? s.closeModal() : s.openModal('instrumentFx');
  }, []);

  const handleShowInstruments = useCallback(() => {
    useUIStore.getState().openModal('instruments');
  }, []);

  const handleShowPatternOrder = useCallback(() => {
    useUIStore.getState().openModal('patternOrder');
  }, []);

  const handleShowDrumpads = useCallback(() => {
    useUIStore.getState().openModal('drumpads');
  }, []);

  if (!Comp) return null;

  return (
    <Comp
      onShowExport={handleShowExport}
      onShowHelp={handleShowHelp}
      onShowMasterFX={handleShowMasterFX}
      onShowInstrumentFX={handleShowInstrumentFX}
      onShowInstruments={handleShowInstruments}
      onShowPatternOrder={handleShowPatternOrder}
      onShowDrumpads={handleShowDrumpads}
      showMasterFX={modalOpen === 'masterFx'}
      showInstrumentFX={modalOpen === 'instrumentFx'}
    />
  );
};

export const PixiFT2Toolbar: React.FC = () => {
  return (
    <PixiDOMOverlay
      layout={{ width: '100%', height: FT2_TOOLBAR_DOM_HEIGHT }}
      style={{ overflow: 'visible', zIndex: 35 }}
      autoHeight
    >
      <FT2ToolbarOverlay />
    </PixiDOMOverlay>
  );
};
