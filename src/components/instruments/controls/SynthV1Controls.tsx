/**
 * SynthV1Controls.tsx — Tabbed UI for SynthV1 dual-page polyphonic synth
 *
 * Tabs: Synth 1 | Synth 2 | Effects
 * Each synth page has DCO, DCF, DCA, and LFO sections.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Knob } from '@components/controls/Knob';
import { SelectControl } from '@components/instruments/shared';
import { CustomSelect } from '@components/common/CustomSelect';
import type { SynthV1Config } from '@/engine/synthv1/SynthV1Synth';
import {
  DEFAULT_SYNTHV1,
  DCO_SHAPE_NAMES,
  DCF_TYPE_NAMES,
  LFO_SHAPE_NAMES,
} from '@/engine/synthv1/SynthV1Synth';

interface SynthV1ControlsProps {
  config: SynthV1Config;
  onChange: (config: SynthV1Config) => void;
}

type SV1Tab = 'synth1' | 'synth2' | 'effects';

const OCTAVE_OPTIONS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

/** Helper: builds a page-specific config key from prefix + page number */
const pk = (section: string, field: string, page: 1 | 2): keyof SynthV1Config =>
  `${section}${page}${field}` as unknown as keyof SynthV1Config;

/** Reusable section header */
const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <h3 className="text-text-muted font-semibold mb-2 border-b border-dark-border pb-1 text-xs uppercase tracking-wider">
    {title}
  </h3>
);


/** Reusable ADSR knob row */
const ADSRRow: React.FC<{
  a: number; d: number; s: number; r: number;
  onA: (v: number) => void; onD: (v: number) => void;
  onS: (v: number) => void; onR: (v: number) => void;
  color?: string;
}> = ({ a, d, s, r, onA, onD, onS, onR, color = '#ef4444' }) => (
  <div className="grid grid-cols-4 gap-3">
    <Knob value={a} min={0} max={1} onChange={onA} label="Attack" color={color} />
    <Knob value={d} min={0} max={1} onChange={onD} label="Decay" color={color} />
    <Knob value={s} min={0} max={1} onChange={onS} label="Sustain" color={color} />
    <Knob value={r} min={0} max={1} onChange={onR} label="Release" color={color} />
  </div>
);

export const SynthV1Controls: React.FC<SynthV1ControlsProps> = ({ config, onChange }) => {
  const [activeTab, setActiveTab] = useState<SV1Tab>('synth1');
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const update = useCallback((key: keyof SynthV1Config, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  const merged = { ...DEFAULT_SYNTHV1, ...config };

  // Generic page key helpers for page 1 or 2
  const dcoK = (name: string, p: 1 | 2) => `dco${p}${name}` as keyof SynthV1Config;
  const dcfK = (name: string, p: 1 | 2) => `dcf${p}${name}` as keyof SynthV1Config;
  const dcaK = (name: string, p: 1 | 2) => `dca${p}${name}` as keyof SynthV1Config;
  const lfoK = (name: string, p: 1 | 2) => `lfo${p}${name}` as keyof SynthV1Config;

  const renderSynthPage = (page: 1 | 2) => (
    <div className="grid grid-cols-4 gap-2 p-2">
      {/* DCO — Oscillators */}
      <div className="p-3 rounded bg-[#1a2a1a]">
        <SectionHeader title={`DCO ${page} — Oscillators`} />
        <div className="grid grid-cols-2 gap-4 mb-3">
          {/* Oscillator 1 */}
          <div className="flex flex-col gap-2">
            <span className="text-text-muted text-[10px] font-semibold">Osc A</span>
            <Knob value={merged[dcoK('Width1', page)] as number} min={0} max={1}
              onChange={(v) => update(dcoK('Width1', page), v)}
              label="Width" color="#22c55e" />
            <SelectControl
              label="Shape" value={merged[dcoK('Shape1', page)] as number}
              options={DCO_SHAPE_NAMES} onChange={(v) => update(dcoK('Shape1', page), v)}
            />
          </div>
          {/* Oscillator 2 */}
          <div className="flex flex-col gap-2">
            <span className="text-text-muted text-[10px] font-semibold">Osc B</span>
            <Knob value={merged[dcoK('Width2', page)] as number} min={0} max={1}
              onChange={(v) => update(dcoK('Width2', page), v)}
              label="Width" color="#22c55e" />
            <SelectControl
              label="Shape" value={merged[dcoK('Shape2', page)] as number}
              options={DCO_SHAPE_NAMES} onChange={(v) => update(dcoK('Shape2', page), v)}
            />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <Knob value={merged[dcoK('Tuning', page)] as number} min={-1} max={1}
            onChange={(v) => update(dcoK('Tuning', page), v)}
            label="Tune" color="#eab308" bipolar />
          <Knob value={merged[dcoK('Glide', page)] as number} min={0} max={1}
            onChange={(v) => update(dcoK('Glide', page), v)}
            label="Glide" color="#3b82f6" />
          <Knob value={merged[dcoK('Detune', page)] as number} min={0} max={1}
            onChange={(v) => update(dcoK('Detune', page), v)}
            label="Detune" color="#eab308" />
          <div className="flex flex-col gap-1">
            <label className="text-text-muted text-[10px]">Octave</label>
            <CustomSelect
              className="bg-dark-bgSecondary text-text-primary border border-dark-border rounded px-1 py-0.5 text-[10px]"
              value={String(Math.round(merged[dcoK('Octave', page)] as number))}
              onChange={(v) => update(dcoK('Octave', page), parseInt(v))}
              options={OCTAVE_OPTIONS.map(o => ({ value: String(o), label: o > 0 ? `+${o}` : String(o) }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Knob value={merged[dcoK('Balance', page)] as number} min={-1} max={1}
            onChange={(v) => update(dcoK('Balance', page), v)}
            label="Balance" color="#a855f7" bipolar />
          <Knob value={merged[dcoK('RingMod', page)] as number} min={0} max={1}
            onChange={(v) => update(dcoK('RingMod', page), v)}
            label="Ring Mod" color="#f97316" />
          <Knob value={merged[dcoK('Phase', page)] as number} min={0} max={1}
            onChange={(v) => update(dcoK('Phase', page), v)}
            label="Phase" color="#6366f1" />
          <Knob value={merged[dcoK('Panning', page)] as number} min={-1} max={1}
            onChange={(v) => update(dcoK('Panning', page), v)}
            label="Pan" color="#14b8a6" bipolar />
        </div>
        <div className="grid grid-cols-4 gap-3 mt-2">
          <div className="flex items-center gap-2">
            <label className="text-text-muted text-[10px]">Sync</label>
            <button
              className={`px-2 py-0.5 rounded text-[10px] ${(merged[dcoK('Sync', page)] as number) > 0.5 ? 'bg-green-700 text-white' : 'bg-gray-700 text-text-muted'}`}
              onClick={() => update(dcoK('Sync', page), (merged[dcoK('Sync', page)] as number) > 0.5 ? 0 : 1)}
            >{(merged[dcoK('Sync', page)] as number) > 0.5 ? 'ON' : 'OFF'}</button>
          </div>
        </div>
      </div>

      {/* DCF — Filter */}
      <div className="p-3 rounded bg-[#1a1a2a]">
        <SectionHeader title={`DCF ${page} — Filter`} />
        <div className="grid grid-cols-4 gap-3 mb-3">
          <Knob value={merged[dcfK('Cutoff', page)] as number} min={0} max={1}
            onChange={(v) => update(dcfK('Cutoff', page), v)}
            label="Cutoff" color="#a855f7" />
          <Knob value={merged[dcfK('Reso', page)] as number} min={0} max={1}
            onChange={(v) => update(dcfK('Reso', page), v)}
            label="Reso" color="#a855f7" />
          <Knob value={merged[dcfK('Envelope', page)] as number} min={0} max={1}
            onChange={(v) => update(dcfK('Envelope', page), v)}
            label="Env Amt" color="#a855f7" />
          <Knob value={merged[dcfK('KeyFollow', page)] as number} min={0} max={1}
            onChange={(v) => update(dcfK('KeyFollow', page), v)}
            label="Key Follow" color="#a855f7" />
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <SelectControl
            label="Type" value={merged[dcfK('Type', page)] as number}
            options={DCF_TYPE_NAMES} onChange={(v) => update(dcfK('Type', page), v)}
          />
          <div className="flex flex-col gap-1">
            <label className="text-text-muted text-[10px]">Slope</label>
            <CustomSelect
              className="bg-dark-bgSecondary text-text-primary border border-dark-border rounded px-1 py-0.5 text-[10px]"
              value={String(Math.round(merged[dcfK('Slope', page)] as number))}
              onChange={(v) => update(dcfK('Slope', page), parseInt(v))}
              options={[
                { value: '0', label: '12 dB' },
                { value: '1', label: '24 dB' },
              ]}
            />
          </div>
        </div>
        <ADSRRow
          a={merged[dcfK('Attack', page)] as number} d={merged[dcfK('Decay', page)] as number}
          s={merged[dcfK('Sustain', page)] as number} r={merged[dcfK('Release', page)] as number}
          onA={(v) => update(dcfK('Attack', page), v)} onD={(v) => update(dcfK('Decay', page), v)}
          onS={(v) => update(dcfK('Sustain', page), v)} onR={(v) => update(dcfK('Release', page), v)}
          color="#a855f7"
        />
      </div>

      {/* DCA — Amplifier */}
      <div className="p-3 rounded bg-[#2a1a1a]">
        <SectionHeader title={`DCA ${page} — Amplifier`} />
        <div className="grid grid-cols-4 gap-3 mb-3">
          <Knob value={merged[dcaK('Volume', page)] as number} min={0} max={1}
            onChange={(v) => update(dcaK('Volume', page), v)}
            label="Volume" color="#ef4444" />
          <Knob value={merged[pk('dco', 'Velocity', page)] as number} min={0} max={1}
            onChange={(v) => update(pk('dco', 'Velocity', page), v)}
            label="DCO Vel" color="#ef4444" />
          <Knob value={merged[pk('dca', 'Velocity', page)] as number} min={0} max={1}
            onChange={(v) => update(pk('dca', 'Velocity', page), v)}
            label="DCA Vel" color="#ef4444" />
        </div>
        <ADSRRow
          a={merged[dcaK('Attack', page)] as number} d={merged[dcaK('Decay', page)] as number}
          s={merged[dcaK('Sustain', page)] as number} r={merged[dcaK('Release', page)] as number}
          onA={(v) => update(dcaK('Attack', page), v)} onD={(v) => update(dcaK('Decay', page), v)}
          onS={(v) => update(dcaK('Sustain', page), v)} onR={(v) => update(dcaK('Release', page), v)}
          color="#ef4444"
        />
      </div>

      {/* LFO */}
      <div className="p-3 rounded bg-[#1a1a1a]">
        <SectionHeader title={`LFO ${page}`} />
        <div className="grid grid-cols-4 gap-3 mb-3">
          <Knob value={merged[lfoK('Bpm', page)] as number} min={0} max={1}
            onChange={(v) => update(lfoK('Bpm', page), v)}
            label="Rate" color="#f59e0b" />
          <Knob value={merged[lfoK('Width', page)] as number} min={0} max={1}
            onChange={(v) => update(lfoK('Width', page), v)}
            label="Width" color="#f59e0b" />
          <SelectControl
            label="Shape" value={merged[lfoK('Shape', page)] as number}
            options={LFO_SHAPE_NAMES} onChange={(v) => update(lfoK('Shape', page), v)}
          />
        </div>
        <div className="grid grid-cols-5 gap-3">
          <Knob value={merged[lfoK('Pitch', page)] as number} min={0} max={1}
            onChange={(v) => update(lfoK('Pitch', page), v)}
            label="Pitch" color="#f59e0b" />
          <Knob value={merged[lfoK('Cutoff', page)] as number} min={0} max={1}
            onChange={(v) => update(lfoK('Cutoff', page), v)}
            label="Cutoff" color="#f59e0b" />
          <Knob value={merged[lfoK('Reso', page)] as number} min={0} max={1}
            onChange={(v) => update(lfoK('Reso', page), v)}
            label="Reso" color="#f59e0b" />
          <Knob value={merged[lfoK('Panning', page)] as number} min={0} max={1}
            onChange={(v) => update(lfoK('Panning', page), v)}
            label="Pan" color="#f59e0b" />
          <Knob value={merged[lfoK('Volume', page)] as number} min={0} max={1}
            onChange={(v) => update(lfoK('Volume', page), v)}
            label="Volume" color="#f59e0b" />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <label className="text-text-muted text-[10px]">Sync</label>
          <button
            className={`px-2 py-0.5 rounded text-[10px] ${(merged[lfoK('Sync', page)] as number) > 0.5 ? 'bg-green-700 text-white' : 'bg-gray-700 text-text-muted'}`}
            onClick={() => update(lfoK('Sync', page), (merged[lfoK('Sync', page)] as number) > 0.5 ? 0 : 1)}
          >{(merged[lfoK('Sync', page)] as number) > 0.5 ? 'ON' : 'OFF'}</button>
        </div>
      </div>

      {/* Filter Velocity */}
      <div className="p-3 rounded bg-[#1a1a1a]">
        <div className="grid grid-cols-1 gap-3">
          <Knob value={merged[pk('dcf', 'Velocity', page)] as number} min={0} max={1}
            onChange={(v) => update(pk('dcf', 'Velocity', page), v)}
            label="DCF Velocity" color="#64748b" />
        </div>
      </div>
    </div>
  );

  const renderEffects = () => (
    <div className="grid grid-cols-4 gap-2 p-2">
      {/* Chorus */}
      <div className="p-3 rounded bg-[#1a1a2a]">
        <SectionHeader title="Chorus" />
        <div className="grid grid-cols-5 gap-3">
          <Knob value={merged.chorusWet} min={0} max={1}
            onChange={(v) => update('chorusWet', v)} label="Wet" color="#06b6d4" />
          <Knob value={merged.chorusDelay} min={0} max={1}
            onChange={(v) => update('chorusDelay', v)} label="Delay" color="#06b6d4" />
          <Knob value={merged.chorusFeedback} min={-1} max={1}
            onChange={(v) => update('chorusFeedback', v)} label="Feedback" color="#06b6d4" bipolar />
          <Knob value={merged.chorusRate} min={0} max={1}
            onChange={(v) => update('chorusRate', v)} label="Rate" color="#06b6d4" />
          <Knob value={merged.chorusMod} min={0} max={1}
            onChange={(v) => update('chorusMod', v)} label="Mod" color="#06b6d4" />
        </div>
      </div>

      {/* Flanger */}
      <div className="p-3 rounded bg-[#1a2a1a]">
        <SectionHeader title="Flanger" />
        <div className="grid grid-cols-4 gap-3">
          <Knob value={merged.flangerWet} min={0} max={1}
            onChange={(v) => update('flangerWet', v)} label="Wet" color="#22c55e" />
          <Knob value={merged.flangerDelay} min={0} max={1}
            onChange={(v) => update('flangerDelay', v)} label="Delay" color="#22c55e" />
          <Knob value={merged.flangerFeedback} min={-1} max={1}
            onChange={(v) => update('flangerFeedback', v)} label="Feedback" color="#22c55e" bipolar />
          <Knob value={merged.flangerDaft} min={0} max={1}
            onChange={(v) => update('flangerDaft', v)} label="Daft" color="#22c55e" />
        </div>
      </div>

      {/* Phaser */}
      <div className="p-3 rounded bg-[#2a1a2a]">
        <SectionHeader title="Phaser" />
        <div className="grid grid-cols-5 gap-3">
          <Knob value={merged.phaserWet} min={0} max={1}
            onChange={(v) => update('phaserWet', v)} label="Wet" color="#d946ef" />
          <Knob value={merged.phaserRate} min={0} max={1}
            onChange={(v) => update('phaserRate', v)} label="Rate" color="#d946ef" />
          <Knob value={merged.phaserFeedback} min={-1} max={1}
            onChange={(v) => update('phaserFeedback', v)} label="Feedback" color="#d946ef" bipolar />
          <Knob value={merged.phaserDepth} min={0} max={1}
            onChange={(v) => update('phaserDepth', v)} label="Depth" color="#d946ef" />
          <Knob value={merged.phaserDaft} min={0} max={1}
            onChange={(v) => update('phaserDaft', v)} label="Daft" color="#d946ef" />
        </div>
      </div>

      {/* Delay */}
      <div className="p-3 rounded bg-[#1a1a1a]">
        <SectionHeader title="Delay" />
        <div className="grid grid-cols-4 gap-3">
          <Knob value={merged.delayWet} min={0} max={1}
            onChange={(v) => update('delayWet', v)} label="Wet" color="#f59e0b" />
          <Knob value={merged.delayDelay} min={0} max={1}
            onChange={(v) => update('delayDelay', v)} label="Time" color="#f59e0b" />
          <Knob value={merged.delayFeedback} min={-1} max={1}
            onChange={(v) => update('delayFeedback', v)} label="Feedback" color="#f59e0b" bipolar />
          <Knob value={merged.delayBpm} min={0} max={1}
            onChange={(v) => update('delayBpm', v)} label="BPM Sync" color="#f59e0b" />
        </div>
      </div>

      {/* Reverb */}
      <div className="p-3 rounded bg-[#2a1a1a]">
        <SectionHeader title="Reverb" />
        <div className="grid grid-cols-4 gap-3">
          <Knob value={merged.reverbWet} min={0} max={1}
            onChange={(v) => update('reverbWet', v)} label="Wet" color="#ef4444" />
          <Knob value={merged.reverbRoom} min={0} max={1}
            onChange={(v) => update('reverbRoom', v)} label="Room" color="#ef4444" />
        </div>
      </div>
    </div>
  );

  const TABS: { id: SV1Tab; label: string }[] = [
    { id: 'synth1', label: 'Synth 1' },
    { id: 'synth2', label: 'Synth 2' },
    { id: 'effects', label: 'Effects' },
  ];

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Tabs */}
      <div className="flex border-b border-dark-border bg-dark-bg">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors
              ${activeTab === tab.id
                ? 'bg-[#252525] text-cyan-400 border-b-2 border-cyan-400'
                : 'text-text-muted hover:text-text-secondary'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="synth-controls-flow flex-1 overflow-y-auto">
        {activeTab === 'synth1' ? renderSynthPage(1) :
         activeTab === 'synth2' ? renderSynthPage(2) :
         renderEffects()}
      </div>
    </div>
  );
};

export default SynthV1Controls;
