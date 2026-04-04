/**
 * PixiStarRating -- GL equivalent of src/components/shared/StarRating.tsx
 * Renders 5 clickable star shapes using PixiGraphics.
 * Filled stars use theme.warning, empty use theme.bgTertiary.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Rectangle } from 'pixi.js';
import type { FederatedPointerEvent, Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';

interface PixiStarRatingProps {
  /** Current value 0-5 */
  value: number;
  /** Called with 0-5 when user clicks. Omit for read-only. */
  onChange?: (value: number) => void;
  /** Size of each star in pixels (default 14) */
  size?: number;
  /** Optional count label shown after stars */
  count?: number;
  layout?: Record<string, unknown>;
}

/** Generate the 10 vertices of a 5-pointed star centered at (cx, cy). */
function starPoints(cx: number, cy: number, outerR: number, innerR: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 2) * -1 + (Math.PI / 5) * i;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  }
  return pts;
}

/** Draw a single star polygon into a Graphics object. */
function drawStar(g: GraphicsType, cx: number, cy: number, outerR: number, innerR: number, fillColor: number, fillAlpha: number) {
  const pts = starPoints(cx, cy, outerR, innerR);
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) {
    g.lineTo(pts[i], pts[i + 1]);
  }
  g.closePath();
  g.fill({ color: fillColor, alpha: fillAlpha });
}

export const PixiStarRating: React.FC<PixiStarRatingProps> = ({
  value,
  onChange,
  size = 14,
  count,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(0);

  const interactive = onChange != null;
  const gap = 2;
  const starWidth = size + gap;
  const totalStarsWidth = starWidth * 5;
  const countText = count != null && count > 0 ? `(${count})` : '';
  const countWidth = countText ? countText.length * 6 + 4 : 0;
  const totalWidth = totalStarsWidth + countWidth;

  const hitArea = useMemo(
    () => new Rectangle(0, 0, totalWidth, size),
    [totalWidth, size],
  );

  /** Determine which star index (1-5) from pointer x, or 0 if outside. */
  const starFromX = useCallback(
    (x: number): number => {
      const idx = Math.floor(x / starWidth) + 1;
      return idx >= 1 && idx <= 5 ? idx : 0;
    },
    [starWidth],
  );

  const handlePointerMove = useCallback(
    (e: FederatedPointerEvent) => {
      if (!interactive) return;
      const local = e.getLocalPosition(e.currentTarget);
      setHovered(starFromX(local.x));
    },
    [interactive, starFromX],
  );

  const handlePointerOut = useCallback(() => setHovered(0), []);

  const handlePointerTap = useCallback(
    (e: FederatedPointerEvent) => {
      if (!onChange) return;
      e.stopPropagation();
      const local = e.getLocalPosition(e.currentTarget);
      const star = starFromX(local.x);
      if (star >= 1 && star <= 5) {
        // Click same star to clear
        onChange(value === star ? 0 : star);
      }
    },
    [onChange, starFromX, value],
  );

  const outerR = size / 2;
  const innerR = outerR * 0.4;

  const drawStars = useCallback(
    (g: GraphicsType) => {
      g.clear();
      const display = hovered || Math.round(value);
      for (let i = 1; i <= 5; i++) {
        const isFilled = i <= display;
        const isHover = hovered > 0 && i <= hovered;

        let fillColor: number;
        let fillAlpha: number;
        if (isHover) {
          fillColor = theme.warning.color;
          fillAlpha = 1;
        } else if (isFilled) {
          fillColor = theme.warning.color;
          fillAlpha = 0.7;
        } else {
          fillColor = theme.bgTertiary.color;
          fillAlpha = 1;
        }

        const cx = i * starWidth - starWidth / 2;
        const cy = size / 2;
        drawStar(g, cx, cy, outerR, innerR, fillColor, fillAlpha);
      }
    },
    [hovered, value, theme.warning.color, theme.bgTertiary.color, starWidth, size, outerR, innerR],
  );

  return (
    <pixiContainer
      eventMode={interactive ? 'static' : 'none'}
      cursor={interactive ? 'pointer' : undefined}
      hitArea={hitArea}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
      onPointerTap={handlePointerTap}
      layout={{ flexDirection: 'row', alignItems: 'center', height: size, width: totalWidth, ...layoutProp }}
    >
      <pixiGraphics
        eventMode="none"
        draw={drawStars}
        layout={{ width: totalStarsWidth, height: size }}
      />
      {countText !== '' && (
        <pixiBitmapText
          eventMode="none"
          text={countText}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          alpha={0.5}
          layout={{ marginLeft: 4 }}
        />
      )}
    </pixiContainer>
  );
};
