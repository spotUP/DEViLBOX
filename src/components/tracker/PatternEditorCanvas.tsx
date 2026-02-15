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
import { getTrackerReplayer, type DisplayState } from '@engine/TrackerReplayer';
import * as Tone from 'tone';
import { useBDAnimations } from '@hooks/tracker/useBDAnimations';
import type { CursorPosition } from '@typedefs';

const ROW_HEIGHT = 24;
const CHAR_WIDTH = 10;
const LINE_NUMBER_WIDTH = 40;
// Channel width is computed dynamically in render() based on acid/prob columns

// XM note names
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteToString(note: number): string {
  if (note === 0) return '---';
  if (note === 97) return 'OFF';
  const noteIndex = (note - 1) % 12;
  const octave = Math.floor((note - 1) / 12);
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

function hexByte(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

interface NoteCache {
  [key: string]: HTMLCanvasElement;
}

interface ChannelTrigger {
  level: number;
  triggered: boolean;
}

interface PatternEditorCanvasProps {
  onAcidGenerator?: (channelIndex: number) => void;
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
  visibleChannels: _visibleChannels, // TODO: Implement mobile channel limiting
  startChannel: _startChannel = 0, // TODO: Implement mobile channel offset
  onSwipeLeft: _onSwipeLeft, // Reserved - using internal handler instead
  onSwipeRight: _onSwipeRight, // Reserved - using internal handler instead
  onSwipeUp: _onSwipeUp, // Reserved for future use - currently allows native scroll
  onSwipeDown: _onSwipeDown, // Reserved for future use - currently allows native scroll
}) => {
  const { isMobile } = useResponsiveSafe();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [visibleStart, setVisibleStart] = useState(0);
  const [renderCounter, setRenderCounter] = useState(0);
  
  // Cell context menu
  const cellContextMenu = useCellContextMenu();

  // PERF: Use ref instead of state for channel triggers to avoid re-renders
  const channelTriggersRef = useRef<ChannelTrigger[]>([]);

  // Caches for rendered elements (Bassoon Tracker style)
  const noteCacheRef = useRef<NoteCache>({});
  const paramCacheRef = useRef<NoteCache>({});
  const lineNumberCacheRef = useRef<NoteCache>({});

  // Animation frame ref for smooth updates
  const rafRef = useRef<number | null>(null);

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
    showGhostPatterns
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
  })));

  const { instruments } = useInstrumentStore(useShallow((state) => ({
    instruments: state.instruments
  })));

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
    
    let acid = false;
    let prob = false;
    
    // Scan channels for schema
    for (const channel of pattern.channels) {
      if (acid && prob) break;
      if (!acid && channel.instrumentId !== null) {
        const inst = instruments.find(i => i.id === channel.instrumentId);
        if (inst?.synthType === 'TB303' || inst?.synthType === 'Buzz3o3') {
          acid = true;
        }
      }
      const cell = channel.rows[0];
      if (cell) {
        if (cell.flag1 !== undefined || cell.flag2 !== undefined) acid = true;
        if (cell.probability !== undefined) prob = true;
      }
    }

    const paramWidth = CHAR_WIDTH * 10 + 16
      + (acid ? CHAR_WIDTH * 2 + 8 : 0)
      + (prob ? CHAR_WIDTH * 2 + 4 : 0)
      + CHAR_WIDTH * 2 + 4; 
    const normalW = noteWidth + paramWidth + 60; // Increased padding for wider header (was 40)
    const collapsedW = 12;

    const offsets: number[] = [];
    const widths: number[] = [];
    let currentX = LINE_NUMBER_WIDTH;
    
    for (let ch = 0; ch < nc; ch++) {
      const isCollapsed = pattern.channels[ch]?.collapsed;
      const chWidth = isCollapsed ? collapsedW : normalW;
      offsets.push(currentX);
      widths.push(chWidth);
      currentX += chWidth;
    }

    return {
      numChannels: nc,
      channelOffsets: offsets,
      channelWidths: widths,
      totalChannelsWidth: currentX - LINE_NUMBER_WIDTH
    };
  }, [pattern, instruments]);

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
  const [dragOverCell, setDragOverCell] = useState<{ channelIndex: number; rowIndex: number } | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const cell = getCellFromCoords(e.clientX, e.clientY);
    if (cell) {
      setDragOverCell({ channelIndex: cell.channelIndex, rowIndex: cell.rowIndex });
      e.dataTransfer.dropEffect = 'copy';
    } else {
      setDragOverCell(null);
    }
  }, [getCellFromCoords]);

  const handleDragLeave = useCallback(() => {
    setDragOverCell(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCell(null);

    const cell = getCellFromCoords(e.clientX, e.clientY);
    if (!cell) return;

    try {
      const dragData = e.dataTransfer.getData('application/x-devilbox-instrument');
      if (dragData) {
        const { id } = JSON.parse(dragData);
        // Set instrument at this cell
        useTrackerStore.getState().setCell(cell.channelIndex, cell.rowIndex, { 
          instrument: id 
        });
        haptics.success();
      }
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

  // Audio-synced display state ref (BassoonTracker pattern)
  // This stores the last state retrieved from TrackerReplayer.getStateAtTime()
  const lastAudioStateRef = useRef<DisplayState | null>(null);
  // Fallback refs for when audio sync is not available
  const lastRowValueRef = useRef<number>(-1);
  const lastSmoothOffsetRef = useRef<number>(0);

  // Track theme for cache invalidation
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const getCurrentTheme = useThemeStore((state) => state.getCurrentTheme);
  const currentTheme = getCurrentTheme();
  const lastThemeRef = useRef(currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

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

  // Clear caches when theme changes
  useEffect(() => {
    if (lastThemeRef.current !== currentThemeId) {
      noteCacheRef.current = {};
      paramCacheRef.current = {};
      lineNumberCacheRef.current = {};
      lastThemeRef.current = currentThemeId;
    }
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
      setScrollLeft(targetScroll);
    }
  }, [isMobile, mobileChannelIndex, pattern]);

  // Colors based on theme
  const colors = useMemo(() => ({
    bg: '#0a0a0b',
    rowNormal: '#0d0d0e',
    rowHighlight: '#111113', // More subtle highlight (was #151518)
    centerLine: currentTheme.colors.accentGlow, // Use theme accent with transparency
    cursor: currentTheme.colors.accent, // Use theme accent color
    cursorBg: currentTheme.colors.accentGlow, // Use theme accent glow (transparent)
    text: '#e0e0e0',
    textMuted: '#505050',
    textNote: '#909090',  // Grey by default, flashes white on current row
    textNoteActive: '#ffffff',  // White for currently playing notes
    textInstrument: '#4ade80',
    textVolume: '#60a5fa',
    textEffect: '#f97316',
    border: '#252530',
    lineNumber: '#707070',
    lineNumberHighlight: '#f97316',
    selection: 'rgba(59, 130, 246, 0.3)', // Semi-transparent blue for selection
  }), [isCyanTheme]);

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

  // Get the note canvas from cache or create it
  const getNoteCanvas = useCallback((note: number, isActive = false): HTMLCanvasElement => {
    const key = `${note}-${isActive ? 'a' : 'n'}`;
    if (noteCacheRef.current[key]) {
      return noteCacheRef.current[key];
    }

    const canvas = document.createElement('canvas');
    canvas.width = CHAR_WIDTH * 3 + 4;
    canvas.height = ROW_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    ctx.font = '14px "JetBrains Mono", "Fira Code", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = note === 0 ? colors.textMuted :
                    note === 97 ? colors.textEffect :
                    (isActive ? colors.textNoteActive : colors.textNote);
    ctx.fillText(noteToString(note), 0, ROW_HEIGHT / 2);

    noteCacheRef.current[key] = canvas;
    return canvas;
  }, [colors.textMuted, colors.textEffect, colors.textNote, colors.textNoteActive]);

  // Get parameter canvas from cache or create it
  const getParamCanvas = useCallback((
    instrument: number,
    volume: number,
    effTyp: number,
    eff: number,
    effTyp2: number,
    eff2: number,
    flag1?: number,
    flag2?: number,
    probability?: number,
    blankEmpty?: boolean
  ): HTMLCanvasElement => {
    const key = `${instrument}-${volume}-${effTyp}-${eff}-${effTyp2}-${eff2}-f1${flag1 ?? 'x'}-f2${flag2 ?? 'x'}-p${probability ?? 'x'}-${blankEmpty ? 'B' : ''}`;
    if (paramCacheRef.current[key]) {
      return paramCacheRef.current[key];
    }

    // Flag columns (flag1/flag2) - 2 flexible columns that can be accent or slide
    const hasFlagColumns = flag1 !== undefined || flag2 !== undefined;
    const hasProb = probability !== undefined && probability > 0;
    const canvas = document.createElement('canvas');
    // Base: inst(2)+4 vol(2)+4 eff(3)+4 eff2(3)+4 = CW*10+16
    canvas.width = CHAR_WIDTH * 10 + 16 + (hasFlagColumns ? CHAR_WIDTH * 2 + 8 : 0) + (hasProb ? CHAR_WIDTH * 2 + 4 : 0);
    canvas.height = ROW_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    ctx.font = '14px "JetBrains Mono", "Fira Code", monospace';
    ctx.textBaseline = 'middle';

    let x = 0;
    const y = ROW_HEIGHT / 2;

    // Instrument (2 hex digits)
    if (instrument !== 0) {
      ctx.fillStyle = colors.textInstrument;
      ctx.fillText(hexByte(instrument), x, y);
    } else if (!blankEmpty) {
      ctx.fillStyle = colors.textMuted;
      ctx.fillText('..', x, y);
    }
    x += CHAR_WIDTH * 2 + 4;

    // Volume (2 hex digits)
    const hasVolume = volume >= 0x10 && volume <= 0x50;
    if (hasVolume) {
      ctx.fillStyle = colors.textVolume;
      ctx.fillText(hexByte(volume), x, y);
    } else if (!blankEmpty) {
      ctx.fillStyle = colors.textMuted;
      ctx.fillText('..', x, y);
    }
    x += CHAR_WIDTH * 2 + 4;

    // Effect 1 (3 hex digits: type + param)
    const hasEffect = effTyp !== 0 || eff !== 0;
    if (hasEffect) {
      ctx.fillStyle = colors.textEffect;
      ctx.fillText(effTyp.toString(16).toUpperCase() + hexByte(eff), x, y);
    } else if (!blankEmpty) {
      ctx.fillStyle = colors.textMuted;
      ctx.fillText('...', x, y);
    }
    x += CHAR_WIDTH * 3 + 4;

    // Effect 2 (3 hex digits: type + param)
    const hasEffect2 = effTyp2 !== 0 || eff2 !== 0;
    if (hasEffect2) {
      ctx.fillStyle = colors.textEffect; // Same color as effect1
      ctx.fillText(effTyp2.toString(16).toUpperCase() + hexByte(eff2), x, y);
    } else if (!blankEmpty) {
      ctx.fillStyle = colors.textMuted;
      ctx.fillText('...', x, y);
    }
    x += CHAR_WIDTH * 3 + 4;

    // Flag columns (if present) - can be accent (1), slide (2), mute (3), hammer (4)
    if (hasFlagColumns) {
      // Flag 1 - yellow/orange for accent, cyan for slide, yellow for mute, cyan for hammer
      if (flag1 === 1) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillText('A', x, y);
      } else if (flag1 === 2) {
        ctx.fillStyle = '#06b6d4';
        ctx.fillText('S', x, y);
      } else if (flag1 === 3) {
        ctx.fillStyle = '#facc15'; // yellow-400 for mute
        ctx.fillText('M', x, y);
      } else if (flag1 === 4) {
        ctx.fillStyle = '#22d3ee'; // cyan-400 for hammer
        ctx.fillText('H', x, y);
      } else if (!blankEmpty) {
        ctx.fillStyle = colors.textMuted;
        ctx.fillText('.', x, y);
      }
      x += CHAR_WIDTH + 4;

      // Flag 2 - yellow/orange for accent, cyan for slide, yellow for mute, cyan for hammer
      if (flag2 === 1) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillText('A', x, y);
      } else if (flag2 === 2) {
        ctx.fillStyle = '#06b6d4';
        ctx.fillText('S', x, y);
      } else if (flag2 === 3) {
        ctx.fillStyle = '#facc15'; // yellow-400 for mute
        ctx.fillText('M', x, y);
      } else if (flag2 === 4) {
        ctx.fillStyle = '#22d3ee'; // cyan-400 for hammer
        ctx.fillText('H', x, y);
      } else if (!blankEmpty) {
        ctx.fillStyle = colors.textMuted;
        ctx.fillText('.', x, y);
      }
      x += CHAR_WIDTH + 4;
    }

    // Probability column (if present)
    if (hasProb) {
      const clampedProb = Math.min(99, Math.max(0, probability!));
      const probColor = clampedProb >= 75 ? '#4ade80' : clampedProb >= 50 ? '#facc15' : clampedProb >= 25 ? '#fb923c' : '#f87171';
      ctx.fillStyle = probColor;
      ctx.fillText(clampedProb.toString(10).padStart(2, '0'), x, y);
    }

    paramCacheRef.current[key] = canvas;
    return canvas;
  }, [colors.textMuted, colors.textInstrument, colors.textVolume, colors.textEffect]);

  // Get line number canvas from cache or create it
  const getLineNumberCanvas = useCallback((lineNum: number, useHex: boolean): HTMLCanvasElement => {
    const isHighlight = lineNum % 4 === 0;
    const key = `${lineNum}-${useHex}-${isHighlight}`;
    if (lineNumberCacheRef.current[key]) {
      return lineNumberCacheRef.current[key];
    }

    const canvas = document.createElement('canvas');
    canvas.width = LINE_NUMBER_WIDTH;
    canvas.height = ROW_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    ctx.font = isHighlight ? 'bold 12px "JetBrains Mono", monospace' : '12px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = isHighlight ? colors.lineNumberHighlight : colors.lineNumber;

    const text = useHex
      ? lineNum.toString(16).toUpperCase().padStart(2, '0')
      : lineNum.toString(10).padStart(2, '0');
    ctx.fillText(text, LINE_NUMBER_WIDTH / 2, ROW_HEIGHT / 2);

    lineNumberCacheRef.current[key] = canvas;
    return canvas;
  }, [colors.lineNumber, colors.lineNumberHighlight]);

  // Main render function
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get state directly (no React re-render)
    const state = useTrackerStore.getState();
    const transportState = useTransportStore.getState();
    const uiState = useUIStore.getState();

    const cursor = state.cursor;
    const isPlaying = transportState.isPlaying;
    const useHex = uiState.useHexNumbers;
    const blankEmpty = uiState.blankEmptyCells;
    const audioSpeed = transportState.speed;
    const audioBpm = transportState.bpm;
    const smoothScrolling = transportState.smoothScrolling;
    const showGhostPatterns = state.showGhostPatterns;

    const { width, height } = dimensions;

    // Audio-synced scrolling (BassoonTracker pattern)
    // Get state from audio context time, NOT from wall-clock or store updates
    let currentRow: number;
    let smoothOffset = 0;
    let activePatternIndex = state.currentPatternIndex;

    if (isPlaying) {
      const replayer = getTrackerReplayer();

      // Get current Web Audio time with 10ms lookahead for latency compensation
      const audioTime = Tone.now() + 0.01;
      const audioState = replayer.getStateAtTime(audioTime);

      if (audioState) {
        lastAudioStateRef.current = audioState;
        currentRow = audioState.row;
        // CRITICAL: Use pattern index from audio state, not store!
        // This ensures visual matches audio during pattern jumps, loops, and reloads.
        activePatternIndex = audioState.pattern;

        if (smoothScrolling) {
          // ACCURATE SMOOTH SCROLLING:
          // The replayer provides the exact 'time' when each row was triggered.
          // To calculate progress, we need the start time of the NEXT row.
          const nextState = replayer.getStateAtTime(audioTime + 0.5, true); // Peek ahead using the new parameter
          
          let effectiveRowDuration: number;
          if (nextState && nextState.row !== audioState.row) {
            // We have the next row start time, so we know exactly how long this row lasted
            effectiveRowDuration = nextState.time - audioState.time;
          } else {
            // Fallback: use grid duration
            effectiveRowDuration = (2.5 / audioBpm) * audioSpeed;
          }

          // Calculate progress (0 to 1) based on actual duration
          const timeSinceRowStart = audioTime - audioState.time;
          const progress = Math.min(Math.max(timeSinceRowStart / effectiveRowDuration, 0), 1);
          smoothOffset = progress * ROW_HEIGHT;
        } else {
          smoothOffset = 0;
        }

        // Store for fallback
        lastRowValueRef.current = currentRow;
        lastSmoothOffsetRef.current = smoothOffset;
      } else {
        // Fallback to store state if no audio state available yet
        currentRow = transportState.currentRow;
      }
    } else {
      // Not playing - use cursor position
      currentRow = cursor.rowIndex;
      // Reset all tracking
      lastAudioStateRef.current = null;
      lastRowValueRef.current = -1;
      lastSmoothOffsetRef.current = 0;
    }

    // Use the audio-synced pattern index for visual display
    const pattern = state.patterns[activePatternIndex];
    
    if (!pattern) {
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);
      ctx.fillStyle = colors.textMuted;
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No pattern loaded', dimensions.width / 2, dimensions.height / 2);
      return;
    }

    const patternLength = pattern.length;

    // Calculate visible lines
    const visibleLines = Math.ceil(height / ROW_HEIGHT) + 2;
    const topLines = Math.floor(visibleLines / 2);
    const vStart = currentRow - topLines;
    const visibleEnd = vStart + visibleLines;

    // Center line position - apply smooth offset
    const centerLineTop = Math.floor(height / 2) - ROW_HEIGHT / 2;
    const baseY = centerLineTop - (topLines * ROW_HEIGHT) - smoothOffset;
    
    // Channel count is global across all patterns (enforced by addChannel/removeChannel)
    const numChannels = pattern.channels.length;
    
    // Update scroll position for AutomationLanes (throttled to avoid excessive re-renders)
    if (Math.abs(baseY - scrollY) > 0.5 || vStart !== visibleStart) {
      setScrollY(baseY);
      setVisibleStart(vStart);
      setRenderCounter(c => c + 1);
    }

    const noteWidth = CHAR_WIDTH * 3 + 4;

    // Clear canvas
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);

    // Draw rows
    const sel = state.selection;
    const hasSelection = !!sel;
    const minSelCh = hasSelection ? Math.min(sel.startChannel, sel.endChannel) : -1;
    const maxSelCh = hasSelection ? Math.max(sel.startChannel, sel.endChannel) : -1;
    const minSelRow = hasSelection ? Math.min(sel.startRow, sel.endRow) : -1;
    const maxSelRow = hasSelection ? Math.max(sel.startRow, sel.endRow) : -1;

    for (let i = visibleStart; i < visibleEnd; i++) {
      let rowIndex: number;
      let isGhostRow = false;
      let ghostPattern = null;
      
      if (isPlaying) {
        // During playback, show sequential flow through patterns
        // Use activePatternIndex (from audio state) instead of currentPatternIndex (from store)
        if (showGhostPatterns && i < 0) {
          // Previous pattern
          if (activePatternIndex > 0) {
            ghostPattern = patterns[activePatternIndex - 1];
            rowIndex = ghostPattern.length + i; // i is negative
            // Validate rowIndex is within pattern bounds
            if (rowIndex < 0 || rowIndex >= ghostPattern.length) {
              continue;
            }
            isGhostRow = true;
          } else if (patterns.length > 1) {
            // Wraparound to last pattern
            ghostPattern = patterns[patterns.length - 1];
            rowIndex = ghostPattern.length + i;
            // Validate rowIndex is within pattern bounds
            if (rowIndex < 0 || rowIndex >= ghostPattern.length) {
              continue;
            }
            isGhostRow = true;
          } else {
            continue;
          }
        } else if (showGhostPatterns && i >= patternLength) {
          // Next pattern
          if (activePatternIndex < patterns.length - 1) {
            ghostPattern = patterns[activePatternIndex + 1];
            rowIndex = i - patternLength;
            // Validate rowIndex is within pattern bounds
            if (rowIndex < 0 || rowIndex >= ghostPattern.length) {
              continue;
            }
            isGhostRow = true;
          } else if (patterns.length > 1) {
            // Wraparound to first pattern
            ghostPattern = patterns[0];
            rowIndex = i - patternLength;
            // Validate rowIndex is within pattern bounds
            if (rowIndex < 0 || rowIndex >= ghostPattern.length) {
              continue;
            }
            isGhostRow = true;
          } else {
            continue;
          }
        } else if (i < 0 || i >= patternLength) {
          // Ghost patterns disabled - skip out of range rows
          continue;
        } else {
          rowIndex = i;
        }
      } else {
        // Allow ghost rows from adjacent patterns in edit mode
        if (showGhostPatterns && i < 0) {
          // Previous pattern (with wraparound)
          if (currentPatternIndex > 0) {
            ghostPattern = patterns[currentPatternIndex - 1];
            rowIndex = ghostPattern.length + i; // i is negative, so this wraps
            // Validate rowIndex is within pattern bounds
            if (rowIndex < 0 || rowIndex >= ghostPattern.length) {
              continue;
            }
            isGhostRow = true;
          } else if (patterns.length > 1) {
            // Wraparound to last pattern
            ghostPattern = patterns[patterns.length - 1];
            rowIndex = ghostPattern.length + i; // i is negative, so this wraps
            // Validate rowIndex is within pattern bounds
            if (rowIndex < 0 || rowIndex >= ghostPattern.length) {
              continue;
            }
            isGhostRow = true;
          } else {
            continue; // Only one pattern
          }
        } else if (showGhostPatterns && i >= patternLength) {
          // Next pattern (with wraparound)
          if (currentPatternIndex < patterns.length - 1) {
            ghostPattern = patterns[currentPatternIndex + 1];
            rowIndex = i - patternLength;
            // Validate rowIndex is within pattern bounds
            if (rowIndex < 0 || rowIndex >= ghostPattern.length) {
              continue;
            }
            isGhostRow = true;
          } else if (patterns.length > 1) {
            // Wraparound to first pattern
            ghostPattern = patterns[0];
            rowIndex = i - patternLength;
            // Validate rowIndex is within pattern bounds
            if (rowIndex < 0 || rowIndex >= ghostPattern.length) {
              continue;
            }
            isGhostRow = true;
          } else {
            continue; // Only one pattern
          }
        } else if (i < 0 || i >= patternLength) {
          // Ghost patterns disabled - skip out of range rows
          continue;
        } else {
          rowIndex = i;
        }
      }

      const y = baseY + ((i - vStart) * ROW_HEIGHT);
      if (y < -ROW_HEIGHT || y > height + ROW_HEIGHT) continue;

      // Row background
      const isHighlight = rowIndex % 4 === 0;
      
      // Apply ghost opacity to background if needed
      if (isGhostRow) {
        ctx.globalAlpha = 0.35;
      }
      
      ctx.fillStyle = isHighlight ? colors.rowHighlight : colors.rowNormal;
      ctx.fillRect(0, y, width, ROW_HEIGHT);
      
      // Reset alpha for line number (so it's readable)
      if (isGhostRow) {
        ctx.globalAlpha = 1.0;
      }

      // Line number
      const lineNumCanvas = getLineNumberCanvas(rowIndex, useHex);
      ctx.drawImage(lineNumCanvas, 4, y);
      
      // Apply ghost opacity for content (not background/line numbers)
      if (isGhostRow) {
        ctx.globalAlpha = 0.35;
      }

      // Draw each channel (use ghost pattern if available)
      const sourcePattern = ghostPattern || pattern;
      for (let ch = 0; ch < numChannels; ch++) {
        const colX = channelOffsets[ch] - scrollLeft;
        const channelWidth = channelWidths[ch];
        const isCollapsed = pattern.channels[ch]?.collapsed;

        // Skip if outside visible area
        if (colX + channelWidth < 0 || colX > width) continue;

        const x = colX + 8;

        // Draw per-channel color tint on the column background
        const chColor = pattern.channels[ch]?.color;
        if (chColor) {
          const prevAlpha = ctx.globalAlpha;
          ctx.globalAlpha = isGhostRow ? 0.02 : (isHighlight ? 0.07 : 0.05);
          ctx.fillStyle = chColor;
          ctx.fillRect(colX, y, channelWidth, ROW_HEIGHT);
          ctx.globalAlpha = prevAlpha;
        }

        // Draw channel separator
        ctx.fillStyle = colors.border;
        ctx.fillRect(colX + channelWidth, y, 1, ROW_HEIGHT);

        // Colored left stripe for channel (matches header inset border)
        if (chColor) {
          const prevAlpha = ctx.globalAlpha;
          ctx.globalAlpha = isGhostRow ? 0.15 : 0.4;
          ctx.fillStyle = chColor;
          ctx.fillRect(colX, y, isCollapsed ? 4 : 2, ROW_HEIGHT);
          ctx.globalAlpha = prevAlpha;
        }

        // Skip content if collapsed
        if (isCollapsed) {
          // Draw shortName vertically if collapsed
          const shortName = pattern.channels[ch].shortName || `${ch + 1}`;
          ctx.fillStyle = chColor || colors.textMuted;
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.save();
          ctx.translate(colX + channelWidth / 2 + 2, y + ROW_HEIGHT / 2);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(shortName.substring(0, 2).toUpperCase(), 0, 3);
          ctx.restore();
          continue;
        }

        // Check if this channel exists in the source pattern (ghost patterns might have different channel counts)
        if (!sourcePattern.channels[ch]) {
          continue;
        }

        // Get cell from source pattern
        const cell = sourcePattern.channels[ch].rows[rowIndex];
        
        // Safety check: skip if row doesn't exist (can happen with ghost patterns of different lengths)
        if (!cell) {
          continue;
        }

        // Note - flash white on current playing row (but not ghost rows)
        const isCurrentPlayingRow = isPlaying && !isGhostRow && rowIndex === currentRow;
        const cellNote = cell.note || 0;
        // Blank empty cells: skip drawing "---" for note=0
        if (!blankEmpty || cellNote !== 0) {
          const noteCanvas = getNoteCanvas(cellNote, isCurrentPlayingRow && cellNote > 0);
          ctx.drawImage(noteCanvas, x, y);
        }

        // Parameters (including TB-303 accent/slide if present)
        const paramCanvas = getParamCanvas(
          cell.instrument || 0,
          cell.volume || 0,
          cell.effTyp || 0,
          cell.eff || 0,
          cell.effTyp2 || 0,
          cell.eff2 || 0,
          cell.flag1,
          cell.flag2,
          cell.probability,
          blankEmpty
        );
        ctx.drawImage(paramCanvas, x + noteWidth + 4, y);

        // Draw selection highlight
        if (hasSelection && !isGhostRow && ch >= minSelCh && ch <= maxSelCh && rowIndex >= minSelRow && rowIndex <= maxSelRow) {
          ctx.fillStyle = colors.selection;
          
          const isMinCh = ch === minSelCh;
          const isMaxCh = ch === maxSelCh;
          const isSingleCh = isMinCh && isMaxCh;
          
          // If selecting across multiple channels, standard behavior is to select ALL columns
          // for the "inner" channels. For start/end channels, we could be specific, 
          // but for now let's just use the columnTypes if it's a single channel selection.
          if (isSingleCh && sel.columnTypes && sel.columnTypes.length > 0 && sel.columnTypes.length < 9) {
            const paramBase = 8 + noteWidth + 4;
            sel.columnTypes.forEach(t => {
              let cX = 0;
              let cW = 0;
              
              if (t === 'note') {
                cX = 8;
                cW = noteWidth;
              } else {
                cX = paramBase;
                if (t === 'instrument') {
                  cW = CHAR_WIDTH * 2 + 4;
                } else if (t === 'volume') {
                  cX += CHAR_WIDTH * 2 + 4;
                  cW = CHAR_WIDTH * 2 + 4;
                } else if (t === 'effTyp' || t === 'effParam') {
                  cX += (CHAR_WIDTH * 2 + 4) * 2;
                  cW = CHAR_WIDTH * 3 + 4;
                } else if (t === 'effTyp2' || t === 'effParam2') {
                  cX += (CHAR_WIDTH * 2 + 4) * 2 + (CHAR_WIDTH * 3 + 4);
                  cW = CHAR_WIDTH * 3 + 4;
                } else if (t === 'flag1') {
                  cX += (CHAR_WIDTH * 2 + 4) * 2 + (CHAR_WIDTH * 3 + 4) * 2;
                  cW = CHAR_WIDTH + 4;
                } else if (t === 'flag2') {
                  cX += (CHAR_WIDTH * 2 + 4) * 2 + (CHAR_WIDTH * 3 + 4) * 2 + (CHAR_WIDTH + 4);
                  cW = CHAR_WIDTH + 4;
                } else if (t === 'probability') {
                  cX += (CHAR_WIDTH * 2 + 4) * 2 + (CHAR_WIDTH * 3 + 4) * 2 + (CHAR_WIDTH + 4) * 2;
                  cW = CHAR_WIDTH * 2 + 4;
                }
              }
              if (cW > 0) ctx.fillRect(colX + cX, y, cW, ROW_HEIGHT);
            });
          } else {
            // Full channel highlight
            ctx.fillRect(colX, y, channelWidth, ROW_HEIGHT);
          }
        }

        // Draw drag-over highlight (breadcrumb)
        if (dragOverCell && !isGhostRow && ch === dragOverCell.channelIndex && rowIndex === dragOverCell.rowIndex) {
          ctx.fillStyle = currentTheme.colors.accent + '66'; // 40% opacity accent
          ctx.fillRect(colX, y, channelWidth, ROW_HEIGHT);
          // Add a border to make it pop
          ctx.strokeStyle = currentTheme.colors.accent;
          ctx.lineWidth = 1;
          ctx.strokeRect(colX + 0.5, y + 0.5, channelWidth - 1, ROW_HEIGHT - 1);
        }
      }
      
      // Reset alpha after ghost row
      if (isGhostRow) {
        ctx.globalAlpha = 1.0;
      }
    }

    // Draw center line highlight
    ctx.fillStyle = colors.centerLine;
    ctx.fillRect(0, centerLineTop, width, ROW_HEIGHT);

    // Draw cursor — visible in all modes with mode-dependent color
    // FT2: Each digit is a separate cursor stop, always CHAR_WIDTH wide (except note)
    if (!pattern.channels[cursor.channelIndex]?.collapsed) {
      const cursorX = channelOffsets[cursor.channelIndex] + 8 - scrollLeft;
      let cursorOffsetX = 0;
      let caretWidth = CHAR_WIDTH; // Single char width for all except note

      // Param canvas layout offsets (matches getParamCanvas layout exactly):
      // inst(2) +4gap  vol(2) +4gap  eff(3) +4gap  eff2(3) +4gap  [accent +4gap  slide +4gap]  [prob(2)]
      const paramBase = noteWidth + 4;
      // Fixed column positions
      const instOff = 0;
      const volOff = CHAR_WIDTH * 2 + 4;
      const eff1Off = CHAR_WIDTH * 4 + 8;
      const eff2Off = CHAR_WIDTH * 7 + 12;
      
      // Current channel's schema for cursor positioning
      const cellForCursor = pattern.channels[cursor.channelIndex]?.rows[0];
      const hasAcidC = cellForCursor?.flag1 !== undefined || cellForCursor?.flag2 !== undefined;
      
      // Optional column positions depend on which columns exist
      const acidOff = CHAR_WIDTH * 10 + 16;
      const probOff = acidOff + (hasAcidC ? CHAR_WIDTH * 2 + 8 : 0);

      switch (cursor.columnType) {
        case 'note':
          caretWidth = noteWidth;
          break;
        case 'instrument':
          cursorOffsetX = paramBase + instOff + cursor.digitIndex * CHAR_WIDTH;
          break;
        case 'volume':
          cursorOffsetX = paramBase + volOff + cursor.digitIndex * CHAR_WIDTH;
          break;
        case 'effTyp':
          cursorOffsetX = paramBase + eff1Off;
          break;
        case 'effParam':
          cursorOffsetX = paramBase + eff1Off + CHAR_WIDTH + cursor.digitIndex * CHAR_WIDTH;
          break;
        case 'effTyp2':
          cursorOffsetX = paramBase + eff2Off;
          break;
        case 'effParam2':
          cursorOffsetX = paramBase + eff2Off + CHAR_WIDTH + cursor.digitIndex * CHAR_WIDTH;
          break;
        case 'flag1':
          cursorOffsetX = paramBase + acidOff;
          break;
        case 'flag2':
          cursorOffsetX = paramBase + acidOff + CHAR_WIDTH + 4;
          break;
        case 'probability':
          cursorOffsetX = paramBase + probOff + cursor.digitIndex * CHAR_WIDTH;
          break;
        default:
          cursorOffsetX = paramBase + eff1Off;
          break;
      }

      // Mode-dependent caret color
      const isRecording = state.recordMode;
      const isPlayingCaret = transportState.isPlaying;
      let caretBg: string;
      if (isRecording) {
        caretBg = currentTheme.colors.accent; // Theme accent for record mode
      } else if (isPlayingCaret) {
        caretBg = currentTheme.colors.accentSecondary; // Secondary accent for playback
      } else {
        caretBg = currentTheme.colors.accent; // Theme accent for idle
      }

      // Caret dimensions: same height as the row highlight bar
      const caretH = ROW_HEIGHT;
      const caretY = centerLineTop;
      const caretX = cursorX + cursorOffsetX;

      // Clear any existing content (antialiased text edges bleed through otherwise)
      ctx.clearRect(caretX, caretY, caretWidth, caretH);
      // Draw solid caret background (inverted style)
      ctx.fillStyle = caretBg;
      ctx.fillRect(caretX, caretY, caretWidth, caretH);

      // Extract and redraw the character(s) under the cursor in white (inverted text)
      const cursorRow = isPlaying ? currentRow : cursor.rowIndex;
      const cell = pattern.channels[cursor.channelIndex]?.rows[cursorRow];
      if (cell) {
        let charStr = '';
        const col = cursor.columnType;
        const di = cursor.digitIndex;

        if (col === 'note') {
          charStr = noteToString(cell.note ?? 0);
        } else if (col === 'instrument') {
          const instStr = hexByte(cell.instrument ?? 0);
          charStr = (cell.instrument ?? 0) === 0 ? '..' : instStr;
          charStr = charStr[di] ?? '.';
        } else if (col === 'volume') {
          const vol = cell.volume ?? 0;
          const hasVol = vol >= 0x10 && vol <= 0x50;
          const volStr = hasVol ? hexByte(vol) : '..';
          charStr = volStr[di] ?? '.';
        } else if (col === 'effTyp') {
          const et = cell.effTyp ?? 0;
          const ep = cell.eff ?? 0;
          charStr = (et !== 0 || ep !== 0) ? et.toString(16).toUpperCase() : '.';
        } else if (col === 'effParam') {
          const et = cell.effTyp ?? 0;
          const ep = cell.eff ?? 0;
          const effStr = (et !== 0 || ep !== 0) ? hexByte(ep) : '..';
          charStr = effStr[di] ?? '.';
        } else if (col === 'effTyp2') {
          const et2 = cell.effTyp2 ?? 0;
          const ep2 = cell.eff2 ?? 0;
          charStr = (et2 !== 0 || ep2 !== 0) ? et2.toString(16).toUpperCase() : '.';
        } else if (col === 'effParam2') {
          const et2 = cell.effTyp2 ?? 0;
          const ep2 = cell.eff2 ?? 0;
          const effStr = (et2 !== 0 || ep2 !== 0) ? hexByte(ep2) : '..';
          charStr = effStr[di] ?? '.';
        } else if (col === 'flag1') {
          charStr = cell.flag1 === 1 ? 'A' : cell.flag1 === 2 ? 'S' : '.';
        } else if (col === 'flag2') {
          charStr = cell.flag2 === 1 ? 'A' : cell.flag2 === 2 ? 'S' : '.';
        } else if (col === 'probability') {
          const prob = cell.probability ?? 0;
          const probStr = prob > 0 ? prob.toString(10).padStart(2, '0') : '..';
          charStr = probStr[di] ?? '.';
        }

        // Draw inverted text (white on colored background)
        ctx.font = '14px "JetBrains Mono", "Fira Code", monospace';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(charStr, caretX, caretY + caretH / 2);
      }
    }
  }, [dimensions, colors, getNoteCanvas, getParamCanvas, getLineNumberCanvas, scrollLeft, isCyanTheme, visibleStart, instruments, currentPatternIndex, patterns, scrollY, channelOffsets, channelWidths, numChannels]);

  // Ref to keep render callback up to date for the animation loop
  const renderRef = useRef(render);
  useEffect(() => { renderRef.current = render; }, [render]);

  // Animation loop - unlocked framerate for maximum smoothness
  // Defined inside effect to avoid self-referencing
  useEffect(() => {
    const tick = () => {
      renderRef.current();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

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

  // Update canvas size when dimensions change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    // Clear caches when size changes
    noteCacheRef.current = {};
    paramCacheRef.current = {};
    lineNumberCacheRef.current = {};
  }, [dimensions]);

  // Reset horizontal scroll when all channels fit in viewport
  useEffect(() => {
    if (allChannelsFit && scrollLeft > 0) {
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
        // Horizontal scroll - scroll channels (only if they don't all fit)
        // Use totalChannelsWidth from useMemo for consistency
        const maxScroll = Math.max(0, LINE_NUMBER_WIDTH + totalChannelsWidth - container.clientWidth);

        if (maxScroll > 0) {
          const newScrollLeft = Math.max(0, Math.min(maxScroll, scrollLeft + e.deltaX));
          setScrollLeft(newScrollLeft);
          if (headerScrollRef.current) {
            headerScrollRef.current.scrollLeft = newScrollLeft;
          }
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [scrollLeft, totalChannelsWidth, dimensions.width]);

  // Handle header scroll sync
  const handleHeaderScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
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
        <div className="flex-shrink-0 bg-dark-bgTertiary border-b border-dark-border z-20 relative h-[37px]">
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
              className={`${allChannelsFit ? 'overflow-x-hidden' : 'overflow-x-auto'} scrollbar-hidden flex-1`}
              data-vu-scroll
            >
              <div className="flex" style={{ width: totalChannelsWidth }}>
                {pattern.channels.map((channel, idx) => {
                  // Trigger levels are animation-driven via RAF; ChannelVUMeter is disabled
                  const trigger = { level: 0, triggered: false };
                  const channelWidth = channelWidths[idx];
                  
                  return (
                    <div
                      key={channel.id}
                      className={`flex-shrink-0 flex items-center justify-between gap-1 px-2 py-1
                        border-r border-dark-border transition-colors relative
                        ${channel.muted ? 'opacity-50' : ''}
                        ${channel.solo ? 'bg-accent-primary/10' : ''}`}
                      style={{
                        width: channelWidth,
                        backgroundColor: channel.color ? `${channel.color}15` : undefined,
                        boxShadow: channel.color ? `inset 2px 0 0 ${channel.color}` : undefined,
                      }}
                    >
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
                      </div>
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
      )}

      {/* Canvas Pattern Grid */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-dark-bg overflow-x-hidden touch-none"
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
        <canvas
          ref={canvasRef}
          style={{
            width: dimensions.width,
            height: dimensions.height,
            display: 'block',
          }}
        />

        {/* Automation Lanes Overlay */}
        {pattern && (
          <>
            <AutomationLanes
              key={`automation-${pattern.id}-${renderCounter}`}
              patternId={pattern.id}
              patternLength={pattern.length}
              rowHeight={ROW_HEIGHT}
              channelCount={pattern.channels.length}
              channelOffsets={channelOffsets}
              channelWidths={channelWidths}
              rowNumWidth={LINE_NUMBER_WIDTH}
              scrollOffset={scrollY}
              visibleStart={visibleStart}
              parameter="cutoff"
              prevPatternId={showGhostPatterns ? (currentPatternIndex > 0 ? patterns[currentPatternIndex - 1]?.id : (patterns.length > 1 ? patterns[patterns.length - 1]?.id : undefined)) : undefined}
              prevPatternLength={showGhostPatterns ? (currentPatternIndex > 0 ? patterns[currentPatternIndex - 1]?.length : (patterns.length > 1 ? patterns[patterns.length - 1]?.length : undefined)) : undefined}
              nextPatternId={showGhostPatterns ? (currentPatternIndex < patterns.length - 1 ? patterns[currentPatternIndex + 1]?.id : (patterns.length > 1 ? patterns[0]?.id : undefined)) : undefined}
              nextPatternLength={showGhostPatterns ? (currentPatternIndex < patterns.length - 1 ? patterns[currentPatternIndex + 1]?.length : (patterns.length > 1 ? patterns[0]?.length : undefined)) : undefined}
            />
            {/* Internal Macro Columns Overlay (only when visible) */}
            <div 
              style={{ 
                position: 'absolute', 
                top: scrollY, 
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
