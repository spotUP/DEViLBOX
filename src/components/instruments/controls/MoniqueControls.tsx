/**
 * MoniqueControls.tsx - Visual UI for Monique Monosynth
 * All 120 parameters organized into groups matching C++ MoniqueParams enum.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { MoniqueConfig } from '@/engine/monique/MoniqueSynth';
import { DEFAULT_MONIQUE } from '@/engine/monique/MoniqueSynth';
import { Knob } from '@components/controls/Knob';

interface MoniqueControlsProps {
  config: MoniqueConfig;
  onChange: (config: MoniqueConfig) => void;
}

const WAVE_NAMES = ['Sine', 'Saw', 'Square', 'Noise'];
const FILTER_TYPE_NAMES: Record<number, string> = {
  1: 'LP', 2: 'HP', 3: 'BP', 4: 'LP+HP', 5: 'LP+BP', 6: 'HP+BP', 7: 'All',
};

/* ---------- Oscillator panel ---------- */
const OscPanel: React.FC<{
  idx: number; merged: MoniqueConfig;
  update: (key: keyof MoniqueConfig, value: number) => void;
}> = ({ idx, merged, update }) => {
  const n = idx + 1;
  const waveKey = `osc${n}Wave` as keyof MoniqueConfig;
  const fmKey = `osc${n}FmPower` as keyof MoniqueConfig;
  const octKey = `osc${n}Octave` as keyof MoniqueConfig;
  const syncKey = `osc${n}Sync` as keyof MoniqueConfig;
  const isSync = ((merged[syncKey] as number) ?? 0) > 0.5;

  return (
    <div className="p-2 rounded bg-[#1a2a1a]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-text-muted font-semibold text-[11px]">OSC {n}</span>
        <button
          className={`px-2 py-0.5 rounded text-[10px] ${isSync ? 'bg-cyan-700 text-white' : 'bg-gray-700 text-text-muted'}`}
          onClick={() => update(syncKey, isSync ? 0 : 1)}
        >{isSync ? 'SYNC' : 'FREE'}</button>
      </div>
      <div className="flex gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-text-muted text-[10px]">Wave</label>
          <select className="bg-dark-bgSecondary text-text-primary border border-dark-border rounded px-1 py-0.5 text-[10px]"
            value={Math.round((merged[waveKey] as number) ?? 0)}
            onChange={(e) => update(waveKey, parseInt(e.target.value))}>
            {WAVE_NAMES.map((name, i) => <option key={i} value={i}>{name}</option>)}
          </select>
        </div>
        <Knob value={(merged[octKey] as number) ?? 0} min={-36} max={36}
          onChange={(v) => update(octKey, Math.round(v))} label="Oct" color="#22d3ee" />
        <Knob value={(merged[fmKey] as number) ?? 0} min={0} max={1}
          onChange={(v) => update(fmKey, v)} label="FM" color="#f59e0b" />
      </div>
    </div>
  );
};

/* ---------- Filter panel ---------- */
const FilterPanel: React.FC<{
  idx: number; merged: MoniqueConfig;
  update: (key: keyof MoniqueConfig, value: number) => void;
}> = ({ idx, merged, update }) => {
  const n = idx + 1;
  const pre = `filter${n}` as const;
  const k = (s: string) => `${pre}${s}` as keyof MoniqueConfig;

  return (
    <div className="p-2 rounded bg-[#1a1a2a]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-text-muted font-semibold text-[11px]">FILTER {n}</span>
        <select className="bg-dark-bgSecondary text-text-primary border border-dark-border rounded px-1 py-0.5 text-[10px]"
          value={Math.round((merged[k('Type')] as number) ?? 1)}
          onChange={(e) => update(k('Type'), parseInt(e.target.value))}>
          {Object.entries(FILTER_TYPE_NAMES).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 flex-wrap items-end">
        <Knob value={(merged[k('Cutoff')] as number) ?? 0.2} min={0} max={1}
          onChange={(v) => update(k('Cutoff'), v)} label="Cutoff" color="#a855f7" />
        <Knob value={(merged[k('Resonance')] as number) ?? 0.3} min={0} max={1}
          onChange={(v) => update(k('Resonance'), v)} label="Reso" color="#a855f7" />
        <Knob value={(merged[k('Distortion')] as number) ?? 0} min={0} max={1}
          onChange={(v) => update(k('Distortion'), v)} label="Dist" color="#ef4444" />
        <Knob value={(merged[k('Output')] as number) ?? 0} min={0} max={1}
          onChange={(v) => update(k('Output'), v)} label="Out" color="#22c55e" />
        <Knob value={(merged[k('Pan')] as number) ?? 0} min={-1} max={1}
          onChange={(v) => update(k('Pan'), v)} label="Pan" color="#6366f1" />
        <Knob value={(merged[k('ModMix')] as number) ?? 0} min={-1} max={1}
          onChange={(v) => update(k('ModMix'), v)} label="Env/LFO" color="#e879f9" />
        <Knob value={(merged[k('Input0')] as number) ?? 0} min={0} max={1}
          onChange={(v) => update(k('Input0'), v)} label="In 1" color="#64748b" />
        <Knob value={(merged[k('Input1')] as number) ?? 0} min={0} max={1}
          onChange={(v) => update(k('Input1'), v)} label="In 2" color="#64748b" />
        <Knob value={(merged[k('Input2')] as number) ?? 0} min={0} max={1}
          onChange={(v) => update(k('Input2'), v)} label="In 3" color="#64748b" />
      </div>
    </div>
  );
};

/* ---------- Envelope panel ---------- */
const EnvPanel: React.FC<{
  idx: number; label: string; merged: MoniqueConfig;
  update: (key: keyof MoniqueConfig, value: number) => void;
}> = ({ idx, label, merged, update }) => {
  const n = idx + 1;
  const pre = `env${n}` as const;
  const k = (s: string) => `${pre}${s}` as keyof MoniqueConfig;

  return (
    <div className="p-2 rounded bg-[#1a1a1a]">
      <span className="text-text-muted font-semibold text-[11px] mb-1 block">{label}</span>
      <div className="flex gap-2 flex-wrap items-end">
        <Knob value={(merged[k('Attack')] as number) ?? 0.05} min={0} max={1}
          onChange={(v) => update(k('Attack'), v)} label="A" color="#ef4444" />
        <Knob value={(merged[k('Decay')] as number) ?? 0.02} min={0} max={1}
          onChange={(v) => update(k('Decay'), v)} label="D" color="#f59e0b" />
        <Knob value={(merged[k('Sustain')] as number) ?? 0.9} min={0} max={1}
          onChange={(v) => update(k('Sustain'), v)} label="S" color="#22c55e" />
        <Knob value={(merged[k('SusTime')] as number) ?? 1} min={0} max={1}
          onChange={(v) => update(k('SusTime'), v)} label="S.Time" color="#14b8a6" />
        <Knob value={(merged[k('Release')] as number) ?? 0.2} min={0} max={1}
          onChange={(v) => update(k('Release'), v)} label="R" color="#3b82f6" />
        <Knob value={(merged[k('Shape')] as number) ?? 0} min={-1} max={1}
          onChange={(v) => update(k('Shape'), v)} label="Shp" color="#8b5cf6" />
      </div>
    </div>
  );
};

/* ---------- LFO panel ---------- */
const LfoPanel: React.FC<{
  idx: number; prefix: string; merged: MoniqueConfig;
  update: (key: keyof MoniqueConfig, value: number) => void;
}> = ({ idx, prefix, merged, update }) => {
  const n = idx + 1;
  const pre = `${prefix}${n}` as const;
  const k = (s: string) => `${pre}${s}` as keyof MoniqueConfig;

  return (
    <div className="p-2 rounded bg-[#1a1a1a]">
      <span className="text-text-muted font-semibold text-[11px] mb-1 block">{prefix.toUpperCase()} {n}</span>
      <div className="flex gap-2 items-end">
        <Knob value={(merged[k('Speed')] as number) ?? 4} min={0} max={16}
          onChange={(v) => update(k('Speed'), Math.round(v))} label="Spd" color="#f97316" />
        <Knob value={(merged[k('Wave')] as number) ?? 0} min={0} max={1}
          onChange={(v) => update(k('Wave'), v)} label="Wave" color="#14b8a6" />
        <Knob value={(merged[k('Phase')] as number) ?? 0} min={0} max={1}
          onChange={(v) => update(k('Phase'), v)} label="Phase" color="#a78bfa" />
      </div>
    </div>
  );
};

/* ---------- Main controls ---------- */
export const MoniqueControls: React.FC<MoniqueControlsProps> = ({ config, onChange }) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const updateParam = useCallback((key: keyof MoniqueConfig, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  const merged = { ...DEFAULT_MONIQUE, ...config } as Required<MoniqueConfig>;

  return (
    <div className="p-4 space-y-4 text-xs">
      {/* Oscillators */}
      <div>
        <h3 className="text-text-muted font-semibold mb-2 border-b border-dark-border pb-1">Oscillators</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[0, 1, 2].map(i => <OscPanel key={i} idx={i} merged={merged} update={updateParam} />)}
        </div>
        <div className="flex gap-3 mt-2 items-end">
          <Knob value={merged.fmFreq ?? 0} min={0} max={1}
            onChange={(v) => updateParam('fmFreq', v)} label="FM Freq" color="#f59e0b" />
          <Knob value={merged.fmShape ?? 0} min={0} max={1}
            onChange={(v) => updateParam('fmShape', v)} label="FM Shape" color="#f59e0b" />
          <Knob value={merged.fmSwing ?? 0} min={0} max={1}
            onChange={(v) => updateParam('fmSwing', v)} label="FM Swing" color="#f59e0b" />
          <Knob value={merged.masterShift ?? 0} min={0} max={1}
            onChange={(v) => updateParam('masterShift', v)} label="Shift" color="#64748b" />
        </div>
      </div>

      {/* Filters */}
      <div>
        <h3 className="text-text-muted font-semibold mb-2 border-b border-dark-border pb-1">Filters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[0, 1, 2].map(i => <FilterPanel key={i} idx={i} merged={merged} update={updateParam} />)}
        </div>
      </div>

      {/* Envelopes */}
      <div>
        <h3 className="text-text-muted font-semibold mb-2 border-b border-dark-border pb-1">Envelopes</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <EnvPanel idx={0} label="ENV 1 (Filter 1)" merged={merged} update={updateParam} />
          <EnvPanel idx={1} label="ENV 2 (Filter 2)" merged={merged} update={updateParam} />
          <EnvPanel idx={2} label="ENV 3 (Filter 3)" merged={merged} update={updateParam} />
          <EnvPanel idx={3} label="ENV 4 (Main)" merged={merged} update={updateParam} />
        </div>
      </div>

      {/* LFOs */}
      <div>
        <h3 className="text-text-muted font-semibold mb-2 border-b border-dark-border pb-1">LFOs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[0, 1, 2].map(i => <LfoPanel key={i} idx={i} prefix="lfo" merged={merged} update={updateParam} />)}
        </div>
      </div>

      {/* MFOs */}
      <div>
        <h3 className="text-text-muted font-semibold mb-2 border-b border-dark-border pb-1">MFOs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          {[0, 1, 2, 3].map(i => <LfoPanel key={i} idx={i} prefix="mfo" merged={merged} update={updateParam} />)}
        </div>
      </div>

      {/* Effects */}
      <div>
        <h3 className="text-text-muted font-semibold mb-2 border-b border-dark-border pb-1">Effects</h3>
        <div className="flex gap-3 flex-wrap items-end">
          <Knob value={merged.distortion ?? 0} min={0} max={1}
            onChange={(v) => updateParam('distortion', v)} label="Dist" color="#ef4444" />
          <Knob value={merged.shape ?? 0} min={0} max={1}
            onChange={(v) => updateParam('shape', v)} label="Shape" color="#ef4444" />
          <Knob value={merged.reverbRoom ?? 0.333} min={0} max={1}
            onChange={(v) => updateParam('reverbRoom', v)} label="Rev Room" color="#7c3aed" />
          <Knob value={merged.reverbMix ?? 0} min={0} max={1}
            onChange={(v) => updateParam('reverbMix', v)} label="Rev Mix" color="#7c3aed" />
          <Knob value={merged.chorusMod ?? 0} min={0} max={1}
            onChange={(v) => updateParam('chorusMod', v)} label="Chorus" color="#2563eb" />
          <Knob value={merged.delay ?? 0} min={0} max={1}
            onChange={(v) => updateParam('delay', v)} label="Delay" color="#0891b2" />
          <Knob value={merged.delayPan ?? 0} min={0} max={1}
            onChange={(v) => updateParam('delayPan', v)} label="Dly Pan" color="#0891b2" />
          <button
            className={`px-2 py-1 rounded text-[10px] ${(merged.eqBypass ?? 1) > 0.5 ? 'bg-green-700 text-white' : 'bg-red-700 text-white'}`}
            onClick={() => updateParam('eqBypass', (merged.eqBypass ?? 1) > 0.5 ? 0 : 1)}
          >{(merged.eqBypass ?? 1) > 0.5 ? 'EQ ON' : 'EQ OFF'}</button>
          <button
            className={`px-2 py-1 rounded text-[10px] ${(merged.effectBypass ?? 1) > 0.5 ? 'bg-green-700 text-white' : 'bg-red-700 text-white'}`}
            onClick={() => updateParam('effectBypass', (merged.effectBypass ?? 1) > 0.5 ? 0 : 1)}
          >{(merged.effectBypass ?? 1) > 0.5 ? 'FX ON' : 'FX OFF'}</button>
        </div>
      </div>

      {/* Master */}
      <div>
        <h3 className="text-text-muted font-semibold mb-2 border-b border-dark-border pb-1">Master</h3>
        <div className="flex gap-3 flex-wrap items-end">
          <Knob value={merged.volume ?? 0.9} min={0} max={1}
            onChange={(v) => updateParam('volume', v)} label="Volume" color="#22c55e" />
          <Knob value={merged.glide ?? 0.05} min={0} max={1}
            onChange={(v) => updateParam('glide', v)} label="Glide" color="#3b82f6" />
          <Knob value={merged.octaveOffset ?? 0} min={-2} max={2}
            onChange={(v) => updateParam('octaveOffset', Math.round(v))} label="Oct" color="#a78bfa" />
          <Knob value={merged.noteOffset ?? 0} min={0} max={12}
            onChange={(v) => updateParam('noteOffset', Math.round(v))} label="Note" color="#a78bfa" />
          <button
            className={`px-2 py-1 rounded text-[10px] ${(merged.sync ?? 1) > 0.5 ? 'bg-cyan-700 text-white' : 'bg-gray-700 text-text-muted'}`}
            onClick={() => updateParam('sync', (merged.sync ?? 1) > 0.5 ? 0 : 1)}
          >{(merged.sync ?? 1) > 0.5 ? 'SYNC ON' : 'SYNC OFF'}</button>
        </div>
      </div>
    </div>
  );
};

export default MoniqueControls;
