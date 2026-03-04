/**
 * PixiGlobalTooltipLayer — Root-level container that renders the active
 * tooltip at zIndex 9998, outside every PixiWindow mask.
 *
 * Follows the same pattern as PixiGlobalDropdownLayer. Components register
 * tooltip data in usePixiTooltipStore; this layer renders it.
 */

import React, { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTooltipStore } from '../stores/usePixiTooltipStore';
import { PIXI_FONTS } from '../fonts';

const TT_PAD_X = 6;
const TT_PAD_Y = 3;
const TT_FONT_SIZE = 11;
const TT_BG = 0x1a1a2e;
const TT_BG_ALPHA = 0.92;
const TT_BORDER_RADIUS = 4;
const TT_OFFSET_Y = 10; // pixels above the anchor point

export const PixiGlobalTooltipLayer: React.FC = () => {
  const tooltip = usePixiTooltipStore(s => s.tooltip);

  const drawBg = useCallback((g: GraphicsType) => {
    if (!tooltip) return;
    g.clear();
    // Measure text width approximation: ~6.6px per char at 11px monospace
    const textW = tooltip.text.length * 6.6;
    const w = textW + TT_PAD_X * 2;
    const h = TT_FONT_SIZE + TT_PAD_Y * 2;
    g.roundRect(0, 0, w, h, TT_BORDER_RADIUS);
    g.fill({ color: TT_BG, alpha: TT_BG_ALPHA });
    g.roundRect(0, 0, w, h, TT_BORDER_RADIUS);
    g.stroke({ color: tooltip.accent, width: 1, alpha: 0.8 });
  }, [tooltip]);

  if (!tooltip) {
    return (
      <pixiContainer
        zIndex={9998}
        eventMode="none"
        layout={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }}
      />
    );
  }

  const textW = tooltip.text.length * 6.6;
  const w = textW + TT_PAD_X * 2;
  const h = TT_FONT_SIZE + TT_PAD_Y * 2;
  const left = tooltip.x - w / 2;
  const top = tooltip.y - h - TT_OFFSET_Y;

  return (
    <pixiContainer
      zIndex={9998}
      eventMode="none"
      layout={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }}
    >
      <pixiContainer
        layout={{ position: 'absolute', left, top }}
        eventMode="none"
      >
        <pixiGraphics
          draw={drawBg}
          layout={{ width: w, height: h }}
          eventMode="none"
        />
        <pixiBitmapText
          text={tooltip.text}
          style={{
            fontFamily: PIXI_FONTS.MONO,
            fontSize: TT_FONT_SIZE,
            fill: 0xffffff,
          }}
          layout={{
            position: 'absolute',
            left: TT_PAD_X,
            top: TT_PAD_Y,
          }}
          eventMode="none"
        />
      </pixiContainer>
    </pixiContainer>
  );
};
