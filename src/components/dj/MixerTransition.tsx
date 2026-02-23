/**
 * MixerTransition - Beat-matched transition controls
 *
 * Located in the mixer between the crossfader and master section.
 * Provides one-button automated transitions between decks A↔B:
 *   - TRANS A→B / B→A (8-bar crossfade with filter sweep)
 *   - Quick cut (instant crossfader snap on next downbeat)
 *   - Cancel automation
 */

import React, { useCallback, useRef, useState } from 'react';
import { ArrowRightLeft, X, Zap } from 'lucide-react';
import {
  beatMatchedTransition,
  cancelAllAutomation,
  getQuantizeMode,
} from '@/engine/dj/DJQuantizedFX';
import { onNextDownbeat } from '@/engine/dj/DJAutoSync';
import { getDJEngine } from '@/engine/dj/DJEngine';
import type { DeckId } from '@/engine/dj/DeckEngine';

export const MixerTransition: React.FC = () => {
  const [automating, setAutomating] = useState(false);
  const [direction, setDirection] = useState<'A→B' | 'B→A' | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const cancelCurrent = useCallback(() => {
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    cancelAllAutomation();
    setAutomating(false);
    setDirection(null);
  }, []);

  const handleTransition = useCallback((from: DeckId, to: DeckId) => {
    cancelCurrent();
    setAutomating(true);
    setDirection(from === 'A' ? 'A→B' : 'B→A');

    cancelRef.current = beatMatchedTransition(from, to, 8, true);

    // Auto-clear state after transition completes (~8 bars)
    // This is approximate; the actual sweep has its own completion callback
    // We'll just clear after a reasonable timeout
    const timeout = setTimeout(() => {
      setAutomating(false);
      setDirection(null);
      cancelRef.current = null;
    }, 30000); // 30s max

    const originalCancel = cancelRef.current;
    cancelRef.current = () => {
      clearTimeout(timeout);
      originalCancel();
    };
  }, [cancelCurrent]);

  const handleQuickCut = useCallback((to: DeckId) => {
    cancelCurrent();
    const target = to === 'A' ? 0 : 1;

    if (getQuantizeMode() !== 'off') {
      // Snap to next downbeat
      const from: DeckId = to === 'A' ? 'B' : 'A';
      setAutomating(true);
      setDirection(to === 'A' ? 'B→A' : 'A→B');
      cancelRef.current = onNextDownbeat(from, () => {
        try {
          getDJEngine().setCrossfader(target);
        } catch { /* engine not ready */ }
        setAutomating(false);
        setDirection(null);
        cancelRef.current = null;
      });
    } else {
      try {
        getDJEngine().setCrossfader(target);
      } catch { /* engine not ready */ }
    }
  }, [cancelCurrent]);

  return (
    <div className="flex items-center justify-center gap-1.5 w-full">
      {/* Trans A→B */}
      <button
        onClick={() => handleTransition('A', 'B')}
        disabled={automating && direction !== 'A→B'}
        className={`
          flex items-center gap-1 px-2 h-7 rounded text-[9px] font-bold
          transition-all duration-100
          ${
            automating && direction === 'A→B'
              ? 'bg-cyan-600/40 text-cyan-200 border border-cyan-500/50 animate-pulse'
              : 'bg-dark-bgTertiary text-text-muted border border-dark-border hover:bg-dark-bgHover hover:text-text-secondary'
          }
          disabled:opacity-30
        `}
        title="Auto-transition A→B (8 bars, with filter sweep)"
      >
        <ArrowRightLeft size={10} />
        <span>A→B</span>
      </button>

      {/* Quick cuts */}
      <button
        onClick={() => handleQuickCut('A')}
        className="flex items-center gap-0.5 px-1.5 h-7 rounded text-[9px] font-bold
          bg-dark-bgTertiary text-text-muted border border-dark-border
          hover:bg-amber-600/20 hover:text-amber-300 transition-all duration-100"
        title="Quick cut to A (on downbeat if quantized)"
      >
        <Zap size={8} />A
      </button>

      {/* Cancel */}
      {automating ? (
        <button
          onClick={cancelCurrent}
          className="flex items-center gap-0.5 px-1.5 h-7 rounded text-[9px] font-bold
            bg-red-600/30 text-red-300 border border-red-500/40
            hover:bg-red-600/50 transition-all duration-100"
          title="Cancel automation"
        >
          <X size={10} />
        </button>
      ) : (
        <div className="w-7" /> /* Spacer when no cancel button */
      )}

      {/* Quick cut B */}
      <button
        onClick={() => handleQuickCut('B')}
        className="flex items-center gap-0.5 px-1.5 h-7 rounded text-[9px] font-bold
          bg-dark-bgTertiary text-text-muted border border-dark-border
          hover:bg-amber-600/20 hover:text-amber-300 transition-all duration-100"
        title="Quick cut to B (on downbeat if quantized)"
      >
        B<Zap size={8} />
      </button>

      {/* Trans B→A */}
      <button
        onClick={() => handleTransition('B', 'A')}
        disabled={automating && direction !== 'B→A'}
        className={`
          flex items-center gap-1 px-2 h-7 rounded text-[9px] font-bold
          transition-all duration-100
          ${
            automating && direction === 'B→A'
              ? 'bg-cyan-600/40 text-cyan-200 border border-cyan-500/50 animate-pulse'
              : 'bg-dark-bgTertiary text-text-muted border border-dark-border hover:bg-dark-bgHover hover:text-text-secondary'
          }
          disabled:opacity-30
        `}
        title="Auto-transition B→A (8 bars, with filter sweep)"
      >
        <span>B→A</span>
        <ArrowRightLeft size={10} />
      </button>
    </div>
  );
};
