/**
 * PatternEditorCanvas - Canvas-based pattern editor for maximum performance
 * Inspired by Bassoon Tracker's approach: canvas rendering with aggressive caching
 *
 * Hybrid approach: Canvas for pattern grid + HTML overlays for UI controls
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useTrackerStore, useTransportStore, useThemeStore, useInstrumentStore } from '@stores';
import { AutomationLanes } from './AutomationLanes';
import { MacroLanes } from './MacroLanes';
import { useUIStore } from '@stores/useUIStore';
import { useShallow } from 'zustand/react/shallow';
import { ChannelVUMeter } from './ChannelVUMeter';
import { ChannelVUMeters } from './ChannelVUMeters';
import { ChannelColorPicker } from './ChannelColorPicker';
import { ChannelContextMenu } from './ChannelContextMenu';
import { CellContextMenu, useCellContextMenu } from './CellContextMenu';
import { ParameterEditor } from './ParameterEditor';
import { GENERATORS, type GeneratorType } from '@utils/patternGenerators';
import { Plus, Volume2, VolumeX, Headphones, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMobilePatternGestures } from '@/hooks/useMobilePatternGestures';
import { useResponsiveSafe } from '@contexts/ResponsiveContext';
import { haptics } from '@/utils/haptics';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import * as Tone from 'tone';
import { useBDAnimations } from '@hooks/tracker/useBDAnimations';
import { useSettingsStore } from '@stores/useSettingsStore';
import { TrackerVisualBackground } from './TrackerVisualBackground';
import type { CursorPosition } from '@typedefs';
import { useCollaborationStore, getCollabClient } from '@stores/useCollaborationStore';
// OffscreenCanvas + WebGL2 worker bridge
import { TrackerOffscreenBridge } from '@engine/renderer/OffscreenBridge';
import type {
  PatternSnapshot,
  ThemeSnapshot,
  UIStateSnapshot,
  ChannelLayoutSnapshot,
  ChannelSnapshot,
  CellSnapshot,
} from '@engine/renderer/worker-types';
import TrackerWorkerFactory from '@/workers/tracker-render.worker.ts?worker';

const ROW_HEIGHT = 24;
const CHAR_WIDTH = 10;
const LINE_NUMBER_WIDTH = 40;
// Channel width is computed dynamically in render() based on acid/prob columns

// NOTE_NAMES, noteToString and hexByte moved to TrackerGLRenderer (WebGL worker)

interface ChannelTrigger {
  level: number;
  triggered: boolean;
}

interface PatternEditorCanvasProps {
  onAcidGenerator?: (channelIndex: number) => void;
  onRandomize?: (channelIndex: number) => void;
  visibleChannels?: number; // For mobile: how many channels to show
  startChannel?: number; // For mobile portrait: which channel to start from
  onSwipeLeft?: () => void; // For mobile: move cursor left
  onSwipeRight?: () => void; // For mobile: move cursor right
  onSwipeUp?: () => void; // For mobile: move cursor up
  onSwipeDown?: () => void; // For mobile: move cursor down
}

// PERFORMANCE: Memoize to prevent re-renders on every scroll step
export const PatternEditorCanvas: React.FC<PatternEditorCanvasProps> = React.memo(({
  onAcidGenerator,
  onRandomize,
  visibleChannels: _visibleChannels, // Handled internally: canvas clips channels outside viewport
  startChannel: _startChannel = 0,   // Handled internally: canvas scrolls to cursor channel on mobile
  onSwipeLeft: _onSwipeLeft,   // Reserved - using internal handler instead
  onSwipeRight: _onSwipeRight, // Reserved - using internal handler instead
  onSwipeUp: _onSwipeUp,   // Reserved - currently allows native scroll
  onSwipeDown: _onSwipeDown, // Reserved - currently allows native scroll
}) => {
  const { isMobile } = useResponsiveSafe();
  // Mutable ref — set imperatively in useEffect to avoid StrictMode double-transferControlToOffscreen
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [scrollLeft, setScrollLeft] = useState(0);
  // PERF: Use refs for scroll/visible state to avoid React re-renders during playback.
  // The canvas render loop updates these every frame — React state would cause 60Hz re-renders.
  // Overlay elements (MacroLanes) are positioned via direct DOM manipulation.
  const scrollYRef = useRef(0);
  const visibleStartRef = useRef(0);
  const macroOverlayRef = useRef<HTMLDivElement>(null);
  const peerCursorDivRef = useRef<HTMLDivElement>(null);
  // Ref-tracked peer cursor so the RAF loop can read it without React re-renders
  const peerCursorRef = useRef({ row: 0, channel: 0, active: false, patternIndex: -1 });
  // Peer selection overlay
  const peerSelectionDivRef = useRef<HTMLDivElement>(null);
  const peerSelectionRef = useRef<{ startChannel: number; endChannel: number; startRow: number; endRow: number; patternIndex: number } | null>(null);
  // Ref-tracked channel layout so the RAF loop always has current values
  const channelOffsetsRef = useRef<number[]>([]);
  const channelWidthsRef = useRef<number[]>([]);

  // Cell context menu
  const cellContextMenu = useCellContextMenu();

  // PERF: Use ref instead of state for channel triggers to avoid re-renders
  const channelTriggersRef = useRef<ChannelTrigger[]>([]);

  // Accumulator for horizontal scroll resistance
  const scrollAccumulatorRef = useRef(0);

  // Bridge to the OffscreenCanvas worker
  const bridgeRef = useRef<TrackerOffscreenBridge | null>(null);
  // Ref-tracked scroll for immediate worker updates (avoids React re-renders on scroll)
  const scrollLeftRef = useRef(0);

  // Get pattern and actions (moved BEFORE callbacks that use them)
  const {
    pattern,
    patterns,
    currentPatternIndex,
    addChannel,
    toggleChannelMute,
    toggleChannelSolo,
    toggleChannelCollapse: _toggleChannelCollapse,
    setChannelColor,
    updateChannelName,
    setCell,
    moveCursorToChannelAndColumn,
    copyTrack,
    cutTrack,
    pasteTrack,
    mobileChannelIndex,
    cursor,
    selection,
    showGhostPatterns,
    columnVisibility
  } = useTrackerStore(useShallow((state) => ({
    pattern: state.patterns[state.currentPatternIndex],
    patterns: state.patterns,
    currentPatternIndex: state.currentPatternIndex,
    addChannel: state.addChannel,
    toggleChannelMute: state.toggleChannelMute,
    toggleChannelSolo: state.toggleChannelSolo,
    toggleChannelCollapse: state.toggleChannelCollapse,
    setChannelColor: state.setChannelColor,
    updateChannelName: state.updateChannelName,
    setCell: state.setCell,
    moveCursorToChannelAndColumn: state.moveCursorToChannelAndColumn,
    copyTrack: state.copyTrack,
    cutTrack: state.cutTrack,
    pasteTrack: state.pasteTrack,
    mobileChannelIndex: state.cursor.channelIndex,
    cursor: state.cursor,
    selection: state.selection,
    showGhostPatterns: state.showGhostPatterns,
    columnVisibility: state.columnVisibility,
  })));

  const { instruments } = useInstrumentStore(useShallow((state) => ({
    instruments: state.instruments
  })));

  const trackerVisualBg = useSettingsStore((s) => s.trackerVisualBg);

  // Keep peerCursorRef, peerMouseRef, and peerSelectionRef in sync with collaboration store (no React re-renders)
  useEffect(() => {
    const unsub = useCollaborationStore.subscribe((state) => {
      peerCursorRef.current = {
        row: state.peerCursorRow,
        channel: state.peerCursorChannel,
        active: state.status === 'connected' && state.listenMode === 'shared',
        patternIndex: state.peerPatternIndex,
      };
      peerSelectionRef.current = (state.status === 'connected' && state.listenMode === 'shared')
        ? state.peerSelection : null;
    });
    return unsub;
  }, []);

  // Broadcast peer_selection whenever local selection changes
  useEffect(() => {
    const unsub = useTrackerStore.subscribe((state, prev) => {
      if (state.selection === prev.selection) return;
      if (useCollaborationStore.getState().status !== 'connected') return;
      const sel = state.selection;
      if (sel) {
        getCollabClient()?.send({
          type: 'peer_selection',
          patternIndex: state.currentPatternIndex,
          startChannel: sel.startChannel, endChannel: sel.endChannel,
          startRow: sel.startRow, endRow: sel.endRow,
        });
      } else {
        getCollabClient()?.send({ type: 'peer_selection_clear' });
      }
    });
    return unsub;
  }, []);

  // B/D Animation handlers
  const bdAnimations = useBDAnimations();

  // Channel Metrics: calculate numChannels, offsets, and widths once per pattern/theme change
  const { numChannels, channelOffsets, channelWidths, totalChannelsWidth } = useMemo(() => {
    if (!pattern) return { 
      numChannels: 0, 
      channelOffsets: [], 
      channelWidths: [],
      totalChannelsWidth: 0
    };

    const nc = pattern.channels.length;
    const noteWidth = CHAR_WIDTH * 3 + 4;
    
    // Determine extra column visibility from store settings (stable!)
    const showAcid = columnVisibility.flag1 || columnVisibility.flag2;
    const showProb = columnVisibility.probability;

    // Calculate per-channel widths based on effectCols
    const offsets: number[] = [];
    const widths: number[] = [];
    let currentX = LINE_NUMBER_WIDTH;
    
    for (let ch = 0; ch < nc; ch++) {
      const channel = pattern.channels[ch];
      const isCollapsed = channel?.collapsed;
      
      if (isCollapsed) {
        // Collapsed: show note column + padding for collapse button
        const collapsedWidth = noteWidth + 40; // Note column + button space
        offsets.push(currentX);
        widths.push(collapsedWidth);
        currentX += collapsedWidth;
      } else {
        // Get effect columns for this channel (default 2 for backward compatibility)
        const effectCols = channel?.channelMeta?.effectCols ?? 2;
        // inst(2)+4 vol(2)+4 + effectCols*(3+4) - but base layout is CW*4+8 for inst+vol
        // Each effect column is 3 chars + 4px gap = CHAR_WIDTH*3+4
        const effectWidth = effectCols * (CHAR_WIDTH * 3 + 4);
        const paramWidth = CHAR_WIDTH * 4 + 8  // inst(2) + vol(2) + gaps
          + effectWidth
          + (showAcid ? CHAR_WIDTH * 2 + 8 : 0)
          + (showProb ? CHAR_WIDTH * 2 + 4 : 0);
        const chWidth = noteWidth + paramWidth + 60;
        offsets.push(currentX);
        widths.push(chWidth);
        currentX += chWidth;
      }
    }

    return {
      numChannels: nc,
      channelOffsets: offsets,
      channelWidths: widths,
      totalChannelsWidth: currentX - LINE_NUMBER_WIDTH
    };
  }, [pattern, instruments, columnVisibility]);

  // Keep channelOffsetsRef/channelWidthsRef in sync for the RAF loop (selection math)
  useEffect(() => {
    channelOffsetsRef.current = channelOffsets;
    channelWidthsRef.current = channelWidths;
  }, [channelOffsets, channelWidths]);

  // Calculate if all channels fit in viewport (for disabling horizontal scroll)
  const allChannelsFit = useMemo(() => {
    if (!pattern || numChannels === 0) return true;
    return (LINE_NUMBER_WIDTH + totalChannelsWidth) <= dimensions.width;
  }, [totalChannelsWidth, numChannels, dimensions.width, pattern]);

  // Mobile gesture handlers
  // Vertical swipes move the cursor up/down
  const handleSwipeUp = useCallback(() => {
    if (!pattern || !isMobile) return;
    const newRow = Math.max(0, cursor.rowIndex - 4); // Move up 4 rows
    useTrackerStore.getState().moveCursorToRow(newRow);
  }, [pattern, isMobile, cursor.rowIndex]);

  const handleSwipeDown = useCallback(() => {
    if (!pattern || !isMobile) return;
    const newRow = Math.min(pattern.length - 1, cursor.rowIndex + 4); // Move down 4 rows
    useTrackerStore.getState().moveCursorToRow(newRow);
  }, [pattern, isMobile, cursor.rowIndex]);

  // Continuous scroll handler for drag scrolling
  const handleScroll = useCallback((deltaY: number) => {
    if (!pattern || !isMobile) return;

    // Convert pixels to rows (ROW_HEIGHT = 24px)
    const rowDelta = Math.round(deltaY / ROW_HEIGHT);

    if (Math.abs(rowDelta) > 0) {
      const newRow = Math.max(0, Math.min(pattern.length + 31, cursor.rowIndex + rowDelta));
      useTrackerStore.getState().moveCursorToRow(newRow);
    }
  }, [pattern, isMobile, cursor.rowIndex]);

  // Ref to accumulate horizontal scroll distance
  const horizontalAccumulatorRef = useRef(0);

  const handleHorizontalScroll = useCallback((deltaX: number) => {
    if (!pattern || !isMobile) return;

    // We use a sensitivity threshold for horizontal column movement
    // Roughly 20px per column step feels good
    const COLUMN_STEP_THRESHOLD = 25;
    horizontalAccumulatorRef.current += deltaX;

    if (Math.abs(horizontalAccumulatorRef.current) >= COLUMN_STEP_THRESHOLD) {
      const steps = Math.trunc(horizontalAccumulatorRef.current / COLUMN_STEP_THRESHOLD);
      horizontalAccumulatorRef.current -= steps * COLUMN_STEP_THRESHOLD;

      // Move cursor by N steps
      const store = useTrackerStore.getState();
      for (let i = 0; i < Math.abs(steps); i++) {
        store.moveCursor(steps > 0 ? 'right' : 'left');
      }
    }
  }, [pattern, isMobile]);

  // Handle tap on pattern canvas - move cursor to tapped cell
  const getCellFromCoords = useCallback((clientX: number, clientY: number) => {
    if (!pattern || !containerRef.current) return null;

    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left + scrollLeft;
    const relativeY = clientY - rect.top;

    // Adjust for scrollY (which is baseY in render)
    // baseY = centerLineTop - (topLines * ROW_HEIGHT) - smoothOffset;
    // We want to know which row is at relativeY.
    // The currentRow is at centerLineTop.
    const centerLineTop = Math.floor(dimensions.height / 2) - ROW_HEIGHT / 2;
    const rowOffset = Math.floor((relativeY - centerLineTop) / ROW_HEIGHT);
    
    const transportState = useTransportStore.getState();
    const currentRow = transportState.isPlaying ? transportState.currentRow : cursor.rowIndex;
    const rowIndex = currentRow + rowOffset;

    let channelIndex = 0;
    let localX = -1;
    let foundChannel = false;

    for (let ch = 0; ch < numChannels; ch++) {
      const off = channelOffsets[ch] - scrollLeft;
      const w = channelWidths[ch];
      if (relativeX >= off && relativeX < off + w) {
        channelIndex = ch;
        localX = relativeX - off - 8; // Adjust for internal padding
        foundChannel = true;
        break;
      }
    }

    if (!foundChannel) {
      if (relativeX < LINE_NUMBER_WIDTH) {
        channelIndex = 0;
        localX = -1;
      } else {
        return null;
      }
    }

    // Determine column type
    const isCollapsed = pattern.channels[channelIndex]?.collapsed;
    if (isCollapsed) return { rowIndex: Math.max(0, Math.min(rowIndex, pattern.length - 1)), channelIndex, columnType: 'note' };

    let columnType: CursorPosition['columnType'] = 'note';
    // Calculate widths for the current channel's schema (same as getParamCanvas)
    const noteWidth = CHAR_WIDTH * 3 + 4;
    const cell = pattern.channels[channelIndex]?.rows[0];
    const hasAcid = cell?.flag1 !== undefined || cell?.flag2 !== undefined;
    const hasProb = cell?.probability !== undefined;

    if (localX >= noteWidth + 4) {
      const xInParams = localX - (noteWidth + 8);
      if (xInParams < CHAR_WIDTH * 2 + 4) columnType = 'instrument';
      else if (xInParams < CHAR_WIDTH * 4 + 8) columnType = 'volume';
      else if (xInParams < CHAR_WIDTH * 7 + 12) columnType = 'effTyp';
      else if (xInParams < CHAR_WIDTH * 10 + 16) columnType = 'effTyp2';
      else if (hasAcid && xInParams < CHAR_WIDTH * 12 + 24) columnType = xInParams < CHAR_WIDTH * 11 + 20 ? 'flag1' : 'flag2';
      else if (hasProb) columnType = 'probability';
    }

    return {
      rowIndex: Math.max(0, Math.min(rowIndex, pattern.length - 1)),
      channelIndex,
      columnType
    };
  }, [pattern, dimensions.height, scrollLeft, cursor.rowIndex, channelOffsets, channelWidths, numChannels]);

  const [isDragging, setIsDragging] = useState(false);
  const [, setDragOverCell] = useState<{ channelIndex: number; rowIndex: number } | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();

    // Show cell highlight for internal instrument drags
    const cell = getCellFromCoords(e.clientX, e.clientY);
    if (cell) {
      setDragOverCell({ channelIndex: cell.channelIndex, rowIndex: cell.rowIndex });
      bridgeRef.current?.post({ type: 'dragOver', cell: { channelIndex: cell.channelIndex, rowIndex: cell.rowIndex } });
      e.dataTransfer.dropEffect = 'copy';
    } else {
      setDragOverCell(null);
      bridgeRef.current?.post({ type: 'dragOver', cell: null });
    }
  }, [getCellFromCoords]);

  const handleDragLeave = useCallback(() => {
    setDragOverCell(null);
    bridgeRef.current?.post({ type: 'dragOver', cell: null });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    setDragOverCell(null);
    bridgeRef.current?.post({ type: 'dragOver', cell: null });

    // Only handle internal instrument drags — let file drops propagate to GlobalDragDropHandler
    const dragData = e.dataTransfer.getData('application/x-devilbox-instrument');
    if (!dragData) return;

    e.preventDefault();
    e.stopPropagation();

    const cell = getCellFromCoords(e.clientX, e.clientY);
    if (!cell) return;

    try {
      const { id } = JSON.parse(dragData);
      // Set instrument at this cell
      useTrackerStore.getState().setCell(cell.channelIndex, cell.rowIndex, {
        instrument: id
      });
      haptics.success();
    } catch (err) {
      console.error('[PatternEditor] Drop failed:', err);
    }
  }, [getCellFromCoords]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isMobile || e.button !== 0) return; // Only left click on desktop

    const cell = getCellFromCoords(e.clientX, e.clientY);
    if (!cell) return;

    const store = useTrackerStore.getState();
    
    if (e.shiftKey) {
      // Extend selection
      store.updateSelection(cell.channelIndex, cell.rowIndex);
    } else {
      // Start new selection or just move cursor
      store.moveCursorToRow(cell.rowIndex);
      store.moveCursorToChannelAndColumn(cell.channelIndex, cell.columnType as any);
      
      // If we move the cursor, start a new selection
      store.startSelection();
    }
    
    setIsDragging(true);
  }, [isMobile, getCellFromCoords]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || isMobile) return;

    const cell = getCellFromCoords(e.clientX, e.clientY);
    if (!cell) return;

    const store = useTrackerStore.getState();
    store.updateSelection(cell.channelIndex, cell.rowIndex, cell.columnType as any);
  }, [isDragging, isMobile, getCellFromCoords]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
    }
  }, [isDragging]);

  const handleLongPress = useCallback((x: number, y: number) => {
    if (!isMobile) return;
    
    const cell = getCellFromCoords(x, y);
    if (!cell) return;

    const store = useTrackerStore.getState();
    store.moveCursorToRow(cell.rowIndex);
    store.moveCursorToChannelAndColumn(cell.channelIndex, cell.columnType as any);
    store.startSelection();
    
    haptics.heavy();
    useUIStore.getState().setStatusMessage('BLOCK START');
  }, [isMobile, getCellFromCoords]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const cell = getCellFromCoords(e.clientX, e.clientY);
    if (cell) {
      cellContextMenu.openMenu(e, cell.rowIndex, cell.channelIndex);
    }
  }, [getCellFromCoords, cellContextMenu]);

  // Handle tap on pattern canvas - move cursor to tapped cell
  const handlePatternTap = useCallback((tapX: number, tapY: number) => {
    if (!pattern || !isMobile || !containerRef.current || !canvasRef.current) return;

    // Get container bounds
    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = tapX - rect.left; // No horizontal scroll on mobile
    const relativeY = tapY - rect.top + containerRef.current.scrollTop;

    // On mobile, there's no channel header, so no offset needed
    const rowIndex = Math.floor(relativeY / ROW_HEIGHT);

    // Calculate channel width - must match render() layout
    const noteWidth = CHAR_WIDTH * 3 + 4;
    const firstCell = pattern.channels[0]?.rows[0];
    const hasAcid = firstCell?.flag1 !== undefined || firstCell?.flag2 !== undefined;
    const hasProb = firstCell?.probability !== undefined;
    const paramWidth = CHAR_WIDTH * 10 + 16
      + (hasAcid ? CHAR_WIDTH * 2 + 8 : 0)
      + (hasProb ? CHAR_WIDTH * 2 + 4 : 0)
      + CHAR_WIDTH * 2 + 4; // Automation column
    const channelWidth = noteWidth + paramWidth + 20 + 20; // +20 for automation lane visual space

    let channelIndex = 0;
    let localX = relativeX - LINE_NUMBER_WIDTH;
    if (relativeX > LINE_NUMBER_WIDTH) {
      channelIndex = Math.floor(localX / channelWidth);
      channelIndex = Math.max(0, Math.min(channelIndex, pattern.channels.length - 1));
      localX = localX % channelWidth;
    } else {
      // Tap on line numbers - just select note of channel 0
      channelIndex = 0;
      localX = -1; // Force note column
    }

    // Determine column type within the channel
    let columnType: 'note' | 'instrument' | 'volume' | 'effTyp' | 'effVal' | 'effTyp2' | 'effVal2' | 'flag1' | 'flag2' | 'probability' = 'note';
    
    // Column layout (offsets matching getParamCanvas):
    // note (noteWidth) -> 8px gap -> inst(2) -> 4gap -> vol(2) -> 4gap -> eff(1+2) -> 4gap -> eff2(1+2) -> 4gap
    if (localX < noteWidth + 4) {
      columnType = 'note';
    } else {
      const xInParams = localX - (noteWidth + 8);
      
      // inst(2) +4gap -> 0 to CW*2+4
      if (xInParams < CHAR_WIDTH * 2 + 4) {
        columnType = 'instrument';
      } 
      // vol(2) +4gap -> CW*2+4 to CW*4+8
      else if (xInParams < CHAR_WIDTH * 4 + 8) {
        columnType = 'volume';
      }
      // eff(1+2) +4gap -> CW*4+8 to CW*7+12
      else if (xInParams < CHAR_WIDTH * 7 + 12) {
        columnType = 'effTyp'; // Snap to type first
      }
      // eff2(1+2) +4gap -> CW*7+12 to CW*10+16
      else if (xInParams < CHAR_WIDTH * 10 + 16) {
        columnType = 'effTyp2';
      }
      // acid columns (if present)
      else if (hasAcid && xInParams < CHAR_WIDTH * 12 + 24) {
        columnType = xInParams < CHAR_WIDTH * 11 + 20 ? 'flag1' : 'flag2';
      }
      // probability (if present)
      else if (hasProb) {
        columnType = 'probability';
      }
    }

    // Clamp row to valid range
    const validRow = Math.max(0, Math.min(rowIndex, pattern.length - 1));

    // Move cursor to tapped position
    const store = useTrackerStore.getState();
    const currentSelection = store.selection;

    if (currentSelection) {
      // If we already have a selection, tapping a new cell extends it
      store.updateSelection(channelIndex, validRow);
      haptics.soft();
      useUIStore.getState().setStatusMessage('BLOCK UPDATED');
    } else {
      // Normal move behavior
      store.moveCursorToRow(validRow);
      store.moveCursorToChannelAndColumn(channelIndex, columnType as any);
    }
  }, [pattern, isMobile, mobileChannelIndex, cursor.columnType, moveCursorToChannelAndColumn]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!containerRef.current) return;
    
    // Vertical scroll moves rows
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      const store = useTrackerStore.getState();
      const rows = Math.round(e.deltaY / 20);
      if (rows !== 0) {
        const newRow = Math.max(0, Math.min(pattern.length - 1, cursor.rowIndex + rows));
        store.moveCursorToRow(newRow);
      }
    }
  }, [pattern.length, cursor.rowIndex]);

  // Mobile swipe handlers for pattern data (column navigation)
  const handleDataSwipeLeft = useCallback(() => {
    if (!pattern || !isMobile) return;
    
    const columnOrder: CursorPosition['columnType'][] = [
      'note', 'instrument', 'volume', 'effTyp', 'effParam', 'effTyp2', 'effParam2'
    ];
    
    // Scan current channel for flag/prob columns
    const firstCell = pattern.channels[mobileChannelIndex]?.rows[0];
    if (firstCell?.flag1 !== undefined || firstCell?.flag2 !== undefined) {
      columnOrder.push('flag1', 'flag2');
    }
    if (firstCell?.probability !== undefined) {
      columnOrder.push('probability');
    }

    const currentIndex = columnOrder.indexOf(cursor.columnType);
    
    // If we're not at the last column, move to next column
    if (currentIndex !== -1 && currentIndex < columnOrder.length - 1) {
      useTrackerStore.getState().moveCursorToColumn(columnOrder[currentIndex + 1]);
    } else {
      // Move to next channel's note column
      const nextChannel = Math.min(pattern.channels.length - 1, mobileChannelIndex + 1);
      if (nextChannel !== mobileChannelIndex) {
        moveCursorToChannelAndColumn(nextChannel, 'note');
      }
    }
  }, [pattern, isMobile, mobileChannelIndex, cursor.columnType, moveCursorToChannelAndColumn]);

  const handleDataSwipeRight = useCallback(() => {
    if (!pattern || !isMobile) return;
    
    const columnOrder: CursorPosition['columnType'][] = [
      'note', 'instrument', 'volume', 'effTyp', 'effParam', 'effTyp2', 'effParam2'
    ];
    
    // Scan current channel for flag/prob columns
    const firstCell = pattern.channels[mobileChannelIndex]?.rows[0];
    if (firstCell?.flag1 !== undefined || firstCell?.flag2 !== undefined) {
      columnOrder.push('flag1', 'flag2');
    }
    if (firstCell?.probability !== undefined) {
      columnOrder.push('probability');
    }

    const currentIndex = columnOrder.indexOf(cursor.columnType);
    
    // If we're not at the first column (note), move to previous column
    if (currentIndex > 0) {
      useTrackerStore.getState().moveCursorToColumn(columnOrder[currentIndex - 1]);
    } else {
      // Move to previous channel's last column (typically effParam2 or probability)
      const prevChannel = Math.max(0, mobileChannelIndex - 1);
      if (prevChannel !== mobileChannelIndex) {
        const prevFirstCell = pattern.channels[prevChannel]?.rows[0];
        let lastCol: CursorPosition['columnType'] = 'effParam2';
        if (prevFirstCell?.probability !== undefined) lastCol = 'probability';
        else if (prevFirstCell?.flag2 !== undefined) lastCol = 'flag2';
        
        moveCursorToChannelAndColumn(prevChannel, lastCol);
      }
    }
  }, [pattern, isMobile, mobileChannelIndex, cursor.columnType, moveCursorToChannelAndColumn]);

  // Mobile swipe handlers for channel header (direct channel jump)
  const handleHeaderSwipeLeft = useCallback(() => {
    if (!pattern || !isMobile) return;
    const nextChannel = Math.min(pattern.channels.length - 1, mobileChannelIndex + 1);
    if (nextChannel !== mobileChannelIndex) {
      moveCursorToChannelAndColumn(nextChannel, 'note');
    }
  }, [pattern, isMobile, mobileChannelIndex, moveCursorToChannelAndColumn]);

  const handleHeaderSwipeRight = useCallback(() => {
    if (!pattern || !isMobile) return;
    const prevChannel = Math.max(0, mobileChannelIndex - 1);
    if (prevChannel !== mobileChannelIndex) {
      moveCursorToChannelAndColumn(prevChannel, 'note');
    }
  }, [pattern, isMobile, mobileChannelIndex, moveCursorToChannelAndColumn]);

  const patternGestures = useMobilePatternGestures({
    onSwipeLeft: handleDataSwipeLeft,
    onSwipeRight: handleDataSwipeRight,
    onSwipeUp: handleSwipeUp,
    onSwipeDown: handleSwipeDown,
    onTap: handlePatternTap,
    onLongPress: handleLongPress,
    onScroll: handleScroll,
    onHorizontalScroll: handleHorizontalScroll,
    onTouchStart: () => {
      horizontalAccumulatorRef.current = 0;
    },
    swipeThreshold: 30, // Lower threshold for better mobile responsiveness
    enabled: isMobile,
  });

  // Channel header gestures for mobile
  const channelHeaderGestures = useMobilePatternGestures({
    onSwipeLeft: handleHeaderSwipeLeft,
    onSwipeRight: handleHeaderSwipeRight,
    enabled: isMobile,
  });

  // Theme — only needed for the 'ready' init message
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const getCurrentTheme = useThemeStore((state) => state.getCurrentTheme);

  // Visual Parameter Editor state
  const [parameterEditorState, setParameterEditorState] = useState<{
    isOpen: boolean;
    field: 'volume' | 'effect' | 'effectParam';
    channelIndex: number;
    startRow: number;
    endRow: number;
  } | null>(null);

  // Handler for opening parameter editor from context menu
  const handleOpenParameterEditor = useCallback((field: 'volume' | 'effect' | 'effectParam') => {
    if (!pattern) return;
    const channelIdx = cellContextMenu.cellInfo?.channelIndex ?? cursor.channelIndex;
    // Use selection if available, otherwise use 16 rows from current position
    const start = selection?.startRow ?? cursor.rowIndex;
    const end = selection?.endRow ?? Math.min(cursor.rowIndex + 15, pattern.length - 1);

    setParameterEditorState({
      isOpen: true,
      field,
      channelIndex: channelIdx,
      startRow: start,
      endRow: end,
    });
    cellContextMenu.closeMenu();
  }, [cellContextMenu, cursor, selection, pattern]);

  // Notify worker when theme changes
  useEffect(() => {
    bridgeRef.current?.post({ type: 'theme', theme: snapshotTheme() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentThemeId]);

  // Center current channel on mobile
  useEffect(() => {
    if (isMobile && pattern) {
      const noteWidth = CHAR_WIDTH * 3 + 4;
      const firstCell = pattern.channels[0]?.rows[0];
      const hasAcid = firstCell?.flag1 !== undefined || firstCell?.flag2 !== undefined;
      const hasProb = firstCell?.probability !== undefined;
      const paramWidth = CHAR_WIDTH * 10 + 16
        + (hasAcid ? CHAR_WIDTH * 2 + 8 : 0)
        + (hasProb ? CHAR_WIDTH * 2 + 4 : 0)
        + CHAR_WIDTH * 2 + 4;
      const channelWidth = noteWidth + paramWidth + 20 + 20;
      
      // Calculate target scroll to center the channel
      const targetScroll = mobileChannelIndex * channelWidth;
      scrollLeftRef.current = targetScroll;
      bridgeRef.current?.post({ type: 'scroll', x: targetScroll });
      setScrollLeft(targetScroll);
    }
  }, [isMobile, mobileChannelIndex, pattern]);

  // Snapshot helpers — produce serializable snapshots from stores for the worker
  const snapshotTheme = useCallback((): ThemeSnapshot => {
    const theme = getCurrentTheme();
    return {
      accent:              theme.colors.accent,
      accentSecondary:     theme.colors.accentSecondary,
      accentGlow:          theme.colors.accentGlow,
      bg:                  theme.colors.trackerRowEven,
      rowNormal:           theme.colors.trackerRowOdd,
      rowHighlight:        theme.colors.trackerRowHighlight,
      border:              theme.colors.border,
      textNote:            theme.colors.textSecondary,
      textNoteActive:      theme.colors.text,
      textMuted:           theme.colors.cellEmpty,
      textInstrument:      theme.colors.cellInstrument,
      textVolume:          theme.colors.cellVolume,
      textEffect:          theme.colors.cellEffect,
      lineNumber:          theme.colors.textMuted,
      lineNumberHighlight: theme.colors.accentSecondary,
      selection:           theme.colors.accentGlow,
    };
  }, [getCurrentTheme]);

  const snapshotUI = useCallback((): UIStateSnapshot => {
    const ui = useUIStore.getState();
    const settings = useSettingsStore.getState();
    const tracker = useTrackerStore.getState();
    return {
      useHex:             ui.useHexNumbers,
      blankEmpty:         ui.blankEmptyCells,
      showGhostPatterns:  tracker.showGhostPatterns,
      columnVisibility:   tracker.columnVisibility,
      trackerVisualBg:    settings.trackerVisualBg,
      recordMode:         tracker.recordMode,
    };
  }, []);

  const snapshotPatterns = useCallback((): PatternSnapshot[] => {
    const state = useTrackerStore.getState();
    return state.patterns.map((p) => ({
      id: p.id,
      length: p.length,
      channels: p.channels.map((ch): ChannelSnapshot => ({
        id: ch.id,
        name: ch.name,
        color: ch.color ?? undefined,
        muted: ch.muted,
        solo: ch.solo,
        collapsed: ch.collapsed,
        effectCols: ch.channelMeta?.effectCols ?? 2,
        rows: ch.rows.map((cell): CellSnapshot => ({
          note: cell.note ?? 0,
          instrument: cell.instrument ?? 0,
          volume: cell.volume ?? 0,
          effTyp: cell.effTyp ?? 0,
          eff: cell.eff ?? 0,
          effTyp2: cell.effTyp2 ?? 0,
          eff2: cell.eff2 ?? 0,
          flag1: cell.flag1,
          flag2: cell.flag2,
          probability: cell.probability,
        })),
      })),
    }));
  }, []);

  const snapshotLayout = useCallback((): ChannelLayoutSnapshot => ({
    offsets: channelOffsets,
    widths:  channelWidths,
    totalWidth: totalChannelsWidth,
  }), [channelOffsets, channelWidths, totalChannelsWidth]);

  // Channel context menu handlers
  const handleFillPattern = useCallback((channelIndex: number, generatorType: GeneratorType) => {
    if (!pattern) return;
    const generator = GENERATORS[generatorType];
    if (!generator) return;

    const channel = pattern.channels[channelIndex];
    const instrumentId = channel.instrumentId ?? 1;
    const cells = generator.generate({
      patternLength: pattern.length,
      instrumentId,
      note: 49,
      velocity: 0x40,
    });

    cells.forEach((cell, row) => {
      setCell(channelIndex, row, cell);
    });
  }, [pattern, setCell]);

  const handleClearChannel = useCallback((channelIndex: number) => {
    if (!pattern) return;
    for (let row = 0; row < pattern.length; row++) {
      setCell(channelIndex, row, {
        note: 0,
        instrument: 0,
        volume: 0,
        effTyp: 0,
        eff: 0,
      });
    }
    useUIStore.getState().setStatusMessage('CHANNEL CLEARED');
  }, [pattern, setCell]);

  const handleCopyChannel = useCallback((channelIndex: number) => {
    copyTrack(channelIndex);
  }, [copyTrack]);

  const handleCutChannel = useCallback((channelIndex: number) => {
    cutTrack(channelIndex);
  }, [cutTrack]);

  const handlePasteChannel = useCallback((channelIndex: number) => {
    pasteTrack(channelIndex);
  }, [pasteTrack]);

  const handleTranspose = useCallback((channelIndex: number, semitones: number) => {
    if (!pattern) return;
    for (let row = 0; row < pattern.length; row++) {
      const cell = pattern.channels[channelIndex].rows[row];
      if (cell.note && cell.note !== 0 && cell.note !== 97) {
        let newNote = cell.note + semitones;
        newNote = Math.max(1, Math.min(96, newNote));
        setCell(channelIndex, row, { ...cell, note: newNote });
      }
    }
    useUIStore.getState().setStatusMessage(`TRANSPOSE ${semitones > 0 ? '+' : ''}${semitones}`);
  }, [pattern, setCell]);

  const handleHumanize = useCallback((channelIndex: number) => {
    if (!pattern) return;
    for (let row = 0; row < pattern.length; row++) {
      const cell = pattern.channels[channelIndex].rows[row];
      if (cell.volume !== null && cell.volume >= 0x10) {
        const variation = Math.floor(Math.random() * 8) - 4;
        const newVolume = Math.max(0x10, Math.min(0x50, cell.volume + variation));
        setCell(channelIndex, row, { ...cell, volume: newVolume });
      }
    }
    useUIStore.getState().setStatusMessage('HUMANIZED');
  }, [pattern, setCell]);

  const handleInterpolate = useCallback((channelIndex: number) => {
    if (!pattern) return;
    const channel = pattern.channels[channelIndex];
    if (!channel) return;

    let firstRow = -1;
    let lastRow = -1;
    let firstVolume = 0;
    let lastVolume = 0;

    for (let row = 0; row < pattern.length; row++) {
      const cell = channel.rows[row];
      if (cell.volume !== null && cell.volume >= 0x10 && cell.volume <= 0x50) {
        if (firstRow === -1) {
          firstRow = row;
          firstVolume = cell.volume;
        }
        lastRow = row;
        lastVolume = cell.volume;
      }
    }

    if (firstRow === -1 || lastRow === -1 || lastRow - firstRow < 2) return;

    const rowCount = lastRow - firstRow;
    for (let row = firstRow + 1; row < lastRow; row++) {
      const t = (row - firstRow) / rowCount;
      const interpolatedVolume = Math.round(firstVolume + (lastVolume - firstVolume) * t);
      const cell = channel.rows[row];
      setCell(channelIndex, row, { ...cell, volume: interpolatedVolume });
    }
    useUIStore.getState().setStatusMessage('INTERPOLATED');
  }, [pattern, setCell]);

  // B/D Animation handler wrappers - use full channel or selection range
  const getBDAnimationOptions = useCallback((channelIndex: number) => {
    const startRow = selection
      ? Math.min(selection.startRow, selection.endRow)
      : 0;
    const endRow = selection
      ? Math.max(selection.startRow, selection.endRow)
      : (pattern?.length ?? 64) - 1;
    return {
      patternIndex: currentPatternIndex,
      channelIndex,
      startRow,
      endRow,
    };
  }, [selection, currentPatternIndex, pattern?.length]);

  const handleReverseVisual = useCallback((channelIndex: number) => {
    bdAnimations.applyReverseVisual(getBDAnimationOptions(channelIndex));
  }, [bdAnimations, getBDAnimationOptions]);

  const handlePolyrhythm = useCallback((channelIndex: number) => {
    const opts = getBDAnimationOptions(channelIndex);
    bdAnimations.applyPolyrhythm(opts.patternIndex, [channelIndex], [3], opts.startRow, opts.endRow);
  }, [bdAnimations, getBDAnimationOptions]);

  const handleFibonacci = useCallback((channelIndex: number) => {
    bdAnimations.applyFibonacciSequence(getBDAnimationOptions(channelIndex));
  }, [bdAnimations, getBDAnimationOptions]);

  const handleEuclidean = useCallback((channelIndex: number) => {
    bdAnimations.applyEuclideanPattern(getBDAnimationOptions(channelIndex), 5, 8);
  }, [bdAnimations, getBDAnimationOptions]);

  const handlePingPong = useCallback((channelIndex: number) => {
    bdAnimations.applyPingPong(getBDAnimationOptions(channelIndex));
  }, [bdAnimations, getBDAnimationOptions]);

  const handleGlitch = useCallback((channelIndex: number) => {
    bdAnimations.applyGlitch(getBDAnimationOptions(channelIndex));
  }, [bdAnimations, getBDAnimationOptions]);

  const handleStrobe = useCallback((channelIndex: number) => {
    bdAnimations.applyStrobe(getBDAnimationOptions(channelIndex));
  }, [bdAnimations, getBDAnimationOptions]);

  const handleVisualEcho = useCallback((channelIndex: number) => {
    bdAnimations.applyVisualEcho(getBDAnimationOptions(channelIndex));
  }, [bdAnimations, getBDAnimationOptions]);

  const handleConverge = useCallback((channelIndex: number) => {
    bdAnimations.applyConverge(getBDAnimationOptions(channelIndex));
  }, [bdAnimations, getBDAnimationOptions]);

  const handleSpiral = useCallback((channelIndex: number) => {
    bdAnimations.applySpiral(getBDAnimationOptions(channelIndex));
  }, [bdAnimations, getBDAnimationOptions]);

  const handleBounce = useCallback((channelIndex: number) => {
    bdAnimations.applyBounce(getBDAnimationOptions(channelIndex));
  }, [bdAnimations, getBDAnimationOptions]);

  const handleChaos = useCallback((channelIndex: number) => {
    bdAnimations.applyChaos(getBDAnimationOptions(channelIndex));
  }, [bdAnimations, getBDAnimationOptions]);

  // PERF: VU meter polling moved to ref-based update (no React re-renders)
  // The ChannelVUMeters component handles its own animation loop
  // Header VU indicators are updated via refs in the render loop
  useEffect(() => {
    if (pattern) {
      channelTriggersRef.current = pattern.channels.map(() => ({ level: 0, triggered: false }));
    }
  }, [pattern?.channels.length]);

  // ─── Worker bridge initialisation ──────────────────────────────────────────
  // Runs once after the canvas mounts. Transfers control to the worker,
  // sends the initial snapshot, then subscribes to stores to forward deltas.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Feature-detect OffscreenCanvas transfer support
    if (!('transferControlToOffscreen' in HTMLCanvasElement.prototype)) {
      console.warn('[PatternEditorCanvas] OffscreenCanvas not supported, skipping worker');
      return;
    }

    // Create canvas imperatively — prevents StrictMode double-transferControlToOffscreen error
    const canvas = document.createElement('canvas');
    canvas.style.cssText = `display:block;width:${dimensions.width}px;height:${dimensions.height}px;`;
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const bridge = new TrackerOffscreenBridge(TrackerWorkerFactory, {
      onReady: () => {
        // Worker is ready — send layout so it can start rendering
        bridge.post({ type: 'channelLayout', channelLayout: snapshotLayout() });
      },
      onMessage: () => {
        // Future: handle click replies from worker (currently hit-tested on main thread)
      },
    });
    bridgeRef.current = bridge;

    const dpr   = window.devicePixelRatio || 1;
    const w     = Math.max(1, container.clientWidth);
    const h     = Math.max(1, container.clientHeight);
    const state = useTrackerStore.getState();

    // Transfer canvas — after this the main thread cannot draw to it
    const offscreen = canvas.transferControlToOffscreen();

    bridge.post(
      {
        type:               'init',
        canvas:             offscreen,
        dpr,
        width:              w,
        height:             h,
        theme:              snapshotTheme(),
        uiState:            snapshotUI(),
        patterns:           snapshotPatterns(),
        currentPatternIndex: state.currentPatternIndex,
        cursor: {
          rowIndex:    state.cursor.rowIndex,
          channelIndex: state.cursor.channelIndex,
          columnType:  state.cursor.columnType,
          digitIndex:  state.cursor.digitIndex,
        },
        selection:          state.selection ? {
          startChannel: state.selection.startChannel,
          endChannel:   state.selection.endChannel,
          startRow:     state.selection.startRow,
          endRow:       state.selection.endRow,
          columnTypes:  state.selection.columnTypes,
        } : null,
        channelLayout: snapshotLayout(),
      },
      [offscreen],
    );

    // Subscribe to tracker store — post pattern/cursor/selection deltas
    const unsubTracker = useTrackerStore.subscribe((s, prev) => {
      const b = bridgeRef.current;
      if (!b) return;
      if (s.patterns !== prev.patterns || s.currentPatternIndex !== prev.currentPatternIndex) {
        b.post({ type: 'patterns', patterns: snapshotPatterns(), currentPatternIndex: s.currentPatternIndex });
      }
      // PERF: Skip cursor posts during playback — the RAF loop sends 'playback' messages
      // at animation frame rate which the worker uses for row highlighting instead.
      if (s.cursor !== prev.cursor && !useTransportStore.getState().isPlaying) {
        b.post({ type: 'cursor', cursor: {
          rowIndex:    s.cursor.rowIndex,
          channelIndex: s.cursor.channelIndex,
          columnType:  s.cursor.columnType,
          digitIndex:  s.cursor.digitIndex,
        }});
      }
      if (s.selection !== prev.selection) {
        b.post({ type: 'selection', selection: s.selection ? {
          startChannel: s.selection.startChannel,
          endChannel:   s.selection.endChannel,
          startRow:     s.selection.startRow,
          endRow:       s.selection.endRow,
          columnTypes:  s.selection.columnTypes,
        } : null });
      }
      if (s.columnVisibility !== prev.columnVisibility || s.showGhostPatterns !== prev.showGhostPatterns || s.recordMode !== prev.recordMode) {
        b.post({ type: 'uiState', uiState: snapshotUI() });
      }
    });

    // Subscribe to UI store
    const unsubUI = useUIStore.subscribe((s, prev) => {
      if (s.useHexNumbers !== prev.useHexNumbers || s.blankEmptyCells !== prev.blankEmptyCells) {
        bridgeRef.current?.post({ type: 'uiState', uiState: snapshotUI() });
      }
    });

    // Subscribe to settings store
    const unsubSettings = useSettingsStore.subscribe((s, prev) => {
      if (s.trackerVisualBg !== prev.trackerVisualBg) {
        bridgeRef.current?.post({ type: 'uiState', uiState: snapshotUI() });
      }
    });

    return () => {
      unsubTracker();
      unsubUI();
      unsubSettings();
      bridge.dispose();
      bridgeRef.current = null;
      canvas.remove();
      canvasRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // Forward layout changes to worker when channel widths/offsets change
  useEffect(() => {
    bridgeRef.current?.post({ type: 'channelLayout', channelLayout: snapshotLayout() });
  }, [snapshotLayout]);


  // ─── Thin overlay RAF (updates macroOverlayRef + posts playback state) ─────
  // This replaces the heavy Canvas 2D render loop. It runs on the main thread
  // to update overlay DOM positions (macroLanes) synchronously with audio.
  useEffect(() => {
    let rafId: number;
    const audioBpm = useTransportStore.getState().bpm;
    const audioSpeed = useTransportStore.getState().speed;

    // PERF: Dedup playback messages — only post when values change
    let prevRow = -1;
    let prevSmooth = -1;
    let prevPattern = -1;
    let prevPlaying = false;

    const tick = () => {
      const transportState = useTransportStore.getState();
      const trackerState   = useTrackerStore.getState();
      const isPlaying      = transportState.isPlaying;
      const smoothScrolling = transportState.smoothScrolling;

      let currentRow   = trackerState.cursor.rowIndex;
      let smoothOffset = 0;
      let activePatternIdx = trackerState.currentPatternIndex;

      if (isPlaying) {
        const replayer  = getTrackerReplayer();
        const audioTime = Tone.now() + 0.01;
        const audioState = replayer.getStateAtTime(audioTime);

        if (audioState) {
          currentRow       = audioState.row;
          activePatternIdx = audioState.pattern;

          if (smoothScrolling) {
            const nextState = replayer.getStateAtTime(audioTime + 0.5, true);
            const effectiveDuration = (nextState && nextState.row !== audioState.row)
              ? nextState.time - audioState.time
              : (2.5 / audioBpm) * audioSpeed;
            const progress = Math.min(Math.max((audioTime - audioState.time) / effectiveDuration, 0), 1);
            smoothOffset = progress * ROW_HEIGHT;
          }
        }
      }

      // PERF: Only post playback message when values actually change
      // Reduces 60 msgs/sec → ~15-20 msgs/sec during playback
      if (currentRow !== prevRow || activePatternIdx !== prevPattern ||
          isPlaying !== prevPlaying || Math.abs(smoothOffset - prevSmooth) > 0.5) {
        prevRow = currentRow;
        prevSmooth = smoothOffset;
        prevPattern = activePatternIdx;
        prevPlaying = isPlaying;
        bridgeRef.current?.post({
          type:         'playback',
          row:          currentRow,
          smoothOffset,
          patternIndex: activePatternIdx,
          isPlaying,
        });
      }

      // Update overlay positions (macroLanes) — same math as the old render loop
      const h = dimensions.height;
      const visibleLines = Math.ceil(h / ROW_HEIGHT) + 2;
      const topLines     = Math.floor(visibleLines / 2);
      const vStart       = currentRow - topLines;
      const centerLineTop = Math.floor(h / 2) - ROW_HEIGHT / 2;
      const baseY        = centerLineTop - topLines * ROW_HEIGHT - smoothOffset;

      scrollYRef.current       = baseY;
      visibleStartRef.current  = vStart;
      if (macroOverlayRef.current) {
        macroOverlayRef.current.style.top = `${baseY}px`;
      }

      // Peer cursor overlay — thin caret at peer's channel + row
      if (peerCursorDivRef.current) {
        const pc = peerCursorRef.current;
        const curPatIdx = useTrackerStore.getState().currentPatternIndex;
        const offsets = channelOffsetsRef.current;
        if (pc.active && pc.patternIndex === curPatIdx && offsets.length > pc.channel) {
          const py = baseY + (pc.row - vStart) * ROW_HEIGHT;
          // +8 accounts for the internal channel padding before the note column starts
          const px = offsets[pc.channel] - scrollLeftRef.current + 8;
          peerCursorDivRef.current.style.display = 'block';
          peerCursorDivRef.current.style.transform = `translate(${px}px, ${py}px)`;
        } else {
          peerCursorDivRef.current.style.display = 'none';
        }
      }

      // Peer selection rectangle
      if (peerSelectionDivRef.current) {
        const ps = peerSelectionRef.current;
        const curPatIdx = useTrackerStore.getState().currentPatternIndex;
        if (ps && ps.patternIndex === curPatIdx) {
          const offsets = channelOffsetsRef.current;
          const widths = channelWidthsRef.current;
          const startCh = Math.min(ps.startChannel, ps.endChannel);
          const endCh   = Math.max(ps.startChannel, ps.endChannel);
          const startRow = Math.min(ps.startRow, ps.endRow);
          const endRow   = Math.max(ps.startRow, ps.endRow);
          if (offsets.length > endCh) {
            const left   = offsets[startCh] + LINE_NUMBER_WIDTH - scrollLeftRef.current;
            const width  = offsets[endCh] + widths[endCh] - offsets[startCh];
            const top    = baseY + (startRow - vStart) * ROW_HEIGHT;
            const height = (endRow - startRow + 1) * ROW_HEIGHT;
            peerSelectionDivRef.current.style.display = 'block';
            peerSelectionDivRef.current.style.left = `${left}px`;
            peerSelectionDivRef.current.style.top = `${top}px`;
            peerSelectionDivRef.current.style.width = `${width}px`;
            peerSelectionDivRef.current.style.height = `${height}px`;
          }
        } else {
          peerSelectionDivRef.current.style.display = 'none';
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [dimensions.height]); // re-run if height changes


  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    resizeObserver.observe(container);
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDimensions({ width: rect.width, height: rect.height });
    }

    return () => resizeObserver.disconnect();
  }, []);

  // Notify worker when dimensions change (worker owns canvas.width/height)
  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    bridgeRef.current?.post({ type: 'resize', w: dimensions.width, h: dimensions.height, dpr });
    // Keep canvas CSS size in sync (canvas is created imperatively, not via JSX)
    if (canvasRef.current) {
      canvasRef.current.style.width  = `${dimensions.width}px`;
      canvasRef.current.style.height = `${dimensions.height}px`;
    }
  }, [dimensions]);

  // Sync canvas z-index when trackerVisualBg overlay is toggled
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.style.position = trackerVisualBg ? 'relative' : '';
      canvasRef.current.style.zIndex   = trackerVisualBg ? '1' : '';
    }
  }, [trackerVisualBg]);

  // Reset horizontal scroll when all channels fit in viewport
  useEffect(() => {
    if (allChannelsFit && scrollLeft > 0) {
      scrollLeftRef.current = 0;
      bridgeRef.current?.post({ type: 'scroll', x: 0 });
      setScrollLeft(0);
    }
  }, [allChannelsFit, scrollLeft]);

  // Handle mouse wheel for scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const isPlaying = useTransportStore.getState().isPlaying;
      if (isPlaying) return;

      // Vertical scroll - move cursor
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const delta = Math.sign(e.deltaY) * 2;
        const state = useTrackerStore.getState();
        const pattern = state.patterns[state.currentPatternIndex];
        if (!pattern) return;

        const currentRow = state.cursor.rowIndex;
        // Allow scrolling beyond pattern boundaries to see ghost patterns
        const newRow = Math.min(pattern.length + 32, currentRow + delta); // Allow scrolling 32 rows into next pattern
        useTrackerStore.getState().moveCursorToRow(newRow);
      } else {
        // Horizontal scroll - scroll channels STEPPED (one by one)
        // Use totalChannelsWidth from useMemo for consistency
        const maxScroll = Math.max(0, LINE_NUMBER_WIDTH + totalChannelsWidth - container.clientWidth);

        if (maxScroll > 0) {
          // Accumulate scroll delta for resistance
          scrollAccumulatorRef.current += e.deltaX;
          
          const SCROLL_THRESHOLD = 50; // Resistance threshold in pixels
          
          if (Math.abs(scrollAccumulatorRef.current) > SCROLL_THRESHOLD) {
            const direction = Math.sign(scrollAccumulatorRef.current);
            
            // Reset accumulator after triggering
            scrollAccumulatorRef.current = 0;

            if (direction === 0) return;

            // Find current leftmost visible channel
            let currentCh = 0;
            for (let i = 0; i < channelOffsets.length; i++) {
              const targetScroll = channelOffsets[i] - LINE_NUMBER_WIDTH;
              if (targetScroll <= scrollLeft + 5) { // +5 epsilon
                currentCh = i;
              } else {
                break;
              }
            }

            let nextCh = currentCh + direction;
            nextCh = Math.max(0, Math.min(channelOffsets.length - 1, nextCh));
            
            const newScrollLeft = Math.max(0, Math.min(maxScroll, channelOffsets[nextCh] - LINE_NUMBER_WIDTH));

            // Post directly to worker — no React re-render needed for canvas
            scrollLeftRef.current = newScrollLeft;
            bridgeRef.current?.post({ type: 'scroll', x: newScrollLeft });

            setScrollLeft(newScrollLeft);
            if (headerScrollRef.current) {
              headerScrollRef.current.scrollLeft = newScrollLeft;
            }
            if (bottomScrollRef.current) {
              bottomScrollRef.current.scrollLeft = newScrollLeft;
            }
          }
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [scrollLeft, totalChannelsWidth, dimensions.width, channelOffsets]);

  // Handle header scroll sync — post to worker immediately (no React delay)
  const handleHeaderScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const left = e.currentTarget.scrollLeft;
    scrollLeftRef.current = left;
    bridgeRef.current?.post({ type: 'scroll', x: left });
    setScrollLeft(left);
    if (bottomScrollRef.current) bottomScrollRef.current.scrollLeft = left;
  }, []);

  // Handle bottom scroll sync — post to worker immediately
  const handleBottomScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const left = e.currentTarget.scrollLeft;
    scrollLeftRef.current = left;
    bridgeRef.current?.post({ type: 'scroll', x: left });
    setScrollLeft(left);
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = left;
  }, []);

  if (!pattern) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        No pattern loaded
      </div>
    );
  }

  const mobileChannel = pattern.channels[mobileChannelIndex];
  // Note: trigger levels are animation-driven and updated via RAF - provide defaults for render
  const mobileTrigger = { level: 0, triggered: false };

  return (
    <div className="flex flex-col h-full">
      {/* Mobile Channel Header */}
      {isMobile && (
        <div className="flex-shrink-0 bg-dark-bgTertiary border-b border-dark-border relative touch-none" {...channelHeaderGestures}>
          <div className="flex items-center justify-between px-3 py-2">
            <button
              onClick={handleHeaderSwipeRight}
              disabled={mobileChannelIndex <= 0}
              className={`p-2 rounded-lg transition-colors ${
                mobileChannelIndex <= 0 ? 'text-text-muted opacity-30' : 'text-text-secondary hover:bg-dark-bgHover'
              }`}
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex flex-col items-center">
              <div className="flex items-center gap-3">
                <span
                  className="font-bold font-mono text-lg"
                  style={{ color: mobileChannel?.color || 'var(--color-accent)' }}
                >
                  CH {(mobileChannelIndex + 1).toString().padStart(2, '0')}
                </span>
                <span className="text-xs text-text-muted">
                  / {pattern.channels.length.toString().padStart(2, '0')}
                </span>
                <ChannelVUMeter level={mobileTrigger.level} isActive={mobileTrigger.triggered} />
              </div>
              <input
                type="text"
                className="bg-dark-bgPrimary/50 border border-dark-border/30 rounded px-2 py-0.5 mt-1 font-mono text-[10px] text-accent-primary text-center uppercase focus:border-accent-primary outline-none min-w-[120px]"
                value={mobileChannel?.name || `Channel ${mobileChannelIndex + 1}`}
                onChange={(e) => updateChannelName(mobileChannelIndex, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            </div>

            <button
              onClick={handleHeaderSwipeLeft}
              disabled={mobileChannelIndex >= pattern.channels.length - 1}
              className={`p-2 rounded-lg transition-colors ${
                mobileChannelIndex >= pattern.channels.length - 1 ? 'text-text-muted opacity-30' : 'text-text-secondary hover:bg-dark-bgHover'
              }`}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 px-3 py-1 border-t border-dark-border/50">
            <button
              onClick={() => toggleChannelMute(mobileChannelIndex)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                mobileChannel?.muted ? 'bg-accent-error/20 text-accent-error' : 'text-text-muted hover:bg-dark-bgHover'
              }`}
            >
              {mobileChannel?.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <button
              onClick={() => toggleChannelSolo(mobileChannelIndex)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                mobileChannel?.solo ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-muted hover:bg-dark-bgHover'
              }`}
            >
              <Headphones size={14} />
            </button>
            <ChannelColorPicker
              currentColor={mobileChannel?.color}
              onColorSelect={(color) => setChannelColor(mobileChannelIndex, color)}
            />
          </div>
        </div>
      )}

      {/* Desktop Channel Header */}
      {!isMobile && (
        <>
          {/* Top Scrollbar */}
          <div
            ref={bottomScrollRef}
            onScroll={handleBottomScroll}
            className={`flex-shrink-0 h-3 bg-dark-bgTertiary border-b border-dark-border overflow-x-auto ${allChannelsFit ? 'hidden' : ''}`}
            style={{ paddingLeft: LINE_NUMBER_WIDTH }}
          >
            <div style={{ width: totalChannelsWidth, height: 1 }} />
          </div>

          <div className="flex-shrink-0 bg-dark-bgTertiary border-dark-border z-20 relative h-[28px]">
            <div className="flex h-full">
            {/* Row number column header */}
            <div className="flex-shrink-0 px-2 text-text-muted text-xs font-medium text-center border-r border-dark-border flex items-center justify-center"
                 style={{ width: LINE_NUMBER_WIDTH }}>
              ROW
            </div>

            {/* Scrollable channel headers */}
            <div
              ref={headerScrollRef}
              onScroll={handleHeaderScroll}
              className="overflow-x-hidden overflow-y-hidden flex-1"
              data-vu-scroll
            >
              <div className="flex" style={{ width: totalChannelsWidth }}>
                {pattern.channels.map((channel, idx) => {
                  // Trigger levels are animation-driven via RAF; ChannelVUMeter is disabled
                  const trigger = { level: 0, triggered: false };
                  const channelWidth = channelWidths[idx];
                  
                  const isCollapsed = channel.collapsed;

                  return (
                    <div
                      key={channel.id}
                      className={`flex-shrink-0 flex items-center justify-between gap-1 ${isCollapsed ? 'px-1' : 'px-2'} py-1
                        border-r border-dark-border transition-colors relative
                        ${channel.muted ? 'opacity-50' : ''}
                        ${channel.solo ? 'bg-accent-primary/10' : ''}`}
                      style={{
                        width: channelWidth,
                        backgroundColor: channel.color ? `${channel.color}15` : undefined,
                        boxShadow: channel.color ? `inset 2px 0 0 ${channel.color}` : undefined,
                      }}
                    >
                      {!isCollapsed && (
                        <div className="flex items-center gap-1.5 overflow-hidden flex-1 min-w-0">
                        <span
                          className="font-bold font-mono text-[11px] flex-shrink-0 opacity-80"
                          style={{ color: channel.color || 'var(--color-accent)' }}
                        >
                          {(idx + 1).toString().padStart(2, '0')}
                        </span>
                        <input
                          type="text"
                          className="bg-transparent border-none outline-none font-mono text-[10px] font-bold text-text-primary focus:text-accent-primary transition-colors min-w-0 flex-1 overflow-hidden text-ellipsis uppercase px-0 placeholder:text-text-muted/50"
                          value={channel.name || ''}
                          placeholder={`CH${idx + 1}`}
                          onChange={(e) => updateChannelName(idx, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          title={`Click to rename channel (Short: ${channel.shortName || (idx + 1)})`}
                        />
                        <div className="flex-shrink-0">
                          <ChannelVUMeter level={trigger.level} isActive={trigger.triggered} />
                        </div>
                      </div>
                      )}

                      {!isCollapsed && (
                        <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
                        <ChannelContextMenu
                          channelIndex={idx}
                          channel={channel}
                          patternId={pattern.id}
                          patternLength={pattern.length}
                          onFillPattern={handleFillPattern}
                          onClearChannel={handleClearChannel}
                          onCopyChannel={handleCopyChannel}
                          onCutChannel={handleCutChannel}
                          onPasteChannel={handlePasteChannel}
                          onTranspose={handleTranspose}
                          onHumanize={handleHumanize}
                          onInterpolate={handleInterpolate}
                          onAcidGenerator={onAcidGenerator || (() => {})}
                          onRandomize={onRandomize || (() => {})}
                          onReverseVisual={handleReverseVisual}
                          onPolyrhythm={handlePolyrhythm}
                          onFibonacci={handleFibonacci}
                          onEuclidean={handleEuclidean}
                          onPingPong={handlePingPong}
                          onGlitch={handleGlitch}
                          onStrobe={handleStrobe}
                          onVisualEcho={handleVisualEcho}
                          onConverge={handleConverge}
                          onSpiral={handleSpiral}
                          onBounce={handleBounce}
                          onChaos={handleChaos}
                        />
                        <ChannelColorPicker
                          currentColor={channel.color}
                          onColorSelect={(color) => setChannelColor(idx, color)}
                        />
                        <button
                          onClick={() => toggleChannelMute(idx)}
                          className={`p-1 rounded transition-colors ${
                            channel.muted
                              ? 'bg-accent-error/20 text-accent-error'
                              : 'text-text-muted hover:text-text-primary hover:bg-dark-bgHover'
                          }`}
                          title={channel.muted ? 'Unmute' : 'Mute'}
                        >
                          {channel.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                        </button>
                        <button
                          onClick={() => toggleChannelSolo(idx)}
                          className={`p-1 rounded transition-colors ${
                            channel.solo
                              ? 'bg-accent-primary/20 text-accent-primary'
                              : 'text-text-muted hover:text-text-primary hover:bg-dark-bgHover'
                          }`}
                          title={channel.solo ? 'Unsolo' : 'Solo'}
                        >
                          <Headphones size={12} />
                        </button>
                        <button
                          onClick={() => _toggleChannelCollapse(idx)}
                          className="p-1 rounded transition-colors text-text-muted hover:text-text-primary hover:bg-dark-bgHover"
                          title="Collapse Channel"
                        >
                          <ChevronLeft size={12} />
                        </button>
                      </div>
                      )}

                      {/* Collapsed state: show channel number and expand button */}
                      {isCollapsed && (
                        <div className="flex items-center justify-between w-full px-1">
                          <span
                            className="font-bold font-mono text-[9px] flex-shrink-0 opacity-80"
                            style={{ color: channel.color || 'var(--color-accent)' }}
                          >
                            {(idx + 1).toString().padStart(2, '0')}
                          </span>
                          <button
                            onClick={() => _toggleChannelCollapse(idx)}
                            className="p-0.5 rounded transition-colors text-text-muted hover:text-text-primary hover:bg-dark-bgHover"
                            title="Expand Channel"
                          >
                            <ChevronRight size={10} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Add channel button */}
                {pattern.channels.length < 16 && (
                  <button
                    onClick={addChannel}
                    className="flex-shrink-0 w-12 flex items-center justify-center border-r border-dark-border
                      text-text-muted hover:text-accent-primary hover:bg-dark-bgHover transition-colors"
                    title="Add Channel"
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
            </div>
                      </div>
                    </div>
                  </>
                )}
          
                {/* Canvas Pattern Grid */}
                <div
                  ref={containerRef}
                  className="flex-1 relative bg-dark-bg overflow-hidden touch-none focus:outline-none focus:ring-1 focus:ring-accent-primary/30"

        style={{ minHeight: 200 }}
        tabIndex={0}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        {...patternGestures}
      >
        {trackerVisualBg && (
          <TrackerVisualBackground width={dimensions.width} height={dimensions.height} />
        )}
        {/* Canvas is created imperatively in useEffect to support OffscreenCanvas transfer */}

        {/* Automation Lanes Overlay */}
        {pattern && (
          <>
            <AutomationLanes
              key={`automation-${pattern.id}`}
              patternId={pattern.id}
              patternLength={pattern.length}
              rowHeight={ROW_HEIGHT}
              channelCount={pattern.channels.length}
              channelOffsets={channelOffsets}
              channelWidths={channelWidths}
              rowNumWidth={LINE_NUMBER_WIDTH}
              scrollOffset={scrollYRef.current}
              visibleStart={visibleStartRef.current}
              /* parameter is resolved per-channel from useAutomationStore.channelLanes */
              prevPatternId={showGhostPatterns ? (currentPatternIndex > 0 ? patterns[currentPatternIndex - 1]?.id : (patterns.length > 1 ? patterns[patterns.length - 1]?.id : undefined)) : undefined}
              prevPatternLength={showGhostPatterns ? (currentPatternIndex > 0 ? patterns[currentPatternIndex - 1]?.length : (patterns.length > 1 ? patterns[patterns.length - 1]?.length : undefined)) : undefined}
              nextPatternId={showGhostPatterns ? (currentPatternIndex < patterns.length - 1 ? patterns[currentPatternIndex + 1]?.id : (patterns.length > 1 ? patterns[0]?.id : undefined)) : undefined}
              nextPatternLength={showGhostPatterns ? (currentPatternIndex < patterns.length - 1 ? patterns[currentPatternIndex + 1]?.length : (patterns.length > 1 ? patterns[0]?.length : undefined)) : undefined}
            />
            {/* Internal Macro Columns Overlay (only when visible) */}
            <div
              ref={macroOverlayRef}
              style={{
                position: 'absolute',
                top: scrollYRef.current,
                left: 0,
                right: 0,
                height: pattern.length * ROW_HEIGHT,
                pointerEvents: 'none',
                transform: `translateX(${-scrollLeft}px)`
              }}
            >
              <MacroLanes
                pattern={pattern}
                rowHeight={ROW_HEIGHT}
                channelCount={pattern.channels.length}
                channelOffsets={channelOffsets}
                channelWidths={channelWidths}
                rowNumWidth={LINE_NUMBER_WIDTH}
              />
            </div>
          </>
        )}

        {/* Peer cursor overlay — shown in 'shared' collab mode, cell block at peer's channel */}
        <div
          ref={peerCursorDivRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: CHAR_WIDTH * 3 + 4,
            height: ROW_HEIGHT,
            display: 'none',
            pointerEvents: 'none',
            backgroundColor: 'rgba(168, 85, 247, 0.55)',
            zIndex: 25,
          }}
        />

        {/* Peer selection rectangle */}
        <div
          ref={peerSelectionDivRef}
          style={{
            position: 'absolute', display: 'none', pointerEvents: 'none', zIndex: 20,
            backgroundColor: 'rgba(168, 85, 247, 0.12)',
            border: '1px solid rgba(168, 85, 247, 0.45)',
            boxSizing: 'border-box',
          }}
        />

        {/* VU Meters overlay - moved AFTER canvas and added z-30 */}
        <div
          className="absolute right-0 pointer-events-none z-30 overflow-hidden"
          style={{ top: 0, left: LINE_NUMBER_WIDTH, height: `calc(50% - ${ROW_HEIGHT / 2}px)` }}
        >
          <ChannelVUMeters 
            channelOffsets={channelOffsets} 
            channelWidths={channelWidths} 
            scrollLeft={scrollLeft} 
          />
        </div>

        {/* Cell context menu */}
        <CellContextMenu
          isOpen={cellContextMenu.isOpen}
          position={cellContextMenu.position}
          onClose={cellContextMenu.closeMenu}
          channelIndex={cellContextMenu.cellInfo?.channelIndex ?? 0}
          rowIndex={cellContextMenu.cellInfo?.rowIndex ?? 0}
          onOpenParameterEditor={handleOpenParameterEditor}
          onReverseVisual={() => handleReverseVisual(cellContextMenu.cellInfo?.channelIndex ?? 0)}
          onPolyrhythm={() => handlePolyrhythm(cellContextMenu.cellInfo?.channelIndex ?? 0)}
          onFibonacci={() => handleFibonacci(cellContextMenu.cellInfo?.channelIndex ?? 0)}
          onEuclidean={() => handleEuclidean(cellContextMenu.cellInfo?.channelIndex ?? 0)}
          onPingPong={() => handlePingPong(cellContextMenu.cellInfo?.channelIndex ?? 0)}
          onGlitch={() => handleGlitch(cellContextMenu.cellInfo?.channelIndex ?? 0)}
          onStrobe={() => handleStrobe(cellContextMenu.cellInfo?.channelIndex ?? 0)}
          onVisualEcho={() => handleVisualEcho(cellContextMenu.cellInfo?.channelIndex ?? 0)}
          onConverge={() => handleConverge(cellContextMenu.cellInfo?.channelIndex ?? 0)}
          onSpiral={() => handleSpiral(cellContextMenu.cellInfo?.channelIndex ?? 0)}
          onBounce={() => handleBounce(cellContextMenu.cellInfo?.channelIndex ?? 0)}
          onChaos={() => handleChaos(cellContextMenu.cellInfo?.channelIndex ?? 0)}
        />

        {/* Visual Parameter Editor */}
        {parameterEditorState?.isOpen && (
          <ParameterEditor
            onClose={() => setParameterEditorState(null)}
            channelIndex={parameterEditorState.channelIndex}
            startRow={parameterEditorState.startRow}
            endRow={parameterEditorState.endRow}
            field={parameterEditorState.field}
          />
        )}
      </div>
    </div>
  );
});

export default PatternEditorCanvas;
