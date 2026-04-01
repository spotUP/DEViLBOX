/**
 * AeolusControls.tsx - Aeolus pipe organ controls
 * Matches AeolusConfig which uses greatStop0-7, swellStop0-7, pedalStop0-4
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
  { key: 'greatStop0', label: "Principal 8'" },
  { key: 'greatStop1', label: "Octave 4'" },
  { key: 'greatStop2', label: "Fifteenth 2'" },
  { key: 'greatStop3', label: 'Mixture' },
  { key: 'greatStop4', label: "Flute 8'" },
  { key: 'greatStop5', label: "Bourdon 16'" },
  { key: 'greatStop6', label: "Trumpet 8'" },
  { key: 'greatStop7', label: "Clarion 4'" },
];

const SWELL_STOPS: StopDef[] = [
  { key: 'swellStop0', label: "Gedackt 8'" },
  { key: 'swellStop1', label: "Salicional 8'" },
  { key: 'swellStop2', label: 'Voix Celeste' },
  { key: 'swellStop3', label: "Oboe 8'" },
  { key: 'swellStop4', label: "Gemshorn 4'" },
  { key: 'swellStop5', label: "Rohrflöte 4'" },
  { key: 'swellStop6', label: "Trompette 8'" },
  { key: 'swellStop7', label: "Clairon 4'" },
];

const PEDAL_STOPS: StopDef[] = [
  { key: 'pedalStop0', label: "Subbass 16'" },
  { key: 'pedalStop1', label: "Principal 8'" },
  { key: 'pedalStop2', label: "Trompete 8'" },
  { key: 'pedalStop3', label: "Octave 4'" },
  { key: 'pedalStop4', label: "Bourdon 8'" },
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

      {/* Couplers */}
      <div className="p-3 rounded-xl border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-2 text-amber-500">Couplers</h3>
        <div className="flex flex-wrap gap-2">
          <StopToggle label="Swell→Great" active={merged.couplerSwellGreat === 1}
            onChange={(on) => updateParam('couplerSwellGreat', on ? 1 : 0)} />
          <StopToggle label="Great→Pedal" active={merged.couplerGreatPedal === 1}
            onChange={(on) => updateParam('couplerGreatPedal', on ? 1 : 0)} />
          <StopToggle label="Swell→Pedal" active={merged.couplerSwellPedal === 1}
            onChange={(on) => updateParam('couplerSwellPedal', on ? 1 : 0)} />
          <StopToggle label="Swell 16'" active={merged.couplerSwellOctave === 1}
            onChange={(on) => updateParam('couplerSwellOctave', on ? 1 : 0)} />
        </div>
      </div>

      {/* Tremulant */}
      <div className="p-3 rounded-xl border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-2 text-amber-500">Tremulant</h3>
        <div className="flex flex-wrap gap-4 items-center justify-center">
          <StopToggle label="Enable" active={merged.tremulantOn === 1}
            onChange={(on) => updateParam('tremulantOn', on ? 1 : 0)} />
          <Knob label="Speed" value={merged.tremulantSpeed ?? 0.5} min={0} max={1} defaultValue={0.5}
            onChange={(v) => updateParam('tremulantSpeed', v)} color="#d4a017" />
          <Knob label="Depth" value={merged.tremulantDepth ?? 0.5} min={0} max={1} defaultValue={0.5}
            onChange={(v) => updateParam('tremulantDepth', v)} color="#d4a017" />
        </div>
      </div>

      {/* Reverb */}
      <div className="p-3 rounded-xl border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-2 text-amber-500">Reverb</h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob label="Amount" value={merged.reverbAmount ?? 0.3} min={0} max={1} defaultValue={0.3}
            onChange={(v) => updateParam('reverbAmount', v)} color="#d4a017" />
          <Knob label="Size" value={merged.reverbSize ?? 0.5} min={0} max={1} defaultValue={0.5}
            onChange={(v) => updateParam('reverbSize', v)} color="#d4a017" />
        </div>
      </div>

      {/* Master */}
      <div className="p-3 rounded-xl border bg-[#1a1a1a] border-amber-900/30">
        <h3 className="font-bold uppercase tracking-tight text-sm mb-2 text-amber-500">Master</h3>
        <div className="flex flex-wrap gap-4 justify-center">
          <Knob label="Volume" value={merged.volume ?? 0.8} min={0} max={1} defaultValue={0.8}
            onChange={(v) => updateParam('volume', v)} color="#d4a017" />
          <Knob label="Tuning" value={merged.tuning ?? 440} min={415} max={466} defaultValue={440}
            onChange={(v) => updateParam('tuning', v)} color="#d4a017" />
          <Knob label="Wind" value={merged.windPressure ?? 0.5} min={0} max={1} defaultValue={0.5}
            onChange={(v) => updateParam('windPressure', v)} color="#d4a017" />
          <Knob label="Swell Expr" value={merged.swellExpression ?? 0.7} min={0} max={1} defaultValue={0.7}
            onChange={(v) => updateParam('swellExpression', v)} color="#d4a017" />
          <Knob label="Great Expr" value={merged.greatExpression ?? 1} min={0} max={1} defaultValue={1}
            onChange={(v) => updateParam('greatExpression', v)} color="#d4a017" />
        </div>
      </div>
    </div>
  );
};

export default AeolusControls;
