/**
 * PixiInstrumentPanel — Instrument list for WebGL mode.
 * Renders the actual DOM InstrumentList component via PixiDOMOverlay
 * for pixel-perfect parity with the DOM tracker view.
 */

import { useCallback, useEffect, useState } from 'react';
import { PixiDOMOverlay } from '../../components/PixiDOMOverlay';
import { useUIStore } from '@stores';

interface PixiInstrumentPanelProps {
  width: number;
  height: number;
}

/**
 * Lazy-loaded wrapper for the DOM InstrumentList component.
 * Uses dynamic import() to avoid circular dependency issues
 * when importing DOM components into Pixi view files.
 */
const InstrumentListOverlay: React.FC = () => {
  const [Comp, setComp] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    import('@components/instruments/InstrumentList').then(m => {
      setComp(() => m.InstrumentList);
    });
  }, []);

  const handleEdit = useCallback(() => {
    useUIStore.getState().openModal('instruments');
  }, []);

  if (!Comp) return null;

  return (
    <Comp
      variant="ft2"
      showPreviewOnClick={true}
      showPresetButton={true}
      showSamplePackButton={true}
      showEditButton={true}
      onEditInstrument={handleEdit}
    />
  );
};

export const PixiInstrumentPanel: React.FC<PixiInstrumentPanelProps> = ({ width, height }) => {
  return (
    <PixiDOMOverlay
      layout={{ width, height }}
      style={{ overflow: 'hidden' }}
    >
      <div style={{ width: '100%', height: '100%' }}>
        <InstrumentListOverlay />
      </div>
    </PixiDOMOverlay>
  );
};
