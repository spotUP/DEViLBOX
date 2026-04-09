/**
 * RaffoSynthControls.tsx - Visual UI for Raffo Minimoog clone
 * 32 parameters organized into oscillator/filter/envelope groups.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { RaffoSynthConfig } from '@/engine/raffo/RaffoSynth';
import { DEFAULT_RAFFO, RAFFO_PARAM_NAMES } from '@/engine/raffo/RaffoSynth';
import { CustomSelect } from '@components/common/CustomSelect';

interface RaffoSynthControlsProps {
  config: Partial<RaffoSynthConfig>;
  onChange: (updates: Partial<RaffoSynthConfig>) => void;
}

const WAVEFORM_NAMES = ['Saw', 'Triangle', 'Square', 'Pulse', 'Off'];
const RANGE_NAMES: Record<number, string> = { 1: "32'", 2: "16'", 3: "8'", 4: "4'", 5: "2'", 6: "1'" };

const CONFIG_KEYS: (keyof RaffoSynthConfig)[] = [
  'volume', 'wave0', 'wave1', 'wave2', 'wave3',
  'range0', 'range1', 'range2', 'range3',
  'vol0', 'vol1', 'vol2', 'vol3',
  'attack', 'decay', 'sustain', 'release',
  'filterCutoff', 'filterAttack', 'filterDecay', 'filterSustain',
  'glide', 'oscButton0', 'oscButton1', 'oscButton2', 'oscButton3',
  'filterResonance', 'tuning0', 'tuning1', 'tuning2', 'tuning3',
  'filterRelease',
];

const OscGroup: React.FC<{
  idx: number; merged: RaffoSynthConfig;
  update: (key: keyof RaffoSynthConfig, value: number) => void;
}> = ({ idx, merged, update }) => {
  const waveKey = `wave${idx}` as keyof RaffoSynthConfig;
  const rangeKey = `range${idx}` as keyof RaffoSynthConfig;
  const volKey = `vol${idx}` as keyof RaffoSynthConfig;
  const btnKey = `oscButton${idx}` as keyof RaffoSynthConfig;
  const tuneKey = `tuning${idx}` as keyof RaffoSynthConfig;

  const isOn = (merged[btnKey] ?? 1) > 0;

  return (
    <div className={`p-2 rounded ${isOn ? 'bg-[#1a2a1a]' : 'bg-[#1a1a1a] opacity-50'}`}>
      <div className="flex items-center gap-2 mb-2">
        <button
          className={`px-2 py-0.5 rounded text-[10px] ${isOn ? 'bg-green-700 text-white' : 'bg-gray-700 text-text-muted'}`}
          onClick={() => update(btnKey, isOn ? 0 : 1)}
        >{isOn ? 'ON' : 'OFF'}</button>
        <span className="text-text-muted font-semibold">OSC {idx + 1}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-text-muted text-[10px]">Waveform</label>
          <CustomSelect
            className="bg-dark-bgSecondary text-text-primary border border-dark-border rounded px-1 py-0.5 text-[10px]"
            value={String(Math.round(merged[waveKey] as number ?? 0))}
            onChange={(v) => update(waveKey, parseInt(v))}
            options={WAVEFORM_NAMES.map((n, i) => ({ value: String(i), label: n }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-text-muted text-[10px]">Range</label>
          <CustomSelect
            className="bg-dark-bgSecondary text-text-primary border border-dark-border rounded px-1 py-0.5 text-[10px]"
            value={String(Math.round(merged[rangeKey] as number ?? 2))}
            onChange={(v) => update(rangeKey, parseInt(v))}
            options={[1, 2, 3, 4, 5, 6].map(r => ({ value: String(r), label: RANGE_NAMES[r] }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-text-muted text-[10px]">Volume</label>
          <input type="range" min={0} max={10} step={0.1} value={merged[volKey] as number ?? 5}
            onChange={(e) => update(volKey, parseFloat(e.target.value))}
            className="w-full accent-green-500 h-2" />
        </div>
      </div>
      <div className="mt-1">
        <label className="text-text-muted text-[10px]">Tuning</label>
        <input type="range" min={-12} max={12} step={0.01} value={merged[tuneKey] as number ?? 0}
          onChange={(e) => update(tuneKey, parseFloat(e.target.value))}
          className="w-full accent-yellow-500 h-2" />
        <span className="text-text-muted text-[10px]">{((merged[tuneKey] as number) ?? 0).toFixed(2)} semi</span>
      </div>
    </div>
  );
};

export const RaffoSynthControls: React.FC<RaffoSynthControlsProps> = ({ config, onChange }) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const updateParam = useCallback((key: keyof RaffoSynthConfig, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  const merged = { ...DEFAULT_RAFFO, ...config } as RaffoSynthConfig;

  return (
    <div className="p-4 space-y-4 text-xs">
      {/* Oscillators */}
      <div>
        <h3 className="text-text-muted font-semibold mb-2 border-b border-dark-border pb-1">Oscillators</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[0, 1, 2, 3].map(i => <OscGroup key={i} idx={i} merged={merged} update={updateParam} />)}
        </div>
      </div>

      {/* Master */}
      <div>
        <h3 className="text-text-muted font-semibold mb-2 border-b border-dark-border pb-1">Master</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-text-muted text-[10px]">Volume</label>
            <input type="range" min={0} max={10} step={0.1} value={merged.volume ?? 7}
              onChange={(e) => updateParam('volume', parseFloat(e.target.value))}
              className="w-full accent-green-500 h-2" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-text-muted text-[10px]">Glide</label>
            <input type="range" min={0} max={10} step={0.1} value={merged.glide ?? 1}
              onChange={(e) => updateParam('glide', parseFloat(e.target.value))}
              className="w-full accent-blue-500 h-2" />
          </div>
        </div>
      </div>

      {/* Amp Envelope */}
      <div>
        <h3 className="text-text-muted font-semibold mb-2 border-b border-dark-border pb-1">Amp Envelope</h3>
        <div className="grid grid-cols-4 gap-2">
          {(['attack', 'decay', 'sustain', 'release'] as (keyof RaffoSynthConfig)[]).map(k => (
            <div key={k} className="flex flex-col gap-1">
              <label className="text-text-muted text-[10px]">{RAFFO_PARAM_NAMES[CONFIG_KEYS.indexOf(k)]}</label>
              <input type="range" min={k === 'sustain' || k === 'release' ? 0 : 0} max={k === 'sustain' || k === 'release' ? 1 : 1000}
                step={k === 'sustain' || k === 'release' ? 0.01 : 1} value={merged[k] as number ?? 0}
                onChange={(e) => updateParam(k, parseFloat(e.target.value))}
                className="w-full accent-red-500 h-2" />
            </div>
          ))}
        </div>
      </div>

      {/* Filter */}
      <div>
        <h3 className="text-text-muted font-semibold mb-2 border-b border-dark-border pb-1">Filter</h3>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-text-muted text-[10px]">Cutoff</label>
            <input type="range" min={500} max={10000} step={10} value={merged.filterCutoff ?? 3000}
              onChange={(e) => updateParam('filterCutoff', parseFloat(e.target.value))}
              className="w-full accent-purple-500 h-2" />
            <span className="text-text-muted text-[10px]">{Math.round(merged.filterCutoff ?? 3000)} Hz</span>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-text-muted text-[10px]">Resonance</label>
            <input type="range" min={0} max={10} step={0.1} value={merged.filterResonance ?? 3}
              onChange={(e) => updateParam('filterResonance', parseFloat(e.target.value))}
              className="w-full accent-purple-500 h-2" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-text-muted text-[10px]">Filter Release</label>
            <input type="range" min={0} max={1} step={0.01} value={merged.filterRelease ?? 0.5}
              onChange={(e) => updateParam('filterRelease', parseFloat(e.target.value))}
              className="w-full accent-purple-500 h-2" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-2">
          {(['filterAttack', 'filterDecay', 'filterSustain'] as (keyof RaffoSynthConfig)[]).map(k => (
            <div key={k} className="flex flex-col gap-1">
              <label className="text-text-muted text-[10px]">{RAFFO_PARAM_NAMES[CONFIG_KEYS.indexOf(k)]}</label>
              <input type="range" min={k === 'filterSustain' ? 0 : 0} max={k === 'filterSustain' ? 1 : 1000}
                step={k === 'filterSustain' ? 0.01 : 1} value={merged[k] as number ?? 0}
                onChange={(e) => updateParam(k, parseFloat(e.target.value))}
                className="w-full accent-purple-500 h-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
