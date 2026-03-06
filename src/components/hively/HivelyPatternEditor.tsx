/**
 * HivelyPatternEditor — Canvas2D-based track editor for HivelyTracker/AHX.
 *
 * Reads from hivelyNative data (track pool + position table).
 * Each channel shows: Note | Instrument | FX1+Param | FX2+Param
 *
 * Note values: 0=empty, 1-60 (C-0 to B-4). Per-channel transpose applied.
 * Supports editing: note input, hex entry for instrument/fx, delete/backspace.
 */

import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useTransportStore } from '@stores/useTransportStore';
import { useFormatStore } from '@stores';
import { useEditorStore } from '@stores/useEditorStore';
import { HivelyEngine } from '@/engine/hively/HivelyEngine';
import type { HivelyNativeData } from '@/types/tracker';

// --- Constants ---
const CHAR_W = 8;
const CHAR_H = 14;
const ROW_H = CHAR_H + 2;
const ROW_NUM_W = CHAR_W * 3 + 4;
const NOTE_W = CHAR_W * 3;     // "C-3"
const INS_W = CHAR_W * 2;      // "01"
const FX_W = CHAR_W * 3;       // "3C0" (type + 2-digit param)
const COL_GAP = 4;
const CHAN_GAP = 8;
const CHANNEL_W = NOTE_W + COL_GAP + INS_W + COL_GAP + FX_W + COL_GAP + FX_W;
const HEADER_H = ROW_H + 4;

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteToString(note: number, transpose: number): string {
  if (note === 0) return '---';
  const t = note + transpose;
  if (t < 1 || t > 60) return '???';
  const n = t - 1;
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12)}`;
}

function fxToString(fx: number, param: number): string {
  if (fx === 0 && param === 0) return '000';
  return `${fx.toString(16).toUpperCase()}${param.toString(16).toUpperCase().padStart(2, '0')}`;
}

// Colors — FT2 theme
const COLORS = {
  bg: '#0d0d0d',
  bgAlt: '#141414',
  headerBg: '#1a1a1a',
  headerText: '#888',
  rowNum: '#555',
  note: '#e0e0e0',
  instrument: '#60e060',
  fx1: '#ffaa55',
  fx2: '#55aaff',
  empty: '#333',
  cursor: 'rgba(255, 255, 255, 0.2)',
  cursorBorder: '#888',
  selection: 'rgba(100, 149, 237, 0.25)',
  playRow: 'rgba(233, 69, 96, 0.15)',
  channelSep: '#222',
  recording: 'rgba(233, 69, 96, 0.35)',
};

// FT2-style note input: key → semitone offset from octave base
const LOWER_OCTAVE: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
};
const UPPER_OCTAVE: Record<string, number> = {
  q: 0, '2': 1, w: 2, '3': 3, e: 4, r: 5, '5': 6, t: 7, '6': 8, y: 9, '7': 10, u: 11,
  i: 12, '9': 13, o: 14, '0': 15, p: 16,
};

function isHexChar(k: string): boolean { return /^[0-9a-f]$/i.test(k); }
function hexVal(k: string): number { return parseInt(k, 16); }

interface CursorPos {
  channel: number;
  row: number;
  column: number; // 0=note, 1=instrument, 2=fx1, 3=fx2
}

interface HivelyPatternEditorProps {
  width: number;
  height: number;
  nativeData: HivelyNativeData;
  currentPosition: number;
}

export const HivelyPatternEditor: React.FC<HivelyPatternEditorProps> = ({
  width, height, nativeData, currentPosition,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentRow = useTransportStore(s => s.currentRow);
  const recordMode = useEditorStore(s => s.recordMode);
  const editStep = useEditorStore(s => s.editStep);
  const currentOctave = useEditorStore(s => s.currentOctave);

  const [cursor, setCursorState] = useState<CursorPos>({ channel: 0, row: 0, column: 0 });
  const [hexDigit, setHexDigit] = useState(0); // tracks digit position within hex columns
  const [selection, setSelection] = useState<{
    active: boolean; startChannel: number; startRow: number; endChannel: number; endRow: number;
  }>({ active: false, startChannel: 0, startRow: 0, endChannel: 0, endRow: 0 });
  const [dragging, setDragging] = useState(false);

  const trackLength = nativeData.trackLength;
  const numChannels = nativeData.channels;
  const position = nativeData.positions[currentPosition];

  const visibleRows = Math.floor((height - HEADER_H) / ROW_H);

  const scrollRow = useMemo(() => {
    const targetRow = isPlaying ? currentRow : cursor.row;
    const half = Math.floor(visibleRows / 2);
    return Math.max(0, Math.min(targetRow - half, trackLength - visibleRows + 1));
  }, [cursor.row, currentRow, isPlaying, visibleRows, trackLength]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !position) return;
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
    ctx.fillText('ROW', 2, 4);
    for (let ch = 0; ch < numChannels; ch++) {
      const x = ROW_NUM_W + ch * (CHANNEL_W + CHAN_GAP);
      const trackIdx = position.track[ch];
      const tr = position.transpose[ch];
      const trStr = tr === 0 ? '' : (tr > 0 ? `+${tr}` : `${tr}`);
      const label = `CH${ch + 1}:T${trackIdx.toString().padStart(3, '0')}${trStr ? ` ${trStr}` : ''}`;
      ctx.fillText(label, x, 4);
    }

    // Rows
    for (let vi = 0; vi < visibleRows; vi++) {
      const row = scrollRow + vi;
      if (row >= trackLength) break;
      const y = HEADER_H + vi * ROW_H;
      const isPlayRow = isPlaying && row === currentRow;
      const isCursorRow = row === cursor.row;

      // Row background
      if (isPlayRow) {
        ctx.fillStyle = COLORS.playRow;
        ctx.fillRect(0, y, width, ROW_H);
      } else if (row % 8 === 0) {
        ctx.fillStyle = COLORS.bgAlt;
        ctx.fillRect(0, y, width, ROW_H);
      }

      // Selection
      if (selection.active) {
        const minRow = Math.min(selection.startRow, selection.endRow);
        const maxRow = Math.max(selection.startRow, selection.endRow);
        const minCh = Math.min(selection.startChannel, selection.endChannel);
        const maxCh = Math.max(selection.startChannel, selection.endChannel);
        if (row >= minRow && row <= maxRow) {
          for (let ch = minCh; ch <= maxCh; ch++) {
            const sx = ROW_NUM_W + ch * (CHANNEL_W + CHAN_GAP);
            ctx.fillStyle = COLORS.selection;
            ctx.fillRect(sx, y, CHANNEL_W, ROW_H);
          }
        }
      }

      // Row number
      ctx.fillStyle = COLORS.rowNum;
      ctx.fillText(row.toString(16).toUpperCase().padStart(2, '0'), 2, y + 1);

      // Channel separator lines
      for (let ch = 1; ch < numChannels; ch++) {
        const x = ROW_NUM_W + ch * (CHANNEL_W + CHAN_GAP) - CHAN_GAP / 2;
        ctx.strokeStyle = COLORS.channelSep;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + ROW_H);
        ctx.stroke();
      }

      // Cell data per channel
      for (let ch = 0; ch < numChannels; ch++) {
        const baseX = ROW_NUM_W + ch * (CHANNEL_W + CHAN_GAP);
        const trackIdx = position.track[ch];
        const transpose = position.transpose[ch];
        const step = nativeData.tracks[trackIdx]?.steps[row];

        if (!step) continue;

        let colX = baseX;

        // Note
        const noteStr = noteToString(step.note, transpose);
        ctx.fillStyle = step.note === 0 ? COLORS.empty : COLORS.note;
        ctx.fillText(noteStr, colX, y + 1);
        colX += NOTE_W + COL_GAP;

        // Instrument
        const insStr = step.instrument === 0 ? '..' : step.instrument.toString(16).toUpperCase().padStart(2, '0');
        ctx.fillStyle = step.instrument === 0 ? COLORS.empty : COLORS.instrument;
        ctx.fillText(insStr, colX, y + 1);
        colX += INS_W + COL_GAP;

        // FX1
        const fx1Str = fxToString(step.fx, step.fxParam);
        ctx.fillStyle = (step.fx === 0 && step.fxParam === 0) ? COLORS.empty : COLORS.fx1;
        ctx.fillText(fx1Str, colX, y + 1);
        colX += FX_W + COL_GAP;

        // FX2
        const fx2Str = fxToString(step.fxb, step.fxbParam);
        ctx.fillStyle = (step.fxb === 0 && step.fxbParam === 0) ? COLORS.empty : COLORS.fx2;
        ctx.fillText(fx2Str, colX, y + 1);
      }

      // Cursor highlight
      if (isCursorRow && !isPlaying) {
        const cx = ROW_NUM_W + cursor.channel * (CHANNEL_W + CHAN_GAP);
        let colOffset = 0;
        let colWidth = NOTE_W;
        switch (cursor.column) {
          case 0: colOffset = 0; colWidth = NOTE_W; break;
          case 1: colOffset = NOTE_W + COL_GAP; colWidth = INS_W; break;
          case 2: colOffset = NOTE_W + COL_GAP + INS_W + COL_GAP; colWidth = FX_W; break;
          case 3: colOffset = NOTE_W + COL_GAP + INS_W + COL_GAP + FX_W + COL_GAP; colWidth = FX_W; break;
        }
        ctx.fillStyle = recordMode ? COLORS.recording : COLORS.cursor;
        ctx.fillRect(cx + colOffset, y, colWidth, ROW_H);
        ctx.strokeStyle = recordMode ? '#e94560' : COLORS.cursorBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx + colOffset + 0.5, y + 0.5, colWidth - 1, ROW_H - 1);
      }
    }
  }, [width, height, cursor, selection, currentRow, isPlaying, recordMode,
      scrollRow, visibleRows, numChannels, trackLength, position, nativeData]);

  // Write a step to WASM and update store
  const writeStep = useCallback((channel: number, row: number,
    note: number, instrument: number, fx: number, fxParam: number, fxb: number, fxbParam: number) => {
    if (!position) return;
    const trackIdx = position.track[channel];
    if (trackIdx === undefined) return;
    const track = nativeData.tracks[trackIdx];
    if (!track || row >= track.steps.length) return;

    // Update store
    const step = track.steps[row];
    step.note = note;
    step.instrument = instrument;
    step.fx = fx;
    step.fxParam = fxParam;
    step.fxb = fxb;
    step.fxbParam = fxbParam;

    // Update WASM
    if (HivelyEngine.hasInstance()) {
      HivelyEngine.getInstance().setTrackStep(trackIdx, row, note, instrument, fx, fxParam, fxb, fxbParam);
    }

    // Force store re-render
    useFormatStore.setState((s) => {
      if (s.hivelyNative) {
        s.hivelyNative = { ...s.hivelyNative };
      }
    });
  }, [position, nativeData]);

  // Advance cursor by editStep rows
  const advanceCursor = useCallback(() => {
    if (editStep > 0) {
      setCursorState(c => ({ ...c, row: Math.min(trackLength - 1, c.row + editStep) }));
    }
  }, [editStep, trackLength]);

  // Keyboard
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { key, shiftKey } = e;
    const k = key.toLowerCase();

    // Navigation keys (always active)
    switch (key) {
      case 'ArrowUp':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: Math.max(0, c.row - 1) }));
        setHexDigit(0);
        return;
      case 'ArrowDown':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: Math.min(trackLength - 1, c.row + 1) }));
        setHexDigit(0);
        return;
      case 'ArrowLeft':
        e.preventDefault();
        setCursorState(c => {
          if (c.column > 0) return { ...c, column: c.column - 1 };
          if (c.channel > 0) return { ...c, channel: c.channel - 1, column: 3 };
          return c;
        });
        setHexDigit(0);
        return;
      case 'ArrowRight':
        e.preventDefault();
        setCursorState(c => {
          if (c.column < 3) return { ...c, column: c.column + 1 };
          if (c.channel < numChannels - 1) return { ...c, channel: c.channel + 1, column: 0 };
          return c;
        });
        setHexDigit(0);
        return;
      case 'Tab':
        e.preventDefault();
        setCursorState(c => {
          if (shiftKey) return { ...c, channel: Math.max(0, c.channel - 1), column: 0 };
          return { ...c, channel: Math.min(numChannels - 1, c.channel + 1), column: 0 };
        });
        setHexDigit(0);
        return;
      case 'PageUp':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: Math.max(0, c.row - 16) }));
        setHexDigit(0);
        return;
      case 'PageDown':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: Math.min(trackLength - 1, c.row + 16) }));
        setHexDigit(0);
        return;
      case 'Home':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: 0 }));
        setHexDigit(0);
        return;
      case 'End':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: trackLength - 1 }));
        setHexDigit(0);
        return;
    }

    // Editing keys (only when record mode is on and not playing)
    if (!recordMode || isPlaying) return;
    if (!position) return;

    const trackIdx = position.track[cursor.channel];
    if (trackIdx === undefined) return;
    const track = nativeData.tracks[trackIdx];
    if (!track) return;
    const step = track.steps[cursor.row];
    if (!step) return;

    // Delete / Backspace — clear current cell
    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault();
      if (cursor.column === 0) {
        writeStep(cursor.channel, cursor.row, 0, step.instrument, step.fx, step.fxParam, step.fxb, step.fxbParam);
      } else if (cursor.column === 1) {
        writeStep(cursor.channel, cursor.row, step.note, 0, step.fx, step.fxParam, step.fxb, step.fxbParam);
      } else if (cursor.column === 2) {
        writeStep(cursor.channel, cursor.row, step.note, step.instrument, 0, 0, step.fxb, step.fxbParam);
      } else {
        writeStep(cursor.channel, cursor.row, step.note, step.instrument, step.fx, step.fxParam, 0, 0);
      }
      setHexDigit(0);
      if (key === 'Backspace') {
        setCursorState(c => ({ ...c, row: Math.max(0, c.row - 1) }));
      } else {
        advanceCursor();
      }
      return;
    }

    // Note column input
    if (cursor.column === 0) {
      const lowerSemi = LOWER_OCTAVE[k];
      const upperSemi = UPPER_OCTAVE[k];
      if (lowerSemi !== undefined) {
        e.preventDefault();
        const noteVal = (currentOctave - 1) * 12 + lowerSemi + 1;
        if (noteVal >= 1 && noteVal <= 60) {
          writeStep(cursor.channel, cursor.row, noteVal, step.instrument, step.fx, step.fxParam, step.fxb, step.fxbParam);
          advanceCursor();
        }
        return;
      }
      if (upperSemi !== undefined) {
        e.preventDefault();
        const noteVal = currentOctave * 12 + upperSemi + 1;
        if (noteVal >= 1 && noteVal <= 60) {
          writeStep(cursor.channel, cursor.row, noteVal, step.instrument, step.fx, step.fxParam, step.fxb, step.fxbParam);
          advanceCursor();
        }
        return;
      }
      return;
    }

    // Hex input for instrument/fx columns
    if (!isHexChar(k)) return;
    e.preventDefault();
    const hv = hexVal(k);

    if (cursor.column === 1) {
      // Instrument: 2 hex digits (00-3F)
      const oldVal = step.instrument;
      let newVal: number;
      if (hexDigit === 0) {
        newVal = (hv << 4) | (oldVal & 0x0F);
        setHexDigit(1);
      } else {
        newVal = (oldVal & 0xF0) | hv;
        setHexDigit(0);
        advanceCursor();
      }
      writeStep(cursor.channel, cursor.row, step.note, newVal & 0x3F, step.fx, step.fxParam, step.fxb, step.fxbParam);
    } else if (cursor.column === 2) {
      // FX1: 3 hex digits — type (0-F) + param (00-FF)
      if (hexDigit === 0) {
        writeStep(cursor.channel, cursor.row, step.note, step.instrument, hv, step.fxParam, step.fxb, step.fxbParam);
        setHexDigit(1);
      } else if (hexDigit === 1) {
        writeStep(cursor.channel, cursor.row, step.note, step.instrument, step.fx, (hv << 4) | (step.fxParam & 0x0F), step.fxb, step.fxbParam);
        setHexDigit(2);
      } else {
        writeStep(cursor.channel, cursor.row, step.note, step.instrument, step.fx, (step.fxParam & 0xF0) | hv, step.fxb, step.fxbParam);
        setHexDigit(0);
        advanceCursor();
      }
    } else {
      // FX2: 3 hex digits
      if (hexDigit === 0) {
        writeStep(cursor.channel, cursor.row, step.note, step.instrument, step.fx, step.fxParam, hv, step.fxbParam);
        setHexDigit(1);
      } else if (hexDigit === 1) {
        writeStep(cursor.channel, cursor.row, step.note, step.instrument, step.fx, step.fxParam, step.fxb, (hv << 4) | (step.fxbParam & 0x0F));
        setHexDigit(2);
      } else {
        writeStep(cursor.channel, cursor.row, step.note, step.instrument, step.fx, step.fxParam, step.fxb, (step.fxbParam & 0xF0) | hv);
        setHexDigit(0);
        advanceCursor();
      }
    }
  }, [trackLength, numChannels, recordMode, isPlaying, position, nativeData,
      cursor, currentOctave, editStep, hexDigit, writeStep, advanceCursor]);

  // Mouse hit test
  const hitTest = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (y < HEADER_H) return null;
    const row = scrollRow + Math.floor((y - HEADER_H) / ROW_H);
    if (row >= trackLength) return null;
    const relX = x - ROW_NUM_W;
    if (relX < 0) return null;
    const channel = Math.floor(relX / (CHANNEL_W + CHAN_GAP));
    if (channel >= numChannels) return null;
    const inCh = relX - channel * (CHANNEL_W + CHAN_GAP);
    let column = 0;
    if (inCh >= NOTE_W + COL_GAP + INS_W + COL_GAP + FX_W + COL_GAP) column = 3;
    else if (inCh >= NOTE_W + COL_GAP + INS_W + COL_GAP) column = 2;
    else if (inCh >= NOTE_W + COL_GAP) column = 1;
    return { channel, row, column };
  }, [scrollRow, trackLength, numChannels]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) return;
    setCursorState({ channel: hit.channel, row: hit.row, column: hit.column });
    setSelection({ active: false, startChannel: 0, startRow: 0, endChannel: 0, endRow: 0 });
    setDragging(true);
  }, [hitTest]);

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const hit = hitTest(e.clientX, e.clientY);
      if (!hit) return;
      setSelection({
        active: true,
        startChannel: cursor.channel,
        startRow: cursor.row,
        endChannel: hit.channel,
        endRow: hit.row,
      });
    };
    const handleMouseUp = () => setDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, cursor.channel, cursor.row, hitTest]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width, height, outline: 'none' }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
    />
  );
};
