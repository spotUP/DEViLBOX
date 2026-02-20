/**
 * PixiNumericInput — Numeric input with FT2-style +/- buttons.
 * Displays value with BitmapText, flanked by up/down buttons.
 * Supports min/max, step, arrow key increment.
 */

import { useCallback, useRef, useEffect } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

interface PixiNumericInputProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  /** Width of the value display area */
  width?: number;
  /** Format the displayed value */
  formatValue?: (value: number) => string;
  disabled?: boolean;
  /** Show +/- buttons */
  showButtons?: boolean;
  layout?: Record<string, unknown>;
}

const ARROW_BTN_SIZE = 18;
const INPUT_HEIGHT = 24;

export const PixiNumericInput: React.FC<PixiNumericInputProps> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  width = 44,
  formatValue,
  disabled = false,
  showButtons = true,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const increment = useCallback(() => {
    if (disabled) return;
    const newVal = Math.min(max, value + step);
    onChangeRef.current(newVal);
  }, [value, max, step, disabled]);

  const decrement = useCallback(() => {
    if (disabled) return;
    const newVal = Math.max(min, value - step);
    onChangeRef.current(newVal);
  }, [value, min, step, disabled]);

  const displayText = formatValue ? formatValue(value) : String(value);

  const drawValueBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, width, INPUT_HEIGHT, 4);
    g.fill({ color: theme.bg.color });
    g.roundRect(0, 0, width, INPUT_HEIGHT, 4);
    g.stroke({ color: theme.border.color, alpha: 0.6, width: 1 });
  }, [width, theme]);

  const drawArrow = useCallback((g: GraphicsType, isUp: boolean, isHovered: boolean) => {
    g.clear();
    g.roundRect(0, 0, ARROW_BTN_SIZE, ARROW_BTN_SIZE / 2, 2);
    g.fill({ color: isHovered ? theme.bgHover.color : theme.bgTertiary.color });
    g.roundRect(0, 0, ARROW_BTN_SIZE, ARROW_BTN_SIZE / 2, 2);
    g.stroke({ color: theme.border.color, alpha: 0.4, width: 1 });

    // Arrow triangle
    const cx = ARROW_BTN_SIZE / 2;
    const cy = ARROW_BTN_SIZE / 4;
    const size = 3;
    if (isUp) {
      g.moveTo(cx - size, cy + size / 2);
      g.lineTo(cx, cy - size / 2);
      g.lineTo(cx + size, cy + size / 2);
    } else {
      g.moveTo(cx - size, cy - size / 2);
      g.lineTo(cx, cy + size / 2);
      g.lineTo(cx + size, cy - size / 2);
    }
    g.stroke({ color: isHovered ? theme.accent.color : theme.textMuted.color, width: 1 });
  }, [theme]);

  const totalWidth = width + (showButtons ? ARROW_BTN_SIZE + 4 : 0);
  const labelHeight = label ? 14 : 0;

  return (
    <pixiContainer
      alpha={disabled ? 0.4 : 1}
      layout={{
        width: totalWidth + (label ? 70 : 0),
        height: INPUT_HEIGHT + labelHeight,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        ...layoutProp,
      }}
    >
      {/* Label */}
      {label && (
        <pixiBitmapText
          text={label}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10 }}
          tint={theme.textMuted.color}
          layout={{ width: 70 }}
        />
      )}

      {/* Value display */}
      <pixiContainer layout={{ width, height: INPUT_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
        <pixiGraphics draw={drawValueBg} layout={{ position: 'absolute', width, height: INPUT_HEIGHT }} />
        <pixiBitmapText
          text={displayText}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12 }}
          tint={theme.accent.color}
        />
      </pixiContainer>

      {/* Arrow buttons */}
      {showButtons && (
        <pixiContainer layout={{ width: ARROW_BTN_SIZE, height: INPUT_HEIGHT, flexDirection: 'column', gap: 1 }}>
          {/* Up arrow */}
          <pixiGraphics
            draw={(g) => drawArrow(g, true, false)}
            eventMode={disabled ? 'none' : 'static'}
            cursor="pointer"
            onPointerUp={increment}
            layout={{ width: ARROW_BTN_SIZE, height: ARROW_BTN_SIZE / 2 }}
          />
          {/* Down arrow */}
          <pixiGraphics
            draw={(g) => drawArrow(g, false, false)}
            eventMode={disabled ? 'none' : 'static'}
            cursor="pointer"
            onPointerUp={decrement}
            layout={{ width: ARROW_BTN_SIZE, height: ARROW_BTN_SIZE / 2 }}
          />
        </pixiContainer>
      )}
    </pixiContainer>
  );
};
