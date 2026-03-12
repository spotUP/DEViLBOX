/**
 * FormatPatternEditor — Canvas2D pattern editor for any format.
 *
 * Data-driven via ColumnDef[], supports multiple column types (note, hex, ctrl).
 * Provides keyboard input, mouse navigation, selection, and scrolling.
 */

import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import type { ColumnDef, FormatChannel, OnCellChange } from './format-editor-types';

const CHAR_W = 8;
const CHAR_H = 14;
const ROW_H = CHAR_H + 2;
const ROW_NUM_W = CHAR_W * 3 + 4;
const COL_GAP = 4;
const CHAN_GAP = 8;
const HEADER_H = ROW_H + 4;

const COLORS = {
  bg: '#0d0d0d',
  bgAlt: 'var(--color-bg-secondary)',
  headerBg: 'var(--color-bg-tertiary)',
  headerText: '#888',
  rowNum: '#555',
  empty: 'var(--color-border-light)',
  cursor: 'rgba(255, 255, 255, 0.2)',
  cursorBorder: '#888',
  selection: 'rgba(100, 149, 237, 0.25)',
  playRow: 'rgba(233, 69, 96, 0.15)',
  channelSep: 'var(--color-border)',
};

interface CursorPos {
  channel: number;
  row: number;
  column: number; // index into columns array
}

interface FormatPatternEditorProps {
  width: number;
  height: number;
  columns: ColumnDef[];
  channels: FormatChannel[];
  /** Single playback row for all channels (backward compat). */
  currentRow: number;
  /** Per-channel playback rows. When provided, overrides currentRow for highlighting. */
  currentRowPerChannel?: number[];
  isPlaying: boolean;
  onCellChange?: OnCellChange;
}

export const FormatPatternEditor: React.FC<FormatPatternEditorProps> = ({
  width, height, columns, channels, currentRow, currentRowPerChannel, isPlaying, onCellChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [cursor, setCursorState] = useState<CursorPos>({ channel: 0, row: 0, column: 0 });
  const [selection, setSelection] = useState<{
    active: boolean; startChannel: number; startRow: number; endChannel: number; endRow: number;
  }>({ active: false, startChannel: 0, startRow: 0, endChannel: 0, endRow: 0 });
  const [dragging, setDragging] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [octave, setOctave] = useState(3);

  // Compute column widths and channel width dynamically
  const columnWidths = useMemo(() => columns.map(col => col.charWidth * CHAR_W), [columns]);
  const channelWidth = useMemo(() => {
    let width = 0;
    for (let i = 0; i < columns.length; i++) {
      width += columnWidths[i];
      if (i < columns.length - 1) width += COL_GAP;
    }
    return width;
  }, [columns, columnWidths]);

  const numChannels = channels.length;
  const trackLength = useMemo(() => {
    let maxLen = 0;
    for (const ch of channels) {
      maxLen = Math.max(maxLen, ch.patternLength);
    }
    return maxLen || 64;
  }, [channels]);

  const visibleRows = Math.floor((height - HEADER_H) / ROW_H);

  const scrollRow = useMemo(() => {
    const targetRow = isPlaying ? currentRow : cursor.row;
    const half = Math.floor(visibleRows / 2);
    const centerRow = targetRow - half;
    const baseScroll = isPlaying ? centerRow + scrollOffset : centerRow;
    return Math.max(0, Math.min(baseScroll, trackLength - visibleRows));
  }, [cursor.row, currentRow, isPlaying, visibleRows, trackLength, scrollOffset]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.font = `${CHAR_H}px "JetBrains Mono", "Fira Code", monospace`;
    ctx.textBaseline = 'top';

    // Header
    ctx.fillStyle = COLORS.headerBg;
    ctx.fillRect(0, 0, width, HEADER_H);
    ctx.fillStyle = COLORS.headerText;
    ctx.fillText('ROW', 2, 4);
    for (let ch = 0; ch < numChannels; ch++) {
      const x = ROW_NUM_W + ch * (channelWidth + CHAN_GAP);
      ctx.fillText(channels[ch].label, x, 4);
    }

    // Per-channel play rows: use per-channel array if provided, else broadcast single row
    const perChRows = currentRowPerChannel ?? null;

    // Rows
    for (let vi = 0; vi < visibleRows; vi++) {
      const row = scrollRow + vi;
      if (row >= trackLength) break;
      const y = HEADER_H + vi * ROW_H;
      const isCursorRow = row === cursor.row;

      // Full-width play row highlight (only when all channels share same row)
      if (isPlaying && !perChRows && row === currentRow) {
        ctx.fillStyle = COLORS.playRow;
        ctx.fillRect(0, y, width, ROW_H);
      } else if (row % 8 === 0) {
        ctx.fillStyle = COLORS.bgAlt;
        ctx.fillRect(0, y, width, ROW_H);
      }

      // Selection
      if (selection.active) {
        const minRow = Math.min(selection.startRow, selection.endRow);
        const maxRow = Math.max(selection.startRow, selection.endRow);
        const minCh = Math.min(selection.startChannel, selection.endChannel);
        const maxCh = Math.max(selection.startChannel, selection.endChannel);
        if (row >= minRow && row <= maxRow) {
          for (let ch = minCh; ch <= maxCh; ch++) {
            const sx = ROW_NUM_W + ch * (channelWidth + CHAN_GAP);
            ctx.fillStyle = COLORS.selection;
            ctx.fillRect(sx, y, channelWidth, ROW_H);
          }
        }
      }

      // Row number
      ctx.fillStyle = COLORS.rowNum;
      ctx.fillText(row.toString(16).toUpperCase().padStart(2, '0'), 2, y + 1);

      // Channel separator lines
      for (let ch = 1; ch < numChannels; ch++) {
        const x = ROW_NUM_W + ch * (channelWidth + CHAN_GAP) - CHAN_GAP / 2;
        ctx.strokeStyle = COLORS.channelSep;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + ROW_H);
        ctx.stroke();
      }

      // Cell data per channel
      for (let ch = 0; ch < numChannels; ch++) {
        const baseX = ROW_NUM_W + ch * (channelWidth + CHAN_GAP);
        const cell = channels[ch].rows[row];

        // Per-channel play row highlight
        if (isPlaying && perChRows && perChRows[ch] === row) {
          ctx.fillStyle = COLORS.playRow;
          ctx.fillRect(baseX, y, channelWidth, ROW_H);
        }

        let colX = baseX;

        for (let colIdx = 0; colIdx < columns.length; colIdx++) {
          const col = columns[colIdx];
          const value = cell ? cell[col.key] : undefined;
          const isEmpty = value === undefined || value === col.emptyValue;

          const text = isEmpty ? '•'.repeat(col.charWidth) : col.formatter(value!);
          ctx.fillStyle = isEmpty ? col.emptyColor : col.color;
          ctx.fillText(text, colX, y + 1);

          // Cursor highlight
          if (isCursorRow && !isPlaying && ch === cursor.channel && colIdx === cursor.column) {
            ctx.fillStyle = COLORS.cursor;
            ctx.fillRect(colX - 1, y, columnWidths[colIdx] + 2, ROW_H);
            ctx.strokeStyle = COLORS.cursorBorder;
            ctx.lineWidth = 1;
            ctx.strokeRect(colX - 0.5, y + 0.5, columnWidths[colIdx] + 1, ROW_H - 1);
          }

          colX += columnWidths[colIdx] + COL_GAP;
        }
      }
    }
  }, [width, height, cursor, selection, currentRow, currentRowPerChannel, isPlaying,
      scrollRow, visibleRows, numChannels, trackLength, channels, columns, columnWidths, channelWidth]);

  // Piano keyboard mapping: Z-M = octave N, Q-P = octave N+1
  const KEY_TO_NOTE: Record<string, number> = useMemo(() => ({
    'z': 0, 's': 1, 'x': 2, 'd': 3, 'c': 4, 'v': 5,
    'g': 6, 'b': 7, 'h': 8, 'n': 9, 'j': 10, 'm': 11,
    'q': 12, '2': 13, 'w': 14, '3': 15, 'e': 16, 'r': 17,
    '5': 18, 't': 19, '6': 20, 'y': 21, '7': 22, 'u': 23,
    'i': 24, '9': 25, 'o': 26, '0': 27, 'p': 28,
  }), []);

  const isHexChar = (k: string): boolean => /^[0-9a-f]$/i.test(k);
  const hexVal = (k: string): number => parseInt(k, 16);

  const writeCell = useCallback((channel: number, row: number, columnKey: string, value: number) => {
    if (onCellChange) {
      onCellChange(channel, row, columnKey, value);
    }
  }, [onCellChange]);

  // Keyboard
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { key, shiftKey } = e;
    const lk = key.toLowerCase();

    // Navigation keys
    switch (key) {
      case 'ArrowUp':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: Math.max(0, c.row - 1) }));
        return;
      case 'ArrowDown':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: Math.min(trackLength - 1, c.row + 1) }));
        return;
      case 'ArrowLeft':
        e.preventDefault();
        setCursorState(c => {
          if (c.column > 0) return { ...c, column: c.column - 1 };
          if (c.channel > 0) return { ...c, channel: c.channel - 1, column: columns.length - 1 };
          return c;
        });
        return;
      case 'ArrowRight':
        e.preventDefault();
        setCursorState(c => {
          if (c.column < columns.length - 1) return { ...c, column: c.column + 1 };
          if (c.channel < numChannels - 1) return { ...c, channel: c.channel + 1, column: 0 };
          return c;
        });
        return;
      case 'Tab':
        e.preventDefault();
        setCursorState(c => {
          if (shiftKey) return { ...c, channel: Math.max(0, c.channel - 1), column: 0 };
          return { ...c, channel: Math.min(numChannels - 1, c.channel + 1), column: 0 };
        });
        return;
      case 'PageUp':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: Math.max(0, c.row - 16) }));
        return;
      case 'PageDown':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: Math.min(trackLength - 1, c.row + 16) }));
        return;
      case 'Home':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: 0 }));
        return;
      case 'End':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: trackLength - 1 }));
        return;
      case 'Delete':
      case 'Backspace': {
        e.preventDefault();
        const col = columns[cursor.column];
        writeCell(cursor.channel, cursor.row, col.key, col.emptyValue ?? 0);
        setCursorState(c => ({ ...c, row: Math.min(trackLength - 1, c.row + 1) }));
        return;
      }
    }

    // Octave change: [ and ] or numpad +/-
    if (key === '[' || key === '-') {
      e.preventDefault();
      setOctave(o => Math.max(0, o - 1));
      return;
    }
    if (key === ']' || key === '=') {
      e.preventDefault();
      setOctave(o => Math.min(7, o + 1));
      return;
    }

    // Note-off: ` or 1
    if (key === '`' || key === '1') {
      const col = columns[cursor.column];
      if (col?.type === 'note') {
        e.preventDefault();
        writeCell(cursor.channel, cursor.row, col.key, 0xFE); // Note-off marker
        setCursorState(c => ({ ...c, row: Math.min(trackLength - 1, c.row + 1) }));
        return;
      }
    }

    // Note column: piano keyboard input
    const currentCol = columns[cursor.column];
    if (currentCol?.type === 'note' && KEY_TO_NOTE[lk] !== undefined) {
      e.preventDefault();
      const noteVal = KEY_TO_NOTE[lk] + octave * 12;
      if (noteVal >= 0 && noteVal <= 95) {
        writeCell(cursor.channel, cursor.row, currentCol.key, noteVal);
        setCursorState(c => ({ ...c, row: Math.min(trackLength - 1, c.row + 1) }));
      }
      return;
    }

    // Hex entry for hex-type columns
    if (isHexChar(lk) && currentCol?.type === 'hex') {
      e.preventDefault();
      const h = hexVal(lk);
      const hexDigits = currentCol.hexDigits || 2;
      const cell = channels[cursor.channel].rows[cursor.row];
      const oldValue = cell ? cell[currentCol.key] : (currentCol.emptyValue ?? 0);

      let newValue: number;
      if (hexDigits === 1) {
        newValue = h;
      } else if (hexDigits === 2) {
        newValue = ((oldValue & 0x0F) << 4) | h;
      } else if (hexDigits === 4) {
        newValue = ((oldValue & 0x0FFF) << 4) | h;
      } else {
        newValue = h;
      }

      writeCell(cursor.channel, cursor.row, currentCol.key, newValue);
      setCursorState(c => ({ ...c, row: Math.min(trackLength - 1, c.row + 1) }));
      return;
    }
  }, [trackLength, numChannels, columns, cursor, octave, KEY_TO_NOTE, writeCell, channels]);

  // Mouse hit test
  const hitTest = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (y < HEADER_H) return null;
    const row = scrollRow + Math.floor((y - HEADER_H) / ROW_H);
    if (row >= trackLength) return null;
    const relX = x - ROW_NUM_W;
    if (relX < 0) return null;
    const channel = Math.floor(relX / (channelWidth + CHAN_GAP));
    if (channel >= numChannels) return null;
    const inCh = relX - channel * (channelWidth + CHAN_GAP);

    // Find column hit
    let colX = 0;
    for (let i = 0; i < columns.length; i++) {
      const colW = columnWidths[i];
      if (inCh >= colX && inCh < colX + colW) {
        return { channel, row, column: i };
      }
      colX += colW + COL_GAP;
    }
    return null;
  }, [scrollRow, trackLength, numChannels, channelWidth, columns, columnWidths]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) return;
    setCursorState({ channel: hit.channel, row: hit.row, column: hit.column });
    setSelection({ active: false, startChannel: 0, startRow: 0, endChannel: 0, endRow: 0 });
    setDragging(true);
  }, [hitTest]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      const delta = Math.sign(e.deltaY) * 2;
      if (isPlaying) {
        setScrollOffset(offset => offset + delta);
      } else {
        setCursorState(c => ({
          ...c,
          row: Math.max(0, Math.min(trackLength - 1, c.row + delta)),
        }));
      }
    }
  }, [isPlaying, trackLength]);

  useEffect(() => {
    if (!isPlaying) {
      setScrollOffset(0);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const hit = hitTest(e.clientX, e.clientY);
      if (!hit) return;
      setSelection({
        active: true,
        startChannel: cursor.channel,
        startRow: cursor.row,
        endChannel: hit.channel,
        endRow: hit.row,
      });
    };
    const handleMouseUp = () => setDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, cursor.channel, cursor.row, hitTest]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width, height, outline: 'none' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
    />
  );
};
