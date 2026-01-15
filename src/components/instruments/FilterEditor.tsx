/**
 * FilterEditor - Filter type and parameter editor
 */

import React from 'react';
import { Filter, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { FilterConfig, FilterType } from '../../types/instrument';
import { DEFAULT_FILTER } from '../../types/instrument';

interface FilterEditorProps {
  config?: FilterConfig;
  onChange: (config: FilterConfig) => void;
}

const FILTER_TYPES: {
  type: FilterType;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  description: string;
}[] = [
  {
    type: 'lowpass',
    label: 'Low Pass',
    Icon: TrendingDown,
    description: 'Removes high frequencies',
  },
  {
    type: 'highpass',
    label: 'High Pass',
    Icon: TrendingUp,
    description: 'Removes low frequencies',
  },
  {
    type: 'bandpass',
    label: 'Band Pass',
    Icon: Minus,
    description: 'Allows middle frequencies',
  },
  {
    type: 'notch',
    label: 'Notch',
    Icon: Filter,
    description: 'Removes middle frequencies',
  },
];

export const FilterEditor: React.FC<FilterEditorProps> = ({ config, onChange }) => {
  const filter = config || DEFAULT_FILTER;

  const handleFilterTypeChange = (type: FilterType) => {
    onChange({ ...filter, type });
  };

  const handleFrequencyChange = (frequency: number) => {
    onChange({ ...filter, frequency });
  };

  const handleQChange = (Q: number) => {
    onChange({ ...filter, Q });
  };

  // Convert linear slider to logarithmic frequency
  const frequencyToSlider = (freq: number) => {
    return Math.log(freq / 20) / Math.log(1000);
  };

  const sliderToFrequency = (value: number) => {
    return Math.round(20 * Math.pow(1000, value));
  };

  const formatFrequency = (freq: number) => {
    if (freq >= 1000) {
      return `${(freq / 1000).toFixed(1)} kHz`;
    }
    return `${freq} Hz`;
  };

  return (
    <div className="bg-dark-bgSecondary rounded-lg p-4 space-y-4">
      {/* Title */}
      <div className="flex items-center gap-2 text-sm font-bold text-accent-primary">
        <Filter size={16} />
        <span>FILTER</span>
      </div>

      {/* Filter Type Selector */}
      <div className="space-y-3">
        <div className="text-sm font-bold text-accent-primary">TYPE</div>
        <div className="grid grid-cols-2 gap-2">
          {FILTER_TYPES.map((filterType) => {
            const isActive = filter.type === filterType.type;
            return (
              <button
                key={filterType.type}
                onClick={() => handleFilterTypeChange(filterType.type)}
                className={`
                  p-3 border rounded-lg transition-all text-left
                  ${
                    isActive
                      ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                      : 'bg-dark-bgTertiary text-text-primary border-dark-border hover:border-dark-borderLight'
                  }
                `}
              >
                <div className="flex items-center gap-2 mb-1">
                  <filterType.Icon size={18} className={isActive ? '' : 'text-accent-primary'} />
                  <span className="font-mono text-sm font-bold">{filterType.label}</span>
                </div>
                <div className={`text-xs ${isActive ? 'opacity-90' : 'text-text-muted'}`}>
                  {filterType.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cutoff Frequency Slider */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-accent-primary">CUTOFF FREQUENCY</span>
          <span className="text-sm font-mono bg-dark-bgTertiary px-2 py-1 rounded-md border border-dark-border text-accent-primary">
            {formatFrequency(filter.frequency)}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={frequencyToSlider(filter.frequency)}
          onChange={(e) => handleFrequencyChange(sliderToFrequency(parseFloat(e.target.value)))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-text-muted font-mono">
          <span>20 Hz</span>
          <span>1 kHz</span>
          <span>20 kHz</span>
        </div>
      </div>

      {/* Resonance Slider */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-accent-primary">RESONANCE (Q)</span>
          <span className="text-sm font-mono bg-dark-bgTertiary px-2 py-1 rounded-md border border-dark-border text-accent-primary">
            {filter.Q.toFixed(1)}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={filter.Q}
          onChange={(e) => handleQChange(parseFloat(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-text-muted font-mono">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
        {filter.Q > 50 && (
          <div className="text-xs text-accent-warning bg-dark-bgTertiary p-2 rounded-md border border-accent-warning/30 flex items-center gap-2">
            <span>⚠</span> High resonance - sharp filter response
          </div>
        )}
      </div>

      {/* Frequency Response Visualization */}
      <div className="bg-dark-bgTertiary rounded-lg border border-dark-border p-4">
        <svg
          width="100%"
          viewBox="0 0 300 100"
          className="w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid */}
          <line x1="0" y1="50" x2="300" y2="50" stroke="#2a2a2f" strokeWidth="1" strokeDasharray="4 2" />
          <line x1="150" y1="0" x2="150" y2="100" stroke="#2a2a2f" strokeWidth="1" strokeDasharray="4 2" />

          {/* Filter response curve approximation */}
          {filter.type === 'lowpass' && (
            <path
              d="M 0 20 L 100 20 Q 150 20 180 50 Q 200 70 220 85 L 300 95"
              stroke="#00d4aa"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          )}
          {filter.type === 'highpass' && (
            <path
              d="M 0 95 L 80 85 Q 100 70 120 50 Q 150 20 200 20 L 300 20"
              stroke="#00d4aa"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          )}
          {filter.type === 'bandpass' && (
            <path
              d="M 0 90 Q 50 80 100 40 Q 150 20 150 20 Q 150 20 200 40 Q 250 80 300 90"
              stroke="#00d4aa"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          )}
          {filter.type === 'notch' && (
            <path
              d="M 0 20 Q 50 25 100 60 Q 150 95 150 95 Q 150 95 200 60 Q 250 25 300 20"
              stroke="#00d4aa"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          )}

          {/* Cutoff frequency marker */}
          <line
            x1={Math.min(280, (frequencyToSlider(filter.frequency) * 300))}
            y1="0"
            x2={Math.min(280, (frequencyToSlider(filter.frequency) * 300))}
            y2="100"
            stroke="#7c3aed"
            strokeWidth="2"
            strokeDasharray="4 4"
          />

          {/* Labels */}
          <text x="10" y="15" fontSize="10" fill="#606068" fontFamily="monospace">Low</text>
          <text x="260" y="15" fontSize="10" fill="#606068" fontFamily="monospace">High</text>
        </svg>
      </div>

      {/* Info */}
      <div className="text-xs text-text-muted bg-dark-bgTertiary p-3 rounded-md border border-dark-border">
        <span className="font-bold text-accent-primary">Tip:</span> Use cutoff frequency to shape tone, resonance for emphasis. High Q values create sharp peaks.
      </div>
    </div>
  );
};
