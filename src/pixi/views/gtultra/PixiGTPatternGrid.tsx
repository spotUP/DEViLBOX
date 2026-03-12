/**
 * PixiGTPatternGrid — MegaText-based pattern renderer for GoatTracker Ultra.
 *
 * Uses the MegaText batched renderer for all cell text (single draw call),
 * and separate Graphics layers for backgrounds/cursor/selection overlays.
 *
 * GoatTracker cell layout per channel:
 *   [Note 3ch] [Inst 2hex] [Cmd 2hex] [Data 2hex]
 *   "C-3 01 0F 00" — 11 chars per channel
 *
 * Pattern data is 4 bytes per cell: [note, instrument, command, data]
 */

import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import type { Container as ContainerType, Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '@/pixi/fonts';
import { MegaText, type GlyphLabel } from '@/pixi/utils/MegaText';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import { usePixiTheme } from '../../theme';

// ── Layout constants ──
const FONT_SIZE = 11;
const CHAR_W = 7;    // approx width of monospace char at 11px
const ROW_H = 16;
const ROW_NUM_W = 24; // "00 " prefix
const NOTE_W = CHAR_W * 3;
const HEX_W = CHAR_W * 2;
const COL_GAP = 4;
const CHAN_GAP = 10;
const HEADER_H = 20;
const CHANNEL_W = NOTE_W + COL_GAP + HEX_W + COL_GAP + HEX_W + COL_GAP + HEX_W;

// ── Colors (FT2 neutral dark theme) ──
const C_BG         = 0x0d0d0d;
const C_BG_ALT     = 0x141414;
const C_HEADER     = 0x1a1a1a;
const C_HEADER_TXT = 0x888888;
const C_ROW_NUM    = 0x555555;
const C_NOTE       = 0xe0e0e0;
const C_INSTR      = 0x60e060;
const C_CMD        = 0xffcc00;
const C_DATA       = 0xff8866;
const C_EMPTY      = 0x333333;
const C_CURSOR     = 0xffffff;
const C_CURSOR_BG  = 0x333333;
const C_PLAY_ROW   = 0x2a1520;
const C_SEL        = 0x3355aa;
const C_CHAN_SEP    = 0x222222;

// ── Helpers ──
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteStr(n: number): string {
  if (n === 0 || n === 0xBD) return '...'; // 0=empty, 0xBD=REST
  if (n === 0xBE) return '==='; // keyoff
  if (n === 0xBF) return '+++'; // keyon
  if (n >= 0xC0) return '...'; // ENDPATT and other special values
  const v = n - 1;
  return `${NOTE_NAMES[v % 12]}${Math.floor(v / 12)}`;
}

function hexStr(v: number): string {
  return v === 0 ? '..' : v.toString(16).toUpperCase().padStart(2, '0');
}

interface Props {
  width: number;
  height: number;
}

export const PixiGTPatternGrid: React.FC<Props> = ({ width, height }) => {
  const theme = usePixiTheme();
  const gridRef = useRef<GraphicsType>(null);
  const overlayRef = useRef<GraphicsType>(null);
  const megaRef = useRef<MegaText | null>(null);
  const containerRef = useRef<ContainerType>(null);

  const cursor = useGTUltraStore((s) => s.cursor);
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const selection = useGTUltraStore((s) => s.selection);
  const patternLength = useGTUltraStore((s) => s.patternLength);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const playing = useGTUltraStore((s) => s.playing);
  const followPlay = useGTUltraStore((s) => s.followPlay);
  const recordMode = useGTUltraStore((s) => s.recordMode);
  const orderCursor = useGTUltraStore((s) => s.orderCursor);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const channelCount = sidCount * 3;

  // Refs for WASM data (updated via subscription, no re-render on each frame)
  const patternDataRef = useRef(useGTUltraStore.getState().patternData);
  const orderDataRef = useRef(useGTUltraStore.getState().orderData);

  const visibleRows = Math.floor((height - HEADER_H) / ROW_H);

  // Determine which order position to show: use playback pos when following, else orderCursor
  const orderPos = useMemo(() => {
    return (playing && followPlay) ? playbackPos.position : orderCursor;
  }, [playing, followPlay, playbackPos.position, orderCursor]);

  // Scroll row: center active row
  const scrollRow = useMemo(() => {
    const target = playing && followPlay ? playbackPos.row : cursor.row;
    const half = Math.floor(visibleRows / 2);
    return Math.max(0, Math.min(target - half, patternLength - visibleRows + 1));
  }, [cursor.row, playbackPos.row, playing, followPlay, visibleRows, patternLength]);

  // ── Initialize MegaText ──
  useEffect(() => {
    const mega = new MegaText();
    megaRef.current = mega;
    if (containerRef.current) {
      containerRef.current.addChild(mega);
    }
    return () => {
      mega.destroy();
      megaRef.current = null;
    };
  }, []);

  // ── Generate labels + draw grid ──
  const imperativeRedraw = useCallback(() => {
    const grid = gridRef.current;
    const overlay = overlayRef.current;
    const mega = megaRef.current;
    if (!grid || !overlay || !mega) return;

    const c = cursorRef.current;
    const labels: GlyphLabel[] = [];
    const fontFamily = PIXI_FONTS.MONO;

    // ── Grid backgrounds ──
    grid.clear();

    // Background
    grid.rect(0, 0, width, height).fill({ color: C_BG });

    // Header bar
    grid.rect(0, 0, width, HEADER_H).fill({ color: C_HEADER });

    // Header channel labels with pattern numbers
    labels.push({ x: 2, y: 3, text: 'ROW', color: C_HEADER_TXT, fontFamily });
    const orderData = orderDataRef.current;
    for (let ch = 0; ch < channelCount; ch++) {
      const patNum = orderData[ch]?.[orderCursor] ?? 0;
      const label = `CH${ch + 1}:${patNum.toString(16).toUpperCase().padStart(2, '0')}`;
      const x = ROW_NUM_W + ch * (CHANNEL_W + CHAN_GAP) + CHANNEL_W / 2 - CHAR_W * label.length / 2;
      labels.push({ x, y: 3, text: label, color: C_HEADER_TXT, fontFamily });
    }

    // Record mode border
    if (recordMode) {
      grid.rect(0, 0, width, height).stroke({ color: theme.error.color, width: 2, alpha: 0.5 });
    }

    // Row backgrounds + labels
    for (let vi = 0; vi < visibleRows; vi++) {
      const row = scrollRow + vi;
      if (row > patternLength) break;
      const y = HEADER_H + vi * ROW_H;

      // Play row highlight
      if (playing && row === playbackPos.row) {
        grid.rect(0, y, width, ROW_H).fill({ color: C_PLAY_ROW });
      } else if (row % 8 === 0) {
        grid.rect(0, y, width, ROW_H).fill({ color: C_BG_ALT });
      }

      // Selection highlight
      if (selection.active) {
        const minR = Math.min(selection.startRow, selection.endRow);
        const maxR = Math.max(selection.startRow, selection.endRow);
        const minC = Math.min(selection.startChannel, selection.endChannel);
        const maxC = Math.max(selection.startChannel, selection.endChannel);
        if (row >= minR && row <= maxR) {
          for (let ch = minC; ch <= maxC; ch++) {
            const sx = ROW_NUM_W + ch * (CHANNEL_W + CHAN_GAP);
            grid.rect(sx, y, CHANNEL_W, ROW_H).fill({ color: C_SEL, alpha: 0.3 });
          }
        }
      }

      // Channel separator lines
      for (let ch = 1; ch < channelCount; ch++) {
        const sx = ROW_NUM_W + ch * (CHANNEL_W + CHAN_GAP) - CHAN_GAP / 2;
        grid.rect(sx, y, 1, ROW_H).fill({ color: C_CHAN_SEP });
      }

      // Row number
      labels.push({
        x: 2,
        y: y + 2,
        text: row.toString(16).toUpperCase().padStart(2, '0'),
        color: C_ROW_NUM,
        fontFamily,
      });

      // Cell data per channel (from WASM pattern data in store)
      for (let ch = 0; ch < channelCount; ch++) {
        const baseX = ROW_NUM_W + ch * (CHANNEL_W + CHAN_GAP);

        // Read from store's patternData cache
        const pData = patternDataRef.current;
        const chOrderData = orderDataRef.current[ch];
        const patIdx = chOrderData ? chOrderData[orderPos] : 0;
        const pat = pData.get(patIdx);
        let note = 0, instr = 0, cmd = 0, param = 0;
        if (pat && row < pat.length) {
          const off = row * 4;
          note = pat.data[off];
          instr = pat.data[off + 1];
          cmd = pat.data[off + 2];
          param = pat.data[off + 3];
        }

        let colX = baseX;

        // Note
        labels.push({ x: colX, y: y + 2, text: noteStr(note), color: (note === 0 || note >= 0xBD) ? C_EMPTY : C_NOTE, fontFamily });
        colX += NOTE_W + COL_GAP;

        // Instrument
        labels.push({ x: colX, y: y + 2, text: hexStr(instr), color: instr === 0 ? C_EMPTY : C_INSTR, fontFamily });
        colX += HEX_W + COL_GAP;

        // Command
        labels.push({ x: colX, y: y + 2, text: hexStr(cmd), color: cmd === 0 ? C_EMPTY : C_CMD, fontFamily });
        colX += HEX_W + COL_GAP;

        // Data
        labels.push({ x: colX, y: y + 2, text: hexStr(param), color: (param === 0 && cmd === 0) ? C_EMPTY : C_DATA, fontFamily });
      }
    }

    // ── Cursor overlay ──
    overlay.clear();
    const cursorRow = c.row;
    if (cursorRow >= scrollRow && cursorRow < scrollRow + visibleRows && !playing) {
      const vi = cursorRow - scrollRow;
      const cy = HEADER_H + vi * ROW_H;
      const cx = ROW_NUM_W + c.channel * (CHANNEL_W + CHAN_GAP);

      let colOff = 0;
      let colW = NOTE_W;
      switch (c.column) {
        case 0: colOff = 0; colW = NOTE_W; break;
        case 1: colOff = NOTE_W + COL_GAP; colW = HEX_W; break;
        case 2: colOff = NOTE_W + COL_GAP + HEX_W + COL_GAP; colW = HEX_W; break;
        case 3: colOff = NOTE_W + COL_GAP + HEX_W + COL_GAP + HEX_W + COL_GAP; colW = HEX_W; break;
      }

      // Cursor background
      overlay.rect(cx + colOff, cy, colW, ROW_H).fill({ color: C_CURSOR_BG, alpha: 0.5 });
      // Cursor border
      overlay.rect(cx + colOff, cy, colW, 1).fill({ color: C_CURSOR });
      overlay.rect(cx + colOff, cy + ROW_H - 1, colW, 1).fill({ color: C_CURSOR });
      overlay.rect(cx + colOff, cy, 1, ROW_H).fill({ color: C_CURSOR });
      overlay.rect(cx + colOff + colW - 1, cy, 1, ROW_H).fill({ color: C_CURSOR });
    }

    // Update MegaText
    mega.updateLabels(labels, FONT_SIZE);
  }, [width, height, scrollRow, visibleRows, patternLength, playbackPos, playing,
      followPlay, selection, channelCount, recordMode, orderCursor, orderPos]);

  // Subscribe to pattern/order data changes for redraw
  useEffect(() => {
    const unsub1 = useGTUltraStore.subscribe(
      (s) => {
        const pd = s.patternData;
        if (pd !== patternDataRef.current) { patternDataRef.current = pd; imperativeRedraw(); }
      }
    );
    const unsub2 = useGTUltraStore.subscribe(
      (s) => {
        const od = s.orderData;
        if (od !== orderDataRef.current) { orderDataRef.current = od; imperativeRedraw(); }
      }
    );
    return () => { unsub1(); unsub2(); };
  }, [imperativeRedraw]);

  // Subscribe to cursor changes for fast overlay redraws
  useEffect(() => {
    const unsub = useGTUltraStore.subscribe(
      (s) => {
        const cur = s.cursor;
        if (cur !== cursorRef.current) {
          cursorRef.current = cur;
          imperativeRedraw();
        }
      }
    );
    return unsub;
  }, [imperativeRedraw]);

  // Redraw when deps change
  useEffect(() => {
    imperativeRedraw();
  }, [imperativeRedraw]);

  // ── Mouse click → set cursor ──
  const handlePointerUp = useCallback((e: { global: { x: number; y: number } }) => {
    const cont = containerRef.current;
    if (!cont) return;
    const local = cont.toLocal(e.global);
    const { x, y } = local;

    if (y < HEADER_H) return;
    const row = scrollRow + Math.floor((y - HEADER_H) / ROW_H);
    if (row > patternLength) return;

    const relX = x - ROW_NUM_W;
    if (relX < 0) return;

    const channel = Math.floor(relX / (CHANNEL_W + CHAN_GAP));
    if (channel >= channelCount) return;

    const inCh = relX - channel * (CHANNEL_W + CHAN_GAP);
    let column = 0;
    if (inCh >= NOTE_W + COL_GAP + HEX_W + COL_GAP + HEX_W + COL_GAP) column = 3;
    else if (inCh >= NOTE_W + COL_GAP + HEX_W + COL_GAP) column = 2;
    else if (inCh >= NOTE_W + COL_GAP) column = 1;

    useGTUltraStore.getState().setCursor({ channel, row, column, digit: 0 });
  }, [scrollRow, patternLength, channelCount]);

  // ── Keyboard ──
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY) * 4;
    const state = useGTUltraStore.getState();
    const newRow = Math.max(0, Math.min(state.patternLength, state.cursor.row + delta));
    state.setCursor({ row: newRow });
  }, []);

  // Attach non-passive wheel listener
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // pixiContainer doesn't have addEventListener, so we use the canvas
    // The wheel handling will be done via the parent view's DOM layer
  }, [handleWheel]);

  return (
    <pixiContainer
      ref={containerRef}
      eventMode="static"
      cursor="default"
      onPointerUp={handlePointerUp}
      layout={{ width, height }}
    >
      {/* Grid backgrounds + separators */}
      <pixiGraphics ref={gridRef} draw={() => {}} />
      {/* Cell text (MegaText added imperatively to container) */}
      {/* Cursor + selection overlay */}
      <pixiGraphics ref={overlayRef} draw={() => {}} />
    </pixiContainer>
  );
};
