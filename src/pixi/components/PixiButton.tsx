/**
 * PixiButton — Button component with 6 variants matching DOM Button.
 * Uses Graphics backgrounds + MSDF BitmapText labels.
 * Reference: src/components/ui/Button.tsx
 */

import { useCallback, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

export type ButtonVariant = 'primary' | 'default' | 'ghost' | 'icon' | 'ft2' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';
export type ButtonColor = 'default' | 'red' | 'green' | 'yellow' | 'blue' | 'purple';

interface PixiButtonProps {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  color?: ButtonColor;
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
  width?: number;
  onClick?: () => void;
  layout?: Record<string, unknown>;
}

// FT2 color palette
const FT2_COLORS: Record<string, { base: number; hover: number; active: number; text: number }> = {
  default: { base: 0x1a1a1d, hover: 0x222226, active: 0x00d4aa, text: 0xa0a0a8 },
  red:     { base: 0x1a0808, hover: 0x2a1010, active: 0xef4444, text: 0xef4444 },
  green:   { base: 0x081a0f, hover: 0x102a18, active: 0x10b981, text: 0x10b981 },
  yellow:  { base: 0x1a1808, hover: 0x2a2810, active: 0xfbbf24, text: 0xfbbf24 },
  blue:    { base: 0x081018, hover: 0x101828, active: 0x3b82f6, text: 0x3b82f6 },
  purple:  { base: 0x100818, hover: 0x181028, active: 0x8b5cf6, text: 0x8b5cf6 },
};

const SIZE_CONFIG: Record<ButtonSize, { height: number; paddingH: number; fontSize: number; minWidth: number }> = {
  sm:   { height: 24, paddingH: 8,  fontSize: 11, minWidth: 60 },
  md:   { height: 28, paddingH: 12, fontSize: 12, minWidth: 80 },
  lg:   { height: 36, paddingH: 20, fontSize: 14, minWidth: 100 },
  icon: { height: 28, paddingH: 6,  fontSize: 12, minWidth: 28 },
};

export const PixiButton: React.FC<PixiButtonProps> = ({
  label,
  variant = 'default',
  size = 'md',
  color = 'default',
  disabled = false,
  loading = false,
  active = false,
  width: widthProp,
  onClick,
  layout,
}) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const graphicsRef = useRef<GraphicsType>(null);

  const config = SIZE_CONFIG[size];
  const btnWidth = widthProp ?? config.minWidth;

  const getColors = useCallback((): { bg: number; bgAlpha: number; border: number; borderAlpha: number; text: number } => {
    if (disabled || loading) {
      return {
        bg: theme.bgActive.color,
        bgAlpha: 0.4,
        border: theme.border.color,
        borderAlpha: 0.3,
        text: theme.textMuted.color,
      };
    }

    if (variant === 'ft2') {
      const ft2 = FT2_COLORS[color] || FT2_COLORS.default;
      if (active || pressed) return { bg: ft2.active, bgAlpha: 1, border: ft2.active, borderAlpha: 1, text: 0xffffff };
      if (hovered) return { bg: ft2.hover, bgAlpha: 1, border: ft2.active, borderAlpha: 0.6, text: ft2.text };
      return { bg: ft2.base, bgAlpha: 1, border: theme.borderLight.color, borderAlpha: 0.5, text: ft2.text };
    }

    if (variant === 'primary') {
      if (pressed) return { bg: theme.accent.color, bgAlpha: 0.9, border: theme.accent.color, borderAlpha: 1, text: theme.textInverse.color };
      if (hovered) return { bg: theme.accent.color, bgAlpha: 0.85, border: theme.accent.color, borderAlpha: 1, text: theme.textInverse.color };
      return { bg: theme.accent.color, bgAlpha: 0.8, border: theme.accent.color, borderAlpha: 1, text: theme.textInverse.color };
    }

    if (variant === 'danger') {
      if (pressed) return { bg: theme.error.color, bgAlpha: 0.9, border: theme.error.color, borderAlpha: 1, text: 0xffffff };
      if (hovered) return { bg: theme.error.color, bgAlpha: 0.3, border: theme.error.color, borderAlpha: 0.8, text: theme.error.color };
      return { bg: theme.error.color, bgAlpha: 0.15, border: theme.error.color, borderAlpha: 0.4, text: theme.error.color };
    }

    if (variant === 'ghost') {
      if (pressed) return { bg: theme.bgActive.color, bgAlpha: 0.8, border: 0x000000, borderAlpha: 0, text: theme.text.color };
      if (hovered) return { bg: theme.bgHover.color, bgAlpha: 0.6, border: 0x000000, borderAlpha: 0, text: theme.text.color };
      return { bg: 0x000000, bgAlpha: 0, border: 0x000000, borderAlpha: 0, text: theme.textSecondary.color };
    }

    // default
    if (pressed) return { bg: theme.bgActive.color, bgAlpha: 1, border: theme.accent.color, borderAlpha: 0.8, text: theme.text.color };
    if (hovered) return { bg: theme.bgHover.color, bgAlpha: 1, border: theme.borderLight.color, borderAlpha: 0.8, text: theme.text.color };
    return { bg: theme.bgTertiary.color, bgAlpha: 1, border: theme.border.color, borderAlpha: 0.6, text: theme.textSecondary.color };
  }, [theme, variant, color, disabled, loading, active, hovered, pressed]);

  const colors = getColors();

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    // Border
    g.roundRect(0, 0, btnWidth, config.height, 4);
    g.fill({ color: colors.bg, alpha: colors.bgAlpha });
    g.roundRect(0, 0, btnWidth, config.height, 4);
    g.stroke({ color: colors.border, alpha: colors.borderAlpha, width: 1 });
  }, [btnWidth, config.height, colors]);

  const handlePointerOver = useCallback(() => { if (!disabled) setHovered(true); }, [disabled]);
  const handlePointerOut = useCallback(() => { setHovered(false); setPressed(false); }, []);
  const handlePointerDown = useCallback((_e: FederatedPointerEvent) => { if (!disabled) setPressed(true); }, [disabled]);
  const handlePointerUp = useCallback(() => {
    if (pressed && !disabled && !loading) {
      onClick?.();
    }
    setPressed(false);
  }, [pressed, disabled, loading, onClick]);

  return (
    <pixiContainer
      eventMode={disabled ? 'none' : 'static'}
      cursor={disabled ? 'not-allowed' : 'pointer'}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      layout={{
        width: btnWidth,
        height: config.height,
        justifyContent: 'center',
        alignItems: 'center',
        ...layout,
      }}
    >
      <pixiGraphics
        ref={graphicsRef}
        draw={drawBg}
        layout={{ position: 'absolute', width: btnWidth, height: config.height }}
      />
      <pixiBitmapText
        text={loading ? '...' : label}
        style={{
          fontFamily: variant === 'ft2' ? PIXI_FONTS.MONO : PIXI_FONTS.SANS_SEMIBOLD,
          fontSize: config.fontSize,
        }}
        tint={colors.text}
        alpha={disabled ? 0.5 : 1}
      />
    </pixiContainer>
  );
};
