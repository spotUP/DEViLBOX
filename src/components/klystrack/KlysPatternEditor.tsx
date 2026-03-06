/**
 * KlysPatternEditor — Canvas2D-based pattern editor for klystrack.
 *
 * Column layout per channel: Note | Inst | Ctrl | Vol | Command
 *
 * Note values: 0xFF=empty, 0xFE=note-off, 0-95 (C-0 to B-7).
 * Instrument: 0xFF=empty, 0-254.
 * Ctrl: bitfield (legato/slide/vibrato).
 * Volume: 0xFF=empty, 0-128.
 * Command: 16-bit (high=effect type, low=param).
 */

import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useTransportStore } from '@stores/useTransportStore';
import { useTrackerStore } from '@stores';
import type { KlysNativeData } from '@/types/tracker';
import { KlysEngine } from '@/engine/klystrack/KlysEngine';

const CHAR_W = 8;
const CHAR_H = 14;
const ROW_H = CHAR_H + 2;
const ROW_NUM_W = CHAR_W * 3 + 4;
const NOTE_W = CHAR_W * 3;     // "C-3"
const INS_W = CHAR_W * 2;      // "01"
const CTRL_W = CHAR_W * 1;     // "L"
const VOL_W = CHAR_W * 2;      // "80"
const CMD_W = CHAR_W * 4;      // "0C20"
const COL_GAP = 4;
const CHAN_GAP = 8;
const CHANNEL_W = NOTE_W + COL_GAP + INS_W + COL_GAP + CTRL_W + COL_GAP + VOL_W + COL_GAP + CMD_W;
const HEADER_H = ROW_H + 4;

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteToString(note: number): string {
  if (note === 0xFF || note === 0) return '---';
  if (note === 0xFE || note === 97) return '===';
  const n = note;
  if (n < 0 || n > 95) return '???';
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12)}`;
}

function ctrlToString(ctrl: number): string {
  if (ctrl === 0) return '.';
  // MUS_CTRL_LEGATO=1, MUS_CTRL_SLIDE=2, MUS_CTRL_VIB=4
  if (ctrl & 1) return 'L';
  if (ctrl & 2) return 'S';
  if (ctrl & 4) return 'V';
  return ctrl.toString(16).toUpperCase();
}

const COLORS = {
  bg: '#0d0d0d',
  bgAlt: '#141414',
  headerBg: '#1a1a1a',
  headerText: '#888',
  rowNum: '#555',
  note: '#e0e0e0',
  instrument: '#60e060',
  ctrl: '#ff66cc',
  volume: '#55aaff',
  command: '#ffaa55',
  empty: '#333',
  cursor: 'rgba(255, 255, 255, 0.2)',
  cursorBorder: '#888',
  selection: 'rgba(100, 149, 237, 0.25)',
  playRow: 'rgba(233, 69, 96, 0.15)',
  channelSep: '#222',
};

interface CursorPos {
  channel: number;
  row: number;
  column: number; // 0=note, 1=inst, 2=ctrl, 3=vol, 4=cmd
}

interface KlysPatternEditorProps {
  width: number;
  height: number;
  nativeData: KlysNativeData;
  currentPosition: number;
}

export const KlysPatternEditor: React.FC<KlysPatternEditorProps> = ({
  width, height, nativeData, currentPosition,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentRow = useTransportStore(s => s.currentRow);

  const [cursor, setCursorState] = useState<CursorPos>({ channel: 0, row: 0, column: 0 });
  const [selection, setSelection] = useState<{
    active: boolean; startChannel: number; startRow: number; endChannel: number; endRow: number;
  }>({ active: false, startChannel: 0, startRow: 0, endChannel: 0, endRow: 0 });
  const [dragging, setDragging] = useState(false);

  const numChannels = nativeData.channels;
  const NUM_COLUMNS = 5; // note, inst, ctrl, vol, cmd

  // Resolve the active pattern for each channel at the current position
  const channelPatterns = useMemo(() => {
    const result: { patternIdx: number; noteOffset: number }[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const seq = nativeData.sequences[ch];
      if (!seq) { result.push({ patternIdx: -1, noteOffset: 0 }); continue; }
      // Find the last sequence entry at or before currentPosition
      let best: { patternIdx: number; noteOffset: number } = { patternIdx: -1, noteOffset: 0 };
      for (const entry of seq.entries) {
        if (entry.position <= currentPosition) {
          best = { patternIdx: entry.pattern, noteOffset: entry.noteOffset };
        }
      }
      result.push(best);
    }
    return result;
  }, [nativeData, numChannels, currentPosition]);

  // Get the max pattern length across active patterns
  const trackLength = useMemo(() => {
    let maxLen = 0;
    for (const cp of channelPatterns) {
      if (cp.patternIdx >= 0 && cp.patternIdx < nativeData.patterns.length) {
        maxLen = Math.max(maxLen, nativeData.patterns[cp.patternIdx].numSteps);
      }
    }
    return maxLen || 64;
  }, [channelPatterns, nativeData.patterns]);

  const visibleRows = Math.floor((height - HEADER_H) / ROW_H);

  const scrollRow = useMemo(() => {
    const targetRow = isPlaying ? currentRow : cursor.row;
    const half = Math.floor(visibleRows / 2);
    return Math.max(0, Math.min(targetRow - half, trackLength - visibleRows + 1));
  }, [cursor.row, currentRow, isPlaying, visibleRows, trackLength]);

  // Draw
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
    ctx.fillText('ROW', 2, 4);
    for (let ch = 0; ch < numChannels; ch++) {
      const x = ROW_NUM_W + ch * (CHANNEL_W + CHAN_GAP);
      const cp = channelPatterns[ch];
      const trStr = cp.noteOffset === 0 ? '' : (cp.noteOffset > 0 ? `+${cp.noteOffset}` : `${cp.noteOffset}`);
      const label = cp.patternIdx >= 0
        ? `CH${(ch + 1).toString().padStart(2, '0')}:P${cp.patternIdx.toString().padStart(3, '0')}${trStr ? ` ${trStr}` : ''}`
        : `CH${(ch + 1).toString().padStart(2, '0')}`;
      ctx.fillText(label, x, 4);
    }

    // Rows
    for (let vi = 0; vi < visibleRows; vi++) {
      const row = scrollRow + vi;
      if (row >= trackLength) break;
      const y = HEADER_H + vi * ROW_H;
      const isPlayRow = isPlaying && row === currentRow;
      const isCursorRow = row === cursor.row;

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
        const cp = channelPatterns[ch];
        const pat = cp.patternIdx >= 0 ? nativeData.patterns[cp.patternIdx] : null;
        const step = pat?.steps[row];

        let colX = baseX;

        if (!step) {
          // Empty row
          ctx.fillStyle = COLORS.empty;
          ctx.fillText('---', colX, y + 1);
          colX += NOTE_W + COL_GAP;
          ctx.fillText('..', colX, y + 1);
          colX += INS_W + COL_GAP;
          ctx.fillText('.', colX, y + 1);
          colX += CTRL_W + COL_GAP;
          ctx.fillText('..', colX, y + 1);
          colX += VOL_W + COL_GAP;
          ctx.fillText('....', colX, y + 1);
        } else {
          // Note
          const noteStr = noteToString(step.note);
          ctx.fillStyle = (step.note === 0xFF || step.note === 0) ? COLORS.empty : COLORS.note;
          ctx.fillText(noteStr, colX, y + 1);
          colX += NOTE_W + COL_GAP;

          // Instrument
          const insStr = (step.instrument === 0xFF) ? '..' : step.instrument.toString(16).toUpperCase().padStart(2, '0');
          ctx.fillStyle = step.instrument === 0xFF ? COLORS.empty : COLORS.instrument;
          ctx.fillText(insStr, colX, y + 1);
          colX += INS_W + COL_GAP;

          // Ctrl
          const ctrlStr = ctrlToString(step.ctrl);
          ctx.fillStyle = step.ctrl === 0 ? COLORS.empty : COLORS.ctrl;
          ctx.fillText(ctrlStr, colX, y + 1);
          colX += CTRL_W + COL_GAP;

          // Volume
          const volStr = (step.volume === 0xFF) ? '..' : step.volume.toString(16).toUpperCase().padStart(2, '0');
          ctx.fillStyle = step.volume === 0xFF ? COLORS.empty : COLORS.volume;
          ctx.fillText(volStr, colX, y + 1);
          colX += VOL_W + COL_GAP;

          // Command (16-bit: high byte = type, low byte = param)
          const cmdStr = step.command === 0 ? '....' : step.command.toString(16).toUpperCase().padStart(4, '0');
          ctx.fillStyle = step.command === 0 ? COLORS.empty : COLORS.command;
          ctx.fillText(cmdStr, colX, y + 1);
        }

        // Cursor highlight
        if (isCursorRow && !isPlaying && ch === cursor.channel) {
          let colOffset = 0;
          let colWidth = NOTE_W;
          switch (cursor.column) {
            case 0: colOffset = 0; colWidth = NOTE_W; break;
            case 1: colOffset = NOTE_W + COL_GAP; colWidth = INS_W; break;
            case 2: colOffset = NOTE_W + COL_GAP + INS_W + COL_GAP; colWidth = CTRL_W; break;
            case 3: colOffset = NOTE_W + COL_GAP + INS_W + COL_GAP + CTRL_W + COL_GAP; colWidth = VOL_W; break;
            case 4: colOffset = NOTE_W + COL_GAP + INS_W + COL_GAP + CTRL_W + COL_GAP + VOL_W + COL_GAP; colWidth = CMD_W; break;
          }
          ctx.fillStyle = COLORS.cursor;
          ctx.fillRect(baseX + colOffset, y, colWidth, ROW_H);
          ctx.strokeStyle = COLORS.cursorBorder;
          ctx.lineWidth = 1;
          ctx.strokeRect(baseX + colOffset + 0.5, y + 0.5, colWidth - 1, ROW_H - 1);
        }
      }
    }
  }, [width, height, cursor, selection, currentRow, isPlaying,
      scrollRow, visibleRows, numChannels, trackLength, channelPatterns, nativeData]);

  // Note input keyboard map: Z-M = octave N, Q-P = octave N+1
  // Current octave tracked in state
  const [octave, setOctave] = useState(3);

  const KEY_TO_NOTE: Record<string, number> = useMemo(() => ({
    'z': 0, 's': 1, 'x': 2, 'd': 3, 'c': 4, 'v': 5,
    'g': 6, 'b': 7, 'h': 8, 'n': 9, 'j': 10, 'm': 11,
    'q': 12, '2': 13, 'w': 14, '3': 15, 'e': 16, 'r': 17,
    '5': 18, 't': 19, '6': 20, 'y': 21, '7': 22, 'u': 23,
    'i': 24, '9': 25, 'o': 26, '0': 27, 'p': 28,
  }), []);

  const isHexChar = (k: string): boolean => /^[0-9a-f]$/i.test(k);
  const hexVal = (k: string): number => parseInt(k, 16);

  const writeCell = useCallback((channel: number, row: number, column: number,
    note: number, instrument: number, ctrl: number, volume: number, command: number) => {
    const cp = channelPatterns[channel];
    if (cp.patternIdx < 0) return;
    const pat = nativeData.patterns[cp.patternIdx];
    if (!pat || row >= pat.numSteps) return;
    const step = pat.steps[row];
    if (!step) return;

    const newNote = note >= 0 ? note : step.note;
    const newInst = instrument >= 0 ? instrument : step.instrument;
    const newCtrl = ctrl >= 0 ? ctrl : step.ctrl;
    const newVol = volume >= 0 ? volume : step.volume;
    const newCmd = command >= 0 ? command : step.command;

    // Update store
    step.note = newNote;
    step.instrument = newInst;
    step.ctrl = newCtrl;
    step.volume = newVol;
    step.command = newCmd;

    // Send to WASM engine
    if (KlysEngine.hasInstance()) {
      KlysEngine.getInstance().setPatternStep(
        cp.patternIdx, row,
        newNote, newInst, newCtrl, newVol,
        newCmd & 0xFF, (newCmd >> 8) & 0xFF
      );
    }

    // Force re-render by touching klysNative
    const state = useTrackerStore.getState();
    if (state.klysNative) {
      useTrackerStore.setState({ klysNative: { ...state.klysNative } });
    }
  }, [channelPatterns, nativeData]);

  // Keyboard
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const { key, shiftKey } = e;
    const lk = key.toLowerCase();

    // Navigation keys
    switch (key) {
      case 'ArrowUp':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: Math.max(0, c.row - 1) }));
        return;
      case 'ArrowDown':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: Math.min(trackLength - 1, c.row + 1) }));
        return;
      case 'ArrowLeft':
        e.preventDefault();
        setCursorState(c => {
          if (c.column > 0) return { ...c, column: c.column - 1 };
          if (c.channel > 0) return { ...c, channel: c.channel - 1, column: NUM_COLUMNS - 1 };
          return c;
        });
        return;
      case 'ArrowRight':
        e.preventDefault();
        setCursorState(c => {
          if (c.column < NUM_COLUMNS - 1) return { ...c, column: c.column + 1 };
          if (c.channel < numChannels - 1) return { ...c, channel: c.channel + 1, column: 0 };
          return c;
        });
        return;
      case 'Tab':
        e.preventDefault();
        setCursorState(c => {
          if (shiftKey) return { ...c, channel: Math.max(0, c.channel - 1), column: 0 };
          return { ...c, channel: Math.min(numChannels - 1, c.channel + 1), column: 0 };
        });
        return;
      case 'PageUp':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: Math.max(0, c.row - 16) }));
        return;
      case 'PageDown':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: Math.min(trackLength - 1, c.row + 16) }));
        return;
      case 'Home':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: 0 }));
        return;
      case 'End':
        e.preventDefault();
        setCursorState(c => ({ ...c, row: trackLength - 1 }));
        return;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        switch (cursor.column) {
          case 0: writeCell(cursor.channel, cursor.row, 0, 0xFF, -1, -1, -1, -1); break;
          case 1: writeCell(cursor.channel, cursor.row, 1, -1, 0xFF, -1, -1, -1); break;
          case 2: writeCell(cursor.channel, cursor.row, 2, -1, -1, 0, -1, -1); break;
          case 3: writeCell(cursor.channel, cursor.row, 3, -1, -1, -1, 0xFF, -1); break;
          case 4: writeCell(cursor.channel, cursor.row, 4, -1, -1, -1, -1, 0); break;
        }
        setCursorState(c => ({ ...c, row: Math.min(trackLength - 1, c.row + 1) }));
        return;
    }

    // Octave change: [ and ] or numpad +/-
    if (key === '[' || key === '-') {
      e.preventDefault();
      setOctave(o => Math.max(0, o - 1));
      return;
    }
    if (key === ']' || key === '=') {
      e.preventDefault();
      setOctave(o => Math.min(7, o + 1));
      return;
    }

    // Note-off: ` or 1
    if (key === '`' || key === '1') {
      if (cursor.column === 0) {
        e.preventDefault();
        writeCell(cursor.channel, cursor.row, 0, 0xFE, -1, -1, -1, -1);
        setCursorState(c => ({ ...c, row: Math.min(trackLength - 1, c.row + 1) }));
        return;
      }
    }

    // Note column: piano keyboard input
    if (cursor.column === 0 && KEY_TO_NOTE[lk] !== undefined) {
      e.preventDefault();
      const noteVal = KEY_TO_NOTE[lk] + octave * 12;
      if (noteVal >= 0 && noteVal <= 95) {
        writeCell(cursor.channel, cursor.row, 0, noteVal, -1, -1, -1, -1);
        setCursorState(c => ({ ...c, row: Math.min(trackLength - 1, c.row + 1) }));
      }
      return;
    }

    // Hex entry for inst/ctrl/vol/cmd columns
    if (isHexChar(lk) && cursor.column >= 1) {
      e.preventDefault();
      const h = hexVal(lk);
      const cp = channelPatterns[cursor.channel];
      if (cp.patternIdx < 0) return;
      const pat = nativeData.patterns[cp.patternIdx];
      if (!pat) return;
      const step = pat.steps[cursor.row];
      if (!step) return;

      switch (cursor.column) {
        case 1: { // Instrument (2 hex digits)
          const old = step.instrument === 0xFF ? 0 : step.instrument;
          writeCell(cursor.channel, cursor.row, 1, -1, ((old & 0x0F) << 4) | h, -1, -1, -1);
          break;
        }
        case 2: { // Ctrl (single hex digit)
          writeCell(cursor.channel, cursor.row, 2, -1, -1, h, -1, -1);
          break;
        }
        case 3: { // Volume (2 hex digits)
          const old = step.volume === 0xFF ? 0 : step.volume;
          writeCell(cursor.channel, cursor.row, 3, -1, -1, -1, ((old & 0x0F) << 4) | h, -1);
          break;
        }
        case 4: { // Command (4 hex digits)
          const old = step.command;
          writeCell(cursor.channel, cursor.row, 4, -1, -1, -1, -1, ((old & 0x0FFF) << 4) | h);
          break;
        }
      }
      setCursorState(c => ({ ...c, row: Math.min(trackLength - 1, c.row + 1) }));
      return;
    }
  }, [trackLength, numChannels, NUM_COLUMNS, cursor, octave, KEY_TO_NOTE, writeCell, channelPatterns, nativeData]);

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
    const c1 = NOTE_W + COL_GAP;
    const c2 = c1 + INS_W + COL_GAP;
    const c3 = c2 + CTRL_W + COL_GAP;
    const c4 = c3 + VOL_W + COL_GAP;
    if (inCh >= c4) column = 4;
    else if (inCh >= c3) column = 3;
    else if (inCh >= c2) column = 2;
    else if (inCh >= c1) column = 1;
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
