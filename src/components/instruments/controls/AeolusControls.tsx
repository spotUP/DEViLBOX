/**
 * AeolusControls.tsx - Aeolus pipe organ controls
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { Knob } from '@components/controls/Knob';
import type { AeolusConfig } from '@/engine/aeolus/AeolusSynth';
import { DEFAULT_AEOLUS } from '@/engine/aeolus/AeolusSynth';

interface AeolusControlsProps {
  config: AeolusConfig;
  onChange: (config: AeolusConfig) => void;
}

type StopDef = { key: keyof AeolusConfig; label: string };

const GREAT_STOPS: StopDef[] = [
  { key: 'greatPrincipal8', label: "Principal 8'" },
  { key: 'greatOctave4', label: "Octave 4'" },
  { key: 'greatFifteenth2', label: "Fifteenth 2'" },
  { key: 'greatMixture', label: 'Mixture' },
  { key: 'greatFlute8', label: "Flute 8'" },
  { key: 'greatBourdon16', label: "Bourdon 16'" },
  { key: 'greatTrumpet8', label: "Trumpet 8'" },
];

const SWELL_STOPS: StopDef[] = [
  { key: 'swellGedackt8', label: "Gedackt 8'" },
  { key: 'swellSalicional8', label: "Salicional 8'" },
  { key: 'swellVoixCeleste', label: 'Voix Celeste' },
  { key: 'swellOboe8', label: "Oboe 8'" },
];

const PEDAL_STOPS: StopDef[] = [
  { key: 'pedalSubbass16', label: "Subbass 16'" },
  { key: 'pedalPrincipal8', label: "Principal 8'" },
  { key: 'pedalTrompete8', label: "Trompete 8'" },
];

const StopToggle: React.FC<{ label: string; active: boolean; onChange: (on: boolean) => void }> = ({ label, active, onChange }) => (
  <button
    className={`px-3 py-1.5 rounded text-xs font-bold uppercase transition-all ${
      active ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40' : 'bg-[#222] text-gray-500 hover:text-gray-300'
    }`}
    onClick={() => onChange(!active)}
  >
    {label}
  </button>
);

const StopBank: React.FC<{
  title: string; stops: StopDef[];
  config: Required<AeolusConfig>;
  onUpdate: (key: keyof AeolusConfig, value: number) => void;
}> = ({ title, stops, config, onUpdate }) => (
  <div className="p-3 rounded-xl border bg-[#1a1a1a] border-amber-900/30">
    <h3 className="font-bold uppercase tracking-tight text-sm mb-2 text-amber-500">{title}</h3>
    <div className="flex flex-wrap gap-2">
      {stops.map(s => (
        <StopToggle key={s.key} label={s.label} active={config[s.key] === 1}
          onChange={(on) => onUpdate(s.key, on ? 1 : 0)} />
      ))}
    </div>
  </div>
);

export const AeolusControls: React.FC<AeolusControlsProps> = ({ config, onChange }) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const updateParam = useCallback((key: keyof AeolusConfig, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  const merged = { ...DEFAULT_AEOLUS, ...config } as Required<AeolusConfig>;

  return (
    <div className="flex flex-col gap-3 p-4 max-w-2xl mx-auto">
      <StopBank title="Great" stops={GREAT_STOPS} config={merged} onUpdate={updateParam} />
      <StopBank title="Swell" stops={SWELL_STOPS} config={merged} onUpdate={updateParam} />
      <StopBank title="Pedal" stops={PEDAL_STOPS} config={merged} onUpdate={updateParam} />

      {/* Tremulant */}
      <div className="p-3 rounded-xl border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-2 text-amber-500">Tremulant</h3>
        <div className="flex flex-wrap gap-4 items-center justify-center">
          <StopToggle label="Enable" active={merged.tremEnable === 1}
            onChange={(on) => updateParam('tremEnable', on ? 1 : 0)} />
          <Knob label="Speed" value={merged.tremSpeed} min={0} max={1} defaultValue={0.33}
            onChange={(v) => updateParam('tremSpeed', v)} size="sm" color="#d4a017" />
          <Knob label="Depth" value={merged.tremDepth} min={0} max={1} defaultValue={0.5}
            onChange={(v) => updateParam('tremDepth', v)} size="sm" color="#d4a017" />
        </div>
      </div>

      {/* Reverb */}
      <div className="p-3 rounded-xl border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-2 text-amber-500">Reverb</h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob label="Amount" value={merged.reverbAmount} min={0} max={1} defaultValue={0.3}
            onChange={(v) => updateParam('reverbAmount', v)} size="sm" color="#d4a017" />
          <Knob label="Time" value={merged.reverbTime} min={0} max={1} defaultValue={0.5}
            onChange={(v) => updateParam('reverbTime', v)} size="sm" color="#d4a017" />
        </div>
      </div>

      {/* Master */}
      <div className="p-3 rounded-xl border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-2 text-amber-500">Master</h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob label="Volume" value={merged.volume} min={0} max={1} defaultValue={0.8}
            onChange={(v) => updateParam('volume', v)} size="sm" color="#d4a017" />
          <Knob label="Tuning" value={merged.tuning} min={0} max={1} defaultValue={0.5}
            onChange={(v) => updateParam('tuning', v)} size="sm" color="#d4a017" />
          <Knob label="Width" value={merged.stereoWidth} min={0} max={1} defaultValue={0.5}
            onChange={(v) => updateParam('stereoWidth', v)} size="sm" color="#d4a017" />
          <Knob label="Swell" value={merged.swellExpression} min={0} max={1} defaultValue={1}
            onChange={(v) => updateParam('swellExpression', v)} size="sm" color="#d4a017" />
          <Knob label="Great" value={merged.greatExpression} min={0} max={1} defaultValue={1}
            onChange={(v) => updateParam('greatExpression', v)} size="sm" color="#d4a017" />
        </div>
      </div>
    </div>
  );
};

export default AeolusControls;
