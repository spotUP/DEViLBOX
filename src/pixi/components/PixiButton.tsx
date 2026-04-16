/**
 * PixiButton — Button component with 6 variants matching DOM Button.
 * Uses layoutContainer native bg/border + MSDF BitmapText labels.
 * Icons rendered as Lucide SVG textures (pixiSprite) instead of FontAudio bitmap text.
 * Reference: src/components/ui/Button.tsx
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Texture } from 'pixi.js';
import type { Container as ContainerType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { FONTAUDIO_TO_LUCIDE } from '../utils/lucideIcons';
import { getLucideTexture, preloadLucideIcons } from '../utils/lucideToTexture';
import { usePixiTheme, usePixiThemeId, type PixiTheme } from '../theme';
import { usePixiTooltipStore } from '../stores/usePixiTooltipStore';

// Preload all mapped Lucide icons once (white, at common sizes)
let _iconsPreloaded = false;
function ensureIconsPreloaded(): void {
  if (_iconsPreloaded) return;
  _iconsPreloaded = true;
  const entries = Object.entries(FONTAUDIO_TO_LUCIDE);
  const toPreload: { name: string; iconNode: [string, Record<string, string>][]; size: number; color: number }[] = [];
  for (const [name, node] of entries) {
    for (const sz of [13, 15, 17, 20]) {
      toPreload.push({ name, iconNode: node, size: sz, color: 0xffffff });
    }
  }
  preloadLucideIcons(toPreload);
}

export type ButtonVariant = 'primary' | 'default' | 'ghost' | 'icon' | 'ft2' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';
export type ButtonColor = 'default' | 'red' | 'green' | 'yellow' | 'blue' | 'purple';

interface PixiButtonProps {
  label: string;
  /** Icon name (e.g. 'play', 'stop', 'close'). Maps to Lucide SVG texture via FONTAUDIO_TO_LUCIDE. */
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
  tooltip?: string;
  onClick?: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
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
    blue:    { base: 0x081018, hover: 0x101828, active: theme.accent.color, text: theme.accent.color },
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
  tooltip: tooltipText,
  width: widthProp,
  height: heightProp,
  onClick,
  onPointerDown: onPointerDownProp,
  onPointerUp: onPointerUpProp,
  layout,
}) => {
  const theme = usePixiTheme();
  const themeId = usePixiThemeId();
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const containerRef = useRef<ContainerType>(null);
  const showTooltip = usePixiTooltipStore(s => s.showTooltip);
  const hideTooltip = usePixiTooltipStore(s => s.hideTooltip);

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
      // Darken error color for hover/pressed: reduce each channel by ~20%
      if (pressed || hovered) {
        const c = theme.error.color;
        const darkened = (((c >> 16 & 0xff) * 0.8 | 0) << 16) | (((c >> 8 & 0xff) * 0.8 | 0) << 8) | ((c & 0xff) * 0.8 | 0);
        return { bg: darkened, ...noBorder, text: 0xffffff, showBg: true };
      }
      return { bg: theme.error.color, ...noBorder, text: 0xffffff, showBg: true };
    }

    if (variant === 'ghost') {
      // DOM: background transparent, color text-secondary, hover: bg-hover + text-primary
      if (pressed) return { bg: theme.bgActive.color, ...noBorder, text: theme.text.color, showBg: true };
      if (hovered) return { bg: theme.bgHover.color, ...noBorder, text: theme.text.color, showBg: true };
      return { bg: 0x000000, ...noBorder, text: theme.textSecondary.color, showBg: false };
    }

    // default — matches DOM .btn (no border)
    if (pressed) return { bg: theme.bgActive.color, ...noBorder, text: theme.text.color, showBg: true };
    if (hovered) return { bg: theme.bgHover.color, ...noBorder, text: theme.text.color, showBg: true };
    return { bg: theme.bgTertiary.color, ...noBorder, text: theme.textSecondary.color, showBg: true };
  }, [theme, ft2Colors, variant, color, disabled, loading, active, hovered, pressed]);

  const colors = getColors();

  const handlePointerOver = useCallback(() => {
    if (!disabled) {
      setHovered(true);
      if (tooltipText && containerRef.current) {
        const bounds = containerRef.current.getBounds();
        showTooltip({
          text: tooltipText,
          x: bounds.x + bounds.width / 2,
          y: bounds.y,
          accent: theme.accent.color,
        });
      }
    }
  }, [disabled, tooltipText, showTooltip, theme.accent.color]);
  const handlePointerOut = useCallback(() => {
    setHovered(false);
    if (pressed) onPointerUpProp?.();
    setPressed(false);
    if (tooltipText) hideTooltip();
  }, [tooltipText, hideTooltip, pressed, onPointerUpProp]);
  const handlePointerDown = useCallback(() => { if (!disabled) { setPressed(true); onPointerDownProp?.(); } }, [disabled, onPointerDownProp]);
  const handlePointerUp = useCallback(() => { setPressed(false); onPointerUpProp?.(); }, [onPointerUpProp]);
  const handleClick = useCallback(() => {
    if (!disabled && !loading) onClick?.();
  }, [disabled, loading, onClick]);

  const isVertical = iconPosition === 'top';
  const iconFontSize = isVertical ? config.fontSize + 4 : config.fontSize + 2;

  // Trigger preload on first mount
  useEffect(() => { ensureIconsPreloaded(); }, []);

  // Resolve Lucide icon texture (rendered white, tinted via sprite)
  const iconTexture: Texture | null = useMemo(() => {
    if (!icon) return null;
    const lucideNode = FONTAUDIO_TO_LUCIDE[icon];
    if (!lucideNode) return null;
    return getLucideTexture(icon, lucideNode, iconFontSize, 0xffffff);
  }, [icon, iconFontSize]);

  const drawBg = useCallback((g: import('pixi.js').Graphics) => {
    g.clear();
    if (!colors.showBg) return;
    // Read from Yoga computed layout — stable across hover state changes.
    // g.parent?.width reflects Pixi display bounds which can shrink when
    // graphics content changes (empty→filled on hover), causing feedback.
    const parent = g.parent as unknown as Record<string, unknown> | null;
    const pcl = parent?.layout as Record<string, unknown> | undefined;
    const cl = pcl?.computedLayout as { width?: number; height?: number } | undefined;
    const w = cl?.width || widthProp || 100;
    const h = cl?.height || btnHeight;
    g.roundRect(0, 0, w, h, 4).fill({ color: colors.bg });
  }, [colors.showBg, colors.bg, btnHeight, widthProp]);

  return (
    <layoutContainer
      ref={containerRef}
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
        gap: isVertical ? 1 : (icon && label ? 4 : 0),
        borderRadius: 4,
        ...layout,
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: '100%', height: '100%' }} />
      {/* Icon (Lucide SVG texture) */}
      {icon && iconTexture && (
        <pixiSprite
          texture={iconTexture}
          width={iconFontSize}
          height={iconFontSize}
          tint={colors.text}
          alpha={disabled ? 0.5 : 1}
          eventMode="none"
          layout={{ width: iconFontSize, height: iconFontSize, flexShrink: 0 }}
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
