import React, { useState } from 'react';
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

  return (
    <pixiContainer
      eventMode={disabled ? 'none' : 'static'}
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={() => !disabled && onChange(!checked)}
      onClick={() => !disabled && onChange(!checked)}
      alpha={disabled ? 0.4 : 1}
      layout={{ width: totalWidth, height: size, flexDirection: 'row', alignItems: 'center', gap: 6, ...layoutProp }}
    >
      <layoutContainer
        layout={{
          width: size,
          height: size,
          backgroundColor: checked ? theme.accent.color : theme.bgTertiary.color,
          borderWidth: 1,
          borderColor: hovered || checked ? theme.accent.color : theme.border.color,
        }}
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
