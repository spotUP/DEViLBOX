/**
 * TalNoizeMakerControls.tsx - Visual UI for TAL-NoiseMaker virtual analog synth
 * 80 parameters organized into Oscillators, Filter, Envelopes, LFOs, Effects,
 * Performance, and Bitcrusher groups.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { Knob } from '@components/controls/Knob';
import type { TalNoizeMakerConfig } from '@/engine/tal-noizemaker/TalNoizeMakerSynth';
import { DEFAULT_TAL_NOIZEMAKER } from '@/engine/tal-noizemaker/TalNoizeMakerSynth';

interface TalNoizeMakerControlsProps {
  config: Partial<TalNoizeMakerConfig>;
  onChange: (updates: Partial<TalNoizeMakerConfig>) => void;
}

const OSC_WAVE_NAMES = ['Saw', 'Pulse', 'Noise', 'Triangle', 'Sine'];
const FILTER_TYPE_NAMES = ['LP24', 'LP12', 'HP', 'BP'];
const LFO_WAVE_NAMES = ['Tri', 'Saw', 'Square', 'S&H', 'Sine'];
const LFO_DEST_NAMES = ['Filter', 'Osc', 'PW', 'Pan'];
const FREE_AD_DEST_NAMES = ['Filter', 'Osc', 'PW', 'Pan'];

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <h3 className="text-gray-400 font-semibold mb-2 border-b border-gray-700 pb-1">{title}</h3>
);

const ToggleButton: React.FC<{
  label: string; value: number;
  onChange: (v: number) => void;
}> = ({ label, value, onChange }) => (
  <button
    className={`px-2 py-0.5 rounded text-[10px] ${value > 0.5 ? 'bg-green-700 text-white' : 'bg-gray-700 text-gray-400'}`}
    onClick={() => onChange(value > 0.5 ? 0 : 1)}
  >{label}: {value > 0.5 ? 'ON' : 'OFF'}</button>
);

const SelectControl: React.FC<{
  label: string; value: number; options: string[];
  onChange: (v: number) => void;
}> = ({ label, value, options, onChange }) => (
  <div className="flex flex-col gap-1">
    <label className="text-gray-500 text-[10px]">{label}</label>
    <select
      className="bg-[#2a2a2a] text-gray-200 border border-gray-600 rounded px-1 py-0.5 text-[10px]"
      value={Math.round(value)}
      onChange={(e) => onChange(parseInt(e.target.value))}
    >
      {options.map((n, i) => <option key={i} value={i}>{n}</option>)}
    </select>
  </div>
);

export const TalNoizeMakerControls: React.FC<TalNoizeMakerControlsProps> = ({ config, onChange }) => {
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const update = useCallback((key: keyof TalNoizeMakerConfig, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  const m = { ...DEFAULT_TAL_NOIZEMAKER, ...config } as Required<TalNoizeMakerConfig>;

  return (
    <div className="p-4 space-y-4 text-xs">
      {/* ── Oscillators ── */}
      <div>
        <SectionHeader title="Oscillators" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Osc 1 */}
          <div className="p-2 rounded bg-[#1a2a1a]">
            <span className="text-gray-400 font-semibold text-[11px]">OSC 1</span>
            <div className="flex flex-wrap gap-2 mt-1 items-end">
              <SelectControl label="Wave" value={m.osc1Waveform} options={OSC_WAVE_NAMES} onChange={(v) => update('osc1Waveform', v)} />
              <Knob label="Volume" value={m.osc1Volume} min={0} max={1} color="#4ade80" onChange={(v) => update('osc1Volume', v)} />
              <Knob label="Tune" value={m.osc1Tune} min={0} max={1} color="#facc15" bipolar onChange={(v) => update('osc1Tune', v)} />
              <Knob label="Fine" value={m.osc1FineTune} min={0} max={1} color="#facc15" bipolar onChange={(v) => update('osc1FineTune', v)} />
              <Knob label="PW" value={m.osc1PW} min={0} max={1} color="#60a5fa" onChange={(v) => update('osc1PW', v)} />
              <Knob label="Phase" value={m.osc1Phase} min={0} max={1} color="#818cf8" onChange={(v) => update('osc1Phase', v)} />
              <ToggleButton label="Sync" value={m.oscSync} onChange={(v) => update('oscSync', v)} />
            </div>
          </div>

          {/* Osc 2 */}
          <div className="p-2 rounded bg-[#1a2a1a]">
            <span className="text-gray-400 font-semibold text-[11px]">OSC 2</span>
            <div className="flex flex-wrap gap-2 mt-1 items-end">
              <SelectControl label="Wave" value={m.osc2Waveform} options={OSC_WAVE_NAMES} onChange={(v) => update('osc2Waveform', v)} />
              <Knob label="Volume" value={m.osc2Volume} min={0} max={1} color="#4ade80" onChange={(v) => update('osc2Volume', v)} />
              <Knob label="Tune" value={m.osc2Tune} min={0} max={1} color="#facc15" bipolar onChange={(v) => update('osc2Tune', v)} />
              <Knob label="Fine" value={m.osc2FineTune} min={0} max={1} color="#facc15" bipolar onChange={(v) => update('osc2FineTune', v)} />
              <Knob label="Phase" value={m.osc2Phase} min={0} max={1} color="#818cf8" onChange={(v) => update('osc2Phase', v)} />
              <Knob label="FM" value={m.osc2FM} min={0} max={1} color="#f472b6" onChange={(v) => update('osc2FM', v)} />
            </div>
          </div>
        </div>

        {/* Sub / Ring / Misc */}
        <div className="flex flex-wrap gap-3 mt-2 items-end">
          <Knob label="Osc 3 Vol" value={m.osc3Volume} min={0} max={1} color="#4ade80" onChange={(v) => update('osc3Volume', v)} />
          <Knob label="Master Tune" value={m.masterTune} min={0} max={1} color="#facc15" bipolar onChange={(v) => update('masterTune', v)} />
          <Knob label="Ring Mod" value={m.ringModulation} min={0} max={1} color="#f97316" onChange={(v) => update('ringModulation', v)} />
          <Knob label="Transpose" value={m.transpose} min={0} max={1} color="#facc15" bipolar onChange={(v) => update('transpose', v)} />
          <Knob label="Vintage Noise" value={m.vintageNoise} min={0} max={1} color="#94a3b8" onChange={(v) => update('vintageNoise', v)} />
        </div>
      </div>

      {/* ── Filter ── */}
      <div>
        <SectionHeader title="Filter" />
        <div className="flex flex-wrap gap-3 items-end">
          <SelectControl label="Type" value={m.filterType} options={FILTER_TYPE_NAMES} onChange={(v) => update('filterType', v)} />
          <Knob label="Cutoff" value={m.cutoff} min={0} max={1} color="#a855f7" onChange={(v) => update('cutoff', v)} />
          <Knob label="Reso" value={m.resonance} min={0} max={1} color="#a855f7" onChange={(v) => update('resonance', v)} />
          <Knob label="Drive" value={m.filterDrive} min={0} max={1} color="#ef4444" onChange={(v) => update('filterDrive', v)} />
          <Knob label="Key Follow" value={m.keyFollow} min={0} max={1} color="#818cf8" onChange={(v) => update('keyFollow', v)} />
          <Knob label="Contour" value={m.filterContour} min={0} max={1} color="#c084fc" onChange={(v) => update('filterContour', v)} />
          <Knob label="Vel Cutoff" value={m.velocityCutoff} min={0} max={1} color="#c084fc" onChange={(v) => update('velocityCutoff', v)} />
          <Knob label="High Pass" value={m.highPass} min={0} max={1} color="#a855f7" onChange={(v) => update('highPass', v)} />
        </div>
      </div>

      {/* ── Envelopes ── */}
      <div>
        <SectionHeader title="Envelopes" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Amp Envelope */}
          <div className="p-2 rounded bg-[#1a1a2a]">
            <span className="text-gray-400 font-semibold text-[11px]">AMP</span>
            <div className="flex flex-wrap gap-2 mt-1 items-end">
              <Knob label="A" value={m.ampAttack} min={0} max={1} color="#ef4444" onChange={(v) => update('ampAttack', v)} />
              <Knob label="D" value={m.ampDecay} min={0} max={1} color="#ef4444" onChange={(v) => update('ampDecay', v)} />
              <Knob label="S" value={m.ampSustain} min={0} max={1} color="#ef4444" onChange={(v) => update('ampSustain', v)} />
              <Knob label="R" value={m.ampRelease} min={0} max={1} color="#ef4444" onChange={(v) => update('ampRelease', v)} />
              <Knob label="Vel" value={m.velocityVolume} min={0} max={1} color="#f87171" onChange={(v) => update('velocityVolume', v)} />
            </div>
          </div>

          {/* Filter Envelope */}
          <div className="p-2 rounded bg-[#2a1a2a]">
            <span className="text-gray-400 font-semibold text-[11px]">FILTER</span>
            <div className="flex flex-wrap gap-2 mt-1 items-end">
              <Knob label="A" value={m.filterAttack} min={0} max={1} color="#a855f7" onChange={(v) => update('filterAttack', v)} />
              <Knob label="D" value={m.filterDecay} min={0} max={1} color="#a855f7" onChange={(v) => update('filterDecay', v)} />
              <Knob label="S" value={m.filterSustain} min={0} max={1} color="#a855f7" onChange={(v) => update('filterSustain', v)} />
              <Knob label="R" value={m.filterRelease} min={0} max={1} color="#a855f7" onChange={(v) => update('filterRelease', v)} />
              <Knob label="Vel Cont" value={m.velocityContour} min={0} max={1} color="#c084fc" onChange={(v) => update('velocityContour', v)} />
            </div>
          </div>
        </div>

        {/* Free AD Envelope */}
        <div className="p-2 rounded bg-[#2a1a1a] mt-3">
          <span className="text-gray-400 font-semibold text-[11px]">FREE AD</span>
          <div className="flex flex-wrap gap-2 mt-1 items-end">
            <Knob label="A" value={m.freeAdAttack} min={0} max={1} color="#f97316" onChange={(v) => update('freeAdAttack', v)} />
            <Knob label="D" value={m.freeAdDecay} min={0} max={1} color="#f97316" onChange={(v) => update('freeAdDecay', v)} />
            <Knob label="Amount" value={m.freeAdAmount} min={0} max={1} color="#f97316" onChange={(v) => update('freeAdAmount', v)} />
            <SelectControl label="Dest" value={m.freeAdDestination} options={FREE_AD_DEST_NAMES} onChange={(v) => update('freeAdDestination', v)} />
          </div>
        </div>
      </div>

      {/* ── LFOs ── */}
      <div>
        <SectionHeader title="LFOs" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* LFO 1 */}
          <div className="p-2 rounded bg-[#1a2a2a]">
            <span className="text-gray-400 font-semibold text-[11px]">LFO 1</span>
            <div className="flex flex-wrap gap-2 mt-1 items-end">
              <Knob label="Rate" value={m.lfo1Rate} min={0} max={1} color="#22d3ee" onChange={(v) => update('lfo1Rate', v)} />
              <SelectControl label="Wave" value={m.lfo1Waveform} options={LFO_WAVE_NAMES} onChange={(v) => update('lfo1Waveform', v)} />
              <Knob label="Amount" value={m.lfo1Amount} min={0} max={1} color="#22d3ee" onChange={(v) => update('lfo1Amount', v)} />
              <SelectControl label="Dest" value={m.lfo1Destination} options={LFO_DEST_NAMES} onChange={(v) => update('lfo1Destination', v)} />
              <Knob label="Phase" value={m.lfo1Phase} min={0} max={1} color="#67e8f9" onChange={(v) => update('lfo1Phase', v)} />
              <ToggleButton label="Sync" value={m.lfo1Sync} onChange={(v) => update('lfo1Sync', v)} />
              <ToggleButton label="Key Trig" value={m.lfo1KeyTrigger} onChange={(v) => update('lfo1KeyTrigger', v)} />
            </div>
          </div>

          {/* LFO 2 */}
          <div className="p-2 rounded bg-[#1a2a2a]">
            <span className="text-gray-400 font-semibold text-[11px]">LFO 2</span>
            <div className="flex flex-wrap gap-2 mt-1 items-end">
              <Knob label="Rate" value={m.lfo2Rate} min={0} max={1} color="#2dd4bf" onChange={(v) => update('lfo2Rate', v)} />
              <SelectControl label="Wave" value={m.lfo2Waveform} options={LFO_WAVE_NAMES} onChange={(v) => update('lfo2Waveform', v)} />
              <Knob label="Amount" value={m.lfo2Amount} min={0} max={1} color="#2dd4bf" onChange={(v) => update('lfo2Amount', v)} />
              <SelectControl label="Dest" value={m.lfo2Destination} options={LFO_DEST_NAMES} onChange={(v) => update('lfo2Destination', v)} />
              <Knob label="Phase" value={m.lfo2Phase} min={0} max={1} color="#5eead4" onChange={(v) => update('lfo2Phase', v)} />
              <ToggleButton label="Sync" value={m.lfo2Sync} onChange={(v) => update('lfo2Sync', v)} />
              <ToggleButton label="Key Trig" value={m.lfo2KeyTrigger} onChange={(v) => update('lfo2KeyTrigger', v)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Effects ── */}
      <div>
        <SectionHeader title="Effects" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Chorus */}
          <div className="p-2 rounded bg-[#1a1a2a]">
            <span className="text-gray-400 font-semibold text-[11px]">CHORUS</span>
            <div className="flex flex-wrap gap-2 mt-1 items-end">
              <ToggleButton label="Chorus 1" value={m.chorus1Enable} onChange={(v) => update('chorus1Enable', v)} />
              <ToggleButton label="Chorus 2" value={m.chorus2Enable} onChange={(v) => update('chorus2Enable', v)} />
            </div>
          </div>

          {/* Reverb */}
          <div className="p-2 rounded bg-[#1a1a2a]">
            <span className="text-gray-400 font-semibold text-[11px]">REVERB</span>
            <div className="flex flex-wrap gap-2 mt-1 items-end">
              <Knob label="Wet" value={m.reverbWet} min={0} max={1} color="#c084fc" onChange={(v) => update('reverbWet', v)} />
              <Knob label="Decay" value={m.reverbDecay} min={0} max={1} color="#c084fc" onChange={(v) => update('reverbDecay', v)} />
              <Knob label="Pre-Dly" value={m.reverbPreDelay} min={0} max={1} color="#c084fc" onChange={(v) => update('reverbPreDelay', v)} />
              <Knob label="Hi Cut" value={m.reverbHighCut} min={0} max={1} color="#c084fc" onChange={(v) => update('reverbHighCut', v)} />
              <Knob label="Lo Cut" value={m.reverbLowCut} min={0} max={1} color="#c084fc" onChange={(v) => update('reverbLowCut', v)} />
            </div>
          </div>

          {/* Delay */}
          <div className="p-2 rounded bg-[#1a1a2a]">
            <span className="text-gray-400 font-semibold text-[11px]">DELAY</span>
            <div className="flex flex-wrap gap-2 mt-1 items-end">
              <Knob label="Wet" value={m.delayWet} min={0} max={1} color="#fb923c" onChange={(v) => update('delayWet', v)} />
              <Knob label="Time" value={m.delayTime} min={0} max={1} color="#fb923c" onChange={(v) => update('delayTime', v)} />
              <Knob label="Feedback" value={m.delayFeedback} min={0} max={1} color="#fb923c" onChange={(v) => update('delayFeedback', v)} />
              <ToggleButton label="Sync" value={m.delaySync} onChange={(v) => update('delaySync', v)} />
              <Knob label="Factor L" value={m.delayFactorL} min={0} max={1} color="#fb923c" onChange={(v) => update('delayFactorL', v)} />
              <Knob label="Factor R" value={m.delayFactorR} min={0} max={1} color="#fb923c" onChange={(v) => update('delayFactorR', v)} />
              <Knob label="Hi Shelf" value={m.delayHighShelf} min={0} max={1} color="#fb923c" onChange={(v) => update('delayHighShelf', v)} />
              <Knob label="Lo Shelf" value={m.delayLowShelf} min={0} max={1} color="#fb923c" onChange={(v) => update('delayLowShelf', v)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Performance ── */}
      <div>
        <SectionHeader title="Performance" />
        <div className="flex flex-wrap gap-3 items-end">
          <Knob label="Volume" value={m.volume} min={0} max={1} color="#4ade80" onChange={(v) => update('volume', v)} />
          <Knob label="Porta" value={m.portamento} min={0} max={1} color="#60a5fa" onChange={(v) => update('portamento', v)} />
          <SelectControl label="Porta Mode" value={m.portamentoMode} options={['Auto', 'Always']} onChange={(v) => update('portamentoMode', v)} />
          <Knob label="Voices" value={m.voices} min={0} max={1} color="#e2e8f0"
            formatValue={(v) => String(Math.max(1, Math.round(v * 15) + 1))}
            onChange={(v) => update('voices', v)} />
          <Knob label="PB Pitch" value={m.pitchwheelPitch} min={0} max={1} color="#facc15"
            formatValue={(v) => String(Math.round(v * 24))}
            onChange={(v) => update('pitchwheelPitch', v)} />
          <Knob label="PB Cutoff" value={m.pitchwheelCutoff} min={0} max={1} color="#facc15" onChange={(v) => update('pitchwheelCutoff', v)} />
          <Knob label="Detune" value={m.detune} min={0} max={1} color="#f472b6" onChange={(v) => update('detune', v)} />
          <Knob label="Bitcrusher" value={m.oscBitcrusher} min={0} max={1} color="#f97316" onChange={(v) => update('oscBitcrusher', v)} />
        </div>
      </div>
    </div>
  );
};

export default TalNoizeMakerControls;
