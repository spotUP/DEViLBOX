/**
 * DeckNudge - Nudge buttons for temporary BPM bumps during beat matching
 *
 * Soft nudge: +/-2 BPM for 8 ticks
 * Hard nudge (Shift+click): +/-5 BPM for 16 ticks
 */

import React, { useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface DeckNudgeProps {
  deckId: 'A' | 'B' | 'C';
}

const SOFT_OFFSET = 2;
const SOFT_TICKS = 8;
const HARD_OFFSET = 5;
const HARD_TICKS = 16;

export const DeckNudge: React.FC<DeckNudgeProps> = ({ deckId }) => {
  const handleNudge = useCallback(
    (direction: -1 | 1, e: React.MouseEvent) => {
      const isHard = e.shiftKey;
      const offset = direction * (isHard ? HARD_OFFSET : SOFT_OFFSET);
      const ticks = isHard ? HARD_TICKS : SOFT_TICKS;

      const engine = getDJEngine();
      engine.getDeck(deckId).nudge(offset, ticks);
    },
    [deckId]
  );

  return (
    <div className="flex items-center gap-1">
      {/* Slower (nudge left / minus) */}
      <button
        onClick={(e) => handleNudge(-1, e)}
        className="
          flex items-center justify-center w-10 h-10 rounded-lg
          bg-dark-bgTertiary text-text-secondary border border-dark-border
          hover:bg-dark-bgHover hover:text-text-primary
          active:translate-y-[1px]
          transition-all duration-100
        "
        title="Nudge slower (Shift = hard nudge)"
      >
        <ChevronLeft size={18} />
      </button>

      {/* Faster (nudge right / plus) */}
      <button
        onClick={(e) => handleNudge(1, e)}
        className="
          flex items-center justify-center w-10 h-10 rounded-lg
          bg-dark-bgTertiary text-text-secondary border border-dark-border
          hover:bg-dark-bgHover hover:text-text-primary
          active:translate-y-[1px]
          transition-all duration-100
        "
        title="Nudge faster (Shift = hard nudge)"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
};
