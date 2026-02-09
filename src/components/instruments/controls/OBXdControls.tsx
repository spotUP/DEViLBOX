import React, { useState, useRef } from 'react';
import { Knob } from '@components/controls/Knob';
import { Waves, Filter, Zap, Activity, Volume2 } from 'lucide-react';
import { useThemeStore } from '@stores';
import type { OBXdConfig } from '@typedefs/instrument';

// Waveform options for UI
const OSC_WAVEFORMS = ['saw', 'pulse', 'triangle', 'noise'] as const;
const LFO_WAVEFORMS = ['sine', 'triangle', 'saw', 'square', 'sampleHold'] as const;

interface OBXdControlsProps {
  config: Partial<OBXdConfig>;
  onChange: (updates: Partial<OBXdConfig>) => void;
}

type OBXdTab = 'osc' | 'filter' | 'env' | 'mod';

export const OBXdControls: React.FC<OBXdControlsProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<OBXdTab>('osc');
  
  // Use ref to prevent stale closures in callbacks
  const configRef = useRef(config);
  configRef.current = config;

  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Oberheim uses amber/orange colors
  const accentColor = isCyanTheme ? '#00ffff' : '#ff8c00';
  const knobColor = isCyanTheme ? '#00ffff' : '#ffa500';

  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-amber-900/50';

  const renderOscillatorTab = () => (
    <div className="flex flex-col gap-4 p-4">
      {/* Oscillator 1 */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Waves size={16} style={{ color: accentColor }} />
          <h3 className="font-bold uppercase tracking-tight" style={{ color: accentColor }}>
            OSCILLATOR 1
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="col-span-2">
            <label className="text-xs text-gray-400 block mb-2">Waveform</label>
            <select
              value={config.osc1Waveform || 'saw'}
              onChange={(e) => onChange({ osc1Waveform: e.target.value as OBXdConfig['osc1Waveform'] })}
              className="bg-gray-900 border border-gray-700 text-xs rounded px-2 py-1 w-full"
              style={{ color: accentColor }}
            >
              {OSC_WAVEFORMS.map((wave) => (
                <option key={wave} value={wave}>{wave.charAt(0).toUpperCase() + wave.slice(1)}</option>
              ))}
            </select>
          </div>
          <Knob
            value={config.osc1Octave ?? 0}
            min={-2}
            max={2}
            onChange={(v) => onChange({ osc1Octave: Math.round(v) })}
            label="Octave"
            color={knobColor}
            size="sm"
          />
          <Knob
            value={config.osc1Detune ?? 0}
            min={-1}
            max={1}
            onChange={(v) => onChange({ osc1Detune: v })}
            label="Detune"
            color={knobColor}
            size="sm"
          />
          <Knob
            value={config.osc1Level ?? 1}
            min={0}
            max={1}
            onChange={(v) => onChange({ osc1Level: v })}
            label="Level"
            color={knobColor}
            size="sm"
          />
        </div>

        <div className="mt-4">
          <Knob
            value={config.osc1PulseWidth ?? 0.5}
            min={0}
            max={1}
            onChange={(v) => onChange({ osc1PulseWidth: v })}
            label="Pulse Width"
            color={knobColor}
            size="sm"
          />
        </div>
      </div>

      {/* Oscillator 2 */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Waves size={16} style={{ color: accentColor }} />
          <h3 className="font-bold uppercase tracking-tight" style={{ color: accentColor }}>
            OSCILLATOR 2
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="col-span-2">
            <label className="text-xs text-gray-400 block mb-2">Waveform</label>
            <select
              value={config.osc2Waveform || 'saw'}
              onChange={(e) => onChange({ osc2Waveform: e.target.value as OBXdConfig['osc2Waveform'] })}
              className="bg-gray-900 border border-gray-700 text-xs rounded px-2 py-1 w-full"
              style={{ color: accentColor }}
            >
              {OSC_WAVEFORMS.map((wave) => (
                <option key={wave} value={wave}>{wave.charAt(0).toUpperCase() + wave.slice(1)}</option>
              ))}
            </select>
          </div>
          <Knob
            value={config.osc2Octave ?? 0}
            min={-2}
            max={2}
            onChange={(v) => onChange({ osc2Octave: Math.round(v) })}
            label="Octave"
            color={knobColor}
            size="sm"
          />
          <Knob
            value={config.osc2Detune ?? 0}
            min={-1}
            max={1}
            onChange={(v) => onChange({ osc2Detune: v })}
            label="Detune"
            color={knobColor}
            size="sm"
          />
          <Knob
            value={config.osc2Level ?? 0.7}
            min={0}
            max={1}
            onChange={(v) => onChange({ osc2Level: v })}
            label="Level"
            color={knobColor}
            size="sm"
          />
        </div>

        <div className="mt-4">
          <Knob
            value={config.osc2PulseWidth ?? 0.5}
            min={0}
            max={1}
            onChange={(v) => onChange({ osc2PulseWidth: v })}
            label="Pulse Width"
            color={knobColor}
            size="sm"
          />
        </div>
      </div>

      {/* OSC Options */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3 className="font-bold uppercase tracking-tight mb-4" style={{ color: accentColor }}>
          OPTIONS
        </h3>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.oscSync || false}
              onChange={(e) => onChange({ oscSync: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-xs text-gray-300">OSC Sync</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.oscXor || false}
              onChange={(e) => onChange({ oscXor: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-xs text-gray-300">Ring Mod (XOR)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.unison || false}
              onChange={(e) => onChange({ unison: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-xs text-gray-300">Unison</span>
          </label>
        </div>
        {config.unison && (
          <div className="mt-4">
            <Knob
              value={config.unisonDetune ?? 0.1}
              min={0}
              max={1}
              onChange={(v) => onChange({ unisonDetune: v })}
              label="Unison Detune"
              color={knobColor}
              size="sm"
            />
          </div>
        )}
      </div>
    </div>
  );

  const renderFilterTab = () => (
    <div className="flex flex-col gap-4 p-4">
      {/* Filter */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} style={{ color: accentColor }} />
          <h3 className="font-bold uppercase tracking-tight" style={{ color: accentColor }}>
            FILTER
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <Knob
            value={config.filterCutoff ?? 0.7}
            min={0}
            max={1}
            onChange={(v) => onChange({ filterCutoff: v })}
            label="Cutoff"
            color={knobColor}
            size="md"
          />
          <Knob
            value={config.filterResonance ?? 0.3}
            min={0}
            max={1}
            onChange={(v) => onChange({ filterResonance: v })}
            label="Resonance"
            color={knobColor}
            size="md"
          />
          <Knob
            value={config.filterEnvAmount ?? 0.5}
            min={0}
            max={1}
            onChange={(v) => onChange({ filterEnvAmount: v })}
            label="Env Amount"
            color={knobColor}
            size="md"
          />
          <Knob
            value={config.filterKeyTrack ?? 0}
            min={0}
            max={1}
            onChange={(v) => onChange({ filterKeyTrack: v })}
            label="Key Track"
            color={knobColor}
            size="md"
          />
        </div>

        <div className="mt-4">
          <label className="text-xs text-gray-400 block mb-2">Filter Type</label>
          <select
            value={config.filterType || 'lp24'}
            onChange={(e) => onChange({ filterType: e.target.value as OBXdConfig['filterType'] })}
            className="bg-gray-900 border border-gray-700 text-xs rounded px-2 py-1"
            style={{ color: accentColor }}
          >
            <option value="lp24">LP 24dB</option>
            <option value="lp12">LP 12dB</option>
            <option value="hp">HP</option>
            <option value="bp">BP</option>
            <option value="notch">Notch</option>
          </select>
        </div>
      </div>

      {/* Filter Envelope */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3 className="font-bold uppercase tracking-tight mb-4" style={{ color: accentColor }}>
          FILTER ENVELOPE
        </h3>

        <div className="grid grid-cols-4 gap-6">
          <Knob
            value={config.filterAttack ?? 0.01}
            min={0}
            max={1}
            onChange={(v) => onChange({ filterAttack: v })}
            label="Attack"
            color={knobColor}
            size="sm"
          />
          <Knob
            value={config.filterDecay ?? 0.3}
            min={0}
            max={1}
            onChange={(v) => onChange({ filterDecay: v })}
            label="Decay"
            color={knobColor}
            size="sm"
          />
          <Knob
            value={config.filterSustain ?? 0.3}
            min={0}
            max={1}
            onChange={(v) => onChange({ filterSustain: v })}
            label="Sustain"
            color={knobColor}
            size="sm"
          />
          <Knob
            value={config.filterRelease ?? 0.3}
            min={0}
            max={1}
            onChange={(v) => onChange({ filterRelease: v })}
            label="Release"
            color={knobColor}
            size="sm"
          />
        </div>
      </div>
    </div>
  );

  const renderEnvelopeTab = () => (
    <div className="flex flex-col gap-4 p-4">
      {/* Amp Envelope */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} style={{ color: accentColor }} />
          <h3 className="font-bold uppercase tracking-tight" style={{ color: accentColor }}>
            AMP ENVELOPE
          </h3>
        </div>

        <div className="grid grid-cols-4 gap-6">
          <Knob
            value={config.ampAttack ?? 0.01}
            min={0}
            max={1}
            onChange={(v) => onChange({ ampAttack: v })}
            label="Attack"
            color={knobColor}
            size="md"
          />
          <Knob
            value={config.ampDecay ?? 0.2}
            min={0}
            max={1}
            onChange={(v) => onChange({ ampDecay: v })}
            label="Decay"
            color={knobColor}
            size="md"
          />
          <Knob
            value={config.ampSustain ?? 0.7}
            min={0}
            max={1}
            onChange={(v) => onChange({ ampSustain: v })}
            label="Sustain"
            color={knobColor}
            size="md"
          />
          <Knob
            value={config.ampRelease ?? 0.3}
            min={0}
            max={1}
            onChange={(v) => onChange({ ampRelease: v })}
            label="Release"
            color={knobColor}
            size="md"
          />
        </div>
      </div>

      {/* Global */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Volume2 size={16} style={{ color: accentColor }} />
          <h3 className="font-bold uppercase tracking-tight" style={{ color: accentColor }}>
            GLOBAL
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <Knob
            value={config.masterVolume ?? 0.7}
            min={0}
            max={1}
            onChange={(v) => onChange({ masterVolume: v })}
            label="Volume"
            color={knobColor}
            size="md"
          />
          <Knob
            value={config.portamento ?? 0}
            min={0}
            max={1}
            onChange={(v) => onChange({ portamento: v })}
            label="Portamento"
            color={knobColor}
            size="md"
          />
          <Knob
            value={config.velocitySensitivity ?? 0.5}
            min={0}
            max={1}
            onChange={(v) => onChange({ velocitySensitivity: v })}
            label="Velocity Sens"
            color={knobColor}
            size="md"
          />
          <Knob
            value={config.panSpread ?? 0.3}
            min={0}
            max={1}
            onChange={(v) => onChange({ panSpread: v })}
            label="Pan Spread"
            color={knobColor}
            size="md"
          />
        </div>
      </div>
    </div>
  );

  const renderModulationTab = () => (
    <div className="flex flex-col gap-4 p-4">
      {/* LFO */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} style={{ color: accentColor }} />
          <h3 className="font-bold uppercase tracking-tight" style={{ color: accentColor }}>
            LFO
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <Knob
            value={config.lfoRate ?? 0.2}
            min={0}
            max={1}
            onChange={(v) => onChange({ lfoRate: v })}
            label="Rate"
            color={knobColor}
            size="md"
          />
          <div>
            <label className="text-xs text-gray-400 block mb-2">Waveform</label>
            <select
              value={config.lfoWaveform || 'sine'}
              onChange={(e) => onChange({ lfoWaveform: e.target.value as OBXdConfig['lfoWaveform'] })}
              className="bg-gray-900 border border-gray-700 text-xs rounded px-2 py-1 w-full"
              style={{ color: accentColor }}
            >
              {LFO_WAVEFORMS.map((wave) => (
                <option key={wave} value={wave}>
                  {wave === 'sampleHold' ? 'S&H' : wave.charAt(0).toUpperCase() + wave.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <Knob
            value={config.lfoDelay ?? 0}
            min={0}
            max={1}
            onChange={(v) => onChange({ lfoDelay: v })}
            label="Delay"
            color={knobColor}
            size="md"
          />
        </div>

        <div className="mt-4">
          <h4 className="text-xs text-gray-400 mb-4">LFO ROUTING</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <Knob
              value={config.lfoOscAmount ?? 0}
              min={0}
              max={1}
              onChange={(v) => onChange({ lfoOscAmount: v })}
              label="→ Pitch"
              color={knobColor}
              size="sm"
            />
            <Knob
              value={config.lfoFilterAmount ?? 0}
              min={0}
              max={1}
              onChange={(v) => onChange({ lfoFilterAmount: v })}
              label="→ Filter"
              color={knobColor}
              size="sm"
            />
            <Knob
              value={config.lfoAmpAmount ?? 0}
              min={0}
              max={1}
              onChange={(v) => onChange({ lfoAmpAmount: v })}
              label="→ Amp"
              color={knobColor}
              size="sm"
            />
            <Knob
              value={config.lfoPwAmount ?? 0}
              min={0}
              max={1}
              onChange={(v) => onChange({ lfoPwAmount: v })}
              label="→ PW"
              color={knobColor}
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Additional Modulation */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <h3 className="font-bold uppercase tracking-tight mb-4" style={{ color: accentColor }}>
          ADDITIONAL
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <Knob
            value={config.noiseLevel ?? 0}
            min={0}
            max={1}
            onChange={(v) => onChange({ noiseLevel: v })}
            label="Noise"
            color={knobColor}
            size="sm"
          />
          <Knob
            value={config.subOscLevel ?? 0}
            min={0}
            max={1}
            onChange={(v) => onChange({ subOscLevel: v })}
            label="Sub Osc"
            color={knobColor}
            size="sm"
          />
          <Knob
            value={config.drift ?? 0}
            min={0}
            max={1}
            onChange={(v) => onChange({ drift: v })}
            label="Drift"
            color={knobColor}
            size="sm"
          />
        </div>
      </div>
    </div>
  );

  const tabs: { id: OBXdTab; label: string }[] = [
    { id: 'osc', label: 'Oscillators' },
    { id: 'filter', label: 'Filter' },
    { id: 'env', label: 'Envelope' },
    { id: 'mod', label: 'Modulation' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <div className="flex border-b border-gray-800 bg-gray-900/50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === tab.id
                ? 'border-b-2 text-amber-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            style={activeTab === tab.id ? { borderColor: accentColor, color: accentColor } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'osc' && renderOscillatorTab()}
        {activeTab === 'filter' && renderFilterTab()}
        {activeTab === 'env' && renderEnvelopeTab()}
        {activeTab === 'mod' && renderModulationTab()}
      </div>
    </div>
  );
};
