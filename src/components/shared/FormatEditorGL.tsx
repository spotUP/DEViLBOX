/**
 * FormatEditorGL — WebGL2 OffscreenCanvas pattern editor for custom formats.
 *
 * Data-driven via ColumnDef[] + FormatChannel[]. Uses the same WebGL2 worker
 * pipeline as the standard PatternEditorCanvas but without reading from the
 * tracker store.
 */

import React, {
  useRef, useEffect, useCallback, useState,
} from 'react';
import { TrackerOffscreenBridge } from '@engine/renderer/OffscreenBridge';
import type {
  ThemeSnapshot,
  UIStateSnapshot,
  ChannelLayoutSnapshot,
} from '@engine/renderer/worker-types';
import TrackerWorkerFactory from '@/workers/tracker-render.worker.ts?worker';
import type { ColumnDef, FormatChannel, OnCellChange } from './format-editor-types';
import { toColumnSpec, formatChannelsToSnapshot } from './format-editor-types';

// ─── Layout constants ─────────────────────────────────────────────────────────

const CHAR_WIDTH = 10;
const LINE_NUMBER_WIDTH = 40;
const COL_GAP = 4;
const CHAN_GAP = 8;
const ROW_HEIGHT = 24;

// ─── Theme ────────────────────────────────────────────────────────────────────

const DARK_THEME: ThemeSnapshot = {
  accent: '#00aaff',
  accentSecondary: '#0077cc',
  accentGlow: 'rgba(0, 170, 255, 0.4)',
  rowCurrent: '#e94560',
  bg: '#0d0d0d',
  rowNormal: '#111111',
  rowHighlight: '#1a1a1a',
  border: '#333333',
  textNote: '#60e060',
  textNoteActive: '#ffffff',
  textMuted: '#444444',
  textInstrument: '#e0e060',
  textVolume: '#60a0e0',
  textEffect: '#e06060',
  lineNumber: '#444444',
  lineNumberHighlight: '#666666',
  selection: 'rgba(100, 149, 237, 0.35)',
};

// ─── Pure layout helpers ──────────────────────────────────────────────────────

function computeLayout(
  channels: FormatChannel[],
  columns: ColumnDef[],
): ChannelLayoutSnapshot {
  const contentWidth = columns.length > 0
    ? columns.reduce((sum, col) => sum + col.charWidth * CHAR_WIDTH + COL_GAP, 0) - COL_GAP
    : 0;
  const channelWidth = LINE_NUMBER_WIDTH + contentWidth + CHAN_GAP;
  return {
    offsets: channels.map((_, i) => i * channelWidth),
    widths: channels.map(() => channelWidth),
    totalWidth: channels.length * channelWidth,
  };
}

function buildUIState(columns: ColumnDef[]): UIStateSnapshot {
  return {
    useHex: true,
    blankEmpty: false,
    showGhostPatterns: false,
    columnVisibility: { flag1: false, flag2: false, probability: false },
    trackerVisualBg: false,
    recordMode: false,
    rowHeight: ROW_HEIGHT,
    rowHighlightInterval: 8,
    showBeatLabels: false,
    noteDisplayOffset: 0,
    columns: columns.map(toColumnSpec),
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CursorState {
  channelIndex: number;
  rowIndex: number;
  columnIndex: number;
}

export interface FormatEditorGLProps {
  columns: ColumnDef[];
  channels: FormatChannel[];
  currentRow: number;
  currentRowPerChannel?: number[];
  isPlaying: boolean;
  onCellChange?: OnCellChange;
}

// ─── Piano key map (z=C, s=C#, x=D, ... matches FormatPatternEditor) ─────────

const KEY_TO_SEMITONE: Record<string, number> = {
  'z': 0, 's': 1, 'x': 2, 'd': 3, 'c': 4, 'v': 5,
  'g': 6, 'b': 7, 'h': 8, 'n': 9, 'j': 10, 'm': 11,
  'q': 12, '2': 13, 'w': 14, '3': 15, 'e': 16, 'r': 17,
  '5': 18, 't': 19, '6': 20, 'y': 21, '7': 22, 'u': 23,
  'i': 24, '9': 25, 'o': 26, '0': 27, 'p': 28,
};

function noteKeyToMidi(key: string, octave: number): number | null {
  const semitone = KEY_TO_SEMITONE[key.toLowerCase()];
  if (semitone === undefined) return null;
  const midi = semitone + octave * 12;
  return midi >= 0 && midi <= 95 ? midi : null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const FormatEditorGL: React.FC<FormatEditorGLProps> = ({
  columns,
  channels,
  currentRow,
  currentRowPerChannel: _currentRowPerChannel,
  isPlaying,
  onCellChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<TrackerOffscreenBridge | null>(null);
  const transferredRef = useRef<boolean>(false);

  const [webglUnsupported, setWebglUnsupported] = useState<boolean>(false);
  const [cursor, setCursor] = useState<CursorState>({
    channelIndex: 0, rowIndex: 0, columnIndex: 0,
  });
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 800, height: 600,
  });
  const [octave, setOctave] = useState<number>(3);

  // ── Initialization ────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || transferredRef.current) return;
    transferredRef.current = true;

    const bridge = new TrackerOffscreenBridge(TrackerWorkerFactory, {
      onReady: () => {
        // Initial data already sent in init message — nothing extra needed.
      },
      onMessage: (msg) => {
        if (msg.type === 'webgl-unsupported') {
          setWebglUnsupported(true);
        }
      },
      onError: (err) => {
        console.error('[FormatEditorGL] Worker error:', err);
      },
    });
    bridgeRef.current = bridge;

    const offscreen = canvas.transferControlToOffscreen();
    bridge.post({
      type: 'init',
      canvas: offscreen,
      dpr: window.devicePixelRatio || 1,
      width: dimensions.width,
      height: dimensions.height,
      theme: DARK_THEME,
      uiState: buildUIState(columns),
      patterns: [formatChannelsToSnapshot(channels, columns)],
      currentPatternIndex: 0,
      cursor: { rowIndex: 0, channelIndex: 0, columnType: '0', digitIndex: 0 },
      selection: null,
      channelLayout: computeLayout(channels, columns),
    }, [offscreen]);

    return () => {
      bridge.dispose();
      bridgeRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ResizeObserver ────────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const w = Math.max(1, Math.floor(width));
        const h = Math.max(1, Math.floor(height));
        setDimensions({ width: w, height: h });
        bridgeRef.current?.post({ type: 'resize', w, h, dpr: window.devicePixelRatio || 1 });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ── Sync columns / channels ───────────────────────────────────────────────

  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    bridge.post({ type: 'uiState', uiState: buildUIState(columns) });
    bridge.post({
      type: 'patterns',
      patterns: [formatChannelsToSnapshot(channels, columns)],
      currentPatternIndex: 0,
    });
    bridge.post({ type: 'channelLayout', channelLayout: computeLayout(channels, columns) });
  }, [columns, channels]);

  // ── Sync playback ─────────────────────────────────────────────────────────

  useEffect(() => {
    bridgeRef.current?.post({
      type: 'playback',
      row: currentRow,
      smoothOffset: 0,
      patternIndex: 0,
      isPlaying,
    });
  }, [currentRow, isPlaying]);

  // ── Sync cursor ───────────────────────────────────────────────────────────

  useEffect(() => {
    bridgeRef.current?.post({
      type: 'cursor',
      cursor: {
        rowIndex: cursor.rowIndex,
        channelIndex: cursor.channelIndex,
        columnType: String(cursor.columnIndex),
        digitIndex: 0,
      },
    });
  }, [cursor]);

  // ── Keyboard handler ──────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const numRows = channels[0]?.patternLength ?? 0;
    const col = columns[cursor.columnIndex];

    const moveCursor = (delta: Partial<CursorState>) => {
      setCursor(prev => ({
        channelIndex: Math.max(0, Math.min(channels.length - 1,
          prev.channelIndex + (delta.channelIndex ?? 0))),
        rowIndex: Math.max(0, Math.min(numRows - 1,
          prev.rowIndex + (delta.rowIndex ?? 0))),
        columnIndex: Math.max(0, Math.min(columns.length - 1,
          prev.columnIndex + (delta.columnIndex ?? 0))),
      }));
    };

    // Octave change
    if (e.key === '[' || e.key === '-') {
      e.preventDefault();
      setOctave(o => Math.max(0, o - 1));
      return;
    }
    if (e.key === ']' || e.key === '=') {
      e.preventDefault();
      setOctave(o => Math.min(7, o + 1));
      return;
    }

    // Note-off
    if ((e.key === '`' || e.key === '1') && col?.type === 'note') {
      e.preventDefault();
      onCellChange?.(cursor.channelIndex, cursor.rowIndex, col.key, 0xFE);
      moveCursor({ rowIndex: +1 });
      return;
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        moveCursor({ rowIndex: -1 });
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveCursor({ rowIndex: +1 });
        break;
      case 'ArrowLeft':
        e.preventDefault();
        moveCursor({ columnIndex: -1 });
        break;
      case 'ArrowRight':
        e.preventDefault();
        moveCursor({ columnIndex: +1 });
        break;
      case 'Tab':
        e.preventDefault();
        moveCursor({ channelIndex: e.shiftKey ? -1 : +1 });
        break;
      case 'PageUp':
        e.preventDefault();
        moveCursor({ rowIndex: -16 });
        break;
      case 'PageDown':
        e.preventDefault();
        moveCursor({ rowIndex: +16 });
        break;
      case 'Home':
        e.preventDefault();
        setCursor(prev => ({ ...prev, rowIndex: 0 }));
        break;
      case 'End':
        e.preventDefault();
        setCursor(prev => ({ ...prev, rowIndex: Math.max(0, numRows - 1) }));
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (col) {
          onCellChange?.(cursor.channelIndex, cursor.rowIndex, col.key, col.emptyValue ?? 0);
          moveCursor({ rowIndex: +1 });
        }
        break;
      default: {
        if (!col) break;

        if (col.type === 'note') {
          const midi = noteKeyToMidi(e.key, octave);
          if (midi !== null) {
            e.preventDefault();
            onCellChange?.(cursor.channelIndex, cursor.rowIndex, col.key, midi);
            moveCursor({ rowIndex: +1 });
          }
        } else if (col.type === 'hex' || col.type === 'ctrl') {
          const digit = parseInt(e.key, 16);
          if (!isNaN(digit) && /^[0-9a-fA-F]$/.test(e.key)) {
            e.preventDefault();
            const hexDigits = col.hexDigits ?? 2;
            const cur = channels[cursor.channelIndex]?.rows[cursor.rowIndex]?.[col.key]
              ?? (col.emptyValue ?? 0);
            const mask = (1 << (hexDigits * 4)) - 1;
            const shifted = ((cur << 4) | digit) & mask;
            onCellChange?.(cursor.channelIndex, cursor.rowIndex, col.key, shifted);
            moveCursor({ rowIndex: +1 });
          }
        }
        break;
      }
    }
  }, [cursor, columns, channels, onCellChange, octave]);

  // ── Mouse click handler (main-thread hit test) ────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;

    const layout = computeLayout(channels, columns);

    // Find channel
    let channelIndex = -1;
    for (let ch = 0; ch < layout.offsets.length; ch++) {
      if (relX >= layout.offsets[ch] && relX < layout.offsets[ch] + layout.widths[ch]) {
        channelIndex = ch;
        break;
      }
    }
    if (channelIndex < 0) return;

    // Find row (center-aligned like the WebGL renderer)
    const numRows = channels[channelIndex]?.patternLength ?? 0;
    const currentDisplayRow = isPlaying ? currentRow : cursor.rowIndex;
    const containerHeight = container.clientHeight;
    const centerLineTop = Math.floor(containerHeight / 2) - ROW_HEIGHT / 2;
    const rowOffset = Math.floor((relY - centerLineTop) / ROW_HEIGHT);
    const rowIndex = Math.max(0, Math.min(numRows - 1, currentDisplayRow + rowOffset));

    // Find column
    const localX = relX - layout.offsets[channelIndex] - LINE_NUMBER_WIDTH;
    let colIdx = 0;
    let px = 0;
    for (let ci = 0; ci < columns.length; ci++) {
      const colW = columns[ci].charWidth * CHAR_WIDTH + COL_GAP;
      if (localX < px + colW) { colIdx = ci; break; }
      px += colW;
      if (ci === columns.length - 1) colIdx = ci;
    }

    setCursor({ channelIndex, rowIndex, columnIndex: colIdx });
    containerRef.current?.focus();
  }, [channels, columns, cursor.rowIndex, currentRow, isPlaying]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      style={{ width: '100%', height: '100%', position: 'relative', outline: 'none' }}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
    >
      {webglUnsupported ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', height: '100%',
          color: '#666', fontSize: '12px', fontFamily: 'monospace',
        }}>
          WebGL2 unavailable — pattern editor cannot be displayed.
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      )}
    </div>
  );
};
