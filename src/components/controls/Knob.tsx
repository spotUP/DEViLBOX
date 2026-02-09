/**
 * Knob - Unified rotary knob control with click-drag interaction
 * Supports automation, bipolar mode, logarithmic scaling, touch input, and more
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useThemeStore } from '@stores';

interface KnobProps {
  // Core (both versions)
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label?: string;
  unit?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  title?: string; // Tooltip text on hover
  disabled?: boolean; // Disable interaction and dim appearance

  // From controls/Knob (TB303 automation)
  logarithmic?: boolean;
  displayValue?: number;
  isActive?: boolean;
  defaultValue?: number;

  // From ui/Knob (instrument editing)
  bipolar?: boolean;
  formatValue?: (value: number) => string;
  step?: number;
}

// Convert linear 0-1 to logarithmic value
const linearToLog = (linear: number, min: number, max: number): number => {
  const minLog = Math.log(min);
  const maxLog = Math.log(max);
  return Math.exp(minLog + linear * (maxLog - minLog));
};

// Convert logarithmic value to linear 0-1
const logToLinear = (value: number, min: number, max: number): number => {
  const minLog = Math.log(min);
  const maxLog = Math.log(max);
  return (Math.log(value) - minLog) / (maxLog - minLog);
};

// PERFORMANCE: Memoize Knob to prevent re-renders (30+ instances on TB-303 panel)
export const Knob: React.FC<KnobProps> = React.memo(({
  value,
  min,
  max,
  label,
  title,
  unit = '',
  onChange,
  logarithmic = false,
  defaultValue,
  size = 'md',
  color: colorProp = '#00d4aa',
  displayValue,
  isActive = false,
  bipolar = false,
  formatValue: customFormatValue,
  step,
  disabled = false,
}) => {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartY = useRef(0);
  const dragStartValue = useRef(0);
  const rafRef = useRef<number | null>(null);
  const pendingValueRef = useRef<number | null>(null);

  // Theme-aware colors: use cyan for cyan-lineart theme
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';
  const color = isCyanTheme ? '#00ffff' : colorProp;

  // Theme-aware grey colors
  const bgTrackColor = isCyanTheme ? '#0a3a3a' : '#2a2a2a';
  const knobStrokeColor = isCyanTheme ? '#0a4a4a' : '#444';
  const gradientTop = isCyanTheme ? '#0a4a4a' : '#4a4a4a';
  const gradientMid = isCyanTheme ? '#0a3a3a' : '#3a3a3a';
  const gradientBot = isCyanTheme ? '#0a2a2a' : '#2a2a2a';

  // Size configurations
  const sizes = {
    sm: { knob: 40, fontSize: 10, stroke: 3 },
    md: { knob: 56, fontSize: 11, stroke: 4 },
    lg: { knob: 72, fontSize: 12, stroke: 5 },
  };
  const { knob: knobSize, fontSize, stroke } = sizes[size];

  // Calculate normalized value (0-1) for control purposes
  const getNormalized = useCallback(() => {
    if (logarithmic) {
      return logToLinear(Math.max(min, Math.min(max, value)), min, max);
    }
    return (value - min) / (max - min);
  }, [value, min, max, logarithmic]);

  // Calculate normalized display value (0-1) - uses displayValue if provided
  const getDisplayNormalized = useCallback(() => {
    const displayVal = displayValue !== undefined ? displayValue : value;
    const clampedVal = Math.max(min, Math.min(max, displayVal));
    if (logarithmic) {
      return logToLinear(clampedVal, min, max);
    }
    return (clampedVal - min) / (max - min);
  }, [displayValue, value, min, max, logarithmic]);

  // Calculate rotation angle (-135 to +135 degrees) - uses display value for visual
  // Guard against NaN to prevent SVG rendering errors
  const displayNorm = getDisplayNormalized();
  const rotation = isNaN(displayNorm) || !isFinite(displayNorm) ? -135 : displayNorm * 270 - 135;

  // Default value formatting
  const defaultFormatValue = (val: number): string => {
    if (isNaN(val) || val === undefined || val === null) {
      return '0';
    }
    if (val >= 1000) {
      return `${(val / 1000).toFixed(1)}k`;
    }
    if (val < 10) {
      return val.toFixed(1);
    }
    return Math.round(val).toString();
  };

  // Use custom format function if provided, otherwise default
  const formatValueDisplay = customFormatValue || defaultFormatValue;

  // For bipolar mode
  const centerAngle = bipolar ? 0 : -135;
  const valueAngle = rotation;

  // SVG arc calculations
  const radius = (knobSize - stroke * 2) / 2;
  const center = knobSize / 2;

  const polarToCartesian = (angle: number) => {
    // Guard against NaN to prevent SVG rendering errors
    const safeAngle = isNaN(angle) || !isFinite(angle) ? -135 : angle;
    const rad = ((safeAngle - 90) * Math.PI) / 180;
    return {
      x: center + radius * Math.cos(rad),
      y: center + radius * Math.sin(rad),
    };
  };

  const describeArc = (start: number, end: number) => {
    const startPoint = polarToCartesian(start);
    const endPoint = polarToCartesian(end);
    const largeArcFlag = Math.abs(end - start) > 180 ? 1 : 0;
    const sweepFlag = end > start ? 1 : 0;
    return `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endPoint.x} ${endPoint.y}`;
  };

  // Handle mouse/touch down
  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
    isDraggingRef.current = true;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartY.current = clientY;
    dragStartValue.current = getNormalized();
    document.body.style.cursor = 'ns-resize';
  }, [getNormalized, disabled]);

  // Handle double-click to reset
  const handleDoubleClick = useCallback(() => {
    if (disabled) return;
    if (defaultValue !== undefined) {
      onChange(defaultValue);
    } else if (bipolar) {
      // Reset to center for bipolar
      onChange((max + min) / 2);
    } else {
      // Reset to min for unipolar
      onChange(min);
    }
  }, [defaultValue, bipolar, min, max, onChange, disabled]);

  // Handle right-click to reset
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default context menu
    if (disabled) return;
    if (defaultValue !== undefined) {
      onChange(defaultValue);
    } else if (bipolar) {
      // Reset to center for bipolar
      onChange((max + min) / 2);
    } else {
      // Reset to min for unipolar
      onChange(min);
    }
  }, [defaultValue, bipolar, min, max, onChange, disabled]);

  // Handle keyboard navigation for accessibility
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    let newValue = value;
    const stepSize = step || (logarithmic ? (max - min) / 100 : (max - min) / 50);
    const largeStep = stepSize * 10;

    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        e.preventDefault();
        newValue = Math.min(max, value + (e.shiftKey ? largeStep : stepSize));
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        e.preventDefault();
        newValue = Math.max(min, value - (e.shiftKey ? largeStep : stepSize));
        break;
      case 'Home':
        e.preventDefault();
        newValue = min;
        break;
      case 'End':
        e.preventDefault();
        newValue = max;
        break;
      case 'PageUp':
        e.preventDefault();
        newValue = Math.min(max, value + largeStep);
        break;
      case 'PageDown':
        e.preventDefault();
        newValue = Math.max(min, value - largeStep);
        break;
      default:
        return;
    }

    // Round to reasonable precision or apply step
    if (step !== undefined && step > 0) {
      newValue = Math.round(newValue / step) * step;
    } else if (max - min > 100) {
      newValue = Math.round(newValue);
    } else {
      newValue = Math.round(newValue * 10) / 10;
    }

    onChange(newValue);
  }, [value, min, max, logarithmic, step, onChange]);

  // Handle mouse/touch move (global)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current) return;

      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const deltaY = dragStartY.current - clientY;
      const sensitivity = 150; // pixels for full range
      const deltaNorm = deltaY / sensitivity;
      const newNorm = Math.max(0, Math.min(1, dragStartValue.current + deltaNorm));

      let newValue: number;
      if (logarithmic) {
        newValue = linearToLog(newNorm, min, max);
      } else {
        newValue = min + newNorm * (max - min);
      }

      // Apply step if specified
      if (step !== undefined && step > 0) {
        newValue = Math.round(newValue / step) * step;
      } else {
        // No step - use maximum precision for smooth movement
        newValue = Math.round(newValue * 100) / 100;
      }

      // Schedule RAF update for smooth rendering
      pendingValueRef.current = newValue;
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          if (pendingValueRef.current !== null) {
            onChange(pendingValueRef.current);
            pendingValueRef.current = null;
          }
          rafRef.current = null;
        });
      }
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        setIsDragging(false);
        isDraggingRef.current = false;
        document.body.style.cursor = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove);
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [min, max, logarithmic, step, onChange]);

  // Indicator line position
  const indicatorEnd = polarToCartesian(rotation);
  const indicatorStart = {
    x: center + (radius - 8) * Math.cos(((rotation - 90) * Math.PI) / 180),
    y: center + (radius - 8) * Math.sin(((rotation - 90) * Math.PI) / 180),
  };

  return (
    <div 
      className="knob-container" 
      style={{ 
        width: knobSize + 20,
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }} 
      title={title}
    >
      {/* Label */}
      {label && (
        <div
          className="knob-label"
          style={{ fontSize: fontSize - 1 }}
        >
          {label}
        </div>
      )}

      {/* Knob */}
      <div
        ref={knobRef}
        className={`knob-body ${isDragging ? 'cursor-grabbing' : ''}`}
        style={{
          width: knobSize,
          height: knobSize,
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
        role="slider"
        aria-label={`${label || 'Knob'}${unit ? ` (${unit})` : ''}`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 10) / 10}
        aria-valuetext={`${formatValueDisplay(displayValue !== undefined ? displayValue : value)}${unit}`}
        tabIndex={0}
      >
        <svg width={knobSize} height={knobSize} viewBox={`0 0 ${knobSize} ${knobSize}`}>
          {/* Background track */}
          <path
            d={describeArc(-135, 135)}
            fill="none"
            stroke={bgTrackColor}
            strokeWidth={stroke}
            strokeLinecap="round"
          />

          {/* Value arc */}
          {bipolar ? (
            // Bipolar: draw from center to value
            displayNorm !== 0.5 && (
              <path
                d={describeArc(
                  displayNorm > 0.5 ? centerAngle : valueAngle,
                  displayNorm > 0.5 ? valueAngle : centerAngle
                )}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
                strokeLinecap="round"
                style={{
                  filter: isActive ? `drop-shadow(0 0 4px ${color})` : `drop-shadow(0 0 2px ${color})`,
                  transition: displayValue !== undefined ? 'none' : 'stroke-dasharray 0.05s ease-out',
                }}
              />
            )
          ) : (
            // Unipolar: draw from start to value
            <path
              d={describeArc(-135, rotation)}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              style={{
                filter: isActive ? `drop-shadow(0 0 4px ${color})` : `drop-shadow(0 0 2px ${color})`,
                transition: displayValue !== undefined ? 'none' : 'stroke-dasharray 0.05s ease-out',
              }}
            />
          )}

          {/* Knob body */}
          <circle
            cx={center}
            cy={center}
            r={radius - stroke - 4}
            fill="url(#knobGradient)"
            stroke={knobStrokeColor}
            strokeWidth="1"
          />

          {/* Indicator line */}
          <line
            x1={indicatorStart.x}
            y1={indicatorStart.y}
            x2={indicatorEnd.x}
            y2={indicatorEnd.y}
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            style={{
              filter: isActive ? `drop-shadow(0 0 3px ${color})` : 'none',
              transition: displayValue !== undefined ? 'transform 0.016s linear' : 'transform 0.1s ease-out',
            }}
          />

          {/* Gradient definitions */}
          <defs>
            <linearGradient id="knobGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={gradientTop} />
              <stop offset="50%" stopColor={gradientMid} />
              <stop offset="100%" stopColor={gradientBot} />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Value display */}
      <div
        className="knob-value"
        style={{
          fontSize,
          color: isActive ? color : undefined,
          textShadow: isActive ? `0 0 4px ${color}80` : 'none',
        }}
      >
        {formatValueDisplay(displayValue !== undefined ? displayValue : value)}{unit}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for optimal memoization
  return (
    prevProps.value === nextProps.value &&
    prevProps.displayValue === nextProps.displayValue &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.min === nextProps.min &&
    prevProps.max === nextProps.max &&
    prevProps.label === nextProps.label &&
    prevProps.color === nextProps.color &&
    prevProps.size === nextProps.size
  );
});

Knob.displayName = 'Knob';
