/**
 * FT2NumericInput - FastTracker II style numeric input with arrows
 * Supports hold-to-repeat and throttling for smooth BPM changes
 * Optional presets menu on right-click
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';

interface PresetOption {
  label: string;
  value: number;
}

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
  /** Optional preset values for right-click menu */
  presets?: PresetOption[];
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
  presets,
}) => {
  // Refs for hold-to-repeat functionality
  const repeatIntervalRef = useRef<number | null>(null);
  const repeatTimeoutRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  const lastChangeRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // State for presets menu
  const [showPresets, setShowPresets] = useState(false);
  const [presetMenuPos, setPresetMenuPos] = useState({ x: 0, y: 0 });

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

  // Close menu when clicking outside
  useEffect(() => {
    if (!showPresets) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowPresets(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPresets]);

  // Handle right-click for presets menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!presets || presets.length === 0) return;
    e.preventDefault();
    setPresetMenuPos({ x: e.clientX, y: e.clientY });
    setShowPresets(true);
  }, [presets]);

  // Handle preset selection
  const handlePresetSelect = useCallback((presetValue: number) => {
    onChange(presetValue);
    setShowPresets(false);
  }, [onChange]);

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
    <div
      ref={containerRef}
      className="ft2-numeric-group"
      onContextMenu={handleContextMenu}
      title={presets ? `Right-click for presets` : undefined}
    >
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

      {/* Presets dropdown menu */}
      {showPresets && presets && (
        <div
          className="ft2-presets-menu"
          style={{
            position: 'fixed',
            left: presetMenuPos.x,
            top: presetMenuPos.y,
            zIndex: 1000,
            backgroundColor: '#1a1a1d',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '4px 0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            minWidth: '100px',
          }}
        >
          {presets.map((preset) => (
            <button
              key={preset.value}
              onClick={() => handlePresetSelect(preset.value)}
              className="ft2-preset-item"
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 12px',
                textAlign: 'left',
                background: value === preset.value ? '#333' : 'transparent',
                border: 'none',
                color: value === preset.value ? '#ef4444' : '#e0e0e0',
                cursor: 'pointer',
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#2a2a2d')}
              onMouseLeave={(e) => (e.currentTarget.style.background = value === preset.value ? '#333' : 'transparent')}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
