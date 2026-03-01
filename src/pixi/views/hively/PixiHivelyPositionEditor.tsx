/**
 * PixiHivelyPositionEditor - Track Assignment + Transpose Editor
 * Pure Pixi GL rendering — no DOM elements.
 *
 * Layout:
 * ┌─────┬──────────┬──────────┬──────────┬──────────┐
 * │ Pos │  CH 0    │  CH 1    │  CH 2    │  CH 3    │
 * │     │ Trk  Trn │ Trk  Trn │ Trk  Trn │ Trk  Trn │
 * ├─────┼──────────┼──────────┼──────────┼──────────┤
 * │  00 │ 007  +00 │ 008  +00 │ 009  +03 │ 010  -05 │
 * │ >02 │ 015  +05 │ 016  +00 │ 017  -03 │ 018  +00 │
 * └─────┴──────────┴──────────┴──────────┴──────────┘
 */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { Container as ContainerType, Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import type { HivelyNativeData } from '@/types';

const ROW_HEIGHT    = 18;
const POS_COL_WIDTH = 32;
const CHAN_COL_WIDTH = 80;  // Track(3) + space + Transpose(3)
const HEADER_HEIGHT = 20;
const VISIBLE_ROWS  = 7;   // Show 7 rows centered on current
const FONT_SIZE     = 11;
const TEXT_Y        = 3;

// Sub-column offsets within each channel
const CH_TRACK_X = 6;
const CH_TRANS_X = CH_TRACK_X + 3 * 8 + 8;  // 38 (3 chars + gap)

// HivelyTracker palette (numeric)
const HVL_BG        = 0x000000;
const HVL_HEADER_BG = 0x111111;
const HVL_HIGHLIGHT = 0x780000;
const HVL_BORDER    = 0x333333;
const HVL_COL_BORDER = 0x222222;
const HVL_DIM       = 0x808080;
const HVL_TEXT      = 0xffffff;
const HVL_CURSOR    = 0xffff88;
const HVL_TRANS_POS = 0x88ff88;
const HVL_TRANS_NEG = 0xff8888;

function formatTranspose(val: number): string {
  if (val === 0) return '+00';
  if (val > 0) return `+${val.toString(16).toUpperCase().padStart(2, '0')}`;
  return `-${Math.abs(val).toString(16).toUpperCase().padStart(2, '0')}`;
}

interface PositionEditorProps {
  width: number;
  height: number;
  nativeData: HivelyNativeData;
  currentPosition: number;
  onPositionChange?: (position: number) => void;
  onFocusTrackEditor?: () => void;
}

export const PixiHivelyPositionEditor: React.FC<PositionEditorProps> = ({
  width, height, nativeData, currentPosition,
  onPositionChange, onFocusTrackEditor,
}) => {
  const numChannels  = nativeData.channels;
  const numPositions = nativeData.positions.length;

  const [cursorChan,  setCursorChan]  = useState(0);
  const [cursorField, setCursorField] = useState<'track' | 'transpose'>('track');
  const [focused,     setFocused]     = useState(false);

  const containerRef = useRef<ContainerType>(null);
  const focusedRef   = useRef(false);
  focusedRef.current = focused;

  // Clip content to component bounds
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const m = new Graphics();
    m.rect(0, 0, width, height).fill({ color: 0xffffff });
    c.mask = m;
    return () => { c.mask = null; m.destroy(); };
  }, [width, height]);

  // Keyboard navigation
  const stateRef = useRef({ currentPosition, cursorChan, cursorField, numChannels, numPositions });
  stateRef.current = { currentPosition, cursorChan, cursorField, numChannels, numPositions };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!focusedRef.current) return;
      const { currentPosition: cp, cursorChan: cc, cursorField: cf,
              numChannels: nc, numPositions: np } = stateRef.current;
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          onPositionChange?.(Math.max(0, cp - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          onPositionChange?.(Math.min(np - 1, cp + 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (cf === 'transpose') { setCursorField('track'); }
          else if (cc > 0)        { setCursorChan(c => c - 1); setCursorField('transpose'); }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (cf === 'track') { setCursorField('transpose'); }
          else if (cc < nc - 1) { setCursorChan(c => c + 1); setCursorField('track'); }
          break;
        case 'Tab':
          e.preventDefault();
          setCursorChan(c => e.shiftKey ? Math.max(0, c - 1) : Math.min(nc - 1, c + 1));
          break;
        case 'Enter':
          e.preventDefault();
          onFocusTrackEditor?.();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onPositionChange, onFocusTrackEditor]);

  // Window of VISIBLE_ROWS centered on currentPosition
  const halfVisible = Math.floor(VISIBLE_ROWS / 2);
  const startPos    = Math.max(0, currentPosition - halfVisible);
  const endPos      = Math.min(numPositions, startPos + VISIBLE_ROWS);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    setFocused(true);
    const c = containerRef.current;
    if (!c) return;
    const local = c.toLocal(e.global);
    if (local.y < HEADER_HEIGHT) return;
    const rowIdx = Math.floor((local.y - HEADER_HEIGHT) / ROW_HEIGHT);
    const pos = startPos + rowIdx;
    if (pos >= 0 && pos < numPositions) onPositionChange?.(pos);
    const lx = local.x;
    if (lx >= POS_COL_WIDTH) {
      const ch = Math.floor((lx - POS_COL_WIDTH) / CHAN_COL_WIDTH);
      if (ch >= 0 && ch < numChannels) {
        const rel = lx - (POS_COL_WIDTH + ch * CHAN_COL_WIDTH);
        setCursorChan(ch);
        setCursorField(rel < CH_TRANS_X ? 'track' : 'transpose');
      }
    }
  }, [startPos, numPositions, numChannels, onPositionChange]);

  // Draw all backgrounds, current position highlight, cursor, borders
  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height).fill({ color: HVL_BG });
    g.rect(0, 0, width, HEADER_HEIGHT).fill({ color: HVL_HEADER_BG });
    g.rect(0, HEADER_HEIGHT - 1, width, 1).fill({ color: HVL_BORDER });

    for (let i = 0; i < endPos - startPos; i++) {
      const pos = startPos + i;
      const y   = HEADER_HEIGHT + i * ROW_HEIGHT;
      if (pos === currentPosition) {
        g.rect(0, y, width, ROW_HEIGHT).fill({ color: HVL_HIGHLIGHT });
      }
    }

    // Cursor field highlight (only on current position row)
    const curRowIdx = currentPosition - startPos;
    if (curRowIdx >= 0 && curRowIdx < VISIBLE_ROWS) {
      const curY    = HEADER_HEIGHT + curRowIdx * ROW_HEIGHT;
      const chBaseX = POS_COL_WIDTH + cursorChan * CHAN_COL_WIDTH;
      const fx      = cursorField === 'track' ? CH_TRACK_X : CH_TRANS_X;
      const fw      = cursorField === 'track' ? 3 * 8 : 3 * 8;
      g.rect(chBaseX + fx, curY, fw, ROW_HEIGHT).fill({ color: HVL_CURSOR, alpha: 0.25 });
    }

    // Column borders
    for (let ch = 0; ch <= numChannels; ch++) {
      const bx = POS_COL_WIDTH + ch * CHAN_COL_WIDTH;
      if (bx < width) {
        g.rect(bx, 0, 1, height).fill({ color: HVL_COL_BORDER });
      }
    }
  }, [width, height, startPos, endPos, currentPosition, cursorChan, cursorField, numChannels]);

  // All text labels
  const cellLabels = useMemo(() => {
    const labels: { x: number; y: number; text: string; color: number }[] = [];

    // Header
    labels.push({ x: 4, y: TEXT_Y, text: 'Pos', color: HVL_DIM });
    for (let ch = 0; ch < numChannels; ch++) {
      const chX = POS_COL_WIDTH + ch * CHAN_COL_WIDTH;
      if (chX >= width) break;
      labels.push({ x: chX + 4, y: TEXT_Y, text: `CH ${ch}`, color: HVL_DIM });
    }

    // Position rows
    for (let i = 0; i < endPos - startPos; i++) {
      const pos = startPos + i;
      const y   = HEADER_HEIGHT + i * ROW_HEIGHT + TEXT_Y;
      if (y + FONT_SIZE > height) break;

      const isCurrent  = pos === currentPosition;
      const position   = nativeData.positions[pos];

      // Position number with '>' indicator
      labels.push({
        x: 4, y,
        text: `${isCurrent ? '>' : ' '}${pos.toString().padStart(2, '0')}`,
        color: isCurrent ? HVL_CURSOR : HVL_DIM,
      });

      if (!position) continue;
      for (let ch = 0; ch < numChannels; ch++) {
        const chX      = POS_COL_WIDTH + ch * CHAN_COL_WIDTH;
        if (chX >= width) break;
        const trackIdx = position.track[ch] ?? 0;
        const transpose = position.transpose[ch] ?? 0;

        labels.push({
          x: chX + CH_TRACK_X, y,
          text: trackIdx.toString().padStart(3, '0'),
          color: HVL_TEXT,
        });
        labels.push({
          x: chX + CH_TRANS_X, y,
          text: formatTranspose(transpose),
          color: transpose === 0 ? HVL_DIM : (transpose > 0 ? HVL_TRANS_POS : HVL_TRANS_NEG),
        });
      }
    }

    return labels;
  }, [nativeData, numChannels, startPos, endPos, currentPosition, width, height]);

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
