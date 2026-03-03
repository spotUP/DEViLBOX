/**
 * PixiSearchInput — Text input with search icon and clear button.
 * Wraps PixiPureTextInput with search-specific UX.
 */

import React, { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiPureTextInput } from '../input/PixiPureTextInput';

interface PixiSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: number;
  height?: number;
  layout?: Record<string, unknown>;
}

const ICON_WIDTH = 20;
const CLEAR_WIDTH = 18;

export const PixiSearchInput: React.FC<PixiSearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  width = 200,
  height = 26,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);

  const inputWidth = width - ICON_WIDTH - (value ? CLEAR_WIDTH : 0) - 4;

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, width, height, 3);
    g.fill({ color: theme.bg.color });
    g.roundRect(0, 0, width, height, 3);
    g.stroke({ color: theme.border.color, alpha: 0.6, width: 1 });
  }, [width, height, theme]);

  return (
    <pixiContainer
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      layout={{
        width,
        height,
        flexDirection: 'row',
        alignItems: 'center',
        ...layoutProp,
      }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
      {/* Search icon (magnifying glass using unicode) */}
      <pixiBitmapText
        text="Q"
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: 0xffffff }}
        tint={theme.textMuted.color}
        alpha={0.5}
        layout={{ marginLeft: 6, width: ICON_WIDTH }}
      />
      <PixiPureTextInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        width={inputWidth}
        height={height - 4}
        fontSize={11}
        font="sans"
        layout={{}}
      />
      {/* Clear button */}
      {value.length > 0 && (
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={() => onChange('')}
          layout={{ width: CLEAR_WIDTH, height, justifyContent: 'center', alignItems: 'center' }}
        >
          <pixiBitmapText
            text="X"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
            tint={hovered ? theme.text.color : theme.textMuted.color}
            layout={{}}
          />
        </pixiContainer>
      )}
    </pixiContainer>
  );
};
