/**
 * V2SpeechUI — Enhanced V2Speech controls with 2 preset dropdown
 */

import React, { useCallback } from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import { V2_SPEECH_PRESETS } from '@constants/v2FactoryPresets/speech';
import { CustomSelect } from '@components/common/CustomSelect';

interface V2SpeechUIProps {
  config: InstrumentConfig;
  onChange: (config: Partial<InstrumentConfig>) => void;
}

export const V2SpeechUI: React.FC<V2SpeechUIProps> = ({ config, onChange }) => {
  const v2 = config.v2Speech;

  const handlePresetChange = useCallback((presetIndex: number) => {
    if (presetIndex < 0) return;
    
    const preset = V2_SPEECH_PRESETS[presetIndex];
    if (!preset.v2Speech) return;
    
    onChange({
      v2Speech: {
        text: preset.v2Speech.text || '',
        speed: preset.v2Speech.speed ?? 64,
        pitch: preset.v2Speech.pitch ?? 64,
        formantShift: preset.v2Speech.formantShift ?? 64,
        singMode: preset.v2Speech.singMode ?? false
      }
    });
  }, [onChange]);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] font-mono font-bold uppercase text-text-primary border-b border-dark-borderLight pb-2">
        V2 Speech Synthesizer (Farbrausch)
      </h3>

      {/* Preset Selector */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-mono text-text-muted">Preset (2 demoscene classics)</label>
        <CustomSelect
          value=""
          onChange={(val) => handlePresetChange(parseInt(val))}
          placeholder="Select a preset..."
          zIndex={100000}
          options={V2_SPEECH_PRESETS.map((preset, idx) => ({ value: String(idx), label: preset.name || `Preset ${idx + 1}` }))}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Speed */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-mono text-text-muted">Speed</label>
            <span className="text-[10px] text-text-primary font-mono">{v2?.speed || 64}</span>
          </div>
          <input
            type="range"
            min={0}
            max={127}
            value={v2?.speed || 64}
            onChange={(e) => onChange({ v2Speech: { ...v2!, speed: parseInt(e.target.value) } })}
            className="w-full h-2 bg-dark-bg rounded appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-primary
                       [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full 
                       [&::-moz-range-thumb]:bg-accent-primary [&::-moz-range-thumb]:border-0"
          />
        </div>

        {/* Pitch */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-mono text-text-muted">Pitch</label>
            <span className="text-[10px] text-text-primary font-mono">{v2?.pitch || 64}</span>
          </div>
          <input
            type="range"
            min={0}
            max={127}
            value={v2?.pitch || 64}
            onChange={(e) => onChange({ v2Speech: { ...v2!, pitch: parseInt(e.target.value) } })}
            className="w-full h-2 bg-dark-bg rounded appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-primary
                       [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full 
                       [&::-moz-range-thumb]:bg-accent-primary [&::-moz-range-thumb]:border-0"
          />
        </div>

        {/* Formant Shift */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-mono text-text-muted">Formant</label>
            <span className="text-[10px] text-text-primary font-mono">{v2?.formantShift || 64}</span>
          </div>
          <input
            type="range"
            min={0}
            max={127}
            value={v2?.formantShift || 64}
            onChange={(e) => onChange({ v2Speech: { ...v2!, formantShift: parseInt(e.target.value) } })}
            className="w-full h-2 bg-dark-bg rounded appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-primary
                       [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full 
                       [&::-moz-range-thumb]:bg-accent-primary [&::-moz-range-thumb]:border-0"
          />
        </div>
      </div>

      {/* Sing Mode Toggle */}
      <div className="flex items-center gap-1">
        <label className="flex items-center gap-1 text-sm text-text-primary cursor-pointer">
          <input
            type="checkbox"
            checked={v2?.singMode || false}
            onChange={(e) => onChange({ v2Speech: { ...v2!, singMode: e.target.checked } })}
            className="w-4 h-4 rounded border-dark-borderLight bg-dark-bgTertiary 
                       checked:bg-accent-primary focus:ring-1 focus:ring-accent-primary"
          />
          <span className="text-xs">Sing Mode (musical phonemes)</span>
        </label>
      </div>

      {/* Quick Tips */}
      <div className="p-3 bg-dark-bg rounded border border-dark-borderLight">
        <p className="text-[10px] font-mono text-text-muted mb-2">
          <span className="font-bold text-text-secondary">Demoscene Legend:</span>
        </p>
        <p className="text-[10px] font-mono text-text-muted">
          V2 powered iconic demos like "The Product" (2000). 
          Use phoneme notation for precise control: <code className="px-1 py-0.5 bg-dark-bgTertiary rounded">o:, u:, a:</code> etc.
        </p>
      </div>
    </div>
  );
};
