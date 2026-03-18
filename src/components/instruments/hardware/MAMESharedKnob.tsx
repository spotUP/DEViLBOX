/**
 * MAMESharedKnob — shared knob and section label components for MAME hardware UIs.
 */

import React, { useCallback, useRef } from 'react';

interface HWKnobProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  formatDisplay?: (v: number) => string;
  onChange: (value: number) => void;
}

/**
 * Hardware-style knob control for chip synth parameters.
 * Renders as a styled range input with label and value display.
 */
export const HWKnob: React.FC<HWKnobProps> = ({
  label,
  value,
  min = 0,
  max = 1,
  step,
  size = 'md',
  color = '#88ccff',
  formatDisplay,
  onChange,
}) => {
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);
  const knobSize = size === 'sm' ? 24 : size === 'lg' ? 40 : 32;
  const containerWidth = size === 'sm' ? 48 : size === 'lg' ? 64 : 56;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startVal: value };
    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dy = dragRef.current.startY - ev.clientY;
      const range = max - min;
      let newVal = dragRef.current.startVal + (dy / 150) * range;
      if (step) newVal = Math.round(newVal / step) * step;
      newVal = Math.max(min, Math.min(max, newVal));
      onChange(newVal);
    };
    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [value, min, max, step, onChange]);

  const displayVal = formatDisplay ? formatDisplay(value) : value.toFixed(2);

  return (
    <div
      className="flex flex-col items-center gap-0.5 select-none cursor-ns-resize"
      style={{ width: containerWidth }}
      onMouseDown={handleMouseDown}
    >
      <div
        className="rounded-full border-2 flex items-center justify-center text-[9px]"
        style={{ borderColor: color, color, width: knobSize, height: knobSize }}
      >
        {Math.round(((value - min) / (max - min)) * 100)}
      </div>
      <div className="text-[8px] text-gray-400 text-center leading-tight truncate w-full">
        {label}
      </div>
      <div className="text-[7px] text-gray-500 text-center">
        {displayVal}
      </div>
    </div>
  );
};

interface HWSectionLabelProps {
  label: string;
  color?: string;
}

/**
 * Section label for grouping hardware knobs.
 */
export const HWSectionLabel: React.FC<HWSectionLabelProps> = ({ label, color = '#88ccff80' }) => {
  return (
    <div
      className="text-[9px] font-bold uppercase tracking-wider mb-1 px-1"
      style={{ color }}
    >
      {label}
    </div>
  );
};
