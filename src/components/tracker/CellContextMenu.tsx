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
  BarChart3,
  Music,
  Link,
  X,
} from 'lucide-react';
import { ContextMenu, type MenuItemType } from '@components/common/ContextMenu';
import { useTrackerStore } from '@stores/useTrackerStore';

interface CellContextMenuProps {
  isOpen?: boolean;
  position: { x: number; y: number } | null;
  onClose: () => void;
  rowIndex: number;
  channelIndex: number;
  onInterpolate?: () => void;
  onHumanize?: () => void;
  onStrum?: () => void;
  onLegato?: () => void;
  onOpenParameterEditor?: (field: 'volume' | 'effect' | 'effectParam') => void;
  // B/D Animation Ops
  onReverseVisual?: () => void;
  onPolyrhythm?: () => void;
  onFibonacci?: () => void;
  onEuclidean?: () => void;
  onPingPong?: () => void;
  onGlitch?: () => void;
  onStrobe?: () => void;
  onVisualEcho?: () => void;
  onConverge?: () => void;
  onSpiral?: () => void;
  onBounce?: () => void;
  onChaos?: () => void;
}

export const CellContextMenu: React.FC<CellContextMenuProps> = ({
  position,
  onClose,
  rowIndex,
  channelIndex,
  onInterpolate,
  onHumanize,
  onStrum,
  onLegato,
  onOpenParameterEditor,
  onReverseVisual,
  onPolyrhythm,
  onFibonacci,
  onEuclidean,
  onPingPong,
  onGlitch,
  onStrobe,
  onVisualEcho,
  onConverge,
  onSpiral,
  onBounce,
  onChaos,
}) => {
  const {
    patterns,
    currentPatternIndex,
    setCell,
    cursor,
    selection,
    selectColumn,
    selectChannel,
    copySelection,
    cutSelection,
    paste,
    transposeSelection,
    interpolateSelection,
    clearSelection,
  } = useTrackerStore();

  const pattern = patterns[currentPatternIndex];
  const hasSelection = !!selection;

  // Block handlers
  const handleCopyBlock = useCallback(() => {
    copySelection();
    onClose();
  }, [copySelection, onClose]);

  const handleCutBlock = useCallback(() => {
    cutSelection();
    onClose();
  }, [cutSelection, onClose]);

  const handlePasteBlock = useCallback(() => {
    paste();
    onClose();
  }, [paste, onClose]);

  const handleTransposeBlock = useCallback((semitones: number) => {
    transposeSelection(semitones);
    onClose();
  }, [transposeSelection, onClose]);

  const handleInterpolateBlock = useCallback((column: 'volume' | 'cutoff' | 'resonance' | 'envMod' | 'pan' | 'effParam' | 'effParam2') => {
    // Get values from start and end of selection
    if (!selection || !pattern) return;
    const startRow = Math.min(selection.startRow, selection.endRow);
    const endRow = Math.max(selection.startRow, selection.endRow);
    const ch = selection.startChannel;
    
    const startCell = pattern.channels[ch].rows[startRow];
    const endCell = pattern.channels[ch].rows[endRow];
    
    // Map column names to cell property names if they differ
    const cellProp = column === 'effParam' ? 'eff' : column === 'effParam2' ? 'eff2' : column;
    
    const startVal = (startCell[cellProp] as number) || 0;
    const endVal = (endCell[cellProp] as number) || 0;
    
    interpolateSelection(column, startVal, endVal);
    onClose();
  }, [selection, pattern, interpolateSelection, onClose]);

  const handleClearBlock = useCallback(() => {
    clearSelection();
    onClose();
  }, [clearSelection, onClose]);

  // Copy cell to clipboard (legacy single cell)
  const handleCopy = useCallback(() => {
    if (!pattern) return;
    const cell = pattern.channels[channelIndex].rows[rowIndex];
    localStorage.setItem('devilbox-cell-clipboard', JSON.stringify(cell));
  }, [pattern, channelIndex, rowIndex]);

  // Cut cell
  const handleCut = useCallback(() => {
    handleCopy();
    setCell(channelIndex, rowIndex, {
      note: 0,        // XM format: 0 = no note
      instrument: 0,  // XM format: 0 = no instrument
      volume: 0,      // XM format: 0x00 = nothing
      effTyp: 0,      // XM format: 0 = no effect
      eff: 0,         // XM format: 0x00 = no parameter
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
      note: 0,        // XM format: 0 = no note
      instrument: 0,  // XM format: 0 = no instrument
      volume: 0,      // XM format: 0x00 = nothing
      effTyp: 0,      // XM format: 0 = no effect
      eff: 0,         // XM format: 0x00 = no parameter
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
      note: 0,        // XM format: 0 = no note
      instrument: 0,  // XM format: 0 = no instrument
      volume: 0,      // XM format: 0x00 = nothing
      effTyp: 0,      // XM format: 0 = no effect
      eff: 0,         // XM format: 0x00 = no parameter
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
      note: 0,        // XM format: 0 = no note
      instrument: 0,  // XM format: 0 = no instrument
      volume: 0,      // XM format: 0x00 = nothing
      effTyp: 0,      // XM format: 0 = no effect
      eff: 0,         // XM format: 0x00 = no parameter
    });
  }, [pattern, channelIndex, rowIndex, setCell]);

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
    // Block Operations (if selection active)
    ...(hasSelection ? [
      {
        id: 'block-header',
        label: 'BLOCK OPERATIONS',
        disabled: true,
        className: 'text-accent-primary font-bold text-[10px] tracking-widest'
      },
      {
        id: 'block-copy',
        label: 'Copy Block',
        icon: <Copy size={14} />,
        onClick: handleCopyBlock,
      },
      {
        id: 'block-cut',
        label: 'Cut Block',
        icon: <Scissors size={14} />,
        onClick: handleCutBlock,
      },
      {
        id: 'block-paste',
        label: 'Paste Block',
        icon: <ClipboardPaste size={14} />,
        onClick: handlePasteBlock,
      },
      {
        id: 'block-transpose',
        label: 'Transpose Block',
        icon: <TrendingUp size={14} />,
        submenu: [
          { id: 'transpose-up-1', label: '+1 Semitone', onClick: () => handleTransposeBlock(1) },
          { id: 'transpose-down-1', label: '-1 Semitone', onClick: () => handleTransposeBlock(-1) },
          { id: 'transpose-up-12', label: '+1 Octave', onClick: () => handleTransposeBlock(12) },
          { id: 'transpose-down-12', label: '-1 Octave', onClick: () => handleTransposeBlock(-12) },
        ]
      },
      {
        id: 'block-interpolate',
        label: 'Interpolate Block',
        icon: <TrendingUp size={14} />,
        submenu: [
          { id: 'interp-vol', label: 'Interpolate Volume', onClick: () => handleInterpolateBlock('volume') },
          { id: 'interp-eff1', label: 'Interpolate Effect 1', onClick: () => handleInterpolateBlock('effParam') },
          { id: 'interp-eff2', label: 'Interpolate Effect 2', onClick: () => handleInterpolateBlock('effParam2') },
          { id: 'interp-cutoff', label: 'Interpolate Cutoff', onClick: () => handleInterpolateBlock('cutoff') },
          { id: 'interp-res', label: 'Interpolate Resonance', onClick: () => handleInterpolateBlock('resonance') },
        ]
      },
      {
        id: 'block-bd-ops',
        label: 'B/D Operations',
        icon: <Zap size={14} />,
        submenu: [
          { id: 'bd-reverse', label: 'Reverse Visual', onClick: onReverseVisual },
          { id: 'bd-poly', label: 'Polyrhythm', onClick: onPolyrhythm },
          { id: 'bd-fib', label: 'Fibonacci Sequence', onClick: onFibonacci },
          { id: 'bd-eucl', label: 'Euclidean Pattern', onClick: onEuclidean },
          { id: 'bd-pingpong', label: 'Ping-Pong', onClick: onPingPong },
          { id: 'bd-glitch', label: 'Glitch', onClick: onGlitch },
          { id: 'bd-strobe', label: 'Strobe', onClick: onStrobe },
          { id: 'bd-echo', label: 'Visual Echo', onClick: onVisualEcho },
          { id: 'bd-converge', label: 'Converge', onClick: onConverge },
          { id: 'bd-spiral', label: 'Spiral', onClick: onSpiral },
          { id: 'bd-bounce', label: 'Bounce', onClick: onBounce },
          { id: 'bd-chaos', label: 'Chaos', onClick: onChaos },
        ]
      },
      {
        id: 'block-clear',
        label: 'Deselect Block',
        icon: <X size={14} />,
        onClick: handleClearBlock,
      },
      { type: 'divider' as const },
    ] : []),

    // Single Cell Operations (header)
    {
      id: 'cell-header',
      label: 'CELL OPERATIONS',
      disabled: true,
      className: 'text-text-muted font-bold text-[10px] tracking-widest'
    },
    // Cut/Copy/Paste (Single Cell)
    {
      id: 'cut',
      label: 'Cut Cell',
      icon: <Scissors size={14} />,
      shortcut: 'Ctrl+X',
      onClick: handleCut,
    },
    {
      id: 'copy',
      label: 'Copy Cell',
      icon: <Copy size={14} />,
      shortcut: 'Ctrl+C',
      onClick: handleCopy,
    },
    {
      id: 'paste',
      label: 'Paste Cell',
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
    {
      id: 'strum',
      label: 'Strum/Arpeggiate',
      icon: <Music size={14} />,
      onClick: onStrum,
    },
    {
      id: 'legato',
      label: 'Legato (Connect Notes)',
      icon: <Link size={14} />,
      onClick: onLegato,
    },
    { type: 'divider' },
    // Visual Parameter Editor
    {
      id: 'param-editor',
      label: 'Visual Parameter Editor',
      icon: <BarChart3 size={14} />,
      submenu: [
        {
          id: 'param-volume',
          label: 'Edit Volume...',
          onClick: () => onOpenParameterEditor?.('volume'),
        },
        {
          id: 'param-effect',
          label: 'Edit Effect Type...',
          onClick: () => onOpenParameterEditor?.('effect'),
        },
        {
          id: 'param-effectparam',
          label: 'Edit Effect Parameter...',
          onClick: () => onOpenParameterEditor?.('effectParam'),
        },
      ],
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
    onStrum,
    onLegato,
    onOpenParameterEditor,
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
// eslint-disable-next-line react-refresh/only-export-components
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

  // Handler for canvas context menu events (calculates row/channel from event)
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // The canvas caller should set data attributes or we compute from position
    // For now, return early - the caller should use openMenu directly
    e.preventDefault();
  }, []);

  return {
    ...menuState,
    openMenu,
    closeMenu,
    isOpen: menuState.position !== null,
    // Additional properties for PatternEditorCanvas compatibility
    handleContextMenu,
    cellInfo: menuState.position ? {
      rowIndex: menuState.rowIndex,
      channelIndex: menuState.channelIndex,
    } : null,
  };
};
