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
const HOLD_DELAY = 300;
const HOLD_INTERVAL = 80;

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

  // Refs for hold-to-repeat (current value tracked via ref to avoid stale closures)
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearHoldTimers = useCallback(() => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
  }, []);

  // Clean up on unmount
  useEffect(() => clearHoldTimers, [clearHoldTimers]);

  const increment = useCallback(() => {
    if (disabled) return;
    const newVal = Math.min(max, valueRef.current + step);
    valueRef.current = newVal;
    onChangeRef.current(newVal);
  }, [max, step, disabled]);

  const decrement = useCallback(() => {
    if (disabled) return;
    const newVal = Math.max(min, valueRef.current - step);
    valueRef.current = newVal;
    onChangeRef.current(newVal);
  }, [min, step, disabled]);

  const startHoldRepeat = useCallback((action: () => void) => {
    clearHoldTimers();
    action(); // fire once immediately
    holdTimerRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(action, HOLD_INTERVAL);
    }, HOLD_DELAY);
  }, [clearHoldTimers]);

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
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ width: 70 }}
        />
      )}

      {/* Value display */}
      <pixiContainer layout={{ width, height: INPUT_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
        <pixiGraphics draw={drawValueBg} layout={{ position: 'absolute', width, height: INPUT_HEIGHT }} />
        <pixiBitmapText
          text={displayText}
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
          tint={theme.accent.color}
          layout={{}}
        />
      </pixiContainer>

      {/* Arrow buttons */}
      {showButtons && (
        <pixiContainer layout={{ width: ARROW_BTN_SIZE, height: INPUT_HEIGHT, flexDirection: 'column', gap: 1 }}>
          {/* Up arrow — hold-to-repeat */}
          <pixiGraphics
            draw={(g) => drawArrow(g, true, false)}
            eventMode={disabled ? 'none' : 'static'}
            cursor="pointer"
            onPointerDown={() => startHoldRepeat(increment)}
            onPointerUp={clearHoldTimers}
            onPointerUpOutside={clearHoldTimers}
            layout={{ width: ARROW_BTN_SIZE, height: ARROW_BTN_SIZE / 2 }}
          />
          {/* Down arrow — hold-to-repeat */}
          <pixiGraphics
            draw={(g) => drawArrow(g, false, false)}
            eventMode={disabled ? 'none' : 'static'}
            cursor="pointer"
            onPointerDown={() => startHoldRepeat(decrement)}
            onPointerUp={clearHoldTimers}
            onPointerUpOutside={clearHoldTimers}
            layout={{ width: ARROW_BTN_SIZE, height: ARROW_BTN_SIZE / 2 }}
          />
        </pixiContainer>
      )}
    </pixiContainer>
  );
};
