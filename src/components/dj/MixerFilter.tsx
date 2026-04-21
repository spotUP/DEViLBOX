/**
 * MixerFilter - Single filter knob per deck
 *
 * Center = off, left = HPF, right = LPF.
 * Bipolar control: -1 (full HPF) to +1 (full LPF), 0 = bypass.
 * Shows a quantize indicator dot when quantize mode is active.
 */

import React, { useCallback } from 'react';
import { Knob } from '@components/controls/Knob';
import { useDJStore } from '@/stores/useDJStore';
import * as DJActions from '@/engine/dj/DJActions';

interface MixerFilterProps {
  deckId: 'A' | 'B' | 'C';
}

export const MixerFilter: React.FC<MixerFilterProps> = ({ deckId }) => {
  const filterPosition = useDJStore((s) => s.decks[deckId].filterPosition);
  const filterResonance = useDJStore((s) => s.decks[deckId].filterResonance);

  const handleFilterChange = useCallback((value: number) => {
    DJActions.setDeckFilter(deckId, value);
  }, [deckId]);

  const handleQChange = useCallback((value: number) => {
    DJActions.setDeckFilterResonance(deckId, value);
  }, [deckId]);

  const formatFilter = useCallback((val: number) => {
    if (Math.abs(val) < 0.01) return 'OFF';
    if (val < 0) return 'HPF';
    return 'LPF';
  }, []);

  const deckNum = deckId === 'A' ? '1' : '2';

  return (
    <div className="flex flex-col items-center gap-1" title={`Deck ${deckNum} Filter`}>
      <Knob
        value={filterPosition}
        min={-1}
        max={1}
        onChange={handleFilterChange}
        paramKey={deckId === 'A' ? 'dj.deckA.filter' : 'dj.deckB.filter'}
        label="FILTER"
        size="sm"
        color="#aa44ff"
        bipolar
        defaultValue={0}
        formatValue={formatFilter}
        title={`Deck ${deckNum} Filter — left: high-pass, center: off, right: low-pass`}
      />
      <Knob
        value={filterResonance}
        min={0.5}
        max={15}
        onChange={handleQChange}
        paramKey={deckId === 'A' ? 'dj.deckA.filterQ' : 'dj.deckB.filterQ'}
        label="Q"
        size="sm"
        color="#aa44ff"
        defaultValue={1}
        formatValue={(v) => v.toFixed(1)}
        title={`Deck ${deckNum} Filter Resonance — 0.5: gentle, 15: screaming`}
      />
    </div>
  );
};
