import React, { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

interface PixiCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: number;
  layout?: Record<string, unknown>;
}

export const PixiCheckbox: React.FC<PixiCheckboxProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  size = 12,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);

  const draw = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, size, size);
    g.fill({ color: checked ? theme.accent.color : theme.bgTertiary.color, alpha: checked ? 0.8 : 1 });
    g.rect(0, 0, size, size);
    g.stroke({
      color: hovered || checked ? theme.accent.color : theme.border.color,
      alpha: hovered || checked ? 0.8 : 0.6,
      width: 1,
    });
  }, [size, checked, hovered, theme]);

  const totalWidth = size + (label ? 6 + label.length * 7 : 0);

  return (
    <pixiContainer
      eventMode={disabled ? 'none' : 'static'}
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={() => !disabled && onChange(!checked)}
      alpha={disabled ? 0.4 : 1}
      layout={{ width: totalWidth, height: size, flexDirection: 'row', alignItems: 'center', gap: 6, ...layoutProp }}
    >
      <pixiGraphics draw={draw} layout={{ width: size, height: size }} />
      {label && (
        <pixiBitmapText
          text={label}
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
          tint={checked ? theme.text.color : theme.textSecondary.color}
          layout={{}}
        />
      )}
    </pixiContainer>
  );
};
