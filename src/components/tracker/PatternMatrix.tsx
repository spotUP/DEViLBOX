/**
 * PatternMatrix - Renoise-style pattern matrix grid
 * Shows a compact grid of pattern slots in the song arrangement
 * Rows = positions in song order, columns = available patterns
 */

import React, { useCallback } from 'react';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { X, Plus } from 'lucide-react';

interface PatternMatrixProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PatternMatrix: React.FC<PatternMatrixProps> = ({ isOpen, onClose }) => {
  const {
    patterns,
    patternOrder,
    currentPositionIndex,
    setCurrentPosition,
    addToOrder,
    removeFromOrder,
  } = useTrackerStore(
    useShallow((state) => ({
      patterns: state.patterns,
      patternOrder: state.patternOrder,
      currentPositionIndex: state.currentPositionIndex,
      setCurrentPosition: state.setCurrentPosition,
      addToOrder: state.addToOrder,
      removeFromOrder: state.removeFromOrder,
    }))
  );

  const handleCellClick = useCallback((positionIndex: number) => {
    setCurrentPosition(positionIndex);
  }, [setCurrentPosition]);

  const handleAddPosition = useCallback(() => {
    addToOrder(0); // Add pattern 0 at end
  }, [addToOrder]);

  const handleRemovePosition = useCallback((posIndex: number) => {
    if (patternOrder.length > 1) {
      removeFromOrder(posIndex);
    }
  }, [removeFromOrder, patternOrder.length]);

  const handleChangePattern = useCallback((posIndex: number, patternIdx: number) => {
    // Atomically replace pattern at this position via direct store mutation
    useTrackerStore.setState((state) => {
      const newOrder = [...state.patternOrder];
      newOrder[posIndex] = patternIdx;
      return { patternOrder: newOrder };
    });
  }, []);

  if (!isOpen) return null;

  return (
    <div className="absolute left-0 top-0 w-56 h-full bg-neutral-900 border-r border-neutral-700 flex flex-col z-30 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700">
        <span className="text-xs font-semibold text-neutral-200">Pattern Matrix</span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Matrix grid */}
      <div className="flex-1 overflow-y-auto p-2">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-[9px] text-neutral-500 font-normal px-1 py-0.5 text-left">Pos</th>
              <th className="text-[9px] text-neutral-500 font-normal px-1 py-0.5 text-left">Pattern</th>
              <th className="text-[9px] text-neutral-500 font-normal px-1 py-0.5 text-right">Len</th>
              <th className="w-6"></th>
            </tr>
          </thead>
          <tbody>
            {patternOrder.map((patIdx, posIdx) => {
              const isCurrent = posIdx === currentPositionIndex;
              const pat = patterns[patIdx];
              return (
                <tr
                  key={posIdx}
                  className={`cursor-pointer transition-colors ${
                    isCurrent
                      ? 'bg-blue-900/40 text-blue-300'
                      : 'hover:bg-neutral-800 text-neutral-300'
                  }`}
                  onClick={() => handleCellClick(posIdx)}
                >
                  <td className="text-[10px] font-mono px-1 py-0.5 text-neutral-500">
                    {posIdx.toString(16).toUpperCase().padStart(2, '0')}
                  </td>
                  <td className="px-1 py-0.5">
                    <select
                      value={patIdx}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleChangePattern(posIdx, parseInt(e.target.value));
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className={`w-full bg-transparent text-[10px] font-mono cursor-pointer focus:outline-none ${
                        isCurrent ? 'text-blue-300' : 'text-neutral-300'
                      }`}
                    >
                      {patterns.map((_, pi) => (
                        <option key={pi} value={pi} className="bg-neutral-900 text-neutral-200">
                          {pi.toString(16).toUpperCase().padStart(2, '0')}
                          {patterns[pi]?.name ? ` ${patterns[pi].name}` : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-[10px] font-mono px-1 py-0.5 text-right text-neutral-500">
                    {pat?.length || '?'}
                  </td>
                  <td className="px-0.5 py-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemovePosition(posIdx);
                      }}
                      className="p-0.5 rounded hover:bg-red-900/50 text-neutral-600 hover:text-red-400 transition-colors"
                      title="Remove position"
                      disabled={patternOrder.length <= 1}
                    >
                      <X size={10} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-neutral-700 flex items-center justify-between">
        <span className="text-[9px] text-neutral-500">
          {patternOrder.length} positions | {patterns.length} patterns
        </span>
        <button
          onClick={handleAddPosition}
          className="flex items-center gap-1 px-2 py-1 text-[10px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded transition-colors"
        >
          <Plus size={10} />
          Add
        </button>
      </div>
    </div>
  );
};
