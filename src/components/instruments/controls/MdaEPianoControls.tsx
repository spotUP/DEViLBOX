/**
 * MdaEPianoControls.tsx - Visual UI for MDA ePiano (Fender Rhodes)
 * Exposes all 12 parameters with knobs and preset selection.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { MdaEPianoConfig } from '@/engine/mda-epiano/MdaEPianoSynth';
import { DEFAULT_MDA_EPIANO, EPIANO_PARAM_NAMES } from '@/engine/mda-epiano/MdaEPianoSynth';

interface MdaEPianoControlsProps {
  config: Partial<MdaEPianoConfig>;
  onChange: (updates: Partial<MdaEPianoConfig>) => void;
}

const PARAM_KEYS: (keyof MdaEPianoConfig)[] = [
  'envelopeDecay', 'envelopeRelease', 'hardness', 'trebleBoost',
  'modulation', 'lfoRate', 'velocitySense', 'stereoWidth',
  'polyphony', 'fineTuning', 'randomTuning', 'overdrive',
];

function formatValue(key: keyof MdaEPianoConfig, value: number): string {
  switch (key) {
    case 'modulation':
      return value > 0.5 ? `Trem ${Math.round(200 * value - 100)}%` : `Pan ${Math.round(100 - 200 * value)}%`;
    case 'lfoRate':
      return `${Math.exp(6.22 * value - 2.61).toFixed(2)} Hz`;
    case 'stereoWidth':
      return `${Math.round(200 * value)}%`;
    case 'polyphony':
      return `${1 + Math.floor(31 * value)} voices`;
    case 'fineTuning':
      return `${Math.round(100 * value - 50)} cents`;
    case 'randomTuning':
      return `${(50 * value * value).toFixed(1)} cents`;
    case 'overdrive':
      return `${Math.round(100 * value)}%`;
    case 'hardness':
    case 'trebleBoost':
      return `${Math.round(100 * value - 50)}%`;
    default:
      return `${Math.round(100 * value)}%`;
  }
}

export const MdaEPianoControls: React.FC<MdaEPianoControlsProps> = ({ config, onChange }) => {
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const updateParam = useCallback((key: keyof MdaEPianoConfig, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  const fullConfig = { ...DEFAULT_MDA_EPIANO, ...config };

  return (
    <div className="space-y-3 p-2">
      {/* Parameter groups */}
      <div className="border border-ft2-border p-2">
        <div className="text-ft2-highlight text-xs mb-2 font-bold">Envelope</div>
        <div className="grid grid-cols-2 gap-2">
          {(['envelopeDecay', 'envelopeRelease'] as const).map((key, i) => (
            <ParamSlider
              key={key}
              label={EPIANO_PARAM_NAMES[i]}
              value={fullConfig[key] ?? 0.5}
              displayValue={formatValue(key, fullConfig[key] ?? 0.5)}
              onChange={(v) => updateParam(key, v)}
            />
          ))}
        </div>
      </div>

      <div className="border border-ft2-border p-2">
        <div className="text-ft2-highlight text-xs mb-2 font-bold">Tone</div>
        <div className="grid grid-cols-2 gap-2">
          {(['hardness', 'trebleBoost', 'overdrive', 'velocitySense'] as const).map((key) => (
            <ParamSlider
              key={key}
              label={EPIANO_PARAM_NAMES[PARAM_KEYS.indexOf(key)]}
              value={fullConfig[key] ?? 0.5}
              displayValue={formatValue(key, fullConfig[key] ?? 0.5)}
              onChange={(v) => updateParam(key, v)}
            />
          ))}
        </div>
      </div>

      <div className="border border-ft2-border p-2">
        <div className="text-ft2-highlight text-xs mb-2 font-bold">Modulation</div>
        <div className="grid grid-cols-2 gap-2">
          {(['modulation', 'lfoRate'] as const).map((key) => (
            <ParamSlider
              key={key}
              label={EPIANO_PARAM_NAMES[PARAM_KEYS.indexOf(key)]}
              value={fullConfig[key] ?? 0.5}
              displayValue={formatValue(key, fullConfig[key] ?? 0.5)}
              onChange={(v) => updateParam(key, v)}
            />
          ))}
        </div>
      </div>

      <div className="border border-ft2-border p-2">
        <div className="text-ft2-highlight text-xs mb-2 font-bold">Stereo & Tuning</div>
        <div className="grid grid-cols-2 gap-2">
          {(['stereoWidth', 'fineTuning', 'randomTuning', 'polyphony'] as const).map((key) => (
            <ParamSlider
              key={key}
              label={EPIANO_PARAM_NAMES[PARAM_KEYS.indexOf(key)]}
              value={fullConfig[key] ?? 0.5}
              displayValue={formatValue(key, fullConfig[key] ?? 0.5)}
              onChange={(v) => updateParam(key, v)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

/** Simple parameter slider */
const ParamSlider: React.FC<{
  label: string;
  value: number;
  displayValue: string;
  onChange: (value: number) => void;
}> = ({ label, value, displayValue, onChange }) => (
  <div className="flex flex-col gap-0.5">
    <div className="flex justify-between text-xs">
      <span className="text-ft2-textDim">{label}</span>
      <span className="text-ft2-text font-mono">{displayValue}</span>
    </div>
    <input
      type="range"
      min={0}
      max={1}
      step={0.001}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-2 bg-ft2-bg rounded appearance-none cursor-pointer accent-ft2-highlight"
    />
  </div>
);
