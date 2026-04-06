/**
 * MdaDX10Controls.tsx - Visual UI for MDA DX10 (2-operator FM synth)
 * Exposes all 16 parameters with sliders and preset selection.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { MdaDX10Config } from '@/engine/mda-dx10/MdaDX10Synth';
import { DEFAULT_MDA_DX10, DX10_PARAM_NAMES } from '@/engine/mda-dx10/MdaDX10Synth';

interface MdaDX10ControlsProps {
  config: Partial<MdaDX10Config>;
  onChange: (updates: Partial<MdaDX10Config>) => void;
}

const PARAM_KEYS: (keyof MdaDX10Config)[] = [
  'attack', 'decay', 'release', 'coarse', 'fine',
  'modInit', 'modDec', 'modSus', 'modRel', 'modVel',
  'vibrato', 'octave', 'fineTune', 'waveform', 'modThru', 'lfoRate',
];

function formatValue(key: keyof MdaDX10Config, value: number): string {
  switch (key) {
    case 'octave': return `${Math.round(4 * value - 2)}`;
    case 'fineTune': return `${Math.round(200 * value - 100)} cent`;
    case 'coarse': {
      const ratio = Math.floor(32 * value);
      return `Ratio ${ratio}`;
    }
    case 'fine': return `+${(value * 100).toFixed(0)}%`;
    case 'waveform': return value < 0.5 ? 'Sine' : `Rich ${Math.round(200 * value - 100)}%`;
    default: return `${Math.round(100 * value)}%`;
  }
}

const GROUPS = [
  { label: 'Carrier Envelope', keys: ['attack', 'decay', 'release'] as (keyof MdaDX10Config)[] },
  { label: 'Modulator', keys: ['coarse', 'fine', 'modInit', 'modDec', 'modSus', 'modRel', 'modVel', 'modThru'] as (keyof MdaDX10Config)[] },
  { label: 'Pitch & Tone', keys: ['octave', 'fineTune', 'waveform'] as (keyof MdaDX10Config)[] },
  { label: 'LFO', keys: ['vibrato', 'lfoRate'] as (keyof MdaDX10Config)[] },
];

export const MdaDX10Controls: React.FC<MdaDX10ControlsProps> = ({ config, onChange }) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const updateParam = useCallback((key: keyof MdaDX10Config, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  const merged = { ...DEFAULT_MDA_DX10, ...config };

  return (
    <div className="p-4 space-y-4 text-xs">
      {/* Parameter groups */}
      {GROUPS.map((group) => (
        <div key={group.label}>
          <h3 className="text-text-muted font-semibold mb-2 border-b border-dark-border pb-1">{group.label}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {group.keys.map((key) => {
              const idx = PARAM_KEYS.indexOf(key);
              const val = merged[key] ?? 0.5;
              return (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-gray-500 truncate" title={DX10_PARAM_NAMES[idx]}>
                    {DX10_PARAM_NAMES[idx]}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.001}
                    value={val}
                    onChange={(e) => updateParam(key, parseFloat(e.target.value))}
                    className="w-full accent-orange-500 h-2"
                  />
                  <span className="text-gray-600 text-[10px]">{formatValue(key, val)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
