/**
 * GTPatternEditor — Canvas2D-based pattern editor for GoatTracker Ultra.
 *
 * Renders the 3/6-channel pattern grid using Canvas 2D for performance.
 * Each channel shows: Note | Instrument | Command | Data
 * 
 * Pattern cells are 4 bytes: [note, instrument, command, data]
 * Note values: 0=empty, 1-95=C-0..B-7, 0xBE=keyoff, 0xBF=keyon
 */

import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useGTUltraStore } from '../../stores/useGTUltraStore';

// --- Constants ---
const CHAR_W = 8;
const CHAR_H = 14;
const ROW_H = CHAR_H + 2;
const ROW_NUM_W = CHAR_W * 3 + 4; // "00 " row number
const NOTE_W = CHAR_W * 3;        // "C-3"
const HEX_W = CHAR_W * 2;         // "7F"
const COL_GAP = 4;
const CHAN_GAP = 8;
const CHANNEL_W = NOTE_W + COL_GAP + HEX_W + COL_GAP + HEX_W + COL_GAP + HEX_W;
const HEADER_H = ROW_H + 4;

// Note name lookup
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteToString(note: number): string {
  if (note === 0) return '...';
  if (note === 0xBE) return '==='; // keyoff
  if (note === 0xBF) return '+++'; // keyon
  const n = note - 1;
  const octave = Math.floor(n / 12);
  const name = NOTE_NAMES[n % 12];
  return `${name}${octave}`;
}

function hexByte(val: number): string {
  if (val === 0) return '..';
  return val.toString(16).toUpperCase().padStart(2, '0');
}

// Colors — FT2 theme
const COLORS = {
  bg: '#0d0d0d',
  bgAlt: '#141414',
  headerBg: '#1a1a1a',
  headerText: '#888',
  rowNum: '#555',
  note: '#e0e0e0',
  instrument: '#60e060',
  command: '#ffcc00',
  data: '#ff8866',
  empty: '#333',
  cursor: 'rgba(255, 255, 255, 0.2)',
  cursorBorder: '#888',
  selection: 'rgba(100, 149, 237, 0.25)',
  playRow: 'rgba(233, 69, 96, 0.15)',
  recordBorder: 'rgba(239, 68, 68, 0.5)',
  channelSep: '#222',
};

interface GTPatternEditorProps {
  width: number;
  height: number;
  channelCount: number;
}

export const GTPatternEditor: React.FC<GTPatternEditorProps> = ({
  width,
  height,
  channelCount,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursor = useGTUltraStore((s) => s.cursor);
  const selection = useGTUltraStore((s) => s.selection);
  const patternLength = useGTUltraStore((s) => s.patternLength);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const playing = useGTUltraStore((s) => s.playing);
  const followPlay = useGTUltraStore((s) => s.followPlay);
  const recordMode = useGTUltraStore((s) => s.recordMode);
  const orderData = useGTUltraStore((s) => s.orderData);
  const orderCursor = useGTUltraStore((s) => s.orderCursor);
  const patternData = useGTUltraStore((s) => s.patternData);
  const moveCursor = useGTUltraStore((s) => s.moveCursor);
  const setCursor = useGTUltraStore((s) => s.setCursor);

  // Calculate visible rows
  const visibleRows = Math.floor((height - HEADER_H) / ROW_H);

  // Scroll offset: center cursor row in view
  const scrollRow = useMemo(() => {
    const targetRow = playing && followPlay ? playbackPos.row : cursor.row;
    const half = Math.floor(visibleRows / 2);
    return Math.max(0, Math.min(targetRow - half, patternLength - visibleRows + 1));
  }, [cursor.row, playbackPos.row, playing, followPlay, visibleRows, patternLength]);

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

    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    // Font
    ctx.font = `${CHAR_H}px "JetBrains Mono", "Fira Code", monospace`;
    ctx.textBaseline = 'top';

    // Header
    ctx.fillStyle = COLORS.headerBg;
    ctx.fillRect(0, 0, width, HEADER_H);
    ctx.fillStyle = COLORS.headerText;
    ctx.fillText('ROW', 2, 4);
    for (let ch = 0; ch < channelCount; ch++) {
      const x = ROW_NUM_W + ch * (CHANNEL_W + CHAN_GAP);
      const patNum = orderData[ch]?.[orderCursor] ?? 0;
      const label = `CH${ch + 1}:${patNum.toString(16).toUpperCase().padStart(2, '0')}`;
      ctx.fillText(label, x + CHANNEL_W / 2 - CHAR_W * label.length / 2, 4);
    }

    // Record mode border
    if (recordMode) {
      ctx.strokeStyle = COLORS.recordBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, width - 2, height - 2);
    }

    // Pattern rows
    for (let vi = 0; vi < visibleRows; vi++) {
      const row = scrollRow + vi;
      if (row > patternLength) break;

      const y = HEADER_H + vi * ROW_H;
      const isPlayRow = playing && row === playbackPos.row;
      const isCursorRow = row === cursor.row;

      // Row background
      if (isPlayRow) {
        ctx.fillStyle = COLORS.playRow;
        ctx.fillRect(0, y, width, ROW_H);
      } else if (row % 8 === 0) {
        ctx.fillStyle = COLORS.bgAlt;
        ctx.fillRect(0, y, width, ROW_H);
      }

      // Selection highlight
      if (selection.active) {
        const minRow = Math.min(selection.startRow, selection.endRow);
        const maxRow = Math.max(selection.startRow, selection.endRow);
        const minCh = Math.min(selection.startChannel, selection.endChannel);
        const maxCh = Math.max(selection.startChannel, selection.endChannel);
        if (row >= minRow && row <= maxRow) {
          for (let ch = minCh; ch <= maxCh; ch++) {
            const sx = ROW_NUM_W + ch * (CHANNEL_W + CHAN_GAP);
            ctx.fillStyle = COLORS.selection;
            ctx.fillRect(sx, y, CHANNEL_W, ROW_H);
          }
        }
      }

      // Row number
      ctx.fillStyle = COLORS.rowNum;
      ctx.fillText(row.toString(16).toUpperCase().padStart(2, '0'), 2, y + 1);

      // Channel separator lines
      for (let ch = 0; ch < channelCount; ch++) {
        const x = ROW_NUM_W + ch * (CHANNEL_W + CHAN_GAP) - CHAN_GAP / 2;
        if (ch > 0) {
          ctx.strokeStyle = COLORS.channelSep;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + ROW_H);
          ctx.stroke();
        }
      }

      // Cell data per channel
      for (let ch = 0; ch < channelCount; ch++) {
        const baseX = ROW_NUM_W + ch * (CHANNEL_W + CHAN_GAP);

        // Look up which pattern this channel is playing from order data
        const patIdx = orderData[ch]?.[orderCursor] ?? 0;
        const pat = patternData.get(patIdx);

        let note = 0, instr = 0, cmd = 0, param = 0;
        if (pat && row < pat.length) {
          const offset = row * 4;
          note = pat.data[offset];
          instr = pat.data[offset + 1];
          cmd = pat.data[offset + 2];
          param = pat.data[offset + 3];
        }

        let colX = baseX;

        // Note
        const noteStr = noteToString(note);
        ctx.fillStyle = note === 0 ? COLORS.empty : COLORS.note;
        ctx.fillText(noteStr, colX, y + 1);
        colX += NOTE_W + COL_GAP;

        // Instrument
        ctx.fillStyle = instr === 0 ? COLORS.empty : COLORS.instrument;
        ctx.fillText(hexByte(instr), colX, y + 1);
        colX += HEX_W + COL_GAP;

        // Command
        ctx.fillStyle = cmd === 0 ? COLORS.empty : COLORS.command;
        ctx.fillText(hexByte(cmd), colX, y + 1);
        colX += HEX_W + COL_GAP;

        // Data
        ctx.fillStyle = param === 0 && cmd === 0 ? COLORS.empty : COLORS.data;
        ctx.fillText(hexByte(param), colX, y + 1);
      }

      // Cursor highlight
      if (isCursorRow && !playing) {
        const cx = ROW_NUM_W + cursor.channel * (CHANNEL_W + CHAN_GAP);
        let colOffset = 0;
        let colWidth = NOTE_W;
        switch (cursor.column) {
          case 0: colOffset = 0; colWidth = NOTE_W; break;
          case 1: colOffset = NOTE_W + COL_GAP; colWidth = HEX_W; break;
          case 2: colOffset = NOTE_W + COL_GAP + HEX_W + COL_GAP; colWidth = HEX_W; break;
          case 3: colOffset = NOTE_W + COL_GAP + HEX_W + COL_GAP + HEX_W + COL_GAP; colWidth = HEX_W; break;
        }

        // Cursor background
        ctx.fillStyle = COLORS.cursor;
        ctx.fillRect(cx + colOffset, y, colWidth, ROW_H);

        // Cursor border
        ctx.strokeStyle = COLORS.cursorBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx + colOffset + 0.5, y + 0.5, colWidth - 1, ROW_H - 1);
      }
    }
  }, [width, height, cursor, selection, patternLength, playbackPos, playing, followPlay,
      scrollRow, visibleRows, channelCount, patternData, recordMode, orderData, orderCursor]);

  // Keyboard handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { key, shiftKey } = e;

    switch (key) {
      case 'ArrowUp':
        e.preventDefault();
        moveCursor('up');
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveCursor('down');
        break;
      case 'ArrowLeft':
        e.preventDefault();
        moveCursor('left');
        break;
      case 'ArrowRight':
        e.preventDefault();
        moveCursor('right');
        break;
      case 'Tab':
        e.preventDefault();
        // Move to next/prev channel
        if (shiftKey) {
          setCursor({ channel: Math.max(0, cursor.channel - 1), column: 0, digit: 0 });
        } else {
          setCursor({ channel: Math.min(channelCount - 1, cursor.channel + 1), column: 0, digit: 0 });
        }
        break;
    }
  }, [moveCursor, setCursor, cursor.channel, channelCount]);

  // Mouse → cursor position helper
  const hitTest = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (y < HEADER_H) return null;
    const row = scrollRow + Math.floor((y - HEADER_H) / ROW_H);
    if (row > patternLength) return null;
    const relX = x - ROW_NUM_W;
    if (relX < 0) return null;
    const channel = Math.floor(relX / (CHANNEL_W + CHAN_GAP));
    if (channel >= channelCount) return null;
    const inChannel = relX - channel * (CHANNEL_W + CHAN_GAP);
    let column = 0;
    if (inChannel >= NOTE_W + COL_GAP + HEX_W + COL_GAP + HEX_W + COL_GAP) column = 3;
    else if (inChannel >= NOTE_W + COL_GAP + HEX_W + COL_GAP) column = 2;
    else if (inChannel >= NOTE_W + COL_GAP) column = 1;
    return { channel, row, column };
  }, [scrollRow, patternLength, channelCount]);

  // Mouse drag selection state
  const [dragging, setDragging] = useState(false);
  const setSelection = useGTUltraStore((s) => s.setSelection);
  const clearSelection = useGTUltraStore((s) => s.clearSelection);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) return;
    setCursor({ channel: hit.channel, row: hit.row, column: hit.column, digit: 0 });
    clearSelection();
    setDragging(true);
  }, [hitTest, setCursor, clearSelection]);

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
  }, [dragging, cursor.channel, cursor.row, hitTest, setSelection]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width, height, outline: 'none' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
    />
  );
};
