/**
 * EQSlider — Vertical fader for EQ band gain control.
 * Styled for EQ editors: thin track, colored thumb, dB label on hover.
 */

import React, { useCallback, useRef, useState } from 'react';

interface EQSliderProps {
  value: number;       // Current dB value
  min: number;         // Min dB (e.g., -12)
  max: number;         // Max dB (e.g., +12)
  onChange: (v: number) => void;
  label?: string;      // Frequency label below
  color?: string;      // Accent color
  height?: number;     // Slider height in px (default 100)
  width?: number;      // Slider width in px (default 28)
}

export const EQSlider: React.FC<EQSliderProps> = ({
  value, min, max, onChange, label, color = '#3b82f6', height = 100, width = 28,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const valueToY = useCallback((v: number): number => {
    const ratio = (v - min) / (max - min);
    return height - ratio * height;
  }, [min, max, height]);

  const yToValue = useCallback((y: number): number => {
    const ratio = 1 - Math.max(0, Math.min(1, y / height));
    const raw = min + ratio * (max - min);
    // Snap to 0 when close
    return Math.abs(raw) < 0.5 ? 0 : Math.round(raw * 10) / 10;
  }, [min, max, height]);

  const handleMove = useCallback((clientY: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    onChangeRef.current(yToValue(y));
  }, [yToValue]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handleMove(e.clientY);
  }, [handleMove]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    handleMove(e.clientY);
  }, [dragging, handleMove]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  // Double-click to reset to 0
  const handleDoubleClick = useCallback(() => {
    onChangeRef.current(0);
  }, []);

  // Right-click to reset to 0
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onChangeRef.current(0);
  }, []);

  const thumbY = valueToY(value);
  const zeroY = valueToY(0);
  const isPositive = value > 0;

  // Fill from zero line to thumb
  const fillTop = isPositive ? thumbY : zeroY;
  const fillHeight = Math.abs(thumbY - zeroY);

  return (
    <div
      className="flex flex-col items-center gap-1"
      style={{ width }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* dB value tooltip */}
      <div className="text-[9px] font-mono leading-none h-3" style={{ color: hovering || dragging ? color : 'transparent' }}>
        {value > 0 ? '+' : ''}{value.toFixed(1)}
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative cursor-pointer rounded-sm"
        style={{ width: 6, height, background: 'rgba(255,255,255,0.08)' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Zero line */}
        <div
          className="absolute left-0 right-0"
          style={{ top: zeroY, height: 1, background: 'rgba(255,255,255,0.2)' }}
        />

        {/* Fill bar */}
        {fillHeight > 0 && (
          <div
            className="absolute left-0 right-0 rounded-sm"
            style={{
              top: fillTop,
              height: fillHeight,
              background: color,
              opacity: 0.4,
            }}
          />
        )}

        {/* Thumb */}
        <div
          className="absolute rounded-sm"
          style={{
            left: -3,
            top: thumbY - 3,
            width: 12,
            height: 6,
            background: color,
            boxShadow: dragging ? `0 0 6px ${color}` : 'none',
            transition: dragging ? 'none' : 'box-shadow 0.15s',
          }}
        />
      </div>

      {/* Frequency label */}
      {label && (
        <div className="text-[8px] text-text-muted leading-none text-center whitespace-nowrap">
          {label}
        </div>
      )}
    </div>
  );
};
