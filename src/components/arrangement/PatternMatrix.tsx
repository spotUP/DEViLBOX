/**
 * PatternMatrix — Renoise-style 2D pattern matrix editor.
 *
 * Shows a bird's-eye view of the song: rows = sequence positions,
 * columns = tracks/channels. Each cell is a colored block indicating
 * whether that track has content in that pattern. Supports:
 *
 * - Per-slot muting (Alt+click / middle-click) — persisted in store,
 *   respected by playback engine
 * - Rectangular block selection (click+drag, Shift+click for range)
 * - Drag-and-drop to reorder positions
 * - Ctrl+drag to copy blocks
 * - Clone by dragging from bottom edge of a cell
 * - Context menu (mute, copy, duplicate, insert, delete)
 * - Track header with names, color indicators, mute toggle
 * - Playback position highlight with auto-scroll
 * - Keyboard shortcuts (⌘D duplicate, Del remove, ⌘A select all, arrows)
 * - Repeated-slot indicators (shows pattern number when same pattern repeats)
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTrackerStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { useMixerStore } from '@stores/useMixerStore';
import { ContextMenu, type MenuItemType } from '@components/common/ContextMenu';
import type { Pattern, TrackerCell } from '@/types/tracker';
import { Copy, Trash2, Plus, VolumeX, Volume2 } from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────────────

const CELL_W = 32;
const CELL_H = 22;
const POS_COL_W = 36;
const HEADER_H = 44;

// Track colors — Renoise-style palette, cycles per channel
const TRACK_COLORS = [
  '#4a9eff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8',
  '#ff922b', '#20c997', '#748ffc', '#f06595', '#a9e34b',
  '#38d9a9', '#da77f2', '#ffa94d', '#69db7c', '#9775fa',
  '#e599f7',
];

// ── Types ────────────────────────────────────────────────────────────────────

interface MatrixSelection {
  startPos: number;
  startCh: number;
  endPos: number;
  endCh: number;
}

function slotKey(pos: number, ch: number): string {
  return `${pos}:${ch}`;
}

function normalizeSelection(sel: MatrixSelection) {
  return {
    posLo: Math.min(sel.startPos, sel.endPos),
    posHi: Math.max(sel.startPos, sel.endPos),
    chLo: Math.min(sel.startCh, sel.endCh),
    chHi: Math.max(sel.startCh, sel.endCh),
  };
}

function trackHasContent(pattern: Pattern, chIndex: number): boolean {
  const ch = pattern.channels[chIndex];
  if (!ch) return false;
  return ch.rows.some(
    (cell: TrackerCell) => cell.note !== 0 || cell.instrument !== 0 || cell.volume !== -1 ||
      (cell.effTyp !== undefined && cell.effTyp !== 0)
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export const PatternMatrix: React.FC = () => {
  const patternOrder = useTrackerStore(s => s.patternOrder);
  const patterns = useTrackerStore(s => s.patterns);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const addToOrder = useTrackerStore(s => s.addToOrder);
  const removeFromOrder = useTrackerStore(s => s.removeFromOrder);
  const duplicatePosition = useTrackerStore(s => s.duplicatePosition);
  const insertInOrder = useTrackerStore(s => s.insertInOrder);
  const reorderPositions = useTrackerStore(s => s.reorderPositions);
  const toggleChannelMute = useTrackerStore(s => s.toggleChannelMute);
  const slotMutes = useTrackerStore(s => s.slotMutes);
  const toggleSlotMute = useTrackerStore(s => s.toggleSlotMute);
  const setSlotMutesAction = useTrackerStore(s => s.setSlotMutes);
  const clearSlotMutes = useTrackerStore(s => s.clearSlotMutes);
  const clonePattern = useTrackerStore(s => s.clonePattern);

  const isPlaying = useTransportStore(s => s.isPlaying);
  const mixerChannels = useMixerStore(s => s.channels);

  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Selection state
  const [selection, setSelection] = useState<MatrixSelection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{
    pos: { x: number; y: number };
    posIdx: number;
    chIdx: number;
  } | null>(null);

  // Drag state
  const [dragSource, setDragSource] = useState<{ pos: number; ch: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ pos: number; ch: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCloning, setIsCloning] = useState(false);

  // Get channel count from the first pattern
  const numChannels = useMemo(() => {
    const pat = patterns[patternOrder[0] ?? 0];
    return pat?.channels.length ?? 4;
  }, [patterns, patternOrder]);

  // Compute which slots have content
  const contentMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (let posIdx = 0; posIdx < patternOrder.length; posIdx++) {
      const pat = patterns[patternOrder[posIdx]];
      if (!pat) continue;
      for (let ch = 0; ch < numChannels; ch++) {
        if (trackHasContent(pat, ch)) {
          map.set(slotKey(posIdx, ch), true);
        }
      }
    }
    return map;
  }, [patternOrder, patterns, numChannels]);

  // Detect repeated patterns (for Renoise "Show Identical Repeated Slots")
  const repeatedSlots = useMemo(() => {
    const repeated = new Map<string, number>(); // slotKey → original patIdx
    for (let posIdx = 1; posIdx < patternOrder.length; posIdx++) {
      if (patternOrder[posIdx] === patternOrder[posIdx - 1]) {
        for (let ch = 0; ch < numChannels; ch++) {
          repeated.set(slotKey(posIdx, ch), patternOrder[posIdx]);
        }
      }
    }
    return repeated;
  }, [patternOrder, numChannels]);

  // Auto-scroll to keep current position visible
  useEffect(() => {
    if (!scrollRef.current) return;
    const rowTop = currentPositionIndex * CELL_H;
    const viewport = scrollRef.current;
    if (rowTop < viewport.scrollTop || rowTop + CELL_H > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTo({ top: rowTop - viewport.clientHeight / 2 + CELL_H / 2, behavior: 'smooth' });
    }
  }, [currentPositionIndex]);

  // Get channel muted state from mixer store
  const getChannelMuted = useCallback((chIdx: number) => {
    return mixerChannels[chIdx]?.muted ?? false;
  }, [mixerChannels]);

  const getChannelSoloed = useCallback((chIdx: number) => {
    return mixerChannels[chIdx]?.soloed ?? false;
  }, [mixerChannels]);

  const anySolo = useMemo(() => {
    return mixerChannels.some(ch => ch?.soloed);
  }, [mixerChannels]);

  // Check if a slot is in the current selection
  const isInSelection = useCallback((pos: number, ch: number): boolean => {
    if (!selection) return false;
    const { posLo, posHi, chLo, chHi } = normalizeSelection(selection);
    return pos >= posLo && pos <= posHi && ch >= chLo && ch <= chHi;
  }, [selection]);

  // ── Mouse handlers ─────────────────────────────────────────────────────────

  const handleCellMouseDown = useCallback((e: React.MouseEvent, pos: number, ch: number) => {
    e.preventDefault();

    // Alt+click or middle click → toggle slot mute
    if (e.altKey || e.button === 1) {
      if (selection) {
        const { posLo, posHi, chLo, chHi } = normalizeSelection(selection);
        // Check if any selected slots are unmuted
        let anyUnmuted = false;
        for (let p = posLo; p <= posHi && !anyUnmuted; p++) {
          for (let c = chLo; c <= chHi && !anyUnmuted; c++) {
            if (!slotMutes.has(slotKey(p, c))) anyUnmuted = true;
          }
        }
        const keys: string[] = [];
        for (let p = posLo; p <= posHi; p++) {
          for (let c = chLo; c <= chHi; c++) {
            keys.push(slotKey(p, c));
          }
        }
        setSlotMutesAction(keys, anyUnmuted);
      } else {
        toggleSlotMute(pos, ch);
      }
      return;
    }

    // Left click
    if (e.button === 0) {
      if (e.shiftKey && selection) {
        // Extend selection
        setSelection(prev => prev ? { ...prev, endPos: pos, endCh: ch } : { startPos: pos, startCh: ch, endPos: pos, endCh: ch });
      } else if (e.metaKey || e.ctrlKey) {
        // Will be copy-drag if they start dragging
        setSelection({ startPos: pos, startCh: ch, endPos: pos, endCh: ch });
        setIsSelecting(true);
      } else {
        setSelection({ startPos: pos, startCh: ch, endPos: pos, endCh: ch });
        setIsSelecting(true);
      }
      setCurrentPosition(pos, true);
    }
  }, [selection, setCurrentPosition, slotMutes, toggleSlotMute, setSlotMutesAction]);

  const handleCellMouseEnter = useCallback((pos: number, ch: number) => {
    if (isSelecting) {
      setSelection(prev => prev ? { ...prev, endPos: pos, endCh: ch } : null);
    }
    if (isDragging) {
      setDragOver({ pos, ch });
    }
  }, [isSelecting, isDragging]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && dragSource && dragOver && dragSource.pos !== dragOver.pos) {
      if (isCloning) {
        // Clone: duplicate the position and insert at drag target
        duplicatePosition(dragSource.pos);
        // The duplicate is inserted after dragSource.pos, then reorder to dragOver.pos
        const insertedAt = dragSource.pos + 1;
        if (insertedAt !== dragOver.pos) {
          reorderPositions(insertedAt, dragOver.pos);
        }
      } else {
        reorderPositions(dragSource.pos, dragOver.pos);
      }
    }
    setIsSelecting(false);
    setIsDragging(false);
    setIsCloning(false);
    setDragSource(null);
    setDragOver(null);
  }, [isDragging, dragSource, dragOver, isCloning, duplicatePosition, reorderPositions]);

  // Track mouse movement to detect drag start
  const dragStartRef = useRef<{ x: number; y: number; pos: number; ch: number } | null>(null);

  const handleCellMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragStartRef.current && !isDragging && isSelecting) {
      const dx = Math.abs(e.clientX - dragStartRef.current.x);
      const dy = Math.abs(e.clientY - dragStartRef.current.y);
      if (dx > 4 || dy > 4) {
        setIsDragging(true);
        setDragSource({ pos: dragStartRef.current.pos, ch: dragStartRef.current.ch });
        setIsCloning(e.ctrlKey || e.metaKey);
        setIsSelecting(false);
      }
    }
  }, [isDragging, isSelecting]);

  useEffect(() => {
    const handler = () => {
      setIsSelecting(false);
      setIsDragging(false);
      setIsCloning(false);
      setDragSource(null);
      setDragOver(null);
      dragStartRef.current = null;
    };
    window.addEventListener('mouseup', handler);
    return () => window.removeEventListener('mouseup', handler);
  }, []);

  // ── Context menu ──────────────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent, pos: number, ch: number) => {
    e.preventDefault();
    if (!isInSelection(pos, ch)) {
      setSelection({ startPos: pos, startCh: ch, endPos: pos, endCh: ch });
    }
    setCtxMenu({ pos: { x: e.clientX, y: e.clientY }, posIdx: pos, chIdx: ch });
  }, [isInSelection]);

  const ctxMenuItems: MenuItemType[] = useMemo(() => {
    if (!ctxMenu) return [];
    const sel = selection ? normalizeSelection(selection) : null;
    const multiSelected = sel && (sel.posHi > sel.posLo || sel.chHi > sel.chLo);

    // Check if any selected slots are muted/unmuted
    let anyUnmuted = false;
    if (sel) {
      for (let p = sel.posLo; p <= sel.posHi; p++) {
        for (let c = sel.chLo; c <= sel.chHi; c++) {
          if (!slotMutes.has(slotKey(p, c))) { anyUnmuted = true; break; }
        }
        if (anyUnmuted) break;
      }
    }

    const items: MenuItemType[] = [
      {
        id: 'mute-slots',
        label: multiSelected
          ? (anyUnmuted ? 'Mute selected slots' : 'Unmute selected slots')
          : (slotMutes.has(slotKey(ctxMenu.posIdx, ctxMenu.chIdx)) ? 'Unmute slot' : 'Mute slot'),
        icon: <VolumeX size={12} />,
        shortcut: 'Alt+Click',
        onClick: () => {
          if (sel) {
            const keys: string[] = [];
            for (let p = sel.posLo; p <= sel.posHi; p++) {
              for (let c = sel.chLo; c <= sel.chHi; c++) {
                keys.push(slotKey(p, c));
              }
            }
            setSlotMutesAction(keys, anyUnmuted);
          } else {
            toggleSlotMute(ctxMenu.posIdx, ctxMenu.chIdx);
          }
          setCtxMenu(null);
        },
      },
      {
        id: 'mute-track',
        label: `${getChannelMuted(ctxMenu.chIdx) ? 'Unmute' : 'Mute'} track ${ctxMenu.chIdx + 1}`,
        icon: <Volume2 size={12} />,
        onClick: () => {
          toggleChannelMute(ctxMenu.chIdx);
          setCtxMenu(null);
        },
      },
      { type: 'divider' as const },
      {
        id: 'clear-all-mutes',
        label: 'Clear all slot mutes',
        icon: <Volume2 size={12} />,
        disabled: slotMutes.size === 0,
        onClick: () => {
          clearSlotMutes();
          setCtxMenu(null);
        },
      },
      { type: 'divider' as const },
      {
        id: 'duplicate',
        label: multiSelected ? `Duplicate ${sel!.posHi - sel!.posLo + 1} positions` : 'Duplicate position',
        icon: <Copy size={12} />,
        shortcut: '⌘D',
        onClick: () => {
          if (sel) {
            const store = useTrackerStore.getState();
            let offset = 0;
            for (let p = sel.posLo; p <= sel.posHi; p++) {
              store.duplicatePosition(p + offset);
              offset++;
            }
          } else {
            duplicatePosition(ctxMenu.posIdx);
          }
          setCtxMenu(null);
        },
      },
      {
        id: 'clone-to-new',
        label: 'Clone to new pattern',
        icon: <Copy size={12} />,
        shortcut: '⌘K',
        onClick: () => {
          // Clone the pattern at this position into a new unique pattern
          // and replace this position with the clone
          const store = useTrackerStore.getState();
          const patIdx = store.patternOrder[ctxMenu.posIdx];
          store.clonePattern(patIdx);
          const newPatIdx = store.patterns.length - 1;
          store.removeFromOrder(ctxMenu.posIdx);
          store.insertInOrder(newPatIdx, ctxMenu.posIdx);
          store.setCurrentPosition(ctxMenu.posIdx, true);
          setCtxMenu(null);
        },
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
        id: 'delete',
        label: multiSelected ? `Remove ${sel!.posHi - sel!.posLo + 1} positions` : 'Remove position',
        icon: <Trash2 size={12} />,
        shortcut: 'Del',
        danger: true,
        disabled: patternOrder.length <= 1,
        onClick: () => {
          if (sel) {
            const store = useTrackerStore.getState();
            for (let p = sel.posHi; p >= sel.posLo; p--) {
              if (store.patternOrder.length > 1) store.removeFromOrder(p);
            }
            setSelection(null);
          } else {
            removeFromOrder(ctxMenu.posIdx);
          }
          setCtxMenu(null);
        },
      },
    ];

    return items;
  }, [ctxMenu, selection, slotMutes, patternOrder.length, duplicatePosition, insertInOrder, removeFromOrder, toggleChannelMute, toggleSlotMute, setSlotMutesAction, clearSlotMutes, getChannelMuted, clonePattern]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        setSelection(null);
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (selection) {
          const { posLo, posHi } = normalizeSelection(selection);
          const store = useTrackerStore.getState();
          for (let p = posHi; p >= posLo; p--) {
            if (store.patternOrder.length > 1) store.removeFromOrder(p);
          }
          setSelection(null);
        } else if (patternOrder.length > 1) {
          removeFromOrder(currentPositionIndex);
        }
        break;
      case 'd':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          if (selection) {
            const { posLo, posHi } = normalizeSelection(selection);
            const store = useTrackerStore.getState();
            let offset = 0;
            for (let p = posLo; p <= posHi; p++) {
              store.duplicatePosition(p + offset);
              offset++;
            }
          } else {
            duplicatePosition(currentPositionIndex);
          }
        }
        break;
      case 'k':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          // Clone selected positions into new patterns
          if (selection) {
            const { posLo, posHi } = normalizeSelection(selection);
            const store = useTrackerStore.getState();
            for (let p = posLo; p <= posHi; p++) {
              const patIdx = store.patternOrder[p];
              store.clonePattern(patIdx);
              const newPatIdx = store.patterns.length - 1;
              store.removeFromOrder(p);
              store.insertInOrder(newPatIdx, p);
            }
          } else {
            const store = useTrackerStore.getState();
            const patIdx = store.patternOrder[currentPositionIndex];
            store.clonePattern(patIdx);
            const newPatIdx = store.patterns.length - 1;
            store.removeFromOrder(currentPositionIndex);
            store.insertInOrder(newPatIdx, currentPositionIndex);
            store.setCurrentPosition(currentPositionIndex, true);
          }
        }
        break;
      case 'a':
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          setSelection({
            startPos: 0, startCh: 0,
            endPos: patternOrder.length - 1, endCh: numChannels - 1,
          });
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (currentPositionIndex > 0) {
          const next = currentPositionIndex - 1;
          if (e.shiftKey && selection) {
            setSelection(prev => prev ? { ...prev, endPos: next } : null);
          } else if (e.shiftKey) {
            setSelection({ startPos: currentPositionIndex, startCh: 0, endPos: next, endCh: numChannels - 1 });
          } else {
            setSelection(null);
          }
          setCurrentPosition(next, true);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (currentPositionIndex < patternOrder.length - 1) {
          const next = currentPositionIndex + 1;
          if (e.shiftKey && selection) {
            setSelection(prev => prev ? { ...prev, endPos: next } : null);
          } else if (e.shiftKey) {
            setSelection({ startPos: currentPositionIndex, startCh: 0, endPos: next, endCh: numChannels - 1 });
          } else {
            setSelection(null);
          }
          setCurrentPosition(next, true);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (e.shiftKey && selection) {
          setSelection(prev => prev ? { ...prev, endCh: Math.max(0, prev.endCh - 1) } : null);
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (e.shiftKey && selection) {
          setSelection(prev => prev ? { ...prev, endCh: Math.min(numChannels - 1, prev.endCh + 1) } : null);
        }
        break;
      case 'p':
        if (e.altKey) {
          e.preventDefault();
          // Select whole pattern (all channels at current position)
          setSelection({ startPos: currentPositionIndex, startCh: 0, endPos: currentPositionIndex, endCh: numChannels - 1 });
        }
        break;
      case 't':
        if (e.altKey) {
          e.preventDefault();
          // Select whole track (all positions at cursor channel)
          const ch = selection?.startCh ?? 0;
          setSelection({ startPos: 0, startCh: ch, endPos: patternOrder.length - 1, endCh: ch });
        }
        break;
    }
  }, [currentPositionIndex, patternOrder.length, numChannels, selection, setCurrentPosition, removeFromOrder, duplicatePosition, clonePattern]);

  // ── Render ─────────────────────────────────────────────────────────────────

  // Channel names from first pattern
  const channelNames = useMemo(() => {
    const pat = patterns[patternOrder[0] ?? 0];
    if (!pat) return [];
    return pat.channels.map((ch, i) => ch.shortName || ch.name || `Ch ${i + 1}`);
  }, [patterns, patternOrder]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-dark-bg select-none focus:outline-none flex-1 min-h-0"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleCellMouseMove}
    >
      {/* Track header row — sticky */}
      <div className="flex flex-shrink-0 border-b border-dark-border bg-dark-bgSecondary" style={{ height: HEADER_H }}>
        {/* Position column header */}
        <div
          className="flex items-center justify-center text-[9px] font-mono text-text-muted border-r border-dark-border flex-shrink-0"
          style={{ width: POS_COL_W, minWidth: POS_COL_W }}
        >
          <div className="flex flex-col items-center">
            <span className="text-[7px] opacity-60">POS</span>
            <span className="text-[8px]">PAT</span>
          </div>
        </div>
        {/* Track name headers — horizontally scrollable with body */}
        <div className="flex overflow-hidden flex-1">
          {channelNames.map((name, ch) => {
            const muted = getChannelMuted(ch);
            const soloed = getChannelSoloed(ch);
            const color = TRACK_COLORS[ch % TRACK_COLORS.length];
            const dimmed = muted || (anySolo && !soloed);
            return (
              <div
                key={ch}
                className={`flex flex-col items-center justify-center border-r border-dark-border flex-shrink-0 cursor-pointer hover:bg-dark-bgHover transition-colors
                  ${dimmed ? 'opacity-30' : ''}`}
                style={{ width: CELL_W, minWidth: CELL_W }}
                onClick={() => toggleChannelMute(ch)}
                title={`${name}\nClick to mute/unmute${soloed ? ' (soloed)' : ''}`}
              >
                {/* Color indicator bar */}
                <div
                  className="w-4 h-[3px] rounded-full mb-1"
                  style={{ backgroundColor: color }}
                />
                {/* Track name */}
                <div className="text-[7px] font-mono text-text-muted leading-none truncate w-full text-center px-0.5">
                  {name.length > 4 ? name.slice(0, 4) : name}
                </div>
                {/* Track number */}
                <div className="text-[7px] font-mono text-text-muted/50 leading-none mt-0.5">
                  {ch + 1}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable matrix body */}
      <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin min-h-0">
        {patternOrder.map((patIdx, posIdx) => {
          const isCurrent = posIdx === currentPositionIndex;
          const pat = patterns[patIdx];

          return (
            <div
              key={posIdx}
              className={`flex ${isCurrent ? 'bg-accent-primary/5' : ''}`}
              style={{ height: CELL_H }}
            >
              {/* Position index cell */}
              <div
                className={`flex items-center justify-center text-[9px] font-mono border-r border-b border-dark-border flex-shrink-0 cursor-pointer transition-colors
                  ${isCurrent
                    ? 'bg-accent-primary/20 text-accent-primary font-bold'
                    : 'text-text-muted hover:bg-dark-bgHover'}`}
                style={{ width: POS_COL_W, minWidth: POS_COL_W }}
                onClick={() => setCurrentPosition(posIdx, true)}
                title={`Position ${posIdx} → Pattern ${patIdx}${pat?.name ? ` "${pat.name}"` : ''}`}
              >
                <div className="flex items-center gap-0.5">
                  <span className="text-[7px] opacity-50 w-[14px] text-right">{String(posIdx).padStart(2, '0')}</span>
                  <span className="text-[9px] w-[14px] text-left">{String(patIdx).padStart(2, '0')}</span>
                </div>
                {/* Playback indicator */}
                {isCurrent && isPlaying && (
                  <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent-primary animate-pulse" />
                )}
              </div>

              {/* Track cells */}
              {Array.from({ length: numChannels }, (_, ch) => {
                const hasContent = contentMap.has(slotKey(posIdx, ch));
                const isMuted = slotMutes.has(slotKey(posIdx, ch));
                const trackMuted = getChannelMuted(ch);
                const trackSoloed = getChannelSoloed(ch);
                const dimmed = trackMuted || (anySolo && !trackSoloed);
                const selected = isInSelection(posIdx, ch);
                const isDragTarget = dragOver?.pos === posIdx && dragOver?.ch === ch;
                const isRepeated = repeatedSlots.has(slotKey(posIdx, ch));
                const color = TRACK_COLORS[ch % TRACK_COLORS.length];

                return (
                  <div
                    key={ch}
                    className={`border-r border-b flex-shrink-0 relative cursor-pointer transition-colors
                      ${isDragTarget ? 'border-accent-primary border-2' : 'border-dark-border'}
                      ${selected ? 'ring-1 ring-accent-highlight ring-inset' : ''}
                      ${isCurrent && !selected ? 'border-b-accent-primary/30' : ''}`}
                    style={{
                      width: CELL_W,
                      minWidth: CELL_W,
                      backgroundColor: hasContent && !isMuted && !dimmed
                        ? `${color}22`
                        : isCurrent ? 'rgba(255,255,255,0.015)' : 'transparent',
                    }}
                    onMouseDown={(e) => {
                      handleCellMouseDown(e, posIdx, ch);
                      dragStartRef.current = { x: e.clientX, y: e.clientY, pos: posIdx, ch };
                    }}
                    onMouseEnter={() => handleCellMouseEnter(posIdx, ch)}
                    onContextMenu={(e) => handleContextMenu(e, posIdx, ch)}
                    title={`Pos ${posIdx}, Track ${ch + 1}, Pattern ${patIdx}${isMuted ? ' [slot muted]' : ''}${dimmed ? ' [track muted]' : ''}`}
                  >
                    {/* Content block */}
                    {hasContent && (
                      <div
                        className={`absolute rounded-[2px] transition-opacity
                          ${(isMuted || dimmed) ? 'opacity-15' : isRepeated ? 'opacity-40' : 'opacity-75'}`}
                        style={{
                          backgroundColor: color,
                          top: 3, left: 3, right: 3, bottom: 3,
                          // Gradient for repeated slots (Renoise style)
                          ...(isRepeated ? {
                            background: `linear-gradient(135deg, ${color}66 0%, ${color}33 100%)`,
                          } : {}),
                        }}
                      />
                    )}
                    {/* Mute cross indicator */}
                    {isMuted && (
                      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${CELL_W} ${CELL_H}`}>
                        <line x1="5" y1="5" x2={CELL_W - 5} y2={CELL_H - 5} stroke="white" strokeWidth="1.5" opacity="0.5" />
                        <line x1={CELL_W - 5} y1="5" x2="5" y2={CELL_H - 5} stroke="white" strokeWidth="1.5" opacity="0.5" />
                      </svg>
                    )}
                    {/* Repeated slot indicator — pattern number in corner */}
                    {isRepeated && !isMuted && (
                      <span className="absolute bottom-0 right-0.5 text-[6px] font-mono text-text-muted/40 leading-none pointer-events-none">
                        {patIdx}
                      </span>
                    )}
                    {/* Selection highlight */}
                    {selected && (
                      <div className="absolute inset-0 bg-accent-highlight/15 pointer-events-none" />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Add position row */}
        <div className="flex" style={{ height: CELL_H }}>
          <button
            className="flex items-center justify-center text-[10px] font-mono text-text-muted hover:text-accent-primary hover:bg-dark-bgHover transition-colors border-b border-dark-border w-full"
            onClick={() => {
              const currentPat = patternOrder[currentPositionIndex] ?? 0;
              addToOrder(currentPat);
            }}
            title="Add current pattern to order (appends to end)"
          >
            + Add Position
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-2 py-0.5 border-t border-dark-border bg-dark-bgSecondary text-[8px] font-mono text-text-muted">
        <span>
          {patternOrder.length} positions · {patterns.length} patterns · {numChannels} tracks
          {slotMutes.size > 0 && ` · ${slotMutes.size} muted slots`}
        </span>
        <span>
          {selection ? (() => {
            const s = normalizeSelection(selection);
            return `Selection: ${s.posHi - s.posLo + 1}×${s.chHi - s.chLo + 1}`;
          })() : 'Alt+Click to mute slot · ⌘D duplicate · ⌘K clone · Del remove'}
        </span>
      </div>

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
