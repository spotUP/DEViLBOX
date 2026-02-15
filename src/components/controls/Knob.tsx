/**
 * Knob - Unified rotary knob control with click-drag interaction
 * Supports automation, bipolar mode, logarithmic scaling, touch input, and more
 */

import React, { useRef, useCallback, useEffect, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { useThemeStore } from '@stores';
import { haptics } from '@/utils/haptics';

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
  const [showNumericInput, setShowNumericInput] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const dragStartY = useRef(0);
  const dragStartX = useRef(0);
  const dragStartValue = useRef(0);
  const lastTapTime = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingValueRef = useRef<number | null>(null);
  const gradientId = useId();
  // Stable refs for values needed during drag (avoids stale closures)
  const onChangeRef = useRef(onChange);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const logarithmicRef = useRef(logarithmic);
  const stepRef = useRef(step);
  useEffect(() => {
    onChangeRef.current = onChange;
    minRef.current = min;
    maxRef.current = max;
    logarithmicRef.current = logarithmic;
    stepRef.current = step;
  }, [onChange, min, max, logarithmic, step]);

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

  // Clear long-press timer
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Handle double-tap for numeric input (mobile)
  const handleTap = useCallback((_e: React.TouchEvent) => {
    if (disabled) return;
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;

    if (timeSinceLastTap < 300) {
      // Double-tap detected
      clearLongPressTimer();
      haptics.medium();
      setShowNumericInput(true);
      lastTapTime.current = 0; // Reset to prevent triple-tap
    } else {
      lastTapTime.current = now;
    }
  }, [disabled, clearLongPressTimer]);

  // Handle long-press for preset menu (mobile)
  const handleLongPressStart = useCallback((_e: React.TouchEvent) => {
    if (disabled) return;
    const rect = knobRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPosition({ x: rect.left + rect.width / 2, y: rect.top });
    }

    longPressTimer.current = setTimeout(() => {
      haptics.heavy();
      setShowPresetMenu(true);
    }, 500);
  }, [disabled]);

  // Handle preset menu selection
  const handlePresetSelect = useCallback((preset: number) => {
    haptics.success();
    onChange(preset);
    setShowPresetMenu(false);
  }, [onChange]);

  // Handle numeric input submission
  const handleNumericSubmit = useCallback((value: number) => {
    const clampedValue = Math.max(min, Math.min(max, value));
    haptics.success();
    onChange(clampedValue);
    setShowNumericInput(false);
  }, [min, max, onChange]);

  // Handle mouse/touch down — registers global listeners only for this drag session
  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();

    const isTouchEvent = 'touches' in e;
    const clientY = isTouchEvent ? e.touches[0].clientY : e.clientY;
    const clientX = isTouchEvent ? e.touches[0].clientX : e.clientX;

    // For touch events, detect double-tap and long-press
    if (isTouchEvent) {
      handleTap(e);
      handleLongPressStart(e);
    }

    setIsDragging(true);
    dragStartY.current = clientY;
    dragStartX.current = clientX;
    dragStartValue.current = getNormalized();
    document.body.style.cursor = 'ns-resize';

    const handleMouseMove = (ev: MouseEvent | TouchEvent) => {
      // Clear long-press timer on movement
      clearLongPressTimer();

      const moveY = 'touches' in ev ? ev.touches[0].clientY : ev.clientY;
      const moveX = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;

      // Support bidirectional drag (horizontal + vertical)
      const deltaY = dragStartY.current - moveY;
      const deltaX = moveX - dragStartX.current;

      // Use the larger delta for better control
      const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
      const delta = isHorizontal ? deltaX : deltaY;

      const sensitivity = 150;
      const deltaNorm = delta / sensitivity;
      const newNorm = Math.max(0, Math.min(1, dragStartValue.current + deltaNorm));

      let newValue: number;
      if (logarithmicRef.current) {
        newValue = linearToLog(newNorm, minRef.current, maxRef.current);
      } else {
        newValue = minRef.current + newNorm * (maxRef.current - minRef.current);
      }

      const currentStep = stepRef.current;
      if (currentStep !== undefined && currentStep > 0) {
        newValue = Math.round(newValue / currentStep) * currentStep;
      } else {
        newValue = Math.round(newValue * 100) / 100;
      }

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
    };

    const handleMouseUp = () => {
      clearLongPressTimer();
      setIsDragging(false);
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove, { passive: false });
    window.addEventListener('touchend', handleMouseUp);
  }, [getNormalized, disabled, handleTap, handleLongPressStart, clearLongPressTimer]);

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

  // Cleanup any pending RAF and timers on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      clearLongPressTimer();
    };
  }, [clearLongPressTimer]);

  // Indicator line position
  const indicatorEnd = polarToCartesian(rotation);
  const indicatorStart = {
    x: center + (radius - 8) * Math.cos(((rotation - 90) * Math.PI) / 180),
    y: center + (radius - 8) * Math.sin(((rotation - 90) * Math.PI) / 180),
  };

  return (
    <>
    <div
      className="knob-container"
      style={{
        width: knobSize + 20,
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
        touchAction: 'none', // CRITICAL: Prevents scroll on mobile
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
          touchAction: 'none', // CRITICAL: Prevents scroll on mobile
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
            fill={`url(#kg-${gradientId})`}
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
            <linearGradient id={`kg-${gradientId}`} x1="0%" y1="0%" x2="0%" y2="100%">
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

    {/* Floating tooltip during drag */}
    {isDragging && createPortal(
      <div
        className="fixed pointer-events-none z-[9999] px-2 py-1 bg-black/90 border border-accent-primary rounded text-xs font-mono font-bold text-white shadow-xl transform -translate-x-1/2 -translate-y-full"
        style={{
          left: (knobRef.current?.getBoundingClientRect().left || 0) + knobSize / 2,
          top: (knobRef.current?.getBoundingClientRect().top || 0) - 8,
        }}
      >
        {formatValueDisplay(displayValue !== undefined ? displayValue : value)}{unit}
      </div>,
      document.body
    )}

    {/* Mobile numeric input modal */}
    {showNumericInput && (
      <div
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
        onClick={() => setShowNumericInput(false)}
      >
        <div
          className="bg-dark-bgSecondary rounded-lg p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-sm font-mono text-text-secondary mb-3">
            {label || 'Value'}
          </div>
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            defaultValue={value}
            autoFocus
            className="w-full px-4 py-3 text-lg font-mono bg-dark-bg border-2 border-accent-primary rounded-lg text-text-primary focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleNumericSubmit(parseFloat(e.currentTarget.value));
              } else if (e.key === 'Escape') {
                setShowNumericInput(false);
              }
            }}
          />
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => handleNumericSubmit(parseFloat((document.querySelector('input[type="number"]') as HTMLInputElement)?.value || String(value)))}
              className="flex-1 py-2 bg-accent-primary text-text-inverse rounded-lg font-mono text-sm"
            >
              OK
            </button>
            <button
              onClick={() => setShowNumericInput(false)}
              className="flex-1 py-2 bg-dark-bgTertiary text-text-secondary rounded-lg font-mono text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Mobile preset menu */}
    {showPresetMenu && (
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={() => setShowPresetMenu(false)}
      >
        <div
          className="absolute bg-dark-bgSecondary rounded-lg shadow-xl p-2 min-w-[120px]"
          style={{
            left: `${menuPosition.x}px`,
            top: `${menuPosition.y}px`,
            transform: 'translate(-50%, -100%) translateY(-8px)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs font-mono text-text-muted text-center mb-2 px-2 py-1">
            {label || 'Preset'}
          </div>
          {[0, 0.25, 0.5, 0.75, 1].map((preset) => {
            const presetValue = min + preset * (max - min);
            return (
              <button
                key={preset}
                onClick={() => handlePresetSelect(presetValue)}
                className="w-full px-3 py-2 text-sm font-mono text-text-secondary hover:bg-accent-primary hover:text-text-inverse rounded transition-colors"
              >
                {(preset * 100).toFixed(0)}% ({formatValueDisplay(presetValue)}{unit})
              </button>
            );
          })}
        </div>
      </div>
    )}
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for optimal memoization
  // onChange/onChangeRef handled via ref — no need to compare
  return (
    prevProps.value === nextProps.value &&
    prevProps.displayValue === nextProps.displayValue &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.min === nextProps.min &&
    prevProps.max === nextProps.max &&
    prevProps.label === nextProps.label &&
    prevProps.color === nextProps.color &&
    prevProps.size === nextProps.size &&
    prevProps.disabled === nextProps.disabled
  );
});

Knob.displayName = 'Knob';
