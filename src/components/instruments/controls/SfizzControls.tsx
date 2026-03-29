/**
 * SfizzControls.tsx - Sfizz SFZ player controls
 *
 * Layout: Volume/Voices, Oversampling/Quality, Performance CCs.
 * Performance CCs are sent via the engine's sendCC method, not stored in config.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { Knob } from '@components/controls/Knob';
import type { SfizzConfig } from '@/engine/sfizz/SfizzSynth';
import { DEFAULT_SFIZZ, SFIZZ_PRESETS } from '@/engine/sfizz/SfizzSynth';

interface SfizzControlsProps {
  config: SfizzConfig;
  onChange: (config: SfizzConfig) => void;
}

const OVERSAMPLING_OPTIONS = [
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
  { label: '4x', value: 4 },
  { label: '8x', value: 8 },
];

export const SfizzControls: React.FC<SfizzControlsProps> = ({ config, onChange }) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const updateParam = useCallback((key: keyof SfizzConfig, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  const handlePreset = useCallback((name: string) => {
    const preset = SFIZZ_PRESETS[name];
    if (preset) onChange({ ...DEFAULT_SFIZZ, ...preset });
  }, [onChange]);

  const merged = { ...DEFAULT_SFIZZ, ...config } as Required<SfizzConfig>;

  return (
    <div className="synth-controls-flow flex flex-col gap-4 p-4 overflow-y-auto text-xs">
      <div className="flex items-center gap-2">
        <label className="text-gray-400 font-medium">Preset:</label>
        <select className="bg-[#2a2a2a] text-gray-200 border border-gray-600 rounded px-2 py-1 text-xs"
          onChange={(e) => handlePreset(e.target.value)} defaultValue="">
          <option value="" disabled>Select preset...</option>
          {Object.keys(SFIZZ_PRESETS).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className="p-4 rounded-xl border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-amber-500">Output</h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob label="Volume" value={merged.volume} min={-60} max={6} defaultValue={0} onChange={(v) => updateParam('volume', v)} size="sm" color="#a78bfa" unit="dB" />
          <Knob label="Voices" value={merged.numVoices} min={1} max={256} defaultValue={64} onChange={(v) => updateParam('numVoices', Math.round(v))} size="sm" color="#a78bfa" />
        </div>
      </div>

      <div className="p-4 rounded-xl border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-amber-500">Engine</h3>
        <div className="flex flex-wrap items-center gap-4">
          <Knob label="Sample Q" value={merged.sampleQuality} min={0} max={10} defaultValue={2} onChange={(v) => updateParam('sampleQuality', Math.round(v))} size="sm" color="#a78bfa" />
          <Knob label="Osc Q" value={merged.oscillatorQuality} min={0} max={3} defaultValue={1} onChange={(v) => updateParam('oscillatorQuality', Math.round(v))} size="sm" color="#a78bfa" />
          <Knob label="Preload" value={merged.preloadSize} min={1024} max={65536} defaultValue={8192} onChange={(v) => updateParam('preloadSize', Math.round(v))} size="sm" color="#a78bfa" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-text-muted">Oversampling</span>
            <div className="flex gap-1">
              {OVERSAMPLING_OPTIONS.map(({ label, value }) => (
                <button key={label} onClick={() => updateParam('oversampling', value)}
                  className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${merged.oversampling === value ? 'bg-violet-500 text-white' : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 rounded-xl border bg-[#1a1a1a] border-amber-900/30 text-text-muted text-[10px]">
        <p>SFZ instruments define their own CC mappings. Standard CCs: 1=ModWheel, 7=Volume, 10=Pan, 11=Expression, 64=Sustain, 74=Cutoff, 91=Reverb, 93=Chorus</p>
      </div>
    </div>
  );
};

export default SfizzControls;
