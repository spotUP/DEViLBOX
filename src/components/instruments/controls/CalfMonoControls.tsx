/**
 * CalfMonoControls.tsx - Visual UI for Calf Monosynth
 * 52 parameters organized into oscillator/filter/envelope/LFO/performance groups.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { CalfMonoConfig } from '@/engine/calf-mono/CalfMonoSynth';
import { DEFAULT_CALF_MONO } from '@/engine/calf-mono/CalfMonoSynth';

interface CalfMonoControlsProps {
  config: CalfMonoConfig;
  onChange: (config: CalfMonoConfig) => void;
}

const WAVE_NAMES = [
  'Saw', 'Square', 'Pulse', 'Sine', 'Triangle', 'Varistep',
  'Skew Saw', 'Skew Sqr', 'Var Tri', 'Super Saw', 'Super Sqr',
  'Super Sine', 'Brass', 'Reed', 'Organ', 'Noise',
];

const FILTER_NAMES = [
  'LP 12dB', 'LP 24dB', '2×LP 12dB', 'HP 12dB',
  'LP+Notch', 'HP+Notch', 'BP 6dB', '2×BP 6dB',
];

const PHASE_NAMES = ['Free', 'On Note', 'Random', 'Sync', 'Phase 4', 'Phase 5'];
const LEGATO_NAMES = ['Off', 'On', 'Retrig', 'Fing'];
const MIDI_CH_NAMES = ['All', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16'];
const TRIG_NAMES = ['Free', 'Retrigger'];

/* --- Reusable sub-components -------------------------------------------- */

const Sl: React.FC<{
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; cls: string; fmt?: (v: number) => string;
}> = ({ label, value, min, max, step, onChange, cls, fmt }) => (
  <div className="flex flex-col gap-1">
    <label className="text-gray-500 text-[10px]">{label}</label>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className={`w-full h-2 ${cls}`} />
    {fmt && <span className="text-gray-600 text-[10px]">{fmt(value)}</span>}
  </div>
);

const Sel: React.FC<{
  label: string; value: number; options: string[]; onChange: (v: number) => void;
}> = ({ label, value, options, onChange }) => (
  <div className="flex flex-col gap-1">
    <label className="text-gray-500 text-[10px]">{label}</label>
    <select className="bg-[#2a2a2a] text-gray-200 border border-gray-600 rounded px-1 py-0.5 text-[10px]"
      value={Math.round(value)} onChange={(e) => onChange(parseInt(e.target.value))}>
      {options.map((n, i) => <option key={i} value={i}>{n}</option>)}
    </select>
  </div>
);

const Tog: React.FC<{
  label: string; value: number; onChange: (v: number) => void;
}> = ({ label, value, onChange }) => (
  <div className="flex flex-col gap-1">
    <label className="text-gray-500 text-[10px]">{label}</label>
    <button
      className={`px-2 py-0.5 rounded text-[10px] ${value ? 'bg-green-700 text-white' : 'bg-gray-700 text-gray-400'}`}
      onClick={() => onChange(value ? 0 : 1)}
    >{value ? 'ON' : 'OFF'}</button>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h3 className="text-gray-400 font-semibold mb-2 border-b border-gray-700 pb-1">{title}</h3>
    {children}
  </div>
);

/* --- Main component ------------------------------------------------------ */

export const CalfMonoControls: React.FC<CalfMonoControlsProps> = ({ config, onChange }) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const update = useCallback((key: keyof CalfMonoConfig, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  const m = { ...DEFAULT_CALF_MONO, ...config } as Required<CalfMonoConfig>;

  const sl = (key: keyof CalfMonoConfig, label: string, min: number, max: number, step: number, cls: string, fmt?: (v: number) => string) => (
    <Sl label={label} value={m[key] as number} min={min} max={max} step={step}
      onChange={(v) => update(key, v)} cls={cls} fmt={fmt} />
  );

  return (
    <div className="p-4 space-y-4 text-xs">
      {/* Oscillators */}
      <Section title="Oscillators">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Sel label="Osc1 Wave" value={m.o1Wave} options={WAVE_NAMES} onChange={(v) => update('o1Wave', v)} />
          <Sel label="Osc2 Wave" value={m.o2Wave} options={WAVE_NAMES} onChange={(v) => update('o2Wave', v)} />
          {sl('o1Pw', 'PW 1', -1, 1, 0.01, 'accent-green-500')}
          {sl('o2Pw', 'PW 2', -1, 1, 0.01, 'accent-green-500')}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          {sl('o1Xpose', 'Transpose 1', -24, 24, 1, 'accent-green-500', v => `${v} semi`)}
          {sl('o2Xpose', 'Transpose 2', -24, 24, 1, 'accent-green-500', v => `${v} semi`)}
          {sl('o1Stretch', 'Stretch', 1, 16, 1, 'accent-green-500')}
          {sl('o1Window', 'Window', 0, 1, 0.01, 'accent-green-500')}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          {sl('o12Detune', 'Detune', 0, 100, 0.1, 'accent-green-500', v => `${v.toFixed(1)} ct`)}
          {sl('scaleDetune', 'Scale Detune', 0, 1, 0.01, 'accent-green-500')}
          {sl('o2Unison', 'Unison', 0, 1, 0.01, 'accent-green-500')}
          {sl('o2UnisonFrq', 'Unison Freq', 0.01, 20, 0.01, 'accent-green-500', v => `${v.toFixed(2)} Hz`)}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Sel label="Phase Mode" value={m.phaseMode} options={PHASE_NAMES} onChange={(v) => update('phaseMode', v)} />
          {sl('o12Mix', 'Mix', 0, 1, 0.01, 'accent-green-500', v => `${Math.round(v * 100)}%`)}
        </div>
      </Section>

      {/* Filter */}
      <Section title="Filter">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Sel label="Type" value={m.filter} options={FILTER_NAMES} onChange={(v) => update('filter', v)} />
          {sl('cutoff', 'Cutoff', 10, 16000, 1, 'accent-purple-500', v => `${Math.round(v)} Hz`)}
          {sl('res', 'Resonance', 0.7, 8, 0.01, 'accent-purple-500', v => v.toFixed(2))}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {sl('filterSep', 'Separation', -2400, 2400, 1, 'accent-purple-500', v => `${Math.round(v)} ct`)}
          {sl('keyFollow', 'Key Follow', 0, 2, 0.01, 'accent-purple-500', v => v.toFixed(2))}
        </div>
      </Section>

      {/* Envelope 1 */}
      <Section title="Envelope 1">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {sl('adsrA', 'Attack', 1, 20000, 1, 'accent-red-500', v => `${Math.round(v)} ms`)}
          {sl('adsrD', 'Decay', 10, 20000, 1, 'accent-red-500', v => `${Math.round(v)} ms`)}
          {sl('adsrS', 'Sustain', 0, 1, 0.01, 'accent-red-500', v => `${Math.round(v * 100)}%`)}
          {sl('adsrF', 'Fade', -10000, 10000, 1, 'accent-red-500', v => `${Math.round(v)} ms`)}
          {sl('adsrR', 'Release', 10, 20000, 1, 'accent-red-500', v => `${Math.round(v)} ms`)}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {sl('env2cutoff', '→Cutoff', -10800, 10800, 1, 'accent-red-500', v => `${Math.round(v)} ct`)}
          {sl('env2res', '→Resonance', 0, 1, 0.01, 'accent-red-500')}
          <Tog label="→Amp" value={m.env2amp} onChange={(v) => update('env2amp', v)} />
        </div>
      </Section>

      {/* Envelope 2 */}
      <Section title="Envelope 2">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {sl('adsr2A', 'Attack', 1, 20000, 1, 'accent-orange-500', v => `${Math.round(v)} ms`)}
          {sl('adsr2D', 'Decay', 10, 20000, 1, 'accent-orange-500', v => `${Math.round(v)} ms`)}
          {sl('adsr2S', 'Sustain', 0, 1, 0.01, 'accent-orange-500', v => `${Math.round(v * 100)}%`)}
          {sl('adsr2F', 'Fade', -10000, 10000, 1, 'accent-orange-500', v => `${Math.round(v)} ms`)}
          {sl('adsr2R', 'Release', 10, 20000, 1, 'accent-orange-500', v => `${Math.round(v)} ms`)}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {sl('adsr2Cutoff', '→Cutoff', -10800, 10800, 1, 'accent-orange-500', v => `${Math.round(v)} ct`)}
          {sl('adsr2Res', '→Resonance', 0, 1, 0.01, 'accent-orange-500')}
          <Tog label="→Amp" value={m.adsr2Amp} onChange={(v) => update('adsr2Amp', v)} />
        </div>
      </Section>

      {/* LFO 1 */}
      <Section title="LFO 1">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {sl('lfoRate', 'Rate', 0.01, 20, 0.01, 'accent-cyan-500', v => `${v.toFixed(2)} Hz`)}
          {sl('lfoDelay', 'Delay', 0, 5, 0.01, 'accent-cyan-500', v => `${v.toFixed(2)} s`)}
          <Sel label="Trigger" value={m.lfo1Trig} options={TRIG_NAMES} onChange={(v) => update('lfo1Trig', v)} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          {sl('lfo2filter', '→Filter', -4800, 4800, 1, 'accent-cyan-500', v => `${Math.round(v)} ct`)}
          {sl('lfo2pitch', '→Pitch', 0, 1200, 1, 'accent-cyan-500', v => `${Math.round(v)} ct`)}
          {sl('lfo2pw', '→PW', 0, 1, 0.01, 'accent-cyan-500')}
          {sl('mwhl2lfo', 'ModWheel', 0, 1, 0.01, 'accent-cyan-500')}
        </div>
      </Section>

      {/* LFO 2 */}
      <Section title="LFO 2">
        <div className="grid grid-cols-3 gap-2">
          {sl('lfo2Rate', 'Rate', 0.01, 20, 0.01, 'accent-sky-500', v => `${v.toFixed(2)} Hz`)}
          {sl('lfo2Delay', 'Delay', 0.1, 5, 0.01, 'accent-sky-500', v => `${v.toFixed(2)} s`)}
          <Sel label="Trigger" value={m.lfo2Trig} options={TRIG_NAMES} onChange={(v) => update('lfo2Trig', v)} />
        </div>
      </Section>

      {/* Velocity & Performance */}
      <Section title="Velocity & Performance">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {sl('vel2filter', 'Vel→Filter', 0, 1, 0.01, 'accent-yellow-500')}
          {sl('vel2amp', 'Vel→Amp', 0, 1, 0.01, 'accent-yellow-500')}
          {sl('portamento', 'Portamento', 1, 2000, 1, 'accent-yellow-500', v => `${Math.round(v)} ms`)}
          <Sel label="Legato" value={m.legato} options={LEGATO_NAMES} onChange={(v) => update('legato', v)} />
        </div>
      </Section>

      {/* Master */}
      <Section title="Master">
        <div className="grid grid-cols-3 gap-2">
          {sl('master', 'Volume', 0, 100, 0.1, 'accent-emerald-500')}
          {sl('pbendRange', 'PBend Range', 0, 2400, 1, 'accent-emerald-500', v => `${Math.round(v)} ct`)}
          <Sel label="MIDI Ch" value={m.midi} options={MIDI_CH_NAMES} onChange={(v) => update('midi', v)} />
        </div>
      </Section>
    </div>
  );
};

export default CalfMonoControls;
