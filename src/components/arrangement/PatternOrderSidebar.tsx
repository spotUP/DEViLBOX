/**
 * PatternOrderSidebar — Renoise-style vertical pattern order list.
 * Always visible on the left of the pattern editor. Click to navigate,
 * shift-click to multi-select, right-click for context menu, drag to reorder.
 * Data from useTrackerStore (single source of truth).
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useTrackerStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { ContextMenu, type MenuItemType } from '@components/common/ContextMenu';
import { Copy, Trash2, Plus, ArrowUpDown } from 'lucide-react';

export const PatternOrderSidebar: React.FC = () => {
  const patternOrder = useTrackerStore(s => s.patternOrder);
  const patterns = useTrackerStore(s => s.patterns);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const addToOrder = useTrackerStore(s => s.addToOrder);
  const removeFromOrder = useTrackerStore(s => s.removeFromOrder);
  const duplicatePosition = useTrackerStore(s => s.duplicatePosition);
  const reorderPositions = useTrackerStore(s => s.reorderPositions);
  const insertInOrder = useTrackerStore(s => s.insertInOrder);

  const isPlaying = useTransportStore(s => s.isPlaying);

  const listRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Selection state
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const anchorRef = useRef<number>(0);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ pos: { x: number; y: number }; posIdx: number } | null>(null);

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Auto-scroll to keep current position visible
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPositionIndex]);

  // Click handler with shift/cmd multi-select
  const handleClick = useCallback((e: React.MouseEvent, posIdx: number) => {
    if (e.shiftKey) {
      const lo = Math.min(anchorRef.current, posIdx);
      const hi = Math.max(anchorRef.current, posIdx);
      const next = new Set<number>();
      for (let i = lo; i <= hi; i++) next.add(i);
      setSelection(next);
    } else if (e.metaKey || e.ctrlKey) {
      setSelection(prev => {
        const next = new Set(prev);
        if (next.has(posIdx)) next.delete(posIdx);
        else next.add(posIdx);
        return next;
      });
      anchorRef.current = posIdx;
    } else {
      setSelection(new Set());
      anchorRef.current = posIdx;
    }
    setCurrentPosition(posIdx, true);
  }, [setCurrentPosition]);

  // Keyboard navigation with shift-extend
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const pos = currentPositionIndex;
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (pos > 0) {
          const next = pos - 1;
          if (e.shiftKey) {
            const lo = Math.min(anchorRef.current, next);
            const hi = Math.max(anchorRef.current, next);
            const sel = new Set<number>();
            for (let i = lo; i <= hi; i++) sel.add(i);
            setSelection(sel);
          } else {
            setSelection(new Set());
            anchorRef.current = next;
          }
          setCurrentPosition(next, true);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (pos < patternOrder.length - 1) {
          const next = pos + 1;
          if (e.shiftKey) {
            const lo = Math.min(anchorRef.current, next);
            const hi = Math.max(anchorRef.current, next);
            const sel = new Set<number>();
            for (let i = lo; i <= hi; i++) sel.add(i);
            setSelection(sel);
          } else {
            setSelection(new Set());
            anchorRef.current = next;
          }
          setCurrentPosition(next, true);
        }
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (selection.size > 0) {
          const sorted = [...selection].sort((a, b) => b - a);
          const store = useTrackerStore.getState();
          for (const idx of sorted) {
            if (store.patternOrder.length > 1) store.removeFromOrder(idx);
          }
          setSelection(new Set());
        } else if (patternOrder.length > 1) {
          removeFromOrder(pos);
        }
        break;
      case 'd':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (selection.size > 0) {
            const sorted = [...selection].sort((a, b) => a - b);
            const store = useTrackerStore.getState();
            let offset = 0;
            for (const idx of sorted) {
              store.duplicatePosition(idx + offset);
              offset++;
            }
            setSelection(new Set());
          } else {
            duplicatePosition(pos);
          }
        }
        break;
      case 'a':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const all = new Set<number>();
          for (let i = 0; i < patternOrder.length; i++) all.add(i);
          setSelection(all);
        }
        break;
      case 'Escape':
        setSelection(new Set());
        break;
    }
  }, [currentPositionIndex, patternOrder.length, setCurrentPosition, removeFromOrder, duplicatePosition, selection]);

  const handleContextMenu = useCallback((e: React.MouseEvent, posIdx: number) => {
    e.preventDefault();
    if (!selection.has(posIdx)) {
      setSelection(new Set());
    }
    setCtxMenu({ pos: { x: e.clientX, y: e.clientY }, posIdx });
  }, [selection]);

  const handleDoubleClick = useCallback((posIdx: number) => {
    const currentPat = patternOrder[posIdx];
    const nextPat = (currentPat + 1) % patterns.length;
    const store = useTrackerStore.getState();
    store.removeFromOrder(posIdx);
    store.insertInOrder(nextPat, posIdx);
    store.setCurrentPosition(posIdx, true);
  }, [patternOrder, patterns.length]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, posIdx: number) => {
    setDragIdx(posIdx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(posIdx));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, posIdx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(posIdx);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, posIdx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== posIdx) {
      reorderPositions(dragIdx, posIdx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx, reorderPositions]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);

  // Effective selection for context menu
  const effectiveSelection = selection.size > 1 ? selection : (ctxMenu ? new Set([ctxMenu.posIdx]) : new Set<number>());
  const multiSelected = effectiveSelection.size > 1;

  // Build context menu items
  const ctxMenuItems: MenuItemType[] = ctxMenu ? [
    ...(multiSelected ? [
      {
        id: 'duplicate-sel',
        label: `Duplicate ${effectiveSelection.size} positions`,
        icon: <Copy size={12} />,
        onClick: () => {
          const sorted = [...effectiveSelection].sort((a, b) => a - b);
          const store = useTrackerStore.getState();
          let offset = 0;
          for (const idx of sorted) {
            store.duplicatePosition(idx + offset);
            offset++;
          }
          setSelection(new Set());
          setCtxMenu(null);
        },
      },
      { type: 'divider' as const },
      {
        id: 'delete-sel',
        label: `Remove ${effectiveSelection.size} positions`,
        icon: <Trash2 size={12} />,
        danger: true,
        disabled: patternOrder.length <= effectiveSelection.size,
        onClick: () => {
          const sorted = [...effectiveSelection].sort((a, b) => b - a);
          const store = useTrackerStore.getState();
          for (const idx of sorted) {
            if (store.patternOrder.length > 1) store.removeFromOrder(idx);
          }
          setSelection(new Set());
          setCtxMenu(null);
        },
      },
    ] : [
      {
        id: 'duplicate',
        label: 'Duplicate position',
        icon: <Copy size={12} />,
        shortcut: '⌘D',
        onClick: () => { duplicatePosition(ctxMenu.posIdx); setCtxMenu(null); },
      },
      {
        id: 'insert',
        label: 'Insert empty pattern',
        icon: <Plus size={12} />,
        onClick: () => {
          insertInOrder(0, ctxMenu.posIdx + 1);
          setCtxMenu(null);
        },
      },
      { type: 'divider' as const },
      {
        id: 'set-pattern',
        label: 'Set pattern...',
        icon: <ArrowUpDown size={12} />,
        submenu: patterns.slice(0, 32).map((_, patIdx) => ({
          id: `set-pat-${patIdx}`,
          label: `Pattern ${String(patIdx).padStart(2, '0')}`,
          checked: patternOrder[ctxMenu.posIdx] === patIdx,
          onClick: () => {
            const store = useTrackerStore.getState();
            store.removeFromOrder(ctxMenu.posIdx);
            store.insertInOrder(patIdx, ctxMenu.posIdx);
            store.setCurrentPosition(ctxMenu.posIdx, true);
            setCtxMenu(null);
          },
        })),
      },
      { type: 'divider' as const },
      {
        id: 'delete',
        label: 'Remove position',
        icon: <Trash2 size={12} />,
        shortcut: 'Del',
        danger: true,
        disabled: patternOrder.length <= 1,
        onClick: () => { removeFromOrder(ctxMenu.posIdx); setCtxMenu(null); },
      },
    ]),
  ] : [];

  return (
    <div
      ref={sidebarRef}
      className="flex flex-col bg-ft2-bg border-r border-dark-border h-full focus:outline-none"
      style={{ width: 56 }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="text-[9px] font-mono text-ft2-textDim uppercase tracking-wider px-1.5 py-1 border-b border-dark-border bg-ft2-header text-center flex-shrink-0 select-none">
        {selection.size > 1 ? `${selection.size} sel` : 'SEQ'}
      </div>

      {/* Scrollable position list */}
      <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-hidden">
        {patternOrder.map((patIdx, posIdx) => {
          const isCurrent = posIdx === currentPositionIndex;
          const isSelected = selection.has(posIdx);
          const isDragging = posIdx === dragIdx;
          const isDragOver = posIdx === dragOverIdx && dragIdx !== null && dragIdx !== posIdx;
          return (
            <button
              key={posIdx}
              ref={isCurrent ? currentRef : undefined}
              onClick={(e) => handleClick(e, posIdx)}
              onDoubleClick={() => handleDoubleClick(posIdx)}
              onContextMenu={(e) => handleContextMenu(e, posIdx)}
              draggable
              onDragStart={(e) => handleDragStart(e, posIdx)}
              onDragOver={(e) => handleDragOver(e, posIdx)}
              onDrop={(e) => handleDrop(e, posIdx)}
              onDragEnd={handleDragEnd}
              className={`w-full font-mono text-center transition-colors relative select-none
                ${isDragOver ? 'border-t-2 border-t-accent-primary border-b border-b-transparent' : 'border-b border-dark-border'}
                ${isDragging ? 'opacity-30' : ''}
                ${isSelected && !isCurrent ? 'bg-accent-primary/10 text-accent-primary/80' : ''}
                ${isCurrent
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : isSelected ? '' : 'text-ft2-textDim hover:bg-ft2-highlight hover:text-text-primary'
                }`}
              style={{ padding: '3px 4px' }}
              title={`Pos ${posIdx} → Pattern ${patIdx}${patterns[patIdx]?.name ? ` (${patterns[patIdx].name})` : ''}\nShift-click to select range · ⌘-click to toggle`}
            >
              {/* Playback indicator bar */}
              {isCurrent && isPlaying && (
                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent-primary animate-pulse" />
              )}
              {/* Selection indicator */}
              {isSelected && !isCurrent && (
                <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-accent-primary/40" />
              )}
              {/* Position index */}
              <div className={`text-[8px] leading-none ${isCurrent || isSelected ? 'text-accent-primary/60' : 'text-ft2-textDim'}`}>
                {String(posIdx).padStart(2, '0')}
              </div>
              {/* Pattern index */}
              <div className={`text-[11px] leading-tight font-bold ${isCurrent || isSelected ? 'text-accent-primary' : ''}`}>
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

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          items={ctxMenuItems}
          position={ctxMenu.pos}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
};
