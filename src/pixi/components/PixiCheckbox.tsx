import React, { useState } from 'react';
import type { FederatedPointerEvent } from 'pixi.js';
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

  const totalWidth = size + (label ? 6 + label.length * 7 : 0);

  const handleClick = () => {
    if (!disabled) onChange(!checked);
  };

  return (
    <pixiContainer
      eventMode={disabled ? 'none' : 'static'}
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerDown={(e: FederatedPointerEvent) => e.stopPropagation()}
      onPointerUp={handleClick}
      alpha={disabled ? 0.4 : 1}
      layout={{ width: totalWidth, height: size, flexDirection: 'row', alignItems: 'center', gap: 6, ...layoutProp }}
    >
      <pixiGraphics
        eventMode="none"
        draw={(g) => {
          g.clear();
          g.roundRect(0, 0, size, size, 2);
          g.fill({ color: checked ? theme.accent.color : theme.bgTertiary.color });
          g.stroke({ color: hovered || checked ? theme.accent.color : theme.border.color, width: 1 });
          if (checked) {
            // Checkmark
            g.moveTo(2, size / 2);
            g.lineTo(size * 0.4, size - 3);
            g.lineTo(size - 2, 3);
            g.stroke({ color: 0xffffff, width: 2 });
          }
        }}
        layout={{ width: size, height: size }}
      />
      {label && (
        <pixiBitmapText
          eventMode="none"
          text={label}
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
          tint={checked ? theme.text.color : theme.textSecondary.color}
          layout={{}}
        />
      )}
    </pixiContainer>
  );
};
