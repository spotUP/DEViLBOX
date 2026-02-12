import React, { useState } from 'react';
import type { DubSirenConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { Waves, Activity, Filter, Repeat, Speaker, Wind } from 'lucide-react';
import { useThemeStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';

interface DubSirenControlsProps {
  config: DubSirenConfig;
  instrumentId: number; // Added instrumentId
  onChange: (updates: Partial<DubSirenConfig>) => void;
}

type DubSirenTab = 'main' | 'fx';

export const DubSirenControls: React.FC<DubSirenControlsProps> = ({
  config,
  instrumentId,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<DubSirenTab>('main');
  
  // Theme-aware styling
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Colors based on theme
  const accentColor = isCyanTheme ? '#00ffff' : '#ff4444'; // Red for Dub Siren
  const knobColor = isCyanTheme ? '#00ffff' : '#ff8888';
  
  // Background styles
  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-gray-800';

  // Helper to update nested configs
  const updateOsc = (updates: Partial<typeof config.oscillator>) => {
    onChange({ oscillator: { ...config.oscillator, ...updates } });
  };

  const updateLFO = (updates: Partial<typeof config.lfo>) => {
    onChange({ lfo: { ...config.lfo, ...updates } });
  };

  const updateDelay = (updates: Partial<typeof config.delay>) => {
    // Clamp time to valid range [0, 1] to prevent Tone.js warnings
    if (updates.time !== undefined) {
      updates.time = Math.max(0, Math.min(1, updates.time));
    }
    onChange({ delay: { ...config.delay, ...updates } });
  };

  const updateReverb = (updates: Partial<typeof config.reverb>) => {
    onChange({ reverb: { ...config.reverb, ...updates } });
  };

  const updateFilter = (updates: Partial<typeof config.filter>) => {
    onChange({ filter: { ...config.filter, ...updates } });
  };

  const handleThrow = (active: boolean) => {
    const engine = getToneEngine();
    // Use the actual current wet value from config as the baseline
    const baseline = config.delay.enabled ? config.delay.wet : 0;
    engine.throwInstrumentToEffect(instrumentId, 'SpaceEcho', active ? 1.0 : baseline);
  };

  // Render Waveform Selector
  const renderWaveSelector = (
    currentType: string,
    onSelect: (type: 'sine' | 'square' | 'sawtooth' | 'triangle') => void,
    label: string
  ) => (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-bold text-gray-500 uppercase tracking-wide text-center">{label}</div>
      <div className="flex gap-2 justify-center">
        {['sine', 'square', 'sawtooth', 'triangle'].map((type) => (
          <button
            key={type}
            onClick={() => onSelect(type as 'sine' | 'square' | 'sawtooth' | 'triangle')}
            className={`
              w-10 h-10 rounded border transition-all flex items-center justify-center
              ${currentType === type
                ? `bg-[#2a2a2a]`
                : 'bg-[#1a1a1a] border-gray-700 hover:border-gray-500'
              }
            `}
            style={currentType === type ? { borderColor: accentColor, boxShadow: `0 0 10px ${accentColor}40` } : undefined}
            title={type}
          >
            {/* Simple Icons for waveforms */}
            {type === 'sine' && <Waves size={16} color={currentType === type ? accentColor : '#666'} />}
            {type === 'square' && <div className="w-4 h-4 border-t-2 border-r-2 border-b-0 border-l-2" style={{ borderColor: currentType === type ? accentColor : '#666' }} />}
            {type === 'sawtooth' && <Activity size={16} color={currentType === type ? accentColor : '#666'} />}
            {type === 'triangle' && <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-transparent border-b-current" style={{ color: currentType === type ? accentColor : '#666' }} />}
          </button>
        ))}
      </div>
    </div>
  );

  const renderMainTab = () => (
    <div className="flex flex-col gap-4 p-4">
      {/* Oscillator Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Speaker size={16} className={isCyanTheme ? 'text-cyan-500' : 'text-red-500'} />
          <h3 className={`font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-red-400'}`}>OSCILLATOR</h3>
        </div>
        
        <div className="flex flex-col md:flex-row gap-6 items-center gap-6">
          {renderWaveSelector(config.oscillator.type, (t) => updateOsc({ type: t }), "Waveform")}
          
          <Knob
            value={config.oscillator.frequency}
            min={60}
            max={1000}
            onChange={(v) => updateOsc({ frequency: v })}
            label="Freq"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}Hz`}
          />
        </div>
      </div>

      {/* LFO Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity size={16} className={isCyanTheme ? 'text-cyan-500' : 'text-red-500'} />
            <h3 className={`font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-red-400'}`}>LFO MODULATION</h3>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-gray-500">Enable</span>
            <input
              type="checkbox"
              checked={config.lfo.enabled}
              onChange={(e) => updateLFO({ enabled: e.target.checked })}
              className={`w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? 'border-cyan-500 checked:bg-cyan-500' : 'border-red-500 checked:bg-red-500'}`}
            />
          </label>
        </div>

        <div className={`transition-opacity ${config.lfo.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <div className="flex flex-col md:flex-row gap-6 items-center gap-6">
            {renderWaveSelector(config.lfo.type, (t) => updateLFO({ type: t }), "LFO Shape")}
            
            <Knob
              value={config.lfo.rate}
              min={0.1}
              max={20}
              onChange={(v) => updateLFO({ rate: v })}
              label="Rate"
              color={knobColor}
              formatValue={(v) => `${v.toFixed(1)}Hz`}
            />

            <Knob
              value={config.lfo.depth}
              min={0}
              max={500}
              onChange={(v) => updateLFO({ depth: v })}
              label="Depth"
              color={knobColor}
              formatValue={(v) => `${Math.round(v)}`}
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderFXTab = () => (
    <div className="flex flex-col gap-4 p-4">
      {/* Delay Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Repeat size={16} className={isCyanTheme ? 'text-cyan-500' : 'text-red-500'} />
            <h3 className={`font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-red-400'}`}>DELAY</h3>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-gray-500">Enable</span>
            <input
              type="checkbox"
              checked={config.delay.enabled}
              onChange={(e) => updateDelay({ enabled: e.target.checked })}
              className={`w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? 'border-cyan-500 checked:bg-cyan-500' : 'border-red-500 checked:bg-red-500'}`}
            />
          </label>
        </div>

        <div className={`flex gap-6 transition-opacity ${config.delay.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <Knob
            value={config.delay.time}
            min={0.01}
            max={1.0}
            onChange={(v) => updateDelay({ time: v })}
            label="Time"
            color={knobColor}
            formatValue={(v) => `${(v * 1000).toFixed(0)}ms`}
          />
          <Knob
            value={config.delay.feedback}
            min={0}
            max={0.95}
            onChange={(v) => updateDelay({ feedback: v })}
            label="Fdbk"
            color={knobColor}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            value={config.delay.wet}
            min={0}
            max={1}
            onChange={(v) => updateDelay({ wet: v })}
            label="Mix"
            color={knobColor}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          
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
                  : 'bg-red-500/20 border-2 border-red-500 text-red-500'}
                hover:shadow-[0_0_15px_rgba(239,68,68,0.4)]
              `}
              title="Momentary Delay Throw (Dub Style)"
            >
              <Wind size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter size={16} className={isCyanTheme ? 'text-cyan-500' : 'text-red-500'} />
            <h3 className={`font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-red-400'}`}>FILTER</h3>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-gray-500">Enable</span>
            <input
              type="checkbox"
              checked={config.filter.enabled}
              onChange={(e) => updateFilter({ enabled: e.target.checked })}
              className={`w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? 'border-cyan-500 checked:bg-cyan-500' : 'border-red-500 checked:bg-red-500'}`}
            />
          </label>
        </div>

        <div className={`flex flex-col items-center gap-4 transition-opacity ${config.filter.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          {/* Filter Type Buttons */}
          <div className="flex gap-2">
            {['lowpass', 'highpass', 'bandpass', 'notch'].map((type) => (
              <button
                key={type}
                onClick={() => updateFilter({ type: type as 'lowpass' | 'highpass' | 'bandpass' | 'notch' })}
                className={`
                  px-3 py-1 text-xs font-bold rounded border uppercase
                  ${config.filter.type === type
                    ? `bg-[#2a2a2a]`
                    : 'bg-[#1a1a1a] border-gray-700 text-gray-500 hover:border-gray-500'
                  }
                `}
                style={config.filter.type === type ? { borderColor: accentColor, color: accentColor } : undefined}
              >
                {type}
              </button>
            ))}
          </div>

          <Knob
            value={config.filter.frequency}
            min={20}
            max={10000}
            onChange={(v) => updateFilter({ frequency: v })}
            label="Cutoff"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}Hz`}
          />
        </div>
      </div>

      {/* Reverb Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Waves size={16} className={isCyanTheme ? 'text-cyan-500' : 'text-red-500'} />
            <h3 className={`font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-red-400'}`}>REVERB</h3>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-gray-500">Enable</span>
            <input
              type="checkbox"
              checked={config.reverb.enabled}
              onChange={(e) => updateReverb({ enabled: e.target.checked })}
              className={`w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? 'border-cyan-500 checked:bg-cyan-500' : 'border-red-500 checked:bg-red-500'}`}
            />
          </label>
        </div>

        <div className={`flex gap-6 transition-opacity ${config.reverb.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <Knob
            value={config.reverb.decay}
            min={0.1}
            max={10.0}
            onChange={(v) => updateReverb({ decay: v })}
            label="Decay"
            color={knobColor}
            formatValue={(v) => `${v.toFixed(1)}s`}
          />
          <Knob
            value={config.reverb.wet}
            min={0}
            max={1}
            onChange={(v) => updateReverb({ wet: v })}
            label="Mix"
            color={knobColor}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-gray-800 bg-[#151515]">
        <button
          onClick={() => setActiveTab('main')}
          className={`
            flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors
            ${activeTab === 'main' 
              ? `bg-[#252525] border-b-2` 
              : 'text-gray-500 hover:text-gray-300'
            }
          `}
          style={activeTab === 'main' ? { color: accentColor, borderColor: accentColor } : undefined}
        >
          Oscillator & LFO
        </button>
        <button
          onClick={() => setActiveTab('fx')}
          className={`
            flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors
            ${activeTab === 'fx' 
              ? `bg-[#252525] border-b-2` 
              : 'text-gray-500 hover:text-gray-300'
            }
          `}
          style={activeTab === 'fx' ? { color: accentColor, borderColor: accentColor } : undefined}
        >
          Effects & Filter
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'main' ? renderMainTab() : renderFXTab()}
      </div>
    </div>
  );
};
