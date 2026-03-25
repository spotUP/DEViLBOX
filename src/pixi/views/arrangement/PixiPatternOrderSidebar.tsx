/**
 * PixiPatternOrderSidebar — Pixi/GL version of the vertical pattern order list.
 * Visually 1:1 with DOM PatternOrderSidebar. Same store data.
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { useTrackerStore } from '@stores';

interface PixiPatternOrderSidebarProps {
  width?: number;
  height: number;
}

const SIDEBAR_W = 56;
const HEADER_H = 18;
const ROW_H = 18;

export const PixiPatternOrderSidebar: React.FC<PixiPatternOrderSidebarProps> = ({
  width = SIDEBAR_W,
  height,
}) => {
  const theme = usePixiTheme();
  const patternOrder = useTrackerStore(s => s.patternOrder);
  const currentPositionIndex = useTrackerStore(s => s.currentPositionIndex);
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const setCurrentPattern = useTrackerStore(s => s.setCurrentPattern);

  const draw = useCallback((g: GraphicsType) => {
    g.clear();

    // Background
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bgSecondary.color });

    // Header
    g.rect(0, 0, width, HEADER_H);
    g.fill({ color: theme.bgTertiary.color });
    g.moveTo(0, HEADER_H);
    g.lineTo(width, HEADER_H);
    g.stroke({ color: theme.border.color, width: 1 });

    // Rows
    for (let i = 0; i < patternOrder.length; i++) {
      const y = HEADER_H + i * ROW_H;
      if (y > height) break;

      const isCurrent = i === currentPositionIndex;

      if (isCurrent) {
        g.rect(0, y, width, ROW_H);
        g.fill({ color: theme.accent.color, alpha: 0.15 });
      }

      // Bottom border
      g.moveTo(0, y + ROW_H);
      g.lineTo(width, y + ROW_H);
      g.stroke({ color: theme.border.color, width: 1, alpha: 0.3 });
    }

    // Right border
    g.moveTo(width - 1, 0);
    g.lineTo(width - 1, height);
    g.stroke({ color: theme.border.color, width: 1 });
  }, [width, height, patternOrder.length, currentPositionIndex, theme]);

  const handleClick = useCallback((e: FederatedPointerEvent) => {
    const local = e.getLocalPosition(e.currentTarget);
    const posIdx = Math.floor((local.y - HEADER_H) / ROW_H);
    if (posIdx < 0 || posIdx >= patternOrder.length) return;
    setCurrentPosition(posIdx, true);
    setCurrentPattern(patternOrder[posIdx], true);
  }, [patternOrder, setCurrentPosition, setCurrentPattern]);

  return (
    <pixiContainer layout={{ width, height }}>
      <pixiGraphics
        draw={draw}
        eventMode="static"
        cursor="pointer"
        onClick={handleClick}
        layout={{ width, height }}
      />

      {/* Header text */}
      <pixiBitmapText
        text="ORDER"
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: 4, top: 3 }}
      />

      {/* Row labels */}
      {patternOrder.map((patIdx, posIdx) => {
        const y = HEADER_H + posIdx * ROW_H;
        if (y > height) return null;
        const isCurrent = posIdx === currentPositionIndex;
        return (
          <pixiContainer key={posIdx} layout={{ position: 'absolute', left: 0, top: y, width, height: ROW_H, flexDirection: 'row', alignItems: 'center', paddingLeft: 4 }}>
            <pixiBitmapText
              text={String(posIdx).padStart(2, '0')}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
            <pixiBitmapText
              text={` ${String(patIdx).padStart(2, '0')}`}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
              tint={isCurrent ? theme.accent.color : theme.textSecondary.color}
              layout={{}}
            />
          </pixiContainer>
        );
      })}
    </pixiContainer>
  );
};
