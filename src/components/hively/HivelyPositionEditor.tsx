/**
 * HivelyPositionEditor — Editable position matrix for HivelyTracker/AHX.
 * Uses SequenceMatrixEditor for shared chrome/canvas/collapse.
 *
 * Each channel has: track (2 hex digits) + transpose sign + transpose (2 hex digits).
 * Cursor is per-digit. Typing a digit writes it and moves cursor right.
 */

import React, { useState, useCallback } from 'react';
import type { HivelyNativeData } from '@/types/tracker';
import { useFormatStore } from '@stores';
import {
  SequenceMatrixEditor, MATRIX_CHAR_W, MATRIX_ROW_H, MATRIX_HEADER_H,
  MATRIX_HEIGHT, MATRIX_COLLAPSED_HEIGHT,
  type MatrixRenderContext,
} from '../shared/SequenceMatrixEditor';

export const HIVELY_MATRIX_HEIGHT = MATRIX_HEIGHT;
export const HIVELY_MATRIX_COLLAPSED_HEIGHT = MATRIX_COLLAPSED_HEIGHT;

const POS_NUM_W = MATRIX_CHAR_W * 4 + 4;
// Per channel: "XX +XX " = track(2) space sign trans(2) space = 7 chars
const CH_W = MATRIX_CHAR_W * 7 + 4;

const HEX = '0123456789abcdef';

// Digit columns within a channel (relative char positions)
// 0=track_hi, 1=track_lo, 2=sign, 3=trans_hi, 4=trans_lo
const DIGIT_COLS = 5;

const COLORS = {
  track: '#e0e0e0',
  transPos: '#88ff88',
  transNeg: '#ff8888',
  transDim: '#808080',
  currentRow: 'rgba(120, 0, 0, 0.6)',
  cursor: 'rgba(255, 255, 136, 0.4)',
  channelSep: '#222',
};

// Map digit column to char offset within channel cell
// Layout: "XX +XX" → chars: 0,1=track  2=space  3=sign  4,5=trans
function digitCharX(d: number): number {
  if (d === 0) return 0;  // track hi
  if (d === 1) return 1;  // track lo
  if (d === 2) return 3;  // sign
  if (d === 3) return 4;  // trans hi
  return 5;               // trans lo
}

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
  const numPos = nativeData.positions.length;
  const numCh = nativeData.channels;

  const [curCh, setCurCh] = useState(0);
  const [curDigit, setCurDigit] = useState(0);

  const setCell = useFormatStore(s => s.setHivelyPositionCell);
  const insertPos = useFormatStore(s => s.insertHivelyPosition);
  const deletePos = useFormatStore(s => s.deleteHivelyPosition);

  // ── Render callback ────────────────────────────────────────────────────────

  const onRender = useCallback((rc: MatrixRenderContext) => {
    const { ctx, width: w, theme, visibleRows, scrollOffset } = rc;

    // Header
    ctx.fillStyle = theme.bgHighlight;
    ctx.fillRect(0, 0, w, MATRIX_HEADER_H);
    ctx.fillStyle = theme.textMuted;
    ctx.fillText('POS', 2, MATRIX_HEADER_H / 2);
    for (let ch = 0; ch < numCh; ch++) {
      ctx.fillText(`CH${ch + 1}`, POS_NUM_W + ch * CH_W, MATRIX_HEADER_H / 2);
    }

    // Rows
    const dataY0 = MATRIX_HEADER_H;
    for (let vi = 0; vi < visibleRows; vi++) {
      const pos = scrollOffset + vi;
      if (pos >= numPos) break;
      const y = dataY0 + vi * MATRIX_ROW_H;
      const isCurrent = pos === currentPosition;
      const p = nativeData.positions[pos];

      if (isCurrent) {
        ctx.fillStyle = COLORS.currentRow;
        ctx.fillRect(0, y, w, MATRIX_ROW_H);

        const cx = POS_NUM_W + curCh * CH_W + digitCharX(curDigit) * MATRIX_CHAR_W;
        ctx.fillStyle = COLORS.cursor;
        ctx.fillRect(cx, y, MATRIX_CHAR_W, MATRIX_ROW_H);
      }

      ctx.fillStyle = isCurrent ? '#ffff88' : theme.textMuted;
      ctx.fillText(pos.toString().padStart(3, '0'), 2, y + MATRIX_ROW_H / 2);

      for (let ch = 1; ch < numCh; ch++) {
        ctx.strokeStyle = COLORS.channelSep;
        ctx.beginPath();
        ctx.moveTo(POS_NUM_W + ch * CH_W - 2, y);
        ctx.lineTo(POS_NUM_W + ch * CH_W - 2, y + MATRIX_ROW_H);
        ctx.stroke();
      }

      for (let ch = 0; ch < numCh; ch++) {
        const x = POS_NUM_W + ch * CH_W;
        const trk = p.track[ch];
        const tr = p.transpose[ch];

        ctx.fillStyle = COLORS.track;
        ctx.fillText(trk.toString(16).toUpperCase().padStart(2, '0'), x, y + MATRIX_ROW_H / 2);

        const sign = tr >= 0 ? '+' : '-';
        const trAbs = Math.abs(tr).toString(16).toUpperCase().padStart(2, '0');
        ctx.fillStyle = tr === 0 ? COLORS.transDim : (tr > 0 ? COLORS.transPos : COLORS.transNeg);
        ctx.fillText(` ${sign}${trAbs}`, x + MATRIX_CHAR_W * 2, y + MATRIX_ROW_H / 2);
      }
    }
  }, [nativeData, currentPosition, numPos, numCh, curCh, curDigit]);

  // ── Click handler ──────────────────────────────────────────────────────────

  const onClick = useCallback((x: number, y: number, rc: MatrixRenderContext) => {
    const pos = rc.scrollOffset + Math.floor(y / MATRIX_ROW_H);
    if (pos >= 0 && pos < numPos) onPositionChange(pos);

    if (x >= POS_NUM_W) {
      const ch = Math.floor((x - POS_NUM_W) / CH_W);
      if (ch >= 0 && ch < numCh) {
        setCurCh(ch);
        const rel = x - (POS_NUM_W + ch * CH_W);
        const charIdx = Math.floor(rel / MATRIX_CHAR_W);
        if (charIdx <= 1) setCurDigit(charIdx);
        else if (charIdx === 3) setCurDigit(2);
        else if (charIdx >= 4) setCurDigit(charIdx <= 4 ? 3 : 4);
        else setCurDigit(0);
      }
    }
  }, [numPos, numCh, onPositionChange]);

  // ── Keyboard handler ───────────────────────────────────────────────────────

  const onKeyDown = useCallback((e: React.KeyboardEvent, _rc: MatrixRenderContext): boolean => {
    const { key } = e;

    if (key === 'ArrowUp') { onPositionChange(Math.max(0, currentPosition - 1)); return true; }
    if (key === 'ArrowDown') { onPositionChange(Math.min(numPos - 1, currentPosition + 1)); return true; }
    if (key === 'ArrowRight') {
      const next = curDigit + 1;
      if (next < DIGIT_COLS) setCurDigit(next);
      else if (curCh < numCh - 1) { setCurCh(c => c + 1); setCurDigit(0); }
      return true;
    }
    if (key === 'ArrowLeft') {
      const prev = curDigit - 1;
      if (prev >= 0) setCurDigit(prev);
      else if (curCh > 0) { setCurCh(c => c - 1); setCurDigit(DIGIT_COLS - 1); }
      return true;
    }
    if (key === 'Tab') {
      if (e.shiftKey) {
        if (curCh > 0) { setCurCh(c => c - 1); setCurDigit(0); }
      } else {
        if (curCh < numCh - 1) { setCurCh(c => c + 1); setCurDigit(0); }
      }
      return true;
    }

    if (key === 'Insert') { insertPos(currentPosition); return true; }
    if (e.ctrlKey && key === 'Backspace') { deletePos(currentPosition); return true; }

    const p = nativeData.positions[currentPosition];
    if (!p) return false;

    // Sign column: +/- toggles
    if (curDigit === 2) {
      if (key === '+' || key === '=' || key === '-') {
        const cur = p.transpose[curCh];
        if (key === '-') {
          setCell(currentPosition, curCh, 'transpose', -Math.abs(cur || 1));
        } else {
          setCell(currentPosition, curCh, 'transpose', Math.abs(cur));
        }
        return true;
      }
    }

    // Hex digit entry
    const hexIdx = HEX.indexOf(key.toLowerCase());
    if (hexIdx < 0) return false;

    if (curDigit === 0 || curDigit === 1) {
      const cur = p.track[curCh] ?? 0;
      const newVal = curDigit === 0
        ? (hexIdx << 4) | (cur & 0x0F)
        : (cur & 0xF0) | hexIdx;
      setCell(currentPosition, curCh, 'track', newVal);
    } else if (curDigit === 3 || curDigit === 4) {
      const cur = p.transpose[curCh] ?? 0;
      const sign = cur < 0 ? -1 : 1;
      const abs = Math.abs(cur);
      const ni = curDigit - 3;
      const newAbs = ni === 0
        ? (hexIdx << 4) | (abs & 0x0F)
        : (abs & 0xF0) | hexIdx;
      setCell(currentPosition, curCh, 'transpose', sign * newAbs);
    }

    // Move cursor right after typing, skip sign column
    const next = curDigit + 1;
    if (next < DIGIT_COLS) {
      setCurDigit(next === 2 ? 3 : next);
    } else if (curCh < numCh - 1) {
      setCurCh(c => c + 1);
      setCurDigit(0);
    }
    return true;
  }, [currentPosition, numPos, numCh, curCh, curDigit, onPositionChange, setCell, insertPos, deletePos, nativeData]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SequenceMatrixEditor
      label="POSITIONS"
      width={width}
      height={height}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      totalRows={numPos}
      activeRow={currentPosition}
      onRender={onRender}
      onClick={onClick}
      onKeyDown={onKeyDown}
      renderDeps={[nativeData, currentPosition, numPos, numCh, curCh, curDigit]}
    />
  );
};
