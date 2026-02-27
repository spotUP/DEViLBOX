/**
 * PatternOrderModal - Modal for editing pattern order/song position list
 */

import React, { useState } from 'react';
import { useTrackerStore } from '@stores';
import { notify } from '@stores/useNotificationStore';
import { Plus, Trash2, X } from 'lucide-react';
import { MusicLineTrackTableEditor } from '@components/tracker/MusicLineTrackTableEditor';

interface PatternOrderModalProps {
  onClose: () => void;
}

export const PatternOrderModal: React.FC<PatternOrderModalProps> = ({ onClose }) => {
  // Reactive: re-renders when a new song with/without per-channel tables is loaded
  const hasPerChannelTables = useTrackerStore((state) => !!state.channelTrackTables);

  const patternOrder = useTrackerStore((state) => state.patternOrder);
  const currentPositionIndex = useTrackerStore((state) => state.currentPositionIndex);
  const currentPatternIndex = useTrackerStore((state) => state.currentPatternIndex);
  const addToOrder = useTrackerStore((state) => state.addToOrder);
  const removeFromOrder = useTrackerStore((state) => state.removeFromOrder);
  const duplicatePosition = useTrackerStore((state) => state.duplicatePosition);
  const clearOrder = useTrackerStore((state) => state.clearOrder);
  const reorderPositions = useTrackerStore((state) => state.reorderPositions);
  const setCurrentPosition = useTrackerStore((state) => state.setCurrentPosition);

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
    notify.success('Position reordered', 2000);
  };

  // Handle drag end
  const handleDragEnd = () => {
    setDraggedIndex(null);
    document.querySelectorAll('.bg-accent-primary\\/20').forEach((el) => {
      el.classList.remove('bg-accent-primary/20');
    });
  };

  // Handle adding current pattern to order
  const handleAddCurrent = () => {
    addToOrder(currentPatternIndex);
    notify.success(`Added Pattern ${currentPatternIndex.toString(16).padStart(2, '0').toUpperCase()}`, 2000);
  };

  // Handle removing position
  const handleRemove = (index: number) => {
    if (patternOrder.length > 1) {
      removeFromOrder(index);
      notify.info('Position removed', 2000);
    } else {
      notify.warning('Cannot remove last position', 2000);
    }
  };

  // Handle duplicating position
  const handleDuplicate = (index: number) => {
    duplicatePosition(index);
    notify.success('Position duplicated', 2000);
  };

  // Handle clear all
  const handleClearAll = () => {
    if (confirm('Clear all positions? This will reset to just the first pattern.')) {
      clearOrder();
      notify.info('Pattern order cleared', 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4"
      onClick={onClose}
    >
      <div
        className="bg-dark-bgSecondary border-2 border-ft2-border rounded-lg shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-ft2-border flex items-center justify-between bg-ft2-header">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-ft2-text">
              {hasPerChannelTables ? 'Track Table' : 'Pattern Order'}
            </span>
            {hasPerChannelTables ? (
              <span className="text-xs text-accent-primary bg-accent-primary/10 px-1.5 py-0.5 rounded border border-accent-primary/30">
                per-channel
              </span>
            ) : (
              <span className="text-sm text-ft2-textDim">({patternOrder.length} positions)</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-dark-bgHover transition-colors text-ft2-textDim hover:text-ft2-text"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Controls — hidden for per-channel formats (read-only track tables) */}
        {!hasPerChannelTables && (
          <div className="px-4 py-3 border-b border-ft2-border flex items-center gap-2 bg-dark-bgTertiary">
            <button
              onClick={handleAddCurrent}
              className="px-3 py-2 text-sm bg-dark-bgActive hover:bg-dark-bgHover text-ft2-text border border-ft2-border rounded flex items-center gap-2 transition-colors"
              title="Add current pattern to order"
            >
              <Plus size={14} />
              Add Current Pattern
            </button>
            <button
              onClick={handleClearAll}
              className="px-3 py-2 text-sm bg-dark-bgActive hover:bg-dark-bgHover text-ft2-text border border-ft2-border rounded flex items-center gap-2 transition-colors"
              title="Clear all positions"
            >
              <Trash2 size={14} />
              Clear All
            </button>
            <div className="ml-auto text-xs text-ft2-textDim">
              Current Pattern: {currentPatternIndex.toString(16).padStart(2, '0').toUpperCase()}
            </div>
          </div>
        )}

        {/* Pattern Order Grid or MusicLine per-channel matrix */}
        <div className="flex-1 overflow-y-auto p-4 bg-ft2-bg">
          {hasPerChannelTables ? (
            <MusicLineTrackTableEditor
              onSeek={(pos) => {
                setCurrentPosition(pos);
                getTrackerReplayer().jumpToPosition(pos, 0);
              }}
            />
          ) : (
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-16 gap-2">
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
                    if (e.shiftKey) {
                      handleDuplicate(positionIndex);
                    } else if (e.ctrlKey || e.metaKey) {
                      handleRemove(positionIndex);
                    }
                  }}
                  className={`
                    relative px-3 py-2 rounded border cursor-pointer transition-all
                    ${
                      positionIndex === currentPositionIndex
                        ? 'bg-dark-bgActive border-accent-primary text-accent-primary font-bold'
                        : 'bg-dark-bgTertiary border-dark-border text-text-secondary hover:bg-dark-bgHover hover:border-dark-borderLight'
                    }
                    ${draggedIndex === positionIndex ? 'opacity-50' : ''}
                  `}
                  title={`Position ${positionIndex.toString(16).padStart(2, '0').toUpperCase()}: Pattern ${patternIndex.toString(16).padStart(2, '0').toUpperCase()}\nClick to select\nShift+Click to duplicate\nCtrl+Click to remove\nDrag to reorder`}
                >
                  <div className="text-xs text-center leading-none opacity-60">
                    {positionIndex.toString(16).padStart(2, '0').toUpperCase()}
                  </div>
                  <div className="text-lg text-center font-mono leading-none mt-1">
                    {patternIndex.toString(16).padStart(2, '0').toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Help text */}
        <div className="px-4 py-3 border-t border-ft2-border text-sm text-ft2-textDim bg-dark-bgTertiary">
          {hasPerChannelTables
            ? <span>Per-channel track table (read-only) — click a cell to seek to that position</span>
            : <><strong>Controls:</strong> Click: Select • Drag: Reorder • Shift+Click: Duplicate • Ctrl+Click: Remove</>
          }
        </div>
      </div>
    </div>
  );
};
