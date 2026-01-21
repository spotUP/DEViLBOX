/**
 * PatternOrderList - FT2-Style Pattern Order/Song Position List
 * Allows users to arrange patterns in sequence to create complete songs
 */

import React, { useState } from 'react';
import { useTrackerStore } from '@stores';
import { useToastStore } from '@stores/useToastStore';
import { Plus, Trash2, List, ChevronDown, ChevronUp } from 'lucide-react';

export const PatternOrderList: React.FC = React.memo(() => {
  // Optimize: Use selectors to prevent unnecessary re-renders
  const patternOrder = useTrackerStore((state) => state.patternOrder);
  const currentPositionIndex = useTrackerStore((state) => state.currentPositionIndex);
  const currentPatternIndex = useTrackerStore((state) => state.currentPatternIndex);
  const addToOrder = useTrackerStore((state) => state.addToOrder);
  const removeFromOrder = useTrackerStore((state) => state.removeFromOrder);
  const duplicatePosition = useTrackerStore((state) => state.duplicatePosition);
  const clearOrder = useTrackerStore((state) => state.clearOrder);
  const reorderPositions = useTrackerStore((state) => state.reorderPositions);
  const setCurrentPosition = useTrackerStore((state) => state.setCurrentPosition);

  const { showToast } = useToastStore();
  const [isExpanded, setIsExpanded] = useState(true);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    // Visual feedback by highlighting drop target
    e.currentTarget.classList.add('bg-accent-primary/20');
  };

  // Handle drag leave
  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-accent-primary/20');
  };

  // Handle drop
  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-accent-primary/20');

    if (draggedIndex === null || draggedIndex === targetIndex) return;

    reorderPositions(draggedIndex, targetIndex);
    setDraggedIndex(null);
    showToast('Position reordered', 'success', 2000);
  };

  // Handle drag end
  const handleDragEnd = () => {
    setDraggedIndex(null);
    // Clean up any remaining highlight classes
    document.querySelectorAll('.bg-accent-primary\\/20').forEach((el) => {
      el.classList.remove('bg-accent-primary/20');
    });
  };

  // Handle adding current pattern to order
  const handleAddCurrent = () => {
    addToOrder(currentPatternIndex);
    showToast(`Added Pattern ${currentPatternIndex.toString(16).padStart(2, '0').toUpperCase()}`, 'success', 2000);
  };

  // Handle removing position
  const handleRemove = (index: number) => {
    if (patternOrder.length > 1) {
      removeFromOrder(index);
      showToast('Position removed', 'info', 2000);
    } else {
      showToast('Cannot remove last position', 'warning', 2000);
    }
  };

  // Handle duplicating position
  const handleDuplicate = (index: number) => {
    duplicatePosition(index);
    showToast('Position duplicated', 'success', 2000);
  };

  // Handle clear all
  const handleClearAll = () => {
    if (confirm('Clear all positions? This will reset to just the first pattern.')) {
      clearOrder();
      showToast('Pattern order cleared', 'info', 2000);
    }
  };

  if (!isExpanded) {
    return (
      <div className="bg-ft2-header border-b border-ft2-border">
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full px-3 py-2 flex items-center justify-between text-sm font-medium text-ft2-textDim hover:text-ft2-text hover:bg-dark-bgTertiary transition-colors"
        >
          <span className="flex items-center gap-2">
            <List size={14} />
            Pattern Order ({patternOrder.length} positions)
          </span>
          <ChevronDown size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-ft2-header border-b border-ft2-border">
      {/* Header */}
      <div className="px-3 py-2 border-b border-ft2-border flex items-center justify-between overflow-x-auto">
        <div className="flex items-center gap-2 flex-shrink-0">
          <List size={14} className="text-ft2-highlight" />
          <span className="text-sm font-medium text-ft2-text whitespace-nowrap">Pattern Order</span>
          <span className="text-xs text-ft2-textDim whitespace-nowrap">({patternOrder.length})</span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleAddCurrent}
            className="px-2 py-1 text-xs bg-dark-bgActive hover:bg-dark-bgHover text-ft2-text border border-ft2-border rounded flex items-center gap-1 transition-colors whitespace-nowrap"
            title="Add current pattern to order"
          >
            <Plus size={12} />
            Add
          </button>
          <button
            onClick={handleClearAll}
            className="px-2 py-1 text-xs bg-dark-bgActive hover:bg-dark-bgHover text-ft2-text border border-ft2-border rounded flex items-center gap-1 transition-colors whitespace-nowrap"
            title="Clear all positions"
          >
            <Trash2 size={12} />
            Clear
          </button>
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1 text-ft2-textDim hover:text-ft2-text transition-colors flex-shrink-0"
            title="Collapse pattern order list"
          >
            <ChevronUp size={14} />
          </button>
        </div>
      </div>

      {/* Pattern Order List - Scrollable with responsive grid */}
      <div className="max-h-32 overflow-y-auto overflow-x-auto scrollbar-ft2">
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 xl:grid-cols-16 gap-1 p-2 min-w-min bg-ft2-bg">
          {patternOrder.map((patternIndex, positionIndex) => (
            <div
              key={`pos-${positionIndex}`}
              draggable
              onDragStart={(e) => handleDragStart(e, positionIndex)}
              onDragOver={(e) => handleDragOver(e, positionIndex)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, positionIndex)}
              onDragEnd={handleDragEnd}
              onClick={() => setCurrentPosition(positionIndex)}
              onContextMenu={(e) => {
                e.preventDefault();
                // Context menu actions
                if (e.shiftKey) {
                  handleDuplicate(positionIndex);
                } else if (e.ctrlKey || e.metaKey) {
                  handleRemove(positionIndex);
                }
              }}
              className={`
                relative px-2 py-1.5 rounded border cursor-pointer transition-all
                ${
                  positionIndex === currentPositionIndex
                    ? 'bg-dark-bgActive border-accent-primary text-accent-primary font-bold'
                    : 'bg-dark-bgTertiary border-dark-border text-text-secondary hover:bg-dark-bgHover hover:border-dark-borderLight'
                }
                ${draggedIndex === positionIndex ? 'opacity-50' : ''}
              `}
              title={`Position ${positionIndex.toString(16).padStart(2, '0').toUpperCase()}: Pattern ${patternIndex.toString(16).padStart(2, '0').toUpperCase()}\nClick to select\nShift+Click to duplicate\nCtrl+Click to remove\nDrag to reorder`}
            >
              <div className="text-[10px] text-center leading-none">
                {positionIndex.toString(16).padStart(2, '0').toUpperCase()}
              </div>
              <div className="text-xs text-center font-mono leading-none mt-0.5">
                {patternIndex.toString(16).padStart(2, '0').toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Help text */}
      <div className="px-3 py-1.5 border-t border-ft2-border text-xs text-ft2-textDim overflow-x-auto whitespace-nowrap">
        Click: Select • Drag: Reorder • Shift+Click: Duplicate • Ctrl+Click: Remove
      </div>
    </div>
  );
});
