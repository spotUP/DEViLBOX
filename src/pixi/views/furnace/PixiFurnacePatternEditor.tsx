/**
 * PixiFurnacePatternEditor - Per-Channel Pattern Editor
 *
 * Renders pattern data for each channel's current pattern (from the order matrix).
 * Supports variable effect columns per channel (1-8), cursor navigation,
 * block selection, and effect color coding.
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

import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { usePixiTheme } from '@/pixi/theme';
import { useTransportStore } from '@/stores/useTransportStore';
import type { FurnaceNativeData, FurnaceRow } from '@/types';

// Layout constants
const ROW_HEIGHT = 20;
const ROW_NUM_WIDTH = 32;
const CHAR_WIDTH = 8;
const NOTE_WIDTH = CHAR_WIDTH * 3 + 4;
const INS_WIDTH = CHAR_WIDTH * 2 + 4;
const VOL_WIDTH = CHAR_WIDTH * 2 + 4;
const EFF_WIDTH = CHAR_WIDTH * 4 + 4; // cmd(2) + val(2)
const CHANNEL_GAP = 2;
const HEADER_HEIGHT = 24;

// Note names
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function formatFurnaceNote(noteVal: number): string {
  if (noteVal === -1) return '---';
  if (noteVal === 253) return '==='; // Note off
  if (noteVal === 254) return 'REL'; // Release
  if (noteVal === 255) return 'MRL'; // Macro release
  if (noteVal >= 0 && noteVal < 180) {
    const semitone = noteVal % 12;
    const octave = Math.floor(noteVal / 12);
    return `${NOTE_NAMES[semitone]}${octave}`;
  }
  return '---';
}

function formatHex(val: number, digits: number): string {
  if (val === -1) return '-'.repeat(digits);
  return val.toString(16).toUpperCase().padStart(digits, '0');
}

// Effect category colors
function getEffectColor(cmd: number, theme: ReturnType<typeof usePixiTheme>): string {
  if (cmd <= 0) return hexColor(theme.cellEmpty.color);
  // Pitch effects (1-3, E1, E2)
  if (cmd >= 1 && cmd <= 3) return '#00ff00';
  // Volume effects (A, 5, 6, 7, C)
  if (cmd === 0x0A || cmd === 0x05 || cmd === 0x06 || cmd === 0x07 || cmd === 0x0C) return '#ff8800';
  // Pan effects (8)
  if (cmd === 0x08) return '#ff00ff';
  // Speed/tempo (F, 09)
  if (cmd === 0x0F || cmd === 0x09) return '#ffff00';
  // Pattern (B, D)
  if (cmd === 0x0B || cmd === 0x0D) return '#ff4444';
  return hexColor(theme.cellEffect.color);
}

function hexColor(val: number): string {
  return `#${val.toString(16).padStart(6, '0')}`;
}

interface FurnacePatternEditorProps {
  width: number;
  height: number;
  nativeData: FurnaceNativeData;
  currentPosition: number;
  playbackRow: number;
}

export const PixiFurnacePatternEditor: React.FC<FurnacePatternEditorProps> = ({
  width,
  height,
  nativeData,
  currentPosition,
  playbackRow,
}) => {
  const theme = usePixiTheme();
  const isPlaying = useTransportStore(s => s.isPlaying);

  const sub = nativeData.subsongs[nativeData.activeSubsong];
  const numChannels = sub?.channels.length ?? 0;
  const patLen = sub?.patLen ?? 64;

  // Cursor state
  const [cursorRow, setCursorRow] = useState(0);
  const [cursorChan, setCursorChan] = useState(0);
  const [cursorCol, setCursorCol] = useState<'note' | 'ins' | 'vol' | number>(
    'note'
  ); // 'note', 'ins', 'vol', or effect index (0-7)

  // Scroll
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const visibleRows = Math.floor((height - HEADER_HEIGHT) / ROW_HEIGHT);

  // Auto-scroll to cursor/playback
  useEffect(() => {
    const targetRow = isPlaying ? playbackRow : cursorRow;
    const scrollTop = scrollTopRef.current;
    const rowY = targetRow * ROW_HEIGHT;
    const viewTop = scrollTop;
    const viewBottom = scrollTop + visibleRows * ROW_HEIGHT;

    if (rowY < viewTop || rowY >= viewBottom) {
      const newScroll = Math.max(0, rowY - Math.floor(visibleRows / 2) * ROW_HEIGHT);
      scrollTopRef.current = newScroll;
      if (containerRef.current) containerRef.current.scrollTop = newScroll;
    }
  }, [cursorRow, playbackRow, isPlaying, visibleRows]);

  // Compute channel widths
  const channelWidths = useMemo(() => {
    if (!sub) return [];
    return sub.channels.map(ch => {
      const effCols = ch.effectCols;
      return NOTE_WIDTH + INS_WIDTH + VOL_WIDTH + effCols * EFF_WIDTH + CHANNEL_GAP;
    });
  }, [sub]);

  const totalContentWidth = ROW_NUM_WIDTH + channelWidths.reduce((s, w) => s + w, 0);

  // Get pattern data for current position
  const getRow = useCallback((ch: number, row: number): FurnaceRow | null => {
    if (!sub) return null;
    const patIdx = sub.orders[ch]?.[currentPosition];
    if (patIdx === undefined) return null;
    const pat = sub.channels[ch]?.patterns.get(patIdx);
    return pat?.rows[row] ?? null;
  }, [sub, currentPosition]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setCursorRow(r => Math.max(0, r - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setCursorRow(r => Math.min(patLen - 1, r + 1));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        // Move left through columns: effects → vol → ins → note → prev channel
        if (cursorCol === 'note') {
          if (cursorChan > 0) {
            setCursorChan(c => c - 1);
            const prevEffCols = sub?.channels[cursorChan - 1]?.effectCols ?? 1;
            setCursorCol(prevEffCols - 1);
          }
        } else if (cursorCol === 'ins') {
          setCursorCol('note');
        } else if (cursorCol === 'vol') {
          setCursorCol('ins');
        } else if (typeof cursorCol === 'number') {
          if (cursorCol === 0) {
            setCursorCol('vol');
          } else {
            setCursorCol(cursorCol - 1);
          }
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        // Move right through columns: note → ins → vol → effects → next channel
        if (cursorCol === 'note') {
          setCursorCol('ins');
        } else if (cursorCol === 'ins') {
          setCursorCol('vol');
        } else if (cursorCol === 'vol') {
          setCursorCol(0);
        } else if (typeof cursorCol === 'number') {
          const effCols = sub?.channels[cursorChan]?.effectCols ?? 1;
          if (cursorCol < effCols - 1) {
            setCursorCol(cursorCol + 1);
          } else if (cursorChan < numChannels - 1) {
            setCursorChan(c => c + 1);
            setCursorCol('note');
          }
        }
        break;
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          setCursorChan(c => Math.max(0, c - 1));
        } else {
          setCursorChan(c => Math.min(numChannels - 1, c + 1));
        }
        setCursorCol('note');
        break;
      case 'PageUp':
        e.preventDefault();
        setCursorRow(r => Math.max(0, r - 16));
        break;
      case 'PageDown':
        e.preventDefault();
        setCursorRow(r => Math.min(patLen - 1, r + 16));
        break;
      case 'Home':
        e.preventDefault();
        setCursorRow(0);
        break;
      case 'End':
        e.preventDefault();
        setCursorRow(patLen - 1);
        break;
    }
  }, [cursorCol, cursorChan, numChannels, patLen, sub]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    scrollTopRef.current = (e.target as HTMLDivElement).scrollTop;
  }, []);

  // Render visible rows
  const startRow = Math.floor(scrollTopRef.current / ROW_HEIGHT);
  const endRow = Math.min(patLen, startRow + visibleRows + 2);

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
        overflow: 'auto',
        backgroundColor: hexColor(theme.bg.color),
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        outline: 'none',
        userSelect: 'none',
      }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onScroll={handleScroll}
    >
      {/* Channel headers */}
      <div style={{
        display: 'flex',
        position: 'sticky',
        top: 0,
        zIndex: 2,
        backgroundColor: hexColor(theme.bgSecondary.color),
        borderBottom: `1px solid ${hexColor(theme.border.color)}`,
        height: HEADER_HEIGHT,
        lineHeight: `${HEADER_HEIGHT}px`,
      }}>
        <div style={{ width: ROW_NUM_WIDTH, textAlign: 'center', color: hexColor(theme.textMuted.color) }}>
          Row
        </div>
        {sub && sub.channels.map((ch, chIdx) => (
          <div key={chIdx} style={{
            width: channelWidths[chIdx],
            textAlign: 'center',
            color: hexColor(theme.textSecondary.color),
            borderLeft: `1px solid ${hexColor(theme.border.color)}`,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}>
            {ch.name || `CH ${chIdx}`}
            <span style={{ color: hexColor(theme.textMuted.color), marginLeft: 4, fontSize: 9 }}>
              ({ch.effectCols}fx)
            </span>
          </div>
        ))}
      </div>

      {/* Pattern rows */}
      <div style={{ height: patLen * ROW_HEIGHT, position: 'relative' }}>
        {Array.from({ length: endRow - startRow }, (_, i) => {
          const row = startRow + i;
          const isPlayRow = isPlaying && row === playbackRow;
          const isCursorRow = row === cursorRow;

          // Row highlighting: hilightA every 4, hilightB every 16
          const isHilightB = row % 16 === 0;
          const isHilightA = row % 4 === 0;

          let bgColor = 'transparent';
          if (isPlayRow) bgColor = hexColor(theme.trackerRowCurrent.color);
          else if (isCursorRow) bgColor = `${hexColor(theme.trackerRowCursor.color)}30`;
          else if (isHilightB) bgColor = `${hexColor(theme.trackerRowHighlight.color)}40`;
          else if (isHilightA) bgColor = `${hexColor(theme.trackerRowHighlight.color)}20`;
          else if (row % 2 === 1) bgColor = hexColor(theme.trackerRowOdd.color);

          return (
            <div
              key={row}
              style={{
                display: 'flex',
                position: 'absolute',
                top: row * ROW_HEIGHT,
                height: ROW_HEIGHT,
                width: totalContentWidth,
                lineHeight: `${ROW_HEIGHT}px`,
                backgroundColor: bgColor,
              }}
            >
              {/* Row number */}
              <div style={{
                width: ROW_NUM_WIDTH,
                textAlign: 'center',
                color: isHilightB
                  ? hexColor(theme.text.color)
                  : hexColor(theme.textMuted.color),
              }}>
                {row.toString(16).toUpperCase().padStart(2, '0')}
              </div>

              {/* Channel cells */}
              {sub && sub.channels.map((ch, chIdx) => {
                const fRow = getRow(chIdx, row);
                const effCols = ch.effectCols;

                return (
                  <div
                    key={chIdx}
                    style={{
                      display: 'flex',
                      width: channelWidths[chIdx],
                      borderLeft: `1px solid ${hexColor(theme.border.color)}20`,
                    }}
                  >
                    {/* Note */}
                    <span
                      onClick={() => { setCursorRow(row); setCursorChan(chIdx); setCursorCol('note'); }}
                      style={{
                        width: NOTE_WIDTH,
                        textAlign: 'center',
                        cursor: 'pointer',
                        color: fRow && fRow.note !== -1
                          ? hexColor(theme.cellNote.color)
                          : hexColor(theme.cellEmpty.color),
                        backgroundColor: isCursorRow && chIdx === cursorChan && cursorCol === 'note'
                          ? `${hexColor(theme.accent.color)}40`
                          : 'transparent',
                      }}
                    >
                      {fRow ? formatFurnaceNote(fRow.note) : '---'}
                    </span>

                    {/* Instrument */}
                    <span
                      onClick={() => { setCursorRow(row); setCursorChan(chIdx); setCursorCol('ins'); }}
                      style={{
                        width: INS_WIDTH,
                        textAlign: 'center',
                        cursor: 'pointer',
                        color: fRow && fRow.ins !== -1
                          ? hexColor(theme.cellInstrument.color)
                          : hexColor(theme.cellEmpty.color),
                        backgroundColor: isCursorRow && chIdx === cursorChan && cursorCol === 'ins'
                          ? `${hexColor(theme.accent.color)}40`
                          : 'transparent',
                      }}
                    >
                      {fRow ? formatHex(fRow.ins, 2) : '--'}
                    </span>

                    {/* Volume */}
                    <span
                      onClick={() => { setCursorRow(row); setCursorChan(chIdx); setCursorCol('vol'); }}
                      style={{
                        width: VOL_WIDTH,
                        textAlign: 'center',
                        cursor: 'pointer',
                        color: fRow && fRow.vol !== -1
                          ? hexColor(theme.cellVolume.color)
                          : hexColor(theme.cellEmpty.color),
                        backgroundColor: isCursorRow && chIdx === cursorChan && cursorCol === 'vol'
                          ? `${hexColor(theme.accent.color)}40`
                          : 'transparent',
                      }}
                    >
                      {fRow ? formatHex(fRow.vol, 2) : '--'}
                    </span>

                    {/* Effect columns */}
                    {Array.from({ length: effCols }, (_, fxIdx) => {
                      const fx = fRow?.effects[fxIdx];
                      const hasData = fx && (fx.cmd > 0 || fx.val > 0);
                      const isCursorFx = isCursorRow && chIdx === cursorChan && cursorCol === fxIdx;

                      return (
                        <span
                          key={fxIdx}
                          onClick={() => { setCursorRow(row); setCursorChan(chIdx); setCursorCol(fxIdx); }}
                          style={{
                            width: EFF_WIDTH,
                            textAlign: 'center',
                            cursor: 'pointer',
                            color: hasData
                              ? getEffectColor(fx!.cmd, theme)
                              : hexColor(theme.cellEmpty.color),
                            backgroundColor: isCursorFx
                              ? `${hexColor(theme.accent.color)}40`
                              : 'transparent',
                          }}
                        >
                          {hasData
                            ? `${formatHex(fx!.cmd, 2)}${formatHex(fx!.val, 2)}`
                            : '----'}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
