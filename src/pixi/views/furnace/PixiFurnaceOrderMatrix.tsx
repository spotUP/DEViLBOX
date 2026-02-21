/**
 * PixiFurnaceOrderMatrix - 2D Order Matrix Grid Editor
 *
 * Displays the Furnace per-channel order matrix:
 * Each cell shows which pattern index a channel plays at each position.
 * Supports hex editing, selection, and pattern assignment.
 *
 * Layout:
 * ┌─────┬────────┬────────┬────────┬────────┐
 * │ Pos │  CH 0  │  CH 1  │  CH 2  │  CH 3  │
 * ├─────┼────────┼────────┼────────┼────────┤
 * │  00 │  [05]  │  [02]  │  [00]  │  [03]  │
 * │  01 │  [05]  │  [03]  │  [01]  │  [03]  │
 * └─────┴────────┴────────┴────────┴────────┘
 */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { usePixiTheme } from '@/pixi/theme';
import { PIXI_FONTS } from '@/pixi/fonts';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useTransportStore } from '@/stores/useTransportStore';
import type { FurnaceNativeData } from '@/types';

// Layout constants
const ROW_HEIGHT = 20;
const POS_COL_WIDTH = 36;
const CHAN_COL_WIDTH = 48;
const HEADER_HEIGHT = 22;
const SCROLLBAR_WIDTH = 12;

interface OrderMatrixProps {
  width: number;
  height: number;
  nativeData: FurnaceNativeData;
  currentPosition: number;
  onPositionChange?: (position: number) => void;
  onOrderChange?: (channel: number, position: number, patternIndex: number) => void;
}

export const PixiFurnaceOrderMatrix: React.FC<OrderMatrixProps> = ({
  width,
  height,
  nativeData,
  currentPosition,
  onPositionChange,
  onOrderChange,
}) => {
  const theme = usePixiTheme();
  const isPlaying = useTransportStore(s => s.isPlaying);

  const sub = nativeData.subsongs[nativeData.activeSubsong];
  const numChannels = sub?.channels.length ?? 0;
  const ordersLen = sub?.ordersLen ?? 0;

  // Cursor state
  const [cursorPos, setCursorPos] = useState(0);
  const [cursorChan, setCursorChan] = useState(0);
  const [editingDigit, setEditingDigit] = useState(-1);
  const [editBuffer, setEditBuffer] = useState('');

  // Scroll state
  const scrollRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const contentHeight = ordersLen * ROW_HEIGHT;
  const visibleRows = Math.floor((height - HEADER_HEIGHT) / ROW_HEIGHT);

  // Keep current position visible
  useEffect(() => {
    if (isPlaying) {
      const scrollTop = scrollRef.current;
      const posY = currentPosition * ROW_HEIGHT;
      if (posY < scrollTop || posY >= scrollTop + visibleRows * ROW_HEIGHT) {
        const newScroll = Math.max(0, posY - Math.floor(visibleRows / 2) * ROW_HEIGHT);
        scrollRef.current = newScroll;
        if (containerRef.current) containerRef.current.scrollTop = newScroll;
      }
    }
  }, [currentPosition, isPlaying, visibleRows]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    scrollRef.current = (e.target as HTMLDivElement).scrollTop;
  }, []);

  const handleCellClick = useCallback((pos: number, chan: number) => {
    setCursorPos(pos);
    setCursorChan(chan);
    setEditingDigit(0);
    setEditBuffer('');
    onPositionChange?.(pos);
  }, [onPositionChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!sub) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setCursorPos(p => Math.max(0, p - 1));
        onPositionChange?.(Math.max(0, cursorPos - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setCursorPos(p => Math.min(ordersLen - 1, p + 1));
        onPositionChange?.(Math.min(ordersLen - 1, cursorPos + 1));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        setCursorChan(c => Math.max(0, c - 1));
        break;
      case 'ArrowRight':
        e.preventDefault();
        setCursorChan(c => Math.min(numChannels - 1, c + 1));
        break;
      default:
        // Hex digit input
        if (/^[0-9a-fA-F]$/.test(e.key) && editingDigit >= 0) {
          e.preventDefault();
          const newBuffer = editBuffer + e.key;
          if (newBuffer.length >= 2) {
            const val = parseInt(newBuffer, 16);
            onOrderChange?.(cursorChan, cursorPos, val);
            setEditingDigit(-1);
            setEditBuffer('');
            // Move down after edit
            setCursorPos(p => Math.min(ordersLen - 1, p + 1));
          } else {
            setEditBuffer(newBuffer);
          }
        }
        break;
    }
  }, [sub, ordersLen, numChannels, cursorPos, editingDigit, editBuffer, onPositionChange, onOrderChange, cursorChan]);

  // Compute visible range
  const startRow = Math.floor(scrollRef.current / ROW_HEIGHT);
  const endRow = Math.min(ordersLen, startRow + visibleRows + 1);

  const totalWidth = POS_COL_WIDTH + numChannels * CHAN_COL_WIDTH;

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
        overflow: 'auto',
        backgroundColor: `#${(theme.bg.color).toString(16).padStart(6, '0')}`,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        outline: 'none',
        userSelect: 'none',
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onScroll={handleScroll}
    >
      {/* Header row */}
      <div style={{
        display: 'flex',
        position: 'sticky',
        top: 0,
        zIndex: 1,
        backgroundColor: `#${(theme.bgSecondary.color).toString(16).padStart(6, '0')}`,
        borderBottom: `1px solid #${(theme.border.color).toString(16).padStart(6, '0')}`,
        height: HEADER_HEIGHT,
        lineHeight: `${HEADER_HEIGHT}px`,
      }}>
        <div style={{ width: POS_COL_WIDTH, textAlign: 'center', color: `#${(theme.textMuted.color).toString(16).padStart(6, '0')}` }}>
          Pos
        </div>
        {sub && Array.from({ length: numChannels }, (_, ch) => (
          <div key={ch} style={{
            width: CHAN_COL_WIDTH,
            textAlign: 'center',
            color: `#${(theme.textSecondary.color).toString(16).padStart(6, '0')}`,
            overflow: 'hidden',
          }}>
            {sub.channels[ch]?.name?.substring(0, 5) || `CH${ch}`}
          </div>
        ))}
      </div>

      {/* Scrollable content */}
      <div style={{ height: contentHeight, position: 'relative' }}>
        {sub && Array.from({ length: endRow - startRow }, (_, i) => {
          const pos = startRow + i;
          const isCurrent = pos === currentPosition;
          const isCursorRow = pos === cursorPos;

          return (
            <div
              key={pos}
              style={{
                display: 'flex',
                position: 'absolute',
                top: pos * ROW_HEIGHT,
                height: ROW_HEIGHT,
                width: totalWidth,
                lineHeight: `${ROW_HEIGHT}px`,
                backgroundColor: isCurrent
                  ? `#${(theme.trackerRowCurrent.color).toString(16).padStart(6, '0')}`
                  : isCursorRow
                    ? `#${(theme.trackerRowCursor.color).toString(16).padStart(6, '0')}40`
                    : pos % 2 === 0
                      ? 'transparent'
                      : `#${(theme.trackerRowOdd.color).toString(16).padStart(6, '0')}`,
              }}
            >
              {/* Position index */}
              <div style={{
                width: POS_COL_WIDTH,
                textAlign: 'center',
                color: `#${(theme.textMuted.color).toString(16).padStart(6, '0')}`,
              }}>
                {pos.toString(16).toUpperCase().padStart(2, '0')}
              </div>

              {/* Channel cells */}
              {Array.from({ length: numChannels }, (_, ch) => {
                const patIdx = sub.orders[ch]?.[pos] ?? 0;
                const isCursorCell = isCursorRow && ch === cursorChan;

                return (
                  <div
                    key={ch}
                    onClick={() => handleCellClick(pos, ch)}
                    style={{
                      width: CHAN_COL_WIDTH,
                      textAlign: 'center',
                      cursor: 'pointer',
                      color: `#${(theme.cellNote.color).toString(16).padStart(6, '0')}`,
                      backgroundColor: isCursorCell
                        ? `#${(theme.accent.color).toString(16).padStart(6, '0')}40`
                        : 'transparent',
                      borderLeft: `1px solid #${(theme.border.color).toString(16).padStart(6, '0')}20`,
                    }}
                  >
                    {patIdx.toString(16).toUpperCase().padStart(2, '0')}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
