/**
 * PixiButton — Button component with 6 variants matching DOM Button.
 * Uses layoutContainer native bg/border + MSDF BitmapText labels.
 * Reference: src/components/ui/Button.tsx
 */

import { useCallback, useMemo, useState } from 'react';
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
  sm:   { height: 24, paddingH: 8, fontSize: 11, minWidth: 0 },
  md:   { height: 28, paddingH: 10, fontSize: 13, minWidth: 0 },
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

  const config = SIZE_CONFIG[size];
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

    // All variants: no visible borders (matching DOM border: none)
    const noBorder = { border: 0x000000, borderAlpha: 0 };

    if (variant === 'ft2') {
      const ft2 = ft2Colors[color] || ft2Colors.default;
      if (active || pressed) return { bg: ft2.active, ...noBorder, text: 0xffffff, showBg: true };
      if (hovered) return { bg: ft2.hover, ...noBorder, text: ft2.text, showBg: true };
      return { bg: theme.bgTertiary.color, ...noBorder, text: ft2.text, showBg: true };
    }

    if (variant === 'primary') {
      if (pressed || hovered) return { bg: theme.accentSecondary.color, ...noBorder, text: theme.textInverse.color, showBg: true };
      return { bg: theme.accent.color, ...noBorder, text: theme.textInverse.color, showBg: true };
    }

    if (variant === 'danger') {
      if (pressed || hovered) return { bg: 0xb91c1c, ...noBorder, text: 0xffffff, showBg: true };
      return { bg: 0xdc2626, ...noBorder, text: 0xffffff, showBg: true };
    }

    if (variant === 'ghost') {
      if (pressed) return { bg: theme.bgActive.color, ...noBorder, text: theme.text.color, showBg: true };
      if (hovered) return { bg: theme.bgHover.color, ...noBorder, text: theme.text.color, showBg: true };
      return { bg: theme.bgTertiary.color, ...noBorder, text: theme.textSecondary.color, showBg: true };
    }

    // default — matches DOM .btn (no border)
    if (pressed) return { bg: theme.bgActive.color, ...noBorder, text: theme.text.color, showBg: true };
    if (hovered) return { bg: theme.bgHover.color, ...noBorder, text: theme.text.color, showBg: true };
    return { bg: theme.bgTertiary.color, ...noBorder, text: theme.textSecondary.color, showBg: true };
  }, [theme, ft2Colors, variant, color, disabled, loading, active, hovered, pressed]);

  const colors = getColors();

  const handlePointerOver = useCallback(() => { if (!disabled) setHovered(true); }, [disabled]);
  const handlePointerOut = useCallback(() => { setHovered(false); setPressed(false); }, []);
  const handlePointerDown = useCallback(() => { if (!disabled) setPressed(true); }, [disabled]);
  const handlePointerUp = useCallback(() => { setPressed(false); }, []);
  const handleClick = useCallback(() => {
    if (!disabled && !loading) onClick?.();
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
      onClick={handleClick}
      alpha={disabled ? 0.5 : 1}
      layout={{
        ...(widthProp != null ? { width: widthProp } : { paddingLeft: config.paddingH, paddingRight: config.paddingH, minWidth: config.minWidth }),
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
          eventMode="none"
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
          eventMode="none"
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
