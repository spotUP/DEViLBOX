/**
 * PixiMusicLineTrackTable — Editable Pixi port of MusicLineTrackTableEditor.
 *
 * Per-channel track table matrix view for MusicLine / per-channel independent
 * track table formats. Shows VISIBLE_ROWS rows centered on the current position.
 *
 * Editing: hex nibble entry matching PixiHivelyPositionEditor pattern.
 * Arrow keys navigate, Tab jumps channels, hex digits (0-9, A-F) write values.
 */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { Container as ContainerType, Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { useTrackerStore, useFormatStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { ML_TRACK_CMD_FLAG, ML_TRACK_CMD_END, ML_TRACK_CMD_JUMP, ML_TRACK_CMD_WAIT } from '@/lib/import/formats/MusicLineParser';

// Layout constants — matches DOM MusicLineTrackTableEditor
const ROW_HEIGHT = 18;
const POS_COL_WIDTH = 36;
const CHAN_COL_WIDTH = 52;
const HEADER_HEIGHT = 20;
const VISIBLE_ROWS = 7;
const FONT_SIZE = 11;
const TEXT_Y = 3;
const CHAR_PX = 8;

const HEX = '0123456789abcdef';
const DIGIT_COLS = 2; // hi and lo nibble

// HivelyTracker palette (hex)
const HVL_BG        = 0x000000;
const HVL_HEADER_BG = 0x111111;
const HVL_HIGHLIGHT  = 0x780000;
const HVL_TEXT       = 0xffffff;
const HVL_CURSOR     = 0xffff88;
const HVL_DIM        = 0x808080;
const HVL_BORDER     = 0x333333;
const HVL_SEP        = 0x222222;
const HVL_SPEED      = 0xfbbf24;
const HVL_CMD        = 0xff6688; // special command color (END/JUMP/WAIT)

/** Format a track table entry for Pixi display (3 chars). */
function formatTrackEntryPixi(val: number): string {
  if (val & ML_TRACK_CMD_FLAG) {
    const cmdType = val & 0xFF00;
    const param = val & 0xFF;
    if (cmdType === ML_TRACK_CMD_END) return 'END';
    if (cmdType === (ML_TRACK_CMD_JUMP & 0xFF00)) return 'J' + param.toString(16).toUpperCase().padStart(2, '0');
    if (cmdType === (ML_TRACK_CMD_WAIT & 0xFF00)) return 'W' + param.toString(16).toUpperCase().padStart(2, '0');
    return '???';
  }
  return val.toString(16).toUpperCase().padStart(2, '0');
}

interface Props {
  width: number;
  height: number;
  onSeek?: (position: number) => void;
}

export const PixiMusicLineTrackTable: React.FC<Props> = ({ width, height, onSeek }) => {
  usePixiTheme(); // subscribe to theme updates

  const channelTrackTables = useFormatStore((s) => s.channelTrackTables);
  const channelSpeeds = useFormatStore((s) => s.channelSpeeds);
  const setTrackEntry = useFormatStore((s) => s.setMusicLineTrackEntry);
  const currentPos = useTrackerStore((s) => s.currentPositionIndex);
  const initialSpeed = useTransportStore((s) => s.speed);

  const [curCh, setCurCh] = useState(0);
  const [curDigit, setCurDigit] = useState(0);
  const [focused, setFocused] = useState(false);

  const containerRef = useRef<ContainerType>(null);
  const focusedRef = useRef(false);
  focusedRef.current = focused;

  // Derived layout values
  const numChannels = channelTrackTables?.length ?? 0;
  const maxPositions = channelTrackTables
    ? Math.max(0, ...channelTrackTables.map((t) => t.length))
    : 0;

  // Center VISIBLE_ROWS around currentPos (same logic as DOM version)
  const halfVisible = Math.floor(VISIBLE_ROWS / 2);
  const startPos = Math.max(0, Math.min(currentPos - halfVisible, maxPositions - VISIBLE_ROWS));
  const endPos = Math.min(maxPositions, startPos + VISIBLE_ROWS);
  const visiblePositions = useMemo(
    () => Array.from({ length: endPos - startPos }, (_, i) => startPos + i),
    [startPos, endPos],
  );

  const totalWidth = POS_COL_WIDTH + numChannels * CHAN_COL_WIDTH;

  // Clipping mask
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const m = new Graphics();
    m.rect(0, 0, width, height).fill({ color: 0xffffff });
    c.mask = m;
    return () => { c.mask = null; m.destroy(); };
  }, [width, height]);

  // State refs for keyboard handler
  const stateRef = useRef({ currentPos, curCh, curDigit, numChannels, maxPositions });
  stateRef.current = { currentPos, curCh, curDigit, numChannels, maxPositions };

  // Track tables ref for keyboard handler
  const trackTablesRef = useRef(channelTrackTables);
  trackTablesRef.current = channelTrackTables;

  // ── Keyboard handler (window-level, only when focused) ─────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!focusedRef.current) return;
      const { currentPos: cp, curCh: cc, curDigit: cd, numChannels: nc, maxPositions: mp } = stateRef.current;
      const tables = trackTablesRef.current;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          onSeek?.(Math.max(0, cp - 1));
          return;
        case 'ArrowDown':
          e.preventDefault();
          onSeek?.(Math.min(mp - 1, cp + 1));
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
      }

      // Hex digit entry
      const hi = HEX.indexOf(e.key.toLowerCase());
      if (hi < 0) return;
      e.preventDefault();

      if (!tables) return;
      const cur = tables[cc]?.[cp] ?? 0;
      const newVal = cd === 0
        ? (hi << 4) | (cur & 0x0F)
        : (cur & 0xF0) | hi;

      setTrackEntry(cc, cp, newVal & 0xFF);

      // Advance cursor
      if (cd + 1 < DIGIT_COLS) setCurDigit(cd + 1);
      else if (cc < nc - 1) { setCurCh(cc + 1); setCurDigit(0); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSeek, setTrackEntry]);

  // ── Pointer interaction: click to select cell + digit ──────────────────────
  const handlePointerDown = useCallback(
    (e: FederatedPointerEvent) => {
      setFocused(true);
      const c = containerRef.current;
      if (!c) return;
      const local = c.toLocal(e.global);
      if (local.y < HEADER_HEIGHT) return;
      const rowIdx = Math.floor((local.y - HEADER_HEIGHT) / ROW_HEIGHT);
      if (rowIdx >= 0 && rowIdx < visiblePositions.length) {
        const pos = visiblePositions[rowIdx];
        if (pos !== undefined) onSeek?.(pos);
      }
      if (local.x >= POS_COL_WIDTH) {
        const ch = Math.floor((local.x - POS_COL_WIDTH) / CHAN_COL_WIDTH);
        if (ch >= 0 && ch < numChannels) {
          setCurCh(ch);
          const rel = local.x - (POS_COL_WIDTH + ch * CHAN_COL_WIDTH);
          const charIdx = Math.floor(rel / CHAR_PX);
          setCurDigit(charIdx <= 0 ? 0 : 1);
        }
      }
    },
    [onSeek, visiblePositions, numChannels],
  );

  // ── Draw background (header + row backgrounds + borders + cursor) ──────────
  const drawBg = useCallback(
    (g: GraphicsType) => {
      g.clear();

      // Full background
      g.rect(0, 0, totalWidth, HEADER_HEIGHT + VISIBLE_ROWS * ROW_HEIGHT);
      g.fill({ color: HVL_BG });

      // Header
      g.rect(0, 0, totalWidth, HEADER_HEIGHT);
      g.fill({ color: HVL_HEADER_BG });

      // Header bottom border
      g.rect(0, HEADER_HEIGHT - 1, totalWidth, 1);
      g.fill({ color: HVL_BORDER });

      // Row backgrounds
      for (let i = 0; i < visiblePositions.length; i++) {
        const pos = visiblePositions[i];
        const isCurrent = pos === currentPos;
        const y = HEADER_HEIGHT + i * ROW_HEIGHT;

        if (isCurrent) {
          g.rect(0, y, totalWidth, ROW_HEIGHT);
          g.fill({ color: HVL_HIGHLIGHT });

          // Cursor highlight on active digit
          const cx = POS_COL_WIDTH + curCh * CHAN_COL_WIDTH + 4 + curDigit * CHAR_PX;
          g.rect(cx, y, CHAR_PX, ROW_HEIGHT);
          g.fill({ color: HVL_CURSOR, alpha: 0.4 });
        }

        // Channel column separators
        for (let ch = 0; ch < numChannels; ch++) {
          const x = POS_COL_WIDTH + ch * CHAN_COL_WIDTH;
          g.rect(x, y, 1, ROW_HEIGHT);
          g.fill({ color: isCurrent ? HVL_BG : HVL_SEP });
        }
      }

      // Header channel borders
      for (let ch = 0; ch < numChannels; ch++) {
        const x = POS_COL_WIDTH + ch * CHAN_COL_WIDTH;
        g.rect(x, 0, 1, HEADER_HEIGHT);
        g.fill({ color: HVL_BORDER });
      }

      // Invisible anchor rect to establish correct Yoga content bounds
      g.rect(0, 0, width, height);
      g.fill({ color: 0x000000, alpha: 0 });
    },
    [totalWidth, visiblePositions, currentPos, numChannels, width, height, curCh, curDigit],
  );

  // ── Text labels ───────────────────────────────────────────────────────────
  const labels = useMemo(() => {
    if (!channelTrackTables || numChannels === 0) return [];

    const out: {
      x: number;
      y: number;
      text: string;
      color: number;
    }[] = [];

    // Header: "Pos"
    out.push({
      x: 4,
      y: TEXT_Y,
      text: 'Pos',
      color: HVL_DIM,
    });

    // Header: channel labels + optional speed
    for (let ch = 0; ch < numChannels; ch++) {
      const chSpeed = channelSpeeds?.[ch];
      const showSpeed = chSpeed !== undefined && chSpeed !== initialSpeed;
      const x = POS_COL_WIDTH + ch * CHAN_COL_WIDTH + CHAN_COL_WIDTH / 2;
      const baseY = showSpeed
        ? (HEADER_HEIGHT - FONT_SIZE * 2 - 2) / 2
        : TEXT_Y;

      out.push({ x: x - 12, y: baseY, text: `CH${ch + 1}`, color: HVL_DIM });

      if (showSpeed) {
        out.push({
          x: x - 16,
          y: baseY + FONT_SIZE + 1,
          text: `S:${chSpeed}`,
          color: HVL_SPEED,
        });
      }
    }

    // Position rows
    for (let i = 0; i < visiblePositions.length; i++) {
      const pos = visiblePositions[i];
      const isCurrent = pos === currentPos;
      const rowY = HEADER_HEIGHT + i * ROW_HEIGHT + TEXT_Y;

      // Position number (hex) + ">" indicator
      const posText = `${isCurrent ? '>' : '\u00a0'}${pos.toString(16).toUpperCase().padStart(2, '0')}`;
      out.push({
        x: 2,
        y: rowY,
        text: posText,
        color: isCurrent ? HVL_CURSOR : HVL_DIM,
      });

      // Track entry per channel (pattern index or special command)
      for (let ch = 0; ch < numChannels; ch++) {
        const entry = channelTrackTables[ch]?.[pos];
        const isEmpty = entry === undefined;
        const isCmd = !isEmpty && !!(entry & ML_TRACK_CMD_FLAG);
        const cellX = POS_COL_WIDTH + ch * CHAN_COL_WIDTH + 4;
        out.push({
          x: cellX,
          y: rowY,
          text: isEmpty ? '\u00b7\u00b7' : formatTrackEntryPixi(entry),
          color: isEmpty ? HVL_DIM : isCmd ? HVL_CMD : HVL_TEXT,
        });
      }
    }

    return out;
  }, [channelTrackTables, channelSpeeds, numChannels, initialSpeed, visiblePositions, currentPos]);

  // Nothing to render if no channel data
  if (!channelTrackTables || numChannels === 0) return null;

  return (
    <pixiContainer
      ref={containerRef}
      layout={{ width, height }}
      eventMode="static"
      cursor="pointer"
      onPointerDown={handlePointerDown}
    >
      {/* Backgrounds + borders + cursor */}
      <pixiGraphics
        draw={drawBg}
        layout={{ position: 'absolute', width, height }}
      />

      {/* Text labels — positioned with absolute x/y to avoid Yoga variable-count issues */}
      {labels.map((label, i) => (
        <pixiBitmapText
          key={`ttl-${i}`}
          text={label.text}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }}
          tint={label.color}
          x={label.x}
          y={label.y}
        />
      ))}
    </pixiContainer>
  );
};
