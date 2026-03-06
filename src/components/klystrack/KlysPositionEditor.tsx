/**
 * KlysPositionEditor — Sequence/position table for klystrack.
 *
 * Shows pattern assignments per channel at each sequence entry.
 * Highlights the current playback/edit position.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { KlysNativeData } from '@/types/tracker';

const CHAR_W = 8;
const CHAR_H = 14;
const ROW_H = CHAR_H + 2;
const HEADER_H = ROW_H + 4;
const POS_NUM_W = CHAR_W * 4 + 4;
const CH_W = CHAR_W * 7 + 4;      // "P000+00"

const COLORS = {
  bg: '#0d0d0d',
  headerBg: '#1a1a1a',
  headerText: '#888',
  posNum: '#555',
  pattern: '#e0e0e0',
  transpose: '#ffaa55',
  currentRow: 'rgba(255, 255, 136, 0.15)',
  channelSep: '#222',
};

interface KlysPositionEditorProps {
  width: number;
  height: number;
  nativeData: KlysNativeData;
  currentPosition: number;
  onPositionChange: (pos: number) => void;
}

export const KlysPositionEditor: React.FC<KlysPositionEditorProps> = ({
  width, height, nativeData, currentPosition, onPositionChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const numChannels = nativeData.channels;
  const numPositions = nativeData.songLength;
  const visibleRows = Math.floor((height - HEADER_H) / ROW_H);

  const scrollPos = Math.max(0, Math.min(
    currentPosition - Math.floor(visibleRows / 2),
    numPositions - visibleRows
  ));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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
    for (let ch = 0; ch < numChannels; ch++) {
      const x = POS_NUM_W + ch * CH_W;
      ctx.fillText(`CH${(ch + 1).toString().padStart(2, '0')}`, x, 4);
    }

    // Rows — each position maps to per-channel sequence entries
    for (let vi = 0; vi < visibleRows; vi++) {
      const pos = scrollPos + vi;
      if (pos >= numPositions) break;
      const y = HEADER_H + vi * ROW_H;
      const isCurrent = pos === currentPosition;

      if (isCurrent) {
        ctx.fillStyle = COLORS.currentRow;
        ctx.fillRect(0, y, width, ROW_H);
      }

      ctx.fillStyle = isCurrent ? '#ffff88' : COLORS.posNum;
      ctx.fillText(pos.toString().padStart(3, '0'), 2, y + 1);

      // Separator lines
      for (let ch = 1; ch < numChannels; ch++) {
        const x = POS_NUM_W + ch * CH_W - 2;
        ctx.strokeStyle = COLORS.channelSep;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + ROW_H);
        ctx.stroke();
      }

      // Per-channel: find the sequence entry at this position
      for (let ch = 0; ch < numChannels; ch++) {
        const x = POS_NUM_W + ch * CH_W;
        const seq = nativeData.sequences[ch];
        if (!seq) continue;
        const entry = seq.entries.find(e => e.position === pos);
        if (!entry) {
          ctx.fillStyle = COLORS.posNum;
          ctx.fillText('---', x, y + 1);
          continue;
        }

        ctx.fillStyle = COLORS.pattern;
        ctx.fillText(`P${entry.pattern.toString().padStart(3, '0')}`, x, y + 1);

        if (entry.noteOffset !== 0) {
          ctx.fillStyle = COLORS.transpose;
          const trStr = entry.noteOffset > 0
            ? `+${entry.noteOffset.toString().padStart(2, '0')}`
            : `${entry.noteOffset.toString().padStart(3, '0')}`;
          ctx.fillText(trStr, x + CHAR_W * 4, y + 1);
        }
      }
    }
  }, [width, height, nativeData, currentPosition, numPositions, numChannels, scrollPos, visibleRows]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y < HEADER_H) return;
    const pos = scrollPos + Math.floor((y - HEADER_H) / ROW_H);
    if (pos >= 0 && pos < numPositions) onPositionChange(pos);
  }, [scrollPos, numPositions, onPositionChange]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width, height, outline: 'none', cursor: 'pointer' }}
      tabIndex={0}
      onClick={handleClick}
    />
  );
};
