/**
 * PixiSlider — Vertical and horizontal slider control.
 * Graphics track + handle, drag interaction via pointer events,
 * center detent, double-click reset.
 * Used for: DeckPitchSlider, MixerCrossfader, channel faders.
 */

import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { Rectangle } from 'pixi.js';
import type { Graphics as GraphicsType, Container as ContainerType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

interface PixiSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Slider orientation */
  orientation?: 'vertical' | 'horizontal';
  /** Total length in pixels (height for vertical, width for horizontal) */
  length?: number;
  /** Track thickness in pixels */
  thickness?: number;
  /** Handle width */
  handleWidth?: number;
  /** Handle height */
  handleHeight?: number;
  /** Center detent value (e.g., 0 for pitch fader) */
  detent?: number;
  /** Snap range around detent (in value units) */
  detentRange?: number;
  /** Default value for double-click reset */
  defaultValue?: number;
  /** Step quantization */
  step?: number;
  /** Show value label */
  showValue?: boolean;
  /** Label text */
  label?: string;
  /** Value format function */
  formatValue?: (value: number) => string;
  disabled?: boolean;
  color?: number;
  layout?: Record<string, unknown>;
}

const DOUBLE_CLICK_MS = 300;

export const PixiSlider: React.FC<PixiSliderProps> = ({
  value,
  min,
  max,
  onChange,
  orientation = 'vertical',
  length = 120,
  thickness = 6,
  handleWidth = 24,
  handleHeight = 10,
  detent,
  detentRange = 0.02,
  defaultValue,
  step,
  showValue = false,
  label,
  formatValue,
  disabled = false,
  color: colorProp,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const containerRef = useRef<ContainerType>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastClickTime = useRef(0);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const accent = colorProp ?? theme.accent.color;
  const isVert = orientation === 'vertical';
  const autoSize = length === 0;

  const norm = (Math.max(min, Math.min(max, value)) - min) / (max - min);

  const clampAndSnap = useCallback((val: number): number => {
    let v = Math.max(min, Math.min(max, val));
    if (step) v = Math.round(v / step) * step;
    if (detent !== undefined && Math.abs(v - detent) < (detentRange * (max - min))) {
      v = detent;
    }
    return v;
  }, [min, max, step, detent, detentRange]);

  // Track and handle drawing
  const drawSlider = useCallback((g: GraphicsType) => {
    g.clear();
    // When autoSize, read the actual rendered size for the track length
    let effectiveLength = length;
    if (autoSize) {
      const cl = (g as any).layout?.computedLayout;
      effectiveLength = (isVert ? cl?.height : cl?.width) || length || 120;
    }

    if (isVert) {
      // Vertical: track centered horizontally, handle moves vertically
      const trackX = (handleWidth - thickness) / 2;
      const trackR = Math.min(thickness / 2, 2);
      // Track background
      g.roundRect(trackX, 0, thickness, effectiveLength, trackR);
      g.fill({ color: theme.bgActive.color });
      g.roundRect(trackX, 0, thickness, effectiveLength, trackR);
      g.stroke({ color: theme.border.color, alpha: 0.5, width: 1 });

      // Value fill (from bottom up for vertical)
      const fillHeight = norm * effectiveLength;
      if (fillHeight > 1) {
        g.roundRect(trackX, effectiveLength - fillHeight, thickness, fillHeight, trackR);
        g.fill({ color: accent, alpha: 0.4 });
      }

      // Center detent line
      if (detent !== undefined) {
        const detentNorm = (detent - min) / (max - min);
        const detentY = effectiveLength - detentNorm * effectiveLength;
        g.moveTo(trackX - 2, detentY);
        g.lineTo(trackX + thickness + 2, detentY);
        g.stroke({ color: theme.textMuted.color, alpha: 0.5, width: 1 });
      }

      // Handle
      const handleY = effectiveLength - norm * effectiveLength - handleHeight / 2;
      g.roundRect(0, handleY, handleWidth, handleHeight, 2);
      g.fill({ color: isDragging ? accent : theme.bgHover.color });
      g.roundRect(0, handleY, handleWidth, handleHeight, 2);
      g.stroke({ color: isDragging ? accent : theme.borderLight.color, width: 1 });

      // Handle center line
      g.moveTo(4, handleY + handleHeight / 2);
      g.lineTo(handleWidth - 4, handleY + handleHeight / 2);
      g.stroke({ color: accent, alpha: 0.6, width: 1 });
    } else {
      // Horizontal: track centered vertically
      const trackY = (handleHeight - thickness) / 2;
      const trackR = Math.min(thickness / 2, 2);
      g.roundRect(0, trackY, effectiveLength, thickness, trackR);
      g.fill({ color: theme.bgActive.color });
      g.roundRect(0, trackY, effectiveLength, thickness, trackR);
      g.stroke({ color: theme.border.color, alpha: 0.5, width: 1 });

      // Value fill (from left)
      const fillWidth = norm * effectiveLength;
      if (fillWidth > 1) {
        g.roundRect(0, trackY, fillWidth, thickness, trackR);
        g.fill({ color: accent, alpha: 0.4 });
      }

      // Center detent line
      if (detent !== undefined) {
        const detentNorm = (detent - min) / (max - min);
        const detentX = detentNorm * effectiveLength;
        g.moveTo(detentX, trackY - 2);
        g.lineTo(detentX, trackY + thickness + 2);
        g.stroke({ color: theme.textMuted.color, alpha: 0.5, width: 1 });
      }

      // Handle
      const handleX = norm * effectiveLength - handleWidth / 2;
      g.roundRect(handleX, 0, handleWidth, handleHeight, 2);
      g.fill({ color: isDragging ? accent : theme.bgHover.color });
      g.roundRect(handleX, 0, handleWidth, handleHeight, 2);
      g.stroke({ color: isDragging ? accent : theme.borderLight.color, width: 1 });

      // Handle center line
      g.moveTo(handleX + handleWidth / 2, 3);
      g.lineTo(handleX + handleWidth / 2, handleHeight - 3);
      g.stroke({ color: accent, alpha: 0.6, width: 1 });
    }
  }, [isVert, length, autoSize, thickness, handleWidth, handleHeight, norm, accent, theme, isDragging, detent, min, max]);

  // Drag interaction — uses DOM events for smooth tracking after initial PixiJS pointerDown
  const handlePointerDown = useCallback((e: FederatedPointerEvent) => {
    if (disabled) return;
    e.stopPropagation();

    // Double-click detection
    const now = Date.now();
    if (now - lastClickTime.current < DOUBLE_CLICK_MS) {
      const resetVal = defaultValue ?? (detent ?? min);
      onChangeRef.current(resetVal);
      lastClickTime.current = 0;
      return;
    }
    lastClickTime.current = now;

    // Use the native DOM event coordinates for consistent tracking
    const nativeEvent = e.nativeEvent as PointerEvent;
    const startPos = isVert ? nativeEvent.clientY : nativeEvent.clientX;
    const startNorm = norm;

    setIsDragging(true);

    // For auto-size sliders, read the actual rendered bounds
    let dragLength = length;
    if (autoSize && containerRef.current) {
      const bounds = containerRef.current.getBounds();
      dragLength = isVert ? bounds.height : bounds.width;
      if (dragLength <= 0) {
        // Fallback to computed layout
        dragLength = isVert
          ? ((containerRef.current as any)?.layout?.computedLayout?.height ?? 120)
          : ((containerRef.current as any)?.layout?.computedLayout?.width ?? 120);
      }
    }

    const onMove = (ev: PointerEvent) => {
      const currentPos = isVert ? ev.clientY : ev.clientX;
      const pixelDelta = currentPos - startPos;
      const normDelta = isVert ? -pixelDelta / dragLength : pixelDelta / dragLength;
      const newNorm = Math.max(0, Math.min(1, startNorm + normDelta));
      const newValue = clampAndSnap(min + newNorm * (max - min));
      onChangeRef.current(newValue);
    };

    const onUp = () => {
      setIsDragging(false);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [disabled, isVert, norm, length, autoSize, min, max, clampAndSnap, defaultValue, detent]);

  // (autoSize moved above draw callback)
  const containerWidth = isVert ? handleWidth : (autoSize ? undefined : length);
  const containerHeight = isVert ? (autoSize ? undefined : length) : handleHeight;
  const labelHeight = label ? 14 : 0;
  const valueHeight = showValue ? 14 : 0;
  const totalHeight = autoSize ? undefined : ((isVert ? length : handleHeight) + labelHeight + valueHeight + 4);

  const defaultFormatVal = (v: number) => {
    if (Math.abs(v) < 0.01) return '0';
    return v.toFixed(1);
  };
  const fmtVal = formatValue || defaultFormatVal;

  return (
    <pixiContainer
      ref={containerRef}
      eventMode={disabled ? 'none' : 'static'}
      hitArea={autoSize ? undefined : useMemo(() => new Rectangle(0, 0, containerWidth ?? 24, totalHeight ?? 120), [containerWidth, totalHeight])}
      cursor={disabled ? 'not-allowed' : isVert ? 'ns-resize' : 'ew-resize'}
      onPointerDown={handlePointerDown}
      alpha={disabled ? 0.4 : 1}
      layout={{
        ...(containerWidth !== undefined ? { width: containerWidth } : {}),
        ...(totalHeight !== undefined ? { height: totalHeight } : {}),
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        ...layoutProp,
      }}
      accessible
      accessibleType={"input" as any}
      accessibleTitle={label || 'Slider'}
    >
      {/* Label */}
      {label && (
        <pixiBitmapText
          text={label}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ height: labelHeight }}
        />
      )}

      {/* Slider track + handle */}
      <pixiGraphics
        draw={drawSlider}
        eventMode="none"
        layout={{
          ...(containerWidth !== undefined ? { width: containerWidth } : { width: handleWidth }),
          ...(containerHeight !== undefined ? { height: containerHeight } : { flex: 1, minHeight: 0 }),
        }}
      />

      {/* Value display */}
      {showValue && (
        <pixiBitmapText
          text={fmtVal(value)}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
          tint={theme.textSecondary.color}
          layout={{ height: valueHeight }}
        />
      )}
    </pixiContainer>
  );
};
