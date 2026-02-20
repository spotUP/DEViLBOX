/**
 * PixiTextInput — Hybrid text input: hidden DOM <input> positioned at PixiJS screen coords
 * with a PixiJS visual proxy (rounded rect + BitmapText).
 *
 * The DOM input handles actual text editing (IME, clipboard, selection, accessibility).
 * The PixiJS proxy handles visual rendering.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApplication } from '@pixi/react';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme, type PixiColor } from '../theme';

interface PixiTextInputProps {
  /** Current text value */
  value: string;
  /** Called when text changes */
  onChange: (value: string) => void;
  /** Called on Enter key */
  onSubmit?: (value: string) => void;
  /** Called on Escape key */
  onCancel?: () => void;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Screen position X (from PixiJS global coords) */
  screenX: number;
  /** Screen position Y (from PixiJS global coords) */
  screenY: number;
  /** Whether the input is visible/focused */
  isActive: boolean;
  /** Numeric-only mode */
  numeric?: boolean;
  /** Min value (numeric mode) */
  min?: number;
  /** Max value (numeric mode) */
  max?: number;
}

/**
 * Renders a hidden DOM <input> positioned exactly over the PixiJS proxy location.
 * Mount this as a React portal outside the PixiJS canvas.
 */
export const PixiTextInput: React.FC<PixiTextInputProps> = ({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  width = 80,
  height = 24,
  screenX,
  screenY,
  isActive,
  numeric,
  min,
  max,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const theme = usePixiTheme();

  // Auto-focus when activated
  useEffect(() => {
    if (isActive && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isActive]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit?.(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel?.();
    }
    // Stop propagation so global keyboard handlers don't fire
    e.stopPropagation();
  }, [value, onSubmit, onCancel]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let newVal = e.target.value;
    if (numeric) {
      const num = parseFloat(newVal);
      if (!isNaN(num)) {
        const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, num));
        newVal = String(clamped);
      }
    }
    onChange(newVal);
  }, [onChange, numeric, min, max]);

  if (!isActive) return null;

  // Portal to document.body so the input sits above the PixiJS canvas
  return createPortal(
    <input
      ref={inputRef}
      type={numeric ? 'number' : 'text'}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      min={min}
      max={max}
      style={{
        position: 'fixed',
        left: screenX,
        top: screenY,
        width,
        height,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
        background: `#${theme.bg.color.toString(16).padStart(6, '0')}`,
        color: `#${theme.accent.color.toString(16).padStart(6, '0')}`,
        border: `1px solid #${theme.border.color.toString(16).padStart(6, '0')}`,
        borderRadius: 4,
        padding: '2px 6px',
        outline: 'none',
        zIndex: 10000,
        boxSizing: 'border-box',
      }}
    />,
    document.body,
  );
};
