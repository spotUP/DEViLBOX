/**
 * GmCombo — Dropdown selector for gearmulator hardware skins.
 * Maps parameter values to display text via value lists.
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';

export interface GmComboProps {
  /** Current value (raw param value, min..max) */
  value: number;
  /** Min value */
  min: number;
  /** Max value */
  max: number;
  /** Display text for each value (index = value - min) */
  valueTexts?: string[];
  /** Called when selection changes */
  onChange: (value: number) => void;
  /** CSS position style */
  style?: React.CSSProperties;
  /** Parameter name (for tooltip) */
  paramName?: string;
  className?: string;
}

export const GmCombo: React.FC<GmComboProps> = ({
  value, min, max, valueTexts, onChange, style, paramName, className
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const displayText = valueTexts
    ? (valueTexts[value - min] ?? `${value}`)
    : `${value}`;

  const handleClick = useCallback(() => setOpen(o => !o), []);

  const handleSelect = useCallback((v: number) => {
    onChange(v);
    setOpen(false);
  }, [onChange]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Scroll wheel to cycle values
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    const newVal = Math.max(min, Math.min(max, value + dir));
    onChange(newVal);
  }, [value, min, max, onChange]);

  return (
    <div
      ref={ref}
      className={`gm-combo ${className ?? ''}`}
      style={{
        position: 'relative',
        cursor: 'pointer',
        overflow: 'hidden',
        ...style,
      }}
      onClick={handleClick}
      onWheel={handleWheel}
      title={paramName}
    >
      <span className="gm-combo-text">{displayText}</span>
      {open && (
        <div className="gm-combo-dropdown" style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          zIndex: 1000,
          background: 'var(--color-bg-tertiary)',
          border: '1px solid #555',
          maxHeight: 200,
          overflowY: 'auto',
          minWidth: '100%',
        }}>
          {Array.from({ length: max - min + 1 }, (_, i) => {
            const v = min + i;
            const text = valueTexts ? (valueTexts[i] ?? `${v}`) : `${v}`;
            return (
              <div
                key={v}
                className={`gm-combo-option ${v === value ? 'selected' : ''}`}
                style={{
                  padding: '2px 6px',
                  background: v === value ? '#335' : 'transparent',
                  whiteSpace: 'nowrap',
                }}
                onClick={(e) => { e.stopPropagation(); handleSelect(v); }}
              >
                {text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
