/**
 * SAMUI — Enhanced SAM controls with 4 preset dropdown
 */

import React, { useCallback } from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import { SAM_PRESETS } from '@constants/samPresets';
import { CustomSelect } from '@components/common/CustomSelect';

interface SAMUIProps {
  config: InstrumentConfig;
  onChange: (config: Partial<InstrumentConfig>) => void;
}

export const SAMUI: React.FC<SAMUIProps> = ({ config, onChange }) => {
  const sam = config.sam;

  const handlePresetChange = useCallback((presetIndex: number) => {
    if (presetIndex < 0) return;
    
    const preset = SAM_PRESETS[presetIndex];
    if (!preset.sam) return;
    
    onChange({
      sam: {
        text: preset.sam.text || '',
        pitch: preset.sam.pitch ?? 64,
        speed: preset.sam.speed ?? 72,
        mouth: preset.sam.mouth ?? 128,
        throat: preset.sam.throat ?? 128,
        singmode: preset.sam.singmode ?? false,
        phonetic: preset.sam.phonetic ?? false
      }
    });
  }, [onChange]);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] font-mono font-bold uppercase text-text-primary border-b border-dark-borderLight pb-2">
        SAM (Commodore 64 Speech Synth)
      </h3>

      {/* Preset Selector */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-mono text-text-muted">Preset (4 classic voices)</label>
        <CustomSelect
          value=""
          onChange={(val) => handlePresetChange(parseInt(val))}
          placeholder="Select a preset..."
          zIndex={100000}
          options={SAM_PRESETS.map((preset, idx) => ({ value: String(idx), label: preset.name || `Preset ${idx + 1}` }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Pitch */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-mono text-text-muted">Pitch</label>
            <span className="text-[10px] text-text-primary font-mono">{sam?.pitch || 64}</span>
          </div>
          <input
            type="range"
            min={0}
            max={255}
            value={sam?.pitch || 64}
            onChange={(e) => onChange({ sam: { ...sam!, pitch: parseInt(e.target.value) } })}
            className="w-full h-2 bg-dark-bg rounded appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-primary
                       [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full 
                       [&::-moz-range-thumb]:bg-accent-primary [&::-moz-range-thumb]:border-0"
          />
        </div>

        {/* Speed */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-mono text-text-muted">Speed</label>
            <span className="text-[10px] text-text-primary font-mono">{sam?.speed || 72}</span>
          </div>
          <input
            type="range"
            min={0}
            max={255}
            value={sam?.speed || 72}
            onChange={(e) => onChange({ sam: { ...sam!, speed: parseInt(e.target.value) } })}
            className="w-full h-2 bg-dark-bg rounded appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-primary
                       [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full 
                       [&::-moz-range-thumb]:bg-accent-primary [&::-moz-range-thumb]:border-0"
          />
        </div>

        {/* Mouth */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-mono text-text-muted">Mouth</label>
            <span className="text-[10px] text-text-primary font-mono">{sam?.mouth || 128}</span>
          </div>
          <input
            type="range"
            min={0}
            max={255}
            value={sam?.mouth || 128}
            onChange={(e) => onChange({ sam: { ...sam!, mouth: parseInt(e.target.value) } })}
            className="w-full h-2 bg-dark-bg rounded appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-primary
                       [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full 
                       [&::-moz-range-thumb]:bg-accent-primary [&::-moz-range-thumb]:border-0"
          />
        </div>

        {/* Throat */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-mono text-text-muted">Throat</label>
            <span className="text-[10px] text-text-primary font-mono">{sam?.throat || 128}</span>
          </div>
          <input
            type="range"
            min={0}
            max={255}
            value={sam?.throat || 128}
            onChange={(e) => onChange({ sam: { ...sam!, throat: parseInt(e.target.value) } })}
            className="w-full h-2 bg-dark-bg rounded appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-primary
                       [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full 
                       [&::-moz-range-thumb]:bg-accent-primary [&::-moz-range-thumb]:border-0"
          />
        </div>
      </div>

      {/* Toggles */}
      <div className="flex gap-6">
        <label className="flex items-center gap-1 text-sm text-text-primary cursor-pointer">
          <input
            type="checkbox"
            checked={sam?.phonetic || false}
            onChange={(e) => onChange({ sam: { ...sam!, phonetic: e.target.checked } })}
            className="w-4 h-4 rounded border-dark-borderLight bg-dark-bgTertiary 
                       checked:bg-accent-primary focus:ring-1 focus:ring-accent-primary"
          />
          <span className="text-xs">Phonetic Mode</span>
        </label>
        <label className="flex items-center gap-1 text-sm text-text-primary cursor-pointer">
          <input
            type="checkbox"
            checked={sam?.singmode || false}
            onChange={(e) => onChange({ sam: { ...sam!, singmode: e.target.checked } })}
            className="w-4 h-4 rounded border-dark-borderLight bg-dark-bgTertiary 
                       checked:bg-accent-primary focus:ring-1 focus:ring-accent-primary"
          />
          <span className="text-xs">Sing Mode</span>
        </label>
      </div>

      {/* Quick Tips */}
      <div className="p-3 bg-dark-bg rounded border border-dark-borderLight">
        <p className="text-[10px] font-mono text-text-muted">
          <span className="font-bold text-text-secondary">C64 Classic:</span> The iconic 1982 speech synthesizer.
          Adjust <strong>Mouth</strong> for clarity and <strong>Throat</strong> for character depth.
        </p>
      </div>
    </div>
  );
};
