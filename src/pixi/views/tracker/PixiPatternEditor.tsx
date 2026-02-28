/**
 * PixiPatternEditor — Native PixiJS port of PatternEditorCanvas.
 *
 * Renders the tracker pattern grid using pixiGraphics and pixiBitmapText,
 * replacing the previous OffscreenCanvas + WebGL2 worker approach when
 * running inside the PixiJS scene graph.
 *
 * Architecture:
 *  - pixiGraphics for: row backgrounds, channel separators, center-line,
 *    selection overlay, cursor caret, peer cursor/selection, ghost patterns
 *  - pixiBitmapText for all visible cell text (~30 visible rows)
 *  - Channel header via PixiDOMOverlay (interactive controls: inputs, context menus,
 *    color picker, mute/solo/collapse — these need DOM portals/dropdowns)
 *  - Cell context menu via PixiDOMOverlay (right-click menu)
 *  - Collaboration peer cursor/selection in drawGrid
 *  - Stepped horizontal scroll with accumulator (matches DOM behavior)
 */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { PixiDOMOverlay } from '../../components/PixiDOMOverlay';
import { useTrackerStore, useTransportStore, useUIStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useCollaborationStore, getCollabClient } from '@stores/useCollaborationStore';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { getTrackerScratchController } from '@engine/TrackerScratchController';
import { useBDAnimations } from '@hooks/tracker/useBDAnimations';
import { GENERATORS, type GeneratorType } from '@utils/patternGenerators';
import { ChannelContextMenu } from '@/components/tracker/ChannelContextMenu';
import { ChannelColorPicker } from '@/components/tracker/ChannelColorPicker';
import { CellContextMenu, useCellContextMenu } from '@/components/tracker/CellContextMenu';
import { ParameterEditor } from '@/components/tracker/ParameterEditor';
import { Plus, Volume2, VolumeX, Headphones, ChevronLeft, ChevronRight } from 'lucide-react';
import { TrackerVisualBackground } from '@/components/tracker/TrackerVisualBackground';
import { haptics } from '@/utils/haptics';
import * as Tone from 'tone';
import type { CursorPosition } from '@typedefs';
const SCROLLBAR_HEIGHT = 12;

// ─── Layout constants (must match worker-types / TrackerGLRenderer) ──────────
const CHAR_WIDTH = 10;
const LINE_NUMBER_WIDTH = 40;
const FONT_SIZE = 11;
const HEADER_HEIGHT = 28;
const SCROLL_THRESHOLD = 50; // Horizontal scroll accumulator resistance

// ─── Note formatting ─────────────────────────────────────────────────────────
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteToString(note: number): string {
  if (note === 0) return '---';
  if (note === 97) return 'OFF';
  const n = note - 1;
  const semitone = n % 12;
  const octave = Math.floor(n / 12);
  return `${NOTE_NAMES[semitone]}${octave}`;
}

function hexByte(val: number): string {
  return val.toString(16).toUpperCase().padStart(2, '0');
}

function formatEffect(typ: number, val: number, useHex: boolean): string {
  if (typ === 0 && val === 0) return '...';
  const t = typ < 10 ? String(typ) : String.fromCharCode(55 + typ);
  return `${t}${useHex ? hexByte(val) : val.toString().padStart(2, '0')}`;
}

// ─── Color helpers ───────────────────────────────────────────────────────────
const FLAG_COLORS = {
  accent: 0xf59e0b,
  slide: 0x06b6d4,
  mute: 0xfacc15,
  hammer: 0x22d3ee,
};

function probColor(val: number): number {
  if (val >= 75) return 0x4ade80;
  if (val >= 50) return 0xfacc15;
  if (val >= 25) return 0xfb923c;
  return 0xf87171;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface PixiPatternEditorProps {
  width: number;
  height: number;
}

export const PixiPatternEditor: React.FC<PixiPatternEditorProps> = ({ width, height }) => {
  const theme = usePixiTheme();

  // ── Store subscriptions ────────────────────────────────────────────────────
  const {
    pattern,
    patterns,
    currentPatternIndex,
    cursor,
    selection,
    showGhostPatterns,
    columnVisibility,
    recordMode,
    addChannel,
    toggleChannelMute,
    toggleChannelSolo,
    toggleChannelCollapse,
    setChannelColor,
    updateChannelName,
    setCell,
    copyTrack,
    cutTrack,
    pasteTrack,
  } = useTrackerStore(useShallow((s) => ({
    pattern: s.patterns[s.currentPatternIndex],
    patterns: s.patterns,
    currentPatternIndex: s.currentPatternIndex,
    cursor: s.cursor,
    selection: s.selection,
    showGhostPatterns: s.showGhostPatterns,
    columnVisibility: s.columnVisibility,
    recordMode: s.recordMode,
    addChannel: s.addChannel,
    toggleChannelMute: s.toggleChannelMute,
    toggleChannelSolo: s.toggleChannelSolo,
    toggleChannelCollapse: s.toggleChannelCollapse,
    setChannelColor: s.setChannelColor,
    updateChannelName: s.updateChannelName,
    setCell: s.setCell,
    moveCursorToChannelAndColumn: s.moveCursorToChannelAndColumn,
    copyTrack: s.copyTrack,
    cutTrack: s.cutTrack,
    pasteTrack: s.pasteTrack,
  })));

  const useHex = useUIStore(s => s.useHexNumbers);
  const blankEmpty = useUIStore(s => s.blankEmptyCells);
  const trackerZoom = useUIStore(s => s.trackerZoom);
  const rowHighlightInterval = useUIStore(s => s.rowHighlightInterval);
  const showBeatLabels = useUIStore(s => s.showBeatLabels);
  const rowHeight = Math.round(24 * (trackerZoom / 100));
  const rowHeightRef = useRef(rowHeight);
  useEffect(() => { rowHeightRef.current = rowHeight; }, [rowHeight]);
  const trackerVisualBg = useSettingsStore(s => s.trackerVisualBg);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const smoothScrolling = useTransportStore(s => s.smoothScrolling);

  // ── Cell context menu ─────────────────────────────────────────────────────
  const cellContextMenu = useCellContextMenu();

  // ── Parameter editor state ────────────────────────────────────────────────
  const [parameterEditorState, setParameterEditorState] = useState<{
    isOpen: boolean;
    field: 'volume' | 'effect' | 'effectParam';
    channelIndex: number;
    startRow: number;
    endRow: number;
  } | null>(null);

  const handleOpenParameterEditor = useCallback((field: 'volume' | 'effect' | 'effectParam') => {
    if (!pattern) return;
    const channelIdx = cellContextMenu.cellInfo?.channelIndex ?? cursor.channelIndex;
    const start = selection?.startRow ?? cursor.rowIndex;
    const end = selection?.endRow ?? Math.min(cursor.rowIndex + 15, pattern.length - 1);
    setParameterEditorState({ isOpen: true, field, channelIndex: channelIdx, startRow: start, endRow: end });
    cellContextMenu.closeMenu();
  }, [cellContextMenu, cursor, selection, pattern]);

  // ── B/D Animation handlers ────────────────────────────────────────────────
  const bdAnimations = useBDAnimations();

  const getBDAnimationOptions = useCallback((channelIndex: number) => {
    const startRow = selection ? Math.min(selection.startRow, selection.endRow) : 0;
    const endRow = selection ? Math.max(selection.startRow, selection.endRow) : (pattern?.length ?? 64) - 1;
    return { patternIndex: currentPatternIndex, channelIndex, startRow, endRow };
  }, [selection, currentPatternIndex, pattern?.length]);

  const handleReverseVisual = useCallback((ch: number) => bdAnimations.applyReverseVisual(getBDAnimationOptions(ch)), [bdAnimations, getBDAnimationOptions]);
  const handlePolyrhythm = useCallback((ch: number) => { const o = getBDAnimationOptions(ch); bdAnimations.applyPolyrhythm(o.patternIndex, [ch], [3], o.startRow, o.endRow); }, [bdAnimations, getBDAnimationOptions]);
  const handleFibonacci = useCallback((ch: number) => bdAnimations.applyFibonacciSequence(getBDAnimationOptions(ch)), [bdAnimations, getBDAnimationOptions]);
  const handleEuclidean = useCallback((ch: number) => bdAnimations.applyEuclideanPattern(getBDAnimationOptions(ch), 5, 8), [bdAnimations, getBDAnimationOptions]);
  const handlePingPong = useCallback((ch: number) => bdAnimations.applyPingPong(getBDAnimationOptions(ch)), [bdAnimations, getBDAnimationOptions]);
  const handleGlitch = useCallback((ch: number) => bdAnimations.applyGlitch(getBDAnimationOptions(ch)), [bdAnimations, getBDAnimationOptions]);
  const handleStrobe = useCallback((ch: number) => bdAnimations.applyStrobe(getBDAnimationOptions(ch)), [bdAnimations, getBDAnimationOptions]);
  const handleVisualEcho = useCallback((ch: number) => bdAnimations.applyVisualEcho(getBDAnimationOptions(ch)), [bdAnimations, getBDAnimationOptions]);
  const handleConverge = useCallback((ch: number) => bdAnimations.applyConverge(getBDAnimationOptions(ch)), [bdAnimations, getBDAnimationOptions]);
  const handleSpiral = useCallback((ch: number) => bdAnimations.applySpiral(getBDAnimationOptions(ch)), [bdAnimations, getBDAnimationOptions]);
  const handleBounce = useCallback((ch: number) => bdAnimations.applyBounce(getBDAnimationOptions(ch)), [bdAnimations, getBDAnimationOptions]);
  const handleChaos = useCallback((ch: number) => bdAnimations.applyChaos(getBDAnimationOptions(ch)), [bdAnimations, getBDAnimationOptions]);

  // ── Channel operation handlers (for ChannelContextMenu) ───────────────────
  const handleFillPattern = useCallback((channelIndex: number, generatorType: GeneratorType) => {
    if (!pattern) return;
    const generator = GENERATORS[generatorType];
    if (!generator) return;
    const channel = pattern.channels[channelIndex];
    const instrumentId = channel.instrumentId ?? 1;
    const cells = generator.generate({ patternLength: pattern.length, instrumentId, note: 49, velocity: 0x40 });
    cells.forEach((cell, row) => { setCell(channelIndex, row, cell); });
  }, [pattern, setCell]);

  const handleClearChannel = useCallback((channelIndex: number) => {
    if (!pattern) return;
    for (let row = 0; row < pattern.length; row++) {
      setCell(channelIndex, row, { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
    }
    useUIStore.getState().setStatusMessage('CHANNEL CLEARED');
  }, [pattern, setCell]);

  const handleTranspose = useCallback((channelIndex: number, semitones: number) => {
    if (!pattern) return;
    for (let row = 0; row < pattern.length; row++) {
      const cell = pattern.channels[channelIndex].rows[row];
      if (cell.note && cell.note !== 0 && cell.note !== 97) {
        const newNote = Math.max(1, Math.min(96, cell.note + semitones));
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
    let firstRow = -1, lastRow = -1, firstVolume = 0, lastVolume = 0;
    for (let row = 0; row < pattern.length; row++) {
      const cell = channel.rows[row];
      if (cell.volume !== null && cell.volume >= 0x10 && cell.volume <= 0x50) {
        if (firstRow === -1) { firstRow = row; firstVolume = cell.volume; }
        lastRow = row; lastVolume = cell.volume;
      }
    }
    if (firstRow === -1 || lastRow === -1 || lastRow - firstRow < 2) return;
    const rowCount = lastRow - firstRow;
    for (let row = firstRow + 1; row < lastRow; row++) {
      const t = (row - firstRow) / rowCount;
      const interpolatedVolume = Math.round(firstVolume + (lastVolume - firstVolume) * t);
      setCell(channelIndex, row, { ...channel.rows[row], volume: interpolatedVolume });
    }
    useUIStore.getState().setStatusMessage('INTERPOLATED');
  }, [pattern, setCell]);

  // ── Instrument drag-and-drop ──────────────────────────────────────────────
  const [dragOverCell, setDragOverCell] = useState<{ channelIndex: number; rowIndex: number } | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  // Listen for global dragenter/dragleave to activate the drop zone overlay
  // only when an actual drag is happening (avoids blocking Pixi pointer events)
  useEffect(() => {
    let enterCounter = 0;
    const handleEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('application/x-devilbox-instrument')) {
        enterCounter++;
        setIsDragActive(true);
      }
    };
    const handleLeave = () => {
      enterCounter--;
      if (enterCounter <= 0) { enterCounter = 0; setIsDragActive(false); }
    };
    const handleEnd = () => { enterCounter = 0; setIsDragActive(false); };
    document.addEventListener('dragenter', handleEnter);
    document.addEventListener('dragleave', handleLeave);
    document.addEventListener('dragend', handleEnd);
    document.addEventListener('drop', handleEnd);
    return () => {
      document.removeEventListener('dragenter', handleEnter);
      document.removeEventListener('dragleave', handleLeave);
      document.removeEventListener('dragend', handleEnd);
      document.removeEventListener('drop', handleEnd);
    };
  }, []);

  // ── Collaboration ─────────────────────────────────────────────────────────
  const peerCursorRef = useRef({ row: 0, channel: 0, active: false, patternIndex: -1 });
  const peerSelectionRef = useRef<{ startChannel: number; endChannel: number; startRow: number; endRow: number; patternIndex: number } | null>(null);

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

  // Broadcast local selection to peer
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

  // ── Scroll state ──────────────────────────────────────────────────────────
  const [scrollLeft, setScrollLeft] = useState(0);
  const scrollLeftRef = useRef(0);
  const scrollAccumulatorRef = useRef(0);

  // Playback row tracking
  const [playbackState, setPlaybackState] = useState({ row: 0, smoothOffset: 0, patternIndex: 0 });

  // ── Channel layout ────────────────────────────────────────────────────────
  const { numChannels, channelOffsets, channelWidths, totalChannelsWidth } = useMemo(() => {
    if (!pattern) return { numChannels: 0, channelOffsets: [] as number[], channelWidths: [] as number[], totalChannelsWidth: 0 };
    const nc = pattern.channels.length;
    const noteWidth = CHAR_WIDTH * 3 + 4;
    const showAcid = columnVisibility.flag1 || columnVisibility.flag2;
    const showProb = columnVisibility.probability;

    const offsets: number[] = [];
    const widths: number[] = [];
    let currentX = LINE_NUMBER_WIDTH;

    for (let ch = 0; ch < nc; ch++) {
      const channel = pattern.channels[ch];
      const isCollapsed = channel?.collapsed;
      if (isCollapsed) {
        const cw = noteWidth + 40;
        offsets.push(currentX);
        widths.push(cw);
        currentX += cw;
      } else {
        const effectCols = channel?.channelMeta?.effectCols ?? 2;
        const effectWidth = effectCols * (CHAR_WIDTH * 3 + 4);
        const paramWidth = CHAR_WIDTH * 4 + 8 + effectWidth
          + (showAcid ? CHAR_WIDTH * 2 + 8 : 0)
          + (showProb ? CHAR_WIDTH * 2 + 4 : 0);
        const chWidth = noteWidth + paramWidth + 60;
        offsets.push(currentX);
        widths.push(chWidth);
        currentX += chWidth;
      }
    }

    return { numChannels: nc, channelOffsets: offsets, channelWidths: widths, totalChannelsWidth: currentX - LINE_NUMBER_WIDTH };
  }, [pattern, columnVisibility]);

  // All channels fit? (disable horizontal scroll)
  const allChannelsFit = useMemo(() => {
    if (!pattern || numChannels === 0) return true;
    return (LINE_NUMBER_WIDTH + totalChannelsWidth) <= width;
  }, [totalChannelsWidth, numChannels, width, pattern]);

  // Reset horizontal scroll when all channels fit
  useEffect(() => {
    if (allChannelsFit && scrollLeft > 0) {
      scrollLeftRef.current = 0;
      setScrollLeft(0);
    }
  }, [allChannelsFit, scrollLeft]);

  // ── RAF loop for playback tracking ─────────────────────────────────────────
  // Track previous values to skip redundant state updates (avoids costly
  // React re-renders + @pixi/react reconciliation of hundreds of BitmapText nodes)
  const prevPlaybackRef = useRef({ row: -1, smoothOffset: 0, patternIndex: -1 });

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      if (!isPlaying) {
        // Reset prev so we re-render on first play frame
        prevPlaybackRef.current = { row: -1, smoothOffset: 0, patternIndex: -1 };
        rafId = requestAnimationFrame(tick);
        return;
      }
      const replayer = getTrackerReplayer();
      const audioTime = Tone.now() + 0.01;
      const audioState = replayer.getStateAtTime(audioTime);
      const ts = useTrackerStore.getState();

      let newRow: number;
      let newOffset: number;
      let newPattern: number;

      if (audioState) {
        newRow = audioState.row;
        newPattern = audioState.pattern;
        newOffset = 0;
        if (smoothScrolling) {
          const bpm = useTransportStore.getState().bpm;
          const speed = useTransportStore.getState().speed;
          const nextState = replayer.getStateAtTime(audioTime + 0.5, true);
          const dur = (nextState && nextState.row !== audioState.row)
            ? nextState.time - audioState.time
            : (2.5 / bpm) * speed;
          const progress = Math.min(Math.max((audioTime - audioState.time) / dur, 0), 1);
          newOffset = progress * rowHeightRef.current;
        }
      } else {
        newRow = useTransportStore.getState().currentRow;
        newOffset = 0;
        newPattern = ts.currentPatternIndex;
      }

      // Only update state when values actually change — avoids creating a new
      // object reference every frame which would trigger a full React re-render
      const prev = prevPlaybackRef.current;
      if (newRow !== prev.row ||
          newPattern !== prev.patternIndex ||
          Math.abs(newOffset - prev.smoothOffset) > 0.5) {
        const state = { row: newRow, smoothOffset: newOffset, patternIndex: newPattern };
        prevPlaybackRef.current = state;
        setPlaybackState(state);
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, smoothScrolling]);

  // ── Current row (playback or cursor) ───────────────────────────────────────
  const currentRow = isPlaying ? playbackState.row : cursor.rowIndex;
  const smoothOffset = isPlaying ? playbackState.smoothOffset : 0;

  // During playback, use the replayer's pattern index for rendering rather than
  // the store's currentPatternIndex. The RAF loop reads the replayer directly,
  // but the store only updates after queueMicrotask → setCurrentPattern → React
  // re-render. This 1-3 frame timing gap caused visible jumps at pattern transitions
  // because currentRow would be from the new pattern while pattern data was still old.
  const displayPattern = isPlaying
    ? (patterns[playbackState.patternIndex] ?? pattern)
    : pattern;
  const displayPatternIndex = isPlaying ? playbackState.patternIndex : currentPatternIndex;

  // ── Visible range ─────────────────────────────────────────────────────────
  const scrollbarHeight = allChannelsFit ? 0 : SCROLLBAR_HEIGHT;
  const gridHeight = height - HEADER_HEIGHT - scrollbarHeight;
  const visibleLines = Math.ceil(gridHeight / rowHeight) + 2;
  const topLines = Math.floor(visibleLines / 2);
  const centerLineTop = Math.floor(gridHeight / 2) - rowHeight / 2;
  const baseY = centerLineTop - topLines * rowHeight - smoothOffset;
  const vStart = currentRow - topLines;
  const patternLength = displayPattern?.length ?? 64;

  // ── Click → cell mapping ──────────────────────────────────────────────────
  const getCellFromLocal = useCallback((localX: number, localY: number): { rowIndex: number; channelIndex: number; columnType: CursorPosition['columnType'] } | null => {
    if (!pattern) return null;
    const rowOffset = Math.floor((localY - centerLineTop) / rowHeight);
    const rowIndex = currentRow + rowOffset;

    let channelIndex = 0;
    let foundChannel = false;
    for (let ch = 0; ch < numChannels; ch++) {
      const off = channelOffsets[ch] - scrollLeftRef.current;
      const w = channelWidths[ch];
      if (localX >= off && localX < off + w) {
        channelIndex = ch;
        foundChannel = true;
        break;
      }
    }
    if (!foundChannel) return null;

    const isCollapsed = pattern.channels[channelIndex]?.collapsed;
    if (isCollapsed) return { rowIndex: Math.max(0, Math.min(rowIndex, patternLength - 1)), channelIndex, columnType: 'note' };

    const noteWidth = CHAR_WIDTH * 3 + 4;
    const chLocalX = localX - (channelOffsets[channelIndex] - scrollLeftRef.current) - 8;
    let columnType: CursorPosition['columnType'] = 'note';
    if (chLocalX >= noteWidth + 4) {
      const xInParams = chLocalX - (noteWidth + 8);
      const showAcid = columnVisibility.flag1 || columnVisibility.flag2;
      const showProb = columnVisibility.probability;
      const effectCols = pattern.channels[channelIndex]?.channelMeta?.effectCols ?? 2;
      const effectWidth = effectCols * (CHAR_WIDTH * 3 + 4);

      if (xInParams < CHAR_WIDTH * 2 + 4) columnType = 'instrument';
      else if (xInParams < CHAR_WIDTH * 4 + 8) columnType = 'volume';
      else if (xInParams < CHAR_WIDTH * 4 + 8 + effectWidth) {
        // Determine which effect column
        const effX = xInParams - (CHAR_WIDTH * 4 + 8);
        const effCol = Math.floor(effX / (CHAR_WIDTH * 3 + 4));
        columnType = effCol === 0 ? 'effTyp' : 'effTyp2';
      }
      else {
        const afterEffects = CHAR_WIDTH * 4 + 8 + effectWidth;
        const flagX = xInParams - afterEffects;
        if (showAcid && columnVisibility.flag1 && flagX < CHAR_WIDTH + 4) columnType = 'flag1';
        else if (showAcid && columnVisibility.flag2 && flagX < (CHAR_WIDTH + 4) * 2) columnType = 'flag2';
        else if (showProb) columnType = 'probability';
        else columnType = 'effTyp';
      }
    }

    return { rowIndex: Math.max(0, Math.min(rowIndex, patternLength - 1)), channelIndex, columnType };
  }, [pattern, numChannels, channelOffsets, channelWidths, centerLineTop, currentRow, patternLength, columnVisibility]);

  // ── Instrument drag-and-drop handlers (need getCellFromLocal) ─────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const cell = getCellFromLocal(localX, localY);
    if (cell) {
      setDragOverCell({ channelIndex: cell.channelIndex, rowIndex: cell.rowIndex });
      e.dataTransfer.dropEffect = 'copy';
    } else {
      setDragOverCell(null);
    }
  }, [getCellFromLocal]);

  const handleDragLeave = useCallback(() => {
    setDragOverCell(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    setDragOverCell(null);
    setIsDragActive(false);
    const dragData = e.dataTransfer.getData('application/x-devilbox-instrument');
    if (!dragData) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const cell = getCellFromLocal(localX, localY);
    if (!cell) return;
    try {
      const { id } = JSON.parse(dragData);
      useTrackerStore.getState().setCell(cell.channelIndex, cell.rowIndex, { instrument: id });
      haptics.success();
    } catch (err) {
      console.error('[PixiPatternEditor] Drop failed:', err);
    }
  }, [getCellFromLocal]);

  // ── Mouse handlers ────────────────────────────────────────────────────────
  const isDraggingRef = useRef(false);

  /** Whether the current pointer drag is a scratch-grab (playing + left-click) */
  const isScratchDragRef = useRef(false);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(e.currentTarget);
    const cell = getCellFromLocal(local.x, local.y);
    if (!cell) return;

    const store = useTrackerStore.getState();
    const nativeEvent = e.nativeEvent as PointerEvent;

    // Right-click → context menu
    if (nativeEvent.button === 2) {
      cellContextMenu.openMenu(
        { clientX: nativeEvent.clientX, clientY: nativeEvent.clientY, preventDefault: () => {}, stopPropagation: () => {} } as React.MouseEvent,
        cell.rowIndex,
        cell.channelIndex,
      );
      return;
    }

    // During playback — left-click drag becomes scratch grab (hand on record)
    if (wheelStateRef.current.isPlaying && nativeEvent.button === 0 && !nativeEvent.shiftKey && !nativeEvent.metaKey && !nativeEvent.ctrlKey) {
      isScratchDragRef.current = true;
      isDraggingRef.current = false;
      const scratch = getTrackerScratchController();
      scratch.onGrabStart(nativeEvent.clientY, performance.now());
      return;
    }

    if (nativeEvent.shiftKey) {
      store.updateSelection(cell.channelIndex, cell.rowIndex);
    } else {
      store.moveCursorToRow(cell.rowIndex);
      store.moveCursorToChannelAndColumn(cell.channelIndex, cell.columnType as any);
      store.startSelection();
    }
    isDraggingRef.current = true;
  }, [getCellFromLocal, cellContextMenu]);

  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    // Scratch drag — route to scratch controller
    if (isScratchDragRef.current) {
      const nativeEvent = e.nativeEvent as PointerEvent;
      getTrackerScratchController().onGrabMove(nativeEvent.clientY, performance.now());
      return;
    }

    if (!isDraggingRef.current) return;
    const local = e.getLocalPosition(e.currentTarget);
    const cell = getCellFromLocal(local.x, local.y);
    if (cell) {
      useTrackerStore.getState().updateSelection(cell.channelIndex, cell.rowIndex, cell.columnType as any);
    }
  }, [getCellFromLocal]);

  const handlePointerUp = useCallback(() => {
    // End scratch drag
    if (isScratchDragRef.current) {
      isScratchDragRef.current = false;
      getTrackerScratchController().onGrabEnd(performance.now());
      return;
    }
    isDraggingRef.current = false;
  }, []);

  // ── Wheel scroll — native non-passive listener on canvas ─────────────────
  // PixiJS registers wheel events as passive, so preventDefault() fails via
  // the federated event system. Attach directly on the canvas with { passive: false }.
  const wheelStateRef = useRef({ isPlaying, allChannelsFit, channelOffsets, totalChannelsWidth, width });
  wheelStateRef.current = { isPlaying, allChannelsFit, channelOffsets, totalChannelsWidth, width };

  useEffect(() => {
    // Find the Pixi canvas — it's the <canvas> element inside the app's root
    const canvas = document.querySelector('canvas[data-pixijs]') as HTMLCanvasElement | null
      ?? document.querySelector('#pixi-app canvas') as HTMLCanvasElement | null
      ?? document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      const { isPlaying: playing, allChannelsFit: allFit, channelOffsets: offsets, totalChannelsWidth: totalW, width: w } = wheelStateRef.current;
      e.preventDefault();

      // During playback — route vertical scroll to scratch controller (nudge mode)
      if (playing && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const scratch = getTrackerScratchController();
        scratch.onScrollDelta(e.deltaY, performance.now(), e.deltaMode);
        return;
      }

      // Not playing — normal scroll behavior
      if (playing) return; // Horizontal scroll disabled during playback

      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        // Vertical scroll — move cursor
        const delta = Math.sign(e.deltaY) * 2;
        const store = useTrackerStore.getState();
        const pat = store.patterns[store.currentPatternIndex];
        if (!pat) return;
        const newRow = Math.max(0, Math.min(pat.length + 32, store.cursor.rowIndex + delta));
        store.moveCursorToRow(newRow);
      } else if (!allFit) {
        // Horizontal scroll — stepped with accumulator (matches DOM behavior)
        scrollAccumulatorRef.current += e.deltaX;
        if (Math.abs(scrollAccumulatorRef.current) > SCROLL_THRESHOLD) {
          const direction = Math.sign(scrollAccumulatorRef.current);
          scrollAccumulatorRef.current = 0;

          // Find current leftmost visible channel
          let currentCh = 0;
          for (let i = 0; i < offsets.length; i++) {
            const targetScroll = offsets[i] - LINE_NUMBER_WIDTH;
            if (targetScroll <= scrollLeftRef.current + 5) {
              currentCh = i;
            } else {
              break;
            }
          }

          const nextCh = Math.max(0, Math.min(offsets.length - 1, currentCh + direction));
          const maxScroll = Math.max(0, LINE_NUMBER_WIDTH + totalW - w);
          const newScrollLeft = Math.max(0, Math.min(maxScroll, offsets[nextCh] - LINE_NUMBER_WIDTH));

          scrollLeftRef.current = newScrollLeft;
          setScrollLeft(newScrollLeft);
        }
      }
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // ── Touch scratch — native touch listener for touchscreen scratch during playback ──
  // 2-finger touch = nudge (flick edge of platter), 3+ fingers = grab (hand on record)
  // Note: Mac trackpad doesn't fire touch events — it fires wheel events (handled above).
  // These handlers are for actual touchscreens (iPad, touch monitors, phones).
  const touchLastYRef = useRef<number | null>(null);
  const touchModeRef = useRef<'none' | 'nudge' | 'grab'>('none');

  useEffect(() => {
    const canvas = document.querySelector('canvas[data-pixijs]') as HTMLCanvasElement | null
      ?? document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    /** Average Y position of all touch points */
    const avgTouchY = (touches: TouchList): number => {
      let sum = 0;
      for (let i = 0; i < touches.length; i++) sum += touches[i].clientY;
      return sum / touches.length;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!wheelStateRef.current.isPlaying) return;
      const scratch = getTrackerScratchController();
      const count = e.touches.length;

      if (scratch.isGrabTouch(count)) {
        // 3+ fingers → grab mode (hand on record)
        e.preventDefault();
        touchModeRef.current = 'grab';
        const y = avgTouchY(e.touches);
        scratch.onGrabStart(y, performance.now());
      } else if (count === 2) {
        // 2 fingers → nudge mode (edge-of-platter flick)
        touchModeRef.current = 'nudge';
        touchLastYRef.current = avgTouchY(e.touches);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!wheelStateRef.current.isPlaying) return;
      const scratch = getTrackerScratchController();
      const count = e.touches.length;

      // Upgrade from nudge to grab if finger count increases
      if (touchModeRef.current === 'nudge' && scratch.isGrabTouch(count)) {
        touchModeRef.current = 'grab';
        const y = avgTouchY(e.touches);
        scratch.onGrabStart(y, performance.now());
        e.preventDefault();
        return;
      }

      if (touchModeRef.current === 'grab') {
        // Grab: direct velocity from touch movement
        e.preventDefault();
        const y = avgTouchY(e.touches);
        scratch.onGrabMove(y, performance.now());
      } else if (touchModeRef.current === 'nudge' && touchLastYRef.current !== null) {
        // Nudge: convert delta to scroll impulse
        const y = avgTouchY(e.touches);
        const deltaY = touchLastYRef.current - y; // drag up = scroll down
        touchLastYRef.current = y;
        if (Math.abs(deltaY) > 1) {
          e.preventDefault();
          scratch.onScrollDelta(deltaY, performance.now());
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const scratch = getTrackerScratchController();

      if (touchModeRef.current === 'grab') {
        // If all fingers lifted or dropped below grab threshold
        if (e.touches.length < GRAB_TOUCH_COUNT) {
          scratch.onGrabEnd(performance.now());
          touchModeRef.current = e.touches.length >= 2 ? 'nudge' : 'none';
          if (touchModeRef.current === 'nudge') {
            touchLastYRef.current = avgTouchY(e.touches);
          }
        }
      } else if (e.touches.length < 2) {
        touchModeRef.current = 'none';
        touchLastYRef.current = null;
      }
    };

    // Grab touch count constant (imported from controller)
    const GRAB_TOUCH_COUNT = 3;

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  // ── Draw grid backgrounds ─────────────────────────────────────────────────
  const drawGrid = useCallback((g: GraphicsType) => {
    g.clear();

    // Background
    if (!trackerVisualBg) {
      g.rect(0, 0, width, gridHeight);
      g.fill({ color: theme.bg.color });
    }

    // Draw rows
    for (let i = 0; i < visibleLines; i++) {
      const rowNum = vStart + i;
      const y = baseY + i * rowHeight;
      if (y + rowHeight < 0 || y > gridHeight) continue;

      const isInPattern = rowNum >= 0 && rowNum < patternLength;
      const isGhost = !isInPattern && showGhostPatterns;
      const ghostAlpha = isGhost ? 0.35 : 1;

      // Row background
      if (isInPattern || isGhost) {
        const isHighlight = rowNum >= 0 && rowNum % rowHighlightInterval === 0;
        g.rect(LINE_NUMBER_WIDTH, y, width - LINE_NUMBER_WIDTH, rowHeight);
        g.fill({
          color: isHighlight ? theme.trackerRowHighlight.color : theme.trackerRowOdd.color,
          alpha: (isHighlight ? theme.trackerRowHighlight.alpha : theme.trackerRowOdd.alpha) * ghostAlpha,
        });
      }

      // Center-line highlight (current row)
      if (rowNum === currentRow) {
        g.rect(0, y, width, rowHeight);
        g.fill({ color: theme.accentGlow.color, alpha: trackerVisualBg ? 0.5 : theme.accentGlow.alpha });
      }
    }

    // Channel separators and active channel highlight
    for (let ch = 0; ch < numChannels; ch++) {
      const colX = channelOffsets[ch] - scrollLeftRef.current;
      const chW = channelWidths[ch];
      if (colX + chW < 0 || colX > width) continue;

      // Active channel highlight
      if (ch === cursor.channelIndex) {
        g.rect(colX, 0, chW, gridHeight);
        g.fill({ color: 0xffffff, alpha: 0.02 });
      }

      // Channel color stripe
      const channelColor = displayPattern?.channels[ch]?.color;
      if (channelColor) {
        g.rect(colX, 0, 2, gridHeight);
        g.fill({ color: parseInt(channelColor.replace('#', ''), 16), alpha: 0.4 });
      }

      // Right separator
      g.rect(colX + chW - 1, 0, 1, gridHeight);
      g.fill({ color: theme.border.color, alpha: theme.border.alpha });
    }

    // Selection overlay
    if (selection && displayPattern) {
      const startCh = Math.min(selection.startChannel, selection.endChannel);
      const endCh = Math.max(selection.startChannel, selection.endChannel);
      const startRow = Math.min(selection.startRow, selection.endRow);
      const endRow = Math.max(selection.startRow, selection.endRow);

      for (let ch = startCh; ch <= endCh && ch < numChannels; ch++) {
        const colX = channelOffsets[ch] - scrollLeftRef.current;
        const chW = channelWidths[ch];
        const y1 = baseY + (startRow - vStart) * rowHeight;
        const h = (endRow - startRow + 1) * rowHeight;
        g.rect(colX, y1, chW, h);
        g.fill({ color: theme.accentGlow.color, alpha: 0.15 });
      }
    }

    // Peer selection overlay (purple)
    const ps = peerSelectionRef.current;
    if (ps && ps.patternIndex === currentPatternIndex) {
      const pStartCh = Math.min(ps.startChannel, ps.endChannel);
      const pEndCh = Math.max(ps.startChannel, ps.endChannel);
      const pStartRow = Math.min(ps.startRow, ps.endRow);
      const pEndRow = Math.max(ps.startRow, ps.endRow);
      for (let ch = pStartCh; ch <= pEndCh && ch < numChannels; ch++) {
        const colX = channelOffsets[ch] - scrollLeftRef.current;
        const chW = channelWidths[ch];
        const y1 = baseY + (pStartRow - vStart) * rowHeight;
        const h = (pEndRow - pStartRow + 1) * rowHeight;
        g.rect(colX, y1, chW, h);
        g.fill({ color: 0xa855f7, alpha: 0.12 });
        g.rect(colX, y1, chW, 1); g.fill({ color: 0xa855f7, alpha: 0.45 });
        g.rect(colX, y1 + h - 1, chW, 1); g.fill({ color: 0xa855f7, alpha: 0.45 });
        g.rect(colX, y1, 1, h); g.fill({ color: 0xa855f7, alpha: 0.45 });
        g.rect(colX + chW - 1, y1, 1, h); g.fill({ color: 0xa855f7, alpha: 0.45 });
      }
    }

    // Peer cursor overlay (purple block)
    const pc = peerCursorRef.current;
    if (pc.active && pc.patternIndex === currentPatternIndex && pc.channel < numChannels) {
      const py = baseY + (pc.row - vStart) * rowHeight;
      const px = channelOffsets[pc.channel] - scrollLeftRef.current + 8;
      g.rect(px, py, CHAR_WIDTH * 3 + 4, rowHeight);
      g.fill({ color: 0xa855f7, alpha: 0.55 });
    }

    // Cursor position
    if (!isPlaying) {
      const cursorCh = cursor.channelIndex;
      if (cursorCh >= 0 && cursorCh < numChannels) {
        const colX = channelOffsets[cursorCh] - scrollLeftRef.current;
        const y = baseY + (cursor.rowIndex - vStart) * rowHeight;
        let cursorW = CHAR_WIDTH * 3 + 4; // note
        let cursorX = colX + 8;
        const noteWidth = CHAR_WIDTH * 3 + 4;
        if (cursor.columnType === 'instrument') { cursorX = colX + 8 + noteWidth + 4; cursorW = CHAR_WIDTH * 2; }
        else if (cursor.columnType === 'volume') { cursorX = colX + 8 + noteWidth + 4 + CHAR_WIDTH * 2 + 4; cursorW = CHAR_WIDTH * 2; }
        else if (cursor.columnType === 'effTyp') { cursorX = colX + 8 + noteWidth + CHAR_WIDTH * 4 + 12; cursorW = CHAR_WIDTH * 3; }
        else if (cursor.columnType === 'effTyp2') { cursorX = colX + 8 + noteWidth + CHAR_WIDTH * 7 + 16; cursorW = CHAR_WIDTH * 3; }
        else if (cursor.columnType === 'flag1') { cursorX = colX + 8 + noteWidth + CHAR_WIDTH * 10 + 20; cursorW = CHAR_WIDTH; }
        else if (cursor.columnType === 'flag2') { cursorX = colX + 8 + noteWidth + CHAR_WIDTH * 11 + 24; cursorW = CHAR_WIDTH; }
        else if (cursor.columnType === 'probability') { cursorX = colX + 8 + noteWidth + CHAR_WIDTH * 12 + 28; cursorW = CHAR_WIDTH * 2; }

        g.rect(cursorX, y, cursorW, rowHeight);
        g.fill({ color: recordMode ? theme.error.color : theme.accent.color, alpha: 0.45 });
      }
    }

    // Line number gutter background
    g.rect(0, 0, LINE_NUMBER_WIDTH, gridHeight);
    g.fill({ color: theme.bg.color, alpha: 0.85 });
  }, [width, gridHeight, theme, visibleLines, vStart, baseY, patternLength, currentRow,
      showGhostPatterns, trackerVisualBg, numChannels, channelOffsets, channelWidths,
      cursor, selection, displayPattern, isPlaying, recordMode, scrollLeft, displayPatternIndex,
      rowHeight, rowHighlightInterval]);

  // ── Generate text labels for visible rows ─────────────────────────────────
  const cellLabels = useMemo(() => {
    if (!displayPattern) return [];
    const labels: { x: number; y: number; text: string; color: number; bold?: boolean; alpha?: number }[] = [];

    for (let i = 0; i < visibleLines; i++) {
      const rowNum = vStart + i;
      const y = baseY + i * rowHeight + rowHeight / 2 - FONT_SIZE / 2;
      if (y + rowHeight < -rowHeight || y > gridHeight + rowHeight) continue;

      // Determine if this row is from the current pattern or a ghost
      let actualRow = rowNum;
      let actualPattern = displayPattern;
      let isGhost = false;

      if (rowNum < 0 || rowNum >= patternLength) {
        if (!showGhostPatterns) continue;
        isGhost = true;
        // Wrap into adjacent patterns
        if (rowNum < 0) {
          const prevPatIdx = displayPatternIndex > 0 ? displayPatternIndex - 1 : patterns.length - 1;
          actualPattern = patterns[prevPatIdx];
          if (!actualPattern) continue;
          actualRow = actualPattern.length + rowNum;
          if (actualRow < 0) continue;
        } else {
          const nextPatIdx = displayPatternIndex < patterns.length - 1 ? displayPatternIndex + 1 : 0;
          actualPattern = patterns[nextPatIdx];
          if (!actualPattern) continue;
          actualRow = rowNum - patternLength;
          if (actualRow >= actualPattern.length) continue;
        }
      }

      // Line number
      const isHighlightRow = actualRow % rowHighlightInterval === 0;
      let lineNumText: string;
      if (showBeatLabels) {
        const beat = Math.floor(actualRow / rowHighlightInterval) + 1;
        const tick = (actualRow % rowHighlightInterval) + 1;
        lineNumText = `${beat}.${tick}`;
      } else {
        lineNumText = useHex
          ? actualRow.toString(16).toUpperCase().padStart(2, '0')
          : actualRow.toString().padStart(2, '0');
      }
      labels.push({
        x: 4,
        y,
        text: lineNumText,
        color: isHighlightRow ? theme.accentSecondary.color : theme.textMuted.color,
        bold: isHighlightRow,
        alpha: isGhost ? 0.35 : undefined,
      });

      // Per-channel cells
      for (let ch = 0; ch < numChannels; ch++) {
        const colX = channelOffsets[ch] - scrollLeftRef.current;
        const chW = channelWidths[ch];
        if (colX + chW < 0 || colX > width) continue;

        const channel = actualPattern.channels[ch];
        if (!channel) continue;
        const isCollapsed = channel.collapsed;
        const cell = channel.rows[actualRow];
        if (!cell) continue;

        const isCurrentRow = rowNum === currentRow;
        const baseX = colX + 8;

        // Note column
        const noteText = noteToString(cell.note ?? 0);
        const noteColor = cell.note === 97
          ? theme.cellEffect.color
          : (cell.note > 0 && cell.note < 97)
            ? (isCurrentRow ? 0xffffff : theme.cellNote.color)
            : theme.cellEmpty.color;
        if (noteText !== '---' || !blankEmpty) {
          labels.push({ x: baseX, y, text: noteText, color: noteColor, alpha: isGhost ? 0.35 : undefined });
        }

        if (isCollapsed) continue;

        const noteWidth = CHAR_WIDTH * 3 + 4;
        let px = baseX + noteWidth + 4;

        // Instrument
        const insText = cell.instrument > 0 ? hexByte(cell.instrument) : (blankEmpty ? '' : '..');
        if (insText) {
          labels.push({ x: px, y, text: insText, color: cell.instrument > 0 ? theme.cellInstrument.color : theme.cellEmpty.color, alpha: isGhost ? 0.35 : undefined });
        }
        px += CHAR_WIDTH * 2 + 4;

        // Volume
        const volValid = cell.volume >= 0x10 && cell.volume <= 0x50;
        const volText = volValid ? hexByte(cell.volume) : (blankEmpty ? '' : '..');
        if (volText) {
          labels.push({ x: px, y, text: volText, color: volValid ? theme.cellVolume.color : theme.cellEmpty.color, alpha: isGhost ? 0.35 : undefined });
        }
        px += CHAR_WIDTH * 2 + 4;

        // Effect columns
        const effectCols = channel.channelMeta?.effectCols ?? 2;
        for (let e = 0; e < effectCols; e++) {
          const typ = e === 0 ? (cell.effTyp ?? 0) : (cell.effTyp2 ?? 0);
          const val = e === 0 ? (cell.eff ?? 0) : (cell.eff2 ?? 0);
          const effText = formatEffect(typ, val, useHex);
          if (effText !== '...' || !blankEmpty) {
            labels.push({ x: px, y, text: effText, color: (typ > 0 || val > 0) ? theme.cellEffect.color : theme.cellEmpty.color, alpha: isGhost ? 0.35 : undefined });
          }
          px += CHAR_WIDTH * 3 + 4;
        }

        // Flag columns
        if (columnVisibility.flag1 && cell.flag1 !== undefined) {
          const flagChar = cell.flag1 === 1 ? 'A' : cell.flag1 === 2 ? 'S' : '.';
          const flagColor = cell.flag1 === 1 ? FLAG_COLORS.accent : cell.flag1 === 2 ? FLAG_COLORS.slide : theme.cellEmpty.color;
          labels.push({ x: px, y, text: flagChar, color: flagColor, alpha: isGhost ? 0.35 : undefined });
          px += CHAR_WIDTH + 4;
        }
        if (columnVisibility.flag2 && cell.flag2 !== undefined) {
          const flagChar = cell.flag2 === 1 ? 'M' : cell.flag2 === 2 ? 'H' : '.';
          const flagColor = cell.flag2 === 1 ? FLAG_COLORS.mute : cell.flag2 === 2 ? FLAG_COLORS.hammer : theme.cellEmpty.color;
          labels.push({ x: px, y, text: flagChar, color: flagColor, alpha: isGhost ? 0.35 : undefined });
          px += CHAR_WIDTH + 4;
        }

        // Probability
        if (columnVisibility.probability && cell.probability !== undefined) {
          const probText = cell.probability > 0
            ? (useHex ? hexByte(cell.probability) : cell.probability.toString().padStart(2, '0'))
            : (blankEmpty ? '' : '..');
          if (probText) {
            labels.push({ x: px, y, text: probText, color: cell.probability > 0 ? probColor(cell.probability) : theme.cellEmpty.color, alpha: isGhost ? 0.35 : undefined });
          }
        }
      }
    }

    return labels;
  }, [displayPattern, patterns, displayPatternIndex, visibleLines, vStart, baseY, gridHeight,
      patternLength, showGhostPatterns, useHex, blankEmpty, numChannels,
      channelOffsets, channelWidths, width, currentRow, theme, columnVisibility, scrollLeft,
      rowHeight, rowHighlightInterval, showBeatLabels]);

  if (!pattern) {
    return (
      <pixiContainer layout={{ width, height }}>
        <pixiBitmapText
          text="No pattern loaded"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ marginTop: 40, marginLeft: 20 }}
        />
      </pixiContainer>
    );
  }

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      {/* ─── Top Horizontal Scrollbar ─────────────────────────────────── */}
      {/* Always rendered — use display:'none' to hide rather than conditional rendering,
          which would free the Yoga node and cause BindingErrors on the next layout pass. */}
      <PixiDOMOverlay
        layout={{ display: allChannelsFit ? 'none' : 'flex', width, height: SCROLLBAR_HEIGHT }}
        style={{ zIndex: 25 }}
        visible={!allChannelsFit}
      >
        <HorizontalScrollbar
          totalWidth={totalChannelsWidth}
          scrollLeft={scrollLeft}
          onScrollChange={(v) => { scrollLeftRef.current = v; setScrollLeft(v); }}
        />
      </PixiDOMOverlay>

      {/* ─── Channel Header — DOM overlay for interactive controls ─────── */}
      <PixiDOMOverlay
        layout={{ width, height: HEADER_HEIGHT }}
        style={{ overflow: 'hidden', zIndex: 20, borderBottom: '1px solid rgba(255,255,255,0.1)' }}
      >
        <ChannelHeaderDOM
          pattern={pattern}
          channelWidths={channelWidths}
          totalChannelsWidth={totalChannelsWidth}
          scrollLeft={scrollLeft}
          onScrollChange={(v) => { scrollLeftRef.current = v; setScrollLeft(v); }}
          channelSpeeds={getTrackerReplayer().getSong()?.channelSpeeds}
          songInitialSpeed={getTrackerReplayer().getSong()?.initialSpeed}
          onToggleMute={toggleChannelMute}
          onToggleSolo={toggleChannelSolo}
          onToggleCollapse={toggleChannelCollapse}
          onSetColor={setChannelColor}
          onUpdateName={updateChannelName}
          onAddChannel={addChannel}
          onFillPattern={handleFillPattern}
          onClearChannel={handleClearChannel}
          onCopyChannel={(ch) => copyTrack(ch)}
          onCutChannel={(ch) => cutTrack(ch)}
          onPasteChannel={(ch) => pasteTrack(ch)}
          onTranspose={handleTranspose}
          onHumanize={handleHumanize}
          onInterpolate={handleInterpolate}
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
      </PixiDOMOverlay>

      {/* ─── Pattern Grid — native Pixi rendering ────────────────────── */}
      <pixiContainer
        layout={{ width, height: gridHeight }}
        eventMode="static"
        cursor={isPlaying ? 'grab' : 'text'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerUpOutside={handlePointerUp}
      >
        {/* TrackerVisualBackground behind the grid */}
        <PixiDOMOverlay
          layout={{ position: 'absolute', width, height: gridHeight, left: 0, top: 0 }}
          style={{ pointerEvents: 'none', zIndex: 0 }}
          visible={trackerVisualBg}
        >
          <TrackerVisualBackground width={width} height={gridHeight} />
        </PixiDOMOverlay>

        <pixiGraphics draw={drawGrid} layout={{ position: 'absolute', width, height: gridHeight }} />

        {/* Cell text labels — positioned via x/y (not layout) so that React can freely
            add/remove them without freeing Yoga nodes. Variable-count layout children
            trigger Yoga BindingErrors when the array shrinks during scroll. */}
        {cellLabels.map((label, i) => (
          <pixiBitmapText
            key={`cell-${i}`}
            text={label.text}
            style={{ fontFamily: label.bold ? PIXI_FONTS.MONO_BOLD : PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }}
            tint={label.color}
            alpha={label.alpha ?? 1.0}
            x={label.x}
            y={label.y}
          />
        ))}

        {/* Drag-and-drop overlay for instruments — only visible during drag */}
        <PixiDOMOverlay
          layout={{ position: 'absolute', width, height: gridHeight, left: 0, top: 0 }}
          style={{ pointerEvents: isDragActive ? 'auto' : 'none', zIndex: 10, background: isDragActive && dragOverCell ? 'rgba(99,102,241,0.08)' : 'transparent', transition: 'background 0.15s' }}
          visible={isDragActive}
        >
          <div
            style={{ width: '100%', height: '100%' }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
        </PixiDOMOverlay>
      </pixiContainer>

      {/* ─── DOM overlays for context menus + parameter editor ────────── */}
      <PixiDOMOverlay
        layout={{ position: 'absolute', width, height, left: 0, top: 0 }}
        style={{ pointerEvents: 'none', zIndex: 30 }}
      >
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

        {/* Parameter Editor */}
        {parameterEditorState?.isOpen && (
          <ParameterEditor
            onClose={() => setParameterEditorState(null)}
            channelIndex={parameterEditorState.channelIndex}
            startRow={parameterEditorState.startRow}
            endRow={parameterEditorState.endRow}
            field={parameterEditorState.field}
          />
        )}
      </PixiDOMOverlay>
    </pixiContainer>
  );
};

// ─── Channel Header DOM Component ───────────────────────────────────────────
// Rendered inside PixiDOMOverlay. Full DOM-based header with interactive controls
// that match the DOM PatternEditorCanvas header 1:1.

interface ChannelHeaderDOMProps {
  pattern: NonNullable<ReturnType<typeof useTrackerStore.getState>['patterns'][0]>;
  channelWidths: number[];
  totalChannelsWidth: number;
  scrollLeft: number;
  onScrollChange: (v: number) => void;
  /** Per-channel speeds from MusicLine/similar formats (undefined = all use initialSpeed) */
  channelSpeeds?: number[];
  songInitialSpeed?: number;
  onToggleMute: (ch: number) => void;
  onToggleSolo: (ch: number) => void;
  onToggleCollapse: (ch: number) => void;
  onSetColor: (ch: number, color: string | null) => void;
  onUpdateName: (ch: number, name: string) => void;
  onAddChannel: () => void;
  onFillPattern: (ch: number, g: GeneratorType) => void;
  onClearChannel: (ch: number) => void;
  onCopyChannel: (ch: number) => void;
  onCutChannel: (ch: number) => void;
  onPasteChannel: (ch: number) => void;
  onTranspose: (ch: number, s: number) => void;
  onHumanize: (ch: number) => void;
  onInterpolate: (ch: number) => void;
  onReverseVisual: (ch: number) => void;
  onPolyrhythm: (ch: number) => void;
  onFibonacci: (ch: number) => void;
  onEuclidean: (ch: number) => void;
  onPingPong: (ch: number) => void;
  onGlitch: (ch: number) => void;
  onStrobe: (ch: number) => void;
  onVisualEcho: (ch: number) => void;
  onConverge: (ch: number) => void;
  onSpiral: (ch: number) => void;
  onBounce: (ch: number) => void;
  onChaos: (ch: number) => void;
}

const ChannelHeaderDOM: React.FC<ChannelHeaderDOMProps> = ({
  pattern,
  channelWidths,
  totalChannelsWidth,
  scrollLeft,
  onScrollChange,
  channelSpeeds,
  songInitialSpeed,
  onToggleMute,
  onToggleSolo,
  onToggleCollapse,
  onSetColor,
  onUpdateName,
  onAddChannel,
  onFillPattern,
  onClearChannel,
  onCopyChannel,
  onCutChannel,
  onPasteChannel,
  onTranspose,
  onHumanize,
  onInterpolate,
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
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const showChannelNames = useUIStore(s => s.showChannelNames);

  const handleHeaderScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const left = e.currentTarget.scrollLeft;
    setTimeout(() => onScrollChange(left), 0);
  }, [onScrollChange]);

  // Sync scroll position when scrollLeft changes externally
  useEffect(() => {
    if (headerScrollRef.current && Math.abs(headerScrollRef.current.scrollLeft - scrollLeft) > 1) {
      headerScrollRef.current.scrollLeft = scrollLeft;
    }
  }, [scrollLeft]);

  return (
    <div className="flex-shrink-0 bg-dark-bgTertiary border-dark-border z-20 relative h-[28px]">
      <div className="flex h-full">
        {/* Row number column header */}
        <div
          className="flex-shrink-0 px-2 text-text-muted text-xs font-medium text-center border-r border-dark-border flex items-center justify-center"
          style={{ width: LINE_NUMBER_WIDTH }}
        >
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
                      {channelSpeeds && channelSpeeds[idx] !== undefined && channelSpeeds[idx] !== songInitialSpeed && (
                        <span
                          className="flex-shrink-0 font-mono text-[9px] font-bold px-0.5 rounded"
                          style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.35)' }}
                          title={`Channel speed: ${channelSpeeds[idx]} ticks/row${channelSpeeds[idx] > 0 && channelSpeeds[idx] !== (songInitialSpeed ?? 0) ? ` (song: ${songInitialSpeed})` : ''}`}
                        >
                          S:{channelSpeeds[idx]}
                        </span>
                      )}
                      {showChannelNames && (
                        <input
                          type="text"
                          className="bg-transparent border-none outline-none font-mono text-[10px] font-bold text-text-primary focus:text-accent-primary transition-colors min-w-0 flex-1 overflow-hidden text-ellipsis uppercase px-0 placeholder:text-text-muted/50"
                          value={channel.name || ''}
                          placeholder={`CH${idx + 1}`}
                          onChange={(e) => setTimeout(() => onUpdateName(idx, e.target.value), 0)}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          title={`Click to rename channel (Short: ${channel.shortName || (idx + 1)})`}
                        />
                      )}
                    </div>
                  )}

                  {!isCollapsed && (
                    <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
                      <ChannelContextMenu
                        channelIndex={idx}
                        channel={channel}
                        patternId={pattern.id}
                        patternLength={pattern.length}
                        onFillPattern={onFillPattern}
                        onClearChannel={onClearChannel}
                        onCopyChannel={onCopyChannel}
                        onCutChannel={onCutChannel}
                        onPasteChannel={onPasteChannel}
                        onTranspose={onTranspose}
                        onHumanize={onHumanize}
                        onInterpolate={onInterpolate}
                        onAcidGenerator={() => {}}
                        onRandomize={() => {}}
                        onToggleCollapse={onToggleCollapse}
                        onReverseVisual={onReverseVisual}
                        onPolyrhythm={onPolyrhythm}
                        onFibonacci={onFibonacci}
                        onEuclidean={onEuclidean}
                        onPingPong={onPingPong}
                        onGlitch={onGlitch}
                        onStrobe={onStrobe}
                        onVisualEcho={onVisualEcho}
                        onConverge={onConverge}
                        onSpiral={onSpiral}
                        onBounce={onBounce}
                        onChaos={onChaos}
                      />
                      <ChannelColorPicker
                        currentColor={channel.color}
                        onColorSelect={(color) => setTimeout(() => onSetColor(idx, color), 0)}
                      />
                      <button
                        onClick={() => setTimeout(() => onToggleMute(idx), 0)}
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
                        onClick={() => setTimeout(() => onToggleSolo(idx), 0)}
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
                        onClick={() => setTimeout(() => onToggleCollapse(idx), 0)}
                        className="p-1 rounded transition-colors text-text-muted hover:text-text-primary hover:bg-dark-bgHover"
                        title="Collapse Channel"
                      >
                        <ChevronLeft size={12} />
                      </button>
                    </div>
                  )}

                  {/* Collapsed state */}
                  {isCollapsed && (
                    <div className="flex items-center justify-between w-full px-1">
                      <span
                        className="font-bold font-mono text-[9px] flex-shrink-0 opacity-80"
                        style={{ color: channel.color || 'var(--color-accent)' }}
                      >
                        {(idx + 1).toString().padStart(2, '0')}
                      </span>
                      <button
                        onClick={() => setTimeout(() => onToggleCollapse(idx), 0)}
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
                onClick={() => setTimeout(() => onAddChannel(), 0)}
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
  );
};

// ─── Horizontal Scrollbar ────────────────────────────────────────────────────
// Thin scrollbar above the header, matching DOM PatternEditorCanvas's top scrollbar.
// Syncs bidirectionally with header/grid scroll.

interface HorizontalScrollbarProps {
  totalWidth: number;
  scrollLeft: number;
  onScrollChange: (v: number) => void;
}

const HorizontalScrollbar: React.FC<HorizontalScrollbarProps> = ({ totalWidth, scrollLeft, onScrollChange }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const left = e.currentTarget.scrollLeft;
    setTimeout(() => onScrollChange(left), 0);
  }, [onScrollChange]);

  // Sync external scroll changes
  useEffect(() => {
    if (scrollRef.current && Math.abs(scrollRef.current.scrollLeft - scrollLeft) > 1) {
      scrollRef.current.scrollLeft = scrollLeft;
    }
  }, [scrollLeft]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="h-3 bg-dark-bgTertiary border-b border-dark-border overflow-x-auto"
      style={{ paddingLeft: LINE_NUMBER_WIDTH }}
    >
      <div style={{ width: totalWidth, height: 1 }} />
    </div>
  );
};
