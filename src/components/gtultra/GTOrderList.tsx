/**
 * GTOrderList — Order list editor for GoatTracker Ultra.
 * Shows pattern sequence per channel. Click to jump to position.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useGTUltraStore } from '../../stores/useGTUltraStore';

const ROW_H = 16;

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

  const visibleRows = Math.floor((height - 20) / ROW_H);
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

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    ctx.font = `12px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'top';

    // Header
    ctx.fillStyle = '#0f3460';
    ctx.fillRect(0, 0, width, 18);
    ctx.fillStyle = '#e94560';
    ctx.fillText('ORDER LIST', 4, 3);

    const scrollTop = Math.max(0, orderCursor - Math.floor(visibleRows / 2));

    for (let vi = 0; vi < visibleRows && scrollTop + vi < totalLen; vi++) {
      const idx = scrollTop + vi;
      const y = 20 + vi * ROW_H;
      const isPlay = idx === playbackPos.position;
      const isCursor = idx === orderCursor;

      if (isPlay) {
        ctx.fillStyle = 'rgba(233, 69, 96, 0.15)';
        ctx.fillRect(0, y, width, ROW_H);
      }
      if (isCursor) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, y + 0.5, width - 1, ROW_H - 1);
      }

      // Index
      ctx.fillStyle = '#666';
      ctx.fillText(idx.toString(16).toUpperCase().padStart(2, '0'), 4, y + 2);

      // Pattern numbers per channel
      const colW = Math.floor((width - 30) / channelCount);
      for (let ch = 0; ch < channelCount; ch++) {
        const val = orderData[ch]?.[idx] ?? 0;
        const x = 30 + ch * colW;

        if (val === 0xFF) {
          ctx.fillStyle = '#e94560';
          ctx.fillText('EN', x, y + 2); // End marker
        } else if (val >= 0xD0 && val <= 0xDF) {
          ctx.fillStyle = '#ffcc00';
          ctx.fillText(`R${(val & 0x0F).toString(16).toUpperCase()}`, x, y + 2); // Repeat
        } else if (val >= 0x80) {
          ctx.fillStyle = '#ff8866';
          ctx.fillText(`T${(val & 0x7F).toString(16).toUpperCase().padStart(2, '0')}`, x, y + 2); // Transpose
        } else {
          ctx.fillStyle = '#60e060';
          ctx.fillText(val.toString(16).toUpperCase().padStart(2, '0'), x, y + 2);
        }
      }
    }
  }, [width, height, orderData, playbackPos.position, orderCursor, channelCount, visibleRows, totalLen]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y < 20) return;
    const scrollTop = Math.max(0, orderCursor - Math.floor(visibleRows / 2));
    const idx = scrollTop + Math.floor((y - 20) / ROW_H);
    if (idx < totalLen) setOrderCursor(idx);
  }, [orderCursor, visibleRows, totalLen, setOrderCursor]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width, height, borderBottom: '1px solid #333' }}
      onClick={handleClick}
    />
  );
};
