/**
 * GTOrderMatrix — Orders editor panel above the pattern editor.
 * Uses SequenceMatrixEditor for shared chrome/canvas/collapse.
 */

import React, { useState, useCallback } from 'react';
import { useGTUltraStore } from '../../stores/useGTUltraStore';
import { resetFormatPlaybackState, setFormatPlaybackPlaying } from '@engine/FormatPlaybackState';
import {
  SequenceMatrixEditor, MATRIX_CHAR_W, MATRIX_ROW_H, MATRIX_HEADER_H,
  MATRIX_HEIGHT, MATRIX_COLLAPSED_HEIGHT,
  type MatrixRenderContext,
} from '../shared/SequenceMatrixEditor';

export const GT_ORDER_MATRIX_HEIGHT = MATRIX_HEIGHT;
export const GT_ORDER_MATRIX_COLLAPSED_HEIGHT = MATRIX_COLLAPSED_HEIGHT;

const POS_COL_W = MATRIX_CHAR_W * 4;
const CH_COL_W = MATRIX_CHAR_W * 4;

interface GTOrderMatrixProps {
  width: number;
  height: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

// ─── Order command coloring ──────────────────────────────────────────────────

function getOrderColor(val: number): string {
  if (val === 0xFF) return '#dd0000';
  if (val >= 0xF0) return '#00dd00';
  if (val >= 0xE0) return '#dddd00';
  if (val >= 0xD0) return '#00dddd';
  return '#e0e0e0';
}

function formatOrderVal(val: number): string {
  if (val === 0xFF) return 'EN';
  if (val >= 0xD0 && val <= 0xDF) return `R${(val & 0x0F).toString(16).toUpperCase()}`;
  if (val >= 0xE0 && val <= 0xEF) return `-${(val & 0x0F).toString(16).toUpperCase()}`;
  if (val >= 0xF0 && val <= 0xFE) return `+${(val & 0x0F).toString(16).toUpperCase()}`;
  return val.toString(16).toUpperCase().padStart(2, '0');
}

// ─── Component ──────────────────────────────────────────────────────────────

export const GTOrderMatrix: React.FC<GTOrderMatrixProps> = ({ width, height, collapsed, onToggleCollapse }) => {
  const orderData = useGTUltraStore((s) => s.orderData);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const orderCursor = useGTUltraStore((s) => s.orderCursor);
  const setOrderCursor = useGTUltraStore((s) => s.setOrderCursor);
  const orderChannelCol = useGTUltraStore((s) => s.orderChannelCol);
  const setOrderChannelCol = useGTUltraStore((s) => s.setOrderChannelCol);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const engine = useGTUltraStore((s) => s.engine);

  const [hexDigit, setHexDigit] = useState<number | null>(null);

  const channelCount = sidCount * 3;
  const totalLen = orderData.length > 0 ? orderData[0].length : 0;

  const onRender = useCallback((rc: MatrixRenderContext) => {
    const { ctx, width: w, theme, visibleRows, scrollOffset } = rc;

    // Column header
    ctx.fillStyle = theme.bgHighlight;
    ctx.fillRect(0, 0, w, MATRIX_HEADER_H);
    ctx.fillStyle = theme.textMuted;
    ctx.fillText('Pos', 4, MATRIX_HEADER_H / 2);
    for (let ch = 0; ch < channelCount; ch++) {
      ctx.fillStyle = ch === orderChannelCol ? '#ccc' : theme.textMuted;
      ctx.fillText(`C${ch + 1}`, POS_COL_W + ch * CH_COL_W, MATRIX_HEADER_H / 2);
    }

    const dataY0 = MATRIX_HEADER_H;
    for (let vi = 0; vi < visibleRows; vi++) {
      const idx = scrollOffset + vi;
      if (idx >= totalLen) break;
      const y = dataY0 + vi * MATRIX_ROW_H;
      const isPlay = idx === playbackPos.position;
      const isCursor = idx === orderCursor;

      if (isPlay) {
        ctx.fillStyle = theme.bgCurrent;
        ctx.fillRect(0, y, w, MATRIX_ROW_H);
      }
      if (isCursor) {
        const activeX = POS_COL_W + orderChannelCol * CH_COL_W;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(activeX - 2, y, CH_COL_W, MATRIX_ROW_H);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, y + 0.5, w - 1, MATRIX_ROW_H - 1);
      }

      ctx.fillStyle = isPlay ? theme.accent : theme.textMuted;
      ctx.fillText(idx.toString(16).toUpperCase().padStart(2, '0'), 4, y + MATRIX_ROW_H / 2);

      for (let ch = 0; ch < channelCount; ch++) {
        const val = orderData[ch]?.[idx] ?? 0;
        ctx.fillStyle = getOrderColor(val);
        ctx.fillText(formatOrderVal(val), POS_COL_W + ch * CH_COL_W, y + MATRIX_ROW_H / 2);
      }
    }

    // Hex entry indicator
    if (hexDigit !== null) {
      const cx = POS_COL_W + orderChannelCol * CH_COL_W;
      const cy = dataY0 + (orderCursor - scrollOffset) * MATRIX_ROW_H;
      if (cy >= dataY0 && cy < rc.height) {
        ctx.fillStyle = 'rgba(255, 102, 102, 0.3)';
        ctx.fillRect(cx - 2, cy, MATRIX_CHAR_W, MATRIX_ROW_H);
        ctx.fillStyle = theme.accent;
        ctx.fillText(hexDigit.toString(16).toUpperCase(), cx, cy + MATRIX_ROW_H / 2);
      }
    }
  }, [orderData, playbackPos.position, orderCursor, orderChannelCol, channelCount, totalLen, hexDigit]);

  const handleDoubleClick = useCallback(() => {
    if (engine) {
      const store = useGTUltraStore.getState();
      resetFormatPlaybackState();
      engine.play(store.currentSong, orderCursor, 0);
      store.setPlaying(true);
      setFormatPlaybackPlaying(true);
    }
  }, [engine, orderCursor]);

  const onClick = useCallback((x: number, y: number, rc: MatrixRenderContext) => {
    const idx = rc.scrollOffset + Math.floor(y / MATRIX_ROW_H);
    if (idx >= totalLen) return;
    setOrderCursor(idx);
    const relX = x - POS_COL_W;
    if (relX >= 0) {
      const ch = Math.min(channelCount - 1, Math.floor(relX / CH_COL_W));
      setOrderChannelCol(ch);
    }
    setHexDigit(null);
  }, [totalLen, setOrderCursor, setOrderChannelCol, channelCount]);

  const onKeyDown = useCallback((e: React.KeyboardEvent, rc: MatrixRenderContext): boolean => {
    e.stopPropagation();
    const { key } = e;

    if (key === 'ArrowUp') { setOrderCursor(Math.max(0, orderCursor - 1)); setHexDigit(null); return true; }
    if (key === 'ArrowDown') { setOrderCursor(Math.min(totalLen - 1, orderCursor + 1)); setHexDigit(null); return true; }
    if (key === 'ArrowLeft') { setOrderChannelCol(Math.max(0, orderChannelCol - 1)); setHexDigit(null); return true; }
    if (key === 'ArrowRight') { setOrderChannelCol(Math.min(channelCount - 1, orderChannelCol + 1)); setHexDigit(null); return true; }
    if (key === 'PageUp') { setOrderCursor(Math.max(0, orderCursor - rc.visibleRows)); setHexDigit(null); return true; }
    if (key === 'PageDown') { setOrderCursor(Math.min(totalLen - 1, orderCursor + rc.visibleRows)); setHexDigit(null); return true; }
    if (key === 'Home') { setOrderCursor(0); setHexDigit(null); return true; }
    if (key === 'End') { setOrderCursor(totalLen - 1); setHexDigit(null); return true; }
    if (key === 'Enter') { handleDoubleClick(); return true; }
    if (key === 'Escape') { setHexDigit(null); return true; }

    const hexChar = key.toUpperCase();
    if (/^[0-9A-F]$/.test(hexChar)) {
      const nibble = parseInt(hexChar, 16);
      if (hexDigit === null) {
        setHexDigit(nibble);
      } else {
        const value = (hexDigit << 4) | nibble;
        if (engine) {
          engine.setOrderEntry(orderChannelCol, orderCursor, value);
          useGTUltraStore.getState().refreshAllOrders();
        }
        setHexDigit(null);
        setOrderCursor(Math.min(totalLen - 1, orderCursor + 1));
      }
      return true;
    }
    return false;
  }, [orderCursor, totalLen, orderChannelCol, channelCount, hexDigit, engine,
      setOrderCursor, setOrderChannelCol, handleDoubleClick]);

  return (
    <SequenceMatrixEditor
      label="ORDERS"
      width={width}
      height={height}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      totalRows={totalLen}
      activeRow={orderCursor}
      onRender={onRender}
      onClick={onClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={onKeyDown}
      renderDeps={[orderData, playbackPos.position, orderCursor, orderChannelCol, channelCount, totalLen, hexDigit]}
    />
  );
};
