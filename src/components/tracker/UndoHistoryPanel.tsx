/**
 * UndoHistoryPanel - Shows undo/redo history with ability to step through
 */

import React from 'react';
import { History, Undo2, Redo2 } from 'lucide-react';
import {
  useHistoryStore,
  getActionTypeName,
  getActionTypeColor,
} from '@stores/useHistoryStore';

interface UndoHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const ACTION_TYPE_BG_COLORS: Record<string, string> = {
  'text-blue-400': 'bg-blue-400',
  'text-green-400': 'bg-green-400',
  'text-yellow-400': 'bg-yellow-400',
  'text-red-400': 'bg-red-400',
  'text-purple-400': 'bg-purple-400',
  'text-orange-400': 'bg-orange-400',
  'text-cyan-400': 'bg-cyan-400',
  'text-neutral-400': 'bg-neutral-400',
};

const getBgColor = (textColor: string) => ACTION_TYPE_BG_COLORS[textColor] || 'bg-neutral-400';

export const UndoHistoryPanel: React.FC<UndoHistoryPanelProps> = ({ isOpen, onClose }) => {
  const { undoStack, redoStack, undo, redo } = useHistoryStore();

  if (!isOpen) return null;

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="absolute right-0 top-0 w-64 h-full bg-neutral-900 border-l border-neutral-700 flex flex-col z-30 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700">
        <div className="flex items-center gap-2">
          <History size={14} className="text-neutral-400" />
          <span className="text-xs font-semibold text-neutral-200">History</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className="p-1 rounded hover:bg-neutral-800 disabled:opacity-30 transition-colors"
            title="Undo"
            aria-label="Undo"
          >
            <Undo2 size={12} className="text-neutral-400" />
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            className="p-1 rounded hover:bg-neutral-800 disabled:opacity-30 transition-colors"
            title="Redo"
            aria-label="Redo"
          >
            <Redo2 size={12} className="text-neutral-400" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors text-xs"
            aria-label="Close history panel"
          >
            x
          </button>
        </div>
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto">
        {/* Redo stack (future) - shown in reverse, dimmed */}
        {redoStack.length > 0 && (
          <div className="opacity-40">
            <div className="px-3 py-1 text-[9px] text-neutral-500 uppercase tracking-wider">
              Redo ({redoStack.length})
            </div>
            {[...redoStack].reverse().map((action, i) => (
              <div
                key={`redo-${action.id}-${i}`}
                className="flex items-center gap-2 px-3 py-1 hover:bg-neutral-800/50 cursor-pointer"
                onClick={() => redo()}
                title="Redo one step"
              >
                <div className={`w-1.5 h-1.5 rounded-full ${getBgColor(getActionTypeColor(action.type))}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-400 truncate">
                    {getActionTypeName(action.type)}
                  </div>
                </div>
                <span className="text-[9px] text-neutral-600">{formatTime(action.timestamp)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Current position marker */}
        <div className="px-3 py-1 bg-blue-900/30 border-y border-blue-800/50">
          <span className="text-[10px] text-blue-400 font-medium">Current State</span>
        </div>

        {/* Undo stack (past) */}
        {undoStack.length > 0 ? (
          <div>
            <div className="px-3 py-1 text-[9px] text-neutral-500 uppercase tracking-wider">
              Undo ({undoStack.length})
            </div>
            {[...undoStack].reverse().map((action, i) => (
              <div
                key={`undo-${action.id}-${i}`}
                className="flex items-center gap-2 px-3 py-1 hover:bg-neutral-800/50 cursor-pointer"
                onClick={() => undo()}
                title="Undo one step"
              >
                <div className={`w-1.5 h-1.5 rounded-full ${getBgColor(getActionTypeColor(action.type))}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-300 truncate">
                    {getActionTypeName(action.type)}
                  </div>
                  {action.description && (
                    <div className="text-[9px] text-neutral-500 truncate">{action.description}</div>
                  )}
                </div>
                <span className="text-[9px] text-neutral-600">{formatTime(action.timestamp)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-neutral-600 text-xs py-8">No history yet</div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-neutral-700 text-[9px] text-neutral-600 text-center">
        Ctrl+Z undo | Ctrl+Y redo
      </div>
    </div>
  );
};
