/**
 * MdaJX10Controls.tsx - Visual UI for MDA JX-10 (Roland-inspired poly synth)
 * Exposes all 24 parameters with knobs and preset selection.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { MdaJX10Config } from '@/engine/mda-jx10/MdaJX10Synth';
import { DEFAULT_MDA_JX10, JX10_PARAM_NAMES } from '@/engine/mda-jx10/MdaJX10Synth';

interface MdaJX10ControlsProps {
  config: Partial<MdaJX10Config>;
  onChange: (updates: Partial<MdaJX10Config>) => void;
}

const PARAM_KEYS: (keyof MdaJX10Config)[] = [
  'oscMix', 'oscTune', 'oscFine', 'glide', 'glideRate', 'glideBend',
  'vcfFreq', 'vcfReso', 'vcfEnv', 'vcfLfo', 'vcfVel',
  'vcfAtt', 'vcfDec', 'vcfSus', 'vcfRel',
  'envAtt', 'envDec', 'envSus', 'envRel',
  'lfoRate', 'vibrato', 'noise', 'octave', 'tuning',
];

function formatGlideMode(v: number): string {
  if (v < 0.17) return 'Poly';
  if (v < 0.33) return 'P-Legato';
  if (v < 0.5) return 'P-Glide';
  if (v < 0.67) return 'Mono';
  if (v < 0.83) return 'M-Legato';
  return 'M-Glide';
}

function formatValue(key: keyof MdaJX10Config, value: number): string {
  switch (key) {
    case 'oscMix': return `${Math.round(100 * value)}% Osc2`;
    case 'oscTune': return `${Math.round(48 * value - 24)} semi`;
    case 'oscFine': return `${Math.round(200 * value - 100)} cent`;
    case 'glide': return formatGlideMode(value);
    case 'glideRate': return `${Math.round(100 * value)}%`;
    case 'glideBend': return `${Math.round(100 * value - 50)}%`;
    case 'octave': return `${Math.round(4 * value - 2)}`;
    case 'tuning': return `${Math.round(200 * value - 100)} cent`;
    default: return `${Math.round(100 * value)}%`;
  }
}

const GROUPS = [
  { label: 'Oscillators', keys: ['oscMix', 'oscTune', 'oscFine', 'noise', 'octave', 'tuning'] as (keyof MdaJX10Config)[] },
  { label: 'Glide', keys: ['glide', 'glideRate', 'glideBend'] as (keyof MdaJX10Config)[] },
  { label: 'Filter (VCF)', keys: ['vcfFreq', 'vcfReso', 'vcfEnv', 'vcfLfo', 'vcfVel'] as (keyof MdaJX10Config)[] },
  { label: 'Filter Envelope', keys: ['vcfAtt', 'vcfDec', 'vcfSus', 'vcfRel'] as (keyof MdaJX10Config)[] },
  { label: 'Amp Envelope', keys: ['envAtt', 'envDec', 'envSus', 'envRel'] as (keyof MdaJX10Config)[] },
  { label: 'Modulation', keys: ['lfoRate', 'vibrato'] as (keyof MdaJX10Config)[] },
];

export const MdaJX10Controls: React.FC<MdaJX10ControlsProps> = ({ config, onChange }) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const updateParam = useCallback((key: keyof MdaJX10Config, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  const merged = { ...DEFAULT_MDA_JX10, ...config };

  return (
    <div className="p-4 space-y-4 text-xs">
      {/* Parameter groups */}
      {GROUPS.map((group) => (
        <div key={group.label}>
          <h3 className="text-gray-400 font-semibold mb-2 border-b border-gray-700 pb-1">{group.label}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {group.keys.map((key) => {
              const idx = PARAM_KEYS.indexOf(key);
              const val = merged[key] ?? 0.5;
              return (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-gray-500 truncate" title={JX10_PARAM_NAMES[idx]}>
                    {JX10_PARAM_NAMES[idx]}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.001}
                    value={val}
                    onChange={(e) => updateParam(key, parseFloat(e.target.value))}
                    className="w-full accent-blue-500 h-2"
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
