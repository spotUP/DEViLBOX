/**
 * PixiMusicLinePatternViewer — Pixel-perfect Pixi port of MusicLinePatternViewer.
 *
 * Read-only multi-channel pattern view for MusicLine mode. Shows all channels'
 * note data simultaneously for the current song position. Each channel plays a
 * different 1-channel pattern at each position; this view assembles them into a
 * side-by-side tracker grid.
 *
 * Auto-scroll: keeps currentRow centred in the viewport by computing a scroll
 * offset and translating the content container, exactly as the DOM version does
 * via scrollRef + el.scrollTop. Wheel scroll is layered on top so the user can
 * also manually browse.
 */

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import type { Graphics as GraphicsType, FederatedWheelEvent } from 'pixi.js';
import { useTrackerStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';

// Row height — must match DOM version
const ROW_H = 18;
const HEADER_H = ROW_H + 2;

// Column layout (matches DOM MusicLinePatternViewer)
const ROW_NUM_W = 36;
const CHAN_W = 80;
const FONT_SIZE = 11;

// Note helpers (copied 1:1 from DOM source)
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteStr(note: number): string {
  if (!note) return '---';
  if (note === 97) return '===';
  const n = note - 1;
  return NOTE_NAMES[n % 12] + Math.floor(n / 12);
}

function instrStr(instr: number): string {
  return instr ? instr.toString(16).toUpperCase().padStart(2, '0') : '--';
}

// ── Colors (Pixi hex) ────────────────────────────────────────────────────────
const C_BG_HEADER    = 0x1a1a1a;
const C_BG_ODD       = 0x0a0a0a;
const C_BG_PLAYHEAD  = 0x1a3a1a;
const C_BORDER       = 0x333333;
const C_SEP          = 0x1e1e1e;
const C_ROW_BEAT     = 0x555555;
const C_ROW_OTHER    = 0x333333;
const C_NOTE         = 0xcccccc;
const C_NOTE_PH      = 0x88ff88;
const C_INSTR        = 0xffaa44;
const C_EMPTY        = 0x333333;
const C_CHAN_HEADER  = 0xaaaaaa;
const C_SCROLLBAR_TRACK = 0x333333;
const C_SCROLLBAR_THUMB = 0x666666;
const SCROLLBAR_W    = 6;

interface Props {
  width: number;
  height: number;
}

export const PixiMusicLinePatternViewer: React.FC<Props> = ({ width, height }) => {
  usePixiTheme(); // subscribe to theme (unused colors kept for future theming parity)

  const channelTrackTables = useTrackerStore((s) => s.channelTrackTables);
  const patterns = useTrackerStore((s) => s.patterns);
  const currentPos = useTrackerStore((s) => s.currentPositionIndex);
  const currentRow = useTransportStore((s) => s.currentRow);

  // Manual scroll offset state (like scrollRef in DOM version)
  const [scrollY, setScrollY] = useState(0);
  // Keep a ref so the wheel handler always has the latest value without depending on state
  const scrollYRef = useRef(0);
  useEffect(() => { scrollYRef.current = scrollY; }, [scrollY]);

  // Auto-scroll: keep currentRow visible (centred), same formula as DOM version
  useEffect(() => {
    const viewH = height - HEADER_H;
    const target = currentRow * ROW_H - viewH / 2 + ROW_H / 2;
    const clamped = Math.max(0, target);
    setScrollY(clamped);
    scrollYRef.current = clamped;
  }, [currentRow, height]);

  // Resolve each channel's pattern for the current position
  const channelPatterns = useMemo(() => {
    if (!channelTrackTables) return [];
    return channelTrackTables.map((table) => {
      const patIdx = table[currentPos] ?? 0;
      return patterns[patIdx] ?? null;
    });
  }, [channelTrackTables, patterns, currentPos]);

  const numChannels = channelPatterns.length;
  const numRows = channelPatterns[0]?.length ?? 128;
  const contentH = numRows * ROW_H;
  const viewH = height - HEADER_H;
  const maxScroll = Math.max(0, contentH - viewH);
  const totalWidth = ROW_NUM_W + numChannels * CHAN_W;

  // Wheel scroll handler
  const handleWheel = useCallback((e: FederatedWheelEvent) => {
    e.stopPropagation();
    setScrollY((prev) => {
      const next = Math.max(0, Math.min(maxScroll, prev + e.deltaY));
      scrollYRef.current = next;
      return next;
    });
  }, [maxScroll]);

  // ── Draw header background ───────────────────────────────────────────────
  const drawHeader = useCallback((g: GraphicsType) => {
    g.clear();

    // Header background
    g.rect(0, 0, width, HEADER_H);
    g.fill({ color: C_BG_HEADER });

    // Header bottom border
    g.rect(0, HEADER_H - 1, width, 1);
    g.fill({ color: C_BORDER });

    // Channel separator lines in header
    for (let ch = 0; ch < numChannels; ch++) {
      const x = ROW_NUM_W + ch * CHAN_W;
      g.rect(x, 0, 1, HEADER_H);
      g.fill({ color: C_BORDER });
    }

    // Anchor rect to establish Yoga content bounds
    g.rect(0, 0, width, HEADER_H);
    g.fill({ color: 0x000000, alpha: 0 });
  }, [width, numChannels]);

  // ── Draw scrollable content background ──────────────────────────────────
  const drawContent = useCallback((g: GraphicsType) => {
    g.clear();

    // Clip background
    g.rect(0, 0, width, viewH);
    g.fill({ color: 0x0d0d0d });

    const firstVisible = Math.floor(scrollY / ROW_H);
    const lastVisible = Math.min(numRows - 1, Math.ceil((scrollY + viewH) / ROW_H));

    for (let rowIdx = firstVisible; rowIdx <= lastVisible; rowIdx++) {
      const y = rowIdx * ROW_H - scrollY;
      if (y + ROW_H < 0 || y > viewH) continue;

      const isPlayhead = rowIdx === currentRow;
      const isEvenGroup = Math.floor(rowIdx / 4) % 2 === 0;

      // Row background
      if (isPlayhead) {
        g.rect(0, y, totalWidth, ROW_H);
        g.fill({ color: C_BG_PLAYHEAD });
      } else if (!isEvenGroup) {
        g.rect(0, y, totalWidth, ROW_H);
        g.fill({ color: C_BG_ODD });
      }

      // Beat group bottom border (every 4 rows)
      if (rowIdx % 4 === 3) {
        g.rect(0, y + ROW_H - 1, totalWidth, 1);
        g.fill({ color: C_SEP });
      }

      // Channel separators
      for (let ch = 0; ch < numChannels; ch++) {
        const x = ROW_NUM_W + ch * CHAN_W;
        g.rect(x, y, 1, ROW_H);
        g.fill({ color: C_SEP });
      }
    }

    // Scrollbar
    if (maxScroll > 0) {
      const trackH = viewH - 4;
      const thumbH = Math.max(20, (viewH / contentH) * trackH);
      const thumbY = 2 + (scrollY / maxScroll) * (trackH - thumbH);

      g.roundRect(width - SCROLLBAR_W - 2, 2, SCROLLBAR_W, trackH, 3);
      g.fill({ color: C_SCROLLBAR_TRACK, alpha: 0.4 });

      g.roundRect(width - SCROLLBAR_W - 2, thumbY, SCROLLBAR_W, thumbH, 3);
      g.fill({ color: C_SCROLLBAR_THUMB, alpha: 0.6 });
    }

    // Anchor rect to establish Yoga content bounds
    g.rect(0, 0, width, viewH);
    g.fill({ color: 0x000000, alpha: 0 });
  }, [width, viewH, scrollY, numRows, currentRow, totalWidth, numChannels, maxScroll, contentH]);

  // ── Text labels ──────────────────────────────────────────────────────────
  const headerLabels = useMemo(() => {
    const out: { x: number; y: number; text: string; color: number }[] = [];

    // "ROW" column header
    out.push({
      x: 2,
      y: (HEADER_H - FONT_SIZE) / 2,
      text: 'ROW',
      color: 0x555555,
    });

    // Channel headers: "CH1 P:00"
    for (let ch = 0; ch < numChannels; ch++) {
      const patIdx = channelTrackTables?.[ch]?.[currentPos] ?? 0;
      const pat = patterns[patIdx];
      const label = `CH${ch + 1} ${pat ? `P:${patIdx.toString().padStart(2, '0')}` : '???'}`;
      out.push({
        x: ROW_NUM_W + ch * CHAN_W + 4,
        y: (HEADER_H - FONT_SIZE) / 2,
        text: label,
        color: C_CHAN_HEADER,
      });
    }

    return out;
  }, [numChannels, channelTrackTables, currentPos, patterns]);

  const contentLabels = useMemo(() => {
    const out: { x: number; y: number; text: string; color: number }[] = [];

    const firstVisible = Math.floor(scrollY / ROW_H);
    const lastVisible = Math.min(numRows - 1, Math.ceil((scrollY + viewH) / ROW_H));

    for (let rowIdx = firstVisible; rowIdx <= lastVisible; rowIdx++) {
      const y = rowIdx * ROW_H - scrollY + (ROW_H - FONT_SIZE) / 2;
      if (y + ROW_H < 0 || y > viewH) continue;

      const isPlayhead = rowIdx === currentRow;

      // Row number
      const rowNumColor = rowIdx % 4 === 0 ? C_ROW_BEAT : C_ROW_OTHER;
      out.push({
        x: 2,
        y,
        text: rowIdx.toString().padStart(3, '0'),
        color: rowNumColor,
      });

      // Each channel cell: note + instrument
      for (let ch = 0; ch < numChannels; ch++) {
        const pat = channelPatterns[ch];
        const cell = pat?.channels[0]?.rows[rowIdx];
        const hasNote = cell !== undefined && cell.note > 0;
        const cellX = ROW_NUM_W + ch * CHAN_W + 4;

        const noteColor = hasNote
          ? isPlayhead ? C_NOTE_PH : C_NOTE
          : C_EMPTY;
        const instrColor =
          hasNote && cell && cell.instrument ? C_INSTR : C_EMPTY;

        out.push({
          x: cellX,
          y,
          text: cell ? noteStr(cell.note) : '---',
          color: noteColor,
        });

        out.push({
          x: cellX + 28,
          y,
          text: cell ? instrStr(cell.instrument) : '--',
          color: instrColor,
        });
      }
    }

    return out;
  }, [scrollY, numRows, viewH, currentRow, numChannels, channelPatterns]);

  // ── No data guard ────────────────────────────────────────────────────────
  if (!channelTrackTables || channelTrackTables.length === 0) {
    return (
      <pixiContainer layout={{ width, height }}>
        <pixiBitmapText
          text="No channel data"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }}
          tint={0x555555}
          x={8}
          y={8}
        />
      </pixiContainer>
    );
  }

  return (
    <pixiContainer
      layout={{ width, height, flexDirection: 'column' }}
      eventMode="static"
      onWheel={handleWheel}
    >
      {/* ── Sticky header ───────────────────────────────────────────── */}
      <pixiContainer layout={{ width, height: HEADER_H }}>
        <pixiGraphics
          draw={drawHeader}
          layout={{ position: 'absolute', width, height: HEADER_H }}
        />
        {headerLabels.map((label, i) => (
          <pixiBitmapText
            key={`hl-${i}`}
            text={label.text}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }}
            tint={label.color}
            x={label.x}
            y={label.y}
          />
        ))}
      </pixiContainer>

      {/* ── Scrollable content area ──────────────────────────────────── */}
      <pixiContainer layout={{ width, height: viewH }}>
        {/* Row backgrounds + scrollbar */}
        <pixiGraphics
          draw={drawContent}
          layout={{ position: 'absolute', width, height: viewH }}
        />

        {/* Cell text — absolute x/y to avoid Yoga variable-count issues */}
        {contentLabels.map((label, i) => (
          <pixiBitmapText
            key={`cl-${i}`}
            text={label.text}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff }}
            tint={label.color}
            x={label.x}
            y={label.y}
          />
        ))}
      </pixiContainer>
    </pixiContainer>
  );
};
