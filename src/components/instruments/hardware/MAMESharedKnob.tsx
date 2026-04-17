/**
 * MAMESharedKnob — shared knob and section label components for MAME hardware UIs.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { subscribeToParamLiveValue } from '@/midi/performance/parameterRouter';

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
  paramKey?: string;
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
  paramKey,
}) => {
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);
  const percentRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  const knobSize = size === 'sm' ? 24 : size === 'lg' ? 40 : 32;
  const containerWidth = size === 'sm' ? 48 : size === 'lg' ? 64 : 56;

  // Imperative MIDI path: push text updates directly to DOM on each CC.
  // HWKnob has no rotating indicator — the percent text and display are
  // what changes. Bypasses React re-render for high-rate param flow.
  useEffect(() => {
    if (!paramKey) return;
    return subscribeToParamLiveValue(paramKey, (norm01) => {
      const safe = Math.max(0, Math.min(1, isNaN(norm01) ? 0 : norm01));
      const rawValue = min + safe * (max - min);
      if (percentRef.current) {
        percentRef.current.textContent = String(Math.round(safe * 100));
      }
      if (displayRef.current) {
        displayRef.current.textContent = formatDisplay
          ? formatDisplay(rawValue)
          : rawValue.toFixed(2);
      }
    });
  }, [paramKey, min, max, formatDisplay]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { startY: e.clientY, startVal: value };
    const handlePointerMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      const dy = dragRef.current.startY - ev.clientY;
      const range = max - min;
      let newVal = dragRef.current.startVal + (dy / 150) * range;
      if (step) newVal = Math.round(newVal / step) * step;
      newVal = Math.max(min, Math.min(max, newVal));
      onChange(newVal);
    };
    const handlePointerUp = () => {
      dragRef.current = null;
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  }, [value, min, max, step, onChange]);

  const displayVal = formatDisplay ? formatDisplay(value) : value.toFixed(2);

  return (
    <div
      className="flex flex-col items-center gap-0.5 select-none cursor-ns-resize"
      style={{ width: containerWidth }}
      onPointerDown={handlePointerDown}
    >
      <div
        className="rounded-full border-2 flex items-center justify-center text-[9px]"
        style={{ borderColor: color, color, width: knobSize, height: knobSize }}
      >
        <div ref={percentRef}>{Math.round(((value - min) / (max - min)) * 100)}</div>
      </div>
      <div className="text-[8px] text-text-muted text-center leading-tight truncate w-full">
        {label}
      </div>
      <div ref={displayRef} className="text-[7px] text-text-muted text-center">
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
