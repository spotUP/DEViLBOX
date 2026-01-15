/**
 * OscillatorEditor - Waveform and oscillator parameter editor
 */

import React from 'react';
import { Waves } from 'lucide-react';
import type { OscillatorConfig, WaveformType } from '../../types/instrument';
import { DEFAULT_OSCILLATOR } from '../../types/instrument';

interface OscillatorEditorProps {
  config?: OscillatorConfig;
  onChange: (config: OscillatorConfig) => void;
}

const WAVEFORMS: { type: WaveformType; label: string; shape: string }[] = [
  { type: 'sine', label: 'Sine', shape: '∿' },
  { type: 'square', label: 'Square', shape: '⊓⊔' },
  { type: 'sawtooth', label: 'Saw', shape: '⟋⟋' },
  { type: 'triangle', label: 'Triangle', shape: '△' },
];

const OCTAVES = [-2, -1, 0, 1, 2];

export const OscillatorEditor: React.FC<OscillatorEditorProps> = ({ config, onChange }) => {
  const oscillator = config || DEFAULT_OSCILLATOR;

  const handleWaveformChange = (type: WaveformType) => {
    onChange({ ...oscillator, type });
  };

  const handleDetuneChange = (detune: number) => {
    onChange({ ...oscillator, detune });
  };

  const handleOctaveChange = (octave: number) => {
    onChange({ ...oscillator, octave });
  };

  return (
    <div className="bg-dark-bgSecondary rounded-lg p-4 space-y-4">
      {/* Waveform Selector */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-accent-primary">
          <Waves size={16} />
          <span>WAVEFORM</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {WAVEFORMS.map((waveform) => {
            const isActive = oscillator.type === waveform.type;
            return (
              <button
                key={waveform.type}
                onClick={() => handleWaveformChange(waveform.type)}
                className={`
                  p-3 border rounded-lg transition-all
                  ${
                    isActive
                      ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                      : 'bg-dark-bgTertiary text-text-primary border-dark-border hover:border-dark-borderLight'
                  }
                `}
              >
                <div className="text-2xl mb-1 font-bold">{waveform.shape}</div>
                <div className="text-xs font-mono">{waveform.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detune Slider */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-accent-primary">DETUNE</span>
          <span className="text-sm font-mono bg-dark-bgTertiary px-2 py-1 rounded-md border border-dark-border text-accent-primary">
            {oscillator.detune > 0 ? '+' : ''}
            {oscillator.detune} cents
          </span>
        </div>
        <input
          type="range"
          min="-100"
          max="100"
          step="1"
          value={oscillator.detune}
          onChange={(e) => handleDetuneChange(parseFloat(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-text-muted font-mono">
          <span>-100</span>
          <span>0</span>
          <span>+100</span>
        </div>
      </div>

      {/* Octave Buttons */}
      <div className="space-y-3">
        <div className="text-sm font-bold text-accent-primary">OCTAVE SHIFT</div>
        <div className="grid grid-cols-5 gap-2">
          {OCTAVES.map((octave) => {
            const isActive = oscillator.octave === octave;
            return (
              <button
                key={octave}
                onClick={() => handleOctaveChange(octave)}
                className={`
                  py-2 px-3 border rounded-md font-mono text-sm font-bold transition-all
                  ${
                    isActive
                      ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                      : 'bg-dark-bgTertiary text-text-primary border-dark-border hover:border-dark-borderLight'
                  }
                `}
              >
                {octave > 0 ? '+' : ''}
                {octave}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-text-muted bg-dark-bgTertiary p-3 rounded-md border border-dark-border">
          Shifts pitch by octaves (-2 to +2)
        </div>
      </div>
    </div>
  );
};
