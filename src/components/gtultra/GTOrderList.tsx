/**
 * GTOrderList — Order list editor for GoatTracker Ultra.
 * Shows pattern sequence per channel. Click to jump, keyboard to edit.
 * 
 * Keyboard:
 *   Up/Down — navigate positions
 *   Left/Right — switch channel column
 *   0-9, A-F — hex entry (sets pattern number)
 *   Insert — insert new position
 *   Delete — delete position
 *   Enter/Double-click — jump playback to position
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useGTUltraStore } from '../../stores/useGTUltraStore';

const ROW_H = 16;
const HEADER_H = 20;

export const GTOrderList: React.FC<{
  width: number;
  height: number;
  channelCount: number;
}> = ({ width, height, channelCount }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orderData = useGTUltraStore((s) => s.orderData);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const orderCursor = useGTUltraStore((s) => s.orderCursor);
  const setOrderCursor = useGTUltraStore((s) => s.setOrderCursor);
  const engine = useGTUltraStore((s) => s.engine);

  const [channelCol, setChannelCol] = useState(0);
  const [hexDigit, setHexDigit] = useState<number | null>(null);

  const visibleRows = Math.floor((height - HEADER_H) / ROW_H);
  const totalLen = orderData.length > 0 ? orderData[0].length : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, width, height);

    ctx.font = `12px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'top';

    // Header
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, HEADER_H - 2);
    ctx.fillStyle = '#888';
    ctx.fillText('ORD', 4, 3);
    const colW = Math.floor((width - 30) / channelCount);
    for (let ch = 0; ch < channelCount; ch++) {
      ctx.fillStyle = ch === channelCol ? '#e0e0e0' : '#555';
      ctx.fillText(`CH${ch + 1}`, 30 + ch * colW, 3);
    }

    const scrollTop = Math.max(0, orderCursor - Math.floor(visibleRows / 2));

    for (let vi = 0; vi < visibleRows && scrollTop + vi < totalLen; vi++) {
      const idx = scrollTop + vi;
      const y = HEADER_H + vi * ROW_H;
      const isPlay = idx === playbackPos.position;
      const isCursor = idx === orderCursor;

      if (isPlay) {
        ctx.fillStyle = 'rgba(233, 69, 96, 0.15)';
        ctx.fillRect(0, y, width, ROW_H);
      }
      if (isCursor) {
        // Highlight active channel column
        const activeX = 30 + channelCol * colW;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(activeX - 2, y, colW, ROW_H);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, y + 0.5, width - 1, ROW_H - 1);
      }

      // Index
      ctx.fillStyle = '#555';
      ctx.fillText(idx.toString(16).toUpperCase().padStart(2, '0'), 4, y + 2);

      // Values per channel
      for (let ch = 0; ch < channelCount; ch++) {
        const val = orderData[ch]?.[idx] ?? 0;
        const x = 30 + ch * colW;

        if (val === 0xFF) {
          ctx.fillStyle = '#e94560';
          ctx.fillText('EN', x, y + 2);
        } else if (val >= 0xD0 && val <= 0xDF) {
          ctx.fillStyle = '#ffcc00';
          ctx.fillText(`R${(val & 0x0F).toString(16).toUpperCase()}`, x, y + 2);
        } else if (val >= 0xE0 && val <= 0xEF) {
          ctx.fillStyle = '#ff8866';
          ctx.fillText(`-${(val & 0x0F).toString(16).toUpperCase()}`, x, y + 2);
        } else if (val >= 0xF0 && val <= 0xFE) {
          ctx.fillStyle = '#ff8866';
          ctx.fillText(`+${(val & 0x0F).toString(16).toUpperCase()}`, x, y + 2);
        } else {
          ctx.fillStyle = '#60e060';
          ctx.fillText(val.toString(16).toUpperCase().padStart(2, '0'), x, y + 2);
        }
      }
    }
  }, [width, height, orderData, playbackPos.position, orderCursor, channelCount, visibleRows, totalLen, channelCol]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (y < HEADER_H) return;
    const scrollTop = Math.max(0, orderCursor - Math.floor(visibleRows / 2));
    const idx = scrollTop + Math.floor((y - HEADER_H) / ROW_H);
    if (idx >= totalLen) return;
    setOrderCursor(idx);
    // Detect channel column click
    const colW = Math.floor((width - 30) / channelCount);
    const relX = x - 30;
    if (relX >= 0) {
      const ch = Math.min(channelCount - 1, Math.floor(relX / colW));
      setChannelCol(ch);
    }
    setHexDigit(null);
    canvasRef.current?.focus();
  }, [orderCursor, visibleRows, totalLen, setOrderCursor, width, channelCount]);

  const handleDoubleClick = useCallback(() => {
    // Jump playback to this position
    if (engine) {
      const store = useGTUltraStore.getState();
      engine.play(store.currentSong, orderCursor, 0);
      store.setPlaying(true);
    }
  }, [engine, orderCursor]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { key } = e;
    e.stopPropagation();

    // Navigation
    if (key === 'ArrowUp') { e.preventDefault(); setOrderCursor(Math.max(0, orderCursor - 1)); setHexDigit(null); return; }
    if (key === 'ArrowDown') { e.preventDefault(); setOrderCursor(Math.min(totalLen - 1, orderCursor + 1)); setHexDigit(null); return; }
    if (key === 'ArrowLeft') { e.preventDefault(); setChannelCol(Math.max(0, channelCol - 1)); setHexDigit(null); return; }
    if (key === 'ArrowRight') { e.preventDefault(); setChannelCol(Math.min(channelCount - 1, channelCol + 1)); setHexDigit(null); return; }

    // Hex entry (0-9, A-F)
    const hexChar = key.toUpperCase();
    if (/^[0-9A-F]$/.test(hexChar)) {
      e.preventDefault();
      const nibble = parseInt(hexChar, 16);
      if (hexDigit === null) {
        setHexDigit(nibble);
      } else {
        const value = (hexDigit << 4) | nibble;
        if (engine) {
          engine.setOrderEntry(channelCol, orderCursor, value);
          useGTUltraStore.getState().refreshAllOrders();
        }
        setHexDigit(null);
        setOrderCursor(Math.min(totalLen - 1, orderCursor + 1));
      }
      return;
    }

    // Enter — jump to position
    if (key === 'Enter') {
      e.preventDefault();
      handleDoubleClick();
      return;
    }

    // Escape — clear hex entry
    if (key === 'Escape') {
      setHexDigit(null);
      return;
    }
  }, [orderCursor, totalLen, channelCol, channelCount, hexDigit, engine, setOrderCursor, handleDoubleClick]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width, height, borderBottom: '1px solid #222', outline: 'none' }}
      tabIndex={0}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
    />
  );
};
