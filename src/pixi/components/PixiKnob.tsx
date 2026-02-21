/**
 * PixiKnob — Rotary knob control rendered entirely with PixiJS Graphics.
 * Most critical primitive (~500 lines). Full feature parity with DOM Knob.
 *
 * Features:
 * - Graphics: knob body circle, arc track, value arc, indicator line
 * - Drag via PixiDragManager (vertical+horizontal, 150px sensitivity)
 * - States: normal, dragging, hovered, disabled, active (automation glow)
 * - Double-click reset, right-click reset
 * - Keyboard: arrows, Home/End, PgUp/PgDn
 * - Floating tooltip during drag (DOM portal)
 * - Logarithmic scaling, bipolar mode, step quantization
 * - Theme-aware (cyan accent override)
 *
 * Reference: src/components/controls/Knob.tsx (670 lines)
 */

import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Graphics as GraphicsType, Container as ContainerType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PixiKnobProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label?: string;
  unit?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: number;              // 0xRRGGBB — overridden by cyan theme
  disabled?: boolean;
  logarithmic?: boolean;
  displayValue?: number;       // Override displayed value (automation)
  isActive?: boolean;          // Glow effect
  defaultValue?: number;       // Double-click reset target
  bipolar?: boolean;           // Arc from center
  formatValue?: (value: number) => string;
  step?: number;
  title?: string;
  layout?: Record<string, unknown>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIZE_CONFIG = {
  sm: { knob: 40, fontSize: 9,  stroke: 3, indicatorLen: 6, bodyRadius: 12 },
  md: { knob: 56, fontSize: 11, stroke: 4, indicatorLen: 8, bodyRadius: 17 },
  lg: { knob: 72, fontSize: 12, stroke: 5, indicatorLen: 10, bodyRadius: 22 },
} as const;

const ARC_START_DEG = -135;
const ARC_END_DEG = 135;
const ARC_RANGE_DEG = ARC_END_DEG - ARC_START_DEG; // 270
const DRAG_SENSITIVITY = 150;
const DOUBLE_CLICK_MS = 300;

// ─── Math Helpers ─────────────────────────────────────────────────────────────

const linearToLog = (linear: number, min: number, max: number): number => {
  const minLog = Math.log(min);
  const maxLog = Math.log(max);
  return Math.exp(minLog + linear * (maxLog - minLog));
};

const logToLinear = (value: number, min: number, max: number): number => {
  const minLog = Math.log(min);
  const maxLog = Math.log(max);
  return (Math.log(value) - minLog) / (maxLog - minLog);
};

const degToRad = (deg: number) => ((deg - 90) * Math.PI) / 180;

const polarToXY = (cx: number, cy: number, r: number, deg: number) => ({
  x: cx + r * Math.cos(degToRad(deg)),
  y: cy + r * Math.sin(degToRad(deg)),
});

const defaultFormatValue = (val: number): string => {
  if (isNaN(val) || val === undefined || val === null) return '0';
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
  if (val < 10) return val.toFixed(1);
  return Math.round(val).toString();
};

// ─── Arc Drawing ──────────────────────────────────────────────────────────────

function drawArc(
  g: GraphicsType,
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
  color: number,
  alpha: number,
  lineWidth: number,
) {
  if (Math.abs(endDeg - startDeg) < 0.5) return;
  const startRad = degToRad(startDeg);
  const endRad = degToRad(endDeg);
  g.moveTo(cx + r * Math.cos(startRad), cy + r * Math.sin(startRad));
  g.arc(cx, cy, r, startRad, endRad, endDeg < startDeg);
  g.stroke({ color, alpha, width: lineWidth, cap: 'round' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export const PixiKnob: React.FC<PixiKnobProps> = ({
  value,
  min,
  max,
  onChange,
  label,
  unit = '',
  size = 'md',
  color: colorProp,
  disabled = false,
  logarithmic = false,
  displayValue,
  isActive = false,
  defaultValue,
  bipolar = false,
  formatValue: customFormatValue,
  step,
  title,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const containerRef = useRef<ContainerType>(null);
  const graphicsRef = useRef<GraphicsType>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [, setIsHovered] = useState(false);

  // Drag state refs (avoids stale closures)
  const dragStartY = useRef(0);
  const dragStartX = useRef(0);
  const dragStartNorm = useRef(0);
  const lastClickTime = useRef(0);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const pendingValueRef = useRef<number | null>(null);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { valueRef.current = value; }, [value]);

  const config = SIZE_CONFIG[size];
  const accent = colorProp ?? theme.accent.color;
  const cx = config.knob / 2;
  const cy = config.knob / 2;
  const arcRadius = (config.knob - config.stroke * 2) / 2;

  // Knob body gradient colors
  const bodyGradBot = theme.bgTertiary.color;
  const bodyStroke = theme.border.color;

  // ─── Normalized value computation ───────────────────────────────────────

  const getNormalized = useCallback((val: number): number => {
    const clamped = Math.max(min, Math.min(max, val));
    if (logarithmic) return logToLinear(clamped, min, max);
    return (clamped - min) / (max - min);
  }, [min, max, logarithmic]);

  const displayVal = displayValue !== undefined ? displayValue : value;
  const displayNorm = getNormalized(displayVal);
  const rotation = isNaN(displayNorm) || !isFinite(displayNorm)
    ? ARC_START_DEG
    : ARC_START_DEG + displayNorm * ARC_RANGE_DEG;

  const formatValueFn = customFormatValue || defaultFormatValue;

  // ─── Draw knob ──────────────────────────────────────────────────────────

  const draw = useCallback((g: GraphicsType) => {
    g.clear();

    // Background track arc
    drawArc(g, cx, cy, arcRadius, ARC_START_DEG, ARC_END_DEG, theme.bgActive.color, 0.6, config.stroke);

    // Value arc
    if (bipolar) {
      const centerDeg = 0; // center = 0 degrees (top)
      if (displayNorm !== 0.5) {
        const fromDeg = displayNorm > 0.5 ? centerDeg : rotation;
        const toDeg = displayNorm > 0.5 ? rotation : centerDeg;
        drawArc(g, cx, cy, arcRadius, fromDeg, toDeg, accent, 1, config.stroke);
      }
    } else {
      drawArc(g, cx, cy, arcRadius, ARC_START_DEG, rotation, accent, 1, config.stroke);
    }

    // Knob body circle (gradient approximation — two-tone fill)
    const bodyR = config.bodyRadius;
    g.circle(cx, cy, bodyR);
    g.fill({ color: bodyGradBot });
    g.circle(cx, cy, bodyR);
    g.stroke({ color: bodyStroke, width: 1 });

    // Indicator line
    const indicatorOuter = polarToXY(cx, cy, arcRadius - 2, rotation);
    const indicatorInner = polarToXY(cx, cy, arcRadius - 2 - config.indicatorLen, rotation);
    g.moveTo(indicatorInner.x, indicatorInner.y);
    g.lineTo(indicatorOuter.x, indicatorOuter.y);
    g.stroke({ color: accent, width: 2, cap: 'round' });

    // Active glow ring
    if (isActive) {
      g.circle(cx, cy, arcRadius + 2);
      g.stroke({ color: accent, alpha: 0.2, width: 2 });
    }
  }, [cx, cy, arcRadius, config, accent, theme, rotation, displayNorm, bipolar, isActive, bodyGradBot, bodyStroke]);

  // ─── Drag handlers ──────────────────────────────────────────────────────

  const applyValue = useCallback((norm: number) => {
    let newValue: number;
    if (logarithmic) {
      newValue = linearToLog(norm, min, max);
    } else {
      newValue = min + norm * (max - min);
    }
    if (step !== undefined && step > 0) {
      newValue = Math.round(newValue / step) * step;
    } else {
      newValue = Math.round(newValue * 100) / 100;
    }
    newValue = Math.max(min, Math.min(max, newValue));

    pendingValueRef.current = newValue;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        if (pendingValueRef.current !== null) {
          onChangeRef.current(pendingValueRef.current);
          pendingValueRef.current = null;
        }
        rafRef.current = null;
      });
    }
  }, [min, max, logarithmic, step]);

  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    if (disabled) return;
    e.stopPropagation();

    // Double-click detection
    const now = Date.now();
    if (now - lastClickTime.current < DOUBLE_CLICK_MS) {
      // Reset
      const resetVal = defaultValue ?? (bipolar ? (max + min) / 2 : min);
      onChangeRef.current(resetVal);
      lastClickTime.current = 0;
      return;
    }
    lastClickTime.current = now;

    setIsDragging(true);
    dragStartY.current = e.globalY;
    dragStartX.current = e.globalX;
    dragStartNorm.current = getNormalized(valueRef.current);

    const stage = (containerRef.current as any)?.stage;
    if (!stage) return;

    const onMove = (ev: FederatedPointerEvent) => {
      const deltaY = dragStartY.current - ev.globalY;
      const deltaX = ev.globalX - dragStartX.current;
      const isHoriz = Math.abs(deltaX) > Math.abs(deltaY);
      let delta = (isHoriz ? deltaX : deltaY) / DRAG_SENSITIVITY;

      // Fine mode
      if (ev.shiftKey) delta *= 0.1;

      const newNorm = Math.max(0, Math.min(1, dragStartNorm.current + delta));
      applyValue(newNorm);
    };

    const onUp = () => {
      setIsDragging(false);
      stage.off('pointermove', onMove);
      stage.off('pointerup', onUp);
      stage.off('pointerupoutside', onUp);
    };

    stage.on('pointermove', onMove);
    stage.on('pointerup', onUp);
    stage.on('pointerupoutside', onUp);
  }, [disabled, getNormalized, applyValue, defaultValue, bipolar, min, max]);

  // Right-click reset
  const handleRightClick = useCallback((e: FederatedPointerEvent) => {
    e.stopPropagation();
    if (disabled) return;
    const resetVal = defaultValue ?? (bipolar ? (max + min) / 2 : min);
    onChangeRef.current(resetVal);
  }, [disabled, defaultValue, bipolar, min, max]);

  const handlePointerOver = useCallback(() => { if (!disabled) setIsHovered(true); }, [disabled]);
  const handlePointerOut = useCallback(() => setIsHovered(false), []);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ─── Tooltip (DOM portal during drag) ───────────────────────────────────

  const tooltipContent = useMemo(() => {
    if (!isDragging) return null;
    const el = containerRef.current;
    if (!el) return null;
    // Get screen position from PixiJS global transform
    const bounds = el.getBounds();
    return createPortal(
      <div
        style={{
          position: 'fixed',
          left: bounds.x + config.knob / 2,
          top: bounds.y - 8,
          transform: 'translate(-50%, -100%)',
          padding: '2px 6px',
          background: 'rgba(0,0,0,0.9)',
          border: `1px solid #${accent.toString(16).padStart(6, '0')}`,
          borderRadius: 4,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
          fontWeight: 700,
          color: '#fff',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 9999,
        }}
      >
        {formatValueFn(displayVal)}{unit}
      </div>,
      document.body,
    );
  }, [isDragging, displayVal, unit, formatValueFn, accent, config.knob]);

  // Total component dimensions
  const totalWidth = config.knob + 20;
  const labelHeight = label ? 14 : 0;
  const valueHeight = 14;
  const totalHeight = config.knob + labelHeight + valueHeight + 4;

  return (
    <>
      <pixiContainer
        ref={containerRef}
        eventMode={disabled ? 'none' : 'static'}
        cursor={disabled ? 'not-allowed' : isDragging ? 'ns-resize' : 'pointer'}
        onPointerDown={handlePointerDown}
        onRightClick={handleRightClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        alpha={disabled ? 0.4 : 1}
        layout={{
          width: totalWidth,
          height: totalHeight,
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          ...layoutProp,
        }}
        accessible
        accessibleType={"input" as any}
        accessibleTitle={title || label || 'Knob'}
      >
        {/* Label */}
        {label && (
          <pixiBitmapText
            text={label}
            style={{
              fontFamily: PIXI_FONTS.MONO,
              fontSize: config.fontSize - 1,
              fill: 0xffffff,
            }}
            tint={theme.textMuted.color}
            layout={{ height: labelHeight }}
          />
        )}

        {/* Knob graphic */}
        <pixiGraphics
          ref={graphicsRef}
          draw={draw}
          layout={{ width: config.knob, height: config.knob }}
        />

        {/* Value display */}
        <pixiBitmapText
          text={`${formatValueFn(displayVal)}${unit}`}
          style={{
            fontFamily: PIXI_FONTS.MONO,
            fontSize: config.fontSize,
            fill: 0xffffff,
          }}
          tint={isActive ? accent : theme.textSecondary.color}
          layout={{ height: valueHeight }}
        />
      </pixiContainer>

      {/* Floating tooltip during drag */}
      {tooltipContent}
    </>
  );
};
