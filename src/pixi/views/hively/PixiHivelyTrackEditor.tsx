/**
 * PixiHivelyTrackEditor - Note/Instrument/Effects Track Editor
 * Pure Pixi GL rendering — no DOM elements.
 *
 * Layout:
 * ┌────┬──────────────────┬──────────────────┬─────
 * │ Row│ CH 0 (Track 007) │ CH 1 (Track 008) │ ...
 * ├────┼──────────────────┼──────────────────┤
 * │ 00 │ C-1 01 3C0 450   │ D-1 02 000 000   │
 * │ 01 │ --- -- 000 000   │ F-1 04 000 000   │
 * └────┴──────────────────┴──────────────────┘
 *        Note Ins FX1P FX2P
 */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { Container as ContainerType, Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { useTransportStore } from '@/stores/useTransportStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useEditorStore } from '@/stores/useEditorStore';
import { PIXI_FONTS } from '@/pixi/fonts';
import type { HivelyNativeData, HivelyNativeStep } from '@/types';

// Keyboard note map: keyboard keys -> semitone offset from current octave base
const KEY_NOTE_MAP: Record<string, number> = {
  // Lower octave (Z row)
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  // Upper octave (Q row)
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23,
  i: 24, '9': 25, o: 26, '0': 27, p: 28,
};

// Hex character to value
function hexCharToVal(ch: string): number {
  const v = parseInt(ch, 16);
  return isNaN(v) ? -1 : v;
}

const ROW_HEIGHT    = 20;
const ROW_NUM_WIDTH = 28;
const CHAR_WIDTH    = 8;
const NOTE_WIDTH    = CHAR_WIDTH * 3 + 4;  // 28
const INS_WIDTH     = CHAR_WIDTH * 2 + 4;  // 20
const FX_WIDTH      = CHAR_WIDTH * 3 + 4;  // 28  (effect type 1 hex + param 2 hex)
const CHANNEL_WIDTH = NOTE_WIDTH + INS_WIDTH + FX_WIDTH * 2 + 8;  // 112
const HEADER_HEIGHT = 24;
const FONT_SIZE     = 11;
const TEXT_Y        = 4;

// Sub-column x offsets within each channel (matches original CSS centering)
const CH_NOTE_X = 1;
const CH_INS_X  = CH_NOTE_X + NOTE_WIDTH + 2;   // 31
const CH_FX_X   = CH_INS_X  + INS_WIDTH  + 2;   // 53
const CH_FXB_X  = CH_FX_X   + FX_WIDTH   + 2;   // 83

// HivelyTracker palette (numeric)
const HVL_BG        = 0x000000;
const HVL_HEADER_BG = 0x111111;
const HVL_HIGHLIGHT = 0x780000;
const HVL_CURSOR_BG = 0x1a1a00;
const HVL_HEADER_BORDER = 0x333333;
const HVL_COL_BORDER    = 0x222222;
const HVL_DIM       = 0x808080;
const HVL_NOTE      = 0xffffff;
const HVL_INST      = 0xaaffaa;
const HVL_FX        = 0xffaa55;
const HVL_FX2       = 0x55aaff;
const HVL_TRANS_POS = 0x88ff88;
const HVL_TRANS_NEG = 0xff8888;
const HVL_CURSOR_HL = 0xffff88;

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function formatHvlNote(note: number, transpose: number): string {
  if (note === 0) return '---';
  const transposed = note + transpose;
  if (transposed < 1 || transposed > 60) return '???';
  const semitone = (transposed - 1) % 12;
  const octave   = Math.floor((transposed - 1) / 12);
  return `${NOTE_NAMES[semitone]}${octave}`;
}

function formatHvlHex(val: number, digits: number): string {
  if (val === 0 && digits <= 2) return '-'.repeat(digits);
  return val.toString(16).toUpperCase().padStart(digits, '0');
}

function formatEffect(fx: number, param: number): string {
  if (fx === 0 && param === 0) return '000';
  return `${fx.toString(16).toUpperCase()}${param.toString(16).toUpperCase().padStart(2, '0')}`;
}

function hvlColX(col: 'note' | 'ins' | 'fx' | 'fxb'): number {
  switch (col) {
    case 'note': return CH_NOTE_X;
    case 'ins':  return CH_INS_X;
    case 'fx':   return CH_FX_X;
    case 'fxb':  return CH_FXB_X;
  }
}

function hvlColW(col: 'note' | 'ins' | 'fx' | 'fxb'): number {
  if (col === 'note') return NOTE_WIDTH;
  if (col === 'ins')  return INS_WIDTH;
  return FX_WIDTH;
}

interface TrackEditorProps {
  width: number;
  height: number;
  nativeData: HivelyNativeData;
  currentPosition: number;
  onFocusPositionEditor?: () => void;
}

export const PixiHivelyTrackEditor: React.FC<TrackEditorProps> = ({
  width, height, nativeData, currentPosition, onFocusPositionEditor,
}) => {
  const isPlaying  = useTransportStore(s => s.isPlaying);
  const displayRow = useTransportStore(s => s.currentRow);
  const setHivelyTrackStep = useFormatStore(s => s.setHivelyTrackStep);
  const undoHivelyTrackStep = useFormatStore(s => s.undoHivelyTrackStep);
  const redoHivelyTrackStep = useFormatStore(s => s.redoHivelyTrackStep);

  const trackLength  = nativeData.trackLength;
  const numChannels  = nativeData.channels;

  const [cursorRow,  setCursorRow]  = useState(0);
  const [cursorChan, setCursorChan] = useState(0);
  const [cursorCol,  setCursorCol]  = useState<'note' | 'ins' | 'fx' | 'fxb'>('note');
  const [hexDigitPos, setHexDigitPos] = useState(0); // sub-cursor for hex entry (0=high nibble, 1=low nibble)
  const [octave] = useState(3);
  const [scrollTop,  setScrollTop]  = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [focused,    setFocused]    = useState(false);

  const containerRef  = useRef<ContainerType>(null);
  const scrollTopRef  = useRef(0);
  const scrollLeftRef = useRef(0);
  const focusedRef    = useRef(false);
  focusedRef.current  = focused;

  const totalW     = ROW_NUM_WIDTH + numChannels * CHANNEL_WIDTH;
  const visRows    = Math.floor((height - HEADER_HEIGHT) / ROW_HEIGHT);
  const maxScrollY = Math.max(0, trackLength * ROW_HEIGHT - visRows * ROW_HEIGHT);
  const maxScrollX = Math.max(0, totalW - width);

  // Clip content to component bounds
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const m = new Graphics();
    m.rect(0, 0, width, height).fill({ color: 0xffffff });
    c.mask = m;
    return () => { c.mask = null; m.destroy(); };
  }, [width, height]);

  // Auto-scroll vertical
  useEffect(() => {
    const targetRow = isPlaying ? displayRow : cursorRow;
    const rowY = targetRow * ROW_HEIGHT;
    const s    = scrollTopRef.current;
    if (rowY < s || rowY >= s + visRows * ROW_HEIGHT) {
      const next = Math.max(0, Math.min(maxScrollY, rowY - Math.floor(visRows / 2) * ROW_HEIGHT));
      scrollTopRef.current = next;
      setScrollTop(next);
    }
  }, [cursorRow, displayRow, isPlaying, visRows, maxScrollY]);

  // Auto-scroll horizontal to keep cursor channel visible
  useEffect(() => {
    const chX = ROW_NUM_WIDTH + cursorChan * CHANNEL_WIDTH;
    const sl  = scrollLeftRef.current;
    if (chX - sl < ROW_NUM_WIDTH) {
      const next = Math.max(0, chX - ROW_NUM_WIDTH);
      scrollLeftRef.current = next;
      setScrollLeft(next);
    } else if (chX + CHANNEL_WIDTH - sl > width) {
      const next = Math.min(maxScrollX, chX + CHANNEL_WIDTH - width);
      scrollLeftRef.current = next;
      setScrollLeft(next);
    }
  }, [cursorChan, maxScrollX, width]);

  // Wheel scroll
  const scrollStateRef = useRef({ maxScrollY, maxScrollX });
  scrollStateRef.current = { maxScrollY, maxScrollX };

  useEffect(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      const c = containerRef.current;
      if (!c) return;
      const b = c.getBounds();
      if (e.clientX < b.x || e.clientX > b.x + b.width ||
          e.clientY < b.y || e.clientY > b.y + b.height) return;
      e.preventDefault();
      const { maxScrollY: my, maxScrollX: mx } = scrollStateRef.current;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const next = Math.max(0, Math.min(mx, scrollLeftRef.current + e.deltaX));
        scrollLeftRef.current = next;
        setScrollLeft(next);
      } else {
        const next = Math.max(0, Math.min(my, scrollTopRef.current + e.deltaY));
        scrollTopRef.current = next;
        setScrollTop(next);
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // Resolve the track index for the current cursor channel at the current position
  const getTrackIndex = useCallback((): number => {
    const pos = nativeData.positions[currentPosition];
    if (!pos) return -1;
    return pos.track[cursorChan] ?? -1;
  }, [nativeData, currentPosition, cursorChan]);

  // Helper: advance cursor row by editStep amount after entering data
  const advanceCursor = useCallback(() => {
    const step = useEditorStore.getState().editStep;
    if (step > 0) {
      setCursorRow(r => Math.min(trackLength - 1, r + step));
    }
  }, [trackLength]);

  // Keyboard navigation + editing
  const stateRef = useRef({ cursorRow, cursorChan, cursorCol, trackLength, numChannels, hexDigitPos, octave });
  stateRef.current = { cursorRow, cursorChan, cursorCol, trackLength, numChannels, hexDigitPos, octave };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!focusedRef.current) return;
      // Ignore if typing in an input
      if ((window as any).__pixiInputFocused || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const { cursorChan: cc, cursorCol: ccol, trackLength: tl, numChannels: nc, hexDigitPos: hdp, octave: oct } = stateRef.current;

      // Undo: Ctrl/Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoHivelyTrackStep();
        return;
      }
      // Redo: Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y
      if (((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) ||
          ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        redoHivelyTrackStep();
        return;
      }

      // Navigation keys
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setCursorRow(r => Math.max(0, r - 1));
          setHexDigitPos(0);
          return;
        case 'ArrowDown':
          e.preventDefault();
          setCursorRow(r => Math.min(tl - 1, r + 1));
          setHexDigitPos(0);
          return;
        case 'ArrowLeft':
          e.preventDefault();
          if      (ccol === 'fxb') { setCursorCol('fx'); }
          else if (ccol === 'fx')  { setCursorCol('ins'); }
          else if (ccol === 'ins') { setCursorCol('note'); }
          else if (cc > 0)         { setCursorChan(c => c - 1); setCursorCol('fxb'); }
          setHexDigitPos(0);
          return;
        case 'ArrowRight':
          e.preventDefault();
          if      (ccol === 'note') { setCursorCol('ins'); }
          else if (ccol === 'ins')  { setCursorCol('fx'); }
          else if (ccol === 'fx')   { setCursorCol('fxb'); }
          else if (cc < nc - 1)     { setCursorChan(c => c + 1); setCursorCol('note'); }
          setHexDigitPos(0);
          return;
        case 'Tab':
          e.preventDefault();
          setCursorChan(c => e.shiftKey ? Math.max(0, c - 1) : Math.min(nc - 1, c + 1));
          setCursorCol('note');
          setHexDigitPos(0);
          return;
        case 'Enter':
          e.preventDefault();
          onFocusPositionEditor?.();
          return;
        case 'PageUp':   e.preventDefault(); setCursorRow(r => Math.max(0, r - 16));       return;
        case 'PageDown': e.preventDefault(); setCursorRow(r => Math.min(tl - 1, r + 16));  return;
        case 'Home':     e.preventDefault(); setCursorRow(0);                               return;
        case 'End':      e.preventDefault(); setCursorRow(tl - 1);                          return;
      }

      // Skip data entry keys if modifier held (except shift for uppercase)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Resolve track index for editing
      const trackIdx = getTrackIndex();
      if (trackIdx < 0) return;
      const row = stateRef.current.cursorRow;

      // Delete key: clear the current column's field(s)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const update: Partial<HivelyNativeStep> = {};
        if (ccol === 'note') { update.note = 0; update.instrument = 0; }
        else if (ccol === 'ins') { update.instrument = 0; }
        else if (ccol === 'fx') { update.fx = 0; update.fxParam = 0; }
        else if (ccol === 'fxb') { update.fxb = 0; update.fxbParam = 0; }
        setHivelyTrackStep(trackIdx, row, update);
        setHexDigitPos(0);
        advanceCursor();
        return;
      }

      const key = e.key.toLowerCase();

      // Note column: keyboard piano entry
      if (ccol === 'note') {
        const semitone = KEY_NOTE_MAP[key];
        if (semitone !== undefined) {
          e.preventDefault();
          // HVL notes: 1-60 (C-0=1, C#0=2, ..., B-4=60)
          const noteVal = oct * 12 + semitone + 1;
          if (noteVal >= 1 && noteVal <= 60) {
            setHivelyTrackStep(trackIdx, row, { note: noteVal });
            setHexDigitPos(0);
            advanceCursor();
          }
          return;
        }
        // Period/dot for note-off (if supported) — Hively uses note 0 for empty
        return;
      }

      // Instrument column: 2 hex digits (00-3F)
      if (ccol === 'ins') {
        const hv = hexCharToVal(key);
        if (hv >= 0) {
          e.preventDefault();
          const step = nativeData.tracks[trackIdx]?.steps[row];
          const cur = step?.instrument ?? 0;
          let newVal: number;
          if (hdp === 0) {
            // High nibble
            newVal = (hv << 4) | (cur & 0x0F);
            setHexDigitPos(1);
          } else {
            // Low nibble
            newVal = (cur & 0xF0) | hv;
            setHexDigitPos(0);
            advanceCursor();
          }
          setHivelyTrackStep(trackIdx, row, { instrument: Math.min(63, newVal) });
          return;
        }
        return;
      }

      // Effect columns (fx/fxb): 1 hex digit for effect type + 2 hex digits for param = 3 digits total
      if (ccol === 'fx' || ccol === 'fxb') {
        const hv = hexCharToVal(key);
        if (hv >= 0) {
          e.preventDefault();
          const step = nativeData.tracks[trackIdx]?.steps[row];
          const isFxB = ccol === 'fxb';
          const curParam = isFxB ? (step?.fxbParam ?? 0) : (step?.fxParam ?? 0);

          if (hdp === 0) {
            // Effect type digit (0-F)
            const update: Partial<HivelyNativeStep> = isFxB
              ? { fxb: hv & 0x0F }
              : { fx: hv & 0x0F };
            setHivelyTrackStep(trackIdx, row, update);
            setHexDigitPos(1);
          } else if (hdp === 1) {
            // Param high nibble
            const newParam = (hv << 4) | (curParam & 0x0F);
            const update: Partial<HivelyNativeStep> = isFxB
              ? { fxbParam: newParam }
              : { fxParam: newParam };
            setHivelyTrackStep(trackIdx, row, update);
            setHexDigitPos(2);
          } else {
            // Param low nibble
            const newParam = (curParam & 0xF0) | hv;
            const update: Partial<HivelyNativeStep> = isFxB
              ? { fxbParam: newParam }
              : { fxParam: newParam };
            setHivelyTrackStep(trackIdx, row, update);
            setHexDigitPos(0);
            advanceCursor();
          }
          return;
        }
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onFocusPositionEditor, getTrackIndex, setHivelyTrackStep, undoHivelyTrackStep, redoHivelyTrackStep, advanceCursor]);

  const startRow = Math.floor(scrollTop / ROW_HEIGHT);
  const endRow   = Math.min(trackLength, startRow + visRows + 2);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    setFocused(true);
    setHexDigitPos(0);
    const c = containerRef.current;
    if (!c) return;
    const local = c.toLocal(e.global);
    if (local.y < HEADER_HEIGHT) return;
    const row = Math.floor((local.y - HEADER_HEIGHT + scrollTopRef.current) / ROW_HEIGHT);
    if (row >= 0 && row < trackLength) setCursorRow(row);
    const lx = local.x + scrollLeftRef.current;
    if (lx >= ROW_NUM_WIDTH) {
      const ch = Math.floor((lx - ROW_NUM_WIDTH) / CHANNEL_WIDTH);
      if (ch >= 0 && ch < numChannels) {
        const rel = lx - (ROW_NUM_WIDTH + ch * CHANNEL_WIDTH);
        setCursorChan(ch);
        if      (rel < CH_INS_X)  setCursorCol('note');
        else if (rel < CH_FX_X)   setCursorCol('ins');
        else if (rel < CH_FXB_X)  setCursorCol('fx');
        else                       setCursorCol('fxb');
      }
    }
  }, [trackLength, numChannels]);

  // Draw all backgrounds, row highlights, cursor, and column borders
  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height).fill({ color: HVL_BG });
    g.rect(0, 0, width, HEADER_HEIGHT).fill({ color: HVL_HEADER_BG });
    g.rect(0, HEADER_HEIGHT - 1, width, 1).fill({ color: HVL_HEADER_BORDER });

    const position = nativeData.positions[currentPosition];

    for (let row = startRow; row < endRow; row++) {
      const y = HEADER_HEIGHT + row * ROW_HEIGHT - scrollTop;
      if (y + ROW_HEIGHT <= HEADER_HEIGHT || y >= height) continue;
      const isPlayRow   = isPlaying && row === displayRow;
      const isCursorRow = row === cursorRow;
      if      (isPlayRow)   g.rect(0, y, width, ROW_HEIGHT).fill({ color: HVL_HIGHLIGHT });
      else if (isCursorRow) g.rect(0, y, width, ROW_HEIGHT).fill({ color: HVL_CURSOR_BG });
    }

    // Cursor column highlight
    const curY = HEADER_HEIGHT + cursorRow * ROW_HEIGHT - scrollTop;
    if (curY + ROW_HEIGHT > HEADER_HEIGHT && curY < height) {
      const chBaseX = ROW_NUM_WIDTH + cursorChan * CHANNEL_WIDTH - scrollLeft;
      const cx = chBaseX + hvlColX(cursorCol);
      const cw = hvlColW(cursorCol);
      if (cx < width && cx + cw > 0) {
        g.rect(cx, curY, cw, ROW_HEIGHT).fill({ color: HVL_CURSOR_HL, alpha: 0.2 });
      }
    }

    // Channel column borders
    for (let ch = 0; ch <= numChannels; ch++) {
      const bx = ROW_NUM_WIDTH + ch * CHANNEL_WIDTH - scrollLeft;
      if (bx > 0 && bx < width) {
        g.rect(bx, 0, 1, height).fill({ color: HVL_COL_BORDER });
      }
    }

    void position; // used in cellLabels
  }, [width, height, scrollTop, scrollLeft, startRow, endRow, isPlaying, displayRow,
      cursorRow, cursorChan, cursorCol, numChannels, nativeData, currentPosition]);

  // All text labels
  const cellLabels = useMemo(() => {
    const labels: { x: number; y: number; text: string; color: number }[] = [];
    const position = nativeData.positions[currentPosition];

    // Header: "Row" + per-channel "CH0 T007 +3"
    labels.push({ x: 4, y: TEXT_Y, text: 'Row', color: HVL_DIM });
    if (position) {
      for (let ch = 0; ch < numChannels; ch++) {
        const chX = ROW_NUM_WIDTH + ch * CHANNEL_WIDTH - scrollLeft;
        if (chX >= width || chX + CHANNEL_WIDTH <= 0) continue;
        const trackIdx = position.track[ch] ?? 0;
        const transpose = position.transpose[ch] ?? 0;
        labels.push({
          x: chX + 4, y: TEXT_Y,
          text: `CH${ch} T${trackIdx.toString().padStart(3, '0')}`,
          color: HVL_DIM,
        });
        if (transpose !== 0) {
          labels.push({
            x: chX + 4 + (CHAR_WIDTH * 9), y: TEXT_Y,
            text: transpose > 0 ? `+${transpose}` : `${transpose}`,
            color: transpose > 0 ? HVL_TRANS_POS : HVL_TRANS_NEG,
          });
        }
      }
    }

    // Content rows
    for (let row = startRow; row < endRow; row++) {
      const y = HEADER_HEIGHT + row * ROW_HEIGHT - scrollTop + TEXT_Y;
      if (y < HEADER_HEIGHT || y + FONT_SIZE > height) continue;
      labels.push({
        x: 4, y,
        text: row.toString(16).toUpperCase().padStart(2, '0'),
        color: row % 16 === 0 ? HVL_NOTE : HVL_DIM,
      });

      if (!position) continue;
      for (let ch = 0; ch < numChannels; ch++) {
        const chX = ROW_NUM_WIDTH + ch * CHANNEL_WIDTH - scrollLeft;
        if (chX + CHANNEL_WIDTH <= 0 || chX >= width) continue;

        const trackIdx = position.track[ch] ?? 0;
        const transpose = position.transpose[ch] ?? 0;
        const step = nativeData.tracks[trackIdx]?.steps[row];

        if (!step) {
          labels.push({ x: chX + CH_NOTE_X, y, text: '---', color: HVL_DIM });
          labels.push({ x: chX + CH_INS_X,  y, text: '--',  color: HVL_DIM });
          labels.push({ x: chX + CH_FX_X,   y, text: '000', color: HVL_DIM });
          labels.push({ x: chX + CH_FXB_X,  y, text: '000', color: HVL_DIM });
          continue;
        }

        labels.push({
          x: chX + CH_NOTE_X, y,
          text: formatHvlNote(step.note, transpose),
          color: step.note > 0 ? HVL_NOTE : HVL_DIM,
        });
        labels.push({
          x: chX + CH_INS_X, y,
          text: step.instrument > 0 ? formatHvlHex(step.instrument, 2) : '--',
          color: step.instrument > 0 ? HVL_INST : HVL_DIM,
        });
        labels.push({
          x: chX + CH_FX_X, y,
          text: formatEffect(step.fx, step.fxParam),
          color: (step.fx > 0 || step.fxParam > 0) ? HVL_FX : HVL_DIM,
        });
        labels.push({
          x: chX + CH_FXB_X, y,
          text: formatEffect(step.fxb, step.fxbParam),
          color: (step.fxb > 0 || step.fxbParam > 0) ? HVL_FX2 : HVL_DIM,
        });
      }
    }

    return labels;
  }, [nativeData, currentPosition, numChannels, startRow, endRow, scrollTop, scrollLeft, height, width]);

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
