/**
 * KlysPositionEditor — Editable sequence/position table for klystrack.
 * Uses SequenceMatrixEditor for shared chrome/canvas/collapse.
 *
 * Each channel has: "P" + pattern(3 digits) + noteOffset sign + noteOffset(2 hex digits).
 * Cursor is per-digit. Type digits to edit pattern numbers, hex for offset.
 */

import React, { useState, useCallback } from 'react';
import type { KlysNativeData } from '@/types/tracker';
import { useFormatStore } from '@stores';
import {
  SequenceMatrixEditor, MATRIX_CHAR_W, MATRIX_ROW_H, MATRIX_HEADER_H,
  MATRIX_HEIGHT, MATRIX_COLLAPSED_HEIGHT,
  type MatrixRenderContext,
} from '../shared/SequenceMatrixEditor';

export const KLYS_MATRIX_HEIGHT = MATRIX_HEIGHT;
export const KLYS_MATRIX_COLLAPSED_HEIGHT = MATRIX_COLLAPSED_HEIGHT;

const POS_NUM_W = MATRIX_CHAR_W * 4 + 4;
const CH_W = MATRIX_CHAR_W * 8 + 4;      // "P000+00 " = 8 chars

const HEX = '0123456789abcdef';

// Digit columns within a channel:
// 0=pat_hi (hundreds), 1=pat_mid (tens), 2=pat_lo (ones), 3=sign, 4=offset_hi, 5=offset_lo
const DIGIT_COLS = 6;

const COLORS = {
  pattern: '#e0e0e0',
  transPos: '#88ff88',
  transNeg: '#ff8888',
  transDim: '#808080',
  currentRow: 'rgba(120, 0, 0, 0.6)',
  cursor: 'rgba(255, 255, 136, 0.4)',
  channelSep: '#222',
};

// Map digit column to char offset within the channel cell
// Layout: "P000+00" → P=prefix, 0,1,2=pattern digits, 3=sign char, 4,5=offset digits
function digitCharX(d: number): number {
  if (d <= 2) return d + 1;  // pattern digits (after 'P')
  if (d === 3) return 4;     // sign
  if (d === 4) return 5;     // offset hi
  return 6;                  // offset lo
}

interface KlysPositionEditorProps {
  width: number;
  height: number;
  nativeData: KlysNativeData;
  currentPosition: number;
  onPositionChange: (pos: number) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const KlysPositionEditor: React.FC<KlysPositionEditorProps> = ({
  width, height, nativeData, currentPosition, onPositionChange,
  collapsed, onToggleCollapse,
}) => {
  const numChannels = nativeData.channels;
  const numPositions = nativeData.songLength;

  const [curCh, setCurCh] = useState(0);
  const [curDigit, setCurDigit] = useState(0);

  const setEntry = useFormatStore(s => s.setKlysSequenceEntry);
  const insertPos = useFormatStore(s => s.insertKlysSequenceEntry);
  const deletePos = useFormatStore(s => s.deleteKlysSequenceEntry);

  // ── Render callback ────────────────────────────────────────────────────────

  const onRender = useCallback((rc: MatrixRenderContext) => {
    const { ctx, width: w, theme, visibleRows, scrollOffset } = rc;

    // Header
    ctx.fillStyle = theme.bgHighlight;
    ctx.fillRect(0, 0, w, MATRIX_HEADER_H);
    ctx.fillStyle = theme.textMuted;
    ctx.fillText('POS', 2, MATRIX_HEADER_H / 2);
    for (let ch = 0; ch < numChannels; ch++) {
      ctx.fillText(`CH${(ch + 1).toString().padStart(2, '0')}`, POS_NUM_W + ch * CH_W, MATRIX_HEADER_H / 2);
    }

    // Rows
    const dataY0 = MATRIX_HEADER_H;
    for (let vi = 0; vi < visibleRows; vi++) {
      const pos = scrollOffset + vi;
      if (pos >= numPositions) break;
      const y = dataY0 + vi * MATRIX_ROW_H;
      const isCurrent = pos === currentPosition;

      if (isCurrent) {
        ctx.fillStyle = COLORS.currentRow;
        ctx.fillRect(0, y, w, MATRIX_ROW_H);

        const cx = POS_NUM_W + curCh * CH_W + digitCharX(curDigit) * MATRIX_CHAR_W;
        ctx.fillStyle = COLORS.cursor;
        ctx.fillRect(cx, y, MATRIX_CHAR_W, MATRIX_ROW_H);
      }

      ctx.fillStyle = isCurrent ? '#ffff88' : theme.textMuted;
      ctx.fillText(pos.toString().padStart(3, '0'), 2, y + MATRIX_ROW_H / 2);

      for (let ch = 1; ch < numChannels; ch++) {
        const x = POS_NUM_W + ch * CH_W - 2;
        ctx.strokeStyle = COLORS.channelSep;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + MATRIX_ROW_H);
        ctx.stroke();
      }

      for (let ch = 0; ch < numChannels; ch++) {
        const x = POS_NUM_W + ch * CH_W;
        const seq = nativeData.sequences[ch];
        if (!seq) continue;
        const entry = seq.entries.find(e => e.position === pos);
        if (!entry) {
          ctx.fillStyle = theme.textMuted;
          ctx.fillText('---', x, y + MATRIX_ROW_H / 2);
          continue;
        }

        ctx.fillStyle = COLORS.pattern;
        ctx.fillText(`P${entry.pattern.toString().padStart(3, '0')}`, x, y + MATRIX_ROW_H / 2);

        const offset = entry.noteOffset;
        const sign = offset >= 0 ? '+' : '-';
        const offAbs = Math.abs(offset).toString().padStart(2, '0');
        ctx.fillStyle = offset === 0 ? COLORS.transDim : (offset > 0 ? COLORS.transPos : COLORS.transNeg);
        ctx.fillText(`${sign}${offAbs}`, x + MATRIX_CHAR_W * 4, y + MATRIX_ROW_H / 2);
      }
    }
  }, [nativeData, currentPosition, numPositions, numChannels, curCh, curDigit]);

  // ── Click handler ──────────────────────────────────────────────────────────

  const onClick = useCallback((x: number, y: number, rc: MatrixRenderContext) => {
    const pos = rc.scrollOffset + Math.floor(y / MATRIX_ROW_H);
    if (pos >= 0 && pos < numPositions) onPositionChange(pos);

    if (x >= POS_NUM_W) {
      const ch = Math.floor((x - POS_NUM_W) / CH_W);
      if (ch >= 0 && ch < numChannels) {
        setCurCh(ch);
        const rel = x - (POS_NUM_W + ch * CH_W);
        const charIdx = Math.floor(rel / MATRIX_CHAR_W);
        // Layout: "P000+00" → char 0=P, 1-3=pattern, 4=sign, 5-6=offset
        if (charIdx >= 1 && charIdx <= 3) setCurDigit(charIdx - 1);
        else if (charIdx === 4) setCurDigit(3);
        else if (charIdx >= 5) setCurDigit(charIdx <= 5 ? 4 : 5);
        else setCurDigit(0);
      }
    }
  }, [numPositions, numChannels, onPositionChange]);

  // ── Keyboard handler ───────────────────────────────────────────────────────

  const onKeyDown = useCallback((e: React.KeyboardEvent, _rc: MatrixRenderContext): boolean => {
    const { key } = e;

    if (key === 'ArrowUp') { onPositionChange(Math.max(0, currentPosition - 1)); return true; }
    if (key === 'ArrowDown') { onPositionChange(Math.min(numPositions - 1, currentPosition + 1)); return true; }
    if (key === 'ArrowRight') {
      const next = curDigit + 1;
      if (next < DIGIT_COLS) setCurDigit(next);
      else if (curCh < numChannels - 1) { setCurCh(c => c + 1); setCurDigit(0); }
      return true;
    }
    if (key === 'ArrowLeft') {
      const prev = curDigit - 1;
      if (prev >= 0) setCurDigit(prev);
      else if (curCh > 0) { setCurCh(c => c - 1); setCurDigit(DIGIT_COLS - 1); }
      return true;
    }
    if (key === 'Tab') {
      if (e.shiftKey) {
        if (curCh > 0) { setCurCh(c => c - 1); setCurDigit(0); }
      } else {
        if (curCh < numChannels - 1) { setCurCh(c => c + 1); setCurDigit(0); }
      }
      return true;
    }

    if (key === 'Insert') { insertPos(currentPosition); return true; }
    if (e.ctrlKey && key === 'Backspace') { deletePos(currentPosition); return true; }

    const seq = nativeData.sequences[curCh];
    if (!seq) return false;
    const entry = seq.entries.find(en => en.position === currentPosition);

    // Sign column: +/- toggles
    if (curDigit === 3) {
      if (key === '+' || key === '=' || key === '-') {
        const cur = entry?.noteOffset ?? 0;
        if (key === '-') {
          setEntry(curCh, currentPosition, 'noteOffset', -Math.abs(cur || 1));
        } else {
          setEntry(curCh, currentPosition, 'noteOffset', Math.abs(cur));
        }
        return true;
      }
    }

    // Decimal digit entry for pattern (digits 0-2)
    if (curDigit <= 2) {
      const digit = parseInt(key, 10);
      if (isNaN(digit)) return false;
      const cur = entry?.pattern ?? 0;
      const hundreds = Math.floor(cur / 100);
      const tens = Math.floor((cur % 100) / 10);
      const ones = cur % 10;
      let newVal: number;
      if (curDigit === 0) newVal = digit * 100 + tens * 10 + ones;
      else if (curDigit === 1) newVal = hundreds * 100 + digit * 10 + ones;
      else newVal = hundreds * 100 + tens * 10 + digit;
      setEntry(curCh, currentPosition, 'pattern', newVal);
    } else if (curDigit >= 4) {
      // Hex digit entry for noteOffset (digits 4-5)
      const hexIdx = HEX.indexOf(key.toLowerCase());
      if (hexIdx < 0) return false;
      const cur = entry?.noteOffset ?? 0;
      const sign = cur < 0 ? -1 : 1;
      const abs = Math.abs(cur);
      const hi = Math.floor(abs / 16);
      const lo = abs % 16;
      const newAbs = curDigit === 4
        ? (hexIdx * 16 + lo)
        : (hi * 16 + hexIdx);
      setEntry(curCh, currentPosition, 'noteOffset', sign * newAbs);
    } else {
      return false;
    }

    // Move cursor right after typing, skip sign
    const next = curDigit + 1;
    if (next < DIGIT_COLS) {
      setCurDigit(next === 3 ? 4 : next);
    } else if (curCh < numChannels - 1) {
      setCurCh(c => c + 1);
      setCurDigit(0);
    }
    return true;
  }, [currentPosition, numPositions, numChannels, curCh, curDigit, onPositionChange, setEntry, insertPos, deletePos, nativeData]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SequenceMatrixEditor
      label="SEQUENCE"
      width={width}
      height={height}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      totalRows={numPositions}
      activeRow={currentPosition}
      onRender={onRender}
      onClick={onClick}
      onKeyDown={onKeyDown}
      renderDeps={[nativeData, currentPosition, numPositions, numChannels, curCh, curDigit]}
    />
  );
};
