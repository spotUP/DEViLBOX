/**
 * FurnaceOrderEditor — Order matrix for Furnace modules.
 * Uses SequenceMatrixEditor for shared chrome/canvas/collapse (same as GT Ultra, Hively, Klystrack).
 *
 * Grid: rows = order positions, columns = channels, cells = pattern indices (hex).
 * Per-digit cursor. Arrow keys navigate, hex keys (0-9, A-F) write values.
 * Insert key adds row, Ctrl+Backspace deletes row.
 */

import React, { useState, useCallback } from 'react';
import type { FurnaceNativeData } from '@/types/tracker';
import { useFormatStore } from '@stores';
import {
  SequenceMatrixEditor, MATRIX_CHAR_W, MATRIX_ROW_H, MATRIX_HEADER_H,
  MATRIX_HEIGHT, MATRIX_COLLAPSED_HEIGHT,
  type MatrixRenderContext,
} from '../shared/SequenceMatrixEditor';

export const FURNACE_ORDER_MATRIX_HEIGHT = MATRIX_HEIGHT;
export const FURNACE_ORDER_MATRIX_COLLAPSED_HEIGHT = MATRIX_COLLAPSED_HEIGHT;

const POS_COL_W = MATRIX_CHAR_W * 4;
const CH_COL_W  = MATRIX_CHAR_W * 4;
const HEX = '0123456789abcdef';
const DIGIT_COLS = 2;

interface Props {
  width: number;
  height: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  nativeData: FurnaceNativeData;
  currentPosition: number;
  onPositionChange: (pos: number) => void;
  onOrderChange: (channel: number, position: number, patternIndex: number) => void;
}

export const FurnaceOrderEditor: React.FC<Props> = ({
  width, height, collapsed, onToggleCollapse,
  nativeData, currentPosition, onPositionChange, onOrderChange,
}) => {
  const sub = nativeData.subsongs[nativeData.activeSubsong];
  const insertRow = useFormatStore(s => s.insertFurnaceOrderRow);
  const deleteRow = useFormatStore(s => s.deleteFurnaceOrderRow);
  const numPos = sub?.ordersLen ?? 0;
  const numCh  = sub?.channels.length ?? 0;

  const [curCh, setCurCh]       = useState(0);
  const [curDigit, setCurDigit] = useState(0); // 0=hi, 1=lo

  // ── Render callback ─────────────────────────────────────────────────────

  const onRender = useCallback((rc: MatrixRenderContext) => {
    const { ctx, width: w, theme, visibleRows, scrollOffset } = rc;

    // Column header
    ctx.fillStyle = theme.bgHighlight;
    ctx.fillRect(0, 0, w, MATRIX_HEADER_H);
    ctx.fillStyle = theme.textMuted;
    ctx.fillText('Pos', 4, MATRIX_HEADER_H / 2);
    for (let ch = 0; ch < numCh; ch++) {
      const label = sub?.channels[ch]?.name ?? `CH${ch}`;
      const maxChars = Math.floor(CH_COL_W / MATRIX_CHAR_W);
      const truncated = label.length > maxChars ? label.substring(0, maxChars) : label;
      ctx.fillStyle = ch === curCh ? '#ccc' : theme.textMuted;
      ctx.fillText(truncated, POS_COL_W + ch * CH_COL_W, MATRIX_HEADER_H / 2);
    }

    const dataY0 = MATRIX_HEADER_H;
    for (let vi = 0; vi < visibleRows; vi++) {
      const pos = scrollOffset + vi;
      if (pos >= numPos) break;
      const y = dataY0 + vi * MATRIX_ROW_H;
      const isCurrent = pos === currentPosition;

      // Current row highlight
      if (isCurrent) {
        ctx.fillStyle = theme.bgCurrent;
        ctx.fillRect(0, y, w, MATRIX_ROW_H);

        // Active channel cell highlight
        const activeX = POS_COL_W + curCh * CH_COL_W;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(activeX - 2, y, CH_COL_W, MATRIX_ROW_H);

        // Per-digit cursor
        const digitX = POS_COL_W + curCh * CH_COL_W + curDigit * (MATRIX_CHAR_W * 0.9);
        ctx.fillStyle = 'rgba(255, 255, 136, 0.35)';
        ctx.fillRect(digitX - 1, y, MATRIX_CHAR_W, MATRIX_ROW_H);

        // Row outline
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, y + 0.5, w - 1, MATRIX_ROW_H - 1);
      }

      // Position number
      ctx.fillStyle = isCurrent ? theme.accent : theme.textMuted;
      ctx.fillText(pos.toString(16).toUpperCase().padStart(3, '0'), 4, y + MATRIX_ROW_H / 2);

      // Per-channel pattern index
      for (let ch = 0; ch < numCh; ch++) {
        const patIdx = sub?.orders[ch]?.[pos] ?? 0;
        ctx.fillStyle = isCurrent && ch === curCh ? '#fff' : '#e0e0e0';
        ctx.fillText(
          patIdx.toString(16).toUpperCase().padStart(2, '0'),
          POS_COL_W + ch * CH_COL_W,
          y + MATRIX_ROW_H / 2,
        );
      }
    }
  }, [sub, numCh, numPos, currentPosition, curCh, curDigit]);

  // ── Click handler ───────────────────────────────────────────────────────

  const onClick = useCallback((x: number, y: number, rc: MatrixRenderContext) => {
    const pos = rc.scrollOffset + Math.floor(y / MATRIX_ROW_H);
    if (pos >= 0 && pos < numPos) onPositionChange(pos);

    const relX = x - POS_COL_W;
    if (relX >= 0) {
      const ch = Math.min(numCh - 1, Math.floor(relX / CH_COL_W));
      if (ch >= 0) {
        setCurCh(ch);
        const digitRel = relX - ch * CH_COL_W;
        setCurDigit(digitRel < CH_COL_W / 2 ? 0 : 1);
      }
    }
  }, [numPos, numCh, onPositionChange]);

  // ── Keyboard handler ────────────────────────────────────────────────────

  const onKeyDown = useCallback((e: React.KeyboardEvent, _rc: MatrixRenderContext): boolean => {
    e.stopPropagation();
    const { key } = e;

    // Navigation
    if (key === 'ArrowUp')   { onPositionChange(Math.max(0, currentPosition - 1)); return true; }
    if (key === 'ArrowDown') { onPositionChange(Math.min(numPos - 1, currentPosition + 1)); return true; }
    if (key === 'ArrowRight') {
      const next = curDigit + 1;
      if (next < DIGIT_COLS) { setCurDigit(next); }
      else if (curCh < numCh - 1) { setCurCh(c => c + 1); setCurDigit(0); }
      return true;
    }
    if (key === 'ArrowLeft') {
      const prev = curDigit - 1;
      if (prev >= 0) { setCurDigit(prev); }
      else if (curCh > 0) { setCurCh(c => c - 1); setCurDigit(DIGIT_COLS - 1); }
      return true;
    }
    if (key === 'Tab') {
      if (e.shiftKey) { if (curCh > 0) { setCurCh(c => c - 1); setCurDigit(0); } }
      else { if (curCh < numCh - 1) { setCurCh(c => c + 1); setCurDigit(0); } }
      return true;
    }
    if (key === 'PageUp')  { onPositionChange(Math.max(0, currentPosition - 16)); return true; }
    if (key === 'PageDown') { onPositionChange(Math.min(numPos - 1, currentPosition + 16)); return true; }
    if (key === 'Home')    { onPositionChange(0); return true; }
    if (key === 'End')     { onPositionChange(numPos - 1); return true; }

    // Insert/delete order row
    if (key === 'Insert') { insertRow(currentPosition); return true; }
    if (e.ctrlKey && key === 'Backspace') { deleteRow(currentPosition); return true; }

    // Hex digit entry
    const hexIdx = HEX.indexOf(key.toLowerCase());
    if (hexIdx < 0) return false;

    const cur = sub?.orders[curCh]?.[currentPosition] ?? 0;
    const newVal = curDigit === 0
      ? (hexIdx << 4) | (cur & 0x0F)
      : (cur & 0xF0) | hexIdx;
    onOrderChange(curCh, currentPosition, newVal & 0xFF);

    // Advance cursor
    if (curDigit < DIGIT_COLS - 1) { setCurDigit(d => d + 1); }
    else if (curCh < numCh - 1) { setCurCh(c => c + 1); setCurDigit(0); }
    return true;
  }, [sub, currentPosition, numPos, numCh, curCh, curDigit,
      onPositionChange, onOrderChange, insertRow, deleteRow]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <SequenceMatrixEditor
      label="ORDERS"
      width={width}
      height={height}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      totalRows={numPos}
      activeRow={currentPosition}
      onRender={onRender}
      onClick={onClick}
      onKeyDown={onKeyDown}
      renderDeps={[sub, numCh, numPos, currentPosition, curCh, curDigit]}
    />
  );
};
