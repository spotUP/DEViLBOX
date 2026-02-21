/**
 * PixiToggle — On/Off switch control rendered with PixiJS Graphics.
 * Graphics track (rounded rect) + thumb (circle), animated position.
 * Reference: src/components/controls/Toggle.tsx
 */

import { useCallback, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

interface PixiToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  color?: number;          // 0xRRGGBB — overridden by cyan theme
  size?: 'sm' | 'md';
  disabled?: boolean;
  title?: string;
  layout?: Record<string, unknown>;
}

const SIZE_CONFIG = {
  sm: { width: 36, height: 18, thumbSize: 12, fontSize: 9 },
  md: { width: 44, height: 22, thumbSize: 16, fontSize: 10 },
} as const;

export const PixiToggle: React.FC<PixiToggleProps> = ({
  label,
  value,
  onChange,
  color: colorProp,
  size = 'md',
  disabled = false,
  title,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [, setHovered] = useState(false);
  const accent = colorProp ?? theme.accent.color;
  const config = SIZE_CONFIG[size];

  const offBg = theme.bgTertiary.color;
  const offBorder = theme.border.color;
  const thumbOff = theme.textMuted.color;

  const drawTrack = useCallback((g: GraphicsType) => {
    g.clear();
    const r = config.height / 2;

    // Track background
    g.roundRect(0, 0, config.width, config.height, r);
    g.fill({ color: value ? accent : offBg, alpha: value ? 0.8 : 1 });
    g.roundRect(0, 0, config.width, config.height, r);
    g.stroke({ color: value ? accent : offBorder, width: 2, alpha: value ? 1 : 0.6 });

    // Thumb
    const thumbX = value
      ? config.width - config.thumbSize / 2 - 3
      : config.thumbSize / 2 + 3;
    const thumbY = config.height / 2;

    g.circle(thumbX, thumbY, config.thumbSize / 2);
    g.fill({ color: value ? 0xffffff : thumbOff });

    // Glow when on
    if (value) {
      g.circle(thumbX, thumbY, config.thumbSize / 2 + 3);
      g.stroke({ color: accent, alpha: 0.3, width: 1 });
    }
  }, [value, accent, offBg, offBorder, thumbOff, config]);

  const handleClick = useCallback((_e: FederatedPointerEvent) => {
    if (!disabled) onChange(!value);
  }, [disabled, value, onChange]);

  const totalWidth = config.width + 10;
  const labelHeight = 14;
  const totalHeight = config.height + labelHeight + 4;

  return (
    <pixiContainer
      eventMode={disabled ? 'none' : 'static'}
      cursor={disabled ? 'not-allowed' : 'pointer'}
      onPointerUp={handleClick}
      onPointerOver={() => !disabled && setHovered(true)}
      onPointerOut={() => setHovered(false)}
      alpha={disabled ? 0.4 : 1}
      layout={{
        width: totalWidth,
        height: totalHeight,
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        ...layoutProp,
      }}
      accessible
      accessibleType="button"
      accessibleTitle={title || `${label}: ${value ? 'On' : 'Off'}`}
    >
      {/* Label */}
      <pixiBitmapText
        text={label}
        style={{
          fontFamily: PIXI_FONTS.MONO,
          fontSize: config.fontSize - 1,
          fill: 0xffffff,
        }}
        tint={theme.textMuted.color}
        layout={{ height: labelHeight }}
      />

      {/* Toggle track + thumb */}
      <pixiGraphics
        draw={drawTrack}
        layout={{ width: config.width, height: config.height }}
      />
    </pixiContainer>
  );
};
