/**
 * OPL3LayoutPanel - the OPL3 operator panel (OPL3_LAYOUT) with its routing diagram and curves, below the read-only
 * register viewer. Edits go through the instrument's `opl3` config, which the store pushes to the OPL3 engine.
 */
import React, { useMemo } from 'react';
import { DOMSynthPanel } from './DOMSynthPanel';
import { FMAlgorithmDiagram } from '../shared/FMAlgorithmDiagram';
import { getSynthLayout } from '@/constants/synthLayouts';
import { deepMerge } from '../../../lib/migration';
import { DEFAULT_OPL3, type InstrumentConfig } from '@typedefs/instrument';

interface OPL3LayoutPanelProps {
  instrument: Pick<InstrumentConfig, 'id' | 'opl3'>;
  onChange: (updates: Record<string, unknown>) => void;
}

export const OPL3LayoutPanel: React.FC<OPL3LayoutPanelProps> = ({ instrument, onChange }) => {
  const layout = getSynthLayout('OPL3');
  const opl3 = useMemo(() => deepMerge(DEFAULT_OPL3, instrument.opl3 || {}), [instrument.opl3]);
  const config = useMemo(() => ({ opl3 }) as Record<string, unknown>, [opl3]);
  if (!layout) return null;
  return (
    <div className="border-t border-dark-border/30 mt-2 pt-2">
      <div className="mb-2 max-w-xs">
        {/* The OPL convention numbers the modulator 1 and the carrier 2; the diagram's serial chain is 2 -> 1. */}
        <FMAlgorithmDiagram algorithm={opl3.connection ? 1 : 0} feedback={opl3.feedback ?? 0} opCount={2} opLabels={{ 2: '1', 1: '2' }} />
      </div>
      <DOMSynthPanel layout={layout} config={config} onChange={onChange} instrumentId={instrument.id} />
    </div>
  );
};
