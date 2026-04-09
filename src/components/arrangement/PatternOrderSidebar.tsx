/**
 * PatternOrderSidebar — Renoise-style vertical pattern order list.
 * Always visible on the left of the pattern editor. Click to navigate,
 * current position highlighted with playback indicator.
 * Data from useTrackerStore (single source of truth).
 */

import React, { useRef, useEffect } from 'react';
import { useTrackerStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { useShallow } from 'zustand/react/shallow';

export const PatternOrderSidebar: React.FC = () => {
  const patternOrder = useTrackerStore(s => s.patternOrder);
  const patterns = useTrackerStore(s => s.patterns);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const addToOrder = useTrackerStore(s => s.addToOrder);

  const { isPlaying } = useTransportStore(useShallow(s => ({
    isPlaying: s.isPlaying,
  })));

  const listRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to keep current position visible
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPositionIndex]);

  return (
    <div className="flex flex-col bg-ft2-bg border-r border-dark-border h-full" style={{ width: 56 }}>
      {/* Header */}
      <div className="text-[9px] font-mono text-ft2-textDim uppercase tracking-wider px-1.5 py-1 border-b border-dark-border bg-ft2-header text-center flex-shrink-0">
        SEQ
      </div>

      {/* Scrollable position list */}
      <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-hidden">
        {patternOrder.map((patIdx, posIdx) => {
          const isCurrent = posIdx === currentPositionIndex;
          return (
            <button
              key={posIdx}
              ref={isCurrent ? currentRef : undefined}
              onClick={() => setCurrentPosition(posIdx, true)}
              className={`w-full font-mono text-center border-b border-dark-border transition-colors relative
                ${isCurrent
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'text-ft2-textDim hover:bg-ft2-highlight hover:text-text-primary'
                }`}
              style={{ padding: '3px 4px' }}
              title={`Pos ${posIdx} → Pattern ${patIdx}${patterns[patIdx]?.name ? ` (${patterns[patIdx].name})` : ''}`}
            >
              {/* Playback indicator bar */}
              {isCurrent && isPlaying && (
                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent-primary animate-pulse" />
              )}
              {/* Position index */}
              <div className={`text-[8px] leading-none ${isCurrent ? 'text-accent-primary/60' : 'text-ft2-textDim'}`}>
                {String(posIdx).padStart(2, '0')}
              </div>
              {/* Pattern index */}
              <div className={`text-[11px] leading-tight font-bold ${isCurrent ? 'text-accent-primary' : ''}`}>
                {String(patIdx).padStart(2, '0')}
              </div>
            </button>
          );
        })}
      </div>

      {/* Add button */}
      <button
        onClick={() => {
          const currentPat = patternOrder[currentPositionIndex] ?? 0;
          addToOrder(currentPat);
        }}
        className="flex-shrink-0 w-full text-[10px] font-mono text-ft2-textDim hover:text-accent-primary py-1.5 hover:bg-ft2-highlight transition-colors border-t border-dark-border"
        title="Add current pattern to order"
      >
        +
      </button>
    </div>
  );
};
