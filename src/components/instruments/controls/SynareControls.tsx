import React, { useState, useRef, useEffect } from 'react';
import type { SynareConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { CustomSelect } from '@components/common/CustomSelect';
import { Drum, Activity, Waves, MoveDown, Speaker, Wind } from 'lucide-react';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { FilterFrequencyResponse } from '@components/instruments/shared';
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
  const { isCyan: isCyanTheme, accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors('#ffcc00', { knob: '#ff9900' });

  // Background styles
  const mainBg = isCyanTheme
    ? 'bg-[#030808]'
    : 'bg-gradient-to-b from-[#1e1e1e] to-[#151515]';
  const headerBg = isCyanTheme
    ? 'bg-[#041010] border-b-2 border-accent-highlight'
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
    <div className="grid grid-cols-4 gap-2 p-2">
      {/* Pitch & Tone Section */}
      <div className={`p-2 rounded-lg border ${panelBg}`} style={panelStyle}>
        <div className="flex items-center gap-2 mb-2">
          <Speaker size={16} className={isCyanTheme ? 'text-accent-highlight' : 'text-yellow-500'} />
          <h3 className={`font-bold ${isCyanTheme ? 'text-accent-highlight' : 'text-yellow-400'}`}>PITCH & TONE</h3>
        </div>
        
        <div className="flex flex-wrap gap-3 items-end">
          {/* Oscillator Type */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] font-bold text-text-muted uppercase">Wave</span>
            <div className="flex gap-1">
              {['square', 'pulse'].map((type) => (
                <button
                  key={type}
                  onClick={() => updateOsc({ type: type as 'square' | 'pulse' })}
                  className={`
                    px-2 py-1 text-[10px] font-bold rounded border uppercase
                    ${config.oscillator.type === type
                      ? `bg-dark-bgSecondary`
                      : 'bg-[#1a1a1a] border-dark-borderLight text-text-muted hover:border-dark-borderLight'
                    }
                  `}
                  style={config.oscillator.type === type ? { borderColor: accentColor, color: accentColor } : undefined}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <Knob
            paramKey="synare.tune"
            value={config.oscillator.tune}
            min={40}
            max={1000}
            onChange={(v) => updateOsc({ tune: v })}
            label="Tune"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}Hz`}
          />
          <Knob
            value={config.oscillator.fine}
            min={-100}
            max={100}
            onChange={(v) => updateOsc({ fine: v })}
            label="Fine"
            color={knobColor}
            bipolar
            defaultValue={0}
            formatValue={(v) => `${Math.round(v)}c`}
          />
          <Knob
            paramKey="synare.osc2Mix"
            value={config.oscillator2.enabled ? config.oscillator2.mix : 0}
            min={0}
            max={1}
            onChange={(v) => updateOsc2({ enabled: v > 0, mix: v })}
            label="Osc 2"
            color={knobColor}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            value={config.oscillator2.detune}
            min={-24}
            max={24}
            onChange={(v) => updateOsc2({ detune: v })}
            label="Detune"
            color={knobColor}
            bipolar
            defaultValue={0}
            formatValue={(v) => `${Math.round(v)}st`}
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
          <Knob
            value={config.envelope.sustain}
            min={0}
            max={1}
            onChange={(v) => updateEnv({ sustain: v })}
            label="Sustain"
            color={knobColor}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
      </div>

      {/* Noise Section */}
      <div className={`p-2 rounded-lg border ${panelBg}`} style={panelStyle}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Wind size={16} className={isCyanTheme ? 'text-accent-highlight' : 'text-yellow-500'} />
            <h3 className={`font-bold ${isCyanTheme ? 'text-accent-highlight' : 'text-yellow-400'}`}>NOISE</h3>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-text-muted">Enable</span>
            <input
              type="checkbox"
              checked={config.noise.enabled}
              onChange={(e) => updateNoise({ enabled: e.target.checked })}
              className={`w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? 'border-accent-highlight checked:bg-accent-highlight' : 'border-yellow-500 checked:bg-yellow-500'}`}
            />
          </label>
        </div>

        <div className={`flex flex-wrap gap-3 items-end transition-opacity ${config.noise.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          {/* Noise Type */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] font-bold text-text-muted uppercase">Type</span>
            <div className="flex gap-1">
              {['white', 'pink'].map((type) => (
                <button
                  key={type}
                  onClick={() => updateNoise({ type: type as 'white' | 'pink' })}
                  className={`
                    px-2 py-1 text-[10px] font-bold rounded border uppercase
                    ${config.noise.type === type
                      ? `bg-dark-bgSecondary`
                      : 'bg-[#1a1a1a] border-dark-borderLight text-text-muted hover:border-dark-borderLight'
                    }
                  `}
                  style={config.noise.type === type ? { borderColor: accentColor, color: accentColor } : undefined}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <Knob
            value={config.noise.mix}
            min={0}
            max={1}
            onChange={(v) => updateNoise({ mix: v })}
            label="Mix"
            color={knobColor}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            value={config.noise.color}
            min={0}
            max={100}
            onChange={(v) => updateNoise({ color: v })}
            label="Color"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}`}
          />
        </div>
      </div>

      {/* Sweep Section */}
      <div className={`p-2 rounded-lg border ${panelBg}`} style={panelStyle}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <MoveDown size={16} className={isCyanTheme ? 'text-accent-highlight' : 'text-yellow-500'} />
            <h3 className={`font-bold ${isCyanTheme ? 'text-accent-highlight' : 'text-yellow-400'}`}>PITCH SWEEP</h3>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-text-muted">Enable</span>
            <input
              type="checkbox"
              checked={config.sweep.enabled}
              onChange={(e) => updateSweep({ enabled: e.target.checked })}
              className={`w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? 'border-accent-highlight checked:bg-accent-highlight' : 'border-yellow-500 checked:bg-yellow-500'}`}
            />
          </label>
        </div>

        <div className={`flex flex-wrap gap-3 transition-opacity ${config.sweep.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <Knob
            paramKey="synare.sweepAmount"
            value={config.sweep.amount}
            min={0}
            max={48}
            onChange={(v) => updateSweep({ amount: v })}
            label="Range"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}st`}
          />
          <Knob
            paramKey="synare.sweepTime"
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
    <div className="grid grid-cols-4 gap-2 p-2">
      {/* Filter Section */}
      <div className={`p-2 rounded-lg border ${panelBg}`} style={panelStyle}>
        <div className="flex items-center gap-2 mb-2">
          <Activity size={16} className={isCyanTheme ? 'text-accent-highlight' : 'text-yellow-500'} />
          <h3 className={`font-bold ${isCyanTheme ? 'text-accent-highlight' : 'text-yellow-400'}`}>FILTER</h3>
        </div>
        
        <div className="flex flex-wrap gap-3 items-end">
          <Knob
            paramKey="synare.filterCutoff"
            value={config.filter.cutoff}
            min={20}
            max={10000}
            onChange={(v) => updateFilter({ cutoff: v })}
            label="Cutoff"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}Hz`}
          />
          <Knob
            paramKey="synare.filterReso"
            value={config.filter.resonance}
            min={0}
            max={100}
            onChange={(v) => updateFilter({ resonance: v })}
            label="Reso"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            paramKey="synare.filterEnvMod"
            value={config.filter.envMod}
            min={0}
            max={100}
            onChange={(v) => updateFilter({ envMod: v })}
            label="Env Mod"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            paramKey="synare.filterDecay"
            value={config.filter.decay}
            min={10}
            max={2000}
            onChange={(v) => updateFilter({ decay: v })}
            label="F-Decay"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}ms`}
          />
        </div>
        <div className="mt-2">
          <FilterFrequencyResponse
            filterType="lowpass"
            cutoff={Math.log10(Math.max(config.filter.cutoff, 20) / 20) / 3}
            resonance={config.filter.resonance / 100}
            poles={2} color={knobColor} width={300} height={56}
          />
        </div>
      </div>

      {/* LFO Section */}
      <div className={`p-2 rounded-lg border ${panelBg}`} style={panelStyle}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Waves size={16} className={isCyanTheme ? 'text-accent-highlight' : 'text-yellow-500'} />
            <h3 className={`font-bold ${isCyanTheme ? 'text-accent-highlight' : 'text-yellow-400'}`}>MODULATION</h3>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-text-muted">Enable</span>
            <input
              type="checkbox"
              checked={config.lfo.enabled}
              onChange={(e) => onChange({ lfo: { ...config.lfo, enabled: e.target.checked } })}
              className={`w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? 'border-accent-highlight checked:bg-accent-highlight' : 'border-yellow-500 checked:bg-yellow-500'}`}
            />
          </label>
        </div>

        <div className={`flex flex-wrap gap-3 transition-opacity ${config.lfo.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
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
            <span className="text-[10px] font-bold text-text-muted uppercase">Target</span>
            <CustomSelect
              value={config.lfo.target}
              onChange={(v) => onChange({ lfo: { ...config.lfo, target: v as 'pitch' | 'filter' | 'both' } })}
              options={[
                { value: 'pitch', label: 'Pitch' },
                { value: 'filter', label: 'Filter' },
                { value: 'both', label: 'Both' },
              ]}
              className="bg-dark-bg borderLight text-xs text-text-primary rounded px-1 py-0.5"
            />
          </div>

          {/* Momentary Throw Button */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] font-bold text-text-muted uppercase">Throw</span>
            <button
              onMouseDown={() => handleThrow(true)}
              onMouseUp={() => handleThrow(false)}
              onMouseLeave={() => handleThrow(false)}
              onTouchStart={() => handleThrow(true)}
              onTouchEnd={() => handleThrow(false)}
              className={`
                w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95
                ${isCyanTheme 
                  ? 'bg-accent-highlight/20 border-2 border-accent-highlight text-accent-highlight' 
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
            <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-accent-highlight' : 'text-text-secondary'}`}>Electronic Percussion</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-dark-border bg-dark-bg">
        {['main', 'mod'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as SynareTab)}
            className={`
              flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors
              ${activeTab === tab 
                ? `bg-[#252525] border-b-2` 
                : 'text-text-muted hover:text-text-secondary'
              }
            `}
            style={activeTab === tab ? { color: accentColor, borderColor: accentColor } : undefined}
          >
            {tab === 'main' ? 'Synth & Sweep' : 'Filter & LFO'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="synth-controls-flow flex-1 overflow-y-auto">
        {activeTab === 'main' ? renderMainTab() : renderModTab()}
      </div>
    </div>
  );
};
