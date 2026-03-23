/**
 * PixiFormatPatternEditor — Shared Pixi pattern viewer for column-based formats.
 *
 * 1:1 visual match with FormatPatternEditor (Canvas2D):
 * - Same layout constants (ROW_NUM_W=28, COL_GAP=4, CHAN_GAP=8, HEADER_H=20)
 * - Same font (JetBrains Mono 14px → CHAR_W=8)
 * - Per-column coloring via ColumnDef.pixiColor / pixiEmptyColor
 * - Beat row (% 8) background, play row highlight (rgba 0xe94560 @ 0.15)
 * - Vertical channel separator lines drawn in background graphics
 * - Header row with channel labels
 * - Synchronous scrollRow — no async lag, cursor always centered
 *
 * Layout uses flex rows (not absolute positioning) for reliable Yoga layout.
 */

import React, { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '@/pixi/theme';
import { PIXI_FONTS } from '@/pixi/fonts';
import type { ColumnDef, FormatChannel } from '@/components/shared/format-editor-types';

// Match DOM FormatPatternEditor exactly
const CHAR_W = 8;
const FONT_SIZE = 14;
const ROW_H = 16;
const ROW_NUM_W = CHAR_W * 3 + 4; // 28px — "00 " prefix
const COL_GAP = 4;
const CHAN_GAP = 8;
const HEADER_H = ROW_H + 4; // 20px

// Stable style object — defined outside the component to avoid dep-array churn
// in rowEls useMemo (was causing Yoga layout recalc every render → header jitter)
const MONO_STYLE = { fontFamily: PIXI_FONTS.MONO, fontSize: FONT_SIZE, fill: 0xffffff } as const;

interface Props {
  width: number;
  height: number;
  columns: ColumnDef[];
  channels: FormatChannel[];
  currentRow: number;
  isPlaying: boolean;
}

export const PixiFormatPatternEditor: React.FC<Props> = ({
  width, height, columns, channels, currentRow, isPlaying,
}) => {
  const theme = usePixiTheme();

  const numRows = channels[0]?.patternLength ?? 0;
  const visibleRows = Math.floor((height - HEADER_H) / ROW_H);

  // Column pixel widths
  const colWidths = useMemo(() => columns.map(c => c.charWidth * CHAR_W), [columns]);

  // Width of a single channel's content (all columns + inter-column gaps)
  const chanWidth = useMemo(
    () => colWidths.reduce((a, b) => a + b, 0) + COL_GAP * (columns.length - 1),
    [colWidths, columns.length],
  );

  // Synchronous scroll — centered on currentRow during playback,
  // and anchored at last playback position when stopped.
  const scrollRow = numRows > 0 && (isPlaying || currentRow > 0)
    ? Math.max(0, Math.min(currentRow - Math.floor(visibleRows / 2), numRows - visibleRows))
    : 0;

  // Background graphics: full bg, header bg, row highlights, channel separators
  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();

    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color });

    // Header background
    g.rect(0, 0, width, HEADER_H);
    g.fill({ color: theme.bgTertiary.color });
    g.rect(0, HEADER_H - 1, width, 1);
    g.fill({ color: theme.border.color });

    // Row highlights
    for (let vi = 0; vi < visibleRows; vi++) {
      const rowIdx = scrollRow + vi;
      if (rowIdx >= numRows) break;
      const y = HEADER_H + vi * ROW_H;
      if (isPlaying && rowIdx === currentRow) {
        g.rect(0, y, width, ROW_H);
        g.fill({ color: 0xe94560, alpha: 0.15 });
      } else if (rowIdx % 8 === 0) {
        g.rect(0, y, width, ROW_H);
        g.fill({ color: theme.trackerRowHighlight.color });
      }
    }

    // Vertical channel separators
    for (let ch = 1; ch < channels.length; ch++) {
      const x = ROW_NUM_W + ch * (chanWidth + CHAN_GAP) - CHAN_GAP / 2;
      g.rect(x, HEADER_H, 1, height - HEADER_H);
      g.fill({ color: theme.border.color });
    }
  }, [width, height, visibleRows, scrollRow, numRows, currentRow, isPlaying,
      channels.length, chanWidth, theme]);

  // Header row: "ROW" + channel labels — memoized so it only changes when channels change
  const headerEl = useMemo(() => (
    <pixiContainer layout={{ flexDirection: 'row', width, height: HEADER_H }}>
      <pixiBitmapText
        text="ROW"
        style={MONO_STYLE}
        tint={0x888888}
        layout={{ width: ROW_NUM_W, height: HEADER_H }}
      />
      {channels.map((ch, chi) => {
        const isLast = chi === channels.length - 1;
        return (
          <pixiBitmapText
            key={chi}
            text={ch.label}
            style={MONO_STYLE}
            tint={0x888888}
            layout={{ width: chanWidth + (isLast ? 0 : CHAN_GAP), height: HEADER_H }}
          />
        );
      })}
    </pixiContainer>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [channels, chanWidth, width]);

  // Visible data rows
  const rowEls = useMemo((): ReactNode[] => {
    const els: ReactNode[] = [];
    for (let vi = 0; vi < visibleRows; vi++) {
      const rowIdx = scrollRow + vi;
      if (rowIdx >= numRows) break;
      const isCurrentRow = isPlaying && rowIdx === currentRow;
      const rowNumColor = isCurrentRow ? 0xffffff : rowIdx % 8 === 0 ? 0x888888 : 0x555555;

      els.push(
        <pixiContainer key={vi} layout={{ flexDirection: 'row', width, height: ROW_H }}>
          {/* Row number */}
          <pixiBitmapText
            text={rowIdx.toString(16).toUpperCase().padStart(2, '0')}
            style={MONO_STYLE}
            tint={rowNumColor}
            layout={{ width: ROW_NUM_W, height: ROW_H }}
          />

          {/* Channels */}
          {channels.map((ch, chi) => {
            const isLastChan = chi === channels.length - 1;
            const cell = ch.rows[rowIdx];
            return (
              <pixiContainer
                key={chi}
                layout={{
                  flexDirection: 'row',
                  width: chanWidth + (isLastChan ? 0 : CHAN_GAP),
                  height: ROW_H,
                }}
              >
                {columns.map((col, ci) => {
                  const isLastCol = ci === columns.length - 1;
                  const value = cell ? cell[col.key] : undefined;
                  const isEmpty = value === undefined || value === col.emptyValue;
                  const text = isEmpty ? '•'.repeat(col.charWidth) : col.formatter(value!);
                  const tint = isCurrentRow ? 0xffffff
                    : isEmpty ? (col.pixiEmptyColor ?? 0x333344)
                    : (col.pixiColor ?? 0x888888);

                  return (
                    <pixiBitmapText
                      key={ci}
                      text={text}
                      style={MONO_STYLE}
                      tint={tint}
                      layout={{ width: colWidths[ci] + (isLastCol ? 0 : COL_GAP), height: ROW_H }}
                    />
                  );
                })}
              </pixiContainer>
            );
          })}
        </pixiContainer>,
      );
    }
    return els;
  }, [scrollRow, visibleRows, numRows, columns, channels, currentRow, isPlaying,
      chanWidth, colWidths, width]);

  return (
    <pixiContainer layout={{ width, height, flexDirection: 'column' }}>
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
      {headerEl}
      {rowEls}
    </pixiContainer>
  );
};
