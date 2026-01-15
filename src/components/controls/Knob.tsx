/**
 * Knob - Rotary knob control with click-drag interaction
 */

import React, { useRef, useCallback, useEffect } from 'react';

interface KnobProps {
  value: number;
  min: number;
  max: number;
  label: string;
  unit?: string;
  onChange: (value: number) => void;
  logarithmic?: boolean;
  defaultValue?: number;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  /** Optional display value for visual feedback (e.g., live modulation). If provided, the knob rotates to this value while the control value remains separate. */
  displayValue?: number;
  /** When true, shows a subtle animation/glow to indicate activity */
  isActive?: boolean;
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

export const Knob: React.FC<KnobProps> = ({
  value,
  min,
  max,
  label,
  unit = '',
  onChange,
  logarithmic = false,
  defaultValue,
  size = 'md',
  color = '#00d4aa',
  displayValue,
  isActive = false,
}) => {
  const knobRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  // Size configurations
  const sizes = {
    sm: { knob: 40, fontSize: 10 },
    md: { knob: 56, fontSize: 11 },
    lg: { knob: 72, fontSize: 12 },
  };
  const { knob: knobSize, fontSize } = sizes[size];

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
  const displayNorm = getDisplayNormalized();
  const rotation = displayNorm * 270 - 135;

  // Format display value
  const formatValue = (val: number): string => {
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

  // Handle mouse down
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    startValue.current = getNormalized();
    document.body.style.cursor = 'ns-resize';
  }, [getNormalized]);

  // Handle double-click to reset
  const handleDoubleClick = useCallback(() => {
    if (defaultValue !== undefined) {
      onChange(defaultValue);
    }
  }, [defaultValue, onChange]);

  // Handle mouse move (global)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;

      const deltaY = startY.current - e.clientY;
      const sensitivity = 200; // pixels for full range
      const deltaNorm = deltaY / sensitivity;
      let newNorm = Math.max(0, Math.min(1, startValue.current + deltaNorm));

      let newValue: number;
      if (logarithmic) {
        newValue = linearToLog(newNorm, min, max);
      } else {
        newValue = min + newNorm * (max - min);
      }

      // Round to reasonable precision
      if (max - min > 100) {
        newValue = Math.round(newValue);
      } else {
        newValue = Math.round(newValue * 10) / 10;
      }

      onChange(newValue);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [min, max, logarithmic, onChange]);

  return (
    <div className="knob-container" style={{ width: knobSize + 20 }}>
      {/* Label */}
      <div
        className="knob-label"
        style={{ fontSize: fontSize - 1 }}
      >
        {label}
      </div>

      {/* Knob */}
      <div
        ref={knobRef}
        className="knob-body"
        style={{
          width: knobSize,
          height: knobSize,
        }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        {/* Background ring with tick marks */}
        <svg
          width={knobSize}
          height={knobSize}
          viewBox="0 0 100 100"
          className="knob-ring"
        >
          {/* Background arc */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="#1a1a1f"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray="198 66"
            transform="rotate(135 50 50)"
          />
          {/* Value arc */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${displayNorm * 198} 264`}
            transform="rotate(135 50 50)"
            style={{
              transition: displayValue !== undefined ? 'none' : 'stroke-dasharray 0.05s ease-out',
              filter: isActive ? `drop-shadow(0 0 4px ${color})` : 'none',
            }}
          />
        </svg>

        {/* Inner knob with indicator */}
        <div
          className="knob-inner"
          style={{
            width: knobSize * 0.6,
            height: knobSize * 0.6,
            transform: `rotate(${rotation}deg)`,
            boxShadow: isActive ? `0 0 8px ${color}40` : 'none',
            transition: displayValue !== undefined ? 'transform 0.016s linear' : 'transform 0.1s ease-out',
          }}
        >
          <div
            className="knob-indicator"
            style={{
              backgroundColor: color,
              boxShadow: isActive ? `0 0 4px ${color}` : 'none',
            }}
          />
        </div>
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
        {formatValue(displayValue !== undefined ? displayValue : value)}{unit}
      </div>
    </div>
  );
};
