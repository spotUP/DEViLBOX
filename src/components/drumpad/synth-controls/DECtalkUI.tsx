/**
 * DECtalkUI — Enhanced DECtalk controls with 85 preset dropdown
 */

import React, { useCallback } from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import { DECTALK_PRESETS } from '@constants/dectalkPresets';
import { CustomSelect } from '@components/common/CustomSelect';

const DEFAULT_DECTALK_CONFIG = { text: '', voice: 0, rate: 180, pitch: 0.5, volume: 0.8 };

interface DECtalkUIProps {
  config: InstrumentConfig;
  onChange: (config: Partial<InstrumentConfig>) => void;
}

const VOICE_NAMES = [
  'Paul (Hawking)',
  'Betty',
  'Harry',
  'Frank',
  'Dennis',
  'Kit',
  'Ursula',
  'Rita',
  'Wendy'
];

export const DECtalkUI: React.FC<DECtalkUIProps> = ({ config, onChange }) => {
  const dectalk = config.dectalk;

  const handlePresetChange = useCallback((presetIndex: number) => {
    if (presetIndex < 0) return;
    
    const preset = DECTALK_PRESETS[presetIndex];
    if (!preset.dectalk) return;
    
    onChange({
      dectalk: {
        text: preset.dectalk.text || '',
        voice: preset.dectalk.voice ?? 0,
        rate: preset.dectalk.rate ?? 180,
        pitch: preset.dectalk.pitch ?? 0.5,
        volume: preset.dectalk.volume ?? 0.8
      }
    });
  }, [onChange]);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] font-mono font-bold uppercase text-text-primary border-b border-dark-borderLight pb-2">
        DECtalk Speech Synthesizer
      </h3>

      {/* Preset Selector */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-mono text-text-muted">Preset (85 voices)</label>
        <CustomSelect
          value=""
          onChange={(val) => handlePresetChange(parseInt(val))}
          placeholder="Select a preset..."
          zIndex={100000}
          options={[
            { label: 'HAL 9000 Series', options: DECTALK_PRESETS.slice(0, 10).map((preset, idx) => ({ value: String(idx), label: preset.name || `Preset ${idx + 1}` })) },
            { label: 'Classic Robots', options: DECTALK_PRESETS.slice(10, 19).map((preset, idx) => ({ value: String(idx + 10), label: preset.name || `Preset ${idx + 11}` })) },
            { label: 'Sci-Fi Computers', options: DECTALK_PRESETS.slice(19, 44).map((preset, idx) => ({ value: String(idx + 19), label: preset.name || `Preset ${idx + 20}` })) },
            { label: 'Voice Demos', options: DECTALK_PRESETS.slice(44).map((preset, idx) => ({ value: String(idx + 44), label: preset.name || `Preset ${idx + 45}` })) },
          ]}
        />
      </div>

      {/* Voice Selector */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-mono text-text-muted">Voice Character</label>
        <CustomSelect
          value={String(dectalk?.voice || 0)}
          onChange={(val) => onChange({ dectalk: { ...DEFAULT_DECTALK_CONFIG, ...dectalk, voice: parseInt(val) } })}
          zIndex={100000}
          options={VOICE_NAMES.map((name, idx) => ({ value: String(idx), label: name }))}
        />
      </div>

      {/* Rate Slider */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <label className="text-[10px] font-mono text-text-muted">Speech Rate</label>
          <span className="text-[10px] text-text-primary font-mono">{dectalk?.rate || 180} WPM</span>
        </div>
        <input
          type="range"
          min={75}
          max={600}
          value={dectalk?.rate || 180}
          onChange={(e) => onChange({ dectalk: { ...DEFAULT_DECTALK_CONFIG, ...dectalk, rate: parseInt(e.target.value) } })}
          className="w-full h-2 bg-dark-bg rounded appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-primary
                     [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full 
                     [&::-moz-range-thumb]:bg-accent-primary [&::-moz-range-thumb]:border-0"
        />
        <div className="flex justify-between text-[10px] font-mono text-text-muted">
          <span>Slow (75)</span>
          <span>Normal (180)</span>
          <span>Fast (600)</span>
        </div>
      </div>

      {/* Pitch Slider */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <label className="text-[10px] font-mono text-text-muted">Pitch</label>
          <span className="text-[10px] text-text-primary font-mono">{((dectalk?.pitch || 0.5) * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={dectalk?.pitch || 0.5}
          onChange={(e) => onChange({ dectalk: { ...DEFAULT_DECTALK_CONFIG, ...dectalk, pitch: parseFloat(e.target.value) } })}
          className="w-full h-2 bg-dark-bg rounded appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-primary
                     [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full 
                     [&::-moz-range-thumb]:bg-accent-primary [&::-moz-range-thumb]:border-0"
        />
        <div className="flex justify-between text-[10px] font-mono text-text-muted">
          <span>Deep (0%)</span>
          <span>Normal (50%)</span>
          <span>High (100%)</span>
        </div>
      </div>

      {/* Quick Tips */}
      <div className="p-3 bg-dark-bg rounded border border-dark-borderLight">
        <p className="text-[10px] font-mono text-text-muted mb-2">
          <span className="font-bold text-text-secondary">Phoneme Tips:</span>
        </p>
        <ul className="text-[10px] font-mono text-text-muted space-y-1">
          <li>• Use <code className="px-1 py-0.5 bg-dark-bgTertiary rounded">[:np]</code> for no punctuation pauses</li>
          <li>• Use <code className="px-1 py-0.5 bg-dark-bgTertiary rounded">[:rate 120]</code> to set rate inline</li>
          <li>• Famous: HAL 9000 uses Paul voice, 120 WPM, 42% pitch</li>
        </ul>
      </div>
    </div>
  );
};
