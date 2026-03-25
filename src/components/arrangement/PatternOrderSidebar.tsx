/**
 * PatternOrderSidebar — DOM version of the vertical pattern order list.
 * Sits alongside the arrangement timeline. Click to navigate, drag to reorder.
 * Data from useTrackerStore (single source of truth).
 */

import React from 'react';
import { useTrackerStore } from '@stores';

interface PatternOrderSidebarProps {
  height?: number;
}

export const PatternOrderSidebar: React.FC<PatternOrderSidebarProps> = ({ height }) => {
  const patternOrder = useTrackerStore(s => s.patternOrder);
  const patterns = useTrackerStore(s => s.patterns);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const setCurrentPattern = useTrackerStore(s => s.setCurrentPattern);
  const addToOrder = useTrackerStore(s => s.addToOrder);

  return (
    <div
      className="flex flex-col bg-dark-bgSecondary border-r border-dark-border overflow-y-auto scrollbar-modern"
      style={{ width: 56, height: height ?? '100%' }}
    >
      {/* Header */}
      <div className="text-[9px] font-mono text-text-muted uppercase tracking-wider px-2 py-1 border-b border-dark-border bg-dark-bgTertiary">
        Order
      </div>

      {/* Position entries */}
      {patternOrder.map((patIdx, posIdx) => {
        const isCurrent = posIdx === currentPositionIndex;
        const pattern = patterns[patIdx];
        return (
          <button
            key={posIdx}
            onClick={() => {
              setCurrentPosition(posIdx, true);
              setCurrentPattern(patIdx, true);
            }}
            className={`w-full text-[10px] font-mono px-1 py-0.5 text-center border-b border-dark-border transition-colors
              ${isCurrent
                ? 'bg-accent-primary/20 text-accent-primary font-bold'
                : 'text-text-secondary hover:bg-dark-bgHover'
              }`}
            title={pattern?.name ?? `Pattern ${patIdx}`}
          >
            <span className="text-text-muted text-[8px]">{String(posIdx).padStart(2, '0')}</span>
            {' '}
            <span>{String(patIdx).padStart(2, '0')}</span>
          </button>
        );
      })}

      {/* Add button */}
      <button
        onClick={() => {
          const currentPat = patternOrder[currentPositionIndex] ?? 0;
          addToOrder(currentPat);
        }}
        className="w-full text-[10px] font-mono text-text-muted hover:text-text-primary py-1 hover:bg-dark-bgHover transition-colors"
        title="Add current pattern to order"
      >
        +
      </button>
    </div>
  );
};
