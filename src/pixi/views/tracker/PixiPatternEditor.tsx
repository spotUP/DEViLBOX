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
 *  - Channel header via PixiChannelHeaders (native GL rendering)
 *  - Cell context menu via GL PixiContextMenu (right-click menu)
 *  - ParameterEditor via UIStore openModal → PixiPatternBarEditor in PixiRoot
 *  - Collaboration peer cursor/selection in drawGrid
 *  - Stepped horizontal scroll with accumulator (matches DOM behavior)
 */

import React, { useCallback, useMemo, useRef, useState, useEffect, startTransition } from 'react';
import { useTick } from '@pixi/react';
import type { Graphics as GraphicsType, FederatedPointerEvent, Container as ContainerType } from 'pixi.js';
import { usePixiTheme, type PixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { MegaText, type GlyphLabel } from '../../utils/MegaText';
import { useTrackerStore, useTransportStore, useUIStore, useCursorStore, useEditorStore } from '@stores';
import { useWasmPositionStore } from '@stores/useWasmPositionStore';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { getTrackerScratchController } from '@engine/TrackerScratchController';
import { GENERATORS, type GeneratorType } from '@utils/patternGenerators';
import { PixiContextMenu, type ContextMenuItem } from '../../input/PixiContextMenu';
import { PixiChannelHeaders } from './PixiChannelHeaders';
import { haptics } from '@/utils/haptics';
import * as Tone from 'tone';
import type { CursorPosition, BlockSelection } from '@typedefs';
import { usePatternEditor } from '@hooks/views/usePatternEditor';
import {
  CHORD_TYPES, ARP_PRESETS_UNIQUE,
  chordNotes, invertChord, chordLabel, arpLabel,
  type ChordDefinition, type ArpDefinition,
} from '@/lib/chordDefinitions';
const SCROLLBAR_HEIGHT = 12;

// ─── Layout constants (must match worker-types / TrackerGLRenderer) ──────────
const CHAR_WIDTH = 10;
const LINE_NUMBER_WIDTH = 40;
const FONT_SIZE = 11;
const HEADER_HEIGHT = 48; // 28px channel header + 20px column labels (matches DOM)
// GL_MUTE_SOLO_H removed — M/S buttons are now in PixiChannelHeaders
const SCROLL_THRESHOLD = 50; // Horizontal scroll accumulator resistance
const V_SCROLL_THRESHOLD = 30; // Vertical scroll accumulator — absorbs trackpad momentum

// Width of one note column group: note(34) + gap(4) + instrument(20) + gap(4) + volume(20) + gap(4) = 86
const NOTE_COL_GROUP_WIDTH = (CHAR_WIDTH * 3 + 4) + 4 + (CHAR_WIDTH * 2) + 4 + (CHAR_WIDTH * 2) + 4;

/** Get pixel offset for note column N within a channel (0-based). Column 0 returns 0. */
function noteColOffset(colIdx: number): number {
  return colIdx * NOTE_COL_GROUP_WIDTH;
}

// ─── Pre-computed lookup tables (zero allocations in hot render loop) ────────
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

const HEX_TABLE: string[] = new Array(256);
const DEC_TABLE: string[] = new Array(256);
for (let i = 0; i < 256; i++) {
  HEX_TABLE[i] = i.toString(16).toUpperCase().padStart(2, '0');
  DEC_TABLE[i] = i.toString(10).padStart(2, '0');
}

const EFFECT_CHARS: string[] = new Array(36);
for (let i = 0; i < 10; i++) EFFECT_CHARS[i] = i.toString();
for (let i = 10; i < 36; i++) EFFECT_CHARS[i] = String.fromCharCode(55 + i);

// Symphonie DSP effects — effTyp=0x50 ('D') for bufLen column, effTyp2=0x50+type for type+feedback column
// DSP type 0=Off, 1=Echo, 2=CrEcho, 3=Delay, 4=CrDelay
const DSP_EFFECT_BASE = 0x50;
const DSP_TYPE_CHARS = ['D', 'E', 'C', 'L', 'X'] as const; // D=Off, E=Echo, C=CrEcho, L=deLay, X=CrDelay

const NOTE_TABLE_CACHE = new Map<number, string[]>();
function getNoteTable(displayOffset: number): string[] {
  let table = NOTE_TABLE_CACHE.get(displayOffset);
  if (table) return table;
  // 192 entries covers GT Ultra's range (notes 1-188) plus standard (1-96) and OFF (97)
  table = new Array(192);
  table[0] = '---';
  for (let n = 1; n < 189; n++) {
    const adj = n + displayOffset - 1;
    const semitone = ((adj % 12) + 12) % 12;
    const octave = Math.floor(adj / 12);
    table[n] = `${NOTE_NAMES[semitone]}${octave}`;
  }
  table[97] = 'OFF';
  NOTE_TABLE_CACHE.set(displayOffset, table);
  return table;
}

function noteToString(note: number, displayOffset = 0): string {
  return getNoteTable(displayOffset)[note] ?? '---';
}

function hexByte(val: number): string {
  return HEX_TABLE[val & 0xFF];
}

function formatEffect(typ: number, val: number, useHex: boolean): string {
  if (typ === 0 && val === 0) return '...';
  // Symphonie DSP effects: typ 0x50-0x54 → type letter + value
  if (typ >= DSP_EFFECT_BASE && typ <= DSP_EFFECT_BASE + 4) {
    const dspChar = DSP_TYPE_CHARS[typ - DSP_EFFECT_BASE] ?? 'D';
    return dspChar + (useHex ? HEX_TABLE[val & 0xFF] : DEC_TABLE[val & 0xFF]);
  }
  return (EFFECT_CHARS[typ] ?? '?') + (useHex ? HEX_TABLE[val & 0xFF] : DEC_TABLE[val & 0xFF]);
}

// ─── Color helpers ───────────────────────────────────────────────────────────
const FLAG_COLORS = {
  accent: 0xf59e0b,
  slide: 0x06b6d4,
  mute: 0xfacc15,
  hammer: 0x22d3ee,
};

// Placeholder fill style objects — overwritten per-render inside the component
// with theme-derived colors (see useMemo in PixiPatternEditor).
let FILL_BLACK_045 = { color: 0x000000, alpha: 0.45 };
const FILL_WHITE_002 = { color: 0xffffff, alpha: 0.02 };
let FILL_PURPLE_012 = { color: 0xa855f7, alpha: 0.12 };
let FILL_PURPLE_045 = { color: 0xa855f7, alpha: 0.45 };
let FILL_PURPLE_055 = { color: 0xa855f7, alpha: 0.55 };


function probColor(val: number): number {
  if (val >= 75) return 0x4ade80;
  if (val >= 50) return 0xfacc15;
  if (val >= 25) return 0xfb923c;
  return 0xf87171;
}

/** Lerp a hex color toward white by factor t (0 = original, 1 = white). */
function lerpWhite(color: number, t: number): number {
  if (t <= 0) return color;
  if (t >= 1) return 0xffffff;
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return (
    (Math.round(r + (255 - r) * t) << 16) |
    (Math.round(g + (255 - g) * t) << 8) |
    Math.round(b + (255 - b) * t)
  );
}

// ─── Imperative render helpers (pure functions, no closures over React state) ─

type TrackerPattern = NonNullable<ReturnType<typeof useTrackerStore.getState>['patterns'][0]>;

/** Helper for context-menu "Interpolate Block" items */
function _interpolateBlock(
  ts: ReturnType<typeof useTrackerStore.getState>,
  pat: TrackerPattern | undefined,
  ch: number,
  sel: BlockSelection | null,
  column: 'volume' | 'cutoff' | 'resonance' | 'envMod' | 'pan' | 'effParam' | 'effParam2',
) {
  if (!sel || !pat) return;
  const minRow = Math.min(sel.startRow, sel.endRow);
  const maxRow = Math.max(sel.startRow, sel.endRow);
  const cellProp = column === 'effParam' ? 'eff' : column === 'effParam2' ? 'eff2' : column;
  let startVal: number | null = null;
  for (let r = minRow; r <= maxRow; r++) {
    const val = pat.channels[ch].rows[r][cellProp] as number;
    if (val !== undefined && val !== 0) { startVal = val; break; }
  }
  let endVal: number | null = null;
  for (let r = maxRow; r >= minRow; r--) {
    const val = pat.channels[ch].rows[r][cellProp] as number;
    if (val !== undefined && val !== 0) { endVal = val; break; }
  }
  if (startVal === null || endVal === null) return;
  ts.interpolateSelection(column, startVal, endVal);
}

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
  rowSecondaryHighlightInterval: number;
  channelMuted: boolean[];
  channelSolo: boolean[];
  useHex: boolean;
  blankEmpty: boolean;
  showBeatLabels: boolean;
  columnVisibility: { flag1: boolean; flag2: boolean; probability: boolean };
  currentPatternIndex: number;
  playbackRow: number;
  playbackPatternIdx: number;
  noteDisplayOffset: number;
  // Song-order data for seamless smooth-scroll across pattern boundaries
  smoothScrollActive: boolean;   // true when smooth scrolling during playback
  songPosition: number;          // current position in song order (-1 = not playing)
  songPositions: number[];       // song order (pattern number per position)
  songLength: number;            // total positions in song order
  /** Per-frame cache shared between renderGrid and generateLabels to avoid redundant O(n) walks. */
  songRowCache: Map<number, { pattern: TrackerPattern; row: number } | null>;
  /** Bookmarked row indices (sorted). */
  bookmarks: number[];
}

/**
 * During smooth-scroll playback, resolve a row that falls outside the current
 * pattern [0, patternLength) into the correct pattern + row by walking the song
 * order.  Returns null when resolution fails (song edges, no data).
 */
function resolveSongRow(
  rowNum: number, p: RenderParams,
): { pattern: TrackerPattern; row: number } | null {
  if (!p.smoothScrollActive || p.songPosition < 0 || p.songLength === 0) return null;
  if (p.songRowCache.has(rowNum)) return p.songRowCache.get(rowNum)!;
  const { patterns, songPositions, songLength, songPosition, patternLength } = p;
  let result: { pattern: TrackerPattern; row: number } | null = null;
  if (rowNum < 0) {
    let remain = -rowNum;
    let pos = songPosition - 1;
    while (remain > 0 && pos >= 0) {
      const pat = patterns[songPositions[pos]];
      const len = pat?.length ?? 64;
      if (remain <= len) { result = pat ? { pattern: pat, row: len - remain } : null; break; }
      remain -= len;
      pos--;
    }
  } else if (rowNum >= patternLength) {
    let remain = rowNum - patternLength;
    let pos = songPosition + 1;
    while (remain >= 0 && pos < songLength) {
      const pat = patterns[songPositions[pos]];
      const len = pat?.length ?? 64;
      if (remain < len) { result = pat ? { pattern: pat, row: remain } : null; break; }
      remain -= len;
      pos++;
    }
  }
  p.songRowCache.set(rowNum, result);
  return result;
}

/** Static grid layer — backgrounds, separators, gutter. */
function renderGrid(g: GraphicsType, p: RenderParams, vStart: number): void {
  g.clear();

  // Always fill the full grid area with tracker row color at full opacity.
  // This prevents the red theme.bg from showing through in empty areas.
  // The visual background (if enabled) shows through the individual row fills, not the base.
  g.rect(0, 0, p.width, p.gridHeight);
  g.fill({ color: p.theme.trackerRowEven.color });

  for (let i = 0; i < p.visibleLines; i++) {
    const rowNum = vStart + i;
    const y = p.baseY + i * p.rowHeight;
    if (y + p.rowHeight < 0 || y > p.gridHeight) continue;

    const isInPattern = rowNum >= 0 && rowNum < p.patternLength;
    const isGhost = !isInPattern && p.showGhostPatterns;
    // During smooth-scroll playback, resolve boundary rows via song order
    // so the grid background extends seamlessly across pattern boundaries.
    const songRow = (!isInPattern && !isGhost) ? resolveSongRow(rowNum, p) : null;
    const ghostAlpha = isGhost ? 0.35 : 1;

    if (isInPattern || isGhost || songRow) {
      const actualRow = songRow ? songRow.row : rowNum;
      const isSecondaryHighlight = p.rowSecondaryHighlightInterval > 0 && actualRow >= 0 && actualRow % p.rowSecondaryHighlightInterval === 0;
      const isHighlight = actualRow >= 0 && actualRow % p.rowHighlightInterval === 0;
      g.rect(0, y, p.width, p.rowHeight);
      if (isSecondaryHighlight) {
        g.fill({
          color: p.theme.accent.color,
          alpha: 0.2 * ghostAlpha,
        });
      } else {
        g.fill({
          color: isHighlight ? p.theme.trackerRowHighlight.color : p.theme.trackerRowOdd.color,
          alpha: (isHighlight ? p.theme.trackerRowHighlight.alpha : p.theme.trackerRowOdd.alpha) * ghostAlpha,
        });
      }
    }

    // Center-line highlight moved to renderOverlay to avoid grid redraw during scrolling
  }

  // ── Bookmark indicators — small colored bar at left edge of gutter ──────────
  if (p.bookmarks.length > 0) {
    for (let i = 0; i < p.visibleLines; i++) {
      const rowNum = vStart + i;
      if (rowNum < 0 || rowNum >= p.patternLength) continue;
      if (p.bookmarks.indexOf(rowNum) === -1) continue;
      const y = p.baseY + i * p.rowHeight;
      if (y + p.rowHeight < 0 || y > p.gridHeight) continue;
      // Colored bar along the left edge of the row number gutter
      g.rect(0, y, 3, p.rowHeight);
      g.fill({ color: p.theme.warning.color, alpha: 0.9 });
    }
  }

  const anySolo = p.channelSolo.some(Boolean);

  for (let ch = 0; ch < p.numChannels; ch++) {
    const colX = p.channelOffsets[ch] - p.scrollLeft;
    const chW = p.channelWidths[ch];
    if (colX + chW < 0 || colX > p.width) continue;

    const isDimmed = p.channelMuted[ch] || (anySolo && !p.channelSolo[ch]);
    if (isDimmed) {
      g.rect(colX, 0, chW, p.gridHeight);
      g.fill(FILL_BLACK_045);
    }

    const channelColor = p.displayPattern?.channels[ch]?.color;
    if (channelColor) {
      g.rect(colX, 0, 2, p.gridHeight);
      g.fill({ color: parseInt(channelColor.replace('#', ''), 16), alpha: 0.4 });
    }

    g.rect(colX + chW - 1, 0, 1, p.gridHeight);
    g.fill({ color: p.theme.border.color, alpha: p.theme.border.alpha });
  }

  // No separate line number column background — the grid base fill (trackerRowEven)
  // already covers it, and ghost rows need to show through at reduced alpha.
}

/** Cursor/selection overlay — active channel, caret, selection, peer cursors. */
/** Active channel highlight — fixed position, doesn't scroll with content */
function renderChannelHighlight(
  g: GraphicsType, p: RenderParams, cursor: CursorPosition,
  smoothOffset = 0,
): void {
  g.clear();
  // Anchor rect: prevents @pixi/layout from scaling column-width content to full width.
  g.rect(0, 0, p.width, p.gridHeight).fill({ color: 0x000000, alpha: 0 });
  const cursorCh = cursor.channelIndex;
  if (cursorCh >= 0 && cursorCh < p.numChannels) {
    const colX = p.channelOffsets[cursorCh] - p.scrollLeft;
    const chW = p.channelWidths[cursorCh];
    g.rect(colX, smoothOffset, chW, p.gridHeight);
    g.fill(FILL_WHITE_002);
  }
}

/** Selection, and peer cursors — only redraws on selection/vStart changes. */
function renderOverlay(
  g: GraphicsType, p: RenderParams, _cursor: CursorPosition, selection: BlockSelection | null,
  vStart: number, _currentRow: number,
  peerCursor: PeerCursorData, peerSel: PeerSelectionData | null,
): void {
  g.clear();
  // Anchor rect: prevents @pixi/layout from scaling selection/peer geometry to fill the grid.
  g.rect(0, 0, p.width, p.gridHeight).fill({ color: 0x000000, alpha: 0 });

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
      g.fill({ color: p.theme.accentGlow.color, alpha: p.theme.accentGlow.alpha });
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
      g.fill(FILL_PURPLE_012);
      g.rect(colX, y1, chW, 1); g.fill(FILL_PURPLE_045);
      g.rect(colX, y1 + h - 1, chW, 1); g.fill(FILL_PURPLE_045);
      g.rect(colX, y1, 1, h); g.fill(FILL_PURPLE_045);
      g.rect(colX + chW - 1, y1, 1, h); g.fill(FILL_PURPLE_045);
    }
  }

  // Peer cursor overlay (purple block)
  if (peerCursor.active && peerCursor.patternIndex === p.currentPatternIndex && peerCursor.channel < p.numChannels) {
    const py = p.baseY + (peerCursor.row - vStart) * p.rowHeight;
    const px = p.channelOffsets[peerCursor.channel] - p.scrollLeft + 8;
    g.rect(px, py, CHAR_WIDTH * 3 + 4, p.rowHeight);
    g.fill(FILL_PURPLE_055);
  }
}

/** Cursor caret only — cheapest possible redraw, runs on every cursor move. */
function renderCursorCaret(
  g: GraphicsType, p: RenderParams, cursor: CursorPosition, vStart: number,
  smoothOffset = 0,
): void {
  g.clear();
  // Anchor rect: sets bounding box = layout dimensions so @pixi/layout scale = 1.
  // Without this, layout scales the tiny caret rect up to fill the entire grid area.
  g.rect(0, 0, p.width, p.gridHeight).fill({ color: 0x000000, alpha: 0 });

  const cursorCh = cursor.channelIndex;
  if (cursorCh >= 0 && cursorCh < p.numChannels) {
    const colX = p.channelOffsets[cursorCh] - p.scrollLeft;
    const row = p.isPlaying ? p.playbackRow : cursor.rowIndex;
    const y = p.baseY + (row - vStart) * p.rowHeight + smoothOffset;
    if (!isFinite(colX) || !isFinite(y)) return;
    let cursorW = CHAR_WIDTH * 3 + 4;
    let cursorX = colX + 8;
    const noteWidth = CHAR_WIDTH * 3 + 4;
    const nci = cursor.noteColumnIndex ?? 0;
    const channel = p.displayPattern?.channels[cursorCh];
    const totalNoteCols = channel?.channelMeta?.noteCols ?? 1;
    // Base X after all note column groups (where inst/vol of last col ends, effects start)
    const afterAllNoteCols = colX + 8 + noteColOffset(totalNoteCols);

    if (cursor.columnType === 'note') { cursorX = colX + 8 + noteColOffset(nci); }
    else if (cursor.columnType === 'instrument') { cursorX = colX + 8 + noteColOffset(nci) + noteWidth + 4; cursorW = CHAR_WIDTH * 2; }
    else if (cursor.columnType === 'volume') { cursorX = colX + 8 + noteColOffset(nci) + noteWidth + CHAR_WIDTH * 2 + 8; cursorW = CHAR_WIDTH * 2; }
    else if (cursor.columnType === 'effTyp' || cursor.columnType === 'effParam') { cursorX = afterAllNoteCols; cursorW = CHAR_WIDTH * 3; }
    else if (cursor.columnType === 'effTyp2' || cursor.columnType === 'effParam2') { cursorX = afterAllNoteCols + CHAR_WIDTH * 3 + 4; cursorW = CHAR_WIDTH * 3; }
    else if (cursor.columnType === 'flag1') { const effectCols = channel?.channelMeta?.effectCols ?? 2; cursorX = afterAllNoteCols + effectCols * (CHAR_WIDTH * 3 + 4); cursorW = CHAR_WIDTH; }
    else if (cursor.columnType === 'flag2') { const effectCols = channel?.channelMeta?.effectCols ?? 2; cursorX = afterAllNoteCols + effectCols * (CHAR_WIDTH * 3 + 4) + CHAR_WIDTH + 4; cursorW = CHAR_WIDTH; }
    else if (cursor.columnType === 'probability') { const effectCols = channel?.channelMeta?.effectCols ?? 2; cursorX = afterAllNoteCols + effectCols * (CHAR_WIDTH * 3 + 4) + (p.columnVisibility.flag1 ? CHAR_WIDTH + 4 : 0) + (p.columnVisibility.flag2 ? CHAR_WIDTH + 4 : 0); cursorW = CHAR_WIDTH * 2; }

    g.rect(cursorX, y, cursorW, p.rowHeight);
    g.fill({ color: p.recordMode ? p.theme.error.color : p.theme.accent.color, alpha: 1 });
  }
}

/** Generate text labels for visible rows (M/S buttons + cell data). */
function generateLabels(p: RenderParams, vStart: number, activeRow = -1): LabelData[] {
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
      // During smooth-scroll playback, resolve via song order for seamless
      // visual continuity at pattern boundaries (shown at full alpha).
      const songRow = resolveSongRow(rowNum, p);
      if (songRow) {
        actualPattern = songRow.pattern;
        actualRow = songRow.row;
      } else if (p.showGhostPatterns) {
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
      } else {
        continue;
      }
    }

    const isSecondaryHL = p.rowSecondaryHighlightInterval > 0 && actualRow % p.rowSecondaryHighlightInterval === 0;
    const isHighlightRow = isSecondaryHL || actualRow % p.rowHighlightInterval === 0;
    // Glow trail: rows near the active row lerp toward white, fading over TRAIL_ROWS
    const TRAIL_ROWS = 3;
    // Glow trails BEHIND the playhead: active row = full white, rows already
    // passed (smaller rowNum = visually above) fade out. Rows ahead get no glow.
    const behind = activeRow >= 0 && !isGhost ? activeRow - rowNum : -1;
    const glow = behind >= 0 && behind <= TRAIL_ROWS ? 1 - behind / TRAIL_ROWS : 0;
    // Only highlight cells that actually have content — empty positions stay dim
    const glowFor = (has: boolean) => has ? glow : 0;
    const fontFor = (has: boolean) => has && behind === 0 ? PIXI_FONTS.MONO_BOLD : PIXI_FONTS.MONO;
    const font = behind === 0 ? PIXI_FONTS.MONO_BOLD : PIXI_FONTS.MONO;
    let lineNumText: string;
    if (p.showBeatLabels) {
      const beat = Math.floor(actualRow / p.rowHighlightInterval) + 1;
      const tick = (actualRow % p.rowHighlightInterval) + 1;
      lineNumText = `${beat}.${tick}`;
    } else {
      lineNumText = p.useHex
        ? HEX_TABLE[actualRow & 0xFF]
        : DEC_TABLE[actualRow & 0xFF];
    }
    labels.push({
      x: 4, y, text: lineNumText,
      color: lerpWhite(isHighlightRow ? p.theme.accentSecondary.color : p.theme.textMuted.color, glow),
      fontFamily: font, alpha: isGhost ? 0.35 : undefined,
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
      const baseX = colX + 8;
      const totalNoteCols = channel.channelMeta?.noteCols ?? 1;

      // Render all note column groups (note + instrument + volume per column)
      for (let nc = 0; nc < totalNoteCols; nc++) {
        const ncX = baseX + noteColOffset(nc);
        const n = nc === 0 ? (cell.note ?? 0) : nc === 1 ? (cell.note2 ?? 0) : nc === 2 ? (cell.note3 ?? 0) : (cell.note4 ?? 0);
        const noteText = noteToString(n, p.noteDisplayOffset);
        const noteHasContent = n > 0;
        const noteColor = lerpWhite(
          n === 97 ? p.theme.cellEffect.color
          : (n > 0 && n < 97) ? p.theme.cellNote.color
          : p.theme.cellEmpty.color, glowFor(noteHasContent));
        if (noteText !== '---' || !p.blankEmpty) {
          labels.push({ x: ncX, y, text: noteText, color: noteColor, fontFamily: fontFor(noteHasContent), alpha: isGhost ? 0.35 : undefined });
        }

        if (!isCollapsed) {
          const noteWidth = CHAR_WIDTH * 3 + 4;
          let px = ncX + noteWidth + 4;
          const ins = nc === 0 ? (cell.instrument ?? 0) : nc === 1 ? (cell.instrument2 ?? 0) : nc === 2 ? (cell.instrument3 ?? 0) : (cell.instrument4 ?? 0);
          const insText = ins > 0 ? hexByte(ins) : (p.blankEmpty ? '' : '..');
          if (insText) {
            labels.push({ x: px, y, text: insText, color: lerpWhite(ins > 0 ? p.theme.cellInstrument.color : p.theme.cellEmpty.color, glowFor(ins > 0)), fontFamily: fontFor(ins > 0), alpha: isGhost ? 0.35 : undefined });
          }
          px += CHAR_WIDTH * 2 + 4;
          const vol = nc === 0 ? (cell.volume ?? 0) : nc === 1 ? (cell.volume2 ?? 0) : nc === 2 ? (cell.volume3 ?? 0) : (cell.volume4 ?? 0);
          const volValid = vol >= 0x10 && vol <= 0x50;
          const volText = volValid ? hexByte(vol) : (p.blankEmpty ? '' : '..');
          if (volText) {
            labels.push({ x: px, y, text: volText, color: lerpWhite(volValid ? p.theme.cellVolume.color : p.theme.cellEmpty.color, glowFor(volValid)), fontFamily: fontFor(volValid), alpha: isGhost ? 0.35 : undefined });
          }
        }
      }

      if (isCollapsed) continue;

      // Effects start after all note column groups
      let px = baseX + noteColOffset(totalNoteCols);

      const effectCols = channel.channelMeta?.effectCols ?? 2;
      for (let e = 0; e < effectCols; e++) {
        const typ = e === 0 ? (cell.effTyp ?? 0)
          : e === 1 ? (cell.effTyp2 ?? 0)
          : e === 2 ? (cell.effTyp3 ?? 0)
          : e === 3 ? (cell.effTyp4 ?? 0)
          : (cell.effTyp5 ?? 0);
        const val = e === 0 ? (cell.eff ?? 0)
          : e === 1 ? (cell.eff2 ?? 0)
          : e === 2 ? (cell.eff3 ?? 0)
          : e === 3 ? (cell.eff4 ?? 0)
          : (cell.eff5 ?? 0);
        const effText = formatEffect(typ, val, p.useHex);
        if (effText !== '...' || !p.blankEmpty) {
          const effHasContent = typ > 0 || val > 0;
          labels.push({ x: px, y, text: effText, color: lerpWhite(effHasContent ? p.theme.cellEffect.color : p.theme.cellEmpty.color, glowFor(effHasContent)), fontFamily: fontFor(effHasContent), alpha: isGhost ? 0.35 : undefined });
        }
        px += CHAR_WIDTH * 3 + 4;
      }

      if (p.columnVisibility.flag1 && cell.flag1 !== undefined) {
        const flagChar = cell.flag1 === 1 ? 'A' : cell.flag1 === 2 ? 'S' : '.';
        const flag1HasContent = cell.flag1 === 1 || cell.flag1 === 2;
        const flagColor = lerpWhite(cell.flag1 === 1 ? FLAG_COLORS.accent : cell.flag1 === 2 ? FLAG_COLORS.slide : p.theme.cellEmpty.color, glowFor(flag1HasContent));
        labels.push({ x: px, y, text: flagChar, color: flagColor, fontFamily: fontFor(flag1HasContent), alpha: isGhost ? 0.35 : undefined });
        px += CHAR_WIDTH + 4;
      }
      if (p.columnVisibility.flag2 && cell.flag2 !== undefined) {
        const flagChar = cell.flag2 === 1 ? 'M' : cell.flag2 === 2 ? 'H' : '.';
        const flag2HasContent = cell.flag2 === 1 || cell.flag2 === 2;
        const flagColor = lerpWhite(cell.flag2 === 1 ? FLAG_COLORS.mute : cell.flag2 === 2 ? FLAG_COLORS.hammer : p.theme.cellEmpty.color, glowFor(flag2HasContent));
        labels.push({ x: px, y, text: flagChar, color: flagColor, fontFamily: fontFor(flag2HasContent), alpha: isGhost ? 0.35 : undefined });
        px += CHAR_WIDTH + 4;
      }

      if (p.columnVisibility.probability && cell.probability !== undefined) {
        const probText = cell.probability > 0
          ? (p.useHex ? HEX_TABLE[cell.probability & 0xFF] : DEC_TABLE[cell.probability & 0xFF])
          : (p.blankEmpty ? '' : '..');
        if (probText) {
          labels.push({ x: px, y, text: probText, color: lerpWhite(cell.probability > 0 ? probColor(cell.probability) : p.theme.cellEmpty.color, glowFor(cell.probability > 0)), fontFamily: fontFor(cell.probability > 0), alpha: isGhost ? 0.35 : undefined });
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
  /** Accepted for compatibility; no longer controls DOM overlay visibility. */
  isActive?: boolean;
}

export const PixiPatternEditor: React.FC<PixiPatternEditorProps> = ({ width, height }) => {
  const theme = usePixiTheme();

  // Update module-level fill styles with current theme colors
  FILL_BLACK_045 = { color: 0x000000, alpha: 0.45 }; // Black overlay for muted channels, not theme.bg
  FILL_PURPLE_012 = { color: theme.accentSecondary.color, alpha: 0.12 };
  FILL_PURPLE_045 = { color: theme.accentSecondary.color, alpha: 0.45 };
  FILL_PURPLE_055 = { color: theme.accentSecondary.color, alpha: 0.55 };

  // ── Shared pattern editor logic ────────────────────────────────────────────
  const {
    pattern,
    patterns,
    currentPatternIndex,
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
    showGhostPatterns,
    columnVisibility,
    recordMode,
    channelMuted,
    channelSolo,
    isPlaying,
    rowHeight,
    rowHeightRef,
    trackerVisualBg,
    cursorRef,
    selectionRef,
    peerCursorRef,
    peerSelectionRef,
    bdAnimations,
    numChannels,
    channelOffsets: rawChannelOffsets,
    channelWidths,
    totalChannelsWidth,
  } = usePatternEditor();

  // Center channels when in fullscreen and they don't fill the viewport
  const editorFullscreen = useUIStore(s => s.editorFullscreen);
  const channelOffsets = useMemo(() => {
    if (!editorFullscreen || numChannels === 0) return rawChannelOffsets;
    const usedWidth = LINE_NUMBER_WIDTH + totalChannelsWidth;
    if (usedWidth >= width) return rawChannelOffsets;
    const pad = Math.floor((width - usedWidth) / 2);
    return rawChannelOffsets.map(x => x + pad);
  }, [editorFullscreen, rawChannelOffsets, totalChannelsWidth, width, numChannels]);

  const useHex = useUIStore(s => s.useHexNumbers);
  const blankEmpty = useUIStore(s => s.blankEmptyCells);
  const rowHighlightInterval = useUIStore(s => s.rowHighlightInterval);
  const rowSecondaryHighlightInterval = useUIStore(s => s.rowSecondaryHighlightInterval);
  const showBeatLabels = useUIStore(s => s.showBeatLabels);
  const bookmarks = useEditorStore(s => s.bookmarks);

  // ── Cell context menu (GL-native via PixiContextMenu) ─────────────────────
  const [ctxMenuState, setCtxMenuState] = useState<{
    position: { x: number; y: number } | null;
    rowIndex: number;
    channelIndex: number;
  }>({ position: null, rowIndex: 0, channelIndex: 0 });

  const openCellContextMenu = useCallback((clientX: number, clientY: number, rowIndex: number, channelIndex: number) => {
    setCtxMenuState({ position: { x: clientX, y: clientY }, rowIndex, channelIndex });
  }, []);

  const closeCellContextMenu = useCallback(() => {
    setCtxMenuState(prev => ({ ...prev, position: null }));
  }, []);

  // ── Parameter editor — opens via UIStore modal ────────────────────────────
  const openModal = useUIStore((s) => s.openModal);

  const handleOpenParameterEditor = useCallback((field: 'volume' | 'effect' | 'effectParam') => {
    if (!pattern) return;
    const cur = cursorRef.current;
    const sel = selectionRef.current;
    const channelIdx = ctxMenuState.position ? ctxMenuState.channelIndex : cur.channelIndex;
    const start = sel?.startRow ?? cur.rowIndex;
    const end = sel?.endRow ?? Math.min(cur.rowIndex + 15, pattern.length - 1);
    openModal('parameterEditor', { field, channelIndex: channelIdx, startRow: start, endRow: end });
    closeCellContextMenu();
  }, [ctxMenuState, pattern, openModal, closeCellContextMenu]);

  // ── Preview note at cell ──────────────────────────────────────────────────
  const handlePreviewCell = useCallback((ch: number, row: number) => {
    if (!pattern) return;
    const cell = pattern.channels[ch]?.rows[row];
    if (!cell || !cell.note || cell.note === 97 || cell.note < 1 || cell.note > 96) return;
    import('@engine/ToneEngine').then(({ getToneEngine: engine }) => {
      import('@stores/useInstrumentStore').then(({ useInstrumentStore }) => {
        import('@/lib/xmConversions').then(({ xmNoteToToneJS }) => {
          const instrumentId = cell.instrument || useInstrumentStore.getState().currentInstrumentId || 1;
          const toneEng = engine();
          const inst = useInstrumentStore.getState().getInstrument(instrumentId);
          if (!inst) return;
          const toneNote = xmNoteToToneJS(cell.note);
          if (!toneNote) return;
          const velocity = cell.volume ? Math.min(cell.volume / 64, 1) : 0.8;
          toneEng.ensureInstrumentReady(inst).then(() => {
            toneEng.triggerNoteAttack(inst.id, toneNote, 0, velocity, inst);
            setTimeout(() => {
              toneEng.triggerNoteRelease(inst.id, toneNote, 0, inst);
            }, 500);
          });
        });
      });
    });
    closeCellContextMenu();
  }, [pattern, closeCellContextMenu]);

  // ── B/D Animation handlers ────────────────────────────────────────────────
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

  // ── Build GL context menu items ───────────────────────────────────────────
  const ctxMenuItems = useMemo((): ContextMenuItem[] => {
    const ch = ctxMenuState.channelIndex;
    const row = ctxMenuState.rowIndex;
    const sel = selectionRef.current;
    const hasSelection = !!sel;
    const ts = useTrackerStore.getState();
    const cs = useCursorStore.getState();
    const pat = ts.patterns[ts.currentPatternIndex];

    const items: ContextMenuItem[] = [];

    // Block operations (if selection active)
    if (hasSelection) {
      items.push({ label: '', separator: true });
      items.push({ label: 'Copy Block', action: () => ts.copySelection() });
      items.push({ label: 'Cut Block', action: () => ts.cutSelection() });
      items.push({ label: 'Paste Block', action: () => ts.paste() });
      items.push({
        label: 'Transpose Block',
        submenu: [
          { label: '+1 Semitone', action: () => ts.transposeSelection(1) },
          { label: '-1 Semitone', action: () => ts.transposeSelection(-1) },
          { label: '+1 Octave', action: () => ts.transposeSelection(12) },
          { label: '-1 Octave', action: () => ts.transposeSelection(-12) },
        ],
      });
      items.push({
        label: 'Interpolate Block',
        submenu: [
          { label: 'Interpolate Volume', action: () => _interpolateBlock(ts, pat, ch, sel, 'volume') },
          { label: 'Interpolate Effect 1', action: () => _interpolateBlock(ts, pat, ch, sel, 'effParam') },
          { label: 'Interpolate Effect 2', action: () => _interpolateBlock(ts, pat, ch, sel, 'effParam2') },
          { label: 'Interpolate Cutoff', action: () => _interpolateBlock(ts, pat, ch, sel, 'cutoff') },
          { label: 'Interpolate Resonance', action: () => _interpolateBlock(ts, pat, ch, sel, 'resonance') },
        ],
      });
      items.push({
        label: 'B/D Operations',
        submenu: [
          { label: 'Reverse Visual', action: () => handleReverseVisual(ch) },
          { label: 'Polyrhythm', action: () => handlePolyrhythm(ch) },
          { label: 'Fibonacci Sequence', action: () => handleFibonacci(ch) },
          { label: 'Euclidean Pattern', action: () => handleEuclidean(ch) },
          { label: 'Ping-Pong', action: () => handlePingPong(ch) },
          { label: 'Glitch', action: () => handleGlitch(ch) },
          { label: 'Strobe', action: () => handleStrobe(ch) },
          { label: 'Visual Echo', action: () => handleVisualEcho(ch) },
          { label: 'Converge', action: () => handleConverge(ch) },
          { label: 'Spiral', action: () => handleSpiral(ch) },
          { label: 'Bounce', action: () => handleBounce(ch) },
          { label: 'Chaos', action: () => handleChaos(ch) },
        ],
      });
      items.push({ label: 'Deselect Block', action: () => cs.clearSelection() });
      items.push({ separator: true, label: '' });
    }

    // Preview
    const cellForPreview = pat?.channels[ch]?.rows[row];
    const hasNote = cellForPreview && cellForPreview.note >= 1 && cellForPreview.note <= 96;
    items.push({
      label: 'Preview Note',
      action: () => handlePreviewCell(ch, row),
      disabled: !hasNote,
    });

    // ── Insert Chord submenu ──
    if (hasNote && cellForPreview) {
      const rootNote = cellForPreview.note;
      const rootInst = cellForPreview.instrument || 1;
      const insertChord = (chord: ChordDefinition, inversion: number) => {
        let notes = chordNotes(rootNote, chord.intervals);
        if (inversion > 0) notes = invertChord(notes, inversion);
        // Auto-expand note columns: triads need 2 cols (root + 2), 7ths need 3 cols (root + 3)
        const neededCols = Math.min(4, notes.length);
        const currentCols = pat?.channels[ch]?.channelMeta?.noteCols ?? 1;
        if (neededCols > currentCols) {
          useTrackerStore.getState().setChannelMeta(ch, { noteCols: neededCols });
        }
        // Build cell update: root stays, additional notes go to note2/note3/note4
        const update: Record<string, number> = {};
        if (notes.length >= 2) { update.note2 = notes[1]; update.instrument2 = rootInst; }
        if (notes.length >= 3) { update.note3 = notes[2]; update.instrument3 = rootInst; }
        if (notes.length >= 4) { update.note4 = notes[3]; update.instrument4 = rootInst; }
        ts.setCell(ch, row, update);
      };

      const triadItems: ContextMenuItem[] = CHORD_TYPES
        .filter(c => c.category === 'triad')
        .map(chord => ({
          label: chordLabel(chord, rootNote),
          action: () => insertChord(chord, 0),
        }));

      const seventhItems: ContextMenuItem[] = CHORD_TYPES
        .filter(c => c.category === 'seventh')
        .map(chord => ({
          label: chordLabel(chord, rootNote),
          action: () => insertChord(chord, 0),
        }));

      const inversionItems: ContextMenuItem[] = [
        { label: '1st Inversion', submenu: CHORD_TYPES.filter(c => c.category === 'triad').map(chord => ({
          label: chordLabel(chord, rootNote),
          action: () => insertChord(chord, 1),
        }))},
        { label: '2nd Inversion', submenu: CHORD_TYPES.filter(c => c.category === 'triad').map(chord => ({
          label: chordLabel(chord, rootNote),
          action: () => insertChord(chord, 2),
        }))},
      ];

      items.push({
        label: 'Insert Chord',
        submenu: [
          ...triadItems,
          { separator: true, label: '' },
          ...seventhItems,
          { separator: true, label: '' },
          ...inversionItems,
        ],
      });
    } else {
      items.push({ label: 'Insert Chord', disabled: true });
    }

    // ── Insert Arpeggio submenu ──
    if (hasNote && cellForPreview) {
      const rootNote = cellForPreview.note;
      const insertArp = (arp: ArpDefinition) => {
        if (sel) {
          // Apply to all rows in selection
          const startRow = Math.min(sel.startRow, sel.endRow);
          const endRow = Math.max(sel.startRow, sel.endRow);
          const startCh = Math.min(sel.startChannel, sel.endChannel);
          const endCh = Math.max(sel.startChannel, sel.endChannel);
          for (let c = startCh; c <= endCh; c++) {
            for (let r = startRow; r <= endRow; r++) {
              const cell = pat?.channels[c]?.rows[r];
              if (!cell) continue;
              if (!cell.effTyp && !cell.eff) {
                ts.setCell(c, r, { effTyp: 0, eff: arp.param });
              } else if (!cell.effTyp2 && !cell.eff2) {
                ts.setCell(c, r, { effTyp2: 0, eff2: arp.param });
              } else {
                ts.setCell(c, r, { effTyp: 0, eff: arp.param });
              }
            }
          }
        } else {
          // Single cell
          const cell = cellForPreview;
          if (!cell.effTyp && !cell.eff) {
            ts.setCell(ch, row, { effTyp: 0, eff: arp.param });
          } else if (!cell.effTyp2 && !cell.eff2) {
            ts.setCell(ch, row, { effTyp2: 0, eff2: arp.param });
          } else {
            ts.setCell(ch, row, { effTyp: 0, eff: arp.param });
          }
        }
      };

      items.push({
        label: sel ? 'Insert Arpeggio (selection)' : 'Insert Arpeggio',
        submenu: ARP_PRESETS_UNIQUE.map(arp => ({
          label: arpLabel(arp, rootNote),
          action: () => insertArp(arp),
        })),
      });
    } else {
      items.push({ label: 'Insert Arpeggio', disabled: true });
    }

    items.push({ separator: true, label: '' });

    // Single cell operations
    items.push({ label: '', separator: true });
    items.push({
      label: 'Cut Cell',
      action: () => {
        if (!pat) return;
        const cell = pat.channels[ch].rows[row];
        localStorage.setItem('devilbox-cell-clipboard', JSON.stringify(cell));
        ts.setCell(ch, row, { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
      },
    });
    items.push({
      label: 'Copy Cell',
      action: () => {
        if (!pat) return;
        localStorage.setItem('devilbox-cell-clipboard', JSON.stringify(pat.channels[ch].rows[row]));
      },
    });
    items.push({
      label: 'Paste Cell',
      action: () => {
        const data = localStorage.getItem('devilbox-cell-clipboard');
        if (data) { try { ts.setCell(ch, row, JSON.parse(data)); } catch { /* ignore */ } }
      },
    });
    items.push({
      label: 'Clear',
      action: () => ts.setCell(ch, row, { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 }),
    });
    items.push({ separator: true, label: '' });

    // Insert/Delete row
    items.push({
      label: 'Insert Row',
      action: () => {
        if (!pat) return;
        for (let r = pat.length - 1; r > row; r--) ts.setCell(ch, r, pat.channels[ch].rows[r - 1]);
        ts.setCell(ch, row, { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
      },
    });
    items.push({
      label: 'Delete Row',
      action: () => {
        if (!pat) return;
        for (let r = row; r < pat.length - 1; r++) ts.setCell(ch, r, pat.channels[ch].rows[r + 1]);
        ts.setCell(ch, pat.length - 1, { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
      },
    });
    items.push({ separator: true, label: '' });

    // Visual Parameter Editor
    items.push({
      label: 'Parameter Editor',
      submenu: [
        { label: 'Edit Volume...', action: () => handleOpenParameterEditor('volume') },
        { label: 'Edit Effect Type...', action: () => handleOpenParameterEditor('effect') },
        { label: 'Edit Effect Param...', action: () => handleOpenParameterEditor('effectParam') },
      ],
    });
    items.push({ separator: true, label: '' });

    // Selection
    items.push({ label: 'Select Column', action: () => { cs.selectColumn(ch, cs.cursor.columnType); } });
    items.push({ label: 'Select Channel', action: () => { cs.selectChannel(ch); } });

    if (pat && pat.channels.length > 1) {
      items.push({ separator: true, label: '' });
      items.push({ label: 'Remove Channel', action: () => ts.removeChannel(ch) });
    }

    return items;
  }, [ctxMenuState.channelIndex, ctxMenuState.rowIndex, ctxMenuState.position,
      handleOpenParameterEditor, handlePreviewCell, handleReverseVisual, handlePolyrhythm, handleFibonacci,
      handleEuclidean, handlePingPong, handleGlitch, handleStrobe, handleVisualEcho,
      handleConverge, handleSpiral, handleBounce, handleChaos]);

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

  // ── Scroll state ──────────────────────────────────────────────────────────
  const [scrollLeft, setScrollLeftRaw] = useState(0);
  const scrollLeftRef = useRef(0);
  const scrollAccumulatorRef = useRef(0);
  const vScrollAccRef = useRef(0);

  // Sync horizontal scroll to UIStore so automation lanes can follow
  const setScrollLeft = useCallback((v: number) => {
    setScrollLeftRaw(v);
    useUIStore.getState().patternEditorScrollLeft !== v &&
      useUIStore.setState({ patternEditorScrollLeft: v });
  }, []);

  // Playback row tracking — smooth offset is imperative (no React state)
  const playbackRowRef = useRef(0);
  const [playbackPatternIdx, setPlaybackPatternIdx] = useState(0);
  const smoothOffsetRef = useRef(0);          // frame-rate smooth offset — NO React state
  const gridContainerRef = useRef<ContainerType | null>(null);       // outer grid container (for drag coord conversion)
  const gridScrollContainerRef = useRef<ContainerType | null>(null); // inner scroll container
  const gridGraphicsRef = useRef<GraphicsType | null>(null);
  const overlayGraphicsRef = useRef<GraphicsType | null>(null);
  const channelHighlightRef = useRef<GraphicsType | null>(null);  // fixed channel highlight (outside scroll container)
  const cursorCaretRef = useRef<GraphicsType | null>(null);       // fast-path cursor caret (redraws on every cursor move)
  const highlightGraphicsRef = useRef<GraphicsType | null>(null);   // fixed center-line highlight (outside scroll container)
  const dragOverlayRef = useRef<GraphicsType | null>(null);
  const megaTextRef = useRef<MegaText | null>(null);
  // Clip mask for the grid — prevents pattern rows drawn at negative y (above center)
  // from bleeding into the channel header area above the grid container.
  // Use a plain ref (not state) to avoid triggering a re-render on mount, which
  // would cause @pixi/layout BindingErrors during the initial layout pass.
  const gridClipMaskRef = useRef<GraphicsType | null>(null);
  const prevRowRef = useRef(-1);
  const prevPatternRef = useRef(-1);
  const imperativeRedrawRef = useRef<(() => void) | null>(null);
  const cachedRowDurRef = useRef(0);     // cached row duration — stable for entire row

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

  // ── Pixi ticker for playback tracking ──────────────────────────────────────
  // Runs inside Pixi's own ticker, BEFORE each render. Eliminates jitter from
  // unsynchronized RAF loops and ensures layout engine can't reset our offset.
  const halfFrameRef = useRef(0.008); // ~half of 60fps frame, refined each tick
  useTick((ticker) => {
    // Adaptive half-frame lookahead: centers timing error so row changes appear
    // at the perceptually correct moment (max error = ±half frame instead of 0..full frame).
    const dtSec = ticker.deltaMS / 1000;
    halfFrameRef.current = halfFrameRef.current * 0.9 + (dtSec * 0.5) * 0.1; // EMA smooth

    const { isPlaying: playing, smoothScrolling: smooth } = useTransportStore.getState();

    // Check WASM engine position — these engines don't set transportStore.isPlaying
    // (doing so causes infinite engine respawn via usePatternPlayback effect chain)
    const wasmPos = useWasmPositionStore.getState();
    const effectivePlaying = playing || wasmPos.active;

    // PERF: Early return when idle - skip expensive store reads
    if (!effectivePlaying) {
      if (smoothOffsetRef.current !== 0) {
        smoothOffsetRef.current = 0;
        if (gridScrollContainerRef.current) gridScrollContainerRef.current.pivot.y = 0;
      }
      prevRowRef.current = -1;
      prevPatternRef.current = -1;
      return;
    }

    // Only read other stores when actually playing
    const ts = useTrackerStore.getState();

    let newRow: number;
    let newOffset: number;
    let newPattern: number;
    let newSongPosition = -1;

    if (wasmPos.active) {
      // WASM engine is the authoritative position source
      newRow = wasmPos.row;
      newOffset = 0;
      const patternOrder = ts.patternOrder;
      if (wasmPos.songPos >= 0 && wasmPos.songPos < patternOrder.length) {
        newPattern = patternOrder[wasmPos.songPos] ?? wasmPos.songPos;
      } else {
        newPattern = ts.currentPatternIndex;
      }
      newSongPosition = wasmPos.songPos;
    } else {
      const replayer = getTrackerReplayer();
      const audioTime = Tone.now() + halfFrameRef.current;
      const audioState = replayer.getStateAtTime(audioTime);

      if (audioState) {
        newRow = audioState.row;
        newPattern = audioState.pattern;
        newSongPosition = audioState.position;
        newOffset = 0;
        if (smooth) {
          // Recalculate row duration on row change OR when cached value is 0 (first frame)
          if (cachedRowDurRef.current === 0 || newRow !== prevRowRef.current || newPattern !== prevPatternRef.current) {
            const nextState = replayer.getStateAtTime(audioTime + 0.5, true);
            if (nextState && nextState.row !== audioState.row) {
              cachedRowDurRef.current = nextState.time - audioState.time;
            } else {
              // Compute from BPM/speed — use replayer's actual values for accuracy
              const bpm = useTransportStore.getState().bpm;
              const speed = useTransportStore.getState().speed;
              cachedRowDurRef.current = (2.5 / bpm) * speed;
            }
          }
          const dur = cachedRowDurRef.current;
          if (dur > 0) {
            const progress = Math.min(Math.max((audioTime - audioState.time) / dur, 0), 1);
            newOffset = progress * rowHeightRef.current;
          }
        }
      } else {
        newRow = useTransportStore.getState().currentRow;
        newOffset = 0;
        newPattern = ts.currentPatternIndex;
      }
    }

    smoothOffsetRef.current = newOffset;
    if (gridScrollContainerRef.current) gridScrollContainerRef.current.pivot.y = newOffset;

    // During smooth scrolling, update highlight/caret Y every frame to compensate
    // for pivot.y changes (they're inside the scroll container but must appear fixed).
    if (newOffset > 0) {
      const p = renderParamsRef.current;
      const cursor = cursorRef.current;
      const currentRow = p.isPlaying ? p.playbackRow : cursor.rowIndex;
      const vs = currentRow - p.topLines;
      const gHighlight = highlightGraphicsRef.current;
      if (gHighlight) {
        gHighlight.clear();
        gHighlight.rect(0, 0, p.width, p.gridHeight).fill({ color: 0x000000, alpha: 0 });
        const centerY = p.baseY + (currentRow - vs) * p.rowHeight + newOffset;
        if (centerY >= 0 && centerY < p.gridHeight + newOffset) {
          gHighlight.rect(0, centerY, p.width, p.rowHeight);
          gHighlight.fill({ color: 0xffffff, alpha: p.trackerVisualBg ? 0.15 : 0.12 });
        }
      }
      const gCaret = cursorCaretRef.current;
      if (gCaret) renderCursorCaret(gCaret, p, cursor, vs, newOffset);
      const gChHighlight = channelHighlightRef.current;
      if (gChHighlight) renderChannelHighlight(gChHighlight, p, cursor, newOffset);
    }

    if (newRow !== prevRowRef.current || newPattern !== prevPatternRef.current) {
      const patternChanged = newPattern !== prevPatternRef.current;
      prevRowRef.current = newRow;
      prevPatternRef.current = newPattern;
      // Patch render params imperatively — on pattern change, also swap the
      // displayPattern/displayPatternIndex/patternLength so the imperative
      // redraw draws from the NEW pattern data in this same frame, instead of
      // waiting for React to re-render (which causes a 1-3 frame "pause").
      const patchedParams: Partial<RenderParams> = {
        isPlaying: effectivePlaying,
        playbackRow: newRow,
        playbackPatternIdx: newPattern,
        songPosition: newSongPosition,
        smoothScrollActive: smooth,
      };
      if (patternChanged) {
        const newDisplayPattern = patterns[newPattern] ?? renderParamsRef.current.displayPattern;
        patchedParams.displayPattern = newDisplayPattern;
        patchedParams.displayPatternIndex = newPattern;
        patchedParams.patternLength = newDisplayPattern?.length ?? 64;
      }
      renderParamsRef.current = {
        ...renderParamsRef.current,
        ...patchedParams,
      };
      fullRedrawRef.current = true;
      imperativeRedrawRef.current?.();
      playbackRowRef.current = newRow;
      if (patternChanged) {
        // startTransition: the imperative patch above already updates the display
        // this frame; the React state update is only needed to re-sync displayPattern
        // for the useEffect-driven redraw. Marking it as non-urgent prevents this
        // state flush from blocking Pixi's renderer.render() call.
        startTransition(() => setPlaybackPatternIdx(newPattern));
      }
    }
  });

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

  // ── Memoized layout objects — avoids new refs that trigger Yoga relayout ──
  const gridContainerLayout = useMemo(() => ({ width, height: gridHeight }), [width, gridHeight]);
  const gridScrollLayout = useMemo(() => ({ position: 'absolute' as const, width, height: gridHeight }), [width, gridHeight]);
  const gridGraphicsLayout = useMemo(() => ({ position: 'absolute' as const, width, height: gridHeight }), [width, gridHeight]);
  const scrollbarLayout = useMemo(() => ({ display: allChannelsFit ? 'none' as const : 'flex' as const, width, height: SCROLLBAR_HEIGHT }), [allChannelsFit, width]);
  const dragOverlayLayout = useMemo(() => ({ position: 'absolute' as const, width, height: gridHeight, left: 0, top: 0 }), [width, gridHeight]);
  const drawGridClipMask = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, gridHeight).fill({ color: 0xffffff });
  }, [width, gridHeight]);

  // Apply clip mask to scroll container imperatively after mount.
  // Using useEffect (not state) avoids triggering a re-render during the initial
  // @pixi/layout pass, which would cause Yoga BindingErrors from concurrent
  // insertChild/removeChild calls on nodes not yet fully initialized.
  useEffect(() => {
    const scroll = gridScrollContainerRef.current;
    const mask = gridClipMaskRef.current;
    if (scroll && mask && scroll.mask !== mask) {
      scroll.mask = mask;
    }
  });

  // ── Render params ref — captured each React render, read by imperativeRedraw ──
  const renderParamsRef = useRef<RenderParams>(null!);
  const _song = getTrackerReplayer().getSong(); // cache once per render
  renderParamsRef.current = {
    width, gridHeight, theme, visibleLines, topLines, baseY, patternLength,
    showGhostPatterns, trackerVisualBg, numChannels, channelOffsets, channelWidths,
    displayPattern, displayPatternIndex, patterns, isPlaying, recordMode,
    scrollLeft: scrollLeftRef.current, rowHeight, rowHighlightInterval, rowSecondaryHighlightInterval,
    channelMuted, channelSolo, useHex, blankEmpty, showBeatLabels, columnVisibility,
    currentPatternIndex, playbackRow: playbackRowRef.current, playbackPatternIdx,
    noteDisplayOffset: _song?.noteDisplayOffset ?? 0,
    smoothScrollActive: false,
    songPosition: -1,
    songPositions: _song?.songPositions ?? [],
    songLength: _song?.songPositions?.length ?? 0,
    songRowCache: renderParamsRef.current?.songRowCache ?? new Map(),
    bookmarks,
  };

  // ── Imperative redraw — called from subscription (cursor) and useEffect (other deps) ──
  const prevVStartRef = useRef(-9999);
  const prevSelectionRef = useRef<BlockSelection | null>(null);
  const prevChannelRef = useRef(-1);
  const fullRedrawRef = useRef(true); // Force full redraw on non-cursor dep changes

  const imperativeRedraw = useCallback(() => {
    const p = renderParamsRef.current;
    // Clear per-frame cache so renderGrid and generateLabels share resolved rows
    // without redundant O(n) song-order walks in the same synchronous pass.
    p.songRowCache.clear();
    const cursor = cursorRef.current;
    const selection = selectionRef.current;
    const currentRow = p.isPlaying ? p.playbackRow : cursor.rowIndex;
    const vStart = currentRow - p.topLines;
    const vStartChanged = vStart !== prevVStartRef.current;
    const selectionChanged = selection !== prevSelectionRef.current;
    const channelChanged = cursor.channelIndex !== prevChannelRef.current;
    const mega = megaTextRef.current;

    if (fullRedrawRef.current) {
      fullRedrawRef.current = false;
      prevVStartRef.current = vStart;
      prevSelectionRef.current = selection;
      prevChannelRef.current = cursor.channelIndex;
      const gGrid = gridGraphicsRef.current;
      if (gGrid) renderGrid(gGrid, p, vStart);
      if (mega) mega.updateLabels(generateLabels(p, vStart, p.isPlaying ? currentRow : -1));
      const gOverlay = overlayGraphicsRef.current;
      if (gOverlay) renderOverlay(gOverlay, p, cursor, selection, vStart, currentRow,
        peerCursorRef.current, peerSelectionRef.current);
      const gChHighlight0 = channelHighlightRef.current;
      if (gChHighlight0) renderChannelHighlight(gChHighlight0, p, cursor, smoothOffsetRef.current);
    } else if (vStartChanged) {
      prevVStartRef.current = vStart;
      prevSelectionRef.current = selection;
      prevChannelRef.current = cursor.channelIndex;
      if (mega) mega.updateLabels(generateLabels(p, vStart, p.isPlaying ? currentRow : -1));
      const gOverlay = overlayGraphicsRef.current;
      if (gOverlay) renderOverlay(gOverlay, p, cursor, selection, vStart, currentRow,
        peerCursorRef.current, peerSelectionRef.current);
      const gChHighlight = channelHighlightRef.current;
      if (gChHighlight) renderChannelHighlight(gChHighlight, p, cursor, smoothOffsetRef.current);
    } else if (selectionChanged || channelChanged) {
      // Selection or active channel changed but viewport didn't scroll —
      // redraw overlay (selection) and channel highlight
      prevSelectionRef.current = selection;
      prevChannelRef.current = cursor.channelIndex;
      const gOverlay = overlayGraphicsRef.current;
      if (gOverlay) renderOverlay(gOverlay, p, cursor, selection, vStart, currentRow,
        peerCursorRef.current, peerSelectionRef.current);
      const gChHighlight = channelHighlightRef.current;
      if (gChHighlight) renderChannelHighlight(gChHighlight, p, cursor, smoothOffsetRef.current);
    }
    // When only cursor row moved within same viewport+channel, skip everything
    // except the cursor caret (one rect clear+draw).

    // Cursor caret — always redraws (cheapest possible: clear + 1 rect).
    // Now inside the scroll container, so offset by pivot.y to stay visually fixed.
    const gCaret = cursorCaretRef.current;
    if (gCaret) renderCursorCaret(gCaret, p, cursor, vStart, smoothOffsetRef.current);

    // Center-line highlight — inside scroll container, offset by pivot.y to appear fixed.
    const gHighlight = highlightGraphicsRef.current;
    if (gHighlight) {
      gHighlight.clear();
      // Anchor rect: prevents @pixi/layout from scaling single-row-height content to full grid height.
      gHighlight.rect(0, 0, p.width, p.gridHeight).fill({ color: 0x000000, alpha: 0 });
      const centerY = p.baseY + (currentRow - vStart) * p.rowHeight + smoothOffsetRef.current;
      if (centerY >= 0 && centerY < p.gridHeight) {
        gHighlight.rect(0, centerY, p.width, p.rowHeight);
        gHighlight.fill({ color: 0xffffff, alpha: p.trackerVisualBg ? 0.15 : 0.12 });
      }
    }
  }, []); // Empty deps — everything read from refs
  imperativeRedrawRef.current = imperativeRedraw;

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
      rowHeight, rowHighlightInterval, rowSecondaryHighlightInterval, channelMuted, channelSolo, useHex, blankEmpty,
      showBeatLabels, columnVisibility, currentPatternIndex, playbackPatternIdx, bookmarks,
      imperativeRedraw]);

  // ── Click → cell mapping ──────────────────────────────────────────────────
  const getCellFromLocal = useCallback((localX: number, localY: number): { rowIndex: number; channelIndex: number; noteColumnIndex: number; columnType: CursorPosition['columnType'] } | null => {
    if (!pattern) return null;
    const currentRowLocal = isPlaying ? playbackRowRef.current : cursorRef.current.rowIndex;
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
    if (isCollapsed) return { rowIndex: Math.max(0, Math.min(rowIndex, patternLength - 1)), channelIndex, noteColumnIndex: 0, columnType: 'note' };

    const noteWidth = CHAR_WIDTH * 3 + 4;
    const channel = pattern.channels[channelIndex];
    const totalNoteCols = channel?.channelMeta?.noteCols ?? 1;
    const chLocalX = localX - (channelOffsets[channelIndex] - scrollLeftRef.current) - 8;
    let columnType: CursorPosition['columnType'] = 'note';
    let noteColumnIndex = 0;

    // Check which note column group the click is in
    const allNoteColsEnd = noteColOffset(totalNoteCols);
    if (chLocalX < allNoteColsEnd) {
      // Inside a note column group
      noteColumnIndex = Math.min(totalNoteCols - 1, Math.floor(chLocalX / NOTE_COL_GROUP_WIDTH));
      const xInGroup = chLocalX - noteColOffset(noteColumnIndex);
      if (xInGroup < noteWidth) columnType = 'note';
      else if (xInGroup < noteWidth + 4 + CHAR_WIDTH * 2) columnType = 'instrument';
      else columnType = 'volume';
    } else {
      // After all note columns — effects, flags, probability
      const xInParams = chLocalX - allNoteColsEnd;
      const showAcid = columnVisibility.flag1 || columnVisibility.flag2;
      const showProb = columnVisibility.probability;
      const effectCols = channel?.channelMeta?.effectCols ?? 2;
      const effectWidth = effectCols * (CHAR_WIDTH * 3 + 4);

      if (xInParams < effectWidth) {
        const effCol = Math.floor(xInParams / (CHAR_WIDTH * 3 + 4));
        columnType = effCol === 0 ? 'effTyp' : 'effTyp2';
      } else {
        const afterEffects = effectWidth;
        const flagX = xInParams - afterEffects;
        if (showAcid && columnVisibility.flag1 && flagX < CHAR_WIDTH + 4) columnType = 'flag1';
        else if (showAcid && columnVisibility.flag2 && flagX < (CHAR_WIDTH + 4) * 2) columnType = 'flag2';
        else if (showProb) columnType = 'probability';
        else columnType = 'effTyp';
      }
    }

    return { rowIndex: Math.max(0, Math.min(rowIndex, patternLength - 1)), channelIndex, noteColumnIndex, columnType };
  }, [pattern, numChannels, channelOffsets, channelWidths, centerLineTop, isPlaying, patternLength, columnVisibility, rowHeight]);

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

    // Right-click → move cursor to clicked cell, then open context menu
    if (nativeEvent.button === 2) {
      cursorStore.moveCursorToRow(cell.rowIndex);
      cursorStore.moveCursorToChannelAndColumn(cell.channelIndex, cell.columnType as any, cell.noteColumnIndex);
      openCellContextMenu(nativeEvent.clientX, nativeEvent.clientY, cell.rowIndex, cell.channelIndex);
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
      cursorStore.moveCursorToChannelAndColumn(cell.channelIndex, cell.columnType as any, cell.noteColumnIndex);
      cursorStore.startSelection();
    }
    isDraggingRef.current = true;
  }, [getCellFromLocal, openCellContextMenu]);

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
      // Don't scroll tracker when any GL modal is open — let the modal's scroll view handle it
      if (useUIStore.getState().modalOpen !== null) return;

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
    // Prevent browser context menu on canvas — the app handles right-click itself
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    };
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
        layout={scrollbarLayout}
      />

      {/* ─── Channel Header — native GL rendering ─────────────────────── */}
      <PixiChannelHeaders
        pattern={pattern}
        channelWidths={channelWidths}
        channelOffsets={channelOffsets}
        totalChannelsWidth={totalChannelsWidth}
        scrollLeft={scrollLeft}
        width={width}
        channelSpeeds={_song?.channelSpeeds}
        songInitialSpeed={_song?.initialSpeed}
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
        layout={gridContainerLayout}
        eventMode="static"
        cursor={isPlaying ? 'grab' : 'text'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerUpOutside={handlePointerUp}
      >

        {/* Clip mask — clips the scroll container so pattern rows drawn at negative y
            (above center) don't bleed into the channel header area above.
            NOTE: Do NOT set renderable={false} here. StencilMask.init sets includeInBuild=false
            to hide it from the normal render pass, but StencilMaskPipe.push temporarily sets
            includeInBuild=true and calls collectRenderables. collectRenderables checks
            globalDisplayStatus >= 7, which requires renderable=true (bit 0). With renderable=false
            the stencil buffer is never filled → all content clipped → black editor.
            NOTE: eventMode="none" — this graphics is only used as a mask, never for interaction. */}
        <pixiGraphics
          ref={gridClipMaskRef}
          draw={drawGridClipMask}
          eventMode="none"
          layout={{ position: 'absolute' as const, width, height: gridHeight }}
        />

        {/* Smooth-scroll layer — y updated imperatively by RAF; eventMode="none" so clicks pass to outer container */}
        <pixiContainer
          ref={gridScrollContainerRef}
          layout={gridScrollLayout}
          eventMode="none"
        >
          <pixiGraphics ref={gridGraphicsRef} draw={() => {}} layout={gridGraphicsLayout} />
          <pixiGraphics ref={overlayGraphicsRef} draw={() => {}} layout={gridGraphicsLayout} />
          {/* Center-line highlight + cursor caret draw BEHIND text (MegaText added last, imperatively).
              Their Y is offset by smoothOffsetRef.current so they appear fixed during smooth scrolling. */}
          <pixiGraphics ref={channelHighlightRef} draw={() => {}} layout={gridGraphicsLayout} />
          <pixiGraphics ref={highlightGraphicsRef} draw={() => {}} layout={gridGraphicsLayout} />
          <pixiGraphics ref={cursorCaretRef} draw={() => {}} layout={gridGraphicsLayout} />

          {/* MegaText added imperatively — renders ON TOP of highlight and caret */}
        </pixiContainer>

        {/* Drag-and-drop highlight overlay — pure GL, visible during instrument drag */}
        <pixiGraphics
          ref={dragOverlayRef}
          visible={isDragActive && !!dragOverCell}
          eventMode="none"
          draw={useCallback((g: GraphicsType) => {
            g.clear();
            g.rect(0, 0, width, gridHeight).fill({ color: theme.accent.color, alpha: 0.08 });
          }, [width, gridHeight])}
          layout={dragOverlayLayout}
        />
      </pixiContainer>

      {/* ─── GL Context Menu (rendered by PixiGlobalDropdownLayer) ──────── */}
      <PixiContextMenu
        items={ctxMenuItems}
        x={ctxMenuState.position?.x ?? 0}
        y={ctxMenuState.position?.y ?? 0}
        isOpen={!!ctxMenuState.position}
        onClose={closeCellContextMenu}
      />

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
