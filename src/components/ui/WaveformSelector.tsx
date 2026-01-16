/**
 * WaveformSelector - Visual waveform type picker with waveform previews
 */

import React from 'react';

type WaveformType = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'pulse' | 'pwm';

interface WaveformSelectorProps {
  value: WaveformType;
  onChange: (waveform: WaveformType) => void;
  availableWaveforms?: WaveformType[];
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

// Waveform path generators
const generateWaveformPath = (type: WaveformType, width: number, height: number): string => {
  const midY = height / 2;
  const amplitude = height * 0.35;
  const padding = 4;
  const drawWidth = width - padding * 2;

  const points: string[] = [];
  const numPoints = 100;

  for (let i = 0; i <= numPoints; i++) {
    const x = padding + (i / numPoints) * drawWidth;
    const phase = (i / numPoints) * Math.PI * 4; // Two full cycles
    let y: number;

    switch (type) {
      case 'sine':
        y = midY - Math.sin(phase) * amplitude;
        break;
      case 'square':
        y = midY - (Math.sin(phase) >= 0 ? 1 : -1) * amplitude;
        break;
      case 'sawtooth':
        // Sawtooth: linear ramp from -1 to 1
        const sawPhase = ((phase / Math.PI) % 2) - 1;
        y = midY - sawPhase * amplitude;
        break;
      case 'triangle':
        // Triangle: absolute value of sawtooth
        const triPhase = ((phase / Math.PI) % 2);
        const triVal = triPhase < 1 ? triPhase * 2 - 1 : 3 - triPhase * 2;
        y = midY - triVal * amplitude;
        break;
      case 'pulse':
        // Narrow pulse wave (25% duty cycle)
        const pulsePhase = (phase / Math.PI) % 2;
        y = midY - (pulsePhase < 0.5 ? 1 : -1) * amplitude;
        break;
      case 'pwm':
        // PWM - varying pulse width
        const pwmDuty = 0.25 + ((i / numPoints) * 0.5);
        const pwmPhase = (phase / Math.PI) % 2;
        y = midY - (pwmPhase < pwmDuty ? 1 : -1) * amplitude;
        break;
      default:
        y = midY;
    }

    points.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }

  return points.join(' ');
};

const WAVEFORM_LABELS: Record<WaveformType, string> = {
  sine: 'Sine',
  square: 'Square',
  sawtooth: 'Saw',
  triangle: 'Tri',
  pulse: 'Pulse',
  pwm: 'PWM',
};

export const WaveformSelector: React.FC<WaveformSelectorProps> = ({
  value,
  onChange,
  availableWaveforms = ['sine', 'square', 'sawtooth', 'triangle'],
  size = 'md',
  color = '#00ff88',
}) => {
  const sizes = {
    sm: { width: 48, height: 28, fontSize: 8 },
    md: { width: 64, height: 36, fontSize: 9 },
    lg: { width: 80, height: 44, fontSize: 10 },
  };
  const s = sizes[size];

  return (
    <div className="flex gap-1 p-1 bg-[#1a1a1a] rounded-lg">
      {availableWaveforms.map((waveform) => {
        const isSelected = value === waveform;
        const path = generateWaveformPath(waveform, s.width, s.height);

        return (
          <button
            key={waveform}
            onClick={() => onChange(waveform)}
            className={`
              relative rounded transition-all
              ${isSelected
                ? 'ring-2 ring-offset-1 ring-offset-[#1a1a1a]'
                : 'hover:bg-gray-800'
              }
            `}
            style={isSelected ? {
              '--tw-ring-color': color,
            } as React.CSSProperties : undefined}
            title={WAVEFORM_LABELS[waveform]}
          >
            <svg
              width={s.width}
              height={s.height}
              className="rounded"
              style={{ backgroundColor: isSelected ? `${color}15` : '#252525' }}
            >
              {/* Grid lines */}
              <line
                x1={0}
                y1={s.height / 2}
                x2={s.width}
                y2={s.height / 2}
                stroke="#333"
                strokeWidth="1"
                strokeDasharray="2,2"
              />

              {/* Waveform */}
              <path
                d={path}
                fill="none"
                stroke={isSelected ? color : '#666'}
                strokeWidth={isSelected ? 2 : 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={isSelected ? { filter: `drop-shadow(0 0 3px ${color})` } : undefined}
              />
            </svg>

            {/* Label */}
            <div
              className={`
                absolute inset-x-0 bottom-0 text-center font-mono font-bold
                ${isSelected ? 'text-white' : 'text-gray-500'}
              `}
              style={{ fontSize: s.fontSize }}
            >
              {WAVEFORM_LABELS[waveform]}
            </div>
          </button>
        );
      })}
    </div>
  );
};
