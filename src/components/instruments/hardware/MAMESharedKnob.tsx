/**
 * Shared hardware knob component for MAME chip hardware UIs.
 * Designed as a realistic-looking rotary knob with drag interaction.
 */

import React, { useCallback } from 'react';

interface HWKnobProps {
  label: string;
  value: number;           // 0..1 normalized (unless min/max provided)
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  color?: string;          // accent color for knob ring/indicator
  size?: 'xs' | 'sm' | 'md' | 'lg';
  formatDisplay?: (v: number) => string;
  disabled?: boolean;
}

const SIZE_MAP = {
  xs: { outer: 28, inner: 22, indicator: 5, fontSize: 7 },
  sm: { outer: 36, inner: 28, indicator: 6, fontSize: 8 },
  md: { outer: 48, inner: 38, indicator: 8, fontSize: 9 },
  lg: { outer: 60, inner: 48, indicator: 10, fontSize: 10 },
};

export const HWKnob: React.FC<HWKnobProps> = ({
  label,
  value,
  min = 0,
  max = 1,
  step,
  onChange,
  color = '#60a5fa',
  size = 'md',
  formatDisplay,
  disabled = false,
}) => {
  const dims = SIZE_MAP[size];

  // Normalize to 0..1 for visual angle
  const norm = max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = -135 + norm * 270;

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const startY = e.clientY;
    const startNorm = norm;

    const onMove = (ev: MouseEvent) => {
      const delta = (startY - ev.clientY) / 150;
      const newNorm = Math.max(0, Math.min(1, startNorm + delta));
      let raw = min + newNorm * (max - min);
      if (step) raw = Math.round(raw / step) * step;
      onChange(raw);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [disabled, norm, min, max, step, onChange]);

  const display = formatDisplay
    ? formatDisplay(value)
    : max <= 1
    ? `${Math.round(value * 100)}%`
    : `${Math.round(value)}`;

  const r = (dims.outer / 2) - 2;
  const cx = dims.outer / 2;
  const startAngle = -225;
  const arcAngle = 270 * norm;

  // SVG arc for progress ring
  const polarToXY = (deg: number, radius: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cx + radius * Math.sin(rad) };
  };

  const arcStart = polarToXY(startAngle, r);
  const arcEnd = polarToXY(startAngle + arcAngle, r);
  const largeArc = arcAngle > 180 ? 1 : 0;

  return (
    <div className="flex flex-col items-center gap-0.5" style={{ width: dims.outer + 16 }}>
      <div
        className={`relative select-none ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-ns-resize'}`}
        style={{ width: dims.outer, height: dims.outer }}
        onMouseDown={handleMouseDown}
        title={`${label}: ${display}`}
      >
        {/* SVG progress arc */}
        <svg
          width={dims.outer}
          height={dims.outer}
          className="absolute inset-0"
          style={{ overflow: 'visible' }}
        >
          {/* Track */}
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={2} strokeDasharray="4 2" strokeDashoffset="0" />
          {/* Arc */}
          {arcAngle > 0 && (
            <path
              d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 ${largeArc} 1 ${arcEnd.x} ${arcEnd.y}`}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={0.85}
            />
          )}
        </svg>

        {/* Knob body */}
        <div
          className="absolute rounded-full shadow-lg"
          style={{
            top: (dims.outer - dims.inner) / 2,
            left: (dims.outer - dims.inner) / 2,
            width: dims.inner,
            height: dims.inner,
            background: 'radial-gradient(circle at 35% 30%, #4a4a4a, #1a1a1a)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        />

        {/* Indicator dot */}
        <div
          className="absolute rounded-full"
          style={{
            width: 4,
            height: 4,
            background: color,
            boxShadow: `0 0 4px ${color}`,
            top: dims.outer / 2 - 2,
            left: dims.outer / 2 - 2,
            transform: `rotate(${angle}deg) translateY(-${dims.inner / 2 - 4}px)`,
            transformOrigin: '50% 50%',
          }}
        />
      </div>

      {/* Value display */}
      <div
        className="font-mono text-center leading-tight"
        style={{ fontSize: dims.fontSize, color: 'rgba(255,255,255,0.5)', minWidth: 28 }}
      >
        {display}
      </div>

      {/* Label */}
      <div
        className="font-semibold text-center uppercase tracking-wider leading-tight"
        style={{
          fontSize: dims.fontSize,
          color: 'rgba(255,255,255,0.7)',
          maxWidth: dims.outer + 12,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
    </div>
  );
};

/** Horizontal LED bar indicator */
export const LEDBar: React.FC<{ value: number; color?: string; label?: string }> = ({
  value,
  color = '#22c55e',
  label,
}) => {
  const segments = 12;
  const lit = Math.round(value * segments);
  return (
    <div className="flex flex-col gap-0.5">
      {label && (
        <div className="text-[7px] font-semibold uppercase tracking-wide text-center" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {label}
        </div>
      )}
      <div className="flex gap-0.5">
        {Array.from({ length: segments }, (_, i) => (
          <div
            key={i}
            className="rounded-sm"
            style={{
              width: 6,
              height: 10,
              background: i < lit ? color : 'rgba(255,255,255,0.06)',
              boxShadow: i < lit ? `0 0 3px ${color}` : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
};

/** Section header label */
export const HWSectionLabel: React.FC<{ label: string; color?: string }> = ({
  label,
  color = 'rgba(255,255,255,0.3)',
}) => (
  <div
    className="text-[7px] font-bold uppercase tracking-widest pb-1 border-b mb-2"
    style={{ color, borderColor: 'rgba(255,255,255,0.1)' }}
  >
    {label}
  </div>
);

/** Integer voice/channel display */
export const HWDisplay: React.FC<{
  value: number;
  label?: string;
  color?: string;
  width?: number;
}> = ({ value, label, color = '#22c55e', width = 56 }) => (
  <div className="flex flex-col items-center gap-0.5">
    <div
      className="font-mono text-center rounded px-2 py-1 font-bold"
      style={{
        width,
        background: '#0a0a0a',
        border: `1px solid ${color}40`,
        color,
        fontSize: 14,
        boxShadow: `inset 0 0 8px rgba(0,0,0,0.8), 0 0 4px ${color}20`,
        textShadow: `0 0 6px ${color}`,
      }}
    >
      {Math.round(value).toString().padStart(2, '0')}
    </div>
    {label && (
      <div className="text-[7px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {label}
      </div>
    )}
  </div>
);
