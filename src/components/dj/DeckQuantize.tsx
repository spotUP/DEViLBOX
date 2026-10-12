/**
 * DeckQuantize - the quantize mode button (Off / Beat / Bar), shown in the Loop & Cue tab.
 * Quantize is one global mode (DJQuantizedFX): FX, loops and cues snap to the beat or bar.
 */

import React, { useCallback, useState } from 'react';
import { getQuantizeMode, setQuantizeMode, type QuantizeMode } from '@/engine/dj/DJQuantizedFX';

const MODE_LABEL: Record<QuantizeMode, string> = { off: 'Off', beat: 'Beat', bar: 'Bar' };
const MODE_ORDER: QuantizeMode[] = ['off', 'beat', 'bar'];

export const DeckQuantize: React.FC = () => {
  const [qMode, setQMode] = useState<QuantizeMode>(getQuantizeMode);

  const handleCycle = useCallback(() => {
    const next = MODE_ORDER[(MODE_ORDER.indexOf(qMode) + 1) % MODE_ORDER.length];
    setQuantizeMode(next);
    setQMode(next);
  }, [qMode]);

  return (
    <button
      onClick={handleCycle}
      className={`
        flex items-center justify-center h-10 px-2.5 rounded-lg
        border text-[11px] font-bold tracking-wide
        active:translate-y-[1px]
        transition-all duration-100
        ${
          qMode === 'off'
            ? 'bg-dark-bgTertiary text-text-muted border-dark-border hover:bg-dark-bgHover'
            : qMode === 'beat'
              ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/60 shadow-glow-sm'
              : 'bg-dark-bgTertiary/40 text-text-secondary border-dark-borderLight/60 shadow-glow-sm'
        }
      `}
      title={`Quantize: ${MODE_LABEL[qMode]}\nOff = free play\nBeat = snap to beat\nBar = snap to bar\n(click to cycle)`}
    >
      Quantize: {MODE_LABEL[qMode]}
    </button>
  );
};
