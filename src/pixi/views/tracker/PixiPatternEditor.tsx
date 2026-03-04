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
 *  - Channel header via PixiChannelHeaders (native GL rendering; DOM portals
 *    only for context menu, color picker, and name editing input)
 *  - Cell context menu via PixiDOMOverlay (right-click menu)
 *  - Collaboration peer cursor/selection in drawGrid
 *  - Stepped horizontal scroll with accumulator (matches DOM behavior)
 */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent, Container as ContainerType } from 'pixi.js';
import { usePixiTheme, type PixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { MegaText, type GlyphLabel } from '../../utils/MegaText';
import { PixiDOMOverlay } from '../../components/PixiDOMOverlay';
import { useTrackerStore, useTransportStore, useUIStore, useCursorStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useCollaborationStore, getCollabClient } from '@stores/useCollaborationStore';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { getTrackerScratchController } from '@engine/TrackerScratchController';
import { useBDAnimations } from '@hooks/tracker/useBDAnimations';
import { GENERATORS, type GeneratorType } from '@utils/patternGenerators';
import { CellContextMenu, useCellContextMenu } from '@/components/tracker/CellContextMenu';
import { ParameterEditor } from '@/components/tracker/ParameterEditor';
import { TrackerVisualBackground } from '@/components/tracker/TrackerVisualBackground';
import { PixiChannelHeaders } from './PixiChannelHeaders';
import { haptics } from '@/utils/haptics';
import * as Tone from 'tone';
import type { CursorPosition, BlockSelection } from '@typedefs';
const SCROLLBAR_HEIGHT = 12;

// ─── Layout constants (must match worker-types / TrackerGLRenderer) ──────────
const CHAR_WIDTH = 10;
const LINE_NUMBER_WIDTH = 40;
const FONT_SIZE = 11;
const HEADER_HEIGHT = 28;
// GL_MUTE_SOLO_H removed — M/S buttons are now in PixiChannelHeaders
const SCROLL_THRESHOLD = 50; // Horizontal scroll accumulator resistance
const V_SCROLL_THRESHOLD = 30; // Vertical scroll accumulator — absorbs trackpad momentum

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

// ─── Imperative render helpers (pure functions, no closures over React state) ─

type TrackerPattern = NonNullable<ReturnType<typeof useTrackerStore.getState>['patterns'][0]>;

type LabelData = GlyphLabel;

interface PeerCursorData {
  row: number; channel: number; active: boolean; patternIndex: number;
}
interface PeerSelectionData {
  startChannel: number; endChannel: number; startRow: number; endRow: number; patternIndex: number;
}

/** All non-cursor render parameters, captured synchronously each React render. */
interface RenderParams {
  width: number;
  gridHeight: number;
  theme: PixiTheme;
  visibleLines: number;
  topLines: number;
  baseY: number;
  patternLength: number;
  showGhostPatterns: boolean;
  trackerVisualBg: boolean;
  numChannels: number;
  channelOffsets: number[];
  channelWidths: number[];
  displayPattern: TrackerPattern | undefined;
  displayPatternIndex: number;
  patterns: TrackerPattern[];
  isPlaying: boolean;
  recordMode: boolean;
  scrollLeft: number;
  rowHeight: number;
  rowHighlightInterval: number;
  channelMuted: boolean[];
  channelSolo: boolean[];
  useHex: boolean;
  blankEmpty: boolean;
  showBeatLabels: boolean;
  columnVisibility: { flag1: boolean; flag2: boolean; probability: boolean };
  currentPatternIndex: number;
  playbackRow: number;
  playbackPatternIdx: number;
}

/** Static grid layer — backgrounds, separators, gutter. */
function renderGrid(g: GraphicsType, p: RenderParams, vStart: number): void {
  g.clear();

  // Always fill the full grid area to prevent black gaps at edges
  g.rect(0, 0, p.width, p.gridHeight);
  g.fill({ color: p.theme.bg.color, alpha: p.trackerVisualBg ? 0.15 : 1 });

  for (let i = 0; i < p.visibleLines; i++) {
    const rowNum = vStart + i;
    const y = p.baseY + i * p.rowHeight;
    if (y + p.rowHeight < 0 || y > p.gridHeight) continue;

    const isInPattern = rowNum >= 0 && rowNum < p.patternLength;
    const isGhost = !isInPattern && p.showGhostPatterns;
    const ghostAlpha = isGhost ? 0.35 : 1;

    if (isInPattern || isGhost) {
      const isHighlight = rowNum >= 0 && rowNum % p.rowHighlightInterval === 0;
      g.rect(LINE_NUMBER_WIDTH, y, p.width - LINE_NUMBER_WIDTH, p.rowHeight);
      g.fill({
        color: isHighlight ? p.theme.trackerRowHighlight.color : p.theme.trackerRowOdd.color,
        alpha: (isHighlight ? p.theme.trackerRowHighlight.alpha : p.theme.trackerRowOdd.alpha) * ghostAlpha,
      });
    }

    // Center-line highlight moved to renderOverlay to avoid grid redraw during scrolling
  }

  for (let ch = 0; ch < p.numChannels; ch++) {
    const colX = p.channelOffsets[ch] - p.scrollLeft;
    const chW = p.channelWidths[ch];
    if (colX + chW < 0 || colX > p.width) continue;

    if (p.channelMuted[ch]) {
      g.rect(colX, 0, chW, p.gridHeight);
      g.fill({ color: 0x000000, alpha: 0.45 });
    }

    const channelColor = p.displayPattern?.channels[ch]?.color;
    if (channelColor) {
      g.rect(colX, 0, 2, p.gridHeight);
      g.fill({ color: parseInt(channelColor.replace('#', ''), 16), alpha: 0.4 });
    }

    g.rect(colX + chW - 1, 0, 1, p.gridHeight);
    g.fill({ color: p.theme.border.color, alpha: p.theme.border.alpha });
  }

  g.rect(0, 0, LINE_NUMBER_WIDTH, p.gridHeight);
  g.fill({ color: p.theme.bg.color, alpha: 0.85 });
}

/** Cursor/selection overlay — active channel, caret, selection, peer cursors. */
function renderOverlay(
  g: GraphicsType, p: RenderParams, cursor: CursorPosition, selection: BlockSelection | null,
  vStart: number, currentRow: number,
  peerCursor: PeerCursorData, peerSel: PeerSelectionData | null,
): void {
  g.clear();

  // Center-line highlight (current row) — drawn here to avoid grid Graphics rebuild during scrolling
  const centerY = p.baseY + (currentRow - vStart) * p.rowHeight;
  g.rect(0, centerY, p.width, p.rowHeight);
  g.fill({ color: p.theme.accentGlow.color, alpha: p.trackerVisualBg ? 0.5 : p.theme.accentGlow.alpha });

  // Active channel highlight
  const cursorCh = cursor.channelIndex;
  if (cursorCh >= 0 && cursorCh < p.numChannels) {
    const colX = p.channelOffsets[cursorCh] - p.scrollLeft;
    const chW = p.channelWidths[cursorCh];
    g.rect(colX, 0, chW, p.gridHeight);
    g.fill({ color: 0xffffff, alpha: 0.02 });
  }

  // Selection overlay
  if (selection && p.displayPattern) {
    const startCh = Math.min(selection.startChannel, selection.endChannel);
    const endCh = Math.max(selection.startChannel, selection.endChannel);
    const startRow = Math.min(selection.startRow, selection.endRow);
    const endRow = Math.max(selection.startRow, selection.endRow);

    for (let ch = startCh; ch <= endCh && ch < p.numChannels; ch++) {
      const colX = p.channelOffsets[ch] - p.scrollLeft;
      const chW = p.channelWidths[ch];
      const y1 = p.baseY + (startRow - vStart) * p.rowHeight;
      const h = (endRow - startRow + 1) * p.rowHeight;
      g.rect(colX, y1, chW, h);
      g.fill({ color: p.theme.accentGlow.color, alpha: 0.15 });
    }
  }

  // Peer selection overlay (purple)
  if (peerSel && peerSel.patternIndex === p.currentPatternIndex) {
    const pStartCh = Math.min(peerSel.startChannel, peerSel.endChannel);
    const pEndCh = Math.max(peerSel.startChannel, peerSel.endChannel);
    const pStartRow = Math.min(peerSel.startRow, peerSel.endRow);
    const pEndRow = Math.max(peerSel.startRow, peerSel.endRow);
    for (let ch = pStartCh; ch <= pEndCh && ch < p.numChannels; ch++) {
      const colX = p.channelOffsets[ch] - p.scrollLeft;
      const chW = p.channelWidths[ch];
      const y1 = p.baseY + (pStartRow - vStart) * p.rowHeight;
      const h = (pEndRow - pStartRow + 1) * p.rowHeight;
      g.rect(colX, y1, chW, h);
      g.fill({ color: 0xa855f7, alpha: 0.12 });
      g.rect(colX, y1, chW, 1); g.fill({ color: 0xa855f7, alpha: 0.45 });
      g.rect(colX, y1 + h - 1, chW, 1); g.fill({ color: 0xa855f7, alpha: 0.45 });
      g.rect(colX, y1, 1, h); g.fill({ color: 0xa855f7, alpha: 0.45 });
      g.rect(colX + chW - 1, y1, 1, h); g.fill({ color: 0xa855f7, alpha: 0.45 });
    }
  }

  // Peer cursor overlay (purple block)
  if (peerCursor.active && peerCursor.patternIndex === p.currentPatternIndex && peerCursor.channel < p.numChannels) {
    const py = p.baseY + (peerCursor.row - vStart) * p.rowHeight;
    const px = p.channelOffsets[peerCursor.channel] - p.scrollLeft + 8;
    g.rect(px, py, CHAR_WIDTH * 3 + 4, p.rowHeight);
    g.fill({ color: 0xa855f7, alpha: 0.55 });
  }

  // Cursor caret
  if (!p.isPlaying && cursorCh >= 0 && cursorCh < p.numChannels) {
    const colX = p.channelOffsets[cursorCh] - p.scrollLeft;
    const y = p.baseY + (cursor.rowIndex - vStart) * p.rowHeight;
    let cursorW = CHAR_WIDTH * 3 + 4;
    let cursorX = colX + 8;
    const noteWidth = CHAR_WIDTH * 3 + 4;
    if (cursor.columnType === 'instrument') { cursorX = colX + 8 + noteWidth + 4; cursorW = CHAR_WIDTH * 2; }
    else if (cursor.columnType === 'volume') { cursorX = colX + 8 + noteWidth + 4 + CHAR_WIDTH * 2 + 4; cursorW = CHAR_WIDTH * 2; }
    else if (cursor.columnType === 'effTyp' || cursor.columnType === 'effParam') { cursorX = colX + 8 + noteWidth + CHAR_WIDTH * 4 + 12; cursorW = CHAR_WIDTH * 3; }
    else if (cursor.columnType === 'effTyp2' || cursor.columnType === 'effParam2') { cursorX = colX + 8 + noteWidth + CHAR_WIDTH * 7 + 16; cursorW = CHAR_WIDTH * 3; }
    else if (cursor.columnType === 'flag1') { cursorX = colX + 8 + noteWidth + CHAR_WIDTH * 10 + 20; cursorW = CHAR_WIDTH; }
    else if (cursor.columnType === 'flag2') { cursorX = colX + 8 + noteWidth + CHAR_WIDTH * 11 + 24; cursorW = CHAR_WIDTH; }
    else if (cursor.columnType === 'probability') { cursorX = colX + 8 + noteWidth + CHAR_WIDTH * 12 + 28; cursorW = CHAR_WIDTH * 2; }

    g.rect(cursorX, y, cursorW, p.rowHeight);
    g.fill({ color: p.recordMode ? p.theme.error.color : p.theme.accent.color, alpha: 0.45 });
  }
}

/** Generate text labels for visible rows (M/S buttons + cell data). */
function generateLabels(p: RenderParams, vStart: number, currentRow: number): LabelData[] {
  if (!p.displayPattern) return [];
  const labels: LabelData[] = [];

  for (let i = 0; i < p.visibleLines; i++) {
    const rowNum = vStart + i;
    const y = p.baseY + i * p.rowHeight + p.rowHeight / 2 - FONT_SIZE / 2;
    if (y + p.rowHeight < -p.rowHeight || y > p.gridHeight + p.rowHeight) continue;

    let actualRow = rowNum;
    let actualPattern = p.displayPattern;
    let isGhost = false;

    if (rowNum < 0 || rowNum >= p.patternLength) {
      if (!p.showGhostPatterns) continue;
      isGhost = true;
      if (rowNum < 0) {
        const prevPatIdx = p.displayPatternIndex > 0 ? p.displayPatternIndex - 1 : p.patterns.length - 1;
        actualPattern = p.patterns[prevPatIdx];
        if (!actualPattern) continue;
        actualRow = actualPattern.length + rowNum;
        if (actualRow < 0) continue;
      } else {
        const nextPatIdx = p.displayPatternIndex < p.patterns.length - 1 ? p.displayPatternIndex + 1 : 0;
        actualPattern = p.patterns[nextPatIdx];
        if (!actualPattern) continue;
        actualRow = rowNum - p.patternLength;
        if (actualRow >= actualPattern.length) continue;
      }
    }

    const isHighlightRow = actualRow % p.rowHighlightInterval === 0;
    let lineNumText: string;
    if (p.showBeatLabels) {
      const beat = Math.floor(actualRow / p.rowHighlightInterval) + 1;
      const tick = (actualRow % p.rowHighlightInterval) + 1;
      lineNumText = `${beat}.${tick}`;
    } else {
      lineNumText = p.useHex
        ? actualRow.toString(16).toUpperCase().padStart(2, '0')
        : actualRow.toString().padStart(2, '0');
    }
    labels.push({
      x: 4, y, text: lineNumText,
      color: isHighlightRow ? p.theme.accentSecondary.color : p.theme.textMuted.color,
      fontFamily: PIXI_FONTS.MONO, alpha: isGhost ? 0.35 : undefined,
    });

    for (let ch = 0; ch < p.numChannels; ch++) {
      const colX = p.channelOffsets[ch] - p.scrollLeft;
      const chW = p.channelWidths[ch];
      if (colX + chW < 0 || colX > p.width) continue;

      const channel = actualPattern.channels[ch];
      if (!channel) continue;
      const isCollapsed = channel.collapsed;
      const cell = channel.rows[actualRow];
      if (!cell) continue;
      const isCurrentRow = rowNum === currentRow;
      const baseX = colX + 8;

      const noteText = noteToString(cell.note ?? 0);
      const noteColor = cell.note === 97
        ? p.theme.cellEffect.color
        : (cell.note > 0 && cell.note < 97)
          ? (isCurrentRow ? 0xffffff : p.theme.cellNote.color)
          : p.theme.cellEmpty.color;
      if (noteText !== '---' || !p.blankEmpty) {
        labels.push({ x: baseX, y, text: noteText, color: noteColor, fontFamily: PIXI_FONTS.MONO, alpha: isGhost ? 0.35 : undefined });
      }

      if (isCollapsed) continue;

      const noteWidth = CHAR_WIDTH * 3 + 4;
      let px = baseX + noteWidth + 4;

      const insText = cell.instrument > 0 ? hexByte(cell.instrument) : (p.blankEmpty ? '' : '..');
      if (insText) {
        labels.push({ x: px, y, text: insText, color: cell.instrument > 0 ? p.theme.cellInstrument.color : p.theme.cellEmpty.color, fontFamily: PIXI_FONTS.MONO, alpha: isGhost ? 0.35 : undefined });
      }
      px += CHAR_WIDTH * 2 + 4;

      const volValid = cell.volume >= 0x10 && cell.volume <= 0x50;
      const volText = volValid ? hexByte(cell.volume) : (p.blankEmpty ? '' : '..');
      if (volText) {
        labels.push({ x: px, y, text: volText, color: volValid ? p.theme.cellVolume.color : p.theme.cellEmpty.color, fontFamily: PIXI_FONTS.MONO, alpha: isGhost ? 0.35 : undefined });
      }
      px += CHAR_WIDTH * 2 + 4;

      const effectCols = channel.channelMeta?.effectCols ?? 2;
      for (let e = 0; e < effectCols; e++) {
        const typ = e === 0 ? (cell.effTyp ?? 0) : (cell.effTyp2 ?? 0);
        const val = e === 0 ? (cell.eff ?? 0) : (cell.eff2 ?? 0);
        const effText = formatEffect(typ, val, p.useHex);
        if (effText !== '...' || !p.blankEmpty) {
          labels.push({ x: px, y, text: effText, color: (typ > 0 || val > 0) ? p.theme.cellEffect.color : p.theme.cellEmpty.color, fontFamily: PIXI_FONTS.MONO, alpha: isGhost ? 0.35 : undefined });
        }
        px += CHAR_WIDTH * 3 + 4;
      }

      if (p.columnVisibility.flag1 && cell.flag1 !== undefined) {
        const flagChar = cell.flag1 === 1 ? 'A' : cell.flag1 === 2 ? 'S' : '.';
        const flagColor = cell.flag1 === 1 ? FLAG_COLORS.accent : cell.flag1 === 2 ? FLAG_COLORS.slide : p.theme.cellEmpty.color;
        labels.push({ x: px, y, text: flagChar, color: flagColor, fontFamily: PIXI_FONTS.MONO, alpha: isGhost ? 0.35 : undefined });
        px += CHAR_WIDTH + 4;
      }
      if (p.columnVisibility.flag2 && cell.flag2 !== undefined) {
        const flagChar = cell.flag2 === 1 ? 'M' : cell.flag2 === 2 ? 'H' : '.';
        const flagColor = cell.flag2 === 1 ? FLAG_COLORS.mute : cell.flag2 === 2 ? FLAG_COLORS.hammer : p.theme.cellEmpty.color;
        labels.push({ x: px, y, text: flagChar, color: flagColor, fontFamily: PIXI_FONTS.MONO, alpha: isGhost ? 0.35 : undefined });
        px += CHAR_WIDTH + 4;
      }

      if (p.columnVisibility.probability && cell.probability !== undefined) {
        const probText = cell.probability > 0
          ? (p.useHex ? hexByte(cell.probability) : cell.probability.toString().padStart(2, '0'))
          : (p.blankEmpty ? '' : '..');
        if (probText) {
          labels.push({ x: px, y, text: probText, color: cell.probability > 0 ? probColor(cell.probability) : p.theme.cellEmpty.color, fontFamily: PIXI_FONTS.MONO, alpha: isGhost ? 0.35 : undefined });
        }
      }
    }
  }

  return labels;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface PixiPatternEditorProps {
  width: number;
  height: number;
  /** When false, always-visible PixiDOMOverlay children are hidden to prevent leaking when this view is inactive. */
  isActive?: boolean;
}

export const PixiPatternEditor: React.FC<PixiPatternEditorProps> = ({ width, height, isActive = true }) => {
  const theme = usePixiTheme();

  // ── Store subscriptions ────────────────────────────────────────────────────
  const {
    pattern,
    patterns,
    currentPatternIndex,
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
    copyTrack: s.copyTrack,
    cutTrack: s.cutTrack,
    pasteTrack: s.pasteTrack,
  })));
  // Derived boolean arrays — must NOT live inside the useShallow object above.
  // .map() always creates a new array reference; inside a useShallow object,
  // Zustand compares with Object.is (reference equality), so the new array is
  // always seen as changed → forceStoreRerender → infinite loop.
  // Separate useShallow selectors compare array elements directly.
  const channelMuted = useTrackerStore(useShallow((s) =>
    (s.patterns[s.currentPatternIndex]?.channels ?? []).map(ch => ch.muted)));
  const channelSolo = useTrackerStore(useShallow((s) =>
    (s.patterns[s.currentPatternIndex]?.channels ?? []).map(ch => ch.solo)));

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

  // ── Cursor/selection refs — updated via subscription, NOT React state ──────
  // Cursor/selection changes are the hottest path (every keypress). By keeping
  // them in refs and redrawing imperatively we bypass @pixi/react reconciliation,
  // which previously caused "Maximum update depth exceeded" crashes on key-repeat.
  const cursorRef = useRef(useCursorStore.getState().cursor);
  const selectionRef = useRef(useCursorStore.getState().selection);

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
    const cur = cursorRef.current;
    const sel = selectionRef.current;
    const channelIdx = cellContextMenu.cellInfo?.channelIndex ?? cur.channelIndex;
    const start = sel?.startRow ?? cur.rowIndex;
    const end = sel?.endRow ?? Math.min(cur.rowIndex + 15, pattern.length - 1);
    setParameterEditorState({ isOpen: true, field, channelIndex: channelIdx, startRow: start, endRow: end });
    cellContextMenu.closeMenu();
  }, [cellContextMenu, pattern]);

  // ── B/D Animation handlers ────────────────────────────────────────────────
  const bdAnimations = useBDAnimations();

  const getBDAnimationOptions = useCallback((channelIndex: number) => {
    const sel = selectionRef.current;
    const startRow = sel ? Math.min(sel.startRow, sel.endRow) : 0;
    const endRow = sel ? Math.max(sel.startRow, sel.endRow) : (pattern?.length ?? 64) - 1;
    return { patternIndex: currentPatternIndex, channelIndex, startRow, endRow };
  }, [currentPatternIndex, pattern?.length]);

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
    const unsub = useCursorStore.subscribe((state, prev) => {
      if (state.selection === prev.selection) return;
      if (useCollaborationStore.getState().status !== 'connected') return;
      const sel = state.selection;
      if (sel) {
        getCollabClient()?.send({
          type: 'peer_selection',
          patternIndex: useTrackerStore.getState().currentPatternIndex,
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
  const vScrollAccRef = useRef(0);

  // Playback row tracking — smooth offset is imperative (no React state)
  const [playbackRow, setPlaybackRow] = useState(0);
  const [playbackPatternIdx, setPlaybackPatternIdx] = useState(0);
  const smoothOffsetRef = useRef(0);          // frame-rate smooth offset — NO React state
  const gridContainerRef = useRef<ContainerType | null>(null);       // outer grid container (for drag coord conversion)
  const gridScrollContainerRef = useRef<ContainerType | null>(null); // inner scroll container
  const gridGraphicsRef = useRef<GraphicsType | null>(null);
  const overlayGraphicsRef = useRef<GraphicsType | null>(null);
  const dragOverlayRef = useRef<GraphicsType | null>(null);
  const megaTextRef = useRef<MegaText | null>(null);
  const prevRowRef = useRef(-1);
  const prevPatternRef = useRef(-1);

  // ── MegaText — single Graphics object for all pattern text ───────────────
  useEffect(() => {
    const container = gridScrollContainerRef.current;
    if (!container) return;
    const mega = new MegaText();
    container.addChild(mega);
    megaTextRef.current = mega;
    return () => {
      container.removeChild(mega);
      mega.destroy();
      megaTextRef.current = null;
    };
  }, []);

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
  // Smooth scroll offset is applied imperatively to the inner container (no React
  // setState), so React re-renders only happen when the INTEGER row or pattern changes.
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      if (!isPlaying) {
        // Reset smooth scroll when stopped
        smoothOffsetRef.current = 0;
        if (gridScrollContainerRef.current) gridScrollContainerRef.current.y = 0;
        prevRowRef.current = -1;
        prevPatternRef.current = -1;
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

      // Always update smooth offset imperatively — NO React setState
      smoothOffsetRef.current = newOffset;
      if (gridScrollContainerRef.current) gridScrollContainerRef.current.y = -newOffset;

      // Only update React state when integer row or pattern changes
      if (newRow !== prevRowRef.current || newPattern !== prevPatternRef.current) {
        prevRowRef.current = newRow;
        prevPatternRef.current = newPattern;
        setPlaybackRow(newRow);
        setPlaybackPatternIdx(newPattern);
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, smoothScrolling]);

  // During playback, use the replayer's pattern index for rendering rather than
  // the store's currentPatternIndex. The RAF loop reads the replayer directly,
  // but the store only updates after queueMicrotask → setCurrentPattern → React
  // re-render. This 1-3 frame timing gap caused visible jumps at pattern transitions
  // because currentRow would be from the new pattern while pattern data was still old.
  const displayPattern = isPlaying
    ? (patterns[playbackPatternIdx] ?? pattern)
    : pattern;
  const displayPatternIndex = isPlaying ? playbackPatternIdx : currentPatternIndex;

  // ── Visible range ─────────────────────────────────────────────────────────
  const scrollbarHeight = allChannelsFit ? 0 : SCROLLBAR_HEIGHT;
  const gridHeight = height - HEADER_HEIGHT - scrollbarHeight;
  const visibleLines = Math.ceil(gridHeight / rowHeight) + 2;
  const topLines = Math.floor(visibleLines / 2);
  const centerLineTop = Math.floor(gridHeight / 2) - rowHeight / 2;
  // baseY no longer includes smoothOffset — the inner scroll container handles sub-pixel offset imperatively
  const baseY = centerLineTop - topLines * rowHeight;
  const patternLength = displayPattern?.length ?? 64;

  // ── Render params ref — captured each React render, read by imperativeRedraw ──
  const renderParamsRef = useRef<RenderParams>(null!);
  renderParamsRef.current = {
    width, gridHeight, theme, visibleLines, topLines, baseY, patternLength,
    showGhostPatterns, trackerVisualBg, numChannels, channelOffsets, channelWidths,
    displayPattern, displayPatternIndex, patterns, isPlaying, recordMode,
    scrollLeft: scrollLeftRef.current, rowHeight, rowHighlightInterval,
    channelMuted, channelSolo, useHex, blankEmpty, showBeatLabels, columnVisibility,
    currentPatternIndex, playbackRow, playbackPatternIdx,
  };

  // ── Imperative redraw — called from subscription (cursor) and useEffect (other deps) ──
  const prevVStartRef = useRef(-9999);
  const fullRedrawRef = useRef(true); // Force full redraw on non-cursor dep changes

  const imperativeRedraw = useCallback(() => {
    const p = renderParamsRef.current;
    const cursor = cursorRef.current;
    const selection = selectionRef.current;
    const currentRow = p.isPlaying ? p.playbackRow : cursor.rowIndex;
    const vStart = currentRow - p.topLines;
    const vStartChanged = vStart !== prevVStartRef.current;
    const mega = megaTextRef.current;

    if (fullRedrawRef.current) {
      fullRedrawRef.current = false;
      prevVStartRef.current = vStart;
      const gGrid = gridGraphicsRef.current;
      if (gGrid) renderGrid(gGrid, p, vStart);
      if (mega) mega.updateLabels(generateLabels(p, vStart, currentRow));
    } else if (vStartChanged) {
      prevVStartRef.current = vStart;
      if (mega) mega.updateLabels(generateLabels(p, vStart, currentRow));
    }

    // Overlay ALWAYS redraws — cursor highlight, selection, peer cursors (cheap)
    const gOverlay = overlayGraphicsRef.current;
    if (gOverlay) renderOverlay(gOverlay, p, cursor, selection, vStart, currentRow,
      peerCursorRef.current, peerSelectionRef.current);
  }, []); // Empty deps — everything read from refs

  // ── Cursor/selection subscription with RAF coalescing ─────────────────────
  const cursorRafRef = useRef(0);

  useEffect(() => {
    const unsub = useCursorStore.subscribe((state, prev) => {
      const cursorChanged = state.cursor !== prev.cursor;
      const selChanged = state.selection !== prev.selection;
      if (!cursorChanged && !selChanged) return;
      cursorRef.current = state.cursor;
      selectionRef.current = state.selection;
      if (!cursorRafRef.current) {
        cursorRafRef.current = requestAnimationFrame(() => {
          cursorRafRef.current = 0;
          imperativeRedraw();
        });
      }
    });
    return () => { unsub(); if (cursorRafRef.current) cancelAnimationFrame(cursorRafRef.current); };
  }, [imperativeRedraw]);

  // ── React-driven redraw — for all non-cursor dep changes ──────────────────
  useEffect(() => {
    fullRedrawRef.current = true;
    imperativeRedraw();
  }, [width, gridHeight, theme, visibleLines, baseY, patternLength,
      showGhostPatterns, trackerVisualBg, numChannels, channelOffsets, channelWidths,
      displayPattern, displayPatternIndex, patterns, isPlaying, recordMode, scrollLeft,
      rowHeight, rowHighlightInterval, channelMuted, channelSolo, useHex, blankEmpty,
      showBeatLabels, columnVisibility, currentPatternIndex, playbackRow, playbackPatternIdx,
      imperativeRedraw]);

  // ── Click → cell mapping ──────────────────────────────────────────────────
  const getCellFromLocal = useCallback((localX: number, localY: number): { rowIndex: number; channelIndex: number; columnType: CursorPosition['columnType'] } | null => {
    if (!pattern) return null;
    const currentRowLocal = isPlaying ? playbackRow : cursorRef.current.rowIndex;
    const rowOffset = Math.floor((localY - centerLineTop) / rowHeight);
    const rowIndex = currentRowLocal + rowOffset;

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
  }, [pattern, numChannels, channelOffsets, channelWidths, centerLineTop, isPlaying, playbackRow, patternLength, columnVisibility, rowHeight]);

  // ── Instrument drag-and-drop handlers (native canvas events) ────────────
  const getCellFromLocalRef = useRef(getCellFromLocal);
  useEffect(() => { getCellFromLocalRef.current = getCellFromLocal; }, [getCellFromLocal]);

  // Attach native dragover/dragleave/drop on the canvas (like wheel/touch)
  useEffect(() => {
    const canvas = document.querySelector('canvas[data-pixijs]') as HTMLCanvasElement | null
      ?? document.querySelector('#pixi-app canvas') as HTMLCanvasElement | null
      ?? document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    /** Convert client coords to grid-local coords using the grid container's global position */
    const toLocal = (clientX: number, clientY: number): { x: number; y: number } | null => {
      const gc = gridContainerRef.current;
      if (!gc) return null;
      const canvasRect = canvas.getBoundingClientRect();
      const gp = gc.getGlobalPosition();
      return { x: clientX - canvasRect.left - gp.x, y: clientY - canvasRect.top - gp.y };
    };

    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('application/x-devilbox-instrument')) return;
      e.preventDefault();
      const local = toLocal(e.clientX, e.clientY);
      if (!local) return;
      const cell = getCellFromLocalRef.current(local.x, local.y);
      if (cell) {
        setDragOverCell({ channelIndex: cell.channelIndex, rowIndex: cell.rowIndex });
        e.dataTransfer.dropEffect = 'copy';
      } else {
        setDragOverCell(null);
      }
    };

    const onDragLeave = () => { setDragOverCell(null); };

    const onDrop = (e: DragEvent) => {
      setDragOverCell(null);
      setIsDragActive(false);
      const dragData = e.dataTransfer?.getData('application/x-devilbox-instrument');
      if (!dragData) return;
      e.preventDefault();
      e.stopPropagation();
      const local = toLocal(e.clientX, e.clientY);
      if (!local) return;
      const cell = getCellFromLocalRef.current(local.x, local.y);
      if (!cell) return;
      try {
        const { id } = JSON.parse(dragData);
        useTrackerStore.getState().setCell(cell.channelIndex, cell.rowIndex, { instrument: id });
        haptics.success();
      } catch (err) {
        console.error('[PixiPatternEditor] Drop failed:', err);
      }
    };

    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('dragleave', onDragLeave);
    canvas.addEventListener('drop', onDrop);
    return () => {
      canvas.removeEventListener('dragover', onDragOver);
      canvas.removeEventListener('dragleave', onDragLeave);
      canvas.removeEventListener('drop', onDrop);
    };
  }, []);

  // ── Mouse handlers ────────────────────────────────────────────────────────
  const isDraggingRef = useRef(false);

  /** Whether the current pointer drag is a scratch-grab (playing + left-click) */
  const isScratchDragRef = useRef(false);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(e.currentTarget);
    const nativeEvent = e.nativeEvent as PointerEvent;

    const cell = getCellFromLocal(local.x, local.y);
    if (!cell) return;

    const cursorStore = useCursorStore.getState();

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
      cursorStore.updateSelection(cell.channelIndex, cell.rowIndex);
    } else {
      cursorStore.moveCursorToRow(cell.rowIndex);
      cursorStore.moveCursorToChannelAndColumn(cell.channelIndex, cell.columnType as any);
      cursorStore.startSelection();
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
      useCursorStore.getState().updateSelection(cell.channelIndex, cell.rowIndex, cell.columnType as any);
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
        // Vertical scroll — stepped with accumulator (absorbs trackpad momentum)
        vScrollAccRef.current += e.deltaY;
        if (Math.abs(vScrollAccRef.current) > V_SCROLL_THRESHOLD) {
          const delta = Math.sign(vScrollAccRef.current);
          vScrollAccRef.current = 0;
          const trackerState = useTrackerStore.getState();
          const pat = trackerState.patterns[trackerState.currentPatternIndex];
          if (!pat) return;
          const cursorState = useCursorStore.getState();
          const newRow = Math.max(0, Math.min(pat.length + 32, cursorState.cursor.rowIndex + delta));
          cursorState.moveCursorToRow(newRow);
        }
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
      {/* ─── Top Horizontal Scrollbar (native GL) ─────────────────────── */}
      {/* Always rendered — use display:'none' to hide rather than conditional rendering,
          which would free the Yoga node and cause BindingErrors on the next layout pass. */}
      <PixiNativeScrollbar
        width={width}
        height={SCROLLBAR_HEIGHT}
        totalWidth={totalChannelsWidth}
        viewportWidth={width - LINE_NUMBER_WIDTH}
        scrollLeft={scrollLeft}
        visible={!allChannelsFit}
        onScrollChange={(v) => { scrollLeftRef.current = v; setScrollLeft(v); }}
        layout={{ display: allChannelsFit ? 'none' : 'flex', width, height: SCROLLBAR_HEIGHT }}
      />

      {/* ─── Channel Header — native GL rendering ─────────────────────── */}
      <PixiChannelHeaders
        pattern={pattern}
        channelWidths={channelWidths}
        channelOffsets={channelOffsets}
        totalChannelsWidth={totalChannelsWidth}
        scrollLeft={scrollLeft}
        width={width}
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

      {/* ─── Pattern Grid — native Pixi rendering ────────────────────── */}
      <pixiContainer
        ref={gridContainerRef}
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

        {/* Smooth-scroll layer — y updated imperatively by RAF; eventMode="none" so clicks pass to outer container */}
        <pixiContainer
          ref={gridScrollContainerRef}
          layout={{ position: 'absolute', width, height: gridHeight }}
          eventMode="none"
        >
          <pixiGraphics ref={gridGraphicsRef} draw={() => {}} layout={{ position: 'absolute', width, height: gridHeight }} />
          <pixiGraphics ref={overlayGraphicsRef} draw={() => {}} layout={{ position: 'absolute', width, height: gridHeight }} />

          {/* MegaText added imperatively to gridScrollContainerRef */}
        </pixiContainer>

        {/* Drag-and-drop highlight overlay — pure GL, visible during instrument drag */}
        <pixiGraphics
          ref={dragOverlayRef}
          visible={isDragActive && !!dragOverCell}
          eventMode="none"
          draw={useCallback((g: GraphicsType) => {
            g.clear();
            g.rect(0, 0, width, gridHeight).fill({ color: 0x6366f1, alpha: 0.08 });
          }, [width, gridHeight])}
          layout={{ position: 'absolute', width, height: gridHeight, left: 0, top: 0 }}
        />
      </pixiContainer>

      {/* ─── DOM overlays for context menus + parameter editor ────────── */}
      <PixiDOMOverlay
        layout={{ position: 'absolute', width, height, left: 0, top: 0 }}
        style={{ pointerEvents: 'none', zIndex: 30 }}
        visible={isActive}
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

// ─── Native GL Horizontal Scrollbar ──────────────────────────────────────────

interface PixiNativeScrollbarProps {
  width: number;
  height: number;
  totalWidth: number;
  viewportWidth: number;
  scrollLeft: number;
  visible: boolean;
  onScrollChange: (v: number) => void;
  layout?: Record<string, unknown>;
}

const PixiNativeScrollbar: React.FC<PixiNativeScrollbarProps> = ({
  width: barWidth, height: barHeight, totalWidth, viewportWidth,
  scrollLeft, visible, onScrollChange, layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollRef = useRef(0);

  const trackX = LINE_NUMBER_WIDTH;
  const trackW = Math.max(1, barWidth - trackX);
  const ratio = viewportWidth / Math.max(1, totalWidth);
  const thumbW = Math.max(20, Math.floor(trackW * Math.min(1, ratio)));
  const maxScroll = Math.max(1, totalWidth - viewportWidth);
  const thumbX = trackX + (scrollLeft / maxScroll) * (trackW - thumbW);

  const drawTrack = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(trackX, 0, trackW, barHeight, 2).fill({ color: theme.bgTertiary.color, alpha: theme.bgTertiary.alpha });
    g.rect(0, barHeight - 1, barWidth, 1).fill({ color: theme.border.color, alpha: theme.border.alpha * 0.5 });
  }, [trackX, trackW, barHeight, barWidth, theme]);

  const drawThumb = useCallback((g: GraphicsType) => {
    g.clear();
    if (!visible || ratio >= 1) return;
    const hovered = draggingRef.current;
    const alpha = hovered ? 0.9 : 0.6;
    g.roundRect(thumbX, 1, thumbW, barHeight - 3, 2).fill({ color: theme.accent.color, alpha });
  }, [thumbX, thumbW, barHeight, visible, ratio, theme]);

  const handlePointerDown = useCallback((e: { global: { x: number }; stopPropagation: () => void }) => {
    e.stopPropagation();
    const localX = e.global.x;
    // Click on track but not on thumb → jump to position
    if (localX < thumbX || localX > thumbX + thumbW) {
      const clickRatio = Math.max(0, Math.min(1, (localX - trackX - thumbW / 2) / (trackW - thumbW)));
      onScrollChange(Math.round(clickRatio * maxScroll));
    }
    draggingRef.current = true;
    dragStartXRef.current = localX;
    dragStartScrollRef.current = scrollLeft;
  }, [thumbX, thumbW, trackX, trackW, maxScroll, scrollLeft, onScrollChange]);

  const handlePointerMove = useCallback((e: { global: { x: number } }) => {
    if (!draggingRef.current) return;
    const dx = e.global.x - dragStartXRef.current;
    const scrollRange = trackW - thumbW;
    if (scrollRange <= 0) return;
    const newScroll = Math.max(0, Math.min(maxScroll, dragStartScrollRef.current + (dx / scrollRange) * maxScroll));
    onScrollChange(Math.round(newScroll));
  }, [trackW, thumbW, maxScroll, onScrollChange]);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  return (
    <pixiContainer
      layout={layoutProp}
      eventMode="static"
      cursor="pointer"
      onGlobalPointerMove={handlePointerMove}
      onPointerUpOutside={handlePointerUp}
      onPointerDown={handlePointerDown}
    >
      <pixiGraphics draw={drawTrack} />
      <pixiGraphics draw={drawThumb} />
    </pixiContainer>
  );
};
