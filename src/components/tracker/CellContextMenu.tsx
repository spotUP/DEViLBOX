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
    setCursor,
  } = useTrackerStore();

  const pattern = patterns[currentPatternIndex];

  // Copy cell to clipboard
  const handleCopy = useCallback(() => {
    if (!pattern) return;
    const cell = pattern.channels[channelIndex].rows[rowIndex];
    localStorage.setItem('devilbox-cell-clipboard', JSON.stringify(cell));
  }, [pattern, channelIndex, rowIndex]);

  // Cut cell
  const handleCut = useCallback(() => {
    handleCopy();
    setCell(channelIndex, rowIndex, {
      note: null,
      instrument: null,
      volume: null,
      effect: null,
    });
  }, [handleCopy, setCell, channelIndex, rowIndex]);

  // Paste cell
  const handlePaste = useCallback(() => {
    const clipboardData = localStorage.getItem('devilbox-cell-clipboard');
    if (clipboardData) {
      try {
        const cell = JSON.parse(clipboardData);
        setCell(channelIndex, rowIndex, cell);
      } catch (e) {
        console.error('Failed to paste cell:', e);
      }
    }
  }, [setCell, channelIndex, rowIndex]);

  // Clear cell
  const handleClear = useCallback(() => {
    setCell(channelIndex, rowIndex, {
      note: null,
      instrument: null,
      volume: null,
      effect: null,
    });
  }, [setCell, channelIndex, rowIndex]);

  // Insert row (shift down)
  const handleInsertRow = useCallback(() => {
    if (!pattern) return;
    // Shift all rows down from current position
    for (let row = pattern.length - 1; row > rowIndex; row--) {
      const prevCell = pattern.channels[channelIndex].rows[row - 1];
      setCell(channelIndex, row, prevCell);
    }
    // Clear current row
    setCell(channelIndex, rowIndex, {
      note: null,
      instrument: null,
      volume: null,
      effect: null,
    });
  }, [pattern, channelIndex, rowIndex, setCell]);

  // Delete row (shift up)
  const handleDeleteRow = useCallback(() => {
    if (!pattern) return;
    // Shift all rows up from current position
    for (let row = rowIndex; row < pattern.length - 1; row++) {
      const nextCell = pattern.channels[channelIndex].rows[row + 1];
      setCell(channelIndex, row, nextCell);
    }
    // Clear last row
    setCell(channelIndex, pattern.length - 1, {
      note: null,
      instrument: null,
      volume: null,
      effect: null,
    });
  }, [pattern, channelIndex, rowIndex, setCell]);

  // Select entire column
  const handleSelectColumn = useCallback(() => {
    // TODO: Implement block selection for column
    console.log('Select column', channelIndex, cursor.columnIndex);
  }, [channelIndex, cursor.columnIndex]);

  // Select entire channel
  const handleSelectChannel = useCallback(() => {
    // TODO: Implement block selection for channel
    console.log('Select channel', channelIndex);
  }, [channelIndex]);

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

// Hook for using cell context menu
export const useCellContextMenu = () => {
  const [menuState, setMenuState] = React.useState<{
    position: { x: number; y: number } | null;
    rowIndex: number;
    channelIndex: number;
  }>({
    position: null,
    rowIndex: 0,
    channelIndex: 0,
  });

  const openMenu = useCallback((
    e: React.MouseEvent,
    rowIndex: number,
    channelIndex: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuState({
      position: { x: e.clientX, y: e.clientY },
      rowIndex,
      channelIndex,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState((prev) => ({ ...prev, position: null }));
  }, []);

  return {
    ...menuState,
    openMenu,
    closeMenu,
    isOpen: menuState.position !== null,
  };
};
