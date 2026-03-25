/**
 * PixiPatternMatrix — Pixi/GL version of the Renoise-style pattern matrix.
 *
 * Grid layout: rows = song positions, columns = channels.
 * Each cell shows the pattern number. Colored cells = has data.
 * Click cell to navigate to that position/pattern.
 *
 * Visually 1:1 with the DOM PatternMatrix component.
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { getPatternMatrixData, usePatternMatrix } from '@/hooks/arrangement/usePatternMatrix';
import { useTrackerStore } from '@stores';

interface PixiPatternMatrixProps {
  width: number;
  height: number;
}

const CELL_W = 40;
const CELL_H = 20;
const HEADER_H = 22;
const ROW_LABEL_W = 32;

const CHANNEL_COLORS = [0x4a9eff, 0xff6b6b, 0x51cf66, 0xffd43b, 0xcc5de8, 0xff922b, 0x20c997, 0xf06595];

export const PixiPatternMatrix: React.FC<PixiPatternMatrixProps> = ({
  width,
  height,
}) => {
  const theme = usePixiTheme();
  const matrix = usePatternMatrix();
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const setCurrentPattern = useTrackerStore(s => s.setCurrentPattern);

  const draw = useCallback((g: GraphicsType) => {
    g.clear();

    const data = getPatternMatrixData();
    if (data.positions.length === 0) return;

    // Background
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color });

    // Header background
    g.rect(0, 0, width, HEADER_H);
    g.fill({ color: theme.bgSecondary.color });

    // Header labels rendered as text below

    // Matrix cells
    for (let pos = 0; pos < data.cells.length; pos++) {
      const y = HEADER_H + pos * CELL_H;
      if (y + CELL_H < 0 || y > height) continue;

      const isCurrent = pos === data.currentPosition;

      // Row background
      if (isCurrent) {
        g.rect(0, y, width, CELL_H);
        g.fill({ color: theme.bgActive.color });
      } else if (pos % 2 === 0) {
        g.rect(0, y, width, CELL_H);
        g.fill({ color: theme.bg.color });
      }

      // Position label
      g.rect(0, y, ROW_LABEL_W, CELL_H);
      g.stroke({ color: theme.border.color, width: 1, alpha: 0.3 });

      // Channel cells
      for (let ch = 0; ch < data.channelCount; ch++) {
        const cell = data.cells[pos][ch];
        const x = ROW_LABEL_W + ch * CELL_W;
        const color = CHANNEL_COLORS[ch % CHANNEL_COLORS.length];

        if (cell.hasData) {
          g.rect(x, y, CELL_W, CELL_H);
          g.fill({ color, alpha: 0.12 });
        }

        g.rect(x, y, CELL_W, CELL_H);
        g.stroke({ color: theme.border.color, width: 1, alpha: 0.2 });
      }
    }

    // Grid border
    g.rect(0, 0, width, height);
    g.stroke({ color: theme.border.color, width: 1 });
  }, [width, height, matrix, theme]);

  const handleClick = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(e.currentTarget);
    const data = getPatternMatrixData();

    const pos = Math.floor((local.y - HEADER_H) / CELL_H);
    const ch = Math.floor((local.x - ROW_LABEL_W) / CELL_W);

    if (pos < 0 || pos >= data.positions.length) return;
    if (ch < 0 || ch >= data.channelCount) return;

    const cell = data.cells[pos]?.[ch];
    if (!cell) return;

    setCurrentPosition(pos, true);
    setCurrentPattern(cell.patternIndex, true);
  }, [setCurrentPosition, setCurrentPattern]);

  if (matrix.positions.length === 0) return null;

  return (
    <pixiContainer layout={{ width, height }}>
      <pixiGraphics
        draw={draw}
        eventMode="static"
        cursor="pointer"
        onClick={handleClick}
        layout={{ width, height }}
      />

      {/* Header text labels */}
      <pixiBitmapText
        text="Pos"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: 4, top: 5 }}
      />
      {Array.from({ length: matrix.channelCount }, (_, ch) => (
        <pixiBitmapText
          key={`ch-${ch}`}
          text={`CH${ch + 1}`}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={CHANNEL_COLORS[ch % CHANNEL_COLORS.length]}
          layout={{ position: 'absolute', left: ROW_LABEL_W + ch * CELL_W + 4, top: 5 }}
        />
      ))}

      {/* Position labels + cell pattern numbers */}
      {matrix.cells.map((row, posIdx) => {
        const y = HEADER_H + posIdx * CELL_H;
        const isCurrent = posIdx === matrix.currentPosition;
        return (
          <pixiContainer key={`row-${posIdx}`} layout={{ position: 'absolute', left: 0, top: y }}>
            <pixiBitmapText
              text={String(posIdx).padStart(2, '0')}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
              tint={isCurrent ? theme.accent.color : theme.textMuted.color}
              layout={{ position: 'absolute', left: 6, top: 3 }}
            />
            {row.map((cell, ch) => (
              <pixiBitmapText
                key={`cell-${ch}`}
                text={String(cell.patternIndex).padStart(2, '0')}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
                tint={cell.hasData ? CHANNEL_COLORS[ch % CHANNEL_COLORS.length] : theme.textMuted.color}
                layout={{ position: 'absolute', left: ROW_LABEL_W + ch * CELL_W + 8, top: 3 }}
              />
            ))}
          </pixiContainer>
        );
      })}
    </pixiContainer>
  );
};
