/**
 * PixiBadge — Small colored tag/chip for displaying labels, categories, or status.
 * Used for synth type badges, instrument tags, status indicators.
 */

import React, { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'error' | 'custom';

interface PixiBadgeProps {
  text: string;
  variant?: BadgeVariant;
  /** Custom background color (0xRRGGBB) when variant='custom' */
  color?: number;
  /** Custom text color when variant='custom' */
  textColor?: number;
  fontSize?: number;
  layout?: Record<string, unknown>;
}

const PADDING_H = 8;
const PADDING_V = 3;

export const PixiBadge: React.FC<PixiBadgeProps> = ({
  text,
  variant = 'default',
  color,
  textColor,
  fontSize = 10,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();

  const getColors = (): { bg: number; bgAlpha: number; fg: number } => {
    switch (variant) {
      case 'accent':  return { bg: theme.accent.color, bgAlpha: 0.2, fg: theme.accent.color };
      case 'success': return { bg: theme.success.color, bgAlpha: 0.2, fg: theme.success.color };
      case 'warning': return { bg: theme.warning.color, bgAlpha: 0.2, fg: theme.warning.color };
      case 'error':   return { bg: theme.error.color,   bgAlpha: 0.2, fg: theme.error.color };
      case 'custom':  return { bg: color ?? 0x333333,   bgAlpha: 0.2, fg: textColor ?? 0xffffff };
      default:        return { bg: theme.bgTertiary.color, bgAlpha: 1, fg: theme.textMuted.color };
    }
  };

  const colors = getColors();
  const approxWidth = text.length * fontSize * 0.6 + PADDING_H * 2;
  const h = fontSize + PADDING_V * 2;

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, approxWidth, h, 3);
    g.fill({ color: colors.bg, alpha: colors.bgAlpha });
  }, [approxWidth, h, colors]);

  return (
    <pixiContainer
      layout={{
        width: approxWidth,
        height: h,
        justifyContent: 'center',
        alignItems: 'center',
        ...layoutProp,
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: approxWidth, height: h }} />
      <pixiBitmapText
        text={text}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize, fill: 0xffffff }}
        tint={colors.fg}
        layout={{}}
      />
    </pixiContainer>
  );
};
