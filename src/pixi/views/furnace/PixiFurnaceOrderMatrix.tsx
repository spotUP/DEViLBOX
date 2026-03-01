/**
 * PixiFurnaceOrderMatrix - 2D Order Matrix Grid Editor
 * Pure Pixi GL rendering — no DOM elements.
 *
 * Layout:
 * ┌─────┬────────┬────────┬────────┬────────┐
 * │ Pos │  CH 0  │  CH 1  │  CH 2  │  CH 3  │
 * ├─────┼────────┼────────┼────────┼────────┤
 * │  00 │  [05]  │  [02]  │  [00]  │  [03]  │
 * └─────┴────────┴────────┴────────┴────────┘
 */
import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { Container as ContainerType, Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '@/pixi/theme';
import { PIXI_FONTS } from '@/pixi/fonts';
import { useTransportStore } from '@/stores/useTransportStore';
import type { FurnaceNativeData } from '@/types';

const ROW_HEIGHT    = 20;
const POS_COL_WIDTH = 36;
const CHAN_COL_WIDTH = 48;
const HEADER_HEIGHT = 22;
const FONT_SIZE     = 11;
const TEXT_Y        = 4; // top-padding within each row

interface OrderMatrixProps {
  width: number;
  height: number;
  nativeData: FurnaceNativeData;
  currentPosition: number;
  onPositionChange?: (position: number) => void;
  onOrderChange?: (channel: number, position: number, patternIndex: number) => void;
}

export const PixiFurnaceOrderMatrix: React.FC<OrderMatrixProps> = ({
  width, height, nativeData, currentPosition,
  onPositionChange, onOrderChange,
}) => {
  const theme = usePixiTheme();
  const isPlaying = useTransportStore(s => s.isPlaying);

  const sub         = nativeData.subsongs[nativeData.activeSubsong];
  const numChannels = sub?.channels.length ?? 0;
  const ordersLen   = sub?.ordersLen ?? 0;

  const [cursorPos,  setCursorPos]  = useState(0);
  const [cursorChan, setCursorChan] = useState(0);
  const [scrollTop,  setScrollTop]  = useState(0);
  const [focused,    setFocused]    = useState(false);
  const [editBuffer, setEditBuffer] = useState('');

  const containerRef  = useRef<ContainerType>(null);
  const scrollTopRef  = useRef(0);
  const focusedRef    = useRef(false);
  focusedRef.current  = focused;

  const visibleRows = Math.floor((height - HEADER_HEIGHT) / ROW_HEIGHT);
  const maxScroll   = Math.max(0, ordersLen * ROW_HEIGHT - visibleRows * ROW_HEIGHT);

  // Auto-scroll to keep cursor / playback row visible
  useEffect(() => {
    const targetRow = isPlaying ? currentPosition : cursorPos;
    const rowY = targetRow * ROW_HEIGHT;
    const s    = scrollTopRef.current;
    if (rowY < s || rowY >= s + visibleRows * ROW_HEIGHT) {
      const next = Math.max(0, Math.min(maxScroll, rowY - Math.floor(visibleRows / 2) * ROW_HEIGHT));
      scrollTopRef.current = next;
      setScrollTop(next);
    }
  }, [cursorPos, currentPosition, isPlaying, visibleRows, maxScroll]);

  // Wheel scroll — native canvas listener with bounds check
  const scrollStateRef = useRef({ maxScroll });
  scrollStateRef.current = { maxScroll };

  useEffect(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      const c = containerRef.current;
      if (!c) return;
      const b = c.getBounds();
      if (e.clientX < b.x || e.clientX > b.x + b.width || e.clientY < b.y || e.clientY > b.y + b.height) return;
      e.preventDefault();
      const next = Math.max(0, Math.min(scrollStateRef.current.maxScroll, scrollTopRef.current + e.deltaY));
      scrollTopRef.current = next;
      setScrollTop(next);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // Keyboard navigation — fresh state via ref pattern to avoid stale closures
  const stateRef = useRef({ cursorPos, cursorChan, editBuffer, ordersLen, numChannels });
  stateRef.current = { cursorPos, cursorChan, editBuffer, ordersLen, numChannels };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!focusedRef.current || !sub) return;
      const { cursorPos: cp, cursorChan: cc, editBuffer: eb, ordersLen: ol, numChannels: nc } = stateRef.current;
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setCursorPos(p => { const n = Math.max(0, p - 1); onPositionChange?.(n); return n; });
          break;
        case 'ArrowDown':
          e.preventDefault();
          setCursorPos(p => { const n = Math.min(ol - 1, p + 1); onPositionChange?.(n); return n; });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setCursorChan(c => Math.max(0, c - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setCursorChan(c => Math.min(nc - 1, c + 1));
          break;
        case 'Escape':
          e.preventDefault();
          setEditBuffer('');
          break;
        default:
          if (/^[0-9a-fA-F]$/.test(e.key)) {
            e.preventDefault();
            const newBuf = eb + e.key;
            if (newBuf.length >= 2) {
              onOrderChange?.(cc, cp, parseInt(newBuf, 16));
              setEditBuffer('');
              setCursorPos(p => Math.min(ol - 1, p + 1));
            } else {
              setEditBuffer(newBuf);
            }
          }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sub, onPositionChange, onOrderChange]);

  const startRow = Math.floor(scrollTop / ROW_HEIGHT);
  const endRow   = Math.min(ordersLen, startRow + visibleRows + 2);

  // Convert pointer event to local row/chan and update cursor
  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    setFocused(true);
    const c = containerRef.current;
    if (!c) return;
    const local = c.toLocal(e.global);
    if (local.y < HEADER_HEIGHT) return;
    const row = Math.floor((local.y - HEADER_HEIGHT + scrollTopRef.current) / ROW_HEIGHT);
    const col = local.x < POS_COL_WIDTH ? -1 : Math.floor((local.x - POS_COL_WIDTH) / CHAN_COL_WIDTH);
    if (row >= 0 && row < ordersLen) { setCursorPos(row); onPositionChange?.(row); }
    if (col >= 0 && col < numChannels) setCursorChan(col);
  }, [ordersLen, numChannels, onPositionChange]);

  // Draw all backgrounds, highlights and column borders
  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height).fill({ color: theme.bg.color });
    g.rect(0, 0, width, HEADER_HEIGHT).fill({ color: theme.bgSecondary.color });
    g.rect(0, HEADER_HEIGHT - 1, width, 1).fill({ color: theme.border.color });

    for (let row = startRow; row < endRow; row++) {
      const y = HEADER_HEIGHT + row * ROW_HEIGHT - scrollTop;
      if (y + ROW_HEIGHT <= HEADER_HEIGHT || y >= height) continue;
      if (row === currentPosition) {
        g.rect(0, y, width, ROW_HEIGHT).fill({ color: theme.trackerRowCurrent.color });
      } else if (row === cursorPos) {
        g.rect(0, y, width, ROW_HEIGHT).fill({ color: theme.trackerRowCursor.color, alpha: 0.3 });
      } else if (row % 2 === 1) {
        g.rect(0, y, width, ROW_HEIGHT).fill({ color: theme.trackerRowOdd.color });
      }
    }

    // Cursor cell highlight
    const cy = HEADER_HEIGHT + cursorPos * ROW_HEIGHT - scrollTop;
    if (cy + ROW_HEIGHT > HEADER_HEIGHT && cy < height) {
      g.rect(POS_COL_WIDTH + cursorChan * CHAN_COL_WIDTH, cy, CHAN_COL_WIDTH, ROW_HEIGHT)
        .fill({ color: theme.accent.color, alpha: 0.25 });
    }

    // Column borders
    for (let ch = 0; ch <= numChannels; ch++) {
      const x = POS_COL_WIDTH + ch * CHAN_COL_WIDTH;
      if (x > width) break;
      g.rect(x, 0, 1, height).fill({ color: theme.border.color, alpha: 0.2 });
    }
  }, [width, height, theme, scrollTop, startRow, endRow, currentPosition, cursorPos, cursorChan, numChannels]);

  // All text labels — positioned via x/y (not layout) to avoid Yoga BindingErrors
  const cellLabels = useMemo(() => {
    const labels: { x: number; y: number; text: string; color: number }[] = [];

    // Header
    labels.push({ x: 4, y: TEXT_Y, text: 'Pos', color: theme.textMuted.color });
    if (sub) {
      for (let ch = 0; ch < numChannels; ch++) {
        labels.push({
          x: POS_COL_WIDTH + ch * CHAN_COL_WIDTH + 4, y: TEXT_Y,
          text: sub.channels[ch]?.name?.substring(0, 5) || `CH${ch}`,
          color: theme.textSecondary.color,
        });
      }
    }

    // Content rows
    if (sub) {
      for (let row = startRow; row < endRow; row++) {
        const y = HEADER_HEIGHT + row * ROW_HEIGHT - scrollTop + TEXT_Y;
        if (y < HEADER_HEIGHT || y + FONT_SIZE > height) continue;
        labels.push({ x: 4, y, text: row.toString(16).toUpperCase().padStart(2, '0'), color: theme.textMuted.color });
        for (let ch = 0; ch < numChannels; ch++) {
          const patIdx = sub.orders[ch]?.[row] ?? 0;
          // Show edit buffer in cursor cell
          const text = (row === cursorPos && ch === cursorChan && editBuffer.length > 0)
            ? editBuffer.padEnd(2, '-')
            : patIdx.toString(16).toUpperCase().padStart(2, '0');
          labels.push({
            x: POS_COL_WIDTH + ch * CHAN_COL_WIDTH + 4, y,
            text, color: theme.cellNote.color,
          });
        }
      }
    }

    return labels;
  }, [sub, numChannels, startRow, endRow, scrollTop, height, theme, cursorPos, cursorChan, editBuffer]);

  return (
    <pixiContainer
      ref={containerRef}
      layout={{ width, height }}
      eventMode="static"
      onPointerDown={handlePointerDown}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
      {cellLabels.map((l, i) => (
        <pixiBitmapText
          key={i}
          text={l.text}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }}
          tint={l.color}
          x={l.x}
          y={l.y}
        />
      ))}
    </pixiContainer>
  );
};
