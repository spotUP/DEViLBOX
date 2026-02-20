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
    <div className="flex flex-col items-center gap-1">
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
      />

      {/* PFL buttons */}
      <div className="flex gap-1 items-center">
        <Headphones size={10} className="text-text-muted flex-shrink-0" />
        <button
          onClick={() => handlePFLToggle('A')}
          className={`
            px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-colors
            ${
              pflA
                ? 'bg-yellow-500 text-black shadow-[0_0_8px_rgba(234,179,8,0.5)]'
                : 'bg-dark-bgTertiary text-text-muted border border-dark-borderLight hover:text-text-secondary'
            }
          `}
        >
          A
        </button>
        <button
          onClick={() => handlePFLToggle('B')}
          className={`
            px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-colors
            ${
              pflB
                ? 'bg-yellow-500 text-black shadow-[0_0_8px_rgba(234,179,8,0.5)]'
                : 'bg-dark-bgTertiary text-text-muted border border-dark-borderLight hover:text-text-secondary'
            }
          `}
        >
          B
        </button>
      </div>
    </div>
  );
};
