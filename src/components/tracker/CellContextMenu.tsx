/**
 * CellContextMenu - Right-click menu for pattern editor cells
 */

import React, { useMemo, useCallback } from 'react';
import {
  Scissors,
  Copy,
  ClipboardPaste,
  Trash2,
  ArrowDown,
  ArrowUp,
  TrendingUp,
  Wand2,
  Columns,
  LayoutGrid,
  ArrowUpCircle,
  ArrowDownCircle,
} from 'lucide-react';
import { ContextMenu, type MenuItemType } from '@components/common/ContextMenu';
import { useTrackerStore } from '@stores/useTrackerStore';

interface CellContextMenuProps {
  position: { x: number; y: number } | null;
  onClose: () => void;
  rowIndex: number;
  channelIndex: number;
  onInterpolate?: () => void;
  onHumanize?: () => void;
}

export const CellContextMenu: React.FC<CellContextMenuProps> = ({
  position,
  onClose,
  rowIndex,
  channelIndex,
  onInterpolate,
  onHumanize,
}) => {
  const {
    patterns,
    currentPatternIndex,
    setCell,
    cursor,
    selection,
    copySelection,
    cutSelection,
    paste,
    transposeSelection,
    selectColumn,
    selectChannel,
    insertRow: insertRowAction,
    deleteRow: deleteRowAction,
  } = useTrackerStore();

  const pattern = patterns[currentPatternIndex];

  const isInsideSelection = useMemo(() => {
    if (!selection) return false;
    const minRow = Math.min(selection.startRow, selection.endRow);
    const maxRow = Math.max(selection.startRow, selection.endRow);
    const minCh = Math.min(selection.startChannel, selection.endChannel);
    const maxCh = Math.max(selection.startChannel, selection.endChannel);
    return rowIndex >= minRow && rowIndex <= maxRow && channelIndex >= minCh && channelIndex <= maxCh;
  }, [selection, rowIndex, channelIndex]);

  // Copy cell or selection
  const handleCopy = useCallback(() => {
    if (isInsideSelection) {
      copySelection();
    } else {
      if (!pattern) return;
      const cell = pattern.channels[channelIndex].rows[rowIndex];
      localStorage.setItem('devilbox-cell-clipboard', JSON.stringify(cell));
    }
    onClose();
  }, [isInsideSelection, copySelection, pattern, channelIndex, rowIndex, onClose]);

  // Cut cell or selection
  const handleCut = useCallback(() => {
    if (isInsideSelection) {
      cutSelection();
    } else {
      handleCopy();
      setCell(channelIndex, rowIndex, {
        note: null,
        instrument: null,
        volume: null,
        effect: null,
      });
    }
    onClose();
  }, [isInsideSelection, cutSelection, handleCopy, setCell, channelIndex, rowIndex, onClose]);

  // Paste cell or selection
  const handlePaste = useCallback(() => {
    if (isInsideSelection || selection) {
      paste();
    } else {
      const clipboardData = localStorage.getItem('devilbox-cell-clipboard');
      if (clipboardData) {
        try {
          const cell = JSON.parse(clipboardData);
          setCell(channelIndex, rowIndex, cell);
        } catch (e) {
          console.error('Failed to paste cell:', e);
        }
      }
    }
    onClose();
  }, [isInsideSelection, selection, paste, setCell, channelIndex, rowIndex, onClose]);

  // Clear cell or selection
  const handleClear = useCallback(() => {
    if (isInsideSelection) {
      cutSelection(); // cut is equivalent to clear + copy to buffer
    } else {
      setCell(channelIndex, rowIndex, {
        note: null,
        instrument: null,
        volume: null,
        effect: null,
      });
    }
    onClose();
  }, [isInsideSelection, cutSelection, setCell, channelIndex, rowIndex, onClose]);

  // Insert row (shift down)
  const handleInsertRow = useCallback(() => {
    insertRowAction(channelIndex, rowIndex);
    onClose();
  }, [rowIndex, channelIndex, insertRowAction, onClose]);

  // Delete row (shift up)
  const handleDeleteRow = useCallback(() => {
    deleteRowAction(channelIndex, rowIndex);
    onClose();
  }, [rowIndex, channelIndex, deleteRowAction, onClose]);

  // Select entire column
  const handleSelectColumn = useCallback(() => {
    selectColumn(channelIndex, cursor.columnType);
    onClose();
  }, [channelIndex, cursor.columnType, selectColumn, onClose]);

  // Select entire channel
  const handleSelectChannel = useCallback(() => {
    selectChannel(channelIndex);
    onClose();
  }, [channelIndex, selectChannel, onClose]);

  const menuItems = useMemo((): MenuItemType[] => [
    // Cut/Copy/Paste
    {
      id: 'cut',
      label: 'Cut',
      icon: <Scissors size={14} />,
      shortcut: 'Ctrl+X',
      onClick: handleCut,
    },
    {
      id: 'copy',
      label: 'Copy',
      icon: <Copy size={14} />,
      shortcut: 'Ctrl+C',
      onClick: handleCopy,
    },
    {
      id: 'paste',
      label: 'Paste',
      icon: <ClipboardPaste size={14} />,
      shortcut: 'Ctrl+V',
      onClick: handlePaste,
    },
    {
      id: 'clear',
      label: 'Clear',
      icon: <Trash2 size={14} />,
      shortcut: 'Del',
      onClick: handleClear,
    },
    { type: 'divider' },
    // Insert/Delete row
    {
      id: 'insert-row',
      label: 'Insert Row',
      icon: <ArrowDown size={14} />,
      shortcut: 'Ins',
      onClick: handleInsertRow,
    },
    {
      id: 'delete-row',
      label: 'Delete Row',
      icon: <ArrowUp size={14} />,
      shortcut: 'Backspace',
      onClick: handleDeleteRow,
    },
    { type: 'divider' },
    // Transpose
    {
      id: 'transpose-up',
      label: 'Transpose Octave Up',
      icon: <ArrowUpCircle size={14} />,
      shortcut: 'Ctrl+Shift+Up',
      onClick: () => {
        transposeSelection(12);
        onClose();
      },
    },
    {
      id: 'transpose-down',
      label: 'Transpose Octave Down',
      icon: <ArrowDownCircle size={14} />,
      shortcut: 'Ctrl+Shift+Down',
      onClick: () => {
        transposeSelection(-12);
        onClose();
      },
    },
    { type: 'divider' },
    // Interpolate/Humanize
    {
      id: 'interpolate',
      label: 'Interpolate',
      icon: <TrendingUp size={14} />,
      shortcut: 'Ctrl+I',
      onClick: onInterpolate,
    },
    {
      id: 'humanize',
      label: 'Humanize',
      icon: <Wand2 size={14} />,
      shortcut: 'Ctrl+H',
      onClick: onHumanize,
    },
    { type: 'divider' },
    // Selection
    {
      id: 'select-column',
      label: 'Select Column',
      icon: <Columns size={14} />,
      onClick: handleSelectColumn,
    },
    {
      id: 'select-channel',
      label: 'Select Channel',
      icon: <LayoutGrid size={14} />,
      onClick: handleSelectChannel,
    },
  ], [
    handleCut,
    handleCopy,
    handlePaste,
    handleClear,
    handleInsertRow,
    handleDeleteRow,
    onInterpolate,
    onHumanize,
    handleSelectColumn,
    handleSelectChannel,
  ]);

  if (!position) return null;

  return (
    <ContextMenu
      items={menuItems}
      position={position}
      onClose={onClose}
    />
  );
};
