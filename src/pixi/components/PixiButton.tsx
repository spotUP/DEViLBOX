/**
 * PixiButton — Button component with 6 variants matching DOM Button.
 * Uses layoutContainer native bg/border + MSDF BitmapText labels.
 * Reference: src/components/ui/Button.tsx
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { FAD_ICONS } from '../fontaudioIcons';
import { usePixiTheme, usePixiThemeId, type PixiTheme } from '../theme';

export type ButtonVariant = 'primary' | 'default' | 'ghost' | 'icon' | 'ft2' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';
export type ButtonColor = 'default' | 'red' | 'green' | 'yellow' | 'blue' | 'purple';

interface PixiButtonProps {
  label: string;
  /** FontAudio icon name (e.g. 'play', 'stop', 'mute'). Rendered before label. */
  icon?: string;
  /** 'left' = icon before label (default), 'top' = icon above label (vertical layout) */
  iconPosition?: 'left' | 'top';
  variant?: ButtonVariant;
  size?: ButtonSize;
  color?: ButtonColor;
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
  width?: number;
  height?: number;
  onClick?: () => void;
  layout?: Record<string, unknown>;
}

// FT2 color palette — theme-derived
function getFT2Colors(
  theme: PixiTheme,
  themeId: string,
): Record<string, { base: number; hover: number; active: number; text: number }> {
  const isCyan = themeId === 'cyan-lineart';

  // Default variant: always theme-derived
  const defaultColors = {
    base: theme.bgTertiary.color,
    hover: theme.bgHover.color,
    active: theme.accent.color,
    text: theme.textSecondary.color,
  };

  if (isCyan) {
    // Cyan Lineart: all variants collapse to cyan shades
    return {
      default: defaultColors,
      red:    defaultColors,
      green:  defaultColors,
      yellow: defaultColors,
      blue:   defaultColors,
      purple: defaultColors,
    };
  }

  // Other themes: colored variants use status/semantic colors
  return {
    default: defaultColors,
    red:     { base: 0x1a0808, hover: 0x2a1010, active: theme.error.color,   text: theme.error.color },
    green:   { base: 0x081a0f, hover: 0x102a18, active: theme.success.color, text: theme.success.color },
    yellow:  { base: 0x1a1808, hover: 0x2a2810, active: theme.warning.color, text: theme.warning.color },
    blue:    { base: 0x081018, hover: 0x101828, active: 0x3b82f6, text: 0x3b82f6 },
    purple:  { base: 0x100818, hover: 0x181028, active: 0x8b5cf6, text: 0x8b5cf6 },
  };
}

const SIZE_CONFIG: Record<ButtonSize, { height: number; paddingH: number; fontSize: number; minWidth: number }> = {
  sm:   { height: 24, paddingH: 8,  fontSize: 12, minWidth: 60 },
  md:   { height: 28, paddingH: 12, fontSize: 13, minWidth: 80 },
  lg:   { height: 36, paddingH: 20, fontSize: 16, minWidth: 100 },
  icon: { height: 28, paddingH: 6,  fontSize: 13, minWidth: 28 },
};

export const PixiButton: React.FC<PixiButtonProps> = ({
  label,
  icon,
  iconPosition = 'left',
  variant = 'default',
  size = 'md',
  color = 'default',
  disabled = false,
  loading = false,
  active = false,
  width: widthProp,
  height: heightProp,
  onClick,
  layout,
}) => {
  const theme = usePixiTheme();
  const themeId = usePixiThemeId();
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const pressedRef = useRef(false);

  const config = SIZE_CONFIG[size];
  const btnWidth = widthProp ?? config.minWidth;
  const btnHeight = heightProp ?? config.height;

  const ft2Colors = useMemo(() => getFT2Colors(theme, themeId), [theme, themeId]);

  const getColors = useCallback((): { bg: number; border: number; borderAlpha: number; text: number; showBg: boolean } => {
    if (disabled || loading) {
      return {
        bg: theme.bgActive.color,
        border: theme.border.color,
        borderAlpha: 0.3,
        text: theme.textMuted.color,
        showBg: true,
      };
    }

    if (variant === 'ft2') {
      const ft2 = ft2Colors[color] || ft2Colors.default;
      if (active || pressed) return { bg: ft2.active, border: ft2.active, borderAlpha: 1, text: 0xffffff, showBg: true };
      if (hovered) return { bg: ft2.hover, border: ft2.active, borderAlpha: 0.6, text: ft2.text, showBg: true };
      return { bg: ft2.base, border: theme.borderLight.color, borderAlpha: 0.5, text: ft2.text, showBg: true };
    }

    if (variant === 'primary') {
      if (pressed) return { bg: theme.accent.color, border: theme.accent.color, borderAlpha: 1, text: theme.textInverse.color, showBg: true };
      if (hovered) return { bg: theme.accent.color, border: theme.accent.color, borderAlpha: 1, text: theme.textInverse.color, showBg: true };
      return { bg: theme.accent.color, border: theme.accent.color, borderAlpha: 1, text: theme.textInverse.color, showBg: true };
    }

    if (variant === 'danger') {
      if (pressed) return { bg: theme.error.color, border: theme.error.color, borderAlpha: 1, text: 0xffffff, showBg: true };
      if (hovered) return { bg: theme.error.color, border: theme.error.color, borderAlpha: 0.8, text: 0xffffff, showBg: true };
      return { bg: 0x000000, border: theme.error.color, borderAlpha: 0.6, text: theme.error.color, showBg: true };
    }

    if (variant === 'ghost') {
      if (pressed) return { bg: theme.bgActive.color, border: 0x000000, borderAlpha: 0, text: theme.text.color, showBg: true };
      if (hovered) return { bg: theme.bgHover.color, border: 0x000000, borderAlpha: 0, text: theme.text.color, showBg: true };
      return { bg: 0x000000, border: 0x000000, borderAlpha: 0, text: theme.textSecondary.color, showBg: false };
    }

    // default
    if (pressed) return { bg: theme.bgActive.color, border: theme.accent.color, borderAlpha: 0.8, text: theme.text.color, showBg: true };
    if (hovered) return { bg: theme.bgHover.color, border: theme.borderLight.color, borderAlpha: 0.8, text: theme.text.color, showBg: true };
    return { bg: theme.bgTertiary.color, border: theme.border.color, borderAlpha: 0.6, text: theme.textSecondary.color, showBg: true };
  }, [theme, ft2Colors, variant, color, disabled, loading, active, hovered, pressed]);

  const colors = getColors();

  const handlePointerOver = useCallback(() => { if (!disabled) setHovered(true); }, [disabled]);
  const handlePointerOut = useCallback(() => { setHovered(false); setPressed(false); }, []);
  const handlePointerDown = useCallback((_e: FederatedPointerEvent) => { if (!disabled) { pressedRef.current = true; setPressed(true); } }, [disabled]);
  const handlePointerUp = useCallback(() => {
    if (pressedRef.current && !disabled && !loading) {
      onClick?.();
    }
    pressedRef.current = false;
    setPressed(false);
  }, [disabled, loading, onClick]);

  const isVertical = iconPosition === 'top';
  const iconFontSize = isVertical ? config.fontSize + 4 : config.fontSize + 2;

  return (
    <layoutContainer
      eventMode={disabled ? 'none' : 'static'}
      cursor={disabled ? 'not-allowed' : 'pointer'}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      alpha={disabled ? 0.5 : 1}
      layout={{
        width: btnWidth,
        height: btnHeight,
        flexDirection: isVertical ? 'column' : 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: isVertical ? 1 : 0,
        ...(colors.showBg ? { backgroundColor: colors.bg } : {}),
        borderColor: colors.border,
        borderWidth: colors.borderAlpha > 0 ? 1 : 0,
        borderRadius: 4,
        ...layout,
      }}
    >
      {/* Icon (fontaudio) */}
      {icon && FAD_ICONS[icon] && (
        <pixiBitmapText
          text={FAD_ICONS[icon]}
          style={{
            fontFamily: PIXI_FONTS.ICONS,
            fontSize: iconFontSize,
            fill: 0xffffff,
          }}
          tint={colors.text}
          alpha={disabled ? 0.5 : 1}
          layout={{ marginRight: !isVertical && label ? 4 : 0 }}
        />
      )}
      {/* Text label */}
      {(loading || label) && (
        <pixiBitmapText
          text={loading ? '...' : label}
          style={{
            fontFamily: variant === 'ft2' ? PIXI_FONTS.MONO_BOLD : PIXI_FONTS.SANS_SEMIBOLD,
            fontSize: isVertical ? Math.max(7, config.fontSize - 2) : config.fontSize,
            fill: 0xffffff,
          }}
          tint={colors.text}
          alpha={disabled ? 0.5 : 1}
          layout={{}}
        />
      )}
    </layoutContainer>
  );
};
