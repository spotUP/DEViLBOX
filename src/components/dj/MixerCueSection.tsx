/**
 * MixerCueSection - PFL/headphone cueing section
 *
 * Two PFL toggle buttons for Deck A/B, a cue volume knob, and a
 * placeholder output device selector dropdown.
 */

import React, { useCallback, useRef, useEffect } from 'react';
import { Headphones } from 'lucide-react';
import { Knob } from '@components/controls/Knob';
import { useDJStore } from '@/stores/useDJStore';

interface CueState {
  pflA: boolean;
  pflB: boolean;
  cueVolume: number;
}

export const MixerCueSection: React.FC = () => {
  const pflA = useDJStore((s) => s.decks.A.pflEnabled);
  const pflB = useDJStore((s) => s.decks.B.pflEnabled);
  const cueVolume = useDJStore((s) => s.cueVolume);

  // Ref pattern for toggle callbacks
  const stateRef = useRef<CueState>({ pflA, pflB, cueVolume });
  useEffect(() => {
    stateRef.current = { pflA, pflB, cueVolume };
  }, [pflA, pflB, cueVolume]);

  const handlePFLToggle = useCallback((deck: 'A' | 'B') => {
    const current = deck === 'A' ? stateRef.current.pflA : stateRef.current.pflB;
    useDJStore.getState().setDeckPFL(deck, !current);
  }, []);

  const handleCueVolumeChange = useCallback((value: number) => {
    useDJStore.getState().setCueVolume(value);
  }, []);

  return (
    <div className="flex flex-col items-center gap-1" title="Headphone cue section">
      {/* Cue volume knob */}
      <Knob
        value={cueVolume}
        min={0}
        max={1.5}
        onChange={handleCueVolumeChange}
        label="CUE"
        size="sm"
        color="#ffcc00"
        defaultValue={1}
        title="Cue volume — headphone pre-fader listen level"
      />

      {/* PFL buttons */}
      <div className="flex gap-1 items-center">
        <Headphones size={10} className="text-text-muted flex-shrink-0" />
        <button
          onClick={() => handlePFLToggle('A')}
          title={`PFL Deck 1 — ${pflA ? 'disable' : 'enable'} headphone monitoring`}
          className={`
            px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-colors
            ${
              pflA
                ? 'bg-accent-warning text-text-inverse'
                : 'bg-dark-bgTertiary text-text-muted border border-dark-borderLight hover:text-text-secondary'
            }
          `}
        >
          1
        </button>
        <button
          onClick={() => handlePFLToggle('B')}
          title={`PFL Deck 2 — ${pflB ? 'disable' : 'enable'} headphone monitoring`}
          className={`
            px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-colors
            ${
              pflB
                ? 'bg-accent-warning text-text-inverse'
                : 'bg-dark-bgTertiary text-text-muted border border-dark-borderLight hover:text-text-secondary'
            }
          `}
        >
          2
        </button>
      </div>
    </div>
  );
};
