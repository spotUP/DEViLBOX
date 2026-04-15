import React, { useRef, useEffect, useCallback } from 'react';
import type { DubSirenConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { Waves, Activity, Filter, Repeat, Speaker, Wind } from 'lucide-react';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { getToneEngine } from '@engine/ToneEngine';
import { FilterFrequencyResponse } from '@components/instruments/shared';
import type { FilterType } from '@components/instruments/shared';

interface DubSirenControlsProps {
  config: DubSirenConfig;
  instrumentId: number;
  onChange: (updates: Partial<DubSirenConfig>) => void;
}

export const DubSirenControls: React.FC<DubSirenControlsProps> = ({
  config,
  instrumentId,
  onChange,
}) => {
  // Ref pattern: avoid stale state during rapid knob drags
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const { isCyan: isCyanTheme, accent: accentColor, knob: knobColor, panelBg, panelStyle } = useInstrumentColors('#ff4444', { knob: '#ff8888' });

  const updateOsc = useCallback((updates: Partial<typeof config.oscillator>) => {
    onChange({ oscillator: { ...configRef.current.oscillator, ...updates } });
  }, [onChange]);

  const updateLFO = useCallback((updates: Partial<typeof config.lfo>) => {
    onChange({ lfo: { ...configRef.current.lfo, ...updates } });
  }, [onChange]);

  const updateDelay = useCallback((updates: Partial<typeof config.delay>) => {
    if (updates.time !== undefined) {
      updates.time = Math.max(0, Math.min(1, updates.time));
    }
    onChange({ delay: { ...configRef.current.delay, ...updates } });
  }, [onChange]);

  const updateReverb = useCallback((updates: Partial<typeof config.reverb>) => {
    onChange({ reverb: { ...configRef.current.reverb, ...updates } });
  }, [onChange]);

  const updateFilter = useCallback((updates: Partial<typeof config.filter>) => {
    onChange({ filter: { ...configRef.current.filter, ...updates } });
  }, [onChange]);

  const handleThrow = useCallback((active: boolean) => {
    const engine = getToneEngine();
    const baseline = configRef.current.delay.enabled ? configRef.current.delay.wet : 0;
    engine.throwInstrumentToEffect(instrumentId, 'SpaceEcho', active ? 1.0 : baseline);
  }, [instrumentId]);

  const renderWaveSelector = (
    currentType: string,
    onSelect: (type: 'sine' | 'square' | 'sawtooth' | 'triangle') => void,
    label: string
  ) => (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] font-bold text-text-muted uppercase tracking-wide text-center">{label}</div>
      <div className="flex gap-1.5 justify-center">
        {['sine', 'square', 'sawtooth', 'triangle'].map((type) => (
          <button
            key={type}
            onClick={() => onSelect(type as 'sine' | 'square' | 'sawtooth' | 'triangle')}
            className={`
              w-9 h-9 rounded border transition-all flex items-center justify-center
              ${currentType === type
                ? `bg-dark-bgSecondary`
                : 'bg-[#1a1a1a] border-dark-borderLight hover:border-dark-borderLight'
              }
            `}
            style={currentType === type ? { borderColor: accentColor, boxShadow: `0 0 10px ${accentColor}40` } : undefined}
            title={type}
          >
            {type === 'sine' && <Waves size={14} color={currentType === type ? accentColor : '#666'} />}
            {type === 'square' && <div className="w-3.5 h-3.5 border-t-2 border-r-2 border-b-0 border-l-2" style={{ borderColor: currentType === type ? accentColor : '#666' }} />}
            {type === 'sawtooth' && <Activity size={14} color={currentType === type ? accentColor : '#666'} />}
            {type === 'triangle' && <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-transparent border-b-current" style={{ color: currentType === type ? accentColor : '#666' }} />}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 p-3 synth-controls-flow overflow-y-auto">
      {/* Oscillator */}
      <div className={`p-3 rounded-lg border ${panelBg}`} style={panelStyle}>
        <div className="flex items-center gap-2 mb-3">
          <Speaker size={14} className={isCyanTheme ? 'text-accent-highlight' : 'text-red-500'} />
          <h3 className={`text-sm font-bold ${isCyanTheme ? 'text-accent-highlight' : 'text-red-400'}`}>OSCILLATOR</h3>
        </div>
        <div className="flex items-center gap-6">
          {renderWaveSelector(config.oscillator.type, (t) => updateOsc({ type: t }), "Waveform")}
          <Knob value={config.oscillator.frequency} min={60} max={1000} onChange={(v) => updateOsc({ frequency: v })} label="Freq" color={knobColor} formatValue={(v) => `${Math.round(v)}Hz`} />
        </div>
      </div>

      {/* LFO */}
      <div className={`p-3 rounded-lg border ${panelBg}`} style={panelStyle}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity size={14} className={isCyanTheme ? 'text-accent-highlight' : 'text-red-500'} />
            <h3 className={`text-sm font-bold ${isCyanTheme ? 'text-accent-highlight' : 'text-red-400'}`}>LFO</h3>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-[10px] text-text-muted">Enable</span>
            <input type="checkbox" checked={config.lfo.enabled} onChange={(e) => updateLFO({ enabled: e.target.checked })}
              className={`w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? 'border-accent-highlight checked:bg-accent-highlight' : 'border-red-500 checked:bg-red-500'}`} />
          </label>
        </div>
        <div className={`flex items-center gap-6 transition-opacity ${config.lfo.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          {renderWaveSelector(config.lfo.type, (t) => updateLFO({ type: t }), "Shape")}
          <Knob value={config.lfo.rate} min={0.1} max={20} onChange={(v) => updateLFO({ rate: v })} label="Rate" color={knobColor} formatValue={(v) => `${v.toFixed(1)}Hz`} />
          <Knob value={config.lfo.depth} min={0} max={500} onChange={(v) => updateLFO({ depth: v })} label="Depth" color={knobColor} formatValue={(v) => `${Math.round(v)}`} />
        </div>
      </div>

      {/* Delay */}
      <div className={`p-3 rounded-lg border ${panelBg}`} style={panelStyle}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Repeat size={14} className={isCyanTheme ? 'text-accent-highlight' : 'text-red-500'} />
            <h3 className={`text-sm font-bold ${isCyanTheme ? 'text-accent-highlight' : 'text-red-400'}`}>DELAY</h3>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-[10px] text-text-muted">Enable</span>
            <input type="checkbox" checked={config.delay.enabled} onChange={(e) => updateDelay({ enabled: e.target.checked })}
              className={`w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? 'border-accent-highlight checked:bg-accent-highlight' : 'border-red-500 checked:bg-red-500'}`} />
          </label>
        </div>
        <div className={`flex items-center gap-6 transition-opacity ${config.delay.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <Knob value={config.delay.time} min={0.01} max={1.0} onChange={(v) => updateDelay({ time: v })} label="Time" color={knobColor} formatValue={(v) => `${(v * 1000).toFixed(0)}ms`} />
          <Knob value={config.delay.feedback} min={0} max={0.95} onChange={(v) => updateDelay({ feedback: v })} label="Fdbk" color={knobColor} formatValue={(v) => `${Math.round(v * 100)}%`} />
          <Knob value={config.delay.wet} min={0} max={1} onChange={(v) => updateDelay({ wet: v })} label="Mix" color={knobColor} formatValue={(v) => `${Math.round(v * 100)}%`} />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold text-text-muted uppercase">Throw</span>
            <button
              onMouseDown={() => handleThrow(true)} onMouseUp={() => handleThrow(false)} onMouseLeave={() => handleThrow(false)}
              onTouchStart={() => handleThrow(true)} onTouchEnd={() => handleThrow(false)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95
                ${isCyanTheme ? 'bg-accent-highlight/20 border-2 border-accent-highlight text-accent-highlight' : 'bg-red-500/20 border-2 border-red-500 text-red-500'}
                hover:shadow-[0_0_15px_rgba(239,68,68,0.4)]`}
              title="Momentary Delay Throw (Dub Style)"
            >
              <Wind size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Filter + Reverb side by side */}
      <div className="grid grid-cols-2 gap-3">
        {/* Filter */}
        <div className={`p-3 rounded-lg border ${panelBg}`} style={panelStyle}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter size={14} className={isCyanTheme ? 'text-accent-highlight' : 'text-red-500'} />
              <h3 className={`text-sm font-bold ${isCyanTheme ? 'text-accent-highlight' : 'text-red-400'}`}>FILTER</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-[10px] text-text-muted">Enable</span>
              <input type="checkbox" checked={config.filter.enabled} onChange={(e) => updateFilter({ enabled: e.target.checked })}
                className={`w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? 'border-accent-highlight checked:bg-accent-highlight' : 'border-red-500 checked:bg-red-500'}`} />
            </label>
          </div>
          <div className={`flex flex-col gap-3 transition-opacity ${config.filter.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div className="flex gap-1.5 flex-wrap">
              {['lowpass', 'highpass', 'bandpass', 'notch'].map((type) => (
                <button key={type} onClick={() => updateFilter({ type: type as 'lowpass' | 'highpass' | 'bandpass' | 'notch' })}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded border uppercase ${config.filter.type === type ? 'bg-dark-bgSecondary' : 'bg-[#1a1a1a] border-dark-borderLight text-text-muted'}`}
                  style={config.filter.type === type ? { borderColor: accentColor, color: accentColor } : undefined}>{type}</button>
              ))}
            </div>
            <div className="flex gap-1.5">
              {([-12, -24, -48, -96] as const).map((roll) => (
                <button key={roll} onClick={() => updateFilter({ rolloff: roll })}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded border ${config.filter.rolloff === roll ? 'bg-dark-bgSecondary' : 'bg-[#1a1a1a] border-dark-borderLight text-text-muted'}`}
                  style={config.filter.rolloff === roll ? { borderColor: accentColor, color: accentColor } : undefined}>{roll}dB</button>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <Knob value={config.filter.frequency} min={20} max={10000} onChange={(v) => updateFilter({ frequency: v })} label="Cutoff" color={knobColor} formatValue={(v) => `${Math.round(v)}Hz`} />
              <FilterFrequencyResponse filterType={config.filter.type as FilterType} cutoff={Math.log10(Math.max(config.filter.frequency, 20) / 20) / 3} resonance={0} poles={2} color={knobColor} width={180} height={50} />
            </div>
          </div>
        </div>

        {/* Reverb */}
        <div className={`p-3 rounded-lg border ${panelBg}`} style={panelStyle}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Waves size={14} className={isCyanTheme ? 'text-accent-highlight' : 'text-red-500'} />
              <h3 className={`text-sm font-bold ${isCyanTheme ? 'text-accent-highlight' : 'text-red-400'}`}>REVERB</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-[10px] text-text-muted">Enable</span>
              <input type="checkbox" checked={config.reverb.enabled} onChange={(e) => updateReverb({ enabled: e.target.checked })}
                className={`w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? 'border-accent-highlight checked:bg-accent-highlight' : 'border-red-500 checked:bg-red-500'}`} />
            </label>
          </div>
          <div className={`flex items-center gap-6 transition-opacity ${config.reverb.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <Knob value={config.reverb.decay} min={0.1} max={10.0} onChange={(v) => updateReverb({ decay: v })} label="Decay" color={knobColor} formatValue={(v) => `${v.toFixed(1)}s`} />
            <Knob value={config.reverb.wet} min={0} max={1} onChange={(v) => updateReverb({ wet: v })} label="Mix" color={knobColor} formatValue={(v) => `${Math.round(v * 100)}%`} />
          </div>
        </div>
      </div>
    </div>
  );
};
