/**
 * PixiOptionCard — Large selectable card with title, description, and optional icon.
 * Used for wizard-style choices (e.g., "Empty Song" vs "System Preset").
 */

import React, { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

interface PixiOptionCardProps {
  title: string;
  description?: string;
  selected?: boolean;
  onClick?: () => void;
  width?: number;
  height?: number;
  disabled?: boolean;
  layout?: Record<string, unknown>;
}

export const PixiOptionCard: React.FC<PixiOptionCardProps> = ({
  title,
  description,
  selected = false,
  onClick,
  width = 200,
  height = 100,
  disabled = false,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, width, height, 6);
    g.fill({
      color: selected ? theme.accent.color : theme.bg.color,
      alpha: selected ? 0.1 : 1,
    });
    g.roundRect(0, 0, width, height, 6);
    g.stroke({
      color: selected ? theme.accent.color : hovered ? theme.borderLight.color : theme.border.color,
      alpha: selected ? 0.8 : hovered ? 0.8 : 0.5,
      width: selected ? 2 : 1,
    });
  }, [width, height, selected, hovered, theme]);

  return (
    <pixiContainer
      eventMode={disabled ? 'none' : 'static'}
      cursor={disabled ? 'default' : 'pointer'}
      onPointerOver={() => !disabled && setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={() => !disabled && onClick?.()}
      alpha={disabled ? 0.4 : 1}
      layout={{
        width,
        height,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        padding: 12,
        ...layoutProp,
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
      <pixiBitmapText
        text={title}
        style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 13, fill: 0xffffff }}
        tint={selected ? theme.text.color : theme.textSecondary.color}
        layout={{}}
      />
      {description && (
        <pixiBitmapText
          text={description}
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: 0xffffff }}
          tint={theme.textMuted.color}
          alpha={0.7}
          layout={{}}
        />
      )}
    </pixiContainer>
  );
};
