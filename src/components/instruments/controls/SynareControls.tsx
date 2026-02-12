import React, { useState, useRef, useEffect } from 'react';
import type { SynareConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { Drum, Activity, Waves, MoveDown, Speaker, Wind } from 'lucide-react';
import { useThemeStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';

interface SynareControlsProps {
  config: SynareConfig;
  instrumentId: number;
  onChange: (updates: Partial<SynareConfig>) => void;
}

type SynareTab = 'main' | 'mod';

export const SynareControls: React.FC<SynareControlsProps> = ({
  config,
  instrumentId,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<SynareTab>('main');
  
  // Use ref to prevent stale closures in callbacks
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  // Theme-aware styling
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Colors based on theme
  const accentColor = isCyanTheme ? '#00ffff' : '#ffcc00'; // Yellow for Synare
  const knobColor = isCyanTheme ? '#00ffff' : '#ff9900';
  
  // Background styles
  const mainBg = isCyanTheme
    ? 'bg-[#030808]'
    : 'bg-gradient-to-b from-[#1e1e1e] to-[#151515]';
  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-gray-800';
  const headerBg = isCyanTheme
    ? 'bg-[#041010] border-b-2 border-cyan-500'
    : 'bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#ffcc00]';

  // Helpers
  const updateOsc = (updates: Partial<typeof config.oscillator>) => {
    onChange({ oscillator: { ...configRef.current.oscillator, ...updates } });
  };

  const updateOsc2 = (updates: Partial<typeof config.oscillator2>) => {
    onChange({ oscillator2: { ...configRef.current.oscillator2, ...updates } });
  };

  const updateNoise = (updates: Partial<typeof config.noise>) => {
    onChange({ noise: { ...configRef.current.noise, ...updates } });
  };

  const updateFilter = (updates: Partial<typeof config.filter>) => {
    onChange({ filter: { ...configRef.current.filter, ...updates } });
  };

  const updateEnv = (updates: Partial<typeof config.envelope>) => {
    onChange({ envelope: { ...configRef.current.envelope, ...updates } });
  };

  const updateSweep = (updates: Partial<typeof config.sweep>) => {
    onChange({ sweep: { ...configRef.current.sweep, ...updates } });
  };

  const handleThrow = (active: boolean) => {
    const engine = getToneEngine();
    // Use Reverb as the target for Synare (default effect)
    // Baseline is 0.3 (30%) as set in our default effects
    engine.throwInstrumentToEffect(instrumentId, 'Reverb', active ? 0.9 : 0.3);
  };

  const renderMainTab = () => (
    <div className="flex flex-col gap-4 p-4">
      {/* Pitch & Tone Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Speaker size={16} className={isCyanTheme ? 'text-cyan-500' : 'text-yellow-500'} />
          <h3 className={`font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-yellow-400'}`}>PITCH & TONE</h3>
        </div>
        
        <div className="flex flex-wrap gap-6 items-end">
          <Knob
            value={config.oscillator.tune}
            min={40}
            max={1000}
            onChange={(v) => updateOsc({ tune: v })}
            label="Tune"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}Hz`}
          />
          <Knob
            value={config.oscillator2.enabled ? config.oscillator2.mix : 0}
            min={0}
            max={1}
            onChange={(v) => updateOsc2({ enabled: v > 0, mix: v })}
            label="Osc 2"
            color={knobColor}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            value={config.noise.mix}
            min={0}
            max={1}
            onChange={(v) => updateNoise({ mix: v })}
            label="Noise"
            color={knobColor}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            value={config.envelope.decay}
            min={10}
            max={2000}
            onChange={(v) => updateEnv({ decay: v })}
            label="Decay"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}ms`}
          />
        </div>
      </div>

      {/* Sweep Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MoveDown size={16} className={isCyanTheme ? 'text-cyan-500' : 'text-yellow-500'} />
            <h3 className={`font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-yellow-400'}`}>PITCH SWEEP</h3>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-gray-500">Enable</span>
            <input
              type="checkbox"
              checked={config.sweep.enabled}
              onChange={(e) => updateSweep({ enabled: e.target.checked })}
              className={`w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? 'border-cyan-500 checked:bg-cyan-500' : 'border-yellow-500 checked:bg-yellow-500'}`}
            />
          </label>
        </div>

        <div className={`flex flex-wrap gap-6 transition-opacity ${config.sweep.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <Knob
            value={config.sweep.amount}
            min={0}
            max={48}
            onChange={(v) => updateSweep({ amount: v })}
            label="Range"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}st`}
          />
          <Knob
            value={config.sweep.time}
            min={10}
            max={1000}
            onChange={(v) => updateSweep({ time: v })}
            label="Time"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}ms`}
          />
        </div>
      </div>
    </div>
  );

  const renderModTab = () => (
    <div className="flex flex-col gap-4 p-4">
      {/* Filter Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className={isCyanTheme ? 'text-cyan-500' : 'text-yellow-500'} />
          <h3 className={`font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-yellow-400'}`}>FILTER</h3>
        </div>
        
        <div className="flex flex-wrap gap-6 items-end">
          <Knob
            value={config.filter.cutoff}
            min={20}
            max={10000}
            onChange={(v) => updateFilter({ cutoff: v })}
            label="Cutoff"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}Hz`}
          />
          <Knob
            value={config.filter.resonance}
            min={0}
            max={100}
            onChange={(v) => updateFilter({ resonance: v })}
            label="Reso"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={config.filter.envMod}
            min={0}
            max={100}
            onChange={(v) => updateFilter({ envMod: v })}
            label="Env Mod"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={config.filter.decay}
            min={10}
            max={2000}
            onChange={(v) => updateFilter({ decay: v })}
            label="F-Decay"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}ms`}
          />
        </div>
      </div>

      {/* LFO Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Waves size={16} className={isCyanTheme ? 'text-cyan-500' : 'text-yellow-500'} />
            <h3 className={`font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-yellow-400'}`}>MODULATION</h3>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-gray-500">Enable</span>
            <input
              type="checkbox"
              checked={config.lfo.enabled}
              onChange={(e) => onChange({ lfo: { ...config.lfo, enabled: e.target.checked } })}
              className={`w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? 'border-cyan-500 checked:bg-cyan-500' : 'border-yellow-500 checked:bg-yellow-500'}`}
            />
          </label>
        </div>

        <div className={`flex flex-wrap gap-6 transition-opacity ${config.lfo.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <Knob
            value={config.lfo.rate}
            min={0.1}
            max={20}
            onChange={(v) => onChange({ lfo: { ...config.lfo, rate: v } })}
            label="Rate"
            color={knobColor}
            formatValue={(v) => `${v.toFixed(1)}Hz`}
          />
          <Knob
            value={config.lfo.depth}
            min={0}
            max={100}
            onChange={(v) => onChange({ lfo: { ...config.lfo, depth: v } })}
            label="Depth"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}%`}
          />
          
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase">Target</span>
            <select
              value={config.lfo.target}
              onChange={(e) => onChange({ lfo: { ...config.lfo, target: e.target.value as 'pitch' | 'filter' | 'both' } })}
              className="bg-[#151515] border border-gray-700 text-xs text-text-primary rounded px-1 py-0.5"
            >
              <option value="pitch">Pitch</option>
              <option value="filter">Filter</option>
              <option value="both">Both</option>
            </select>
          </div>

          {/* Momentary Throw Button */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase">Throw</span>
            <button
              onMouseDown={() => handleThrow(true)}
              onMouseUp={() => handleThrow(false)}
              onMouseLeave={() => handleThrow(false)}
              onTouchStart={() => handleThrow(true)}
              onTouchEnd={() => handleThrow(false)}
              className={`
                w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95
                ${isCyanTheme 
                  ? 'bg-cyan-500/20 border-2 border-cyan-500 text-cyan-400' 
                  : 'bg-yellow-500/20 border-2 border-yellow-500 text-yellow-500'}
                hover:shadow-[0_0_15px_rgba(255,204,0,0.4)]
              `}
              title="Momentary Reverb Throw"
            >
              <Wind size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`synth-editor-container ${mainBg} flex flex-col h-full`}>
      {/* Header */}
      <div className={`synth-editor-header px-4 py-3 ${headerBg}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-700 shadow-lg text-black">
            <Drum size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight" style={{ color: accentColor }}>SYNARE 3</h2>
            <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-cyan-600' : 'text-gray-400'}`}>Electronic Percussion</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 bg-[#151515]">
        {['main', 'mod'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as SynareTab)}
            className={`
              flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors
              ${activeTab === tab 
                ? `bg-[#252525] border-b-2` 
                : 'text-gray-500 hover:text-gray-300'
              }
            `}
            style={activeTab === tab ? { color: accentColor, borderColor: accentColor } : undefined}
          >
            {tab === 'main' ? 'Synth & Sweep' : 'Filter & LFO'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'main' ? renderMainTab() : renderModTab()}
      </div>
    </div>
  );
};
