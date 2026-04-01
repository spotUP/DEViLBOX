import React, { useRef, useEffect } from 'react';
import { Knob } from '@components/controls/Knob';
import { Waves, Filter, Zap, Activity, Volume2 } from 'lucide-react';
import { useThemeStore } from '@stores';
import type { OBXdConfig } from '@typedefs/instrument';
import { FilterFrequencyResponse, EnvelopeVisualization } from '@components/instruments/shared';
import type { FilterType } from '@components/instruments/shared';

const OBXD_FILTER_TYPE_MAP: Record<string, { type: FilterType; poles: 2 | 4 }> = {
  lp24:  { type: 'lowpass',   poles: 4 },
  lp12:  { type: 'lowpass',   poles: 2 },
  hp:    { type: 'highpass',  poles: 2 },
  bp:    { type: 'bandpass',  poles: 2 },
  notch: { type: 'notch',     poles: 2 },
};

// Waveform options for UI
const OSC_WAVEFORMS = ['saw', 'pulse', 'triangle', 'noise'] as const;
const LFO_WAVEFORMS = ['sine', 'triangle', 'saw', 'square', 'sampleHold'] as const;

interface OBXdControlsProps {
  config: Partial<OBXdConfig>;
  onChange: (updates: Partial<OBXdConfig>) => void;
}

export const OBXdControls: React.FC<OBXdControlsProps> = ({
  config,
  onChange,
}) => {
  // Use ref to prevent stale closures in callbacks
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Oberheim uses amber/orange colors
  const accentColor = isCyanTheme ? '#00ffff' : '#ff8c00';
  const knobColor = isCyanTheme ? '#00ffff' : '#ffa500';

  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-accent-highlight/20'
    : 'bg-[#1a1a1a] border-amber-900/50';

  const renderOscillatorTab = () => (
    <div className="grid grid-cols-3 gap-2 p-2">
      {/* Oscillator 1 */}
      <div className={`p-2 rounded-lg border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-2">
          <Waves size={16} style={{ color: accentColor }} />
          <h3 className="font-bold uppercase tracking-tight" style={{ color: accentColor }}>
            OSCILLATOR 1
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="col-span-2">
            <label className="text-xs text-text-secondary block mb-2">Waveform</label>
            <select
              value={config.osc1Waveform || 'saw'}
              onChange={(e) => onChange({ osc1Waveform: e.target.value as OBXdConfig['osc1Waveform'] })}
              className="bg-dark-bgSecondary border border-dark-borderLight text-xs rounded px-2 py-1 w-full"
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
      <div className={`p-2 rounded-lg border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-2">
          <Waves size={16} style={{ color: accentColor }} />
          <h3 className="font-bold uppercase tracking-tight" style={{ color: accentColor }}>
            OSCILLATOR 2
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="col-span-2">
            <label className="text-xs text-text-secondary block mb-2">Waveform</label>
            <select
              value={config.osc2Waveform || 'saw'}
              onChange={(e) => onChange({ osc2Waveform: e.target.value as OBXdConfig['osc2Waveform'] })}
              className="bg-dark-bgSecondary border border-dark-borderLight text-xs rounded px-2 py-1 w-full"
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
      <div className={`p-2 rounded-lg border ${panelBg}`}>
        <h3 className="font-bold uppercase tracking-tight mb-2" style={{ color: accentColor }}>
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
            <span className="text-xs text-text-secondary">OSC Sync</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.oscXor || false}
              onChange={(e) => onChange({ oscXor: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-xs text-text-secondary">Ring Mod (XOR)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.unison || false}
              onChange={(e) => onChange({ unison: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-xs text-text-secondary">Unison</span>
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
    <div className="grid grid-cols-3 gap-2 p-2">
      {/* Filter */}
      <div className={`p-2 rounded-lg border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-2">
          <Filter size={16} style={{ color: accentColor }} />
          <h3 className="font-bold uppercase tracking-tight" style={{ color: accentColor }}>
            FILTER
          </h3>
        </div>

        <div className="mb-2">
          {(() => {
            const ft = OBXD_FILTER_TYPE_MAP[config.filterType ?? 'lp24'] ?? OBXD_FILTER_TYPE_MAP.lp24;
            return (
              <FilterFrequencyResponse
                filterType={ft.type}
                cutoff={config.filterCutoff ?? 0.7}
                resonance={config.filterResonance ?? 0.3}
                poles={ft.poles}
                color={knobColor}
                width={320} height={64}
              />
            );
          })()}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          <Knob
            value={config.filterVelocity ?? 0.3}
            min={0}
            max={1}
            onChange={(v) => onChange({ filterVelocity: v })}
            label="Velocity"
            color={knobColor}
            size="md"
          />
        </div>

        <div className="mt-4">
          <label className="text-xs text-text-secondary block mb-2">Filter Type</label>
          <select
            value={config.filterType || 'lp24'}
            onChange={(e) => onChange({ filterType: e.target.value as OBXdConfig['filterType'] })}
            className="bg-dark-bgSecondary border border-dark-borderLight text-xs rounded px-2 py-1"
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
      <div className={`p-2 rounded-lg border ${panelBg}`}>
        <h3 className="font-bold uppercase tracking-tight mb-2" style={{ color: accentColor }}>
          FILTER ENVELOPE
        </h3>

        <div className="mb-3">
          <EnvelopeVisualization
            mode="linear"
            attack={config.filterAttack ?? 0.01}
            decay={config.filterDecay ?? 0.3}
            sustain={config.filterSustain ?? 0.3}
            release={config.filterRelease ?? 0.3}
            color={knobColor}
            width={300} height={56}
          />
        </div>

        <div className="grid grid-cols-4 gap-3">
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
    <div className="grid grid-cols-3 gap-2 p-2">
      {/* Amp Envelope */}
      <div className={`p-2 rounded-lg border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-2">
          <Zap size={16} style={{ color: accentColor }} />
          <h3 className="font-bold uppercase tracking-tight" style={{ color: accentColor }}>
            AMP ENVELOPE
          </h3>
        </div>

        <div className="mb-3">
          <EnvelopeVisualization
            mode="linear"
            attack={config.ampAttack ?? 0.01}
            decay={config.ampDecay ?? 0.2}
            sustain={config.ampSustain ?? 0.7}
            release={config.ampRelease ?? 0.3}
            color={knobColor}
            width={300} height={56}
          />
        </div>

        <div className="grid grid-cols-4 gap-3">
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
      <div className={`p-2 rounded-lg border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-2">
          <Volume2 size={16} style={{ color: accentColor }} />
          <h3 className="font-bold uppercase tracking-tight" style={{ color: accentColor }}>
            GLOBAL
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          <Knob
            value={config.voices ?? 8}
            min={1}
            max={8}
            onChange={(v) => onChange({ voices: Math.round(v) })}
            label="Voices"
            color={knobColor}
            size="md"
          />
        </div>
      </div>
    </div>
  );

  const renderModulationTab = () => (
    <div className="grid grid-cols-3 gap-2 p-2">
      {/* LFO */}
      <div className={`p-2 rounded-lg border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-2">
          <Activity size={16} style={{ color: accentColor }} />
          <h3 className="font-bold uppercase tracking-tight" style={{ color: accentColor }}>
            LFO
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            <label className="text-xs text-text-secondary block mb-2">Waveform</label>
            <select
              value={config.lfoWaveform || 'sine'}
              onChange={(e) => onChange({ lfoWaveform: e.target.value as OBXdConfig['lfoWaveform'] })}
              className="bg-dark-bgSecondary border border-dark-borderLight text-xs rounded px-2 py-1 w-full"
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
          <h4 className="text-xs text-text-secondary mb-2">LFO ROUTING</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
      <div className={`p-2 rounded-lg border ${panelBg}`}>
        <h3 className="font-bold uppercase tracking-tight mb-2" style={{ color: accentColor }}>
          ADDITIONAL
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          <Knob
            value={config.subOscOctave ?? -1}
            min={-2}
            max={-1}
            onChange={(v) => onChange({ subOscOctave: Math.round(v) as -1 | -2 })}
            label="Sub Oct"
            color={knobColor}
            size="sm"
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="grid grid-cols-3 gap-2 p-2">
        {/* Left column: Oscillators + Envelopes */}
        <div className="flex flex-col gap-2">
          {renderOscillatorTab()}
          {renderEnvelopeTab()}
        </div>
        {/* Right column: Filter + Modulation */}
        <div className="flex flex-col gap-2">
          {renderFilterTab()}
          {renderModulationTab()}
        </div>
      </div>
    </div>
  );
};
