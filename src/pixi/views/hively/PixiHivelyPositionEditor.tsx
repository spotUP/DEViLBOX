/**
 * PixiHivelyPositionEditor - Editable position matrix (GL rendering).
 *
 * Simple grid: arrow keys move freely, type hex digits to enter values.
 * Each channel: track (2 hex) + sign + transpose (2 hex).
 * Cursor is per-digit. Typing writes and moves cursor right.
 */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { Container as ContainerType, Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import type { HivelyNativeData } from '@/types';
import { useFormatStore } from '@stores';

const ROW_HEIGHT    = 18;
const POS_COL_WIDTH = 32;
const CHAN_COL_WIDTH = 80;
const HEADER_HEIGHT = 20;
const VISIBLE_ROWS  = 7;
const FONT_SIZE     = 11;
const TEXT_Y        = 3;
const CHAR_PX       = 8; // mono char width in pixels

const HEX = '0123456789abcdef';
const DIGIT_COLS = 5; // per channel: track_hi, track_lo, sign, trans_hi, trans_lo

// Char offset within channel for each digit column
function digitCharX(d: number): number {
  // "XX +XX" → 0,1=track  2=space  3=sign  4,5=trans
  if (d <= 1) return d;
  if (d === 2) return 3;
  if (d === 3) return 4;
  return 5;
}

const HVL_BG         = 0x000000;
const HVL_HEADER_BG  = 0x111111;
const HVL_HIGHLIGHT  = 0x780000;
const HVL_BORDER     = 0x333333;
const HVL_COL_BORDER = 0x222222;
const HVL_DIM        = 0x808080;
const HVL_TEXT       = 0xffffff;
const HVL_CURSOR     = 0xffff88;
const HVL_TRANS_POS  = 0x88ff88;
const HVL_TRANS_NEG  = 0xff8888;

interface Props {
  width: number;
  height: number;
  nativeData: HivelyNativeData;
  currentPosition: number;
  onPositionChange?: (position: number) => void;
  onFocusTrackEditor?: () => void;
}

export const PixiHivelyPositionEditor: React.FC<Props> = ({
  width, height, nativeData, currentPosition,
  onPositionChange, onFocusTrackEditor,
}) => {
  const numCh  = nativeData.channels;
  const numPos = nativeData.positions.length;

  const [curCh,    setCurCh]    = useState(0);
  const [curDigit, setCurDigit] = useState(0);
  const [focused,  setFocused]  = useState(false);

  const setCell   = useFormatStore(s => s.setHivelyPositionCell);
  const insertPos = useFormatStore(s => s.insertHivelyPosition);
  const deletePos = useFormatStore(s => s.deleteHivelyPosition);

  const containerRef = useRef<ContainerType>(null);
  const focusedRef   = useRef(false);
  focusedRef.current = focused;

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const m = new Graphics();
    m.rect(0, 0, width, height).fill({ color: 0xffffff });
    c.mask = m;
    return () => { c.mask = null; m.destroy(); };
  }, [width, height]);

  const stateRef = useRef({ currentPosition, curCh, curDigit, numCh, numPos });
  stateRef.current = { currentPosition, curCh, curDigit, numCh, numPos };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!focusedRef.current) return;
      const { currentPosition: cp, curCh: cc, curDigit: cd, numCh: nc, numPos: np } = stateRef.current;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          onPositionChange?.(Math.max(0, cp - 1));
          return;
        case 'ArrowDown':
          e.preventDefault();
          onPositionChange?.(Math.min(np - 1, cp + 1));
          return;
        case 'ArrowRight':
          e.preventDefault();
          if (cd + 1 < DIGIT_COLS) setCurDigit(cd + 1);
          else if (cc < nc - 1) { setCurCh(cc + 1); setCurDigit(0); }
          return;
        case 'ArrowLeft':
          e.preventDefault();
          if (cd - 1 >= 0) setCurDigit(cd - 1);
          else if (cc > 0) { setCurCh(cc - 1); setCurDigit(DIGIT_COLS - 1); }
          return;
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) { if (cc > 0) { setCurCh(cc - 1); setCurDigit(0); } }
          else { if (cc < nc - 1) { setCurCh(cc + 1); setCurDigit(0); } }
          return;
        case 'Enter':
          e.preventDefault();
          onFocusTrackEditor?.();
          return;
        case 'Insert':
          e.preventDefault();
          insertPos(cp);
          return;
      }

      if (e.ctrlKey && e.key === 'Backspace') { e.preventDefault(); deletePos(cp); return; }

      const p = nativeData.positions[cp];
      if (!p) return;

      // Sign column
      if (cd === 2) {
        if (e.key === '+' || e.key === '=' || e.key === '-') {
          e.preventDefault();
          const cur = p.transpose[cc];
          setCell(cp, cc, 'transpose', e.key === '-' ? -Math.abs(cur || 1) : Math.abs(cur));
          return;
        }
      }

      // Hex digit
      const hi = HEX.indexOf(e.key.toLowerCase());
      if (hi < 0) return;
      e.preventDefault();

      if (cd <= 1) {
        const cur = p.track[cc] ?? 0;
        setCell(cp, cc, 'track', cd === 0 ? (hi << 4) | (cur & 0x0F) : (cur & 0xF0) | hi);
      } else if (cd >= 3) {
        const cur = p.transpose[cc] ?? 0;
        const sign = cur < 0 ? -1 : 1;
        const abs = Math.abs(cur);
        const ni = cd - 3;
        const newAbs = ni === 0 ? (hi << 4) | (abs & 0x0F) : (abs & 0xF0) | hi;
        setCell(cp, cc, 'transpose', sign * newAbs);
      }

      // Move right, skip sign
      const next = cd + 1;
      if (next < DIGIT_COLS) setCurDigit(next === 2 ? 3 : next);
      else if (cc < nc - 1) { setCurCh(cc + 1); setCurDigit(0); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onPositionChange, onFocusTrackEditor, nativeData, setCell, insertPos, deletePos]);

  const halfVis  = Math.floor(VISIBLE_ROWS / 2);
  const startPos = Math.max(0, currentPosition - halfVis);
  const endPos   = Math.min(numPos, startPos + VISIBLE_ROWS);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    setFocused(true);
    const c = containerRef.current;
    if (!c) return;
    const local = c.toLocal(e.global);
    if (local.y < HEADER_HEIGHT) return;
    const row = Math.floor((local.y - HEADER_HEIGHT) / ROW_HEIGHT);
    const pos = startPos + row;
    if (pos >= 0 && pos < numPos) onPositionChange?.(pos);
    if (local.x >= POS_COL_WIDTH) {
      const ch = Math.floor((local.x - POS_COL_WIDTH) / CHAN_COL_WIDTH);
      if (ch >= 0 && ch < numCh) {
        setCurCh(ch);
        const rel = local.x - (POS_COL_WIDTH + ch * CHAN_COL_WIDTH);
        const ci = Math.floor(rel / CHAR_PX);
        if (ci <= 1) setCurDigit(ci);
        else if (ci === 3) setCurDigit(2);
        else if (ci >= 4) setCurDigit(ci <= 4 ? 3 : 4);
        else setCurDigit(0);
      }
    }
  }, [startPos, numPos, numCh, onPositionChange]);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height).fill({ color: HVL_BG });
    g.rect(0, 0, width, HEADER_HEIGHT).fill({ color: HVL_HEADER_BG });
    g.rect(0, HEADER_HEIGHT - 1, width, 1).fill({ color: HVL_BORDER });

    for (let i = 0; i < endPos - startPos; i++) {
      const pos = startPos + i;
      const y = HEADER_HEIGHT + i * ROW_HEIGHT;
      if (pos === currentPosition) {
        g.rect(0, y, width, ROW_HEIGHT).fill({ color: HVL_HIGHLIGHT });
        // Per-digit cursor
        const cx = POS_COL_WIDTH + curCh * CHAN_COL_WIDTH + 6 + digitCharX(curDigit) * CHAR_PX;
        g.rect(cx, y, CHAR_PX, ROW_HEIGHT).fill({ color: HVL_CURSOR, alpha: 0.4 });
      }
    }

    for (let ch = 0; ch <= numCh; ch++) {
      const bx = POS_COL_WIDTH + ch * CHAN_COL_WIDTH;
      if (bx < width) g.rect(bx, 0, 1, height).fill({ color: HVL_COL_BORDER });
    }
  }, [width, height, startPos, endPos, currentPosition, curCh, curDigit, numCh]);

  const cellLabels = useMemo(() => {
    const labels: { x: number; y: number; text: string; color: number }[] = [];

    labels.push({ x: 4, y: TEXT_Y, text: 'Pos', color: HVL_DIM });
    for (let ch = 0; ch < numCh; ch++) {
      const chX = POS_COL_WIDTH + ch * CHAN_COL_WIDTH;
      if (chX >= width) break;
      labels.push({ x: chX + 4, y: TEXT_Y, text: `CH ${ch}`, color: HVL_DIM });
    }

    for (let i = 0; i < endPos - startPos; i++) {
      const pos = startPos + i;
      const y = HEADER_HEIGHT + i * ROW_HEIGHT + TEXT_Y;
      if (y + FONT_SIZE > height) break;
      const isCur = pos === currentPosition;
      const p = nativeData.positions[pos];

      labels.push({ x: 4, y, text: `${isCur ? '>' : ' '}${pos.toString().padStart(2, '0')}`, color: isCur ? HVL_CURSOR : HVL_DIM });
      if (!p) continue;

      for (let ch = 0; ch < numCh; ch++) {
        const chX = POS_COL_WIDTH + ch * CHAN_COL_WIDTH;
        if (chX >= width) break;
        const trk = p.track[ch] ?? 0;
        const tr = p.transpose[ch] ?? 0;
        const sign = tr >= 0 ? '+' : '-';
        const trAbs = Math.abs(tr).toString(16).toUpperCase().padStart(2, '0');

        labels.push({ x: chX + 6, y, text: trk.toString(16).toUpperCase().padStart(2, '0'), color: HVL_TEXT });
        labels.push({ x: chX + 6 + 3 * CHAR_PX, y, text: `${sign}${trAbs}`, color: tr === 0 ? HVL_DIM : (tr > 0 ? HVL_TRANS_POS : HVL_TRANS_NEG) });
      }
    }
    return labels;
  }, [nativeData, numCh, startPos, endPos, currentPosition, width, height]);

  return (
    <pixiContainer ref={containerRef} layout={{ width, height }} eventMode="static" onPointerDown={handlePointerDown}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
      {cellLabels.map((l, i) => (
        <pixiBitmapText key={i} text={l.text} style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }} tint={l.color} x={l.x} y={l.y} />
      ))}
    </pixiContainer>
  );
};
