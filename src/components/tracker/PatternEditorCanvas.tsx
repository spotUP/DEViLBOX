/**
 * PatternEditorCanvas - Canvas-based pattern editor for maximum performance
 * Inspired by Bassoon Tracker's approach: canvas rendering with aggressive caching
 *
 * Hybrid approach: Canvas for pattern grid + HTML overlays for UI controls
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useTrackerStore, useCursorStore, useTransportStore, useThemeStore, useInstrumentStore, useEditorStore, useAutomationStore } from '@stores';
import { useWasmPositionStore } from '@stores/useWasmPositionStore';
import { channelLayout } from './channelLayout';
import { AutomationLanes } from './AutomationLanes';
import { GlobalAutomationLane } from './GlobalAutomationLane';
import { AutomationParameterPicker } from '../automation/AutomationParameterPicker';
import { MacroLanes } from './MacroLanes';
import { useUIStore } from '@stores/useUIStore';
import { useShallow } from 'zustand/react/shallow';
import { usePatternEditor, AUTOMATION_LANE_WIDTH, AUTOMATION_LANE_MIN } from '@hooks/views/usePatternEditor';
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
import { getTrackerScratchController } from '@engine/TrackerScratchController';
import { getFormatPlaybackState, getClockPosition } from '@engine/FormatPlaybackState';
import * as Tone from 'tone';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useFormatStore } from '@stores/useFormatStore';
import type { CursorPosition } from '@typedefs';
// OffscreenCanvas + WebGL2 worker bridge
import { TrackerOffscreenBridge } from '@engine/renderer/OffscreenBridge';
import { reportSynthError } from '@stores/useSynthErrorStore';
import type {
  PatternSnapshot,
  ThemeSnapshot,
  UIStateSnapshot,
  ChannelLayoutSnapshot,
  ChannelSnapshot,
  CellSnapshot,
} from '@engine/renderer/worker-types';
import TrackerWorkerFactory from '@/workers/tracker-render.worker.ts?worker';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';
import { toColumnSpec, formatChannelsToSnapshot } from '@/components/shared/format-editor-types';
import { TrackerCanvas2DRenderer } from '@engine/renderer/TrackerCanvas2DRenderer';
import { TrackerVisualBackground } from './TrackerVisualBackground';

const CHAR_WIDTH = 10;
const LINE_NUMBER_WIDTH = 40;

/** Add a flat amount to each RGB channel of a hex color */
function lightenHex(hex: string, add: number): string {
  const h = hex.replace('#', '');
  const r = Math.min(255, parseInt(h.substring(0, 2), 16) + add);
  const g = Math.min(255, parseInt(h.substring(2, 4), 16) + add);
  const b = Math.min(255, parseInt(h.substring(4, 6), 16) + add);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}
const AUTOMATION_LANE_W = AUTOMATION_LANE_WIDTH; // Re-export alias for readability
// Mobile-scaled layout constants (must match TrackerCanvas2DRenderer MOBILE_SCALE)
const MOBILE_SCALE = 1.6;
const M_CHAR_WIDTH = Math.round(CHAR_WIDTH * MOBILE_SCALE);
const M_LINE_NUMBER_WIDTH = Math.round(LINE_NUMBER_WIDTH * MOBILE_SCALE);
// Channel width is computed dynamically in render() based on acid/prob columns

const KEY_TO_SEMITONE: Record<string, number> = {
  'z': 0, 's': 1, 'x': 2, 'd': 3, 'c': 4, 'v': 5,
  'g': 6, 'b': 7, 'h': 8, 'n': 9, 'j': 10, 'm': 11,
  'q': 12, '2': 13, 'w': 14, '3': 15, 'e': 16, 'r': 17,
  '5': 18, 't': 19, '6': 20, 'y': 21, '7': 22, 'u': 23,
  'i': 24, '9': 25, 'o': 26, '0': 27, 'p': 28,
};

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
  // ── Format mode ──────────────────────────────────────────────────────────
  formatColumns?: ColumnDef[];
  formatChannels?: FormatChannel[];
  formatCurrentRow?: number;
  formatIsPlaying?: boolean;
  onFormatCellChange?: OnCellChange;
  /** Called when the format cursor moves (row/channel/column). Lets parent sync external state. */
  onFormatCursorChange?: (cursor: { channelIndex: number; rowIndex: number; columnIndex: number }) => void;
  /** Hide VU meters (for sub-editors like perf list that aren't main song views) */
  hideVUMeters?: boolean;
  /** Hide automation lanes overlay (for order matrices that reuse PatternEditorCanvas) */
  hideAutomationLanes?: boolean;
  /** Channel index offset for automation lanes in per-channel format mode.
   *  When MusicLine renders each channel as a separate instance, this tells
   *  the automation system which real channel this instance represents. */
  formatChannelOffset?: number;
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
  formatColumns,
  formatChannels,
  formatCurrentRow,
  formatIsPlaying,
  onFormatCellChange,
  onFormatCursorChange,
  hideVUMeters = false,
  hideAutomationLanes: hideAutoLanesProp = false,
  formatChannelOffset = 0,
}) => {
  const { isMobile } = useResponsiveSafe();

  const isFormatMode = !!formatColumns;

  // Refs for format mode values consumed by the RAF loop (must not cause re-subscribes)
  const isFormatModeRef     = useRef(isFormatMode);
  const formatCurrentRowRef = useRef(formatCurrentRow ?? 0);
  const formatIsPlayingRef  = useRef(formatIsPlaying ?? false);
  // Tracks last formatChannels identity sent to worker — RAF compares this to detect changes.
  const formatChannelsSentRef = useRef<FormatChannel[] | undefined>(undefined);
  // Pre-computed format pattern snapshot — updated every render so RAF always has fresh data
  // (avoids stale closure problem: the RAF effect only re-runs on dimensions.height change)
  const formatChannelsRef     = useRef<FormatChannel[] | undefined>(undefined);
  const formatPatternSnapshotRef = useRef<PatternSnapshot[]>([]);

  // Auto-focus in format mode so keyboard navigation works immediately
  // preventScroll: true — never let the browser auto-scroll a parent container
  // when we focus, otherwise the pattern editor jumps when the menu opens.
  useEffect(() => {
    if (isFormatMode) containerRef.current?.focus({ preventScroll: true });
  }, [isFormatMode]);

  // Keep refs in sync with props on every render
  isFormatModeRef.current     = isFormatMode;
  formatCurrentRowRef.current = formatCurrentRow ?? 0;
  formatIsPlayingRef.current  = formatIsPlaying ?? false;
  formatChannelsRef.current   = formatChannels;
  const onFormatCellChangeRef = useRef(onFormatCellChange);
  onFormatCellChangeRef.current = onFormatCellChange;
  if (isFormatMode && formatColumns && formatChannels) {
    formatPatternSnapshotRef.current = [formatChannelsToSnapshot(formatChannels, formatColumns)];
  }
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
  const automationOverlayRef = useRef<HTMLDivElement>(null);
  const automationPrevLenRef = useRef(0);
  const peerCursorDivRef = useRef<HTMLDivElement>(null);
  // Peer selection overlay (DOM overlay div — kept local)
  const peerSelectionDivRef = useRef<HTMLDivElement>(null);
  // Ref-tracked channel layout so the RAF loop always has current values
  const channelOffsetsRef = useRef<number[]>([]);
  const channelWidthsRef = useRef<number[]>([]);

  // Cell context menu
  const cellContextMenu = useCellContextMenu();

  // PERF: Use ref instead of state for channel triggers to avoid re-renders
  const channelTriggersRef = useRef<ChannelTrigger[]>([]);

  // Accumulator for horizontal scroll resistance
  const scrollAccumulatorRef = useRef(0);

  // Set to true if worker reports WebGL2 is unsupported (iOS Safari)
  const [webglUnsupported, setWebglUnsupported] = useState(false);
  // Main-thread Canvas2D renderer ref (iOS fallback)
  const mainThreadRendererRef = useRef<TrackerCanvas2DRenderer | null>(null);
  const mainThreadRafRef = useRef<number>(0);

  const [formatCursor, setFormatCursor] = useState({
    channelIndex: 0, rowIndex: 0, columnIndex: 0,
  });
  // Mutable ref so rAF loops can read the latest cursor without re-renders
  const formatCursorRef = useRef({ channelIndex: 0, rowIndex: 0, columnIndex: 0 });
  formatCursorRef.current = formatCursor;
  // Notify parent of cursor changes (so SF2/GT stores stay in sync)
  const onFormatCursorChangeRef = useRef(onFormatCursorChange);
  onFormatCursorChangeRef.current = onFormatCursorChange;
  useEffect(() => {
    onFormatCursorChangeRef.current?.(formatCursor);
  }, [formatCursor]);
  const [formatOctave, setFormatOctave] = useState(3);

  // Format mode selection: normalized range (startRow <= endRow, startCol <= endCol)
  const [formatSelection, setFormatSelection] = useState<{
    startRow: number; endRow: number;
    startCol: number; endCol: number;
    anchorRow: number; anchorCol: number;  // original anchor before normalization
  } | null>(null);

  // Format mode clipboard: array of rows, each row is column-key → value
  const formatClipboardRef = useRef<Record<string, number>[]>([]);

  // RAF-based held-arrow scrolling for format mode (matches useNavigationInput behavior)
  const formatHeldArrowRef = useRef<{ dir: number } | null>(null);
  const formatArrowRafRef = useRef(0);

  // Bridge to the OffscreenCanvas worker
  const bridgeRef = useRef<TrackerOffscreenBridge | null>(null);
  // Ref-tracked scroll for immediate worker updates (avoids React re-renders on scroll)
  const scrollLeftRef = useRef(0);

  // ── Shared pattern editor logic ────────────────────────────────────────────
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
    copyTrack,
    cutTrack,
    pasteTrack,
    showGhostPatterns,
    columnVisibility,
    rowHeight,
    rowHeightRef,
    cursorRef,
    selectionRef,
    peerCursorRef,
    peerSelectionRef,
    bdAnimations,
  } = usePatternEditor();

  const moveCursorToChannelAndColumn = useCursorStore((s) => s.moveCursorToChannelAndColumn);
  // Subscribe to active channel index so headers re-render when cursor moves channels
  const activeChannelIndex = useCursorStore((s) => s.cursor.channelIndex);
  const mobileChannelIndex = cursorRef.current.channelIndex;

  const { instruments } = useInstrumentStore(useShallow((state) => ({
    instruments: state.instruments
  })));

  const trackerVisualBg = useSettingsStore(s => s.trackerVisualBg);
  const channelColorBlend = useSettingsStore(s => s.channelColorBlend);
  // Convert blend % (0-100) to 2-digit hex alpha for CSS color suffix
  const blendHex = Math.round(channelColorBlend * 2.55).toString(16).padStart(2, '0');
  const showChannelNames = useUIStore(s => s.showChannelNames);
  const showAutomationLanes = useUIStore(s => s.showAutomationLanes);
  const showMacroLanes = useUIStore(s => s.showMacroLanes);

  // Per-channel automation lane count (for multi-lane width allocation)
  const channelLaneCounts = useAutomationStore(useShallow((s) => {
    if (!showAutomationLanes || !pattern) return [] as number[];
    const nc = pattern.channels.length;
    const patId = pattern.id;
    const counts: number[] = [];
    for (let ch = 0; ch < nc; ch++) {
      const lane = s.channelLanes.get(ch);
      const explicit = new Set<string>();
      if (lane?.activeParameters?.length) {
        lane.activeParameters.forEach(p => explicit.add(p));
      } else if (lane?.activeParameter) {
        explicit.add(lane.activeParameter);
      }
      for (const c of s.curves) {
        if (c.patternId === patId && c.channelIndex === ch && c.points.length > 0) {
          explicit.add(c.parameter);
        }
      }
      counts.push(Math.max(1, explicit.size));
    }
    return counts;
  }));

  // Use larger sizes on mobile iOS (Canvas2D main-thread path) for finger-friendly targets
  const mobileCanvas = webglUnsupported && isMobile;
  const CW = mobileCanvas ? M_CHAR_WIDTH : CHAR_WIDTH;
  const LNW = mobileCanvas ? M_LINE_NUMBER_WIDTH : LINE_NUMBER_WIDTH;

  // Channel Metrics: calculate numChannels, offsets, and widths once per pattern/theme change
  const { numChannels, channelOffsets: rawChannelOffsets, channelWidths, totalChannelsWidth } = useMemo(() => {
    // FORMAT MODE: compute widths from column definitions (per-channel columns supported)
    if (isFormatMode && formatColumns && formatChannels) {
      const FORMAT_COL_GAP  = mobileCanvas ? Math.round(4 * MOBILE_SCALE) : 4;
      const FORMAT_CHAN_PAD = mobileCanvas ? Math.round(40 * MOBILE_SCALE) : 40;
      const widths: number[] = [];
      const offsets: number[] = [];
      let currentX = LNW;
      for (let i = 0; i < formatChannels.length; i++) {
        const cols = formatChannels[i].columns ?? formatColumns;
        const contentWidth = cols.reduce(
          (sum, col) => sum + col.charWidth * CW + FORMAT_COL_GAP, 0
        ) - FORMAT_COL_GAP;
        const chanW = contentWidth + FORMAT_CHAN_PAD;
        offsets.push(currentX);
        widths.push(chanW);
        currentX += chanW;
      }
      return {
        numChannels: formatChannels.length,
        channelOffsets: offsets,
        channelWidths: widths,
        totalChannelsWidth: currentX,
      };
    }

    if (!pattern) return {
      numChannels: 0,
      channelOffsets: [],
      channelWidths: [],
      totalChannelsWidth: 0
    };

    const nc = pattern.channels.length;
    const noteWidth = CW * 3 + 4;
    
    // Determine extra column visibility from store settings (stable!)
    const showAcid = columnVisibility.flag1 || columnVisibility.flag2;
    const showProb = columnVisibility.probability;
    const autoLaneExtra = (ch: number) => {
      if (!showAutomationLanes) return 0;
      const lc = channelLaneCounts[ch] ?? 1;
      return lc <= 1 ? AUTOMATION_LANE_W
        : Math.max(AUTOMATION_LANE_W, lc * AUTOMATION_LANE_MIN + 4);
    };

    // Calculate per-channel widths based on effectCols
    const offsets: number[] = [];
    const widths: number[] = [];
    let currentX = LNW;

    for (let ch = 0; ch < nc; ch++) {
      const channel = pattern.channels[ch];
      const isCollapsed = channel?.collapsed;

      if (isCollapsed) {
        const collapsedWidth = noteWidth + (mobileCanvas ? 64 : 40) + autoLaneExtra(ch);
        offsets.push(currentX);
        widths.push(collapsedWidth);
        currentX += collapsedWidth;
      } else {
        const effectCols = channel?.channelMeta?.effectCols ?? 2;
        const effectWidth = effectCols * (CW * 3 + 4);
        const noteCols = channel?.channelMeta?.noteCols ?? 1;
        const extraNoteColWidth = (noteCols - 1) * (noteWidth + CW * 4 + 12);
        const paramWidth = CW * 4 + 8
          + effectWidth
          + extraNoteColWidth
          + (showAcid ? CW * 2 + 8 : 0)
          + (showProb ? CW * 2 + 4 : 0);
        const chWidth = noteWidth + paramWidth + (mobileCanvas ? 96 : 60) + autoLaneExtra(ch);
        offsets.push(currentX);
        widths.push(chWidth);
        currentX += chWidth;
      }
    }

    return {
      numChannels: nc,
      channelOffsets: offsets,
      channelWidths: widths,
      totalChannelsWidth: currentX - LNW
    };
  }, [pattern, instruments, columnVisibility, isFormatMode, formatColumns, formatChannels, mobileCanvas, CW, LNW, showAutomationLanes, channelLaneCounts]);

  // Center channels horizontally when in fullscreen and channels don't fill the viewport
  const editorFullscreen = useUIStore(s => s.editorFullscreen);
  const centerPadding = useMemo(() => {
    if (!editorFullscreen || numChannels === 0) return 0;
    const usedWidth = LNW + totalChannelsWidth;
    if (usedWidth >= dimensions.width) return 0;
    return Math.floor((dimensions.width - usedWidth) / 2);
  }, [editorFullscreen, totalChannelsWidth, dimensions.width, numChannels, LNW]);

  const channelOffsets = useMemo(() => {
    if (centerPadding === 0) return rawChannelOffsets;
    return rawChannelOffsets.map(x => x + centerPadding);
  }, [rawChannelOffsets, centerPadding]);

  // Keep channelOffsetsRef/channelWidthsRef in sync for the RAF loop (selection math)
  // Also publish to shared channelLayout for TrackScopesStrip alignment
  useEffect(() => {
    channelOffsetsRef.current = channelOffsets;
    channelWidthsRef.current = channelWidths;
    channelLayout.offsets = channelOffsets;
    channelLayout.widths = channelWidths;
    channelLayout.numChannels = numChannels;
  }, [channelOffsets, channelWidths, numChannels]);

  // Calculate if all channels fit in viewport (for disabling horizontal scroll)
  const allChannelsFit = useMemo(() => {
    if (!pattern || numChannels === 0) return true;
    return (LNW + totalChannelsWidth) <= dimensions.width;
  }, [totalChannelsWidth, numChannels, dimensions.width, pattern]);

  // Mobile gesture handlers
  // Vertical swipes move the cursor up/down
  const handleSwipeUp = useCallback(() => {
    if (!pattern || !isMobile) return;
    const cursor = cursorRef.current;
    const newRow = Math.max(0, cursor.rowIndex - 4); // Move up 4 rows
    useCursorStore.getState().moveCursorToRow(newRow);
  }, [pattern, isMobile]);

  const handleSwipeDown = useCallback(() => {
    if (!pattern || !isMobile) return;
    const cursor = cursorRef.current;
    const newRow = Math.min(pattern.length - 1, cursor.rowIndex + 4); // Move down 4 rows
    useCursorStore.getState().moveCursorToRow(newRow);
  }, [pattern, isMobile]);

  // Continuous scroll handler for drag scrolling
  const handleScroll = useCallback((deltaY: number) => {
    if (!pattern || !isMobile) return;

    // Check if scratch should be active (same logic as wheel handler)
    const playing = useTransportStore.getState().isPlaying;
    const uiState = useUIStore.getState();
    const isDJView = uiState.activeView === 'dj';
    const scratchToggleOn = uiState.scratchEnabled;
    const shouldUseScratch = isDJView || scratchToggleOn || playing;

    if (shouldUseScratch) {
      const scratch = getTrackerScratchController();
      // Touch deltaY is in pixels; scale similarly to wheel (deltaMode 0 = pixel)
      scratch.onScrollDelta(deltaY, performance.now(), 0);
      return;
    }

    // Convert pixels to rows
    const rowDelta = Math.round(deltaY / rowHeightRef.current);

    if (Math.abs(rowDelta) > 0) {
      const cursor = cursorRef.current;
      const newRow = Math.max(0, Math.min(pattern.length + 31, cursor.rowIndex + rowDelta));
      useCursorStore.getState().moveCursorToRow(newRow);
    }
  }, [pattern, isMobile]);

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
      const cursorStore = useCursorStore.getState();
      for (let i = 0; i < Math.abs(steps); i++) {
        cursorStore.moveCursor(steps > 0 ? 'right' : 'left');
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
    // We want to know which row is at relativeY. The currentRow is at centerLineTop.
    const centerLineTop = Math.floor(dimensions.height / 2) - rowHeightRef.current / 2;
    const rowOffset = Math.floor((relativeY - centerLineTop) / rowHeightRef.current);
    
    const transportState = useTransportStore.getState();
    const cursor = cursorRef.current;
    const currentRow = transportState.isPlaying ? transportState.currentRow : cursor.rowIndex;
    const rowIndex = currentRow + rowOffset;

    let channelIndex = 0;
    let foundChannel = false;

    for (let ch = 0; ch < numChannels; ch++) {
      const off = channelOffsets[ch];
      const w = channelWidths[ch];
      if (relativeX >= off && relativeX < off + w) {
        channelIndex = ch;
        foundChannel = true;
        break;
      }
    }

    if (!foundChannel) {
      if (relativeX < LNW) {
        channelIndex = 0;
      } else {
        return null;
      }
    }

    // Determine column type
    const isCollapsed = pattern.channels[channelIndex]?.collapsed;
    if (isCollapsed) return { rowIndex: Math.max(0, Math.min(rowIndex, pattern.length - 1)), channelIndex, columnType: 'note' };

    let columnType: CursorPosition['columnType'] = 'note';
    let noteColumnIndex = 0;

    // Match the GL renderer's centering: content is centered within channel width
    const noteWidth = CHAR_WIDTH * 3 + 4;
    const cell = pattern.channels[channelIndex]?.rows[0];
    const channel = pattern.channels[channelIndex];
    const hasAcid = cell?.flag1 !== undefined || cell?.flag2 !== undefined;
    const hasProb = cell?.probability !== undefined;
    const effectCols = channel?.channelMeta?.effectCols ?? 2;
    const totalNoteCols = channel?.channelMeta?.noteCols ?? 1;
    // For multi-note cols: each group = note+inst+vol+gaps
    const NOTE_COL_GROUP_W = noteWidth + 4 + CHAR_WIDTH * 2 + 4 + CHAR_WIDTH * 2 + 4;
    const chContentWidth = NOTE_COL_GROUP_W * totalNoteCols + effectCols * (CHAR_WIDTH * 3 + 4)
      + (hasAcid ? CHAR_WIDTH * 2 + 8 : 0) + (hasProb ? CHAR_WIDTH * 2 + 4 : 0);
    const chW = channelWidths[channelIndex] ?? 0;
    const centeringOffset = Math.floor((chW - chContentWidth) / 2);
    const localX = Math.max(0, relativeX - (channelOffsets[channelIndex] ?? 0) - centeringOffset);

    // Column boundaries matching the GL renderer's layout:
    // note(noteWidth) → 4px gap → inst(CW*2) → 4px gap → vol(CW*2) → 4px gap → effects...
    const paramBase = noteWidth + 4; // where inst starts
    const allNoteColsEnd = NOTE_COL_GROUP_W * totalNoteCols;

    if (localX < allNoteColsEnd) {
      // Inside a note column group
      noteColumnIndex = Math.min(totalNoteCols - 1, Math.max(0, Math.floor(localX / NOTE_COL_GROUP_W)));
      const xInGroup = localX - noteColumnIndex * NOTE_COL_GROUP_W;
      if (xInGroup < paramBase) columnType = 'note';
      else if (xInGroup < paramBase + CHAR_WIDTH * 2 + 4) columnType = 'instrument';
      else columnType = 'volume';
    } else {
      // After all note columns — effects, flags, probability
      const xInParams = localX - allNoteColsEnd;
      const effectWidth = effectCols * (CHAR_WIDTH * 3 + 4);
      if (xInParams < effectWidth) {
        const effCol = Math.floor(xInParams / (CHAR_WIDTH * 3 + 4));
        columnType = effCol === 0 ? 'effTyp' : 'effTyp2';
      } else if (hasAcid && xInParams < effectWidth + CHAR_WIDTH * 2 + 8) {
        columnType = xInParams < effectWidth + CHAR_WIDTH + 4 ? 'flag1' : 'flag2';
      } else if (hasProb) {
        columnType = 'probability';
      } else {
        columnType = 'effTyp';
      }
    }

    return {
      rowIndex: Math.max(0, Math.min(rowIndex, pattern.length - 1)),
      channelIndex,
      noteColumnIndex,
      columnType
    };
  }, [pattern, dimensions.height, scrollLeft, channelOffsets, channelWidths, numChannels]);

  const [isDragging, setIsDragging] = useState(false);
  const isScratchDragRef = useRef(false);
  const [, setDragOverCell] = useState<{ channelIndex: number; rowIndex: number } | null>(null);

  // Auto-scroll state for drag selection beyond visible edges
  const lastDragClientRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const autoScrollRafRef = useRef<number | null>(null);

  // Document-level handlers for scratch drag (cursor can leave canvas bounds)
  // Use pointer events so touch drag works on iOS/mobile
  useEffect(() => {
    const onDocPointerMove = (e: PointerEvent) => {
      if (!isScratchDragRef.current) return;
      getTrackerScratchController().onGrabMove(e.clientY, performance.now());
    };
    const onDocPointerUp = () => {
      if (!isScratchDragRef.current) return;
      isScratchDragRef.current = false;
      getTrackerScratchController().onGrabEnd(performance.now());
    };
    document.addEventListener('pointermove', onDocPointerMove);
    document.addEventListener('pointerup', onDocPointerUp);
    return () => {
      document.removeEventListener('pointermove', onDocPointerMove);
      document.removeEventListener('pointerup', onDocPointerUp);
    };
  }, []);

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
    if (e.button !== 0) return; // Only left click / primary pointer

    // Ignore clicks that originated inside a context menu, automation lane,
    // or any other floating overlay. Without this, clicking "Copy Cell" would
    // also be interpreted as a click on whichever pattern row sits behind the
    // menu, and dragging in an automation lane would scratch-scroll the
    // pattern instead of drawing the curve.
    const target = e.target as Element | null;
    if (target?.closest?.('[data-context-menu], [data-automation-lane]')) return;

    // FORMAT MODE: own hit-test (pattern may be undefined)
    if (!isMobile && isFormatMode && formatChannels && formatColumns) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;

      // Find channel
      let chIdx = -1;
      for (let ch = 0; ch < channelOffsets.length; ch++) {
        const absX = channelOffsets[ch];
        if (relX >= absX && relX < absX + (channelWidths[ch] ?? 0)) {
          chIdx = ch;
          break;
        }
      }
      if (chIdx < 0) return;

      // Find row (center-scroll logic matching the renderer)
      const numRows = formatChannels[chIdx]?.patternLength ?? 0;
      const containerHeight = container.clientHeight;
      const ROW_H = rowHeightRef.current;
      const currentDisplayRow = formatIsPlayingRef.current ? formatCurrentRowRef.current : formatCursor.rowIndex;
      const centerLineTop = Math.floor(containerHeight / 2) - ROW_H / 2;
      const rowOffset = Math.floor((relY - centerLineTop) / ROW_H);
      const rowIdx = Math.max(0, Math.min(numRows - 1, currentDisplayRow + rowOffset));

      // Find column
      const FORMAT_COL_GAP = 4;
      const chCols = formatChannels[chIdx]?.columns ?? formatColumns;
      const localX = relX - channelOffsets[chIdx] - 2;
      let colIdx = 0;
      let px = 0;
      for (let ci = 0; ci < chCols.length; ci++) {
        const colW = chCols[ci].charWidth * CHAR_WIDTH + FORMAT_COL_GAP;
        if (localX < px + colW) { colIdx = ci; break; }
        px += colW;
        if (ci === chCols.length - 1) colIdx = ci;
      }

      setFormatCursor({ channelIndex: chIdx, rowIndex: rowIdx, columnIndex: colIdx });
      containerRef.current?.focus({ preventScroll: true });
      return;
    }

    const cell = getCellFromCoords(e.clientX, e.clientY);
    if (!cell) return;

    // During playback, pointer drag = grab scratch (hand on record, vinyl physics)
    // Works on both desktop and mobile/iOS touch
    const isPlaying = useTransportStore.getState().isPlaying;

    if (isPlaying && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      const scratch = getTrackerScratchController();
      const activated = scratch.onGrabStart(e.clientY, performance.now());
      if (activated) {
        isScratchDragRef.current = true;
        e.preventDefault(); // Prevent text selection / touch gestures during scratch drag
        return;
      }
    }

    // Selection and cursor movement — desktop only (mobile uses touch gestures)
    if (isMobile) return;

    const cursorStore = useCursorStore.getState();

    if (e.shiftKey) {
      cursorStore.updateSelection(cell.channelIndex, cell.rowIndex);
    } else {
      cursorStore.moveCursorToRow(cell.rowIndex);
      cursorStore.moveCursorToChannelAndColumn(cell.channelIndex, cell.columnType as any, cell.noteColumnIndex);
      cursorStore.startSelection();
    }

    setIsDragging(true);
  }, [isMobile, getCellFromCoords]);

  const handleMouseMove = useCallback((e: React.MouseEvent | PointerEvent) => {
    // Scratch drag handled by document-level listener (supports dragging outside canvas)
    if (isScratchDragRef.current) return;

    if (!isDragging || isMobile) return;

    // Store last mouse position for auto-scroll rAF loop
    lastDragClientRef.current = { x: e.clientX, y: e.clientY };

    const cell = getCellFromCoords(e.clientX, e.clientY);
    if (!cell) return;

    useCursorStore.getState().updateSelection(cell.channelIndex, cell.rowIndex, cell.columnType as any);
  }, [isDragging, isMobile, getCellFromCoords]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    // Scratch drag ended by document-level listener
    if (isScratchDragRef.current) return;
    if (isDragging) {
      stopAutoScroll();
      setIsDragging(false);
    }
  }, [isDragging, stopAutoScroll]);

  // Document-level pointer tracking during drag selection.
  // Enables auto-scroll when the mouse moves beyond the top/bottom edge.
  useEffect(() => {
    if (!isDragging || isMobile) return;

    const EDGE_ZONE = 40; // px from container edge to trigger auto-scroll
    let lastScrollTime = 0;

    const onDocMove = (e: PointerEvent) => {
      if (isScratchDragRef.current) return;
      lastDragClientRef.current = { x: e.clientX, y: e.clientY };

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const relativeY = e.clientY - rect.top;
      const h = rect.height;

      // Inside the safe zone — normal selection update, no auto-scroll needed
      if (relativeY >= EDGE_ZONE && relativeY <= h - EDGE_ZONE) {
        stopAutoScroll();
        const cell = getCellFromCoords(e.clientX, e.clientY);
        if (cell) {
          useCursorStore.getState().updateSelection(cell.channelIndex, cell.rowIndex, cell.columnType as any);
        }
        return;
      }

      // Near or beyond an edge — start auto-scroll if not already running
      if (autoScrollRafRef.current === null) {
        const scrollStep = () => {
          if (!containerRef.current) return;
          const now = performance.now();
          // Throttle to ~20 rows/sec max for controllable scrolling
          if (now - lastScrollTime < 50) {
            autoScrollRafRef.current = requestAnimationFrame(scrollStep);
            return;
          }
          lastScrollTime = now;

          const r = containerRef.current.getBoundingClientRect();
          const { x: mx, y: my } = lastDragClientRef.current;
          const ry = my - r.top;
          const cursor = cursorRef.current;

          if (!pattern) { autoScrollRafRef.current = null; return; }

          let targetRow = cursor.rowIndex;
          if (ry < EDGE_ZONE) {
            // Scroll up — speed increases with distance beyond edge
            const intensity = Math.ceil((EDGE_ZONE - ry) / (EDGE_ZONE / 3));
            targetRow = Math.max(0, cursor.rowIndex - intensity);
          } else if (ry > r.height - EDGE_ZONE) {
            // Scroll down
            const intensity = Math.ceil((ry - (r.height - EDGE_ZONE)) / (EDGE_ZONE / 3));
            targetRow = Math.min(pattern.length - 1, cursor.rowIndex + intensity);
          } else {
            // Mouse moved back to safe zone — stop
            autoScrollRafRef.current = null;
            return;
          }

          if (targetRow !== cursor.rowIndex) {
            const cursorStore = useCursorStore.getState();
            cursorStore.moveCursorToRow(targetRow);
            // Extend selection to the edge row at the current horizontal position
            const cell = getCellFromCoords(mx, my);
            if (cell) {
              cursorStore.updateSelection(cell.channelIndex, cell.rowIndex, cell.columnType as any);
            } else {
              // Mouse is outside horizontal bounds — extend to the scrolled row keeping last channel
              const sel = cursorStore.selection;
              if (sel) cursorStore.updateSelection(sel.endChannel, targetRow);
            }
          }

          autoScrollRafRef.current = requestAnimationFrame(scrollStep);
        };
        autoScrollRafRef.current = requestAnimationFrame(scrollStep);
      }
    };

    const onDocUp = () => {
      stopAutoScroll();
      setIsDragging(false);
    };

    document.addEventListener('pointermove', onDocMove);
    document.addEventListener('pointerup', onDocUp);
    return () => {
      stopAutoScroll();
      document.removeEventListener('pointermove', onDocMove);
      document.removeEventListener('pointerup', onDocUp);
    };
  }, [isDragging, isMobile, getCellFromCoords, stopAutoScroll, pattern]);

  const handleLongPress = useCallback((x: number, y: number) => {
    if (!isMobile) return;
    
    const cell = getCellFromCoords(x, y);
    if (!cell) return;

    const cursorStore = useCursorStore.getState();
    cursorStore.moveCursorToRow(cell.rowIndex);
    cursorStore.moveCursorToChannelAndColumn(cell.channelIndex, cell.columnType as any, cell.noteColumnIndex);
    cursorStore.startSelection();
    
    haptics.heavy();
    useUIStore.getState().setStatusMessage('BLOCK START');
  }, [isMobile, getCellFromCoords]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // preventScroll: true — focusing the container must NEVER cause the
    // browser to auto-scroll a parent (which makes the pattern editor
    // appear to "jump" when the menu opens)
    containerRef.current?.focus({ preventScroll: true });

    // Format mode: use same hit-test as handleMouseDown (no scrollLeft)
    if (isFormatMode && formatChannels && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;
      let chIdx = -1;
      for (let ch = 0; ch < channelOffsets.length; ch++) {
        if (relX >= channelOffsets[ch] && relX < channelOffsets[ch] + (channelWidths[ch] ?? 0)) {
          chIdx = ch;
          break;
        }
      }
      const ROW_H = rowHeightRef.current;
      const centerLineTop = Math.floor(containerRef.current.clientHeight / 2) - ROW_H / 2;
      const currentDisplayRow = formatIsPlayingRef.current ? formatCurrentRowRef.current : formatCursor.rowIndex;
      const rowOffset = Math.floor((relY - centerLineTop) / ROW_H);
      const rowIndex = Math.max(0, currentDisplayRow + rowOffset);
      const channelIndex = chIdx >= 0 ? chIdx : 0;
      cellContextMenu.openMenu(e, rowIndex, channelIndex);
      return;
    }

    // Standard mode — use cursor position for channel/row.
    // The contextmenu event's clientX is offset when Chrome DevTools is docked
    // (Chrome bug: coordinates include DevTools panel width). The cursor position
    // is always correct since it's set by pointerdown which has reliable coordinates.
    const cursor = cursorRef.current;
    cellContextMenu.openMenu(e, cursor.rowIndex, cursor.channelIndex);
  }, [getCellFromCoords, cellContextMenu, isFormatMode, formatChannels, channelOffsets, channelWidths]);

  // ── Format mode: copy rows from selection (or current row) to clipboard ──
  const formatCopySelection = useCallback(() => {
    if (!formatColumns || !formatChannels) return;
    const ch = formatChannels[formatCursor.channelIndex];
    if (!ch) return;
    const chCols = ch.columns ?? formatColumns;
    const sel = formatSelection;
    const startRow = sel ? sel.startRow : formatCursor.rowIndex;
    const endRow = sel ? sel.endRow : formatCursor.rowIndex;
    const startCol = sel ? sel.startCol : 0;
    const endCol = sel ? sel.endCol : chCols.length - 1;
    const clipboard: Record<string, number>[] = [];
    for (let r = startRow; r <= endRow; r++) {
      const row = ch.rows[r];
      if (!row) { clipboard.push({}); continue; }
      const entry: Record<string, number> = {};
      for (let c = startCol; c <= endCol; c++) {
        const colDef = chCols[c];
        if (colDef) entry[colDef.key] = row[colDef.key] ?? (colDef.emptyValue ?? 0);
      }
      clipboard.push(entry);
    }
    formatClipboardRef.current = clipboard;
    const rowCount = endRow - startRow + 1;
    useUIStore.getState().setStatusMessage(`COPIED ${rowCount} ROW${rowCount > 1 ? 'S' : ''}`);
  }, [formatColumns, formatChannels, formatCursor, formatSelection]);

  // ── Format mode: clear cells in selection (or current row) ──
  const formatClearSelection = useCallback(() => {
    if (!formatColumns || !formatChannels || !onFormatCellChange) return;
    const chCols = formatChannels[formatCursor.channelIndex]?.columns ?? formatColumns;
    const sel = formatSelection;
    const startRow = sel ? sel.startRow : formatCursor.rowIndex;
    const endRow = sel ? sel.endRow : formatCursor.rowIndex;
    const startCol = sel ? sel.startCol : 0;
    const endCol = sel ? sel.endCol : chCols.length - 1;
    const chIdx = formatCursor.channelIndex;
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const colDef = chCols[c];
        if (colDef) onFormatCellChange(chIdx, r, colDef.key, colDef.emptyValue ?? 0);
      }
    }
  }, [formatColumns, formatChannels, formatCursor, formatSelection, onFormatCellChange]);

  // ── Format mode: paste clipboard at cursor position ──
  const formatPasteClipboard = useCallback(() => {
    if (!formatColumns || !formatChannels || !onFormatCellChange) return;
    const clipboard = formatClipboardRef.current;
    if (clipboard.length === 0) {
      useUIStore.getState().setStatusMessage('CLIPBOARD EMPTY');
      return;
    }
    const ch = formatChannels[formatCursor.channelIndex];
    if (!ch) return;
    const numRows = ch.patternLength;
    let pasted = 0;
    for (let i = 0; i < clipboard.length; i++) {
      const targetRow = formatCursor.rowIndex + i;
      if (targetRow >= numRows) break;
      const entry = clipboard[i];
      for (const [key, value] of Object.entries(entry)) {
        onFormatCellChange(formatCursor.channelIndex, targetRow, key, value);
      }
      pasted++;
    }
    useUIStore.getState().setStatusMessage(`PASTED ${pasted} ROW${pasted > 1 ? 'S' : ''}`);
  }, [formatColumns, formatChannels, formatCursor, onFormatCellChange]);

  const handleFormatKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isFormatMode || !formatColumns || !formatChannels) return;
    const chCols = formatChannels[formatCursor.channelIndex]?.columns ?? formatColumns;
    const col = chCols[formatCursor.columnIndex];
    const numRows = formatChannels[formatCursor.channelIndex]?.patternLength ?? formatChannels[0]?.patternLength ?? 0;
    const numCols = chCols.length;

    // ── Helper: move cursor and optionally extend/clear selection ──
    const moveCursor = (delta: { channelIndex?: number; rowIndex?: number; columnIndex?: number }, extend?: boolean) => {
      setFormatCursor(prev => {
        const newChIdx = Math.max(0, Math.min(formatChannels!.length - 1,
            prev.channelIndex + (delta.channelIndex ?? 0)));
        const newChCols = formatChannels![newChIdx]?.columns ?? formatColumns!;
        const newNumCols = newChCols.length;
        const newNumRows = formatChannels![newChIdx]?.patternLength ?? 0;
        const next = {
          channelIndex: newChIdx,
          rowIndex: Math.max(0, Math.min(newNumRows - 1,
            prev.rowIndex + (delta.rowIndex ?? 0))),
          columnIndex: Math.max(0, Math.min(newNumCols - 1,
            delta.channelIndex ? Math.min(prev.columnIndex, newNumCols - 1)
              : prev.columnIndex + (delta.columnIndex ?? 0))),
        };
        if (extend) {
          // Extend selection from anchor to new cursor position
          setFormatSelection(prevSel => {
            const anchorRow = prevSel ? prevSel.anchorRow : prev.rowIndex;
            const anchorCol = prevSel ? prevSel.anchorCol : prev.columnIndex;
            return {
              startRow: Math.min(anchorRow, next.rowIndex),
              endRow: Math.max(anchorRow, next.rowIndex),
              startCol: Math.min(anchorCol, next.columnIndex),
              endCol: Math.max(anchorCol, next.columnIndex),
              anchorRow,
              anchorCol,
            };
          });
        } else {
          // Clear selection on non-shift movement
          setFormatSelection(null);
        }
        return next;
      });
    };

    if (e.key === '[' || e.key === '-') { e.preventDefault(); setFormatOctave(o => Math.max(0, o - 1)); return; }
    if (e.key === ']' || e.key === '=') { e.preventDefault(); setFormatOctave(o => Math.min(7, o + 1)); return; }

    const isCtrlCmd = e.ctrlKey || e.metaKey;

    // Escape: clear selection
    if (e.key === 'Escape') {
      e.preventDefault();
      setFormatSelection(null);
      return;
    }

    // Select All (Ctrl+A): select all rows in current channel, all columns
    if (isCtrlCmd && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setFormatSelection({
        startRow: 0, endRow: Math.max(0, numRows - 1),
        startCol: 0, endCol: Math.max(0, numCols - 1),
        anchorRow: 0, anchorCol: 0,
      });
      return;
    }

    // Copy (Ctrl+C / F4)
    if ((isCtrlCmd && e.key.toLowerCase() === 'c' && !e.shiftKey) || e.key === 'F4') {
      e.preventDefault();
      formatCopySelection();
      return;
    }

    // Cut (Ctrl+X / F3)
    if ((isCtrlCmd && e.key.toLowerCase() === 'x') || e.key === 'F3') {
      e.preventDefault();
      formatCopySelection();
      formatClearSelection();
      setFormatSelection(null);
      return;
    }

    // Paste (Ctrl+V / F5)
    if ((isCtrlCmd && e.key.toLowerCase() === 'v') || e.key === 'F5') {
      e.preventDefault();
      formatPasteClipboard();
      return;
    }

    // Undo / Redo (Ctrl+Z / Ctrl+Shift+Z)
    if (isCtrlCmd && e.key.toLowerCase() === 'z' && !e.altKey) {
      e.preventDefault();
      const store = useFormatStore.getState();
      if (e.shiftKey) {
        if (store.canRedoHively()) {
          store.redoHivelyTrackStep();
          useUIStore.getState().setStatusMessage('REDO');
        } else {
          useUIStore.getState().setStatusMessage('NOTHING TO REDO');
        }
      } else {
        if (store.canUndoHively()) {
          store.undoHivelyTrackStep();
          useUIStore.getState().setStatusMessage('UNDO');
        } else {
          useUIStore.getState().setStatusMessage('NOTHING TO UNDO');
        }
      }
      return;
    }

    // Transpose: Ctrl+ArrowUp/Down = +/-1 semitone, Ctrl+Shift = +/-12
    if (isCtrlCmd && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey) {
      e.preventDefault();
      if (col && col.type === 'note') {
        const curVal = formatChannels[formatCursor.channelIndex]?.rows[formatCursor.rowIndex]?.[col.key] ?? 0;
        if (curVal > 0) { // Don't transpose empty/zero notes
          const delta = e.key === 'ArrowUp' ? (e.shiftKey ? 12 : 1) : (e.shiftKey ? -12 : -1);
          const newVal = Math.max(1, Math.min(95, curVal + delta));
          onFormatCellChange?.(formatCursor.channelIndex, formatCursor.rowIndex, col.key, newVal);
        }
      }
      return;
    }

    // Arrow up/down: RAF-based hold-to-scroll (no initial delay, 50ms interval)
    // Shift+Arrow extends selection
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (e.repeat) return; // RAF loop handles repeats
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      moveCursor({ rowIndex: dir }, e.shiftKey);
      if (!e.shiftKey) {
        // Only start RAF scroll for non-shift arrows
        formatHeldArrowRef.current = { dir };
        if (!formatArrowRafRef.current) {
          let lastMove = performance.now();
          const tick = (now: number) => {
            if (!formatHeldArrowRef.current) { formatArrowRafRef.current = 0; return; }
            if (now - lastMove >= 50) {
              lastMove = now;
              setFormatCursor(prev => ({
                ...prev,
                rowIndex: Math.max(0, Math.min(numRows - 1,
                  prev.rowIndex + formatHeldArrowRef.current!.dir)),
              }));
            }
            formatArrowRafRef.current = requestAnimationFrame(tick);
          };
          formatArrowRafRef.current = requestAnimationFrame(tick);
        }
      }
      return;
    }

    // ── Insert row (Insert key) ──────────────────────────────────────────────
    if (e.key === 'Insert') {
      e.preventDefault();
      const ch = formatChannels[formatCursor.channelIndex];
      const trackIdx = ch?.trackIndex;
      if (trackIdx != null) {
        const store = useFormatStore.getState();
        if (store.editorMode === 'hively') {
          store.insertHivelyTrackRow(trackIdx, formatCursor.rowIndex);
        }
      }
      return;
    }

    // ── Delete row (Shift+Backspace) ──────────────────────────────────────────
    if (e.key === 'Backspace' && e.shiftKey) {
      e.preventDefault();
      const ch = formatChannels[formatCursor.channelIndex];
      const trackIdx = ch?.trackIndex;
      if (trackIdx != null) {
        const store = useFormatStore.getState();
        if (store.editorMode === 'hively') {
          store.deleteHivelyTrackRow(trackIdx, formatCursor.rowIndex);
        }
      }
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':  e.preventDefault(); moveCursor({ columnIndex: -1 }, e.shiftKey); return;
      case 'ArrowRight': e.preventDefault(); moveCursor({ columnIndex: +1 }, e.shiftKey); return;
      case 'Tab':        e.preventDefault(); moveCursor({ channelIndex: e.shiftKey ? -1 : +1 }); return;
      case 'PageUp':     e.preventDefault(); moveCursor({ rowIndex: -16 }, e.shiftKey); return;
      case 'PageDown':   e.preventDefault(); moveCursor({ rowIndex: +16 }, e.shiftKey); return;
      case 'Home':       e.preventDefault(); setFormatCursor(p => ({ ...p, rowIndex: 0 })); setFormatSelection(null); return;
      case 'End':        e.preventDefault(); setFormatCursor(p => ({ ...p, rowIndex: Math.max(0, numRows - 1) })); setFormatSelection(null); return;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (formatSelection) {
          // Delete clears entire selection
          formatClearSelection();
          setFormatSelection(null);
        } else if (col) {
          onFormatCellChange?.(formatCursor.channelIndex, formatCursor.rowIndex, col.key, col.emptyValue ?? 0);
          moveCursor({ rowIndex: +1 });
        }
        return;
    }

    if (!col) return;

    // Data entry clears selection
    if (col.type === 'note') {
      const semitone = KEY_TO_SEMITONE[e.key.toLowerCase()];
      if (semitone !== undefined) {
        e.preventDefault();
        setFormatSelection(null);
        const midi = semitone + formatOctave * 12;
        if (midi >= 0 && midi <= 95) {
          onFormatCellChange?.(formatCursor.channelIndex, formatCursor.rowIndex, col.key, midi);
          moveCursor({ rowIndex: +1 });
        }
      }
    } else if (col.type === 'hex' || col.type === 'ctrl') {
      if (/^[0-9a-fA-F]$/i.test(e.key)) {
        e.preventDefault();
        setFormatSelection(null);
        const digit = parseInt(e.key, 16);
        const hexDigits = col.hexDigits ?? 2;
        const cur = formatChannels[formatCursor.channelIndex]?.rows[formatCursor.rowIndex]?.[col.key]
          ?? (col.emptyValue ?? 0);
        const mask = (1 << (hexDigits * 4)) - 1;
        onFormatCellChange?.(formatCursor.channelIndex, formatCursor.rowIndex, col.key,
          ((cur << 4) | digit) & mask);
        moveCursor({ rowIndex: +1 });
      }
    }
  }, [isFormatMode, formatColumns, formatChannels, formatCursor, formatOctave,
      onFormatCellChange, formatSelection, formatCopySelection, formatClearSelection, formatPasteClipboard]);

  // Handle tap on pattern canvas - move cursor to tapped cell
  const handlePatternTap = useCallback((tapX: number, tapY: number) => {
    if (!pattern || !isMobile || !containerRef.current || !canvasRef.current) return;

    // Get container bounds
    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = tapX - rect.left; // No horizontal scroll on mobile
    const relativeY = tapY - rect.top + containerRef.current.scrollTop;

    // On mobile, there's no channel header, so no offset needed
    const rowIndex = Math.floor(relativeY / rowHeightRef.current);

    // Calculate channel width - must match render() layout
    const cw = mobileCanvas ? M_CHAR_WIDTH : CHAR_WIDTH;
    const lnw = mobileCanvas ? M_LINE_NUMBER_WIDTH : LINE_NUMBER_WIDTH;
    const noteWidth = cw * 3 + 4;
    const firstCell = pattern.channels[0]?.rows[0];
    const hasAcid = firstCell?.flag1 !== undefined || firstCell?.flag2 !== undefined;
    const hasProb = firstCell?.probability !== undefined;
    const paramWidth = cw * 10 + 16
      + (hasAcid ? cw * 2 + 8 : 0)
      + (hasProb ? cw * 2 + 4 : 0)
      + cw * 2 + 4; // Automation column
    const channelWidth = noteWidth + paramWidth + 20 + 20; // +20 for automation lane visual space

    let channelIndex = 0;
    let localX = relativeX - lnw;
    if (relativeX > lnw) {
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
    const cursorStore = useCursorStore.getState();
    const currentSelection = cursorStore.selection;

    if (currentSelection) {
      // If we already have a selection, tapping a new cell extends it
      cursorStore.updateSelection(channelIndex, validRow);
      haptics.soft();
      useUIStore.getState().setStatusMessage('BLOCK UPDATED');
    } else {
      // Normal move behavior
      cursorStore.moveCursorToRow(validRow);
      cursorStore.moveCursorToChannelAndColumn(channelIndex, columnType as any);
    }
  }, [pattern, isMobile, moveCursorToChannelAndColumn]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!containerRef.current) return;

    // During playback, the native wheel handler (useEffect below) routes to
    // TrackerScratchController. Don't also scroll rows — that would fight.
    if (useTransportStore.getState().isPlaying) return;
    
    // Vertical scroll moves rows
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      const rows = Math.round(e.deltaY / 20);
      if (rows !== 0) {
        const cursor = cursorRef.current;
        const newRow = Math.max(0, Math.min(pattern.length - 1, cursor.rowIndex + rows));
        useCursorStore.getState().moveCursorToRow(newRow);
      }
    }
  }, [pattern?.length]);

  // Mobile swipe handlers for pattern data (column navigation)
  const handleDataSwipeLeft = useCallback(() => {
    if (!pattern || !isMobile) return;
    
    const cursor = cursorRef.current;
    const mobileChannelIndex = cursor.channelIndex;
    
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
      useCursorStore.getState().moveCursorToColumn(columnOrder[currentIndex + 1]);
    } else {
      // Move to next channel's note column
      const nextChannel = Math.min(pattern.channels.length - 1, mobileChannelIndex + 1);
      if (nextChannel !== mobileChannelIndex) {
        moveCursorToChannelAndColumn(nextChannel, 'note');
      }
    }
  }, [pattern, isMobile, moveCursorToChannelAndColumn]);

  const handleDataSwipeRight = useCallback(() => {
    if (!pattern || !isMobile) return;
    
    const cursor = cursorRef.current;
    const mobileChannelIndex = cursor.channelIndex;
    
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
      useCursorStore.getState().moveCursorToColumn(columnOrder[currentIndex - 1]);
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
  }, [pattern, isMobile, moveCursorToChannelAndColumn]);

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
    const cursor = cursorRef.current;
    const selection = useCursorStore.getState().selection;
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
  }, [cellContextMenu, cellContextMenu.cellInfo, cellContextMenu.cellInfo?.channelIndex, pattern]);

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
      channelLayout.scrollLeft = targetScroll;
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
      rowCurrent:          theme.colors.trackerRowCurrent,
      bg:                  theme.colors.trackerRowEven,
      rowNormal:           theme.colors.trackerRowOdd,
      rowHighlight:        theme.colors.trackerRowHighlight,
      rowSecondaryHighlight: lightenHex(theme.colors.trackerRowHighlight, 20),
      border:              theme.colors.border,
      trackerBorder:       theme.colors.trackerBorder,
      textNote:            theme.colors.textSecondary,
      textNoteActive:      theme.colors.text,
      textMuted:           theme.colors.cellEmpty,
      textInstrument:      theme.colors.cellInstrument,
      textVolume:          theme.colors.cellVolume,
      textEffect:          theme.colors.cellEffect,
      lineNumber:          theme.colors.textMuted,
      lineNumberHighlight: theme.colors.accentSecondary,
      selection:           theme.colors.accentGlow,
      bookmark:            theme.colors.warning,
    };
  }, [getCurrentTheme]);

  const snapshotUI = useCallback((): UIStateSnapshot => {
    const ui = useUIStore.getState();
    const settings = useSettingsStore.getState();
    const editor = useEditorStore.getState();
    const base: UIStateSnapshot = {
      useHex:             ui.useHexNumbers,
      blankEmpty:         ui.blankEmptyCells,
      showGhostPatterns:  isFormatMode ? false : editor.showGhostPatterns,
      columnVisibility:   editor.columnVisibility,
      trackerVisualBg:    settings.trackerVisualBg,
      recordMode:         editor.recordMode,
      rowHeight:          Math.round(24 * (ui.trackerZoom / 100)),
      rowHighlightInterval: ui.rowHighlightInterval,
      rowSecondaryHighlightInterval: ui.rowSecondaryHighlightInterval,
      showBeatLabels:     ui.showBeatLabels,
      noteDisplayOffset:  getTrackerReplayer().getSong()?.noteDisplayOffset ?? 0,
      bookmarks:          editor.bookmarks,
    };
    if (isFormatMode && formatColumns) {
      base.columns = formatColumns.map(toColumnSpec);
    }
    return base;
  }, [isFormatMode, formatColumns]);

  // Per-pattern snapshot cache for worker bridge path
  const workerPatternCacheRef = useRef(new Map<unknown, PatternSnapshot>());

  const snapshotPatterns = useCallback((): PatternSnapshot[] => {
    const state = useTrackerStore.getState();
    const cache = workerPatternCacheRef.current;
    const result = state.patterns.map((p) => {
      const cached = cache.get(p);
      if (cached) return cached;
      const snap: PatternSnapshot = {
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
          noteCols: ch.channelMeta?.noteCols,
          rows: ch.rows.map((cell): CellSnapshot => ({
            note: cell.note ?? 0,
            instrument: cell.instrument ?? 0,
            volume: cell.volume ?? 0,
            effTyp: cell.effTyp ?? 0,
            eff: cell.eff ?? 0,
            effTyp2: cell.effTyp2 ?? 0,
            eff2: cell.eff2 ?? 0,
            effTyp3: cell.effTyp3,
            eff3: cell.eff3,
            effTyp4: cell.effTyp4,
            eff4: cell.eff4,
            effTyp5: cell.effTyp5,
            eff5: cell.eff5,
            note2: cell.note2, instrument2: cell.instrument2, volume2: cell.volume2,
            note3: cell.note3, instrument3: cell.instrument3, volume3: cell.volume3,
            note4: cell.note4, instrument4: cell.instrument4, volume4: cell.volume4,
            flag1: cell.flag1,
            flag2: cell.flag2,
            probability: cell.probability,
          })),
        })),
      };
      cache.set(p, snap);
      return snap;
    });
    // Evict stale entries
    const livePatterns = new Set(state.patterns);
    for (const key of cache.keys()) {
      if (!livePatterns.has(key as typeof state.patterns[0])) {
        cache.delete(key);
      }
    }
    return result;
  }, []);

  const snapshotFormatPatterns = useCallback((): PatternSnapshot[] => {
    if (!formatColumns || !formatChannels) return [];
    return [formatChannelsToSnapshot(formatChannels, formatColumns)];
  }, [formatColumns, formatChannels]);

  const snapshotLayout = useCallback((): ChannelLayoutSnapshot => ({
    offsets: channelOffsets,
    widths:  channelWidths,
    totalWidth: totalChannelsWidth,
  }), [channelOffsets, channelWidths, totalChannelsWidth]);

  // Channel context menu handlers — work in both normal and format modes
  const handleFillPattern = useCallback((channelIndex: number, generatorType: GeneratorType) => {
    const fmtCh = isFormatMode ? formatChannelsRef.current?.[channelIndex] : undefined;
    const fmtChange = onFormatCellChangeRef.current;
    if (isFormatMode && fmtCh && fmtChange) {
      const generator = GENERATORS[generatorType];
      if (!generator) return;
      const cells = generator.generate({ patternLength: fmtCh.patternLength, instrumentId: 1, note: 49, velocity: 0x40 });
      const cols = fmtCh.columns ?? formatColumns;
      cells.forEach((cell, row) => {
        if (row >= fmtCh.patternLength) return;
        const noteCol = cols?.find(c => c.type === 'note');
        if (noteCol && cell.note) fmtChange(channelIndex, row, noteCol.key, cell.note);
        const insCol = cols?.find(c => c.key === 'instrument');
        if (insCol && cell.instrument) fmtChange(channelIndex, row, insCol.key, cell.instrument);
      });
      return;
    }
    if (!pattern) return;
    const generator = GENERATORS[generatorType];
    if (!generator) return;
    const channel = pattern.channels[channelIndex];
    const instrumentId = channel.instrumentId ?? 1;
    const cells = generator.generate({ patternLength: pattern.length, instrumentId, note: 49, velocity: 0x40 });
    cells.forEach((cell, row) => { setCell(channelIndex, row, cell); });
  }, [pattern, setCell, isFormatMode, formatColumns]);

  const handleClearChannel = useCallback((channelIndex: number) => {
    const fmtCh = isFormatMode ? formatChannelsRef.current?.[channelIndex] : undefined;
    const fmtChange = onFormatCellChangeRef.current;
    if (isFormatMode && fmtCh && fmtChange) {
      const cols = fmtCh.columns ?? formatColumns;
      for (let row = 0; row < fmtCh.patternLength; row++) {
        cols?.forEach(col => fmtChange(channelIndex, row, col.key, col.emptyValue ?? 0));
      }
      useUIStore.getState().setStatusMessage('CHANNEL CLEARED');
      return;
    }
    if (!pattern) return;
    for (let row = 0; row < pattern.length; row++) {
      setCell(channelIndex, row, { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
    }
    useUIStore.getState().setStatusMessage('CHANNEL CLEARED');
  }, [pattern, setCell, isFormatMode, formatColumns]);

  const handleCopyChannel = useCallback((channelIndex: number) => {
    if (isFormatMode) {
      const fmtCh = formatChannelsRef.current?.[channelIndex];
      if (fmtCh) {
        const cols = fmtCh.columns ?? formatColumns;
        const clipboard: Record<string, number>[] = [];
        for (let r = 0; r < fmtCh.patternLength; r++) {
          const entry: Record<string, number> = {};
          cols?.forEach(col => { entry[col.key] = fmtCh.rows[r]?.[col.key] ?? (col.emptyValue ?? 0); });
          clipboard.push(entry);
        }
        formatClipboardRef.current = clipboard;
        useUIStore.getState().setStatusMessage('CHANNEL COPIED');
      }
      return;
    }
    copyTrack(channelIndex);
  }, [copyTrack, isFormatMode, formatColumns]);

  const handleCutChannel = useCallback((channelIndex: number) => {
    if (isFormatMode) {
      handleCopyChannel(channelIndex);
      handleClearChannel(channelIndex);
      useUIStore.getState().setStatusMessage('CHANNEL CUT');
      return;
    }
    cutTrack(channelIndex);
  }, [cutTrack, isFormatMode, handleCopyChannel, handleClearChannel]);

  const handlePasteChannel = useCallback((channelIndex: number) => {
    const fmtChange = onFormatCellChangeRef.current;
    if (isFormatMode && fmtChange) {
      const clipboard = formatClipboardRef.current;
      const fmtCh = formatChannelsRef.current?.[channelIndex];
      if (!clipboard || clipboard.length === 0 || !fmtCh) return;
      const len = Math.min(clipboard.length, fmtCh.patternLength);
      for (let row = 0; row < len; row++) {
        const entry = clipboard[row];
        for (const [key, value] of Object.entries(entry)) {
          fmtChange(channelIndex, row, key, value as number);
        }
      }
      useUIStore.getState().setStatusMessage('CHANNEL PASTED');
      return;
    }
    pasteTrack(channelIndex);
  }, [pasteTrack, isFormatMode]);

  const handleTranspose = useCallback((channelIndex: number, semitones: number) => {
    const fmtCh = isFormatMode ? formatChannelsRef.current?.[channelIndex] : undefined;
    const fmtChange = onFormatCellChangeRef.current;
    if (isFormatMode && fmtCh && fmtChange) {
      const cols = fmtCh.columns ?? formatColumns;
      const noteCol = cols?.find(c => c.type === 'note');
      if (!noteCol) return;
      for (let row = 0; row < fmtCh.patternLength; row++) {
        const note = fmtCh.rows[row]?.[noteCol.key] ?? 0;
        if (note > 0 && note < 0xBD) {
          const newNote = Math.max(1, Math.min(0xBC, note + semitones));
          fmtChange(channelIndex, row, noteCol.key, newNote);
        }
      }
      useUIStore.getState().setStatusMessage(`TRANSPOSE ${semitones > 0 ? '+' : ''}${semitones}`);
      return;
    }
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
  }, [pattern, setCell, isFormatMode, formatColumns]);

  const handleHumanize = useCallback((channelIndex: number) => {
    if (isFormatMode) {
      useUIStore.getState().setStatusMessage('HUMANIZE N/A');
      return;
    }
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
  }, [pattern, setCell, isFormatMode]);

  const handleInterpolate = useCallback((channelIndex: number) => {
    if (isFormatMode) {
      useUIStore.getState().setStatusMessage('INTERPOLATE N/A');
      return;
    }
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
  }, [pattern, setCell, isFormatMode]);

  // B/D Animation handler wrappers - use full channel or selection range
  const getBDAnimationOptions = useCallback((channelIndex: number) => {
    const selection = selectionRef.current;
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
  }, [currentPatternIndex, pattern?.length]);

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

    // Feature-detect OffscreenCanvas transfer support.
    // iOS Safari supports OffscreenCanvas but WebGL2 on OffscreenCanvas in a Worker
    // hangs silently — skip the worker on iOS entirely.
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (isIOS || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) {
      console.warn('[PatternEditorCanvas] OffscreenCanvas worker skipped (iOS or unsupported)');
      // Clear any stale children before React renders fallback table
      while (container.firstChild) container.removeChild(container.firstChild);
      setWebglUnsupported(true);
      return;
    }

    // Create canvas imperatively — prevents StrictMode double-transferControlToOffscreen error
    const canvas = document.createElement('canvas');
    canvas.style.cssText = `display:block;width:${dimensions.width}px;height:${dimensions.height}px;`;
    canvas.oncontextmenu = (e) => e.preventDefault();
    container.appendChild(canvas);
    canvasRef.current = canvas;

    let readyReceived = false;
    const readyTimeoutId = setTimeout(() => {
      if (!readyReceived) {
        reportSynthError(
          'Tracker Worker',
          'Pattern editor failed to start (no ready signal after 10 s). ' +
          'Try reloading the page. If this persists, your browser may not support OffscreenCanvas WebGL2.',
          { errorType: 'init', debugData: { offscreenCanvasSupported: true } },
        );
      }
    }, 10_000);

    const bridge = new TrackerOffscreenBridge(TrackerWorkerFactory, {
      onReady: () => {
        readyReceived = true;
        clearTimeout(readyTimeoutId);
        // Worker is ready — send layout so it can start rendering
        bridge.post({ type: 'channelLayout', channelLayout: snapshotLayout() });
      },
      onMessage: (msg) => {
        if (msg.type === 'webgl-unsupported') {
          clearTimeout(readyTimeoutId);
          setWebglUnsupported(true);
        } else if (msg.type === 'error') {
          clearTimeout(readyTimeoutId);
          reportSynthError(
            'Tracker Worker',
            msg.message,
            { errorType: 'init' },
          );
        }
      },
      onError: (err) => {
        clearTimeout(readyTimeoutId);
        reportSynthError(
          'Tracker Worker',
          err.message || 'Pattern editor worker crashed unexpectedly.',
          { errorType: 'runtime', debugData: { filename: err.filename, lineno: err.lineno } },
        );
      },
    });
    bridgeRef.current = bridge;

    // Defer canvas transfer + init to the next task — flex layout hasn't run
    // yet at mount time, so clientWidth/clientHeight are 0 if read
    // synchronously (the ResizeObserver corrects this anyway).
    // NOTE: requestAnimationFrame is NOT used here because it is paused
    // indefinitely in background tabs, causing the 10 s ready-timeout to fire
    // before the init message is ever sent.  setTimeout(0) throttles to ~1 s
    // in background tabs (well within the 10 s window) and fires immediately
    // when foregrounded.
    const initTimerId = setTimeout(() => {
      try {
      const dpr   = window.devicePixelRatio || 1;
      const w     = Math.max(1, container.clientWidth);
      const h     = Math.max(1, container.clientHeight);
      const state = useTrackerStore.getState();
      const cursorState = useCursorStore.getState();

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
          patterns:           isFormatMode ? snapshotFormatPatterns() : snapshotPatterns(),
          currentPatternIndex: isFormatMode ? 0 : state.currentPatternIndex,
          cursor: isFormatMode ? {
            rowIndex: 0, channelIndex: 0, columnType: '0', digitIndex: 0, noteColumnIndex: 0,
          } : {
            rowIndex:    cursorState.cursor.rowIndex,
            channelIndex: cursorState.cursor.channelIndex,
            columnType:  cursorState.cursor.columnType,
            digitIndex:  cursorState.cursor.digitIndex,
            noteColumnIndex: cursorState.cursor.noteColumnIndex ?? 0,
          },
          selection: isFormatMode ? (formatSelection ? {
            startChannel: formatCursor.channelIndex,
            endChannel:   formatCursor.channelIndex,
            startRow:     formatSelection.startRow,
            endRow:       formatSelection.endRow,
          } : null) : (cursorState.selection ? {
            startChannel: cursorState.selection.startChannel,
            endChannel:   cursorState.selection.endChannel,
            startRow:     cursorState.selection.startRow,
            endRow:       cursorState.selection.endRow,
            columnTypes:  cursorState.selection.columnTypes,
          } : null),
          channelLayout: snapshotLayout(),
        },
        [offscreen],
      );
      } catch (initErr) {
        clearTimeout(readyTimeoutId);
        reportSynthError(
          'Tracker Worker',
          `Worker init failed: ${(initErr as Error)?.message ?? String(initErr)}`,
          { errorType: 'init' },
        );
      }
    }, 0);

    // Subscribe to tracker store — post pattern/ui deltas
    const unsubTracker = useTrackerStore.subscribe((s, prev) => {
      if (isFormatModeRef.current) return;
      const b = bridgeRef.current;
      if (!b) return;
      if (s.patterns !== prev.patterns || s.currentPatternIndex !== prev.currentPatternIndex) {
        b.post({ type: 'patterns', patterns: snapshotPatterns(), currentPatternIndex: s.currentPatternIndex });
        // Re-send uiState when song changes — noteDisplayOffset may differ per format
        b.post({ type: 'uiState', uiState: snapshotUI() });
      }
    });

    const unsubEditor = useEditorStore.subscribe((s, prev) => {
      if (isFormatModeRef.current) return;
      const b = bridgeRef.current;
      if (!b) return;
      if (s.columnVisibility !== prev.columnVisibility || s.showGhostPatterns !== prev.showGhostPatterns || s.recordMode !== prev.recordMode || s.bookmarks !== prev.bookmarks) {
        b.post({ type: 'uiState', uiState: snapshotUI() });
      }
    });

    // Subscribe to cursor store — post cursor/selection deltas
    const unsubCursor = useCursorStore.subscribe((s, prev) => {
      if (isFormatModeRef.current) return;
      const b = bridgeRef.current;
      if (!b) return;
      // Send cursor updates — during playback only channel/column changes matter
      // (row follows playback), but we still need to tell the worker
      if (s.cursor !== prev.cursor) {
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
    });

    // Subscribe to UI store
    const unsubUI = useUIStore.subscribe((s, prev) => {
      if (isFormatModeRef.current) return;
      if (s.useHexNumbers !== prev.useHexNumbers || s.blankEmptyCells !== prev.blankEmptyCells
          || s.trackerZoom !== prev.trackerZoom || s.rowHighlightInterval !== prev.rowHighlightInterval
          || s.showBeatLabels !== prev.showBeatLabels
          || s.showAutomationLanes !== prev.showAutomationLanes || s.showMacroLanes !== prev.showMacroLanes) {
        bridgeRef.current?.post({ type: 'uiState', uiState: snapshotUI() });
      }
    });

    // Subscribe to settings store
    const unsubSettings = useSettingsStore.subscribe((s, prev) => {
      if (isFormatModeRef.current) return;
      if (s.trackerVisualBg !== prev.trackerVisualBg) {
        bridgeRef.current?.post({ type: 'uiState', uiState: snapshotUI() });
      }
    });

    return () => {
      clearTimeout(initTimerId);
      clearTimeout(readyTimeoutId);
      unsubTracker();
      unsubEditor();
      unsubCursor();
      unsubUI();
      unsubSettings();
      bridge.dispose();
      bridgeRef.current = null;
      if (canvasRef.current && containerRef.current?.contains(canvas)) {
        canvas.remove();
      }
      canvasRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // ─── iOS/Canvas2D main-thread renderer ────────────────────────────────────
  // When WebGL2+OffscreenCanvas worker is unavailable, create a Canvas2D renderer
  // directly on the main thread. Reads stores in a RAF loop (same data as worker).
  useEffect(() => {
    if (!webglUnsupported) return;
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;position:relative;z-index:0;';
    canvas.oncontextmenu = (e) => e.preventDefault();
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    const renderer = new TrackerCanvas2DRenderer(canvas, true /* mobile */);
    renderer.resize(w, h, dpr);
    mainThreadRendererRef.current = renderer;

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        const rw = Math.max(1, Math.round(cr.width));
        const rh = Math.max(1, Math.round(cr.height));
        const rdpr = window.devicePixelRatio || 1;
        canvas.style.width = `${rw}px`;
        canvas.style.height = `${rh}px`;
        renderer.resize(rw, rh, rdpr);
        setDimensions({ width: rw, height: rh });
      }
    });
    ro.observe(container);

    // Throttle to ~30fps for battery on iOS
    const MIN_FRAME_MS = 33;
    let lastFrame = 0;

    // ── Dirty-flag state — skip rendering when nothing changed ─────
    let prevPatternsRef: unknown = null;   // tracker store .patterns identity
    let prevPatIdx = -1;
    let prevCursorRef: unknown = null;     // cursor store .cursor identity
    let prevSelectionRef: unknown = null;  // cursor store .selection identity
    let prevPlayRow = -1;
    let prevPlaying = false;
    let prevThemeId: unknown = null;       // theme store identity
    let prevFormatChannels: unknown = null;
    let prevFormatCursorRow = -1;          // format mode cursor row
    let prevFormatCursorCh = -1;           // format mode cursor channel
    let cachedPatterns: PatternSnapshot[] = [];
    // Per-pattern snapshot cache — only re-snapshot patterns whose identity changed
    const patternSnapshotCache = new Map<unknown, PatternSnapshot>();
    let cachedTheme: ThemeSnapshot | null = null;
    let cachedUI: UIStateSnapshot | null = null;
    let prevUIHex: unknown = null;
    let prevUIZoom: unknown = null;
    let prevRecordMode: unknown = null;
    let needsRender = true; // Force first frame

    const tick = (now: number) => {
      if (now - lastFrame < MIN_FRAME_MS) {
        mainThreadRafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastFrame = now;

      // ── Read playback state ────────────────────────────────────────
      let playRow = 0;
      let smoothOffset = 0;
      let playPatIdx = 0;
      let isPlaying = false;

      if (isFormatModeRef.current) {
        const fps = getFormatPlaybackState();
        // Respect the formatIsPlaying prop — the track table matrix passes false
        // to prevent it from scrolling when FormatPlaybackState is globally active.
        const fpsActive = fps.isPlaying && formatIsPlayingRef.current;
        isPlaying = fpsActive;
        playRow = fpsActive ? fps.row : formatCurrentRowRef.current;
        if (fpsActive && fps.rowDuration > 0) {
          const ts = useTransportStore.getState();
          if (ts.smoothScrolling) {
            const now = performance.now();
            const clock = getClockPosition(now);
            playRow = clock.row;
            smoothOffset = clock.progress * rowHeightRef.current;
          }
        }
      } else {
        const ts = useTransportStore.getState();
        isPlaying = ts.isPlaying;
        if (isPlaying) {
          const scratch = getTrackerScratchController();
          if (scratch.isActive) {
            const ss = scratch.getScratchDisplayState(rowHeightRef.current);
            if (ss) { playRow = ss.row; playPatIdx = ss.pattern; smoothOffset = ss.smoothOffset; }
          } else {
            const replayer = getTrackerReplayer();
            const audioTime = Tone.now() + 0.01;
            const audioState = replayer.getStateAtTime(audioTime);
            if (audioState) {
              playRow = audioState.row;
              playPatIdx = audioState.pattern;
              if (ts.smoothScrolling && audioState.duration > 0) {
                const progress = Math.min(Math.max((audioTime - audioState.time) / audioState.duration, 0), 1);
                smoothOffset = progress * rowHeightRef.current;
              }
            } else {
              playRow = ts.currentRow;
            }
          }
        }
      }

      // ── Dirty checks — detect if anything changed since last frame ─
      const trackerState = useTrackerStore.getState();
      const cs = useCursorStore.getState();
      const themeStore = useThemeStore.getState();
      const uiStore = useUIStore.getState();
      const editorState = useEditorStore.getState();

      if (trackerState.patterns !== prevPatternsRef ||
          trackerState.currentPatternIndex !== prevPatIdx ||
          formatChannelsRef.current !== prevFormatChannels) {
        prevPatternsRef = trackerState.patterns;
        prevPatIdx = trackerState.currentPatternIndex;
        prevFormatChannels = formatChannelsRef.current;
        // Re-snapshot patterns — use per-pattern identity cache to avoid
        // re-copying unchanged patterns (biggest perf win for large songs)
        if (isFormatModeRef.current && formatPatternSnapshotRef.current.length > 0) {
          cachedPatterns = formatPatternSnapshotRef.current;
        } else {
          cachedPatterns = trackerState.patterns.map((p) => {
            const cached = patternSnapshotCache.get(p);
            if (cached) return cached;
            const snap: PatternSnapshot = {
              id: p.id,
              length: p.length,
              channels: p.channels.map((ch): ChannelSnapshot => ({
                id: ch.id, name: ch.name, color: ch.color ?? undefined,
                muted: ch.muted, solo: ch.solo, collapsed: ch.collapsed,
                effectCols: ch.channelMeta?.effectCols ?? 2,
                noteCols: ch.channelMeta?.noteCols,
                rows: ch.rows.map((cell): CellSnapshot => ({
                  note: cell.note ?? 0, instrument: cell.instrument ?? 0,
                  volume: cell.volume ?? 0, effTyp: cell.effTyp ?? 0, eff: cell.eff ?? 0,
                  effTyp2: cell.effTyp2 ?? 0, eff2: cell.eff2 ?? 0,
                  effTyp3: cell.effTyp3, eff3: cell.eff3,
                  effTyp4: cell.effTyp4, eff4: cell.eff4,
                  effTyp5: cell.effTyp5, eff5: cell.eff5,
                  note2: cell.note2, instrument2: cell.instrument2, volume2: cell.volume2,
                  note3: cell.note3, instrument3: cell.instrument3, volume3: cell.volume3,
                  note4: cell.note4, instrument4: cell.instrument4, volume4: cell.volume4,
                  flag1: cell.flag1, flag2: cell.flag2, probability: cell.probability,
                })),
              })),
            };
            patternSnapshotCache.set(p, snap);
            return snap;
          });
          // Evict stale entries from cache
          const livePatterns = new Set(trackerState.patterns);
          for (const key of patternSnapshotCache.keys()) {
            if (!livePatterns.has(key as typeof trackerState.patterns[0])) {
              patternSnapshotCache.delete(key);
            }
          }
        }
        needsRender = true;
      }

      if (cs.cursor !== prevCursorRef) { prevCursorRef = cs.cursor; needsRender = true; }
      if (cs.selection !== prevSelectionRef) { prevSelectionRef = cs.selection; needsRender = true; }
      // Format mode cursor changed (arrow key navigation when not playing)
      if (isFormatModeRef.current) {
        const fc = formatCursorRef.current;
        if (fc.rowIndex !== prevFormatCursorRow || fc.channelIndex !== prevFormatCursorCh) {
          prevFormatCursorRow = fc.rowIndex;
          prevFormatCursorCh = fc.channelIndex;
          needsRender = true;
        }
      }
      if (playRow !== prevPlayRow || isPlaying !== prevPlaying) {
        prevPlayRow = playRow; prevPlaying = isPlaying; needsRender = true;
      }
      if (themeStore !== prevThemeId) { prevThemeId = themeStore; cachedTheme = null; needsRender = true; }
      if (uiStore.useHexNumbers !== prevUIHex || uiStore.trackerZoom !== prevUIZoom) {
        prevUIHex = uiStore.useHexNumbers; prevUIZoom = uiStore.trackerZoom;
        cachedUI = null; needsRender = true;
      }
      if (editorState.recordMode !== prevRecordMode) {
        prevRecordMode = editorState.recordMode; cachedUI = null; needsRender = true;
      }

      // During playback, always render for smooth scrolling
      if (isPlaying) needsRender = true;

      if (!needsRender) {
        mainThreadRafRef.current = requestAnimationFrame(tick);
        return;
      }
      needsRender = false;

      // ── Read cursor/selection ──────────────────────────────────────
      const cursor = isFormatModeRef.current
        ? { rowIndex: formatCurrentRowRef.current, channelIndex: formatCursorRef.current.channelIndex, columnType: '0', digitIndex: 0, noteColumnIndex: 0 }
        : { rowIndex: cs.cursor.rowIndex, channelIndex: cs.cursor.channelIndex,
            columnType: cs.cursor.columnType, digitIndex: cs.cursor.digitIndex,
            noteColumnIndex: cs.cursor.noteColumnIndex ?? 0 };

      const patIdx = isFormatModeRef.current ? 0 : trackerState.currentPatternIndex;

      // Cache theme/ui snapshots
      if (!cachedTheme) cachedTheme = snapshotTheme();
      if (!cachedUI) cachedUI = snapshotUI();

      // ── Render ─────────────────────────────────────────────────────
      renderer.render({
        patterns: cachedPatterns,
        currentPatternIndex: patIdx,
        scrollX: 0,
        cursor,
        selection: cs.selection ? {
          startChannel: cs.selection.startChannel, endChannel: cs.selection.endChannel,
          startRow: cs.selection.startRow, endRow: cs.selection.endRow,
          columnTypes: cs.selection.columnTypes,
        } : null,
        playback: { row: playRow, smoothOffset, patternIndex: playPatIdx, isPlaying },
        theme: cachedTheme,
        ui: cachedUI,
        layout: { offsets: channelOffsetsRef.current, widths: channelWidthsRef.current, totalWidth: totalChannelsWidth },
        dragOver: null,
      });

      mainThreadRafRef.current = requestAnimationFrame(tick);
    };

    mainThreadRafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(mainThreadRafRef.current);
      ro.disconnect();
      renderer.dispose();
      mainThreadRendererRef.current = null;
      if (canvasRef.current && container.contains(canvas)) {
        canvas.remove();
      }
      canvasRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webglUnsupported]);

  // Native contextmenu listener — reliably prevents browser native menu on all elements
  // including imperatively-created canvas elements that React synthetic events may miss
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (e: Event) => { e.preventDefault(); };
    container.addEventListener('contextmenu', handler, true);
    return () => container.removeEventListener('contextmenu', handler, true);
  }, []);

  // Forward layout changes to worker when channel widths/offsets change
  useEffect(() => {
    bridgeRef.current?.post({ type: 'channelLayout', channelLayout: snapshotLayout() });
  }, [snapshotLayout]);

  // Format mode: re-sync columns/channels/layout when props change
  useEffect(() => {
    if (!isFormatMode) return;
    const bridge = bridgeRef.current;
    if (!bridge) return;
    bridge.post({ type: 'uiState', uiState: snapshotUI() });
    bridge.post({
      type: 'patterns',
      patterns: snapshotFormatPatterns(),
      currentPatternIndex: 0,
    });
    bridge.post({ type: 'channelLayout', channelLayout: snapshotLayout() });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFormatMode, formatColumns, formatChannels]);

  // Format mode: sync cursor to worker
  useEffect(() => {
    if (!isFormatMode) return;
    bridgeRef.current?.post({
      type: 'cursor',
      cursor: {
        rowIndex:     formatCursor.rowIndex,
        channelIndex: formatCursor.channelIndex,
        columnType:   String(formatCursor.columnIndex),
        digitIndex:   0,
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFormatMode, formatCursor]);

  // Format mode: sync selection to worker
  useEffect(() => {
    if (!isFormatMode) return;
    bridgeRef.current?.post({
      type: 'selection',
      selection: formatSelection ? {
        startChannel: formatCursor.channelIndex,
        endChannel:   formatCursor.channelIndex,
        startRow:     formatSelection.startRow,
        endRow:       formatSelection.endRow,
        columnTypes:  undefined,
      } : null,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFormatMode, formatSelection, formatCursor.channelIndex]);


  // ─── Thin overlay RAF (updates macroOverlayRef + posts playback state) ─────
  // This runs on the main thread to update overlay DOM positions (macroLanes)
  // synchronously with audio. The worker computes its own smooth scrolling.
  useEffect(() => {
    let rafId: number;
    // PERF: Dedup playback messages — only post row/pattern when they change
    let prevRow = -1;
    let prevPattern = -1;
    let prevPlaying = false;

    const tick = () => {
      // FORMAT MODE: use format engine's playback state (skip all tracker store reads)
      if (isFormatModeRef.current) {
        const bridge = bridgeRef.current;

        if (bridge) {
          // FIX: If formatChannels changed since last send, post 'patterns' FIRST so
          // the worker always has correct data before receiving the new playback row.
          // (useEffect posts 'patterns' after paint; RAF fires before paint — wrong order.)
          // Use refs (not closure values) so we always compare against the current render.
          const currentChannels = formatChannelsRef.current;
          if (currentChannels !== formatChannelsSentRef.current) {
            formatChannelsSentRef.current = currentChannels;
            bridge.post({
              type: 'patterns',
              patterns: formatPatternSnapshotRef.current,
              currentPatternIndex: 0,
            });
            bridge.post({ type: 'channelLayout', channelLayout: snapshotLayout() });
            // Force a playback send on channel change to update worker position
            prevRow = -1;
          }

          // Row comes from playback state when playing, or internal cursor when stopped.
          // During playback, a free-running clock in FormatPlaybackState drives
          // BOTH the row number and smooth offset at a perfectly constant rate.
          // This eliminates poll-jitter (the clock advances at exactly rowDuration
          // ms per row regardless of when the engine poll detects the change).
          const fps = getFormatPlaybackState();
          const fpsSmooth = fps.isPlaying && formatIsPlayingRef.current;
          const newPlaying = formatIsPlayingRef.current;
          let newRow = fpsSmooth ? fps.row : formatCurrentRowRef.current;
          let smoothOffset = 0;

          if (fpsSmooth && fps.rowDuration > 0) {
            const transportState = useTransportStore.getState();
            if (transportState.smoothScrolling) {
              // Smooth scrolling: clock provides constant-rate row + sub-pixel offset
              const now = performance.now();
              const clock = getClockPosition(now);
              newRow = clock.row;
              smoothOffset = clock.progress * rowHeightRef.current;
            }
            // Stepped scrolling (default): fps.row from audio callback is used
            // directly — steps at audio-clock rate, same as GT Ultra
          }

          // Send EVERY frame during playback for smooth scrolling; dedup when stopped
          const shouldSend = newPlaying ||
            newRow !== prevRow || newPlaying !== prevPlaying;
          if (shouldSend) {
            prevRow     = newRow;
            prevPlaying = newPlaying;
            bridge.post({
              type: 'playback',
              row: newRow,
              smoothOffset,
              patternIndex: 0,
              isPlaying: newPlaying,
            });
            // When not playing (includes stop transition), sync cursor position
            // so arrow key navigation scrolls the view. Worker renderers use
            // cursor.rowIndex when !isPlaying, but format mode skips the normal
            // cursor→worker subscription, so we push it here.
            if (!newPlaying) {
              bridge.post({ type: 'cursor', cursor: {
                rowIndex:     formatCurrentRowRef.current,
                channelIndex: formatCursorRef.current.channelIndex,
                columnType:   '0',
                digitIndex:   0,
              }});
            }
          }
        }

        rafId = requestAnimationFrame(tick);
        return;
      }

      const transportState = useTransportStore.getState();
      const isPlaying      = transportState.isPlaying;

      // PERF: When idle, still update overlay positions for cursor movement
      // but skip expensive playback state reads.
      // Also check wasmPos.active — WASM engines (JamCracker etc.) don't set
      // transportStore.isPlaying (doing so causes infinite engine respawn),
      // so we must fall through to the main playback path when they're active.
      // wasmPos.active means a WASM engine is reporting position — allow scroll
      // EXCEPT for format-mode instances that aren't playing (e.g. trackstep matrix).
      const wasmPosEarly = useWasmPositionStore.getState();
      const wasmNeedsUpdate = wasmPosEarly.active && !(isFormatModeRef.current && !formatIsPlayingRef.current);
      if (!isPlaying && !prevPlaying && !wasmNeedsUpdate) {
        const cursorRow = useCursorStore.getState().cursor.rowIndex;
        const h = dimensions.height;
        const rh = rowHeightRef.current;
        const centerLineTop = Math.floor(h / 2) - rh / 2;
        const overlayTop = centerLineTop - cursorRow * rh;
        if (macroOverlayRef.current) {
          macroOverlayRef.current.style.top = `${overlayTop}px`;
        }
        if (automationOverlayRef.current) {
          automationOverlayRef.current.style.top = `${overlayTop - automationPrevLenRef.current * rowHeightRef.current}px`;
          // Live clipPath update — see playback branch for rationale
          const offsets = channelOffsetsRef.current;
          const widths = channelWidthsRef.current;
          if (offsets.length > 0 && widths.length > 0) {
            const leftClip = offsets[0] ?? LINE_NUMBER_WIDTH;
            const lastIdx = offsets.length - 1;
            const rightEdge = (offsets[lastIdx] ?? 0) + (widths[lastIdx] ?? 0);
            const rightClip = Math.max(0, dimensions.width - rightEdge);
            automationOverlayRef.current.style.clipPath = `inset(0px ${rightClip}px 0px ${leftClip}px)`;
          }
        }
        rafId = requestAnimationFrame(tick);
        return;
      }

      const trackerState   = useTrackerStore.getState();
      let currentRow   = useCursorStore.getState().cursor.rowIndex;
      let activePatternIdx = trackerState.currentPatternIndex;
      let smoothOffset = 0;
      let songPosition: number | undefined;

      // WASM engine position — check FIRST (bypasses replayer which returns stale state)
      // In format mode, allow wasmPos only when FormatPlaybackState is NOT driving scroll
      // (TFMX WASM playback uses wasmPos; UADE streaming uses FormatPlaybackState).
      const wasmPos = wasmPosEarly;
      const fpsIsActive = isFormatModeRef.current && formatIsPlayingRef.current;
      if (wasmPos.active && !fpsIsActive) {
        currentRow = wasmPos.row;
        // Use songPos to determine active pattern (multi-pattern WASM songs)
        const patternOrder = trackerState.patternOrder;
        if (wasmPos.songPos >= 0 && wasmPos.songPos < patternOrder.length) {
          activePatternIdx = patternOrder[wasmPos.songPos] ?? wasmPos.songPos;
          songPosition = wasmPos.songPos;
        }
      } else if (isPlaying) {
        // Check if scratch is active — use scratch position instead of replayer
        const scratch = getTrackerScratchController();
        if (scratch.isActive) {
          const scratchState = scratch.getScratchDisplayState(rowHeightRef.current);
          if (scratchState) {
            currentRow = scratchState.row;
            activePatternIdx = scratchState.pattern;
            smoothOffset = scratchState.smoothOffset;
          }
        } else {
          const replayer  = getTrackerReplayer();
          const audioTime = Tone.now() + 0.01;
          const audioState = replayer.getStateAtTime(audioTime);

          if (audioState) {
            currentRow       = audioState.row;
            activePatternIdx = audioState.pattern;
            songPosition     = audioState.position;

            // Compute smooth offset for worker rendering
            if (transportState.smoothScrolling && audioState.duration > 0) {
              const progress = Math.min(Math.max(
                (audioTime - audioState.time) / audioState.duration, 0), 1);
              smoothOffset = progress * rowHeightRef.current;
            }
          } else {
            // UADE / opaque playback: replayer has no state, use transport store row
            currentRow = transportState.currentRow;
          }
        }
      }

      // Send playback state to worker EVERY frame during playback
      // The main thread has accurate replayer state, worker just renders it
      // Treat WASM engine position as "playing" for the worker's rendering
      const effectiveIsPlaying = isPlaying || wasmPos.active;
      const shouldSendUpdate = effectiveIsPlaying ||
        currentRow !== prevRow ||
        activePatternIdx !== prevPattern ||
        effectiveIsPlaying !== prevPlaying;

      if (shouldSendUpdate) {
        if (!prevPlaying && effectiveIsPlaying) {
          console.log(`[Canvas DOM] playback started: row=${currentRow} pattern=${activePatternIdx} wasmActive=${wasmPos.active} bridge=${!!bridgeRef.current}`);
        }
        prevRow = currentRow;
        prevPattern = activePatternIdx;
        prevPlaying = effectiveIsPlaying;
        bridgeRef.current?.post({
          type:         'playback',
          row:          currentRow,
          smoothOffset, // Send the accurately computed offset
          patternIndex: activePatternIdx,
          isPlaying:    effectiveIsPlaying,
          bpm:          transportState.bpm,
          speed:        transportState.speed,
          smoothScrolling: transportState.smoothScrolling,
          songPosition,
        } as any);
      }

      // Update overlay positions — row 0 must align with where the canvas draws row 0.
      // Canvas draws row r at: baseY + (r - vStart) * rh.
      // Row 0 on canvas: baseY - vStart * rh = centerLineTop - currentRow * rh - smoothOffset.
      // Overlay has row r at internal y = r * rh, so overlay.top must equal that.

      const h = dimensions.height;
      const rh = rowHeightRef.current;
      const visibleLines = Math.ceil(h / rh) + 2;
      const topLines     = Math.floor(visibleLines / 2);
      const vStart       = currentRow - topLines;
      const centerLineTop = Math.floor(h / 2) - rh / 2;
      const baseY        = centerLineTop - topLines * rh - smoothOffset;
      const overlayTop   = centerLineTop - currentRow * rh - smoothOffset;

      scrollYRef.current       = baseY;
      visibleStartRef.current  = vStart;
      if (macroOverlayRef.current) {
        macroOverlayRef.current.style.top = `${overlayTop}px`;
      }
      if (automationOverlayRef.current) {
        // Subtract prevLen so AutomationLanes' internal top:prevLen*rh
        // lands exactly on the current pattern's row 0 — keeping the
        // ghost prev/next sections aligned with the cell ghost regions.
        automationOverlayRef.current.style.top = `${overlayTop - automationPrevLenRef.current * rh}px`;
        // Update clipPath imperatively from current refs so it always matches
        // the live channel layout, even right after a fullscreen toggle.
        const offsets = channelOffsetsRef.current;
        const widths = channelWidthsRef.current;
        if (offsets.length > 0 && widths.length > 0) {
          const leftClip = offsets[0] ?? LINE_NUMBER_WIDTH;
          const lastIdx = offsets.length - 1;
          const rightEdge = (offsets[lastIdx] ?? 0) + (widths[lastIdx] ?? 0);
          const rightClip = Math.max(0, dimensions.width - rightEdge);
          automationOverlayRef.current.style.clipPath = `inset(0px ${rightClip}px 0px ${leftClip}px)`;
        }
      }

      // Peer cursor overlay — thin caret at peer's channel + row
      if (peerCursorDivRef.current) {
        const pc = peerCursorRef.current;
        const curPatIdx = useTrackerStore.getState().currentPatternIndex;
        const offsets = channelOffsetsRef.current;
        if (pc.active && pc.patternIndex === curPatIdx && offsets.length > pc.channel) {
          const py = baseY + (pc.row - vStart) * rh;
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
            const top    = baseY + (startRow - vStart) * rh;
            const height = (endRow - startRow + 1) * rh;
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
  }, [dimensions.height, dimensions.width]); // re-run if dimensions change


  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
          // Post resize directly to worker to avoid React re-render delay —
          // critical on first layout when the worker may have been init'd with
          // height=1, causing the center line to fill the entire viewport.
          const dpr = window.devicePixelRatio || 1;
          bridgeRef.current?.post({ type: 'resize', w: width, h: height, dpr });
          if (canvasRef.current) {
            canvasRef.current.style.width  = `${width}px`;
            canvasRef.current.style.height = `${height}px`;
          }
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

  // Reset horizontal scroll when all channels fit in viewport
  useEffect(() => {
    if (allChannelsFit && scrollLeft > 0) {
      scrollLeftRef.current = 0;
      channelLayout.scrollLeft = 0;
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
      const uiState = useUIStore.getState();
      const isDJView = uiState.activeView === 'dj';
      const scratchToggleOn = uiState.scratchEnabled;

      // Determine if scratch should be active:
      // - Always in DJ view
      // - Always if scratch toggle is ON
      // - Only during playback if toggle is OFF
      const shouldUseScratch = isDJView || scratchToggleOn || isPlaying;

      // Route vertical scroll to scratch controller when appropriate
      if (shouldUseScratch && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const scratch = getTrackerScratchController();
        scratch.onScrollDelta(e.deltaY, performance.now(), e.deltaMode);
        return;
      }

      // Normal scroll behavior when scratch is not active
      if (isPlaying) return; // Horizontal scroll disabled during playback

      // Vertical scroll - move cursor
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const delta = Math.sign(e.deltaY) * 2;
        const state = useTrackerStore.getState();
        const pattern = state.patterns[state.currentPatternIndex];
        if (!pattern) return;

        const currentRow = useCursorStore.getState().cursor.rowIndex;
        // Allow scrolling beyond pattern boundaries to see ghost patterns
        const newRow = Math.min(pattern.length + 32, currentRow + delta); // Allow scrolling 32 rows into next pattern
        useCursorStore.getState().moveCursorToRow(newRow);
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
            channelLayout.scrollLeft = newScrollLeft;
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
    channelLayout.scrollLeft = left;
    bridgeRef.current?.post({ type: 'scroll', x: left });
    setScrollLeft(left);
    if (bottomScrollRef.current) bottomScrollRef.current.scrollLeft = left;
  }, []);

  // Handle bottom scroll sync — post to worker immediately
  const handleBottomScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const left = e.currentTarget.scrollLeft;
    scrollLeftRef.current = left;
    channelLayout.scrollLeft = left;
    bridgeRef.current?.post({ type: 'scroll', x: left });
    setScrollLeft(left);
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = left;
  }, []);

  // NOTE: webglUnsupported (iOS) no longer short-circuits here.
  // The main-thread Canvas2D renderer effect above creates a canvas in containerRef
  // and runs a RAF loop — the component falls through to the normal render path below.

  if (!pattern && !isFormatMode) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        No pattern loaded
      </div>
    );
  }

  const mobileChannel = pattern?.channels[mobileChannelIndex];
  // Note: trigger levels are animation-driven and updated via RAF - provide defaults for render
  const mobileTrigger = { level: 0, triggered: false };

  return (
    <div className="flex flex-col h-full" onContextMenuCapture={(e) => { e.preventDefault(); }}>
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

            <div className="flex items-center gap-2">
              <input
                type="text"
                className="bg-dark-bgPrimary/50 border border-dark-border rounded px-3 py-1 font-mono text-xs text-center uppercase focus:border-accent-primary outline-none min-w-[140px]"
                style={{ color: mobileChannel?.color || 'var(--color-accent)' }}
                value={mobileChannel?.name || `Channel ${mobileChannelIndex + 1}`}
                onChange={(e) => updateChannelName(mobileChannelIndex, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
              <span className="text-[10px] text-text-muted font-mono">
                {mobileChannelIndex + 1}/{pattern?.channels.length ?? 0}
              </span>
              <ChannelVUMeter level={mobileTrigger.level} isActive={mobileTrigger.triggered} />
            </div>

            <button
              onClick={handleHeaderSwipeLeft}
              disabled={mobileChannelIndex >= (pattern?.channels.length ?? 0) - 1}
              className={`p-2 rounded-lg transition-colors ${
                mobileChannelIndex >= (pattern?.channels.length ?? 0) - 1 ? 'text-text-muted opacity-30' : 'text-text-secondary hover:bg-dark-bgHover'
              }`}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="flex items-center justify-center gap-2 px-3 py-1 border-t border-dark-border">
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

          {/* Global automation lane — pattern-level curves for bus-wide dub
              params (dub.echoWet etc.) and song-level globals (BPM, master
              vol). Sits above the channel headers; hidden when automation
              lanes are globally hidden or in format mode. */}
          {showAutomationLanes && !hideAutoLanesProp && !isFormatMode && pattern && (
            <GlobalAutomationLane
              patternId={pattern.id}
              patternLength={pattern.length}
              rowHeight={rowHeight}
              compact={true}
            />
          )}

          {isFormatMode && formatColumns && formatChannels ? (
            <div className="flex-shrink-0 bg-dark-bgTertiary border-b border-dark-border z-20">
              {/* Row 1: channel headers — full controls for pattern channels, label-only for synthetic */}
              <div className="flex h-[28px]">
                <div
                  className="flex-shrink-0 border-r border-dark-border flex items-center justify-center text-text-muted text-xs font-medium"
                  style={{ width: LINE_NUMBER_WIDTH }}
                >
                  ROW
                </div>
                <div
                  ref={headerScrollRef}
                  onScroll={handleHeaderScroll}
                  className="overflow-x-hidden overflow-y-hidden flex-1"
                  data-vu-scroll
                >
                  <div className="flex" style={{ width: totalChannelsWidth - LINE_NUMBER_WIDTH, marginLeft: centerPadding }}>
                    {formatChannels.map((ch, idx) => {
                      const channel = ch.isPatternChannel ? pattern?.channels[idx] : undefined;
                      const isCollapsed = channel?.collapsed;
                      const channelWidth = channelWidths[idx];
                      const isActive = idx === activeChannelIndex;
                      const accentColor = channel?.color || 'var(--color-accent)';
                      // Stack box-shadows: left stripe (existing) + bottom border when active
                      const shadowParts: string[] = [];
                      if (channel?.color) shadowParts.push(`inset 2px 0 0 ${channel.color}`);
                      if (isActive) shadowParts.push(`inset 0 -3px 0 ${accentColor}`);

                      return (
                        <div
                          key={idx}
                          className={`flex-shrink-0 flex items-center justify-between gap-1 ${isCollapsed ? 'px-1' : 'px-2'} py-1
                            border-r border-dark-border transition-colors relative
                            ${channel?.muted ? 'opacity-50' : ''}
                            ${channel?.solo ? 'bg-accent-primary/10' : ''}`}
                          style={{
                            width: channelWidth,
                            backgroundColor: channel?.color ? `${channel.color}${blendHex}` : undefined,
                            boxShadow: shadowParts.length > 0 ? shadowParts.join(', ') : undefined,
                          }}
                        >
                          {/* Pattern channel: full controls */}
                          {channel && !isCollapsed && (
                            <>
                              <div className="flex items-center gap-1.5 overflow-hidden flex-1 min-w-0">
                                <span
                                  className="font-bold font-mono text-[11px] flex-shrink-0 opacity-80"
                                  style={{ color: channel.color || 'var(--color-accent)' }}
                                >
                                  {(idx + 1).toString().padStart(2, '0')}
                                </span>
                                {showChannelNames && (
                                  <input
                                    type="text"
                                    className="bg-transparent border-none outline-none font-mono text-[10px] font-bold text-text-primary focus:text-accent-primary transition-colors min-w-0 flex-1 overflow-hidden text-ellipsis uppercase px-0 placeholder:text-text-muted/50"
                                    value={channel.name || ''}
                                    placeholder={`CH${idx + 1}`}
                                    onChange={(e) => updateChannelName(idx, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    title={`Click to rename channel (Short: ${channel.shortName || (idx + 1)})`}
                                  />
                                )}
                                <div className="flex-shrink-0">
                                  <ChannelVUMeter level={0} isActive={false} />
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
                                <ChannelContextMenu
                                  channelIndex={idx}
                                  channel={channel}
                                  patternId={pattern?.id ?? ''}
                                  patternLength={pattern?.length ?? 0}
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
                            </>
                          )}

                          {/* Pattern channel collapsed state */}
                          {channel && isCollapsed && (
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

                          {/* Synthetic / table channel: label only */}
                          {!channel && (
                            <span className="font-bold font-mono text-[11px] text-accent-primary opacity-80 truncate">
                              {ch.label || `CH ${(idx + 1).toString().padStart(2, '0')}`}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {/* Row 2: column labels (20px) */}
              <div className="flex h-[20px] border-t border-dark-border">
                <div className="flex-shrink-0 border-r border-dark-border" style={{ width: LINE_NUMBER_WIDTH }} />
                <div className="overflow-hidden flex-1">
                  <div className="flex" style={{ width: totalChannelsWidth - LINE_NUMBER_WIDTH, marginLeft: centerPadding }}>
                    {formatChannels.map((ch, chIdx) => {
                      const chCols = ch.columns ?? formatColumns;
                      const FORMAT_COL_GAP = 4;
                      let px = 2;
                      return (
                        <div
                          key={chIdx}
                          className="flex-shrink-0 relative border-r border-dark-border"
                          style={{ width: channelWidths[chIdx] }}
                        >
                          {chCols.map((col, ci) => {
                            const colLeft = px;
                            const colWidth = col.charWidth * CHAR_WIDTH + FORMAT_COL_GAP;
                            px += colWidth;
                            return (
                              <span
                                key={ci}
                                className="absolute top-0 bottom-0 flex items-center text-[9px] font-mono uppercase truncate pointer-events-none"
                                style={{
                                  left: colLeft,
                                  width: colWidth,
                                  opacity: 0.55,
                                }}
                              >
                                {col.label}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
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
                <div className="flex" style={{ width: totalChannelsWidth, marginLeft: centerPadding }}>
                  {(pattern?.channels ?? []).map((channel, idx) => {
                    // Trigger levels are animation-driven via RAF; ChannelVUMeter is disabled
                    const trigger = { level: 0, triggered: false };
                    const channelWidth = channelWidths[idx];

                    const isCollapsed = channel.collapsed;
                    const isActive = idx === activeChannelIndex;
                    const accentColor = channel.color || 'var(--color-accent)';
                    // Stack box-shadows: left stripe (existing) + bottom border when active
                    const shadowParts: string[] = [];
                    if (channel.color) shadowParts.push(`inset 2px 0 0 ${channel.color}`);
                    if (isActive) shadowParts.push(`inset 0 -3px 0 ${accentColor}`);

                    return (
                      <div
                        key={channel.id}
                        className={`flex-shrink-0 flex items-center justify-between gap-1 ${isCollapsed ? 'px-1' : 'px-2'} py-1
                          border-r border-dark-border transition-colors relative
                          ${channel.muted ? 'opacity-50' : ''}
                          ${channel.solo ? 'bg-accent-primary/10' : ''}`}
                        style={{
                          width: channelWidth,
                          backgroundColor: channel.color ? `${channel.color}${blendHex}` : undefined,
                          boxShadow: shadowParts.length > 0 ? shadowParts.join(', ') : undefined,
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
                          {showChannelNames && (
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
                          )}
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
                            patternId={pattern?.id ?? ''}
                            patternLength={pattern?.length ?? 0}
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
                  {(pattern?.channels.length ?? 0) < 16 && !isFormatMode && (
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
                  </>
                )}
          
                {/* Canvas Pattern Grid */}
                <div
                  ref={containerRef}
                  className={`flex-1 relative overflow-hidden touch-none focus:outline-none focus:ring-1 focus:ring-accent-primary/30 ${trackerVisualBg ? 'bg-transparent' : 'bg-dark-bg'}`}
                  data-pattern-editor="true"
        style={{ minHeight: 200 }}
        tabIndex={0}
        onContextMenu={handleContextMenu}
        onKeyDown={isFormatMode ? handleFormatKeyDown : undefined}
        onKeyUp={isFormatMode ? (e: React.KeyboardEvent) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            formatHeldArrowRef.current = null;
          }
        } : undefined}
        onPointerDown={handleMouseDown as React.PointerEventHandler}
        onPointerMove={handleMouseMove as React.PointerEventHandler}
        onPointerUp={handleMouseUp as React.PointerEventHandler}
        onPointerLeave={() => { if (!isScratchDragRef.current && !isDragging) handleMouseUp(); }}
        onWheel={handleWheel}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        {...patternGestures}
      >
        {/* Visual background — rendered inside the grid container so it doesn't bleed into channel headers */}
        {trackerVisualBg && dimensions.width > 0 && dimensions.height > 0 && (
          <div className="absolute inset-0 z-0 pointer-events-none">
            <TrackerVisualBackground width={dimensions.width} height={dimensions.height} />
          </div>
        )}
        {/* VU Meters overlay — hidden when explicitly disabled (e.g. perf list sub-editor) */}
        {!hideVUMeters && (
        <div
          className="absolute right-0 pointer-events-none overflow-hidden"
          style={{ top: 0, left: LNW, bottom: 48, zIndex: 1 }}
        >
          <ChannelVUMeters
            channelOffsets={channelOffsets}
            channelWidths={channelWidths}
            scrollLeft={scrollLeft}
            editRowY={dimensions.height / 2}
          />
        </div>
        )}

        {/* Canvas is created imperatively in useEffect to support OffscreenCanvas transfer */}

        {/* Automation Lanes Overlay — positioned imperatively by RAF loop */}
        {pattern && (
          <>
            {showAutomationLanes && !hideAutoLanesProp && !hideVUMeters && (
              <>
              {/* Per-channel automation parameter pickers */}
              {pattern.channels.map((_, chIdx) => (
                <AutomationParameterPicker
                  key={`auto-picker-${chIdx}`}
                  channelIndex={chIdx + formatChannelOffset}
                  patternId={pattern.id}
                  left={channelOffsets[chIdx] || 0}
                  width={channelWidths[chIdx] || 80}
                  top={-20}
                />
              ))}
              {(() => {
                // Use `>= 1` so 1-pattern songs still allocate prev/next space.
                // The ghost wraps around to the same pattern; AutomationLanes
                // does the same internally — they must match or the inner
                // ghost curves get clipped out of the outer container.
                const prevLen = showGhostPatterns
                  ? (currentPatternIndex > 0 ? patterns[currentPatternIndex - 1]?.length : (patterns.length >= 1 ? patterns[patterns.length - 1]?.length : 0)) || 0
                  : 0;
                const nextLen = showGhostPatterns
                  ? (currentPatternIndex < patterns.length - 1 ? patterns[currentPatternIndex + 1]?.length : (patterns.length >= 1 ? patterns[0]?.length : 0)) || 0
                  : 0;
                automationPrevLenRef.current = prevLen;
                return (
              <div
                ref={automationOverlayRef}
                style={{
                  position: 'absolute',
                  top: scrollYRef.current - prevLen * rowHeight,
                  left: 0,
                  right: 0,
                  height: (prevLen + pattern.length + nextLen) * rowHeight,
                  pointerEvents: 'none',
                  zIndex: 5,
                  // clipPath set imperatively in RAF so resize/fullscreen
                  // changes pick up new bounds on the next frame.
                }}
              >
              <AutomationLanes
                key={`automation-${pattern.id}`}
                patternId={pattern.id}
                patternLength={pattern.length}
                rowHeight={rowHeight}
                channelCount={pattern.channels.length}
                channelOffsets={channelOffsets}
                channelWidths={channelWidths}
                rowNumWidth={LINE_NUMBER_WIDTH}
                channelIndexOffset={formatChannelOffset}
                scrollOffset={0}
                visibleStart={0}
                containerHeight={dimensions.height}
                /* parameter is resolved per-channel from useAutomationStore.channelLanes */
                prevPatternId={showGhostPatterns ? (currentPatternIndex > 0 ? patterns[currentPatternIndex - 1]?.id : (patterns.length >= 1 ? patterns[patterns.length - 1]?.id : undefined)) : undefined}
                prevPatternLength={showGhostPatterns ? (currentPatternIndex > 0 ? patterns[currentPatternIndex - 1]?.length : (patterns.length >= 1 ? patterns[patterns.length - 1]?.length : undefined)) : undefined}
                nextPatternId={showGhostPatterns ? (currentPatternIndex < patterns.length - 1 ? patterns[currentPatternIndex + 1]?.id : (patterns.length >= 1 ? patterns[0]?.id : undefined)) : undefined}
                nextPatternLength={showGhostPatterns ? (currentPatternIndex < patterns.length - 1 ? patterns[currentPatternIndex + 1]?.length : (patterns.length >= 1 ? patterns[0]?.length : undefined)) : undefined}
              />
              </div>
                );
              })()}
              </>
            )}
            {/* Internal Macro Columns Overlay (only when visible) */}
            {showMacroLanes && (
              <div
                ref={macroOverlayRef}
                style={{
                  position: 'absolute',
                  top: scrollYRef.current,
                  left: 0,
                  right: 0,
                  height: pattern.length * rowHeight,
                  pointerEvents: 'none',
                  transform: `translateX(${-scrollLeft}px)`
                }}
              >
                <MacroLanes
                  pattern={pattern}
                  rowHeight={rowHeight}
                  channelCount={pattern.channels.length}
                  channelOffsets={channelOffsets}
                  channelWidths={channelWidths}
                  rowNumWidth={LINE_NUMBER_WIDTH}
                />
              </div>
            )}
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
            height: rowHeight,
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
