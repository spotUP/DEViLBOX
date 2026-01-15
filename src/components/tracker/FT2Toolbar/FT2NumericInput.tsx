/**
 * FT2NumericInput - FastTracker II style numeric input with arrows
 * Supports hold-to-repeat and throttling for smooth BPM changes
 */

import React, { useRef, useCallback, useEffect } from 'react';

interface FT2NumericInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: 'decimal' | 'hex';
  /** Throttle changes to prevent audio glitches (useful for BPM) */
  throttleMs?: number;
}

export const FT2NumericInput: React.FC<FT2NumericInputProps> = ({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  format = 'decimal',
  throttleMs = 0,
}) => {
  // Refs for hold-to-repeat functionality
  const repeatIntervalRef = useRef<number | null>(null);
  const repeatTimeoutRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  const lastChangeRef = useRef(0);

  // Keep valueRef in sync
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (repeatIntervalRef.current) clearInterval(repeatIntervalRef.current);
      if (repeatTimeoutRef.current) clearTimeout(repeatTimeoutRef.current);
    };
  }, []);

  const applyChange = useCallback((newValue: number) => {
    const now = Date.now();
    if (throttleMs > 0 && now - lastChangeRef.current < throttleMs) {
      return; // Throttle - skip this change
    }
    lastChangeRef.current = now;
    onChange(newValue);
  }, [onChange, throttleMs]);

  const handleIncrement = useCallback(() => {
    const newValue = Math.min(max, valueRef.current + step);
    valueRef.current = newValue;
    applyChange(newValue);
  }, [max, step, applyChange]);

  const handleDecrement = useCallback(() => {
    const newValue = Math.max(min, valueRef.current - step);
    valueRef.current = newValue;
    applyChange(newValue);
  }, [min, step, applyChange]);

  const startRepeat = useCallback((action: () => void) => {
    // Immediate first action
    action();

    // Clear any existing timers
    if (repeatTimeoutRef.current) clearTimeout(repeatTimeoutRef.current);
    if (repeatIntervalRef.current) clearInterval(repeatIntervalRef.current);

    // Start repeating after initial delay (300ms), then repeat faster (80ms)
    repeatTimeoutRef.current = window.setTimeout(() => {
      repeatIntervalRef.current = window.setInterval(action, 80);
    }, 300);
  }, []);

  const stopRepeat = useCallback(() => {
    if (repeatTimeoutRef.current) {
      clearTimeout(repeatTimeoutRef.current);
      repeatTimeoutRef.current = null;
    }
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
  }, []);

  const formatValue = (val: number): string => {
    if (format === 'hex') {
      return val.toString(16).toUpperCase().padStart(2, '0');
    }
    return val.toString().padStart(3, '0');
  };

  return (
    <div className="ft2-numeric-group">
      <span className="ft2-numeric-label">{label}:</span>
      <span className="ft2-numeric-value">
        {formatValue(value)}
      </span>
      <div className="ft2-numeric-arrows">
        <button
          className="ft2-arrow ft2-arrow-up"
          onMouseDown={() => startRepeat(handleIncrement)}
          onMouseUp={stopRepeat}
          onMouseLeave={stopRepeat}
          onTouchStart={() => startRepeat(handleIncrement)}
          onTouchEnd={stopRepeat}
          title={`Increase ${label}`}
        >
          <span className="ft2-arrow-icon">&#9650;</span>
        </button>
        <button
          className="ft2-arrow ft2-arrow-down"
          onMouseDown={() => startRepeat(handleDecrement)}
          onMouseUp={stopRepeat}
          onMouseLeave={stopRepeat}
          onTouchStart={() => startRepeat(handleDecrement)}
          onTouchEnd={stopRepeat}
          title={`Decrease ${label}`}
        >
          <span className="ft2-arrow-icon">&#9660;</span>
        </button>
      </div>
    </div>
  );
};
