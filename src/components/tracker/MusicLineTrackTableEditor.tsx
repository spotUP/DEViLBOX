/**
 * MusicLineTrackTableEditor — Editable per-channel track table matrix view
 *
 * Shown instead of the standard pattern order list when the loaded song uses
 * per-channel independent track tables (MusicLine Editor and similar formats).
 *
 * Layout (Hively-style):
 *   Rows    = song positions (0..N) — shows VISIBLE_ROWS rows centered on current
 *   Columns = channels (Ch 1..numChannels)
 *   Cells   = pattern index at that channel x position (hex, 2 nibbles)
 *
 * Editing: hex nibble entry matching FurnaceOrderEditor / HivelyPositionEditor pattern.
 * Arrow keys navigate, Tab jumps channels, hex digits (0-9, A-F) write values.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useTrackerStore, useFormatStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';

// Layout constants — matches PixiHivelyPositionEditor
const CHAR_W = 8;
const CHAR_H = 14;
const ROW_H = CHAR_H + 2;
const HEADER_H = ROW_H + 4;
const POS_COL_WIDTH = CHAR_W * 4 + 4;
const CHAN_COL_WIDTH = CHAR_W * 3 + 4;
const VISIBLE_ROWS = 7;
const DIGIT_COLS = 2; // hi and lo nibble
const HEX = '0123456789abcdef';

const COLORS = {
  bg: '#000000',
  headerBg: '#111111',
  headerText: '#808080',
  posNum: '#808080',
  cellText: '#ffffff',
  currentRow: 'rgba(120, 0, 0, 0.6)',
  cursor: 'rgba(255, 255, 136, 0.4)',
  cursorPos: '#ffff88',
  channelSep: '#222222',
  dim: '#808080',
  speed: '#fbbf24',
};

interface MusicLineTrackTableEditorProps {
  /** Called when user clicks a position cell to navigate */
  onSeek?: (position: number) => void;
}

export const MusicLineTrackTableEditor: React.FC<MusicLineTrackTableEditorProps> = ({ onSeek }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const channelTrackTables = useFormatStore((state) => state.channelTrackTables);
  const channelSpeeds = useFormatStore((state) => state.channelSpeeds);
  const setTrackEntry = useFormatStore((state) => state.setMusicLineTrackEntry);
  const currentPos = useTrackerStore((state) => state.currentPositionIndex);
  const initialSpeed = useTransportStore((state) => state.speed);

  const [curCh, setCurCh] = useState(0);
  const [curDigit, setCurDigit] = useState(0); // 0=hi, 1=lo

  if (!channelTrackTables || channelTrackTables.length === 0) return null;

  const numChannels = channelTrackTables.length;
  const maxPositions = Math.max(0, ...channelTrackTables.map(t => t.length));

  // Center VISIBLE_ROWS rows around currentPos
  const halfVisible = Math.floor(VISIBLE_ROWS / 2);
  const startPos = Math.max(0, Math.min(currentPos - halfVisible, maxPositions - VISIBLE_ROWS));
  const endPos = Math.min(maxPositions, startPos + VISIBLE_ROWS);
  const visibleCount = endPos - startPos;

  const totalWidth = POS_COL_WIDTH + numChannels * CHAN_COL_WIDTH;
  const totalHeight = HEADER_H + VISIBLE_ROWS * ROW_H;

  // ── Canvas render ──────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalWidth * dpr;
    canvas.height = totalHeight * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, totalWidth, totalHeight);
    ctx.font = `${CHAR_H}px "JetBrains Mono", "Fira Code", monospace`;
    ctx.textBaseline = 'top';

    // Header
    ctx.fillStyle = COLORS.headerBg;
    ctx.fillRect(0, 0, totalWidth, HEADER_H);
    ctx.fillStyle = COLORS.headerText;
    ctx.fillText('Pos', 2, 4);
    for (let ch = 0; ch < numChannels; ch++) {
      const x = POS_COL_WIDTH + ch * CHAN_COL_WIDTH;
      ctx.fillStyle = COLORS.headerText;
      ctx.fillText(`C${ch + 1}`, x + 2, 4);
      // Speed indicator
      const chSpeed = channelSpeeds?.[ch];
      if (chSpeed !== undefined && chSpeed !== initialSpeed) {
        ctx.fillStyle = COLORS.speed;
        ctx.fillText(`S${chSpeed}`, x + 2, 4);
      }
    }

    // Rows
    for (let vi = 0; vi < visibleCount; vi++) {
      const pos = startPos + vi;
      const y = HEADER_H + vi * ROW_H;
      const isCurrent = pos === currentPos;

      if (isCurrent) {
        ctx.fillStyle = COLORS.currentRow;
        ctx.fillRect(0, y, totalWidth, ROW_H);

        // Cursor highlight on active digit
        const cx = POS_COL_WIDTH + curCh * CHAN_COL_WIDTH + curDigit * CHAR_W;
        ctx.fillStyle = COLORS.cursor;
        ctx.fillRect(cx, y, CHAR_W, ROW_H);
      }

      // Position number
      ctx.fillStyle = isCurrent ? COLORS.cursorPos : COLORS.posNum;
      ctx.fillText(pos.toString(16).toUpperCase().padStart(3, '0'), 2, y + 1);

      // Column separators
      for (let ch = 0; ch < numChannels; ch++) {
        ctx.strokeStyle = COLORS.channelSep;
        ctx.beginPath();
        ctx.moveTo(POS_COL_WIDTH + ch * CHAN_COL_WIDTH, y);
        ctx.lineTo(POS_COL_WIDTH + ch * CHAN_COL_WIDTH, y + ROW_H);
        ctx.stroke();
      }

      // Per-channel pattern index
      for (let ch = 0; ch < numChannels; ch++) {
        const x = POS_COL_WIDTH + ch * CHAN_COL_WIDTH;
        const patIdx = channelTrackTables[ch]?.[pos];
        if (patIdx === undefined) {
          ctx.fillStyle = COLORS.dim;
          ctx.fillText('..', x + 2, y + 1);
        } else {
          ctx.fillStyle = COLORS.cellText;
          ctx.fillText(patIdx.toString(16).toUpperCase().padStart(2, '0'), x + 2, y + 1);
        }
      }
    }
  });

  // ── Click to select ────────────────────────────────────────────────────────
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    canvasRef.current?.focus();
    const rect = canvasRef.current!.getBoundingClientRect();
    const my = e.clientY - rect.top;
    const mx = e.clientX - rect.left;

    if (my < HEADER_H) return;

    const rowIdx = Math.floor((my - HEADER_H) / ROW_H);
    const pos = startPos + rowIdx;
    if (pos >= 0 && pos < maxPositions) {
      onSeek?.(pos);
    }

    if (mx >= POS_COL_WIDTH) {
      const ch = Math.floor((mx - POS_COL_WIDTH) / CHAN_COL_WIDTH);
      if (ch >= 0 && ch < numChannels) {
        setCurCh(ch);
        const rel = mx - (POS_COL_WIDTH + ch * CHAN_COL_WIDTH);
        const charIdx = Math.floor(rel / CHAR_W);
        setCurDigit(charIdx <= 0 ? 0 : 1);
      }
    }
  }, [startPos, maxPositions, numChannels, onSeek]);

  // ── Keyboard ───────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { key } = e;

    // Navigation
    if (key === 'ArrowUp') {
      e.preventDefault();
      onSeek?.(Math.max(0, currentPos - 1));
      return;
    }
    if (key === 'ArrowDown') {
      e.preventDefault();
      onSeek?.(Math.min(maxPositions - 1, currentPos + 1));
      return;
    }
    if (key === 'ArrowRight') {
      e.preventDefault();
      const next = curDigit + 1;
      if (next < DIGIT_COLS) {
        setCurDigit(next);
      } else if (curCh < numChannels - 1) {
        setCurCh(c => c + 1);
        setCurDigit(0);
      }
      return;
    }
    if (key === 'ArrowLeft') {
      e.preventDefault();
      const prev = curDigit - 1;
      if (prev >= 0) {
        setCurDigit(prev);
      } else if (curCh > 0) {
        setCurCh(c => c - 1);
        setCurDigit(DIGIT_COLS - 1);
      }
      return;
    }
    if (key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (curCh > 0) { setCurCh(c => c - 1); setCurDigit(0); }
      } else {
        if (curCh < numChannels - 1) { setCurCh(c => c + 1); setCurDigit(0); }
      }
      return;
    }

    // Hex digit entry
    const hexIdx = HEX.indexOf(key.toLowerCase());
    if (hexIdx < 0) return;
    e.preventDefault();

    const cur = channelTrackTables[curCh]?.[currentPos] ?? 0;
    const newVal = curDigit === 0
      ? (hexIdx << 4) | (cur & 0x0F)
      : (cur & 0xF0) | hexIdx;

    setTrackEntry(curCh, currentPos, newVal & 0xFF);

    // Advance cursor
    if (curDigit < DIGIT_COLS - 1) {
      setCurDigit(d => d + 1);
    } else if (curCh < numChannels - 1) {
      setCurCh(c => c + 1);
      setCurDigit(0);
    }
  }, [currentPos, maxPositions, numChannels, curCh, curDigit, onSeek, setTrackEntry, channelTrackTables]);

  useEffect(() => { canvasRef.current?.focus(); }, []);

  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{
        width: totalWidth,
        height: totalHeight,
        outline: 'none',
        cursor: 'pointer',
        imageRendering: 'pixelated',
        flexShrink: 0,
      }}
    />
  );
};
