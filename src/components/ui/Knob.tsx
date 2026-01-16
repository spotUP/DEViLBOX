/**
 * Knob - VST-style rotary knob control
 * Drag up/down to change value, with visual arc indicator
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

interface KnobProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label?: string;
  unit?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  formatValue?: (value: number) => string;
  step?: number;
  bipolar?: boolean; // Center at 0 for bipolar controls like pan
}

export const Knob: React.FC<KnobProps> = ({
  value,
  min,
  max,
  onChange,
  label,
  unit = '',
  size = 'md',
  color = '#00ff88',
  formatValue,
  step = 1,
  bipolar = false,
}) => {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartValue = useRef(0);

  // Size configurations
  const sizes = {
    sm: { knob: 40, stroke: 3, fontSize: 9, labelSize: 8 },
    md: { knob: 56, stroke: 4, fontSize: 11, labelSize: 10 },
    lg: { knob: 72, stroke: 5, fontSize: 13, labelSize: 11 },
  };
  const s = sizes[size];

  // Calculate angle from value (270 degree arc, from -135 to +135)
  const range = max - min;
  const normalizedValue = (value - min) / range;
  const startAngle = -135;
  const endAngle = 135;
  const arcLength = endAngle - startAngle;
  const angle = startAngle + normalizedValue * arcLength;

  // For bipolar, center point is at 0 degrees (top)
  const centerAngle = bipolar ? 0 : startAngle;
  const valueAngle = angle;

  // SVG arc calculations
  const radius = (s.knob - s.stroke * 2) / 2;
  const center = s.knob / 2;

  const polarToCartesian = (angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
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

  // Handle mouse/touch drag
  const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartY.current = clientY;
    dragStartValue.current = value;
  }, [value]);

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;

    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const delta = dragStartY.current - clientY;
    const sensitivity = (max - min) / 150; // Pixels to drag for full range
    let newValue = dragStartValue.current + delta * sensitivity;

    // Apply step
    if (step > 0) {
      newValue = Math.round(newValue / step) * step;
    }

    // Clamp to range
    newValue = Math.max(min, Math.min(max, newValue));
    onChange(newValue);
  }, [isDragging, min, max, step, onChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Double-click to reset to default (center for bipolar, min for unipolar)
  const handleDoubleClick = useCallback(() => {
    onChange(bipolar ? 0 : min);
  }, [bipolar, min, onChange]);

  // Add global mouse listeners when dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Format the display value
  const displayValue = formatValue
    ? formatValue(value)
    : `${Math.round(value * 10) / 10}${unit}`;

  // Indicator line position
  const indicatorEnd = polarToCartesian(angle);
  const indicatorStart = {
    x: center + (radius - 8) * Math.cos(((angle - 90) * Math.PI) / 180),
    y: center + (radius - 8) * Math.sin(((angle - 90) * Math.PI) / 180),
  };

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Knob */}
      <div
        ref={knobRef}
        className={`relative cursor-grab select-none ${isDragging ? 'cursor-grabbing' : ''}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        style={{ width: s.knob, height: s.knob }}
      >
        <svg width={s.knob} height={s.knob} className="drop-shadow-lg">
          {/* Background track */}
          <path
            d={describeArc(startAngle, endAngle)}
            fill="none"
            stroke="#2a2a2a"
            strokeWidth={s.stroke}
            strokeLinecap="round"
          />

          {/* Value arc */}
          {bipolar ? (
            // Bipolar: draw from center to value
            normalizedValue !== 0.5 && (
              <path
                d={describeArc(
                  normalizedValue > 0.5 ? centerAngle : valueAngle,
                  normalizedValue > 0.5 ? valueAngle : centerAngle
                )}
                fill="none"
                stroke={color}
                strokeWidth={s.stroke}
                strokeLinecap="round"
                className="drop-shadow-glow"
                style={{ filter: `drop-shadow(0 0 4px ${color})` }}
              />
            )
          ) : (
            // Unipolar: draw from start to value
            <path
              d={describeArc(startAngle, angle)}
              fill="none"
              stroke={color}
              strokeWidth={s.stroke}
              strokeLinecap="round"
              className="drop-shadow-glow"
              style={{ filter: `drop-shadow(0 0 4px ${color})` }}
            />
          )}

          {/* Knob body */}
          <circle
            cx={center}
            cy={center}
            r={radius - s.stroke - 4}
            fill="url(#knobGradient)"
            stroke="#444"
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
            style={{ filter: `drop-shadow(0 0 3px ${color})` }}
          />

          {/* Gradient definitions */}
          <defs>
            <linearGradient id="knobGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4a4a4a" />
              <stop offset="50%" stopColor="#3a3a3a" />
              <stop offset="100%" stopColor="#2a2a2a" />
            </linearGradient>
          </defs>
        </svg>

        {/* Center value display */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ fontSize: s.fontSize }}
        >
          <span className="text-white font-mono font-bold">{displayValue}</span>
        </div>
      </div>

      {/* Label */}
      {label && (
        <span
          className="text-gray-400 font-medium uppercase tracking-wide"
          style={{ fontSize: s.labelSize }}
        >
          {label}
        </span>
      )}
    </div>
  );
};
