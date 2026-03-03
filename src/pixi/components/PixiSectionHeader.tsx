/**
 * PixiSectionHeader — Category/group header bar with background and uppercase label.
 * Used as sticky-style section dividers in scrollable lists.
 */

import React, { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

interface PixiSectionHeaderProps {
  label: string;
  width: number;
  height?: number;
  layout?: Record<string, unknown>;
}

export const PixiSectionHeader: React.FC<PixiSectionHeaderProps> = ({
  label,
  width,
  height = 22,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color });
    // Bottom border
    g.moveTo(0, height - 1);
    g.lineTo(width, height - 1);
    g.stroke({ color: theme.border.color, alpha: 0.4, width: 1 });
  }, [width, height, theme]);

  return (
    <pixiContainer
      layout={{
        width,
        height,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 10,
        ...layoutProp,
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
      <pixiBitmapText
        text={label.toUpperCase()}
        style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 9, fill: 0xffffff }}
        tint={theme.textMuted.color}
        alpha={0.8}
        layout={{}}
      />
    </pixiContainer>
  );
};
