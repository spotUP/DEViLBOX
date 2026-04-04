/**
 * DrawbarSlider — Vertical organ drawbar with pointer capture.
 * Replaces inline copies in SetBfreeControls and TonewheelOrganControls.
 */

import React, { useRef, useCallback } from 'react';

interface DrawbarSliderProps {
  label: string;
  value: number;
  color: string;
  onChange: (value: number) => void;
  /** Color for the value display text (default: inherits color) */
  accentColor?: string;
}

export const DrawbarSlider: React.FC<DrawbarSliderProps> = React.memo(({
  label, value, color, onChange, accentColor,
}) => {
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const updateValue = useCallback((clientY: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const pct = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    onChange(Math.round(pct * 8));
  }, [onChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateValue(e.clientY);
  }, [updateValue]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    updateValue(e.clientY);
  }, [updateValue]);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const fillPct = (value / 8) * 100;

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div className="text-xs font-bold font-mono w-5 text-center"
        style={{ color: accentColor ?? color }}>
        {Math.round(value)}
      </div>
      <div
        ref={sliderRef}
        className="relative w-6 h-28 rounded bg-dark-bgSecondary border border-dark-borderLight cursor-pointer"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div
          className="absolute bottom-0 left-0 right-0 rounded-b transition-all duration-75"
          style={{ height: `${fillPct}%`, backgroundColor: color, opacity: 0.8 }}
        />
        {[1, 2, 3, 4, 5, 6, 7].map(tick => (
          <div
            key={tick}
            className="absolute left-0 right-0 h-px bg-dark-bgActive pointer-events-none"
            style={{ bottom: `${(tick / 8) * 100}%` }}
          />
        ))}
        <div
          className="absolute left-0 right-0 h-2 rounded transition-all duration-75"
          style={{ bottom: `calc(${fillPct}% - 4px)`, backgroundColor: color, boxShadow: `0 0 6px ${color}88` }}
        />
      </div>
      <div className="text-[10px] text-text-muted font-mono whitespace-nowrap">{label}</div>
    </div>
  );
});
DrawbarSlider.displayName = 'DrawbarSlider';
