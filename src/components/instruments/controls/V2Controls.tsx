import React, { useState, useRef, useEffect } from 'react';
import type { V2Config } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { Activity, Filter, Zap } from 'lucide-react';
import { useThemeStore } from '@stores';

interface V2ControlsProps {
  config: V2Config;
  onChange: (updates: Partial<V2Config>) => void;
}

type V2Tab = 'osc' | 'filter' | 'env' | 'mod';

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
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-gray-800';

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
    onChange({ envelope2: { ...config.envelope2, ...updates } });
  };

  const updateLFO1 = (updates: Partial<typeof config.lfo1>) => {
    onChange({ lfo1: { ...config.lfo1, ...updates } });
  };

  const OSC_MODES = ['Off', 'Saw/Tri', 'Pulse', 'Sin', 'Noise', 'XX', 'AuxA', 'AuxB'];
  const OSC23_MODES = ['Off', 'Tri', 'Pul', 'Sin', 'Noi', 'FM', 'AuxA', 'AuxB'];
  const FILTER_MODES = ['Off', 'Low', 'Band', 'High', 'Notch', 'All', 'MoogL', 'MoogH'];
  const ROUTING_MODES = ['Single', 'Serial', 'Parallel'];

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
            className="bg-gray-900 border border-gray-700 text-xs text-amber-400 rounded px-2 py-1"
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
              <span className="text-[10px] text-gray-500 uppercase">Ring</span>
              <input
                type="checkbox"
                checked={config.osc2.ringMod}
                onChange={(e) => updateOsc2({ ringMod: e.target.checked })}
                className="w-3 h-3 rounded border-gray-700 bg-transparent"
              />
            </label>
            <select
              value={config.osc2.mode}
              onChange={(e) => updateOsc2({ mode: parseInt(e.target.value) })}
              className="bg-gray-900 border border-gray-700 text-xs text-amber-400 rounded px-2 py-1"
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
              <span className="text-[10px] text-gray-500 uppercase">Ring</span>
              <input
                type="checkbox"
                checked={config.osc3.ringMod}
                onChange={(e) => updateOsc3({ ringMod: e.target.checked })}
                className="w-3 h-3 rounded border-gray-700 bg-transparent"
              />
            </label>
            <select
              value={config.osc3.mode}
              onChange={(e) => updateOsc3({ mode: parseInt(e.target.value) })}
              className="bg-gray-900 border border-gray-700 text-xs text-amber-400 rounded px-2 py-1"
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
            className="bg-gray-900 border border-gray-700 text-xs text-amber-400 rounded px-2 py-1"
          >
            {FILTER_MODES.map((mode, i) => (
              <option key={mode} value={i}>{mode}</option>
            ))}
          </select>
        </div>
        
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
            className="bg-gray-900 border border-gray-700 text-xs text-amber-400 rounded px-2 py-1"
          >
            {FILTER_MODES.map((mode, i) => (
              <option key={mode} value={i}>{mode}</option>
            ))}
          </select>
        </div>
        
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
            className="bg-gray-900 border border-gray-700 text-xs text-amber-400 rounded px-2 py-1"
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

  const renderModTab = () => (
    <div className="flex flex-col gap-4 p-4">
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-amber-500" />
          <h3 className="font-bold text-amber-400 uppercase tracking-tight">LFO 1</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-6 items-center gap-6">
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
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-gray-800 bg-[#151515]">
        {[
          { id: 'osc' as V2Tab, label: 'Oscillators', icon: Activity },
          { id: 'filter' as V2Tab, label: 'Filters', icon: Filter },
          { id: 'env' as V2Tab, label: 'Envelopes', icon: Zap },
          { id: 'mod' as V2Tab, label: 'Modulation', icon: Activity },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2
              ${activeTab === tab.id 
                ? `bg-[#252525] border-b-2` 
                : 'text-gray-500 hover:text-gray-300'
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
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'osc' ? renderOscTab() : 
         activeTab === 'filter' ? renderFilterTab() : 
         activeTab === 'env' ? renderEnvTab() :
         renderModTab()}
      </div>
    </div>
  );
};
