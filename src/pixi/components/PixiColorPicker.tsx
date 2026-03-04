/**
 * PixiColorPicker — GL color swatch grid for channel color selection.
 * Rendered by PixiGlobalDropdownLayer when a colorPicker dropdown is active.
 */

import React, { useState } from 'react';
import type { FederatedPointerEvent } from 'pixi.js';
import { CHANNEL_COLORS } from '@typedefs/tracker';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';

const COLS = 4;
const SWATCH = 20;
const GAP = 3;
const PAD = 6;

const GRID_W = COLS * SWATCH + (COLS - 1) * GAP;
const PANEL_W = GRID_W + PAD * 2;

interface PixiColorPickerProps {
  x: number;
  y: number;
  currentColor: string | null;
  onColorSelect: (color: string | null) => void;
  onClose: () => void;
}

function hexToPixi(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export const PixiColorPicker: React.FC<PixiColorPickerProps> = ({
  x, y, currentColor, onColorSelect, onClose,
}) => {
  const theme = usePixiTheme();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const rows = Math.ceil(CHANNEL_COLORS.length / COLS);
  const gridH = rows * SWATCH + (rows - 1) * GAP;
  const labelH = 16;
  const panelH = PAD + labelH + GAP + gridH + PAD;

  const swatches: React.ReactNode[] = [];
  for (let i = 0; i < CHANNEL_COLORS.length; i++) {
    const color = CHANNEL_COLORS[i];
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const sx = PAD + col * (SWATCH + GAP);
    const sy = PAD + labelH + GAP + row * (SWATCH + GAP);
    const isSelected = currentColor === color;
    const isHovered = hoveredIdx === i;

    swatches.push(
      <layoutContainer
        key={i}
        eventMode="static"
        cursor="pointer"
        onPointerOver={() => setHoveredIdx(i)}
        onPointerOut={() => setHoveredIdx(null)}
        onPointerUp={(e: FederatedPointerEvent) => {
          e.stopPropagation();
          onColorSelect(color);
          onClose();
        }}
        layout={{
          position: 'absolute',
          left: sx,
          top: sy,
          width: SWATCH,
          height: SWATCH,
          borderRadius: 3,
          backgroundColor: color ? hexToPixi(color) : theme.bgTertiary.color,
          borderWidth: isSelected ? 2 : isHovered ? 1 : 0,
          borderColor: isSelected ? theme.accent.color : theme.borderLight.color,
        }}
      >
        {/* "X" for the null/no-color swatch */}
        {color === null && (
          <pixiBitmapText
            text="X"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{ alignSelf: 'center', marginTop: 3, marginLeft: 5 }}
          />
        )}
      </layoutContainer>,
    );
  }

  return (
    <pixiContainer
      zIndex={9999}
      layout={{ position: 'absolute', left: x, top: y }}
      eventMode="static"
      onPointerDown={(e: FederatedPointerEvent) => e.stopPropagation()}
    >
      <layoutContainer
        layout={{
          width: PANEL_W,
          height: panelH,
          backgroundColor: theme.bgSecondary.color,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {/* Title */}
        <pixiBitmapText
          text="Channel Color"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ position: 'absolute', left: PAD, top: PAD }}
        />

        {/* Swatches */}
        {swatches}
      </layoutContainer>
    </pixiContainer>
  );
};
