/**
 * PixiRadioGroup — Mutually exclusive option selector.
 * Renders a vertical or horizontal list of radio-style options.
 */

import React, { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

interface RadioOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface PixiRadioGroupProps {
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  direction?: 'row' | 'column';
  size?: number;
  disabled?: boolean;
  layout?: Record<string, unknown>;
}

const DOT_SIZE = 14;
const INNER_SIZE = 6;

export const PixiRadioGroup: React.FC<PixiRadioGroupProps> = ({
  options,
  value,
  onChange,
  direction = 'column',
  size = DOT_SIZE,
  disabled = false,
  layout: layoutProp,
}) => {
  return (
    <pixiContainer
      layout={{
        flexDirection: direction,
        gap: direction === 'column' ? 8 : 16,
        ...layoutProp,
      }}
    >
      {options.map((opt) => (
        <PixiRadioItem
          key={opt.value}
          option={opt}
          selected={value === opt.value}
          onSelect={() => !disabled && onChange(opt.value)}
          size={size}
          disabled={disabled}
        />
      ))}
    </pixiContainer>
  );
};

interface PixiRadioItemProps {
  option: RadioOption;
  selected: boolean;
  onSelect: () => void;
  size: number;
  disabled: boolean;
}

const PixiRadioItem: React.FC<PixiRadioItemProps> = ({
  option,
  selected,
  onSelect,
  size,
  disabled,
}) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);

  const drawCircle = useCallback((g: GraphicsType) => {
    g.clear();
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 1;
    // Outer ring
    g.circle(cx, cy, r);
    g.fill({ color: selected ? theme.accent.color : theme.bgTertiary.color, alpha: selected ? 0.15 : 1 });
    g.circle(cx, cy, r);
    g.stroke({
      color: hovered || selected ? theme.accent.color : theme.border.color,
      alpha: hovered || selected ? 0.8 : 0.6,
      width: 1.5,
    });
    // Inner dot
    if (selected) {
      g.circle(cx, cy, INNER_SIZE / 2);
      g.fill({ color: theme.accent.color });
    }
  }, [size, selected, hovered, theme]);

  return (
    <pixiContainer
      eventMode={disabled ? 'none' : 'static'}
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={onSelect}
      alpha={disabled ? 0.4 : 1}
      layout={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <pixiGraphics draw={drawCircle} layout={{ width: size, height: size }} />
      <pixiContainer layout={{ flexDirection: 'column', gap: 1 }}>
        <pixiBitmapText
          text={option.label}
          style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
          tint={selected ? theme.text.color : theme.textSecondary.color}
          layout={{}}
        />
        {option.sublabel && (
          <pixiBitmapText
            text={option.sublabel}
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: 0xffffff }}
            tint={theme.textMuted.color}
            alpha={0.7}
            layout={{}}
          />
        )}
      </pixiContainer>
    </pixiContainer>
  );
};
