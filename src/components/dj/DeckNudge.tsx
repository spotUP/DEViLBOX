/**
 * DeckNudge - Nudge buttons for beat matching
 *
 * Press and hold: the deck stays bent while the button is down, like a CDJ
 * pitch-bend button. Soft: +/-2 %; hard (Shift held on press): +/-5 %.
 */

import React, { useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { holdNudgeDeck, releaseNudgeDeck } from '@/engine/dj/DJActions';

interface DeckNudgeProps {
  deckId: 'A' | 'B' | 'C';
}

const SOFT_OFFSET = 2;
const HARD_OFFSET = 5;

export const DeckNudge: React.FC<DeckNudgeProps> = ({ deckId }) => {
  const handlePress = useCallback(
    (direction: -1 | 1, e: React.PointerEvent<HTMLButtonElement>) => {
      // Capture so the release arrives even when the pointer leaves the button.
      e.currentTarget.setPointerCapture(e.pointerId);
      holdNudgeDeck(deckId, direction * (e.shiftKey ? HARD_OFFSET : SOFT_OFFSET));
    },
    [deckId]
  );

  const handleRelease = useCallback(() => releaseNudgeDeck(deckId), [deckId]);

  return (
    <div className="flex flex-1 items-center gap-1">
      {/* Slower (nudge left / minus) */}
      <button
        onPointerDown={(e) => handlePress(-1, e)}
        onPointerUp={handleRelease}
        onPointerCancel={handleRelease}
        onLostPointerCapture={handleRelease}
        className="
          flex flex-1 items-center justify-center min-w-10 h-10 rounded-lg
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
        onPointerDown={(e) => handlePress(1, e)}
        onPointerUp={handleRelease}
        onPointerCancel={handleRelease}
        onLostPointerCapture={handleRelease}
        className="
          flex flex-1 items-center justify-center min-w-10 h-10 rounded-lg
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
