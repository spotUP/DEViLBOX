/**
 * DECtalkUI — DECtalk voice and rate controls with character presets
 */

import React, { useCallback, useMemo } from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import { DECTALK_PRESETS } from '@constants/dectalkPresets';
import { CustomSelect } from '@components/common/CustomSelect';

const DEFAULT_DECTALK_CONFIG = { text: '', voice: 0, rate: 180, pitch: 0.5, volume: 0.8 };

interface DECtalkUIProps {
  config: InstrumentConfig;
  onChange: (config: Partial<InstrumentConfig>) => void;
}

// Build voice preset options from DECTALK_PRESETS (voice+rate+pitch, no text)
const VOICE_PRESET_GROUPS = (() => {
  const groups: { label: string; start: number; end: number }[] = [
    { label: 'HAL 9000 Series', start: 0, end: 10 },
    { label: 'Classic Robots', start: 10, end: 19 },
    { label: 'Sci-Fi Computers', start: 19, end: 44 },
    { label: 'Voice Demos', start: 44, end: DECTALK_PRESETS.length },
  ];
  return groups.map(g => ({
    label: g.label,
    options: DECTALK_PRESETS.slice(g.start, g.end).map((p, i) => ({
      value: String(g.start + i),
      label: (p.name || `Preset ${g.start + i + 1}`).replace(/^DEC_/, ''),
    })),
  }));
})();

export const DECtalkUI: React.FC<DECtalkUIProps> = ({ config, onChange }) => {
  const dectalk = config.dectalk;

  // Find which preset matches current voice+rate+pitch (if any)
  const currentPresetIdx = useMemo(() => {
    if (!dectalk) return '';
    const idx = DECTALK_PRESETS.findIndex(p =>
      p.dectalk?.voice === dectalk.voice &&
      p.dectalk?.rate === dectalk.rate &&
      Math.abs((p.dectalk?.pitch ?? 0.5) - (dectalk.pitch ?? 0.5)) < 0.01
    );
    return idx >= 0 ? String(idx) : '';
  }, [dectalk]);

  const handleVoicePreset = useCallback((val: string) => {
    const idx = parseInt(val);
    if (idx < 0 || idx >= DECTALK_PRESETS.length) return;
    const preset = DECTALK_PRESETS[idx];
    if (!preset.dectalk) return;
    // Apply voice+rate+pitch from preset, keep current text
    onChange({
      dectalk: {
        ...DEFAULT_DECTALK_CONFIG,
        ...dectalk,
        voice: preset.dectalk.voice ?? 0,
        rate: preset.dectalk.rate ?? 180,
        pitch: preset.dectalk.pitch ?? 0.5,
      }
    });
  }, [dectalk, onChange]);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] font-mono font-bold uppercase text-text-primary border-b border-dark-borderLight pb-2">
        DECtalk Speech Synthesizer
      </h3>

      {/* Voice Preset Selector */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-mono text-text-muted">Voice Preset</label>
        <CustomSelect
          value={currentPresetIdx}
          onChange={handleVoicePreset}
          placeholder="Select a voice..."
          zIndex={100000}
          options={VOICE_PRESET_GROUPS}
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
