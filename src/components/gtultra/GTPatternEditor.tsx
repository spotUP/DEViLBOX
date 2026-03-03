/**
 * GTPatternEditor — Canvas2D-based pattern editor for GoatTracker Ultra.
 *
 * Renders the 3/6-channel pattern grid using Canvas 2D for performance.
 * Each channel shows: Note | Instrument | Command | Data
 * 
 * Pattern cells are 4 bytes: [note, instrument, command, data]
 * Note values: 0=empty, 1-95=C-0..B-7, 0xBE=keyoff, 0xBF=keyon
 */

import React, { useRef, useEffect, useCallback, useMemo } from 'react';
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

// Colors
const COLORS = {
  bg: '#1a1a2e',
  bgAlt: '#16213e',
  headerBg: '#0f3460',
  headerText: '#e94560',
  rowNum: '#666688',
  note: '#e0e0ff',
  instrument: '#60e060',
  command: '#ffcc00',
  data: '#ff8866',
  empty: '#333355',
  cursor: 'rgba(255, 255, 255, 0.25)',
  cursorBorder: '#ffffff',
  selection: 'rgba(100, 149, 237, 0.3)',
  playRow: 'rgba(233, 69, 96, 0.2)',
  channelSep: '#333355',
};

interface GTPatternEditorProps {
  width: number;
  height: number;
  /** Pattern data as flat Uint8Array (rows * channels * 4 bytes) */
  patternData: Uint8Array[];  // one per channel, each MAX_PATTROWS*4 bytes
  channelCount: number;
}

export const GTPatternEditor: React.FC<GTPatternEditorProps> = ({
  width,
  height,
  patternData,
  channelCount,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursor = useGTUltraStore((s) => s.cursor);
  const selection = useGTUltraStore((s) => s.selection);
  const patternLength = useGTUltraStore((s) => s.patternLength);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const playing = useGTUltraStore((s) => s.playing);
  const followPlay = useGTUltraStore((s) => s.followPlay);
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
      ctx.fillText(`CH${ch + 1}`, x + CHANNEL_W / 2 - CHAR_W * 1.5, 4);
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
        const data = patternData[ch];
        if (!data) continue;

        const offset = row * 4;
        const note = data[offset];
        const instr = data[offset + 1];
        const cmd = data[offset + 2];
        const param = data[offset + 3];

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
      scrollRow, visibleRows, channelCount, patternData]);

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

  // Mouse click → set cursor position
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (y < HEADER_H) return;

    const row = scrollRow + Math.floor((y - HEADER_H) / ROW_H);
    if (row > patternLength) return;

    const relX = x - ROW_NUM_W;
    if (relX < 0) return;

    const channel = Math.floor(relX / (CHANNEL_W + CHAN_GAP));
    if (channel >= channelCount) return;

    const inChannel = relX - channel * (CHANNEL_W + CHAN_GAP);
    let column = 0;
    if (inChannel >= NOTE_W + COL_GAP + HEX_W + COL_GAP + HEX_W + COL_GAP) column = 3;
    else if (inChannel >= NOTE_W + COL_GAP + HEX_W + COL_GAP) column = 2;
    else if (inChannel >= NOTE_W + COL_GAP) column = 1;

    setCursor({ channel, row, column, digit: 0 });
  }, [scrollRow, patternLength, channelCount, setCursor]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width, height, outline: 'none' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
    />
  );
};
