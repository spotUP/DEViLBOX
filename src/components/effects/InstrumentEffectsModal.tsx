/**
 * InstrumentEffectsModal - the full-screen FX editor for the current
 * instrument's chain. It is MasterEffectsModal pointed at the instrument:
 * same chain cards, parameter editor and effect browser; only the chain
 * differs, and the master-bus-only controls (channel scope, sidechain key,
 * beat quantize, pop-out) are left out.
 */

import React, { useMemo } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { instrumentDisplayName } from '@/lib/instruments/instrumentDisplayName';
import { MasterEffectsModal } from './MasterEffectsModal';
import type { FxChainTarget } from './fxChainTarget';

export interface InstrumentEffectsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstrumentEffectsModal: React.FC<InstrumentEffectsModalProps> = ({ isOpen, onClose }) => {
  const instrument = useInstrumentStore((s) => s.instruments.find((i) => i.id === s.currentInstrumentId));
  const instrumentId = instrument?.id;
  const target = useMemo<FxChainTarget | null>(
    () => (instrumentId === undefined ? null : { kind: 'instrument', instrumentId }),
    [instrumentId],
  );

  if (!isOpen || !instrument || !target) return null;

  return (
    <MasterEffectsModal
      isOpen={isOpen}
      onClose={onClose}
      target={target}
      title={`Instrument Effects: ${instrumentDisplayName(instrument)}`}
    />
  );
};
