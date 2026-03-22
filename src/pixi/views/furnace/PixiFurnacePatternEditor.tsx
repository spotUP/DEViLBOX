/**
 * PixiFurnacePatternEditor - Per-Channel Pattern Editor
 * Pure Pixi GL rendering — no DOM elements.
 *
 * Layout:
 * ┌────┬───────────────────────┬───────────────────────┬─────
 * │ Row│ Channel 0             │ Channel 1             │ ...
 * │    │ Note Ins Vol Fx1 Fx2  │ Note Ins Vol Fx1 Fx2  │
 * ├────┼───────────────────────┼───────────────────────┤
 * │ 00 │ C-5  0A  7F  0C50     │ --- -- --  ----       │
 * │ 01 │ --- -- --  ----       │ D#4  03  40  0100     │
 * └────┴───────────────────────┴───────────────────────┘
 */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { Container as ContainerType, Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { usePixiTheme } from '@/pixi/theme';
import { useTransportStore } from '@/stores/useTransportStore';
import { useUIStore } from '@/stores/useUIStore';
import { PIXI_FONTS } from '@/pixi/fonts';
import type { FurnaceNativeData, FurnaceRow } from '@/types';

const ROW_HEIGHT    = 20;
const ROW_NUM_WIDTH = 32;
const CHAR_WIDTH    = 8;
const NOTE_WIDTH    = CHAR_WIDTH * 3 + 4;  // 28
const INS_WIDTH     = CHAR_WIDTH * 2 + 4;  // 20
const VOL_WIDTH     = CHAR_WIDTH * 2 + 4;  // 20
const EFF_WIDTH     = CHAR_WIDTH * 4 + 4;  // 36  (cmd 2 + val 2)
const CHANNEL_GAP   = 2;
const HEADER_HEIGHT = 24;
const FONT_SIZE     = 11;
const TEXT_Y        = 4;

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function formatFurnaceNote(noteVal: number): string {
  if (noteVal === -1)  return '---';
  if (noteVal === 253) return '===';
  if (noteVal === 254) return 'REL';
  if (noteVal === 255) return 'MRL';
  if (noteVal >= 0 && noteVal < 180) {
    return `${NOTE_NAMES[noteVal % 12]}${Math.floor(noteVal / 12)}`;
  }
  return '---';
}

function formatHex(val: number, digits: number): string {
  if (val === -1) return '-'.repeat(digits);
  return val.toString(16).toUpperCase().padStart(digits, '0');
}

type PixiTheme = ReturnType<typeof usePixiTheme>;

function effectColor(cmd: number, theme: PixiTheme): number {
  if (cmd <= 0) return theme.cellEmpty.color;
  if (cmd >= 1 && cmd <= 3)                                                          return 0x00ff00;
  if (cmd === 0x0A || cmd === 0x05 || cmd === 0x06 || cmd === 0x07 || cmd === 0x0C) return 0xff8800;
  if (cmd === 0x08)                                                                  return 0xff00ff;
  if (cmd === 0x0F || cmd === 0x09)                                                  return 0xffff00;
  if (cmd === 0x0B || cmd === 0x0D)                                                  return 0xff4444;
  return theme.cellEffect.color;
}

// X offset of a sub-column within a channel, relative to channel start x
function subColX(col: 'note' | 'ins' | 'vol' | number): number {
  switch (col) {
    case 'note': return 0;
    case 'ins':  return NOTE_WIDTH;
    case 'vol':  return NOTE_WIDTH + INS_WIDTH;
    default:     return NOTE_WIDTH + INS_WIDTH + VOL_WIDTH + (col as number) * EFF_WIDTH;
  }
}

function subColW(col: 'note' | 'ins' | 'vol' | number): number {
  switch (col) {
    case 'note': return NOTE_WIDTH;
    case 'ins':  return INS_WIDTH;
    case 'vol':  return VOL_WIDTH;
    default:     return EFF_WIDTH;
  }
}

interface FurnacePatternEditorProps {
  width: number;
  height: number;
  nativeData: FurnaceNativeData;
  currentPosition: number;
  playbackRow: number;
}

export const PixiFurnacePatternEditor: React.FC<FurnacePatternEditorProps> = ({
  width, height, nativeData, currentPosition, playbackRow,
}) => {
  const theme     = usePixiTheme();
  const isPlaying = useTransportStore(s => s.isPlaying);

  const sub         = nativeData.subsongs[nativeData.activeSubsong];
  const numChannels = sub?.channels.length ?? 0;
  const patLen      = sub?.patLen ?? 64;

  const [cursorRow,  setCursorRow]  = useState(0);
  const [cursorChan, setCursorChan] = useState(0);
  const [cursorCol,  setCursorCol]  = useState<'note' | 'ins' | 'vol' | number>('note');
  const [scrollTop,  setScrollTop]  = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [focused,    setFocused]    = useState(false);
  // Per-channel collapse: 0=full, 1=hide effects, 2=hide vol+effects, 3=note only
  const [chanCollapse, setChanCollapse] = useState<number[]>([]);

  const containerRef  = useRef<ContainerType>(null);
  const scrollTopRef  = useRef(0);
  const scrollLeftRef = useRef(0);
  const focusedRef    = useRef(false);
  focusedRef.current  = focused;

  // Use ref for playback row to avoid React re-renders on every row tick
  const playbackRowRef = useRef(playbackRow);
  playbackRowRef.current = playbackRow;

  // Per-channel pixel widths (respects collapse state)
  const channelWidths = useMemo(() => {
    if (!sub) return [] as number[];
    return sub.channels.map((ch, i) => {
      const collapse = chanCollapse[i] ?? 0;
      if (collapse >= 3) return NOTE_WIDTH + CHANNEL_GAP;  // note only
      if (collapse >= 2) return NOTE_WIDTH + INS_WIDTH + CHANNEL_GAP;  // hide vol + fx
      if (collapse >= 1) return NOTE_WIDTH + INS_WIDTH + VOL_WIDTH + CHANNEL_GAP;  // hide fx
      return NOTE_WIDTH + INS_WIDTH + VOL_WIDTH + ch.effectCols * EFF_WIDTH + CHANNEL_GAP;  // full
    });
  }, [sub, chanCollapse]);

  // Cumulative channel start x (absolute, before scroll offset)
  const chanXStartsRaw = useMemo(() => {
    const starts: number[] = [];
    let x = ROW_NUM_WIDTH;
    for (const w of channelWidths) { starts.push(x); x += w; }
    return starts;
  }, [channelWidths]);

  const totalW     = ROW_NUM_WIDTH + channelWidths.reduce((s, w) => s + w, 0);
  // Center pattern horizontally when content is narrower than viewport
  const centerOffsetX = totalW < width ? Math.floor((width - totalW) / 2) : 0;
  const chanXStarts = useMemo(() =>
    chanXStartsRaw.map(x => x + centerOffsetX),
  [chanXStartsRaw, centerOffsetX]);
  const visRows    = Math.floor((height - HEADER_HEIGHT) / ROW_HEIGHT);
  const maxScrollY = Math.max(0, patLen * ROW_HEIGHT - visRows * ROW_HEIGHT);
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

  // Auto-scroll vertical to keep cursor/playback row visible
  // During playback, use RAF to check playback row from ref (avoids React re-render per row)
  const bgGraphicsRef = useRef<GraphicsType>(null);
  useEffect(() => {
    if (!isPlaying) {
      // Idle: scroll to cursor
      const rowY = cursorRow * ROW_HEIGHT;
      const s = scrollTopRef.current;
      if (rowY < s || rowY >= s + visRows * ROW_HEIGHT) {
        const next = Math.max(0, Math.min(maxScrollY, rowY - Math.floor(visRows / 2) * ROW_HEIGHT));
        scrollTopRef.current = next;
        setScrollTop(next);
      }
      return;
    }
    // Playing: RAF loop for smooth scroll + playback highlight
    let rafId = 0;
    let lastRow = -1;
    const tick = () => {
      const row = playbackRowRef.current;
      if (row !== lastRow) {
        lastRow = row;
        const rowY = row * ROW_HEIGHT;
        const s = scrollTopRef.current;
        if (rowY < s || rowY >= s + visRows * ROW_HEIGHT) {
          const next = Math.max(0, Math.min(maxScrollY, rowY - Math.floor(visRows / 2) * ROW_HEIGHT));
          scrollTopRef.current = next;
          setScrollTop(next);
        }
        // Imperatively redraw the background graphics for playback cursor
        if (bgGraphicsRef.current) {
          drawBgRef.current(bgGraphicsRef.current);
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [cursorRow, isPlaying, visRows, maxScrollY]);

  // Auto-scroll horizontal to keep cursor channel visible
  useEffect(() => {
    if (cursorChan >= chanXStarts.length) return;
    const chX = chanXStarts[cursorChan];
    const chW = channelWidths[cursorChan];
    const sl  = scrollLeftRef.current;
    if (chX - sl < ROW_NUM_WIDTH) {
      const next = Math.max(0, chX - ROW_NUM_WIDTH);
      scrollLeftRef.current = next;
      setScrollLeft(next);
    } else if (chX + chW - sl > width) {
      const next = Math.min(maxScrollX, chX + chW - width);
      scrollLeftRef.current = next;
      setScrollLeft(next);
    }
  }, [cursorChan, chanXStarts, channelWidths, maxScrollX, width]);

  // Wheel scroll — native canvas listener with bounds check
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

  // Keyboard navigation — fresh state via ref pattern
  const stateRef = useRef({ cursorRow, cursorChan, cursorCol, patLen, numChannels, sub });
  stateRef.current = { cursorRow, cursorChan, cursorCol, patLen, numChannels, sub };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!focusedRef.current) return;
      const { cursorRow: cr, cursorChan: cc, cursorCol: ccol,
              patLen: pl, numChannels: nc, sub: s } = stateRef.current;
      void cr; // used via setCursorRow functional update
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setCursorRow(r => Math.max(0, r - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setCursorRow(r => Math.min(pl - 1, r + 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (ccol === 'note') {
            if (cc > 0) {
              const prevEff = s?.channels[cc - 1]?.effectCols ?? 1;
              setCursorChan(c => c - 1);
              setCursorCol(prevEff - 1);
            }
          } else if (ccol === 'ins') {
            setCursorCol('note');
          } else if (ccol === 'vol') {
            setCursorCol('ins');
          } else if (typeof ccol === 'number') {
            setCursorCol(ccol === 0 ? 'vol' : ccol - 1);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (ccol === 'note') {
            setCursorCol('ins');
          } else if (ccol === 'ins') {
            setCursorCol('vol');
          } else if (ccol === 'vol') {
            setCursorCol(0);
          } else if (typeof ccol === 'number') {
            const effCols = s?.channels[cc]?.effectCols ?? 1;
            if (ccol < effCols - 1) { setCursorCol(ccol + 1); }
            else if (cc < nc - 1)   { setCursorChan(c => c + 1); setCursorCol('note'); }
          }
          break;
        case 'Tab':
          e.preventDefault();
          setCursorChan(c => e.shiftKey ? Math.max(0, c - 1) : Math.min(nc - 1, c + 1));
          setCursorCol('note');
          break;
        case 'PageUp':   e.preventDefault(); setCursorRow(r => Math.max(0, r - 16));       break;
        case 'PageDown': e.preventDefault(); setCursorRow(r => Math.min(pl - 1, r + 16));  break;
        case 'Home':     e.preventDefault(); setCursorRow(0);                               break;
        case 'End':      e.preventDefault(); setCursorRow(pl - 1);                          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const startRow = Math.floor(scrollTop / ROW_HEIGHT);
  const endRow   = Math.min(patLen, startRow + visRows + 2);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    setFocused(true);
    const c = containerRef.current;
    if (!c || !sub) return;
    const local = c.toLocal(e.global);
    // Header click: toggle channel collapse (right-click or ctrl-click)
    if (local.y < HEADER_HEIGHT) {
      const lx = local.x + scrollLeftRef.current;
      if (lx >= ROW_NUM_WIDTH && (e.ctrlKey || e.metaKey || e.button === 2)) {
        for (let ch = 0; ch < numChannels; ch++) {
          if (lx < (chanXStarts[ch] ?? 0) + channelWidths[ch]) {
            setChanCollapse(prev => {
              const next = [...prev];
              while (next.length <= ch) next.push(0);
              next[ch] = (next[ch] + 1) % 4;
              return next;
            });
            break;
          }
        }
      }
      return;
    }
    const row = Math.floor((local.y - HEADER_HEIGHT + scrollTopRef.current) / ROW_HEIGHT);
    if (row >= 0 && row < patLen) setCursorRow(row);
    const lx = local.x + scrollLeftRef.current;
    if (lx >= ROW_NUM_WIDTH) {
      for (let ch = 0; ch < numChannels; ch++) {
        const chX = chanXStarts[ch];
        if (chX === undefined) break;
        if (lx < chX + channelWidths[ch]) {
          const rel = lx - chX;
          setCursorChan(ch);
          if      (rel < NOTE_WIDTH)                            setCursorCol('note');
          else if (rel < NOTE_WIDTH + INS_WIDTH)                setCursorCol('ins');
          else if (rel < NOTE_WIDTH + INS_WIDTH + VOL_WIDTH)    setCursorCol('vol');
          else {
            const idx = Math.floor((rel - NOTE_WIDTH - INS_WIDTH - VOL_WIDTH) / EFF_WIDTH);
            setCursorCol(Math.min(idx, (sub.channels[ch]?.effectCols ?? 1) - 1));
          }
          break;
        }
      }
    }
  }, [patLen, numChannels, chanXStarts, channelWidths, sub]);

  // Right-click on instrument column: open instrument editor for that instrument
  const handleRightClick = useCallback((e: FederatedPointerEvent) => {
    const c = containerRef.current;
    if (!c || !sub) return;
    const local = c.toLocal(e.global);
    if (local.y < HEADER_HEIGHT) return;
    const row = Math.floor((local.y - HEADER_HEIGHT + scrollTopRef.current) / ROW_HEIGHT);
    const lx = local.x + scrollLeftRef.current;
    if (lx < ROW_NUM_WIDTH) return;
    for (let ch = 0; ch < numChannels; ch++) {
      const chX = chanXStarts[ch] ?? 0;
      if (lx < chX + channelWidths[ch]) {
        const rel = lx - chX;
        // Only handle right-click on instrument column
        if (rel >= NOTE_WIDTH && rel < NOTE_WIDTH + INS_WIDTH) {
          const patIdx = sub.orders[ch]?.[currentPosition];
          const fRow = patIdx !== undefined ? sub.channels[ch]?.patterns.get(patIdx)?.rows[row] : null;
          if (fRow && fRow.ins >= 0) {
            // Open instrument editor for this instrument
            useUIStore.getState().openModal('instruments', { instrumentId: fRow.ins });
          }
        }
        break;
      }
    }
  }, [sub, numChannels, chanXStarts, channelWidths, currentPosition]);

  const drawBgRef = useRef<(g: GraphicsType) => void>(() => {});

  // Draw all backgrounds, row highlights, cursor column, and channel borders
  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height).fill({ color: theme.bg.color });
    g.rect(0, 0, width, HEADER_HEIGHT).fill({ color: theme.bgSecondary.color });
    g.rect(0, HEADER_HEIGHT - 1, width, 1).fill({ color: theme.border.color });

    for (let row = startRow; row < endRow; row++) {
      const y = HEADER_HEIGHT + row * ROW_HEIGHT - scrollTop;
      if (y + ROW_HEIGHT <= HEADER_HEIGHT || y >= height) continue;
      const isPlayRow   = isPlaying && row === playbackRowRef.current;
      const isCursorRow = row === cursorRow;
      const isHilightB  = row % 16 === 0;
      const isHilightA  = !isHilightB && row % 4 === 0;

      if      (isPlayRow)   g.rect(0, y, width, ROW_HEIGHT).fill({ color: theme.trackerRowCurrent.color });
      else if (isCursorRow) g.rect(0, y, width, ROW_HEIGHT).fill({ color: theme.trackerRowCursor.color, alpha: 0.3 });
      else if (isHilightB)  g.rect(0, y, width, ROW_HEIGHT).fill({ color: theme.trackerRowHighlight.color, alpha: 0.25 });
      else if (isHilightA)  g.rect(0, y, width, ROW_HEIGHT).fill({ color: theme.trackerRowHighlight.color, alpha: 0.13 });
      else if (row % 2 === 1) g.rect(0, y, width, ROW_HEIGHT).fill({ color: theme.trackerRowOdd.color });
    }

    // Cursor column highlight
    const curY = HEADER_HEIGHT + cursorRow * ROW_HEIGHT - scrollTop;
    if (curY + ROW_HEIGHT > HEADER_HEIGHT && curY < height) {
      const chBaseX = (chanXStarts[cursorChan] ?? ROW_NUM_WIDTH) - scrollLeft;
      const cx = chBaseX + subColX(cursorCol);
      const cw = subColW(cursorCol);
      if (cx < width && cx + cw > 0) {
        g.rect(cx, curY, cw, ROW_HEIGHT).fill({ color: theme.accent.color, alpha: 0.25 });
      }
    }

    // Channel column borders
    for (let ch = 0; ch < numChannels; ch++) {
      const bx = chanXStarts[ch] - scrollLeft;
      if (bx > 0 && bx < width) {
        g.rect(bx, 0, 1, height).fill({ color: theme.border.color, alpha: 0.2 });
      }
    }
  }, [width, height, theme, scrollTop, scrollLeft, startRow, endRow, isPlaying,
      cursorRow, cursorChan, cursorCol, chanXStarts, numChannels]);
  drawBgRef.current = drawBg;

  // All text labels
  const cellLabels = useMemo(() => {
    const labels: { x: number; y: number; text: string; color: number }[] = [];

    // Header
    labels.push({ x: 4 + centerOffsetX, y: TEXT_Y, text: 'Row', color: theme.textMuted.color });
    if (sub) {
      for (let ch = 0; ch < numChannels; ch++) {
        const chX = chanXStarts[ch] - scrollLeft;
        if (chX >= width || chX + channelWidths[ch] <= 0) continue;
        const chanName = sub.channels[ch]?.name?.substring(0, 6) || `CH${ch}`;
        const collapse = chanCollapse[ch] ?? 0;
        const collapseTag = collapse > 0 ? ` [${['', '-fx', '-vf', 'N'][collapse]}]` : '';
        labels.push({
          x: chX + 4, y: TEXT_Y,
          text: `${chanName}${collapseTag}`.substring(0, 14),
          color: collapse > 0 ? theme.textMuted.color : theme.textSecondary.color,
        });
      }
    }

    // Content rows
    if (sub) {
      for (let row = startRow; row < endRow; row++) {
        const y = HEADER_HEIGHT + row * ROW_HEIGHT - scrollTop + TEXT_Y;
        if (y < HEADER_HEIGHT || y + FONT_SIZE > height) continue;
        const isHilightB = row % 16 === 0;
        labels.push({
          x: 4 + centerOffsetX, y,
          text: row.toString(16).toUpperCase().padStart(2, '0'),
          color: isHilightB ? theme.text.color : theme.textMuted.color,
        });

        for (let ch = 0; ch < numChannels; ch++) {
          const chX = chanXStarts[ch] - scrollLeft;
          const chW = channelWidths[ch];
          if (chX + chW <= 0 || chX >= width) continue;

          const patIdx = sub.orders[ch]?.[currentPosition];
          const fRow: FurnaceRow | null = patIdx !== undefined
            ? (sub.channels[ch]?.patterns.get(patIdx)?.rows[row] ?? null)
            : null;

          const collapse = chanCollapse[ch] ?? 0;

          // Note column (always visible)
          labels.push({
            x: chX + 2, y,
            text: fRow ? formatFurnaceNote(fRow.note) : '---',
            color: fRow && fRow.note !== -1 ? theme.cellNote.color : theme.cellEmpty.color,
          });

          // Instrument column (hidden at collapse >= 3)
          if (collapse < 3) {
            labels.push({
              x: chX + NOTE_WIDTH + 2, y,
              text: fRow ? formatHex(fRow.ins, 2) : '--',
              color: fRow && fRow.ins !== -1 ? theme.cellInstrument.color : theme.cellEmpty.color,
            });
          }

          // Volume column (hidden at collapse >= 2)
          if (collapse < 2) {
            labels.push({
              x: chX + NOTE_WIDTH + INS_WIDTH + 2, y,
              text: fRow ? formatHex(fRow.vol, 2) : '--',
              color: fRow && fRow.vol !== -1 ? theme.cellVolume.color : theme.cellEmpty.color,
            });
          }

          // Effect columns (hidden at collapse >= 1)
          if (collapse < 1) {
            const effCols = sub.channels[ch]?.effectCols ?? 1;
            for (let fxIdx = 0; fxIdx < effCols; fxIdx++) {
              const fxData = fRow?.effects[fxIdx];
              const hasData = !!fxData && (fxData.cmd > 0 || fxData.val > 0);
              const fxX = chX + NOTE_WIDTH + INS_WIDTH + VOL_WIDTH + fxIdx * EFF_WIDTH + 2;
              if (fxX >= width || fxX + EFF_WIDTH <= 0) continue;
              labels.push({
                x: fxX, y,
                text: hasData ? `${formatHex(fxData.cmd, 2)}${formatHex(fxData.val, 2)}` : '----',
                color: hasData ? effectColor(fxData.cmd, theme) : theme.cellEmpty.color,
              });
            }
          }
        }
      }
    }

    return labels;
  }, [sub, numChannels, startRow, endRow, scrollTop, scrollLeft, height, width, theme,
      currentPosition, chanXStarts, channelWidths, chanCollapse, centerOffsetX]);

  return (
    <pixiContainer
      ref={containerRef}
      layout={{ width, height }}
      eventMode="static"
      onPointerDown={handlePointerDown}
      onRightClick={handleRightClick}
    >
      <pixiGraphics ref={bgGraphicsRef} draw={drawBg} layout={{ position: 'absolute', width, height }} />
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
