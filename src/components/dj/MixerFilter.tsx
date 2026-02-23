/**
 * MixerFilter - Single filter knob per deck
 *
 * Center = off, left = HPF, right = LPF.
 * Bipolar control: -1 (full HPF) to +1 (full LPF), 0 = bypass.
 */

import React, { useCallback } from 'react';
import { Knob } from '@components/controls/Knob';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface MixerFilterProps {
  deckId: 'A' | 'B' | 'C';
}

export const MixerFilter: React.FC<MixerFilterProps> = ({ deckId }) => {
  const filterPosition = useDJStore((s) => s.decks[deckId].filterPosition);

  const handleChange = useCallback((value: number) => {
    useDJStore.getState().setDeckFilter(deckId, value);
    getDJEngine().getDeck(deckId).setFilterPosition(value);
  }, [deckId]);

  const formatFilter = useCallback((val: number) => {
    if (Math.abs(val) < 0.05) return 'OFF';
    if (val < 0) return 'HPF';
    return 'LPF';
  }, []);

  const deckNum = deckId === 'A' ? '1' : '2';

  return (
    <div className="flex flex-col items-center" title={`Deck ${deckNum} Filter`}>
      <Knob
        value={filterPosition}
        min={-1}
        max={1}
        onChange={handleChange}
        label="FILTER"
        size="sm"
        color="#aa44ff"
        bipolar
        defaultValue={0}
        formatValue={formatFilter}
        title={`Deck ${deckNum} Filter — left: high-pass, center: off, right: low-pass`}
      />
    </div>
  );
};
