import React, { useState, useRef, useEffect } from 'react';
import type { V2Config } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { Activity, Filter, Zap } from 'lucide-react';
import { useThemeStore } from '@stores';
import { FilterFrequencyResponse, EnvelopeVisualization } from '@components/instruments/shared';

// Maps FILTER_MODES index ('Off','Low','Band','High','Notch','All','MoogL','MoogH')
// to a biquad approximation. null = filter bypassed (Off), no curve drawn.
const V2_FILTER_MAP: Array<{ type: 'lowpass' | 'highpass' | 'bandpass' | 'notch'; poles: 2 | 4 } | null> = [
  null,                              // Off
  { type: 'lowpass',  poles: 2 },   // Low
  { type: 'bandpass', poles: 2 },   // Band
  { type: 'highpass', poles: 2 },   // High
  { type: 'notch',    poles: 2 },   // Notch
  { type: 'lowpass',  poles: 2 },   // All (all-pass, approximate)
  { type: 'lowpass',  poles: 4 },   // MoogL
  { type: 'highpass', poles: 4 },   // MoogH
];

interface V2ControlsProps {
  config: V2Config;
  onChange: (updates: Partial<V2Config>) => void;
}

type V2Tab = 'osc' | 'filter' | 'env' | 'mod' | 'fx';

export const V2Controls: React.FC<V2ControlsProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<V2Tab>('osc');
  
  // Use ref to prevent stale closures in callbacks
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  // Theme-aware styling
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Colors based on theme
  const accentColor = isCyanTheme ? '#00ffff' : '#ffaa00'; // Amber/Orange for V2
  const knobColor = isCyanTheme ? '#00ffff' : '#ffcc33';
  
  // Background styles
  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-accent-highlight/20'
    : 'bg-[#1a1a1a] border-dark-border';

  // Helpers to update nested configs
  const updateOsc1 = (updates: Partial<typeof config.osc1>) => {
    onChange({ osc1: { ...configRef.current.osc1, ...updates } });
  };

  const updateOsc2 = (updates: Partial<typeof config.osc2>) => {
    onChange({ osc2: { ...configRef.current.osc2, ...updates } });
  };

  const updateOsc3 = (updates: Partial<typeof config.osc3>) => {
    onChange({ osc3: { ...configRef.current.osc3, ...updates } });
  };

  const updateFilter1 = (updates: Partial<typeof config.filter1>) => {
    onChange({ filter1: { ...configRef.current.filter1, ...updates } });
  };

  const updateFilter2 = (updates: Partial<typeof config.filter2>) => {
    onChange({ filter2: { ...configRef.current.filter2, ...updates } });
  };

  const updateRouting = (updates: Partial<typeof config.routing>) => {
    onChange({ routing: { ...configRef.current.routing, ...updates } });
  };

  const updateEnv = (updates: Partial<typeof config.envelope>) => {
    onChange({ envelope: { ...configRef.current.envelope, ...updates } });
  };

  const updateEnv2 = (updates: Partial<typeof config.envelope2>) => {
    onChange({ envelope2: { ...configRef.current.envelope2, ...updates } });
  };

  const updateLFO1 = (updates: Partial<typeof config.lfo1>) => {
    onChange({ lfo1: { ...configRef.current.lfo1, ...updates } });
  };

  const updateLFO2 = (updates: Partial<NonNullable<typeof config.lfo2>>) => {
    onChange({ lfo2: { ...(configRef.current.lfo2 ?? { mode: 1, keySync: true, envMode: false, rate: 64, phase: 2, polarity: 0, amplify: 127 }), ...updates } });
  };

  const updateVoiceDist = (updates: Partial<NonNullable<typeof config.voiceDistortion>>) => {
    onChange({ voiceDistortion: { ...(configRef.current.voiceDistortion ?? { mode: 0, inGain: 32, param1: 0, param2: 64 }), ...updates } });
  };

  const updateChanDist = (updates: Partial<NonNullable<typeof config.channelDistortion>>) => {
    onChange({ channelDistortion: { ...(configRef.current.channelDistortion ?? { mode: 0, inGain: 32, param1: 100, param2: 64 }), ...updates } });
  };

  const updateChorus = (updates: Partial<NonNullable<typeof config.chorusFlanger>>) => {
    onChange({ chorusFlanger: { ...(configRef.current.chorusFlanger ?? { amount: 64, feedback: 64, delayL: 32, delayR: 32, modRate: 0, modDepth: 0, modPhase: 64 }), ...updates } });
  };

  const updateCompressor = (updates: Partial<NonNullable<typeof config.compressor>>) => {
    onChange({ compressor: { ...(configRef.current.compressor ?? { mode: 0, stereoLink: false, autoGain: true, lookahead: 2, threshold: 90, ratio: 32, attack: 20, release: 64, outGain: 64 }), ...updates } });
  };

  const OSC_MODES = ['Off', 'Saw/Tri', 'Pulse', 'Sin', 'Noise', 'XX', 'AuxA', 'AuxB'];
  const OSC23_MODES = ['Off', 'Tri', 'Pul', 'Sin', 'Noi', 'FM', 'AuxA', 'AuxB'];
  const FILTER_MODES = ['Off', 'Low', 'Band', 'High', 'Notch', 'All', 'MoogL', 'MoogH'];
  const ROUTING_MODES = ['Single', 'Serial', 'Parallel'];
  const DIST_MODES = ['Off', 'Overdrive', 'Clip', 'Bitcrush', 'Decimate', 'LPF', 'BPF', 'HPF', 'Notch', 'Allpass', 'MoogL'];
  const COMP_MODES = ['Off', 'Peak', 'RMS'];
  const LFO_MODES = ['Saw', 'Tri', 'Pulse', 'Sin', 'S&H'];
  const LFO_POLARITY = ['Pos', 'Neg', 'Bipolar'];

  const renderOscTab = () => (
    <div className="flex flex-col gap-4 p-4">
      {/* Osc 1 Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-amber-500" />
            <h3 className="font-bold text-amber-400 uppercase tracking-tight">OSCILLATOR 1</h3>
          </div>
          <select
            value={config.osc1.mode}
            onChange={(e) => updateOsc1({ mode: parseInt(e.target.value) })}
            className="bg-dark-bgSecondary border border-dark-borderLight text-xs text-amber-400 rounded px-2 py-1"
          >
            {OSC_MODES.map((mode, i) => (
              <option key={mode} value={i}>{mode}</option>
            ))}
          </select>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-center gap-6">
          <Knob
            value={config.osc1.transpose}
            min={-64}
            max={63}
            onChange={(v) => updateOsc1({ transpose: v })}
            label="Trans"
            color={knobColor}
            formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}`}
          />
          <Knob
            value={config.osc1.detune}
            min={-64}
            max={63}
            onChange={(v) => updateOsc1({ detune: v })}
            label="Detune"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}c`}
          />
          <Knob
            value={config.osc1.color}
            min={0}
            max={127}
            onChange={(v) => updateOsc1({ color: v })}
            label="Color"
            color={knobColor}
          />
          <Knob
            value={config.osc1.level}
            min={0}
            max={127}
            onChange={(v) => updateOsc1({ level: v })}
            label="Level"
            color={knobColor}
          />
        </div>
      </div>

      {/* Osc 2 Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-amber-500" />
            <h3 className="font-bold text-amber-400 uppercase tracking-tight">OSCILLATOR 2</h3>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 cursor-pointer">
              <span className="text-[10px] text-text-muted uppercase">Ring</span>
              <input
                type="checkbox"
                checked={config.osc2.ringMod}
                onChange={(e) => updateOsc2({ ringMod: e.target.checked })}
                className="w-3 h-3 rounded border-dark-borderLight bg-transparent"
              />
            </label>
            <select
              value={config.osc2.mode}
              onChange={(e) => updateOsc2({ mode: parseInt(e.target.value) })}
              className="bg-dark-bgSecondary border border-dark-borderLight text-xs text-amber-400 rounded px-2 py-1"
            >
              {OSC23_MODES.map((mode, i) => (
                <option key={mode} value={i}>{mode}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-center gap-6">
          <Knob
            value={config.osc2.transpose}
            min={-64}
            max={63}
            onChange={(v) => updateOsc2({ transpose: v })}
            label="Trans"
            color={knobColor}
            formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}`}
          />
          <Knob
            value={config.osc2.detune}
            min={-64}
            max={63}
            onChange={(v) => updateOsc2({ detune: v })}
            label="Detune"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}c`}
          />
          <Knob
            value={config.osc2.color}
            min={0}
            max={127}
            onChange={(v) => updateOsc2({ color: v })}
            label="Color"
            color={knobColor}
          />
          <Knob
            value={config.osc2.level}
            min={0}
            max={127}
            onChange={(v) => updateOsc2({ level: v })}
            label="Level"
            color={knobColor}
          />
        </div>
      </div>

      {/* Osc 3 Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-amber-500" />
            <h3 className="font-bold text-amber-400 uppercase tracking-tight">OSCILLATOR 3</h3>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 cursor-pointer">
              <span className="text-[10px] text-text-muted uppercase">Ring</span>
              <input
                type="checkbox"
                checked={config.osc3.ringMod}
                onChange={(e) => updateOsc3({ ringMod: e.target.checked })}
                className="w-3 h-3 rounded border-dark-borderLight bg-transparent"
              />
            </label>
            <select
              value={config.osc3.mode}
              onChange={(e) => updateOsc3({ mode: parseInt(e.target.value) })}
              className="bg-dark-bgSecondary border border-dark-borderLight text-xs text-amber-400 rounded px-2 py-1"
            >
              {OSC23_MODES.map((mode, i) => (
                <option key={mode} value={i}>{mode}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-center gap-6">
          <Knob
            value={config.osc3.transpose}
            min={-64}
            max={63}
            onChange={(v) => updateOsc3({ transpose: v })}
            label="Trans"
            color={knobColor}
            formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}`}
          />
          <Knob
            value={config.osc3.detune}
            min={-64}
            max={63}
            onChange={(v) => updateOsc3({ detune: v })}
            label="Detune"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}c`}
          />
          <Knob
            value={config.osc3.color}
            min={0}
            max={127}
            onChange={(v) => updateOsc3({ color: v })}
            label="Color"
            color={knobColor}
          />
          <Knob
            value={config.osc3.level}
            min={0}
            max={127}
            onChange={(v) => updateOsc3({ level: v })}
            label="Level"
            color={knobColor}
          />
        </div>
      </div>
    </div>
  );

  const renderFilterTab = () => (
    <div className="flex flex-col gap-4 p-4">
      {/* Filter 1 */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-amber-500" />
            <h3 className="font-bold text-amber-400 uppercase tracking-tight">VCF 1</h3>
          </div>
          <select
            value={config.filter1.mode}
            onChange={(e) => updateFilter1({ mode: parseInt(e.target.value) })}
            className="bg-dark-bgSecondary border border-dark-borderLight text-xs text-amber-400 rounded px-2 py-1"
          >
            {FILTER_MODES.map((mode, i) => (
              <option key={mode} value={i}>{mode}</option>
            ))}
          </select>
        </div>
        {(() => {
          const entry = V2_FILTER_MAP[config.filter1.mode];
          if (!entry) return null;
          return (
            <div className="mb-3">
              <FilterFrequencyResponse
                filterType={entry.type} cutoff={config.filter1.cutoff / 127}
                resonance={config.filter1.resonance / 127} poles={entry.poles}
                color={knobColor} width={280} height={56}
              />
            </div>
          );
        })()}
        <div className="grid grid-cols-2 gap-6 items-center gap-6">
          <Knob
            value={config.filter1.cutoff}
            min={0}
            max={127}
            onChange={(v) => updateFilter1({ cutoff: v })}
            label="Cutoff"
            color={knobColor}
          />
          <Knob
            value={config.filter1.resonance}
            min={0}
            max={127}
            onChange={(v) => updateFilter1({ resonance: v })}
            label="Reso"
            color={knobColor}
          />
        </div>
      </div>

      {/* Filter 2 */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-amber-500" />
            <h3 className="font-bold text-amber-400 uppercase tracking-tight">VCF 2</h3>
          </div>
          <select
            value={config.filter2.mode}
            onChange={(e) => updateFilter2({ mode: parseInt(e.target.value) })}
            className="bg-dark-bgSecondary border border-dark-borderLight text-xs text-amber-400 rounded px-2 py-1"
          >
            {FILTER_MODES.map((mode, i) => (
              <option key={mode} value={i}>{mode}</option>
            ))}
          </select>
        </div>
        {(() => {
          const entry = V2_FILTER_MAP[config.filter2.mode];
          if (!entry) return null;
          return (
            <div className="mb-3">
              <FilterFrequencyResponse
                filterType={entry.type} cutoff={config.filter2.cutoff / 127}
                resonance={config.filter2.resonance / 127} poles={entry.poles}
                color={knobColor} width={280} height={56}
              />
            </div>
          );
        })()}
        <div className="grid grid-cols-2 gap-6 items-center gap-6">
          <Knob
            value={config.filter2.cutoff}
            min={0}
            max={127}
            onChange={(v) => updateFilter2({ cutoff: v })}
            label="Cutoff"
            color={knobColor}
          />
          <Knob
            value={config.filter2.resonance}
            min={0}
            max={127}
            onChange={(v) => updateFilter2({ resonance: v })}
            label="Reso"
            color={knobColor}
          />
        </div>
      </div>

      {/* Routing */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-amber-500" />
            <h3 className="font-bold text-amber-400 uppercase tracking-tight">ROUTING</h3>
          </div>
          <select
            value={config.routing.mode}
            onChange={(e) => updateRouting({ mode: parseInt(e.target.value) })}
            className="bg-dark-bgSecondary border border-dark-borderLight text-xs text-amber-400 rounded px-2 py-1"
          >
            {ROUTING_MODES.map((mode, i) => (
              <option key={mode} value={i}>{mode}</option>
            ))}
          </select>
        </div>
        
        <div className="flex gap-6 items-center">
          <Knob
            value={config.routing.balance}
            min={0}
            max={127}
            onChange={(v) => updateRouting({ balance: v })}
            label="Balance"
            color={knobColor}
            formatValue={(v) => v < 64 ? `F1:${Math.round((64-v)/64*100)}%` : `F2:${Math.round((v-64)/64*100)}%`}
          />
        </div>
      </div>
    </div>
  );

  const renderEnvTab = () => (
    <div className="flex flex-col gap-4 p-4">
      {/* Amp Env */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} className="text-amber-500" />
          <h3 className="font-bold text-amber-400 uppercase tracking-tight">AMP ENVELOPE (EG 1)</h3>
        </div>

        <div className="mb-3">
          <EnvelopeVisualization
            mode="linear"
            attack={config.envelope.attack / 127}
            decay={config.envelope.decay / 127}
            sustain={config.envelope.sustain / 127}
            release={config.envelope.release / 127}
            color={knobColor}
            width={300} height={56}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-center gap-6">
          <Knob
            value={config.envelope.attack}
            min={0}
            max={127}
            onChange={(v) => updateEnv({ attack: v })}
            label="Attack"
            color={knobColor}
          />
          <Knob
            value={config.envelope.decay}
            min={0}
            max={127}
            onChange={(v) => updateEnv({ decay: v })}
            label="Decay"
            color={knobColor}
          />
          <Knob
            value={config.envelope.sustain}
            min={0}
            max={127}
            onChange={(v) => updateEnv({ sustain: v })}
            label="Sustain"
            color={knobColor}
          />
          <Knob
            value={config.envelope.release}
            min={0}
            max={127}
            onChange={(v) => updateEnv({ release: v })}
            label="Release"
            color={knobColor}
          />
        </div>
      </div>

      {/* Env 2 */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} className="text-amber-500" />
          <h3 className="font-bold text-amber-400 uppercase tracking-tight">MOD ENVELOPE (EG 2)</h3>
        </div>

        <div className="mb-3">
          <EnvelopeVisualization
            mode="linear"
            attack={config.envelope2.attack / 127}
            decay={config.envelope2.decay / 127}
            sustain={config.envelope2.sustain / 127}
            release={config.envelope2.release / 127}
            color={knobColor}
            width={300} height={56}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-center gap-6">
          <Knob
            value={config.envelope2.attack}
            min={0}
            max={127}
            onChange={(v) => updateEnv2({ attack: v })}
            label="Attack"
            color={knobColor}
          />
          <Knob
            value={config.envelope2.decay}
            min={0}
            max={127}
            onChange={(v) => updateEnv2({ decay: v })}
            label="Decay"
            color={knobColor}
          />
          <Knob
            value={config.envelope2.sustain}
            min={0}
            max={127}
            onChange={(v) => updateEnv2({ sustain: v })}
            label="Sustain"
            color={knobColor}
          />
          <Knob
            value={config.envelope2.release}
            min={0}
            max={127}
            onChange={(v) => updateEnv2({ release: v })}
            label="Release"
            color={knobColor}
          />
        </div>
      </div>
    </div>
  );

  const renderModTab = () => {
    const lfo2 = config.lfo2 ?? { mode: 1, keySync: true, envMode: false, rate: 64, phase: 2, polarity: 0, amplify: 127 };
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className={`p-4 rounded-xl border ${panelBg}`}>
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-amber-500" />
            <h3 className="font-bold text-amber-400 uppercase tracking-tight">LFO 1</h3>
          </div>

          <div className="grid grid-cols-2 gap-6 items-center">
            <Knob
              value={config.lfo1.rate}
              min={0}
              max={127}
              onChange={(v) => updateLFO1({ rate: v })}
              label="Rate"
              color={knobColor}
            />
            <Knob
              value={config.lfo1.depth}
              min={0}
              max={127}
              onChange={(v) => updateLFO1({ depth: v })}
              label="Depth"
              color={knobColor}
            />
          </div>
        </div>

        {/* LFO 2 */}
        <div className={`p-4 rounded-xl border ${panelBg}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-amber-500" />
              <h3 className="font-bold text-amber-400 uppercase tracking-tight">LFO 2</h3>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={lfo2.mode}
                onChange={(e) => updateLFO2({ mode: parseInt(e.target.value) })}
                className="bg-dark-bgSecondary border border-dark-borderLight text-xs text-amber-400 rounded px-2 py-1"
              >
                {LFO_MODES.map((mode, i) => (
                  <option key={mode} value={i}>{mode}</option>
                ))}
              </select>
              <select
                value={lfo2.polarity}
                onChange={(e) => updateLFO2({ polarity: parseInt(e.target.value) })}
                className="bg-dark-bgSecondary border border-dark-borderLight text-xs text-amber-400 rounded px-2 py-1"
              >
                {LFO_POLARITY.map((p, i) => (
                  <option key={p} value={i}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <label className="flex items-center gap-1 cursor-pointer">
              <span className="text-[10px] text-text-muted uppercase">KeySync</span>
              <input
                type="checkbox"
                checked={lfo2.keySync}
                onChange={(e) => updateLFO2({ keySync: e.target.checked })}
                className="w-3 h-3 rounded border-dark-borderLight bg-transparent"
              />
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <span className="text-[10px] text-text-muted uppercase">Env</span>
              <input
                type="checkbox"
                checked={lfo2.envMode}
                onChange={(e) => updateLFO2({ envMode: e.target.checked })}
                className="w-3 h-3 rounded border-dark-borderLight bg-transparent"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 items-center">
            <Knob
              value={lfo2.rate}
              min={0}
              max={127}
              onChange={(v) => updateLFO2({ rate: v })}
              label="Rate"
              color={knobColor}
            />
            <Knob
              value={lfo2.phase}
              min={0}
              max={127}
              onChange={(v) => updateLFO2({ phase: v })}
              label="Phase"
              color={knobColor}
            />
            <Knob
              value={lfo2.amplify}
              min={0}
              max={127}
              onChange={(v) => updateLFO2({ amplify: v })}
              label="Amplify"
              color={knobColor}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderFxTab = () => {
    const vDist = config.voiceDistortion ?? { mode: 0, inGain: 32, param1: 0, param2: 64 };
    const cDist = config.channelDistortion ?? { mode: 0, inGain: 32, param1: 100, param2: 64 };
    const chorus = config.chorusFlanger ?? { amount: 64, feedback: 64, delayL: 32, delayR: 32, modRate: 0, modDepth: 0, modPhase: 64 };
    const comp = config.compressor ?? { mode: 0, stereoLink: false, autoGain: true, lookahead: 2, threshold: 90, ratio: 32, attack: 20, release: 64, outGain: 64 };
    return (
      <div className="flex flex-col gap-4 p-4">
        {/* Voice Distortion */}
        <div className={`p-4 rounded-xl border ${panelBg}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-amber-500" />
              <h3 className="font-bold text-amber-400 uppercase tracking-tight">VOICE DISTORTION</h3>
            </div>
            <select
              value={vDist.mode}
              onChange={(e) => updateVoiceDist({ mode: parseInt(e.target.value) })}
              className="bg-dark-bgSecondary border border-dark-borderLight text-xs text-amber-400 rounded px-2 py-1"
            >
              {DIST_MODES.map((mode, i) => (
                <option key={mode} value={i}>{mode}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-6 items-center">
            <Knob
              value={vDist.inGain}
              min={0}
              max={127}
              onChange={(v) => updateVoiceDist({ inGain: v })}
              label="InGain"
              color={knobColor}
            />
            <Knob
              value={vDist.param1}
              min={0}
              max={127}
              onChange={(v) => updateVoiceDist({ param1: v })}
              label="Param 1"
              color={knobColor}
            />
            <Knob
              value={vDist.param2}
              min={0}
              max={127}
              onChange={(v) => updateVoiceDist({ param2: v })}
              label="Param 2"
              color={knobColor}
            />
          </div>
        </div>

        {/* Channel Distortion */}
        <div className={`p-4 rounded-xl border ${panelBg}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-amber-500" />
              <h3 className="font-bold text-amber-400 uppercase tracking-tight">CHANNEL DISTORTION</h3>
            </div>
            <select
              value={cDist.mode}
              onChange={(e) => updateChanDist({ mode: parseInt(e.target.value) })}
              className="bg-dark-bgSecondary border border-dark-borderLight text-xs text-amber-400 rounded px-2 py-1"
            >
              {DIST_MODES.map((mode, i) => (
                <option key={mode} value={i}>{mode}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-6 items-center">
            <Knob
              value={cDist.inGain}
              min={0}
              max={127}
              onChange={(v) => updateChanDist({ inGain: v })}
              label="InGain"
              color={knobColor}
            />
            <Knob
              value={cDist.param1}
              min={0}
              max={127}
              onChange={(v) => updateChanDist({ param1: v })}
              label="Param 1"
              color={knobColor}
            />
            <Knob
              value={cDist.param2}
              min={0}
              max={127}
              onChange={(v) => updateChanDist({ param2: v })}
              label="Param 2"
              color={knobColor}
            />
          </div>
        </div>

        {/* Chorus/Flanger */}
        <div className={`p-4 rounded-xl border ${panelBg}`}>
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-amber-500" />
            <h3 className="font-bold text-amber-400 uppercase tracking-tight">CHORUS / FLANGER</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-center">
            <Knob
              value={chorus.amount}
              min={0}
              max={127}
              onChange={(v) => updateChorus({ amount: v })}
              label="Amount"
              color={knobColor}
            />
            <Knob
              value={chorus.feedback}
              min={0}
              max={127}
              onChange={(v) => updateChorus({ feedback: v })}
              label="Feedback"
              color={knobColor}
            />
            <Knob
              value={chorus.delayL}
              min={1}
              max={127}
              onChange={(v) => updateChorus({ delayL: v })}
              label="Delay L"
              color={knobColor}
            />
            <Knob
              value={chorus.delayR}
              min={1}
              max={127}
              onChange={(v) => updateChorus({ delayR: v })}
              label="Delay R"
              color={knobColor}
            />
          </div>
          <div className="grid grid-cols-3 gap-6 items-center mt-4">
            <Knob
              value={chorus.modRate}
              min={0}
              max={127}
              onChange={(v) => updateChorus({ modRate: v })}
              label="Mod Rate"
              color={knobColor}
            />
            <Knob
              value={chorus.modDepth}
              min={0}
              max={127}
              onChange={(v) => updateChorus({ modDepth: v })}
              label="Mod Depth"
              color={knobColor}
            />
            <Knob
              value={chorus.modPhase}
              min={0}
              max={127}
              onChange={(v) => updateChorus({ modPhase: v })}
              label="Mod Phase"
              color={knobColor}
            />
          </div>
        </div>

        {/* Compressor */}
        <div className={`p-4 rounded-xl border ${panelBg}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-amber-500" />
              <h3 className="font-bold text-amber-400 uppercase tracking-tight">COMPRESSOR</h3>
            </div>
            <select
              value={comp.mode}
              onChange={(e) => updateCompressor({ mode: parseInt(e.target.value) })}
              className="bg-dark-bgSecondary border border-dark-borderLight text-xs text-amber-400 rounded px-2 py-1"
            >
              {COMP_MODES.map((mode, i) => (
                <option key={mode} value={i}>{mode}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <label className="flex items-center gap-1 cursor-pointer">
              <span className="text-[10px] text-text-muted uppercase">Stereo Link</span>
              <input
                type="checkbox"
                checked={comp.stereoLink}
                onChange={(e) => updateCompressor({ stereoLink: e.target.checked })}
                className="w-3 h-3 rounded border-dark-borderLight bg-transparent"
              />
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <span className="text-[10px] text-text-muted uppercase">AutoGain</span>
              <input
                type="checkbox"
                checked={comp.autoGain}
                onChange={(e) => updateCompressor({ autoGain: e.target.checked })}
                className="w-3 h-3 rounded border-dark-borderLight bg-transparent"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 items-center">
            <Knob
              value={comp.threshold}
              min={0}
              max={127}
              onChange={(v) => updateCompressor({ threshold: v })}
              label="Threshold"
              color={knobColor}
            />
            <Knob
              value={comp.ratio}
              min={0}
              max={127}
              onChange={(v) => updateCompressor({ ratio: v })}
              label="Ratio"
              color={knobColor}
            />
            <Knob
              value={comp.attack}
              min={0}
              max={127}
              onChange={(v) => updateCompressor({ attack: v })}
              label="Attack"
              color={knobColor}
            />
            <Knob
              value={comp.release}
              min={0}
              max={127}
              onChange={(v) => updateCompressor({ release: v })}
              label="Release"
              color={knobColor}
            />
            <Knob
              value={comp.outGain}
              min={0}
              max={127}
              onChange={(v) => updateCompressor({ outGain: v })}
              label="Out Gain"
              color={knobColor}
            />
            <Knob
              value={comp.lookahead}
              min={0}
              max={10}
              onChange={(v) => updateCompressor({ lookahead: v })}
              label="Lookahead"
              color={knobColor}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-dark-border bg-[#151515]">
        {[
          { id: 'osc' as V2Tab, label: 'Oscillators', icon: Activity },
          { id: 'filter' as V2Tab, label: 'Filters', icon: Filter },
          { id: 'env' as V2Tab, label: 'Envelopes', icon: Zap },
          { id: 'fx' as V2Tab, label: 'FX', icon: Zap },
          { id: 'mod' as V2Tab, label: 'Modulation', icon: Activity },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2
              ${activeTab === tab.id 
                ? `bg-[#252525] border-b-2` 
                : 'text-text-muted hover:text-text-secondary'
              }
            `}
            style={activeTab === tab.id ? { color: accentColor, borderColor: accentColor } : undefined}
          >
            <tab.icon size={12} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="synth-controls-flow flex-1 overflow-y-auto">
        {activeTab === 'osc' ? renderOscTab() :
         activeTab === 'filter' ? renderFilterTab() :
         activeTab === 'env' ? renderEnvTab() :
         activeTab === 'fx' ? renderFxTab() :
         renderModTab()}
      </div>
    </div>
  );
};
