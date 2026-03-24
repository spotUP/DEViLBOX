/**
 * HivelyPositionEditor — Editable position matrix for HivelyTracker/AHX.
 *
 * Simple grid: arrow keys move freely, type hex digits (0-9, A-F) to enter values.
 * Each channel has: track (2 hex digits) + transpose sign + transpose (2 hex digits).
 * Cursor is per-digit. Typing a digit writes it and moves cursor right.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { HivelyNativeData } from '@/types/tracker';
import { useFormatStore } from '@stores';

const CHAR_W = 10;
const CHAR_H = 14;
const ROW_H = 20;
const HEADER_H = 24;
const POS_NUM_W = CHAR_W * 4 + 4;
// Per channel: "XX +XX " = track(2) space sign trans(2) space = 7 chars
const CH_W = CHAR_W * 7 + 4;

export const HIVELY_MATRIX_HEIGHT = 200;
export const HIVELY_MATRIX_COLLAPSED_HEIGHT = 28;

const HEX = '0123456789abcdef';

// Digit columns within a channel (relative char positions)
// 0=track_hi, 1=track_lo, 2=sign, 3=trans_hi, 4=trans_lo
const DIGIT_COLS = 5;

const COLORS = {
  bg: '#0d0d0d',
  headerBg: '#111111',
  headerText: '#888',
  posNum: '#555',
  track: '#e0e0e0',
  transPos: '#88ff88',
  transNeg: '#ff8888',
  transDim: '#808080',
  currentRow: 'rgba(120, 0, 0, 0.6)',
  cursor: 'rgba(255, 255, 136, 0.4)',
  channelSep: '#222',
};

interface Props {
  width: number;
  height: number;
  nativeData: HivelyNativeData;
  currentPosition: number;
  onPositionChange: (pos: number) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const HivelyPositionEditor: React.FC<Props> = ({
  width, height, nativeData, currentPosition, onPositionChange,
  collapsed, onToggleCollapse,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const numPos = nativeData.positions.length;
  const numCh = nativeData.channels;
  const canvasH = height - HIVELY_MATRIX_COLLAPSED_HEIGHT;
  const visibleRows = Math.floor((canvasH - HEADER_H) / ROW_H);

  // Cursor: channel + digit column within channel
  const [curCh, setCurCh] = useState(0);
  const [curDigit, setCurDigit] = useState(0); // 0-4 within channel

  const setCell = useFormatStore(s => s.setHivelyPositionCell);
  const insertPos = useFormatStore(s => s.insertHivelyPosition);
  const deletePos = useFormatStore(s => s.deleteHivelyPosition);

  const scrollPos = Math.max(0, Math.min(
    currentPosition - Math.floor(visibleRows / 2),
    numPos - visibleRows
  ));

  // Map digit column to char offset within channel cell
  function digitCharX(d: number): number {
    // Layout: "XX +XX" → chars: 0,1=track  2=space  3=sign  4,5=trans
    if (d === 0) return 0;  // track hi
    if (d === 1) return 1;  // track lo
    if (d === 2) return 3;  // sign
    if (d === 3) return 4;  // trans hi
    return 5;               // trans lo
  }

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = canvasH * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, canvasH);
    ctx.font = `${CHAR_H}px "JetBrains Mono", "Fira Code", monospace`;
    ctx.textBaseline = 'middle';

    // Header
    ctx.fillStyle = COLORS.headerBg;
    ctx.fillRect(0, 0, width, HEADER_H);
    ctx.fillStyle = COLORS.headerText;
    ctx.fillText('POS', 2, HEADER_H / 2);
    for (let ch = 0; ch < numCh; ch++) {
      ctx.fillText(`CH${ch + 1}`, POS_NUM_W + ch * CH_W, HEADER_H / 2);
    }

    // Rows
    for (let vi = 0; vi < visibleRows; vi++) {
      const pos = scrollPos + vi;
      if (pos >= numPos) break;
      const y = HEADER_H + vi * ROW_H;
      const isCurrent = pos === currentPosition;
      const p = nativeData.positions[pos];

      if (isCurrent) {
        ctx.fillStyle = COLORS.currentRow;
        ctx.fillRect(0, y, width, ROW_H);

        // Cursor highlight on active digit
        const cx = POS_NUM_W + curCh * CH_W + digitCharX(curDigit) * CHAR_W;
        ctx.fillStyle = COLORS.cursor;
        ctx.fillRect(cx, y, CHAR_W, ROW_H);
      }

      // Position number
      ctx.fillStyle = isCurrent ? '#ffff88' : COLORS.posNum;
      ctx.fillText(pos.toString().padStart(3, '0'), 2, y + ROW_H / 2);

      // Column separators
      for (let ch = 1; ch < numCh; ch++) {
        ctx.strokeStyle = COLORS.channelSep;
        ctx.beginPath();
        ctx.moveTo(POS_NUM_W + ch * CH_W - 2, y);
        ctx.lineTo(POS_NUM_W + ch * CH_W - 2, y + ROW_H);
        ctx.stroke();
      }

      // Per-channel data
      for (let ch = 0; ch < numCh; ch++) {
        const x = POS_NUM_W + ch * CH_W;
        const trk = p.track[ch];
        const tr = p.transpose[ch];

        // Track (2 hex digits)
        ctx.fillStyle = COLORS.track;
        ctx.fillText(trk.toString(16).toUpperCase().padStart(2, '0'), x, y + ROW_H / 2);

        // Space + sign + transpose (2 hex digits)
        const sign = tr >= 0 ? '+' : '-';
        const trAbs = Math.abs(tr).toString(16).toUpperCase().padStart(2, '0');
        ctx.fillStyle = tr === 0 ? COLORS.transDim : (tr > 0 ? COLORS.transPos : COLORS.transNeg);
        ctx.fillText(` ${sign}${trAbs}`, x + CHAR_W * 2, y + ROW_H / 2);
      }
    }
  }, [width, canvasH, nativeData, currentPosition, numPos, numCh, scrollPos, visibleRows, curCh, curDigit]);

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
        // Map click char position to digit column
        if (charIdx <= 1) setCurDigit(charIdx);       // track digits
        else if (charIdx === 3) setCurDigit(2);        // sign
        else if (charIdx >= 4) setCurDigit(charIdx <= 4 ? 3 : 4); // trans digits
        else setCurDigit(0);
      }
    }
  }, [scrollPos, numPos, numCh, onPositionChange]);

  // Keyboard
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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

    // Insert/delete position
    if (key === 'Insert') { e.preventDefault(); insertPos(currentPosition); return; }
    if (e.ctrlKey && key === 'Backspace') { e.preventDefault(); deletePos(currentPosition); return; }

    const p = nativeData.positions[currentPosition];
    if (!p) return;

    // Sign column: +/- toggles
    if (curDigit === 2) {
      if (key === '+' || key === '=' || key === '-') {
        e.preventDefault();
        const cur = p.transpose[curCh];
        if (key === '-') {
          setCell(currentPosition, curCh, 'transpose', -Math.abs(cur || 1));
        } else {
          setCell(currentPosition, curCh, 'transpose', Math.abs(cur));
        }
        return;
      }
    }

    // Hex digit entry
    const hexIdx = HEX.indexOf(key.toLowerCase());
    if (hexIdx < 0) return;
    e.preventDefault();

    if (curDigit === 0 || curDigit === 1) {
      // Track nibble
      const cur = p.track[curCh] ?? 0;
      const newVal = curDigit === 0
        ? (hexIdx << 4) | (cur & 0x0F)
        : (cur & 0xF0) | hexIdx;
      setCell(currentPosition, curCh, 'track', newVal);
    } else if (curDigit === 3 || curDigit === 4) {
      // Transpose nibble (preserve sign)
      const cur = p.transpose[curCh] ?? 0;
      const sign = cur < 0 ? -1 : 1;
      const abs = Math.abs(cur);
      const ni = curDigit - 3; // 0=hi, 1=lo
      const newAbs = ni === 0
        ? (hexIdx << 4) | (abs & 0x0F)
        : (abs & 0xF0) | hexIdx;
      setCell(currentPosition, curCh, 'transpose', sign * newAbs);
    }

    // Move cursor right after typing
    const next = curDigit + 1;
    if (next < DIGIT_COLS) {
      // Skip sign column (auto-advance past it)
      setCurDigit(next === 2 ? 3 : next);
    } else if (curCh < numCh - 1) {
      setCurCh(c => c + 1);
      setCurDigit(0);
    }
  }, [currentPosition, numPos, numCh, curCh, curDigit, onPositionChange, setCell, insertPos, deletePos, nativeData]);

  useEffect(() => { canvasRef.current?.focus(); }, []);

  if (collapsed) {
    return (
      <div
        style={{
          width,
          height: HIVELY_MATRIX_COLLAPSED_HEIGHT,
          display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px',
          background: 'var(--color-tracker-row-highlight)',
          cursor: 'pointer',
          borderBottom: '1px solid var(--color-tracker-border, var(--color-border))',
        }}
        onClick={onToggleCollapse}
      >
        <ChevronRight size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        <span style={{
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          fontSize: 12, fontWeight: 700, color: 'var(--color-accent)',
        }}>POSITIONS</span>
      </div>
    );
  }

  return (
    <div style={{ width, height, display: 'flex', flexDirection: 'column', background: 'var(--color-tracker-row-even)' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px',
          height: HIVELY_MATRIX_COLLAPSED_HEIGHT, flexShrink: 0,
          background: 'var(--color-tracker-row-highlight)', cursor: 'pointer',
          borderBottom: '1px solid var(--color-tracker-border, var(--color-border))',
        }}
        onClick={onToggleCollapse}
      >
        <ChevronDown size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        <span style={{
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          fontSize: 12, fontWeight: 700, color: 'var(--color-accent)',
        }}>POSITIONS</span>
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={canvasH}
        style={{ width, height: canvasH, outline: 'none', cursor: 'pointer' }}
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
};
