/**
 * EffectPanel - Modal/inline editor for effect parameters
 * Auto-generates parameter controls based on effect type
 */

import React from 'react';
import type { EffectConfig } from '@typedefs/instrument';
import { useInstrumentStore } from '@stores/useInstrumentStore';

interface EffectPanelProps {
  instrumentId: number;
  effect: EffectConfig;
  onClose?: () => void;
}

interface EffectParameter {
  name: string;
  key: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultValue: number;
}

const EFFECT_PARAMETERS: Record<string, EffectParameter[]> = {
  Distortion: [
    { name: 'Drive', key: 'drive', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.4 },
    {
      name: 'Oversample',
      key: 'oversample',
      min: 0,
      max: 2,
      step: 1,
      unit: 'x',
      defaultValue: 0,
    },
  ],
  Reverb: [
    { name: 'Decay', key: 'decay', min: 0.1, max: 10, step: 0.1, unit: 's', defaultValue: 1.5 },
    {
      name: 'Pre-Delay',
      key: 'preDelay',
      min: 0,
      max: 0.5,
      step: 0.01,
      unit: 's',
      defaultValue: 0.01,
    },
  ],
  Delay: [
    { name: 'Time', key: 'time', min: 0, max: 1, step: 0.01, unit: 's', defaultValue: 0.25 },
    { name: 'Feedback', key: 'feedback', min: 0, max: 0.95, step: 0.01, unit: '', defaultValue: 0.5 },
  ],
  FeedbackDelay: [
    { name: 'Time', key: 'time', min: 0, max: 1, step: 0.01, unit: 's', defaultValue: 0.25 },
    { name: 'Feedback', key: 'feedback', min: 0, max: 0.95, step: 0.01, unit: '', defaultValue: 0.5 },
  ],
  PingPongDelay: [
    { name: 'Time', key: 'time', min: 0, max: 1, step: 0.01, unit: 's', defaultValue: 0.25 },
    { name: 'Feedback', key: 'feedback', min: 0, max: 0.95, step: 0.01, unit: '', defaultValue: 0.5 },
  ],
  Chorus: [
    { name: 'Frequency', key: 'frequency', min: 0, max: 20, step: 0.1, unit: 'Hz', defaultValue: 1.5 },
    { name: 'Depth', key: 'depth', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.7 },
    {
      name: 'Delay Time',
      key: 'delayTime',
      min: 2,
      max: 20,
      step: 0.1,
      unit: 'ms',
      defaultValue: 3.5,
    },
  ],
  Phaser: [
    { name: 'Frequency', key: 'frequency', min: 0, max: 20, step: 0.1, unit: 'Hz', defaultValue: 0.5 },
    { name: 'Octaves', key: 'octaves', min: 0, max: 8, step: 0.1, unit: '', defaultValue: 3 },
    {
      name: 'Base Freq',
      key: 'baseFrequency',
      min: 50,
      max: 1000,
      step: 10,
      unit: 'Hz',
      defaultValue: 350,
    },
  ],
  Tremolo: [
    { name: 'Frequency', key: 'frequency', min: 0, max: 100, step: 0.1, unit: 'Hz', defaultValue: 10 },
    { name: 'Depth', key: 'depth', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.5 },
  ],
  Vibrato: [
    { name: 'Frequency', key: 'frequency', min: 0, max: 100, step: 0.1, unit: 'Hz', defaultValue: 5 },
    { name: 'Depth', key: 'depth', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.1 },
  ],
  AutoFilter: [
    { name: 'Frequency', key: 'frequency', min: 0, max: 20, step: 0.1, unit: 'Hz', defaultValue: 1 },
    {
      name: 'Base Freq',
      key: 'baseFrequency',
      min: 20,
      max: 2000,
      step: 10,
      unit: 'Hz',
      defaultValue: 200,
    },
    { name: 'Octaves', key: 'octaves', min: 0, max: 8, step: 0.1, unit: '', defaultValue: 2.6 },
  ],
  AutoPanner: [
    { name: 'Frequency', key: 'frequency', min: 0, max: 20, step: 0.1, unit: 'Hz', defaultValue: 1 },
    { name: 'Depth', key: 'depth', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 1 },
  ],
  AutoWah: [
    {
      name: 'Base Freq',
      key: 'baseFrequency',
      min: 50,
      max: 500,
      step: 10,
      unit: 'Hz',
      defaultValue: 100,
    },
    { name: 'Octaves', key: 'octaves', min: 0, max: 8, step: 0.1, unit: '', defaultValue: 6 },
    { name: 'Sensitivity', key: 'sensitivity', min: -40, max: 0, step: 1, unit: 'dB', defaultValue: 0 },
    { name: 'Q', key: 'Q', min: 0, max: 10, step: 0.1, unit: '', defaultValue: 2 },
  ],
  BitCrusher: [
    { name: 'Bits', key: 'bits', min: 1, max: 16, step: 1, unit: '', defaultValue: 4 },
  ],
  Chebyshev: [
    { name: 'Order', key: 'order', min: 1, max: 100, step: 1, unit: '', defaultValue: 50 },
  ],
  FrequencyShifter: [
    {
      name: 'Frequency',
      key: 'frequency',
      min: -1000,
      max: 1000,
      step: 1,
      unit: 'Hz',
      defaultValue: 0,
    },
  ],
  PitchShift: [
    { name: 'Pitch', key: 'pitch', min: -12, max: 12, step: 1, unit: 'st', defaultValue: 0 },
    {
      name: 'Window Size',
      key: 'windowSize',
      min: 0.01,
      max: 0.5,
      step: 0.01,
      unit: 's',
      defaultValue: 0.1,
    },
    {
      name: 'Delay Time',
      key: 'delayTime',
      min: 0,
      max: 0.1,
      step: 0.001,
      unit: 's',
      defaultValue: 0,
    },
    { name: 'Feedback', key: 'feedback', min: 0, max: 0.95, step: 0.01, unit: '', defaultValue: 0 },
  ],
  Compressor: [
    {
      name: 'Threshold',
      key: 'threshold',
      min: -100,
      max: 0,
      step: 1,
      unit: 'dB',
      defaultValue: -24,
    },
    { name: 'Ratio', key: 'ratio', min: 1, max: 20, step: 0.1, unit: ':1', defaultValue: 12 },
    { name: 'Attack', key: 'attack', min: 0, max: 1, step: 0.001, unit: 's', defaultValue: 0.003 },
    { name: 'Release', key: 'release', min: 0, max: 1, step: 0.01, unit: 's', defaultValue: 0.25 },
  ],
  EQ3: [
    { name: 'Low', key: 'low', min: -20, max: 20, step: 0.5, unit: 'dB', defaultValue: 0 },
    { name: 'Mid', key: 'mid', min: -20, max: 20, step: 0.5, unit: 'dB', defaultValue: 0 },
    { name: 'High', key: 'high', min: -20, max: 20, step: 0.5, unit: 'dB', defaultValue: 0 },
    {
      name: 'Low Freq',
      key: 'lowFrequency',
      min: 20,
      max: 1000,
      step: 10,
      unit: 'Hz',
      defaultValue: 400,
    },
    {
      name: 'High Freq',
      key: 'highFrequency',
      min: 1000,
      max: 10000,
      step: 100,
      unit: 'Hz',
      defaultValue: 2500,
    },
  ],
  Filter: [
    {
      name: 'Frequency',
      key: 'frequency',
      min: 20,
      max: 20000,
      step: 10,
      unit: 'Hz',
      defaultValue: 350,
    },
    { name: 'Q', key: 'Q', min: 0.001, max: 100, step: 0.1, unit: '', defaultValue: 1 },
    { name: 'Gain', key: 'gain', min: -40, max: 40, step: 1, unit: 'dB', defaultValue: 0 },
  ],
  JCReverb: [
    { name: 'Room Size', key: 'roomSize', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.5 },
  ],
  StereoWidener: [
    { name: 'Width', key: 'width', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 0.5 },
  ],
};

export const EffectPanel: React.FC<EffectPanelProps> = ({ instrumentId, effect, onClose }) => {
  const { updateEffect } = useInstrumentStore();

  const parameters = EFFECT_PARAMETERS[effect.type] || [];

  const handleParameterChange = (key: string, value: number) => {
    updateEffect(instrumentId, effect.id, {
      parameters: {
        ...effect.parameters,
        [key]: value,
      },
    });
  };

  const getParameterValue = (param: EffectParameter): number => {
    const value = effect.parameters[param.key] ?? param.defaultValue;
    // Handle case where value might be a string (e.g., filter type)
    return typeof value === 'number' ? value : param.defaultValue;
  };

  const formatValue = (value: number, param: EffectParameter): string => {
    // Special formatting for oversample
    if (param.key === 'oversample') {
      const oversampleModes = ['none', '2x', '4x'];
      return oversampleModes[Math.round(value)] || 'none';
    }

    // Format number
    let formatted = value.toFixed(param.step < 0.1 ? 2 : param.step < 1 ? 1 : 0);

    // Add unit
    return `${formatted}${param.unit}`;
  };

  return (
    <div className="p-4 bg-ft2-bg border border-ft2-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-ft2-border">
        <div className="flex items-center gap-2">
          <div className="text-ft2-highlight text-sm font-bold">{effect.type}</div>
          <div
            className={`
            px-2 py-0.5 text-xs font-bold border
            ${
              effect.enabled
                ? 'border-green-500 text-green-300'
                : 'border-red-500 text-red-300'
            }
          `}
          >
            {effect.enabled ? 'ACTIVE' : 'BYPASSED'}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="px-2 py-1 text-xs border border-ft2-border bg-ft2-header
                     hover:border-ft2-highlight hover:text-ft2-highlight transition-colors"
          >
            CLOSE
          </button>
        )}
      </div>

      {/* Parameters */}
      {parameters.length === 0 ? (
        <div className="p-4 text-center text-ft2-textDim text-sm">
          No parameters available for this effect.
        </div>
      ) : (
        <div className="space-y-4">
          {parameters.map((param) => {
            const value = getParameterValue(param);
            return (
              <div key={param.key} className="space-y-1">
                {/* Parameter Label */}
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-ft2-text">{param.name}</label>
                  <span className="text-xs text-ft2-highlight font-mono">
                    {formatValue(value, param)}
                  </span>
                </div>

                {/* Slider */}
                <input
                  type="range"
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  value={value}
                  onChange={(e) => handleParameterChange(param.key, Number(e.target.value))}
                  className="w-full h-2 bg-ft2-header rounded-lg appearance-none cursor-pointer
                           border border-ft2-border
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                           [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:bg-ft2-highlight
                           [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-ft2-border
                           [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
                           [&::-moz-range-thumb]:rounded-sm [&::-moz-range-thumb]:bg-ft2-highlight
                           [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-ft2-border"
                />

                {/* Range indicators */}
                <div className="flex items-center justify-between text-xs text-ft2-textDim font-mono">
                  <span>{formatValue(param.min, param)}</span>
                  <span>{formatValue(param.max, param)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Wet/Dry Mix - Always visible */}
      <div className="mt-6 pt-4 border-t border-ft2-border">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-ft2-highlight">WET / DRY MIX</label>
            <span className="text-xs text-ft2-highlight font-mono">{effect.wet}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={effect.wet}
            onChange={(e) =>
              updateEffect(instrumentId, effect.id, { wet: Number(e.target.value) })
            }
            className="w-full h-2 bg-ft2-header rounded-lg appearance-none cursor-pointer
                     border border-ft2-border
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                     [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:bg-ft2-cursor
                     [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-ft2-highlight
                     [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
                     [&::-moz-range-thumb]:rounded-sm [&::-moz-range-thumb]:bg-ft2-cursor
                     [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-ft2-highlight"
          />
          <div className="flex items-center justify-between text-xs text-ft2-textDim font-mono">
            <span>0% (DRY)</span>
            <span>100% (WET)</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-4 p-2 bg-ft2-header border border-ft2-border text-xs text-ft2-textDim">
        Adjust parameters in real-time. Changes are applied immediately to the audio signal.
      </div>
    </div>
  );
};
