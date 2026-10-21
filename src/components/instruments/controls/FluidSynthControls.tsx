/**
 * FluidSynthControls.tsx - FluidSynth SF2 player controls
 *
 * Layout: Program (per instrument), then Reverb, Chorus and Master, which are
 * song-wide: every FluidSynth instrument shares one synth, so the last edit wins.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { Knob } from '@components/controls/Knob';
import { Toggle } from '@components/controls/Toggle';
import { CustomSelect } from '@components/common/CustomSelect';
import { Button } from '@components/ui/Button';
import type { FluidSynthConfig } from '@/engine/fluidsynth/FluidSynthSynth';
import { DEFAULT_FLUIDSYNTH } from '@/engine/fluidsynth/FluidSynthSynth';
import { GM2_NAMES } from '@lib/import/GMSoundBank';
import { useFluidSynthPresetNames } from '@/hooks/useFluidSynthPresetNames';

export interface FluidSynthControlsProps {
  config: FluidSynthConfig;
  onChange: (config: FluidSynthConfig) => void;
}

export const DRUM_KIT_BANK = 128;

/**
 * The program list for bank: the 128 General MIDI names, or on the drum bank
 * the kits the loaded SoundFonts actually hold. The current program is always
 * listed so the select can show it.
 */
export function fluidProgramOptions(bank: number, program: number, fontNames: string[] | null): Array<{ value: string; label: string }> {
  if (bank !== DRUM_KIT_BANK) {
    return GM2_NAMES.map((name, i) => ({ value: String(i), label: `${i}: ${name}` }));
  }
  const options: Array<{ value: string; label: string }> = [];
  for (let i = 0; i < 128; i++) {
    const name = fontNames?.[i];
    if (name) options.push({ value: String(i), label: `${i}: ${name}` });
    else if (i === program) options.push({ value: String(i), label: `${i}: Program ${i}` });
  }
  return options;
}

const SECTION = 'p-2 rounded border bg-dark-bgSecondary border-dark-border';
const HEADING = 'text-[10px] font-mono uppercase mb-2 text-accent-primary';
const SONG_WIDE = 'text-text-muted normal-case';

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
  const drumKits = merged.bank === DRUM_KIT_BANK;
  const fontNames = useFluidSynthPresetNames(merged.bank);
  const resolved = fontNames?.[merged.program];
  const resolvedText = fontNames === null
    ? 'Reading SoundFont...'
    : resolved || `No preset at bank ${merged.bank}, program ${merged.program} in the loaded SoundFonts`;

  return (
    <div className="synth-controls-flow grid grid-cols-4 gap-2 p-2 overflow-y-auto text-xs">
      {/* Program / Bank: per instrument */}
      <div className={SECTION}>
        <h3 className={HEADING}>Program</h3>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-text-muted text-[10px] font-mono">{drumKits ? 'Drum Kit' : 'Instrument'}</label>
            <CustomSelect
              className="bg-dark-bgTertiary text-text-primary border border-dark-borderLight rounded px-2 py-1 font-mono text-xs w-52"
              value={String(merged.program)}
              onChange={(v) => updateParam('program', parseInt(v, 10))}
              options={fluidProgramOptions(merged.bank, merged.program, fontNames)}
            />
            <span className="text-[10px] font-mono text-text-secondary" data-testid="fluid-preset-name">
              SoundFont preset: {resolvedText}
            </span>
          </div>
          <Knob label="Bank" value={merged.bank} min={0} max={128} defaultValue={0}
            onChange={(v) => updateParam('bank', Math.round(v))} tone="primary" />
          <Toggle label="Drum Kits" value={drumKits}
            onChange={(on) => updateParam('bank', on ? DRUM_KIT_BANK : 0)} tone="primary" />
          <Knob label="Transpose" value={merged.transpose} min={-24} max={24} defaultValue={0}
            onChange={(v) => updateParam('transpose', Math.round(v))} tone="primary" unit="st" />
        </div>
      </div>

      {/* Reverb */}
      <div className={SECTION}>
        <h3 className={HEADING}>Reverb <span className={SONG_WIDE}>(song-wide)</span></h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob label="Room" value={merged.reverbRoomSize} min={0} max={1.2} defaultValue={0.2}
            onChange={(v) => updateParam('reverbRoomSize', v)} tone="primary" />
          <Knob label="Damping" value={merged.reverbDamping} min={0} max={1} defaultValue={0}
            onChange={(v) => updateParam('reverbDamping', v)} tone="primary" />
          <Knob label="Width" value={merged.reverbWidth} min={0} max={100} defaultValue={0.5}
            onChange={(v) => updateParam('reverbWidth', v)} tone="primary" />
          <Knob label="Level" value={merged.reverbLevel} min={0} max={1} defaultValue={0.9}
            onChange={(v) => updateParam('reverbLevel', v)} tone="primary" />
        </div>
      </div>

      {/* Chorus */}
      <div className={SECTION}>
        <h3 className={HEADING}>Chorus <span className={SONG_WIDE}>(song-wide)</span></h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob label="Voices" value={merged.chorusVoices} min={0} max={99} defaultValue={3}
            onChange={(v) => updateParam('chorusVoices', Math.round(v))} tone="primary" />
          <Knob label="Level" value={merged.chorusLevel} min={0} max={10} defaultValue={2}
            onChange={(v) => updateParam('chorusLevel', v)} tone="primary" />
          <Knob label="Speed" value={merged.chorusSpeed} min={0.1} max={5} defaultValue={0.3}
            onChange={(v) => updateParam('chorusSpeed', v)} tone="primary" unit="Hz" />
          <Knob label="Depth" value={merged.chorusDepth} min={0} max={21} defaultValue={8}
            onChange={(v) => updateParam('chorusDepth', v)} tone="primary" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-mono text-text-muted">Type</span>
            <div className="flex gap-1">
              {['Sine', 'Triangle'].map((label, i) => (
                <Button key={label} size="sm"
                  variant={Math.round(merged.chorusType) === i ? 'primary' : 'default'}
                  onClick={() => updateParam('chorusType', i)}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Master */}
      <div className={SECTION}>
        <h3 className={HEADING}>Master <span className={SONG_WIDE}>(song-wide)</span></h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob label="Gain" value={merged.gain} min={0} max={10} defaultValue={0.4}
            onChange={(v) => updateParam('gain', v)} tone="primary" />
          <Knob label="Polyphony" value={merged.polyphony} min={1} max={256} defaultValue={64}
            onChange={(v) => updateParam('polyphony', Math.round(v))} tone="primary" />
        </div>
      </div>
    </div>
  );
};

export default FluidSynthControls;
