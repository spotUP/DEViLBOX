/**
 * GTOrderMatrix — Orders editor panel above the pattern editor.
 * Uses theme CSS variables for background colors to stay in sync with the pattern editor.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useGTUltraStore } from '../../stores/useGTUltraStore';

export const GT_ORDER_MATRIX_HEIGHT = 160;

const CHAR_W = 8;
const ROW_H = 14;
const LABEL_H = 16;
const HEADER_H = 16;

interface GTOrderMatrixProps {
  width: number;
  height: number;
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

/** Read a CSS variable from :root, with fallback */
function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// ─── Orders Canvas ──────────────────────────────────────────────────────────

const OrdersCanvas: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orderData = useGTUltraStore((s) => s.orderData);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const orderCursor = useGTUltraStore((s) => s.orderCursor);
  const setOrderCursor = useGTUltraStore((s) => s.setOrderCursor);
  const orderChannelCol = useGTUltraStore((s) => s.orderChannelCol);
  const setOrderChannelCol = useGTUltraStore((s) => s.setOrderChannelCol);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const engine = useGTUltraStore((s) => s.engine);

  const [scrollOffset, setScrollOffset] = useState(0);
  const [hexDigit, setHexDigit] = useState<number | null>(null);

  const channelCount = sidCount * 3;
  const contentH = height - LABEL_H - HEADER_H;
  const visibleRows = Math.floor(contentH / ROW_H);
  const totalLen = orderData.length > 0 ? orderData[0].length : 0;

  // Auto-scroll to keep cursor visible
  useEffect(() => {
    if (orderCursor < scrollOffset) {
      setScrollOffset(orderCursor);
    } else if (orderCursor >= scrollOffset + visibleRows) {
      setScrollOffset(orderCursor - visibleRows + 1);
    }
  }, [orderCursor, scrollOffset, visibleRows]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Read theme colors from CSS variables (set by useThemeStore)
    const bgEven      = cssVar('--color-tracker-row-even', '#1a1a2e');
    const bgOdd       = cssVar('--color-tracker-row-odd', '#1e1e34');
    const bgHighlight = cssVar('--color-tracker-row-highlight', '#222244');
    const bgCurrent   = cssVar('--color-tracker-row-current', '#2a2a50');
    const textMuted   = cssVar('--color-text-muted', '#555');
    const accent      = cssVar('--color-accent', '#ff6666');

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = bgEven;
    ctx.fillRect(0, 0, width, height);
    ctx.font = `11px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'top';

    // Section label
    ctx.fillStyle = bgOdd;
    ctx.fillRect(0, 0, width, LABEL_H);
    ctx.fillStyle = accent;
    ctx.font = `bold 10px "JetBrains Mono", monospace`;
    ctx.fillText('ORDERS', 4, 2);
    ctx.font = `11px "JetBrains Mono", monospace`;

    // Column header
    const posColW = CHAR_W * 3;
    const chColW = CHAR_W * 3;
    const hdrY = LABEL_H;

    ctx.fillStyle = bgHighlight;
    ctx.fillRect(0, hdrY, width, HEADER_H);
    ctx.fillStyle = textMuted;
    ctx.fillText('Pos', 2, hdrY + 2);
    for (let ch = 0; ch < channelCount; ch++) {
      ctx.fillStyle = ch === orderChannelCol ? '#ccc' : textMuted;
      ctx.fillText(`C${ch + 1}`, posColW + ch * chColW, hdrY + 2);
    }

    const dataY0 = LABEL_H + HEADER_H;

    // Rows
    for (let vi = 0; vi < visibleRows; vi++) {
      const idx = scrollOffset + vi;
      if (idx >= totalLen) break;
      const y = dataY0 + vi * ROW_H;
      const isPlay = idx === playbackPos.position;
      const isCursor = idx === orderCursor;

      if (isPlay) {
        ctx.fillStyle = bgCurrent;
        ctx.fillRect(0, y, width, ROW_H);
      }
      if (isCursor) {
        const activeX = posColW + orderChannelCol * chColW;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(activeX - 2, y, chColW, ROW_H);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, y + 0.5, width - 1, ROW_H - 1);
      }

      ctx.fillStyle = isPlay ? accent : textMuted;
      ctx.fillText(idx.toString(16).toUpperCase().padStart(2, '0'), 4, y + 1);

      for (let ch = 0; ch < channelCount; ch++) {
        const val = orderData[ch]?.[idx] ?? 0;
        ctx.fillStyle = getOrderColor(val);
        ctx.fillText(formatOrderVal(val), posColW + ch * chColW, y + 1);
      }
    }

    // Hex entry indicator
    if (hexDigit !== null) {
      const cx = posColW + orderChannelCol * chColW;
      const cy = dataY0 + (orderCursor - scrollOffset) * ROW_H;
      if (cy >= dataY0 && cy < height) {
        ctx.fillStyle = 'rgba(255, 102, 102, 0.3)';
        ctx.fillRect(cx - 2, cy, CHAR_W, ROW_H);
        ctx.fillStyle = accent;
        ctx.fillText(hexDigit.toString(16).toUpperCase(), cx, cy + 1);
      }
    }
  }, [width, height, orderData, playbackPos.position, orderCursor, orderChannelCol,
      channelCount, scrollOffset, visibleRows, totalLen, hexDigit]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 3 : -3;
    setScrollOffset((s) => Math.max(0, Math.min(totalLen - visibleRows, s + delta)));
  }, [totalLen, visibleRows]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dataY0 = LABEL_H + HEADER_H;
    if (y < dataY0) return;
    const idx = scrollOffset + Math.floor((y - dataY0) / ROW_H);
    if (idx >= totalLen) return;
    setOrderCursor(idx);

    const posColW = CHAR_W * 3;
    const chColW = CHAR_W * 3;
    const relX = x - posColW;
    if (relX >= 0) {
      const ch = Math.min(channelCount - 1, Math.floor(relX / chColW));
      setOrderChannelCol(ch);
    }
    setHexDigit(null);
    canvasRef.current?.focus();
  }, [scrollOffset, totalLen, setOrderCursor, setOrderChannelCol, width, channelCount]);

  const handleDoubleClick = useCallback(() => {
    if (engine) {
      const store = useGTUltraStore.getState();
      engine.play(store.currentSong, orderCursor, 0);
      store.setPlaying(true);
    }
  }, [engine, orderCursor]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { key } = e;
    e.stopPropagation();

    if (key === 'ArrowUp') { e.preventDefault(); setOrderCursor(Math.max(0, orderCursor - 1)); setHexDigit(null); return; }
    if (key === 'ArrowDown') { e.preventDefault(); setOrderCursor(Math.min(totalLen - 1, orderCursor + 1)); setHexDigit(null); return; }
    if (key === 'ArrowLeft') { e.preventDefault(); setOrderChannelCol(Math.max(0, orderChannelCol - 1)); setHexDigit(null); return; }
    if (key === 'ArrowRight') { e.preventDefault(); setOrderChannelCol(Math.min(channelCount - 1, orderChannelCol + 1)); setHexDigit(null); return; }
    if (key === 'PageUp') { e.preventDefault(); setOrderCursor(Math.max(0, orderCursor - visibleRows)); setHexDigit(null); return; }
    if (key === 'PageDown') { e.preventDefault(); setOrderCursor(Math.min(totalLen - 1, orderCursor + visibleRows)); setHexDigit(null); return; }
    if (key === 'Home') { e.preventDefault(); setOrderCursor(0); setHexDigit(null); return; }
    if (key === 'End') { e.preventDefault(); setOrderCursor(totalLen - 1); setHexDigit(null); return; }

    if (key === 'Enter') { e.preventDefault(); handleDoubleClick(); return; }
    if (key === 'Escape') { setHexDigit(null); return; }

    const hexChar = key.toUpperCase();
    if (/^[0-9A-F]$/.test(hexChar)) {
      e.preventDefault();
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
    }
  }, [orderCursor, totalLen, orderChannelCol, channelCount, hexDigit, engine,
      setOrderCursor, setOrderChannelCol, visibleRows, handleDoubleClick]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, outline: 'none', cursor: 'pointer' }}
      tabIndex={0}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
    />
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

export const GTOrderMatrix: React.FC<GTOrderMatrixProps> = ({ width, height }) => {
  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'row',
        background: 'var(--color-tracker-row-even)',
      }}
    >
      <OrdersCanvas width={width} height={height} />
    </div>
  );
};
