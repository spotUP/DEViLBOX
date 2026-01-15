/**
 * EffectParameterEditor - Modal/panel for editing effect parameters
 * Works with both master effects and channel effects
 */

import React from 'react';
import type { EffectConfig } from '../../types/instrument';
import { X, Volume2 } from 'lucide-react';

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
  ],
  Reverb: [
    { name: 'Decay', key: 'decay', min: 0.1, max: 10, step: 0.1, unit: 's', defaultValue: 1.5 },
    { name: 'Pre-Delay', key: 'preDelay', min: 0, max: 0.5, step: 0.01, unit: 's', defaultValue: 0.01 },
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
    { name: 'Delay Time', key: 'delayTime', min: 2, max: 20, step: 0.1, unit: 'ms', defaultValue: 3.5 },
  ],
  Phaser: [
    { name: 'Frequency', key: 'frequency', min: 0, max: 20, step: 0.1, unit: 'Hz', defaultValue: 0.5 },
    { name: 'Octaves', key: 'octaves', min: 0, max: 8, step: 0.1, unit: '', defaultValue: 3 },
    { name: 'Base Freq', key: 'baseFrequency', min: 50, max: 1000, step: 10, unit: 'Hz', defaultValue: 350 },
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
    { name: 'Base Freq', key: 'baseFrequency', min: 20, max: 2000, step: 10, unit: 'Hz', defaultValue: 200 },
    { name: 'Octaves', key: 'octaves', min: 0, max: 8, step: 0.1, unit: '', defaultValue: 2.6 },
  ],
  AutoPanner: [
    { name: 'Frequency', key: 'frequency', min: 0, max: 20, step: 0.1, unit: 'Hz', defaultValue: 1 },
    { name: 'Depth', key: 'depth', min: 0, max: 1, step: 0.01, unit: '', defaultValue: 1 },
  ],
  AutoWah: [
    { name: 'Base Freq', key: 'baseFrequency', min: 50, max: 500, step: 10, unit: 'Hz', defaultValue: 100 },
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
    { name: 'Frequency', key: 'frequency', min: -1000, max: 1000, step: 1, unit: 'Hz', defaultValue: 0 },
  ],
  PitchShift: [
    { name: 'Pitch', key: 'pitch', min: -12, max: 12, step: 1, unit: 'st', defaultValue: 0 },
    { name: 'Window Size', key: 'windowSize', min: 0.01, max: 0.5, step: 0.01, unit: 's', defaultValue: 0.1 },
    { name: 'Feedback', key: 'feedback', min: 0, max: 0.95, step: 0.01, unit: '', defaultValue: 0 },
  ],
  Compressor: [
    { name: 'Threshold', key: 'threshold', min: -100, max: 0, step: 1, unit: 'dB', defaultValue: -24 },
    { name: 'Ratio', key: 'ratio', min: 1, max: 20, step: 0.1, unit: ':1', defaultValue: 12 },
    { name: 'Attack', key: 'attack', min: 0, max: 1, step: 0.001, unit: 's', defaultValue: 0.003 },
    { name: 'Release', key: 'release', min: 0, max: 1, step: 0.01, unit: 's', defaultValue: 0.25 },
  ],
  EQ3: [
    { name: 'Low', key: 'low', min: -20, max: 20, step: 0.5, unit: 'dB', defaultValue: 0 },
    { name: 'Mid', key: 'mid', min: -20, max: 20, step: 0.5, unit: 'dB', defaultValue: 0 },
    { name: 'High', key: 'high', min: -20, max: 20, step: 0.5, unit: 'dB', defaultValue: 0 },
    { name: 'Low Freq', key: 'lowFrequency', min: 20, max: 1000, step: 10, unit: 'Hz', defaultValue: 400 },
    { name: 'High Freq', key: 'highFrequency', min: 1000, max: 10000, step: 100, unit: 'Hz', defaultValue: 2500 },
  ],
  Filter: [
    { name: 'Frequency', key: 'frequency', min: 20, max: 20000, step: 10, unit: 'Hz', defaultValue: 350 },
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

interface EffectParameterEditorProps {
  effect: EffectConfig;
  onUpdateParameter: (key: string, value: number) => void;
  onUpdateWet: (wet: number) => void;
  onClose?: () => void;
}

export const EffectParameterEditor: React.FC<EffectParameterEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
  onClose,
}) => {
  const parameters = EFFECT_PARAMETERS[effect.type] || [];

  const getParameterValue = (param: EffectParameter): number => {
    return effect.parameters[param.key] ?? param.defaultValue;
  };

  const formatValue = (value: number, param: EffectParameter): string => {
    let formatted = value.toFixed(param.step < 0.1 ? 2 : param.step < 1 ? 1 : 0);
    return `${formatted}${param.unit}`;
  };

  return (
    <div className="bg-dark-bg border border-dark-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-dark-bgSecondary border-b border-dark-border">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-accent-primary">{effect.type}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${
            effect.enabled
              ? 'bg-accent-success/10 text-accent-success'
              : 'bg-accent-error/10 text-accent-error'
          }`}>
            {effect.enabled ? 'Active' : 'Bypassed'}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-dark-bgHover transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Parameters */}
      <div className="p-4 space-y-4">
        {parameters.length === 0 ? (
          <div className="p-4 text-center text-text-muted text-sm">
            No parameters available for this effect.
          </div>
        ) : (
          parameters.map((param) => {
            const value = getParameterValue(param);
            return (
              <div key={param.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-text-secondary">{param.name}</label>
                  <span className="text-xs text-accent-primary font-mono">
                    {formatValue(value, param)}
                  </span>
                </div>
                <input
                  type="range"
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  value={value}
                  onChange={(e) => onUpdateParameter(param.key, Number(e.target.value))}
                  className="w-full h-2 bg-dark-bgSecondary rounded-lg appearance-none cursor-pointer
                           border border-dark-border
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                           [&::-webkit-slider-thumb]:rounded [&::-webkit-slider-thumb]:bg-accent-primary
                           [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-dark-border
                           [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
                           [&::-moz-range-thumb]:rounded [&::-moz-range-thumb]:bg-accent-primary
                           [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-dark-border"
                />
                <div className="flex items-center justify-between text-[10px] text-text-muted font-mono">
                  <span>{formatValue(param.min, param)}</span>
                  <span>{formatValue(param.max, param)}</span>
                </div>
              </div>
            );
          })
        )}

        {/* Wet/Dry Mix */}
        <div className="pt-4 border-t border-dark-border space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-accent-primary flex items-center gap-1">
              <Volume2 size={12} />
              Wet / Dry Mix
            </label>
            <span className="text-xs text-accent-primary font-mono">{effect.wet}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={effect.wet}
            onChange={(e) => onUpdateWet(Number(e.target.value))}
            className="w-full h-2 bg-dark-bgSecondary rounded-lg appearance-none cursor-pointer
                     border border-accent-primary/30
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                     [&::-webkit-slider-thumb]:rounded [&::-webkit-slider-thumb]:bg-accent-primary
                     [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
                     [&::-moz-range-thumb]:rounded [&::-moz-range-thumb]:bg-accent-primary"
          />
          <div className="flex items-center justify-between text-[10px] text-text-muted font-mono">
            <span>0% (Dry)</span>
            <span>100% (Wet)</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="px-4 pb-4">
        <div className="text-[10px] text-text-muted p-2 bg-dark-bgSecondary rounded border border-dark-border">
          Changes are applied in real-time to the audio signal.
        </div>
      </div>
    </div>
  );
};
