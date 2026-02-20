/**
 * DeckLoopControls - Loop controls for one DJ deck
 *
 * Loop ON/OFF toggle (cyan glow), loop size selector (1/2/4/8/16/32),
 * and slip mode toggle (amber). Compact horizontal layout with
 * LED-style active indicators.
 */

import React, { useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';

interface DeckLoopControlsProps {
  deckId: 'A' | 'B';
}

const LOOP_SIZES = [1, 2, 4, 8, 16, 32] as const;
type LoopSize = (typeof LOOP_SIZES)[number];

export const DeckLoopControls: React.FC<DeckLoopControlsProps> = ({ deckId }) => {
  const loopActive = useDJStore((s) => s.decks[deckId].loopActive);
  const lineLoopSize = useDJStore((s) => s.decks[deckId].lineLoopSize);
  const slipEnabled = useDJStore((s) => s.decks[deckId].slipEnabled);
  const setDeckLoop = useDJStore((s) => s.setDeckLoop);
  const setDeckLoopSize = useDJStore((s) => s.setDeckLoopSize);
  const setDeckSlip = useDJStore((s) => s.setDeckSlip);

  const handleLoopToggle = useCallback(() => {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);

    if (loopActive) {
      // Deactivate loop
      deck.clearLineLoop();
      setDeckLoop(deckId, 'off', false);
    } else {
      // Activate loop with current size
      deck.setLineLoop(lineLoopSize);
      setDeckLoop(deckId, 'line', true);
    }
  }, [deckId, loopActive, lineLoopSize, setDeckLoop]);

  const handleSizeChange = useCallback(
    (size: LoopSize) => {
      setDeckLoopSize(deckId, size);

      // If loop is already active, re-set with the new size
      if (loopActive) {
        const engine = getDJEngine();
        const deck = engine.getDeck(deckId);
        deck.setLineLoop(size);
      } else {
        // Activating via size click
        const engine = getDJEngine();
        const deck = engine.getDeck(deckId);
        deck.setLineLoop(size);
        setDeckLoop(deckId, 'line', true);
      }
    },
    [deckId, loopActive, setDeckLoopSize, setDeckLoop]
  );

  const handleSlipToggle = useCallback(() => {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);
    const newSlip = !slipEnabled;
    deck.setSlipEnabled(newSlip);
    setDeckSlip(deckId, newSlip);
  }, [deckId, slipEnabled, setDeckSlip]);

  return (
    <div className="flex items-center gap-2">
      {/* Loop ON/OFF toggle */}
      <button
        onClick={handleLoopToggle}
        className={`
          relative flex items-center justify-center font-mono text-xs font-bold
          rounded-sm transition-all duration-100 select-none
          shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]
          active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] active:translate-y-[0.5px]
          ${
            loopActive
              ? 'bg-cyan-600 text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),0_0_12px_rgba(6,182,212,0.5)]'
              : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-borderLight'
          }
        `}
        style={{ width: 40, height: 28 }}
        title={loopActive ? 'Disable loop' : 'Enable loop'}
      >
        {/* LED indicator dot */}
        <div
          className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
            loopActive ? 'bg-cyan-300 shadow-[0_0_4px_rgba(6,182,212,0.8)]' : 'bg-dark-border'
          }`}
        />
        LOOP
      </button>

      {/* Loop size selector */}
      <div className="flex items-center gap-px">
        {LOOP_SIZES.map((size) => {
          const isActive = lineLoopSize === size && loopActive;
          const isSelected = lineLoopSize === size;
          return (
            <button
              key={size}
              onClick={() => handleSizeChange(size)}
              className={`
                flex items-center justify-center font-mono font-bold
                transition-all duration-75 select-none
                ${
                  isActive
                    ? 'bg-cyan-700/80 text-cyan-100 shadow-[0_0_6px_rgba(6,182,212,0.4)]'
                    : isSelected
                      ? 'bg-dark-borderLight text-text-primary'
                      : 'bg-dark-bgTertiary text-text-muted hover:bg-dark-borderLight hover:text-text-secondary'
                }
                ${size === LOOP_SIZES[0] ? 'rounded-l-sm' : ''}
                ${size === LOOP_SIZES[LOOP_SIZES.length - 1] ? 'rounded-r-sm' : ''}
              `}
              style={{ width: 24, height: 24, fontSize: size >= 10 ? 8 : 10 }}
              title={`Loop ${size} rows`}
            >
              {size}
            </button>
          );
        })}
      </div>

      {/* Slip mode toggle */}
      <button
        onClick={handleSlipToggle}
        className={`
          relative flex items-center justify-center font-mono text-xs font-bold
          rounded-sm transition-all duration-100 select-none
          shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]
          active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] active:translate-y-[0.5px]
          ${
            slipEnabled
              ? 'bg-amber-600 text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),0_0_10px_rgba(245,158,11,0.4)]'
              : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-borderLight'
          }
        `}
        style={{ width: 38, height: 28 }}
        title={slipEnabled ? 'Disable slip mode' : 'Enable slip mode'}
      >
        {/* LED indicator dot */}
        <div
          className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
            slipEnabled ? 'bg-amber-300 shadow-[0_0_4px_rgba(245,158,11,0.8)]' : 'bg-dark-border'
          }`}
        />
        SLIP
      </button>
    </div>
  );
};
