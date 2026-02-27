import React, { useState, useRef, useEffect } from 'react';
import type { SpaceLaserConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { Zap, Activity, Filter, Repeat, Waves, Wind } from 'lucide-react';
import { useThemeStore } from '@stores';
import { FilterFrequencyResponse } from '@components/instruments/shared';

interface SpaceLaserControlsProps {
  config: SpaceLaserConfig;
  onChange: (updates: Partial<SpaceLaserConfig>) => void;
}

type SpaceLaserTab = 'laser' | 'fm' | 'fx';

export const SpaceLaserControls: React.FC<SpaceLaserControlsProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<SpaceLaserTab>('laser');
  
  // Use ref to prevent stale closures in callbacks
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  // Theme-aware styling
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Colors based on theme
  const accentColor = isCyanTheme ? '#00ffff' : '#00ff00'; // Green for Space Laser
  const knobColor = isCyanTheme ? '#00ffff' : '#88ff88';
  
  // Background styles
  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-gray-800';

  // Helper to update nested configs
  const updateLaser = (updates: Partial<typeof config.laser>) => {
    onChange({ laser: { ...configRef.current.laser, ...updates } });
  };

  const updateFM = (updates: Partial<typeof config.fm>) => {
    onChange({ fm: { ...configRef.current.fm, ...updates } });
  };

  const updateNoise = (updates: Partial<typeof config.noise>) => {
    onChange({ noise: { ...configRef.current.noise, ...updates } });
  };

  const updateDelay = (updates: Partial<typeof config.delay>) => {
    onChange({ delay: { ...configRef.current.delay, ...updates } });
  };

  const updateReverb = (updates: Partial<typeof config.reverb>) => {
    onChange({ reverb: { ...configRef.current.reverb, ...updates } });
  };

  const updateFilter = (updates: Partial<typeof config.filter>) => {
    onChange({ filter: { ...configRef.current.filter, ...updates } });
  };

  const renderLaserTab = () => (
    <div className="flex flex-col gap-4 p-4">
      {/* Laser Sweep Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} className={isCyanTheme ? 'text-cyan-500' : 'text-green-500'} />
          <h3 className={`font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-green-400'}`}>LASER SWEEP</h3>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-center gap-6">
          <Knob
            value={config.laser.startFreq}
            min={100}
            max={10000}
            onChange={(v) => updateLaser({ startFreq: v })}
            label="Start"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}Hz`}
          />
          <Knob
            value={config.laser.endFreq}
            min={20}
            max={2000}
            onChange={(v) => updateLaser({ endFreq: v })}
            label="End"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}Hz`}
          />
          <Knob
            value={config.laser.sweepTime}
            min={10}
            max={2000}
            onChange={(v) => updateLaser({ sweepTime: v })}
            label="Time"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}ms`}
          />
          
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase">Curve</span>
            <div className="flex gap-1">
              {['exponential', 'linear'].map((curve) => (
                <button
                  key={curve}
                  onClick={() => updateLaser({ sweepCurve: curve as 'exponential' | 'linear' })}
                  className={`
                    px-2 py-1 text-[10px] font-bold rounded border uppercase
                    ${config.laser.sweepCurve === curve
                      ? `bg-[#2a2a2a]`
                      : 'bg-[#1a1a1a] border-gray-700 text-gray-500 hover:border-gray-500'
                    }
                  `}
                  style={config.laser.sweepCurve === curve ? { borderColor: accentColor, color: accentColor } : undefined}
                >
                  {curve.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Noise Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Wind size={16} className={isCyanTheme ? 'text-cyan-500' : 'text-green-500'} />
          <h3 className={`font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-green-400'}`}>NOISE GRIT</h3>
        </div>
        
        <div className="flex gap-6 items-center">
          <Knob
            value={config.noise.amount}
            min={0}
            max={100}
            onChange={(v) => updateNoise({ amount: v })}
            label="Amount"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}%`}
          />
          
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase">Type</span>
            <div className="flex gap-1">
              {['white', 'pink', 'brown'].map((type) => (
                <button
                  key={type}
                  onClick={() => updateNoise({ type: type as 'white' | 'pink' | 'brown' })}
                  className={`
                    px-2 py-1 text-[10px] font-bold rounded border uppercase
                    ${config.noise.type === type
                      ? `bg-[#2a2a2a]`
                      : 'bg-[#1a1a1a] border-gray-700 text-gray-500 hover:border-gray-500'
                    }
                  `}
                  style={config.noise.type === type ? { borderColor: accentColor, color: accentColor } : undefined}
                >
                  {type[0]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderFMTab = () => (
    <div className="flex flex-col gap-4 p-4">
      {/* FM Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className={isCyanTheme ? 'text-cyan-500' : 'text-green-500'} />
          <h3 className={`font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-green-400'}`}>FM MODULATION</h3>
        </div>
        
        <div className="flex gap-6 items-center">
          <Knob
            value={config.fm.amount}
            min={0}
            max={100}
            onChange={(v) => updateFM({ amount: v })}
            label="Index"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}`}
          />
          <Knob
            value={config.fm.ratio}
            min={0.5}
            max={16}
            onChange={(v) => updateFM({ ratio: v })}
            label="Ratio"
            color={knobColor}
            formatValue={(v) => `${v.toFixed(2)}`}
          />
        </div>
      </div>

      {/* Filter Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className={isCyanTheme ? 'text-cyan-500' : 'text-green-500'} />
          <h3 className={`font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-green-400'}`}>FILTER</h3>
        </div>

        <div className="flex flex-col items-center gap-4">
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
                {type.slice(0, 4)}
              </button>
            ))}
          </div>

          <FilterFrequencyResponse
            filterType={config.filter.type}
            cutoff={Math.log10(Math.max(config.filter.cutoff, 20) / 20) / 3}
            resonance={config.filter.resonance / 100}
            poles={2} color={accentColor} width={300} height={56}
          />

          <div className="flex gap-6 w-full">
            <Knob
              value={config.filter.cutoff}
              min={20}
              max={15000}
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
            <Repeat size={16} className={isCyanTheme ? 'text-cyan-500' : 'text-green-500'} />
            <h3 className={`font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-green-400'}`}>SPACE DELAY</h3>
          </div>
          <input
            type="checkbox"
            checked={config.delay.enabled}
            onChange={(e) => updateDelay({ enabled: e.target.checked })}
            className={`w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? 'border-cyan-500 checked:bg-cyan-500' : 'border-green-500 checked:bg-green-500'}`}
          />
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
        </div>
      </div>

      {/* Reverb Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Waves size={16} className={isCyanTheme ? 'text-cyan-500' : 'text-green-500'} />
            <h3 className={`font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-green-400'}`}>COSMIC REVERB</h3>
          </div>
          <input
            type="checkbox"
            checked={config.reverb.enabled}
            onChange={(e) => updateReverb({ enabled: e.target.checked })}
            className={`w-4 h-4 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? 'border-cyan-500 checked:bg-cyan-500' : 'border-green-500 checked:bg-green-500'}`}
          />
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
          onClick={() => setActiveTab('laser')}
          className={`
            flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors
            ${activeTab === 'laser' 
              ? `bg-[#252525] border-b-2` 
              : 'text-gray-500 hover:text-gray-300'
            }
          `}
          style={activeTab === 'laser' ? { color: accentColor, borderColor: accentColor } : undefined}
        >
          Laser & Noise
        </button>
        <button
          onClick={() => setActiveTab('fm')}
          className={`
            flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors
            ${activeTab === 'fm' 
              ? `bg-[#252525] border-b-2` 
              : 'text-gray-500 hover:text-gray-300'
            }
          `}
          style={activeTab === 'fm' ? { color: accentColor, borderColor: accentColor } : undefined}
        >
          FM & Filter
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
          Space FX
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'laser' ? renderLaserTab() : activeTab === 'fm' ? renderFMTab() : renderFXTab()}
      </div>
    </div>
  );
};
