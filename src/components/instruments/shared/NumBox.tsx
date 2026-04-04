/**
 * NumBox — Numeric input with label, optional hex display.
 * Replaces inline copies in GTUltraControls and FredControls.
 */

import React from 'react';

interface NumBoxProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onValueChange: (v: number) => void;
  /** Show hex value after input */
  hex?: boolean;
  /** Input width (default '48px') */
  width?: string;
  /** Input text color */
  color?: string;
  /** Input border color */
  borderColor?: string;
  /** Input background (default '#0a0a0a') */
  background?: string;
}

export const NumBox: React.FC<NumBoxProps> = ({
  label, value, min, max, onValueChange, hex, width = '48px',
  color = 'var(--color-text-secondary)', borderColor = 'var(--color-border)',
  background = '#0a0a0a',
}) => (
  <div className="flex items-center gap-1.5">
    <span className="text-[10px] text-text-secondary w-20 text-right whitespace-nowrap">{label}</span>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const v = parseInt(e.target.value);
        if (!isNaN(v)) onValueChange(Math.max(min, Math.min(max, v)));
      }}
      className="text-xs font-mono text-center border rounded px-1 py-0.5"
      style={{ width, background, borderColor, color }}
    />
    {hex && (
      <span className="text-[9px] font-mono text-text-secondary">
        ${value.toString(16).toUpperCase().padStart(2, '0')}
      </span>
    )}
  </div>
);
