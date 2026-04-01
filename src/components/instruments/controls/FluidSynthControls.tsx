/**
 * FluidSynthControls.tsx - FluidSynth SF2 player controls
 *
 * Layout: Program/Bank selector, Reverb, Chorus, Master.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { Knob } from '@components/controls/Knob';
import type { FluidSynthConfig } from '@/engine/fluidsynth/FluidSynthSynth';
import { DEFAULT_FLUIDSYNTH } from '@/engine/fluidsynth/FluidSynthSynth';

interface FluidSynthControlsProps {
  config: FluidSynthConfig;
  onChange: (config: FluidSynthConfig) => void;
}

const GM_PROGRAMS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Acoustic Grand Piano' },
  { value: 1, label: 'Bright Acoustic Piano' },
  { value: 2, label: 'Electric Grand Piano' },
  { value: 3, label: 'Honky-tonk Piano' },
  { value: 4, label: 'Electric Piano 1' },
  { value: 5, label: 'Electric Piano 2' },
  { value: 6, label: 'Harpsichord' },
  { value: 7, label: 'Clavinet' },
  { value: 16, label: 'Drawbar Organ' },
  { value: 19, label: 'Church Organ' },
  { value: 24, label: 'Acoustic Guitar (nylon)' },
  { value: 25, label: 'Acoustic Guitar (steel)' },
  { value: 32, label: 'Acoustic Bass' },
  { value: 33, label: 'Electric Bass (finger)' },
  { value: 40, label: 'Violin' },
  { value: 42, label: 'Cello' },
  { value: 48, label: 'String Ensemble 1' },
  { value: 52, label: 'Choir Aahs' },
  { value: 56, label: 'Trumpet' },
  { value: 60, label: 'French Horn' },
  { value: 64, label: 'Soprano Sax' },
  { value: 65, label: 'Alto Sax' },
  { value: 73, label: 'Flute' },
  { value: 80, label: 'Synth Lead (square)' },
  { value: 88, label: 'Synth Pad (new age)' },
];

// ============================================================================
// FluidSynthControls — main component
// ============================================================================

export const FluidSynthControls: React.FC<FluidSynthControlsProps> = ({ config, onChange }) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const updateParam = useCallback((key: keyof FluidSynthConfig, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  const merged = { ...DEFAULT_FLUIDSYNTH, ...config } as Required<FluidSynthConfig>;

  return (
    <div className="synth-controls-flow grid grid-cols-2 gap-2 p-2 overflow-y-auto text-xs">
      {/* Program / Bank */}
      <div className="p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-amber-500">Program</h3>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-[10px]">Instrument</label>
            <select
              className="bg-[#2a2a2a] text-gray-200 border border-gray-600 rounded px-2 py-1 text-xs w-52"
              value={merged.program}
              onChange={(e) => updateParam('program', parseInt(e.target.value, 10))}
            >
              {GM_PROGRAMS.map(({ value, label }) => (
                <option key={value} value={value}>{value}: {label}</option>
              ))}
            </select>
          </div>
          <Knob label="Bank" value={merged.bank} min={0} max={128} defaultValue={0}
            onChange={(v) => updateParam('bank', Math.round(v))} size="sm" color="#38bdf8" />
        </div>
      </div>

      {/* Reverb */}
      <div className="p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-amber-500">Reverb</h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob label="Room" value={merged.reverbRoomSize} min={0} max={1.2} defaultValue={0.2}
            onChange={(v) => updateParam('reverbRoomSize', v)} size="sm" color="#38bdf8" />
          <Knob label="Damp" value={merged.reverbDamping} min={0} max={1} defaultValue={0}
            onChange={(v) => updateParam('reverbDamping', v)} size="sm" color="#38bdf8" />
          <Knob label="Width" value={merged.reverbWidth} min={0} max={100} defaultValue={0.5}
            onChange={(v) => updateParam('reverbWidth', v)} size="sm" color="#38bdf8" />
          <Knob label="Level" value={merged.reverbLevel} min={0} max={1} defaultValue={0.9}
            onChange={(v) => updateParam('reverbLevel', v)} size="sm" color="#38bdf8" />
        </div>
      </div>

      {/* Chorus */}
      <div className="p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-amber-500">Chorus</h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob label="Voices" value={merged.chorusVoices} min={0} max={99} defaultValue={3}
            onChange={(v) => updateParam('chorusVoices', Math.round(v))} size="sm" color="#38bdf8" />
          <Knob label="Level" value={merged.chorusLevel} min={0} max={10} defaultValue={2}
            onChange={(v) => updateParam('chorusLevel', v)} size="sm" color="#38bdf8" />
          <Knob label="Speed" value={merged.chorusSpeed} min={0.1} max={5} defaultValue={0.3}
            onChange={(v) => updateParam('chorusSpeed', v)} size="sm" color="#38bdf8" unit="Hz" />
          <Knob label="Depth" value={merged.chorusDepth} min={0} max={21} defaultValue={8}
            onChange={(v) => updateParam('chorusDepth', v)} size="sm" color="#38bdf8" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-text-muted">Type</span>
            <div className="flex gap-1">
              {['Sine', 'Triangle'].map((label, i) => (
                <button
                  key={label}
                  onClick={() => updateParam('chorusType', i)}
                  className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${
                    Math.round(merged.chorusType) === i
                      ? 'bg-sky-500 text-white'
                      : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Master */}
      <div className="p-2 rounded-lg border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-3 text-amber-500">Master</h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob label="Gain" value={merged.gain} min={0} max={10} defaultValue={0.4}
            onChange={(v) => updateParam('gain', v)} size="sm" color="#38bdf8" />
          <Knob label="Polyphony" value={merged.polyphony} min={1} max={256} defaultValue={64}
            onChange={(v) => updateParam('polyphony', Math.round(v))} size="sm" color="#38bdf8" />
          <Knob label="Tuning" value={merged.tuning} min={430} max={450} defaultValue={440}
            onChange={(v) => updateParam('tuning', v)} size="sm" color="#38bdf8" unit="Hz" />
          <Knob label="Transpose" value={merged.transpose} min={-24} max={24} defaultValue={0}
            onChange={(v) => updateParam('transpose', Math.round(v))} size="sm" color="#38bdf8" unit="st" />
        </div>
      </div>
    </div>
  );
};

export default FluidSynthControls;
