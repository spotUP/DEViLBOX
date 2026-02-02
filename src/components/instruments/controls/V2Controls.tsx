import React, { useState } from 'react';
import type { V2Config } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { Activity, Filter, Zap } from 'lucide-react';
import { useThemeStore } from '@stores';

interface V2ControlsProps {
  config: V2Config;
  onChange: (updates: Partial<V2Config>) => void;
}

type V2Tab = 'osc' | 'filter' | 'env';

export const V2Controls: React.FC<V2ControlsProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<V2Tab>('osc');

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

  // Helper to update nested configs
  const updateOsc1 = (updates: Partial<typeof config.osc1>) => {
    onChange({ osc1: { ...config.osc1, ...updates } });
  };

  const updateFilter = (updates: Partial<typeof config.filter>) => {
    onChange({ filter: { ...config.filter, ...updates } });
  };

  const updateEnv = (updates: Partial<typeof config.envelope>) => {
    onChange({ envelope: { ...config.envelope, ...updates } });
  };

  const renderOscTab = () => (
    <div className="flex flex-col gap-4 p-4">
      {/* Osc 1 Section */}
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-amber-500" />
          <h3 className="font-bold text-amber-400">OSCILLATOR 1</h3>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-center justify-around">
          <Knob
            value={config.osc1.transpose}
            min={-24}
            max={24}
            onChange={(v) => updateOsc1({ transpose: v })}
            label="Transpose"
            color={knobColor}
            formatValue={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}`}
          />
          <Knob
            value={config.osc1.detune}
            min={-100}
            max={100}
            onChange={(v) => updateOsc1({ detune: v })}
            label="Detune"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}c`}
          />
          <Knob
            value={config.osc1.level}
            min={0}
            max={127}
            onChange={(v) => updateOsc1({ level: v })}
            label="Level"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}`}
          />
        </div>
      </div>

      {/* Placeholder for Osc 2/3 */}
      <div className="text-[10px] text-gray-600 uppercase text-center italic">
        Oscillator 2, 3 and Modulation available in full patch editor
      </div>
    </div>
  );

  const renderFilterTab = () => (
    <div className="flex flex-col gap-4 p-4">
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-amber-500" />
          <h3 className="font-bold text-amber-400">VCF 1</h3>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 items-center justify-around">
          <Knob
            value={config.filter.cutoff}
            min={0}
            max={127}
            onChange={(v) => updateFilter({ cutoff: v })}
            label="Cutoff"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}`}
          />
          <Knob
            value={config.filter.resonance}
            min={0}
            max={127}
            onChange={(v) => updateFilter({ resonance: v })}
            label="Reso"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}`}
          />
          <Knob
            value={config.filter.envMod}
            min={0}
            max={127}
            onChange={(v) => updateFilter({ envMod: v })}
            label="Env Mod"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}`}
          />
        </div>
      </div>
    </div>
  );

  const renderEnvTab = () => (
    <div className="flex flex-col gap-4 p-4">
      <div className={`p-4 rounded-xl border ${panelBg}`}>
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} className="text-amber-500" />
          <h3 className="font-bold text-amber-400">AMP ENVELOPE</h3>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-center justify-around">
          <Knob
            value={config.envelope.attack}
            min={0}
            max={127}
            onChange={(v) => updateEnv({ attack: v })}
            label="Attack"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}`}
          />
          <Knob
            value={config.envelope.decay}
            min={0}
            max={127}
            onChange={(v) => updateEnv({ decay: v })}
            label="Decay"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}`}
          />
          <Knob
            value={config.envelope.sustain}
            min={0}
            max={127}
            onChange={(v) => updateEnv({ sustain: v })}
            label="Sustain"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}`}
          />
          <Knob
            value={config.envelope.release}
            min={0}
            max={127}
            onChange={(v) => updateEnv({ release: v })}
            label="Release"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}`}
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
        {activeTab === 'osc' ? renderOscTab() : activeTab === 'filter' ? renderFilterTab() : renderEnvTab()}
      </div>
    </div>
  );
};
