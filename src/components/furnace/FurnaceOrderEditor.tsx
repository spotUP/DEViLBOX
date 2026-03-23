/**
 * FurnaceOrderEditor — Canvas-based order matrix for Furnace modules.
 *
 * Grid: rows = order positions, columns = channels, cells = pattern indices (hex).
 * Cursor is per-hex-digit. Arrow keys navigate, hex keys (0-9, A-F) write values.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { FurnaceNativeData } from '@/types/tracker';
import { useFormatStore } from '@stores';

const CHAR_W = 8;
const CHAR_H = 14;
const ROW_H = CHAR_H + 2;
const HEADER_H = ROW_H + 4;
const POS_NUM_W = CHAR_W * 4 + 4;
// Each channel cell: 2 hex digits + 1 space = 3 chars
const CH_W = CHAR_W * 3 + 4;
const HEX = '0123456789abcdef';
const DIGIT_COLS = 2; // hi and lo nibble

const COLORS = {
  bg: '#0d0d0d',
  headerBg: '#111111',
  headerText: '#888',
  posNum: '#555',
  cellText: '#e0e0e0',
  currentRow: 'rgba(120, 0, 0, 0.6)',
  cursor: 'rgba(255, 255, 136, 0.4)',
  channelSep: '#222',
};

interface Props {
  width: number;
  height: number;
  nativeData: FurnaceNativeData;
  currentPosition: number;
  onPositionChange: (pos: number) => void;
  onOrderChange: (channel: number, position: number, patternIndex: number) => void;
}

export const FurnaceOrderEditor: React.FC<Props> = ({
  width, height, nativeData, currentPosition, onPositionChange, onOrderChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sub = nativeData.subsongs[nativeData.activeSubsong];
  const insertRow = useFormatStore(s => s.insertFurnaceOrderRow);
  const deleteRow = useFormatStore(s => s.deleteFurnaceOrderRow);
  const numPos = sub?.ordersLen ?? 0;
  const numCh = sub?.channels.length ?? 0;
  const visibleRows = Math.floor((height - HEADER_H) / ROW_H);

  const [curCh, setCurCh] = useState(0);
  const [curDigit, setCurDigit] = useState(0); // 0=hi, 1=lo

  const scrollPos = Math.max(0, Math.min(
    currentPosition - Math.floor(visibleRows / 2),
    numPos - visibleRows
  ));

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sub) return;
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
    ctx.fillText('POS', 2, 4);
    for (let ch = 0; ch < numCh; ch++) {
      const label = sub.channels[ch]?.name ?? `CH${ch}`;
      // Truncate to fit
      const maxChars = Math.floor(CH_W / CHAR_W);
      const truncated = label.length > maxChars ? label.substring(0, maxChars) : label;
      ctx.fillText(truncated, POS_NUM_W + ch * CH_W, 4);
    }

    // Rows
    for (let vi = 0; vi < visibleRows; vi++) {
      const pos = scrollPos + vi;
      if (pos >= numPos) break;
      const y = HEADER_H + vi * ROW_H;
      const isCurrent = pos === currentPosition;

      if (isCurrent) {
        ctx.fillStyle = COLORS.currentRow;
        ctx.fillRect(0, y, width, ROW_H);

        // Cursor highlight on active digit
        const cx = POS_NUM_W + curCh * CH_W + curDigit * CHAR_W;
        ctx.fillStyle = COLORS.cursor;
        ctx.fillRect(cx, y, CHAR_W, ROW_H);
      }

      // Position number
      ctx.fillStyle = isCurrent ? '#ffff88' : COLORS.posNum;
      ctx.fillText(pos.toString(16).toUpperCase().padStart(3, '0'), 2, y + 1);

      // Column separators
      for (let ch = 1; ch < numCh; ch++) {
        ctx.strokeStyle = COLORS.channelSep;
        ctx.beginPath();
        ctx.moveTo(POS_NUM_W + ch * CH_W - 2, y);
        ctx.lineTo(POS_NUM_W + ch * CH_W - 2, y + ROW_H);
        ctx.stroke();
      }

      // Per-channel pattern index
      for (let ch = 0; ch < numCh; ch++) {
        const x = POS_NUM_W + ch * CH_W;
        const patIdx = sub.orders[ch]?.[pos] ?? 0;
        ctx.fillStyle = COLORS.cellText;
        ctx.fillText(patIdx.toString(16).toUpperCase().padStart(2, '0'), x, y + 1);
      }
    }
  }, [width, height, sub, nativeData, currentPosition, numPos, numCh, scrollPos, visibleRows, curCh, curDigit]);

  // Click to select
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    canvasRef.current?.focus();
    const rect = canvasRef.current!.getBoundingClientRect();
    const my = e.clientY - rect.top;
    const mx = e.clientX - rect.left;
    if (my < HEADER_H) return;
    const pos = scrollPos + Math.floor((my - HEADER_H) / ROW_H);
    if (pos >= 0 && pos < numPos) onPositionChange(pos);

    if (mx >= POS_NUM_W) {
      const ch = Math.floor((mx - POS_NUM_W) / CH_W);
      if (ch >= 0 && ch < numCh) {
        setCurCh(ch);
        const rel = mx - (POS_NUM_W + ch * CH_W);
        const charIdx = Math.floor(rel / CHAR_W);
        setCurDigit(charIdx <= 0 ? 0 : 1);
      }
    }
  }, [scrollPos, numPos, numCh, onPositionChange]);

  // Keyboard
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!sub) return;
    const { key } = e;

    // Navigation
    if (key === 'ArrowUp') {
      e.preventDefault();
      onPositionChange(Math.max(0, currentPosition - 1));
      return;
    }
    if (key === 'ArrowDown') {
      e.preventDefault();
      onPositionChange(Math.min(numPos - 1, currentPosition + 1));
      return;
    }
    if (key === 'ArrowRight') {
      e.preventDefault();
      const next = curDigit + 1;
      if (next < DIGIT_COLS) {
        setCurDigit(next);
      } else if (curCh < numCh - 1) {
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
        if (curCh < numCh - 1) { setCurCh(c => c + 1); setCurDigit(0); }
      }
      return;
    }

    // Insert/delete order row
    if (key === 'Insert') { e.preventDefault(); insertRow(currentPosition); return; }
    if (e.ctrlKey && key === 'Backspace') { e.preventDefault(); deleteRow(currentPosition); return; }

    // Hex digit entry
    const hexIdx = HEX.indexOf(key.toLowerCase());
    if (hexIdx < 0) return;
    e.preventDefault();

    const cur = sub.orders[curCh]?.[currentPosition] ?? 0;
    const newVal = curDigit === 0
      ? (hexIdx << 4) | (cur & 0x0F)
      : (cur & 0xF0) | hexIdx;

    onOrderChange(curCh, currentPosition, newVal & 0xFF);

    // Advance cursor
    if (curDigit < DIGIT_COLS - 1) {
      setCurDigit(d => d + 1);
    } else if (curCh < numCh - 1) {
      setCurCh(c => c + 1);
      setCurDigit(0);
    }
  }, [sub, currentPosition, numPos, numCh, curCh, curDigit, onPositionChange, onOrderChange, insertRow, deleteRow]);

  useEffect(() => { canvasRef.current?.focus(); }, []);

  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{
        width: '100%',
        height: '100%',
        outline: 'none',
        display: 'block',
        imageRendering: 'pixelated',
      }}
    />
  );
};
