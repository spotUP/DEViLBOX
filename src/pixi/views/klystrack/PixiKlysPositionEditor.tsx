/**
 * PixiKlysPositionEditor — Editable position/sequence matrix (GL rendering).
 *
 * Simple grid: arrow keys move freely, type decimal digits to edit pattern numbers.
 * +/- adjusts noteOffset. Each channel: "P" + pattern(3 decimal) + sign + offset(2 hex).
 * Cursor is per-digit. Typing writes and moves cursor right.
 */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { Container as ContainerType, Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import type { KlysNativeData } from '@/types';
import { useFormatStore } from '@stores';
import { usePixiTheme } from '@/pixi/theme';

const ROW_HEIGHT    = 18;
const POS_COL_WIDTH = 32;
const CHAN_COL_WIDTH = 80;
const HEADER_HEIGHT = 20;
const VISIBLE_ROWS  = 7;
const FONT_SIZE     = 11;
const TEXT_Y        = 3;
const CHAR_PX       = 8;

const HEX = '0123456789abcdef';
// Digit columns: 0=pat_hi, 1=pat_mid, 2=pat_lo, 3=sign, 4=offset_hi, 5=offset_lo
const DIGIT_COLS = 6;

// Char offset within channel for each digit column
// Layout: "P000+00" → P(0), pat digits(1,2,3), sign(4), offset digits(5,6)
function digitCharX(d: number): number {
  if (d <= 2) return d + 1;  // pattern digits after 'P'
  if (d === 3) return 4;     // sign
  if (d === 4) return 5;     // offset hi
  return 6;                  // offset lo
}

// Colors resolved from theme inside the component via useKtColors()

interface Props {
  width: number;
  height: number;
  nativeData: KlysNativeData;
  currentPosition: number;
  onPositionChange?: (position: number) => void;
  onFocusPatternEditor?: () => void;
}

export const PixiKlysPositionEditor: React.FC<Props> = ({
  width, height, nativeData, currentPosition,
  onPositionChange, onFocusPatternEditor,
}) => {
  const theme = usePixiTheme();
  const KT_BG = theme.bg.color;
  const KT_HEADER_BG = theme.bgSecondary.color;
  const KT_HIGHLIGHT = theme.trackerRowCurrent.color;
  const KT_BORDER = theme.border.color;
  const KT_COL_BORDER = theme.border.color;
  const KT_DIM = theme.textMuted.color;
  const KT_TEXT = theme.text.color;
  const KT_CURSOR = theme.accent.color;
  const KT_TRANS_POS = theme.success.color;
  const KT_TRANS_NEG = theme.error.color;

  const numCh  = nativeData.channels;
  const numPos = nativeData.songLength;

  const [curCh,    setCurCh]    = useState(0);
  const [curDigit, setCurDigit] = useState(0);
  const [focused,  setFocused]  = useState(false);

  const setEntry   = useFormatStore(s => s.setKlysSequenceEntry);
  const insertPos  = useFormatStore(s => s.insertKlysSequenceEntry);
  const deletePos  = useFormatStore(s => s.deleteKlysSequenceEntry);

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
          onFocusPatternEditor?.();
          return;
        case 'Insert':
          e.preventDefault();
          insertPos(cp);
          return;
      }

      if (e.ctrlKey && e.key === 'Backspace') { e.preventDefault(); deletePos(cp); return; }

      // Find entry at current position for the active channel
      const seq = nativeData.sequences[cc];
      const entry = seq?.entries.find(en => en.position === cp);

      // Sign column
      if (cd === 3) {
        if (e.key === '+' || e.key === '=' || e.key === '-') {
          e.preventDefault();
          const cur = entry?.noteOffset ?? 0;
          setEntry(cc, cp, 'noteOffset', e.key === '-' ? -Math.abs(cur || 1) : Math.abs(cur));
          return;
        }
      }

      // Pattern digits (decimal 0-9)
      if (cd <= 2) {
        const digit = parseInt(e.key, 10);
        if (isNaN(digit)) return;
        e.preventDefault();
        const cur = entry?.pattern ?? 0;
        const hundreds = Math.floor(cur / 100);
        const tens = Math.floor((cur % 100) / 10);
        const ones = cur % 10;
        let newVal: number;
        if (cd === 0) newVal = digit * 100 + tens * 10 + ones;
        else if (cd === 1) newVal = hundreds * 100 + digit * 10 + ones;
        else newVal = hundreds * 100 + tens * 10 + digit;
        setEntry(cc, cp, 'pattern', newVal);
      } else if (cd >= 4) {
        // Offset digits (hex)
        const hi = HEX.indexOf(e.key.toLowerCase());
        if (hi < 0) return;
        e.preventDefault();
        const cur = entry?.noteOffset ?? 0;
        const sign = cur < 0 ? -1 : 1;
        const abs = Math.abs(cur);
        const hiNib = Math.floor(abs / 16);
        const loNib = abs % 16;
        const newAbs = cd === 4 ? (hi * 16 + loNib) : (hiNib * 16 + hi);
        setEntry(cc, cp, 'noteOffset', sign * newAbs);
      }

      // Move right, skip sign
      if (cd <= 2 || cd >= 4) {
        const next = cd + 1;
        if (next < DIGIT_COLS) setCurDigit(next === 3 ? 4 : next);
        else if (cc < nc - 1) { setCurCh(cc + 1); setCurDigit(0); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onPositionChange, onFocusPatternEditor, nativeData, setEntry, insertPos, deletePos]);

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
        // Map: 0=P, 1-3=pat digits, 4=sign, 5-6=offset digits
        if (ci >= 1 && ci <= 3) setCurDigit(ci - 1);
        else if (ci === 4) setCurDigit(3);
        else if (ci >= 5) setCurDigit(ci <= 5 ? 4 : 5);
        else setCurDigit(0);
      }
    }
  }, [startPos, numPos, numCh, onPositionChange]);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height).fill({ color: KT_BG });
    g.rect(0, 0, width, HEADER_HEIGHT).fill({ color: KT_HEADER_BG });
    g.rect(0, HEADER_HEIGHT - 1, width, 1).fill({ color: KT_BORDER });

    for (let i = 0; i < endPos - startPos; i++) {
      const pos = startPos + i;
      const y = HEADER_HEIGHT + i * ROW_HEIGHT;
      if (pos === currentPosition) {
        g.rect(0, y, width, ROW_HEIGHT).fill({ color: KT_HIGHLIGHT });
        // Per-digit cursor
        const cx = POS_COL_WIDTH + curCh * CHAN_COL_WIDTH + 6 + digitCharX(curDigit) * CHAR_PX;
        g.rect(cx, y, CHAR_PX, ROW_HEIGHT).fill({ color: KT_CURSOR, alpha: 0.4 });
      }
    }

    for (let ch = 0; ch <= numCh; ch++) {
      const bx = POS_COL_WIDTH + ch * CHAN_COL_WIDTH;
      if (bx < width) g.rect(bx, 0, 1, height).fill({ color: KT_COL_BORDER });
    }
  }, [width, height, startPos, endPos, currentPosition, curCh, curDigit, numCh]);

  const cellLabels = useMemo(() => {
    const labels: { x: number; y: number; text: string; color: number }[] = [];

    labels.push({ x: 4, y: TEXT_Y, text: 'Pos', color: KT_DIM });
    for (let ch = 0; ch < numCh; ch++) {
      const chX = POS_COL_WIDTH + ch * CHAN_COL_WIDTH;
      if (chX >= width) break;
      labels.push({ x: chX + 4, y: TEXT_Y, text: `CH ${ch + 1}`, color: KT_DIM });
    }

    for (let i = 0; i < endPos - startPos; i++) {
      const pos = startPos + i;
      const y = HEADER_HEIGHT + i * ROW_HEIGHT + TEXT_Y;
      if (y + FONT_SIZE > height) break;
      const isCur = pos === currentPosition;

      labels.push({ x: 4, y, text: `${isCur ? '>' : ' '}${pos.toString().padStart(2, '0')}`, color: isCur ? KT_CURSOR : KT_DIM });

      for (let ch = 0; ch < numCh; ch++) {
        const chX = POS_COL_WIDTH + ch * CHAN_COL_WIDTH;
        if (chX >= width) break;
        const seq = nativeData.sequences[ch];
        if (!seq) continue;
        const entry = seq.entries.find(e => e.position === pos);
        if (!entry) {
          labels.push({ x: chX + 6, y, text: '---', color: KT_DIM });
          continue;
        }

        // Pattern number
        labels.push({ x: chX + 6, y, text: `P${entry.pattern.toString().padStart(3, '0')}`, color: KT_TEXT });

        // Note offset
        const offset = entry.noteOffset;
        const sign = offset >= 0 ? '+' : '-';
        const offAbs = Math.abs(offset).toString(16).toUpperCase().padStart(2, '0');
        labels.push({
          x: chX + 6 + 4 * CHAR_PX, y,
          text: `${sign}${offAbs}`,
          color: offset === 0 ? KT_DIM : (offset > 0 ? KT_TRANS_POS : KT_TRANS_NEG),
        });
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
