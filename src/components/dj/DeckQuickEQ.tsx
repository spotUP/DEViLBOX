/**
 * DeckQuickEQ — One-tap EQ preset strip for DJ decks.
 *
 * Compact row of pill buttons that instantly apply EQ curves to the
 * existing 3-band EQ. Active preset is highlighted; manual mixer
 * knob adjustments automatically clear the highlight.
 */

import React, { useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { DJ_EQ_PRESETS } from '@/constants/djEqPresets';
import { applyEqPreset } from '@/engine/dj/DJActions';

interface DeckQuickEQProps {
  deckId: 'A' | 'B' | 'C';
}

export const DeckQuickEQ: React.FC<DeckQuickEQProps> = ({ deckId }) => {
  const activePreset = useDJStore((s) => s.decks[deckId].eqPreset);

  const handleClick = useCallback((presetId: string) => {
    const preset = DJ_EQ_PRESETS.find((p) => p.id === presetId);
    if (preset) applyEqPreset(deckId, preset);
  }, [deckId]);

  return (
    <div className="flex gap-1 px-1 py-0.5 items-center">
      <span className="text-[9px] text-text-muted font-mono uppercase tracking-wider mr-0.5 select-none">EQ</span>
      {DJ_EQ_PRESETS.map((preset) => {
        const isActive = activePreset === preset.id;
        return (
          <button
            key={preset.id}
            onClick={() => handleClick(preset.id)}
            title={preset.description}
            className={`
              px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide
              border transition-colors duration-100 cursor-pointer select-none outline-none
              ${isActive
                ? 'bg-accent-primary/20 border-accent-primary text-accent-primary'
                : 'bg-dark-surface/50 border-dark-border text-text-muted hover:text-text-primary hover:border-text-muted'
              }
            `}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
};
