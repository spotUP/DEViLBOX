/**
 * KlysPositionEditor — Editable sequence/position table for klystrack.
 *
 * Shows pattern assignments per channel at each sequence entry.
 * Cursor is per-digit. Type hex digits to edit pattern numbers.
 * +/- adjusts noteOffset. Arrow keys navigate, Tab jumps channels.
 *
 * Each channel has: "P" + pattern(3 hex digits) + noteOffset sign + noteOffset(2 hex digits)
 * Digit columns: 0=pat_hi, 1=pat_mid, 2=pat_lo, 3=sign, 4=offset_hi, 5=offset_lo
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { KlysNativeData } from '@/types/tracker';
import { useFormatStore } from '@stores';

const CHAR_W = 10;
const CHAR_H = 14;
const ROW_H = 20;
const HEADER_H = 24;
const POS_NUM_W = CHAR_W * 4 + 4;
const CH_W = CHAR_W * 8 + 4;      // "P000+00 " = 8 chars

export const KLYS_MATRIX_HEIGHT = 200;
export const KLYS_MATRIX_COLLAPSED_HEIGHT = 28;

const HEX = '0123456789abcdef';

// Digit columns within a channel:
// 0=pat_hi (hundreds), 1=pat_mid (tens), 2=pat_lo (ones), 3=sign, 4=offset_hi, 5=offset_lo
const DIGIT_COLS = 6;

const COLORS = {
  bg: '#0d0d0d',
  headerBg: 'var(--color-bg-tertiary)',
  headerText: '#888',
  posNum: '#555',
  pattern: '#e0e0e0',
  transpose: '#ffaa55',
  transPos: '#88ff88',
  transNeg: '#ff8888',
  transDim: '#808080',
  currentRow: 'rgba(120, 0, 0, 0.6)',
  cursor: 'rgba(255, 255, 136, 0.4)',
  channelSep: 'var(--color-border)',
};

interface KlysPositionEditorProps {
  width: number;
  height: number;
  nativeData: KlysNativeData;
  currentPosition: number;
  onPositionChange: (pos: number) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

// Map digit column to char offset within the channel cell
// Layout: "P000+00" → P=prefix, 0,1,2=pattern digits, 3=sign char, 4,5=offset digits
function digitCharX(d: number): number {
  if (d <= 2) return d + 1;  // pattern digits (after 'P')
  if (d === 3) return 4;     // sign
  if (d === 4) return 5;     // offset hi
  return 6;                  // offset lo
}

export const KlysPositionEditor: React.FC<KlysPositionEditorProps> = ({
  width, height, nativeData, currentPosition, onPositionChange,
  collapsed, onToggleCollapse,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const numChannels = nativeData.channels;
  const numPositions = nativeData.songLength;
  const canvasH = height - KLYS_MATRIX_COLLAPSED_HEIGHT;
  const visibleRows = Math.floor((canvasH - HEADER_H) / ROW_H);

  // Cursor: channel + digit column within channel
  const [curCh, setCurCh] = useState(0);
  const [curDigit, setCurDigit] = useState(0);

  const setEntry = useFormatStore(s => s.setKlysSequenceEntry);
  const insertPos = useFormatStore(s => s.insertKlysSequenceEntry);
  const deletePos = useFormatStore(s => s.deleteKlysSequenceEntry);

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
    canvas.height = canvasH * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, canvasH);
    ctx.font = `${CHAR_H}px "JetBrains Mono", "Fira Code", monospace`;
    ctx.textBaseline = 'middle';

    // Header
    ctx.fillStyle = COLORS.headerBg;
    ctx.fillRect(0, 0, width, HEADER_H);
    ctx.fillStyle = COLORS.headerText;
    ctx.fillText('POS', 2, HEADER_H / 2);
    for (let ch = 0; ch < numChannels; ch++) {
      const x = POS_NUM_W + ch * CH_W;
      ctx.fillText(`CH${(ch + 1).toString().padStart(2, '0')}`, x, HEADER_H / 2);
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

        // Cursor highlight on active digit
        const cx = POS_NUM_W + curCh * CH_W + digitCharX(curDigit) * CHAR_W;
        ctx.fillStyle = COLORS.cursor;
        ctx.fillRect(cx, y, CHAR_W, ROW_H);
      }

      ctx.fillStyle = isCurrent ? '#ffff88' : COLORS.posNum;
      ctx.fillText(pos.toString().padStart(3, '0'), 2, y + ROW_H / 2);

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
          ctx.fillText('---', x, y + ROW_H / 2);
          continue;
        }

        ctx.fillStyle = COLORS.pattern;
        ctx.fillText(`P${entry.pattern.toString().padStart(3, '0')}`, x, y + ROW_H / 2);

        const offset = entry.noteOffset;
        const sign = offset >= 0 ? '+' : '-';
        const offAbs = Math.abs(offset).toString().padStart(2, '0');
        ctx.fillStyle = offset === 0 ? COLORS.transDim : (offset > 0 ? COLORS.transPos : COLORS.transNeg);
        ctx.fillText(`${sign}${offAbs}`, x + CHAR_W * 4, y + ROW_H / 2);
      }
    }
  }, [width, height, canvasH, nativeData, currentPosition, numPositions, numChannels, scrollPos, visibleRows, curCh, curDigit]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    canvasRef.current?.focus();
    const rect = canvasRef.current!.getBoundingClientRect();
    const my = e.clientY - rect.top;
    const mx = e.clientX - rect.left;
    if (my < HEADER_H) return;
    const pos = scrollPos + Math.floor((my - HEADER_H) / ROW_H);
    if (pos >= 0 && pos < numPositions) onPositionChange(pos);

    if (mx >= POS_NUM_W) {
      const ch = Math.floor((mx - POS_NUM_W) / CH_W);
      if (ch >= 0 && ch < numChannels) {
        setCurCh(ch);
        const rel = mx - (POS_NUM_W + ch * CH_W);
        const charIdx = Math.floor(rel / CHAR_W);
        // Map click char position to digit column
        // Layout: "P000+00" → char 0=P, 1-3=pattern, 4=sign, 5-6=offset
        if (charIdx >= 1 && charIdx <= 3) setCurDigit(charIdx - 1); // pattern digits
        else if (charIdx === 4) setCurDigit(3);                      // sign
        else if (charIdx >= 5) setCurDigit(charIdx <= 5 ? 4 : 5);   // offset digits
        else setCurDigit(0);
      }
    }
  }, [scrollPos, numPositions, numChannels, onPositionChange]);

  // Keyboard
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { key } = e;

    // Navigation
    if (key === 'ArrowUp') {
      e.preventDefault();
      onPositionChange(Math.max(0, currentPosition - 1));
      return;
    }
    if (key === 'ArrowDown') {
      e.preventDefault();
      onPositionChange(Math.min(numPositions - 1, currentPosition + 1));
      return;
    }
    if (key === 'ArrowRight') {
      e.preventDefault();
      const next = curDigit + 1;
      if (next < DIGIT_COLS) {
        setCurDigit(next);
      } else if (curCh < numChannels - 1) {
        setCurCh(c => c + 1);
        setCurDigit(0);
      }
      return;
    }
    if (key === 'ArrowLeft') {
      e.preventDefault();
      const prev = curDigit - 1;
      if (prev >= 0) {
        setCurDigit(prev);
      } else if (curCh > 0) {
        setCurCh(c => c - 1);
        setCurDigit(DIGIT_COLS - 1);
      }
      return;
    }
    if (key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (curCh > 0) { setCurCh(c => c - 1); setCurDigit(0); }
      } else {
        if (curCh < numChannels - 1) { setCurCh(c => c + 1); setCurDigit(0); }
      }
      return;
    }

    // Insert/delete position
    if (key === 'Insert') { e.preventDefault(); insertPos(currentPosition); return; }
    if (e.ctrlKey && key === 'Backspace') { e.preventDefault(); deletePos(currentPosition); return; }

    // Find entry at current position for this channel
    const seq = nativeData.sequences[curCh];
    if (!seq) return;
    const entry = seq.entries.find(en => en.position === currentPosition);

    // Sign column: +/- toggles
    if (curDigit === 3) {
      if (key === '+' || key === '=' || key === '-') {
        e.preventDefault();
        const cur = entry?.noteOffset ?? 0;
        if (key === '-') {
          setEntry(curCh, currentPosition, 'noteOffset', -Math.abs(cur || 1));
        } else {
          setEntry(curCh, currentPosition, 'noteOffset', Math.abs(cur));
        }
        return;
      }
    }

    // Hex digit entry for pattern (digits 0-2) — use decimal digits 0-9 for pattern numbers
    if (curDigit <= 2) {
      const digit = parseInt(key, 10);
      if (isNaN(digit)) return;
      e.preventDefault();
      const cur = entry?.pattern ?? 0;
      // 3-digit decimal: hundreds, tens, ones
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
      if (hexIdx < 0) return;
      e.preventDefault();
      const cur = entry?.noteOffset ?? 0;
      const sign = cur < 0 ? -1 : 1;
      const abs = Math.abs(cur);
      const hi = Math.floor(abs / 16);
      const lo = abs % 16;
      const newAbs = curDigit === 4
        ? (hexIdx * 16 + lo)
        : (hi * 16 + hexIdx);
      setEntry(curCh, currentPosition, 'noteOffset', sign * newAbs);
    }

    // Move cursor right after typing, skip sign
    if (curDigit <= 2 || curDigit >= 4) {
      const next = curDigit + 1;
      if (next < DIGIT_COLS) {
        setCurDigit(next === 3 ? 4 : next); // skip sign column
      } else if (curCh < numChannels - 1) {
        setCurCh(c => c + 1);
        setCurDigit(0);
      }
    }
  }, [currentPosition, numPositions, numChannels, curCh, curDigit, onPositionChange, setEntry, insertPos, deletePos, nativeData]);

  useEffect(() => { canvasRef.current?.focus(); }, []);

  const collapseLabel = (
    <span style={{
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 12, fontWeight: 700, color: 'var(--color-accent)',
    }}>SEQUENCE</span>
  );

  if (collapsed) {
    return (
      <div
        style={{
          width,
          height: KLYS_MATRIX_COLLAPSED_HEIGHT,
          display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px',
          background: 'var(--color-tracker-row-highlight)',
          cursor: 'pointer',
          borderBottom: '1px solid var(--color-tracker-border, var(--color-border))',
        }}
        onClick={onToggleCollapse}
      >
        <ChevronRight size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        {collapseLabel}
      </div>
    );
  }

  return (
    <div style={{ width, height, display: 'flex', flexDirection: 'column', background: 'var(--color-tracker-row-even)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px',
        height: KLYS_MATRIX_COLLAPSED_HEIGHT, flexShrink: 0,
        background: 'var(--color-tracker-row-highlight)', cursor: 'pointer',
        borderBottom: '1px solid var(--color-tracker-border, var(--color-border))',
      }} onClick={onToggleCollapse}>
        <ChevronDown size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        {collapseLabel}
      </div>
      <canvas
        ref={canvasRef}
        width={width}
        height={canvasH}
        style={{ width, height: canvasH, outline: 'none', cursor: 'pointer' }}
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
};
