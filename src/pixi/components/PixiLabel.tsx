/**
 * PixiLabel — Thin wrapper around MSDF BitmapText with theme colors and size variants.
 * The fundamental text primitive for the PixiJS UI.
 */

import { useMemo } from 'react';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme, type PixiColor } from '../theme';

export type LabelSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type LabelWeight = 'regular' | 'medium' | 'semibold' | 'bold';
export type LabelFont = 'mono' | 'sans';
export type LabelColor = 'text' | 'textSecondary' | 'textMuted' | 'accent' | 'error' | 'success' | 'warning' | 'custom';

const SIZE_MAP: Record<LabelSize, number> = {
  xs: 9,
  sm: 11,
  md: 13,
  lg: 16,
  xl: 20,
};

const FONT_MAP: Record<`${LabelFont}-${LabelWeight}`, string> = {
  'mono-regular': PIXI_FONTS.MONO,
  'mono-medium': PIXI_FONTS.MONO,       // JetBrains Mono doesn't have medium
  'mono-semibold': PIXI_FONTS.MONO_BOLD,
  'mono-bold': PIXI_FONTS.MONO_BOLD,
  'sans-regular': PIXI_FONTS.SANS,
  'sans-medium': PIXI_FONTS.SANS_MEDIUM,
  'sans-semibold': PIXI_FONTS.SANS_SEMIBOLD,
  'sans-bold': PIXI_FONTS.SANS_BOLD,
};

interface PixiLabelProps {
  text: string;
  size?: LabelSize;
  weight?: LabelWeight;
  font?: LabelFont;
  color?: LabelColor;
  /** Custom color (0xRRGGBB) — only used when color='custom' */
  customColor?: number;
  /** Custom alpha — only used when color='custom' */
  customAlpha?: number;
  /** Additional @pixi/layout style properties */
  layout?: Record<string, unknown>;
}

export const PixiLabel: React.FC<PixiLabelProps> = ({
  text,
  size = 'md',
  weight = 'regular',
  font = 'mono',
  color = 'text',
  customColor,
  customAlpha,
  layout,
}) => {
  const theme = usePixiTheme();

  const tint = useMemo((): number => {
    if (color === 'custom' && customColor !== undefined) return customColor;
    const colorMap: Record<string, PixiColor> = {
      text: theme.text,
      textSecondary: theme.textSecondary,
      textMuted: theme.textMuted,
      accent: theme.accent,
      error: theme.error,
      success: theme.success,
      warning: theme.warning,
    };
    return colorMap[color]?.color ?? theme.text.color;
  }, [color, customColor, theme]);

  const alpha = useMemo((): number => {
    if (color === 'custom' && customAlpha !== undefined) return customAlpha;
    return 1;
  }, [color, customAlpha]);

  const fontFamily = FONT_MAP[`${font}-${weight}`] || PIXI_FONTS.MONO;
  const fontSize = SIZE_MAP[size];

  return (
    <pixiBitmapText
      text={text}
      style={{ fontFamily, fontSize }}
      tint={tint}
      alpha={alpha}
      layout={layout}
    />
  );
};
