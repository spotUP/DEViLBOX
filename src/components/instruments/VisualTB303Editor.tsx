/**
 * VisualTB303Editor - VST-style TB-303 acid synthesizer editor
 * Classic silver panel design with authentic knob layout
 *
 * REFACTORED: Now uses tab-based layout to fit all controls on screen without scrolling
 */

import React, { useState } from 'react';
import type { TB303Config } from '@typedefs/instrument';
import { Knob } from '@components/controls/Knob';
import { FilterCurve } from '@components/ui/FilterCurve';
import { Zap } from 'lucide-react';
import { useThemeStore } from '@stores';
import { TB303Tabs, type TB303Tab } from './SynthEditorTabs';

interface VisualTB303EditorProps {
  config: TB303Config;
  onChange: (updates: Partial<TB303Config>) => void;
}

export const VisualTB303Editor: React.FC<VisualTB303EditorProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<TB303Tab>('main');

  // Theme-aware styling
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Colors based on theme
  const accentColor = isCyanTheme ? '#00ffff' : '#ffcc00';
  const knobColor = isCyanTheme ? '#00ffff' : '#ff6600';
  const accentKnobColor = isCyanTheme ? '#00ffff' : '#ff0066';
  const devilFishColor = isCyanTheme ? '#00ffff' : '#ff3333';
  const filterColor = isCyanTheme ? '#00ffff' : '#ff6600';

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

  // Update helpers
  const updateFilter = (key: string, value: number) => {
    onChange({
      filter: { ...config.filter, [key]: value },
    });
  };

  const updateFilterEnvelope = (key: string, value: number) => {
    onChange({
      filterEnvelope: { ...config.filterEnvelope, [key]: value },
    });
  };

  const updateAccent = (key: string, value: number) => {
    onChange({
      accent: { ...config.accent, [key]: value },
    });
  };

  const updateDevilFish = (key: string, value: any) => {
    const currentDF = config.devilFish || {
      enabled: false,
      normalDecay: 200,
      accentDecay: 200,
      vegDecay: 3000,
      vegSustain: 0,
      softAttack: 0.3,
      filterTracking: 0,
      filterFM: 0,
      sweepSpeed: 'normal' as const,
      accentSweepEnabled: true,
      highResonance: false,
      muffler: 'off' as const,
    };
    onChange({
      devilFish: { ...currentDF, [key]: value },
    });
  };

  const updateOverdrive = (value: number) => {
    const currentOD = config.overdrive || { amount: 0 };
    onChange({
      overdrive: { ...currentOD, amount: value },
    });
  };

  // Render main tab content
  const renderMainTab = () => (
    <div className="tb303-tab-content">
      {/* Waveform Selection */}
      <div className="flex justify-center gap-3">
        <button
          onClick={() => onChange({ oscillator: { ...config.oscillator, type: 'sawtooth' } })}
          className={`
            w-20 h-14 rounded-lg border-4 transition-all shadow-lg
            ${config.oscillator.type === 'sawtooth'
              ? `bg-[#1a1a1a] shadow-lg`
              : 'bg-[#2a2a2a] border-gray-600 hover:border-gray-400'
            }
          `}
          style={config.oscillator.type === 'sawtooth' ? { borderColor: accentColor, boxShadow: `0 4px 15px ${accentColor}30` } : undefined}
        >
          <svg viewBox="0 0 40 24" className="w-full h-full p-2">
            <path
              d="M 4 12 L 4 4 L 20 20 L 20 4 L 36 20"
              fill="none"
              stroke={config.oscillator.type === 'sawtooth' ? accentColor : '#666'}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <div className="text-xs font-bold" style={{ color: config.oscillator.type === 'sawtooth' ? accentColor : '#6b7280' }}>
            SAW
          </div>
        </button>
        <button
          onClick={() => onChange({ oscillator: { ...config.oscillator, type: 'square' } })}
          className={`
            w-20 h-14 rounded-lg border-4 transition-all shadow-lg
            ${config.oscillator.type === 'square'
              ? `bg-[#1a1a1a] shadow-lg`
              : 'bg-[#2a2a2a] border-gray-600 hover:border-gray-400'
            }
          `}
          style={config.oscillator.type === 'square' ? { borderColor: accentColor, boxShadow: `0 4px 15px ${accentColor}30` } : undefined}
        >
          <svg viewBox="0 0 40 24" className="w-full h-full p-2">
            <path
              d="M 4 20 L 4 4 L 20 4 L 20 20 L 36 20 L 36 4"
              fill="none"
              stroke={config.oscillator.type === 'square' ? accentColor : '#666'}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <div className="text-xs font-bold" style={{ color: config.oscillator.type === 'square' ? accentColor : '#6b7280' }}>
            SQR
          </div>
        </button>
      </div>

      {/* Main Knobs Row */}
      <div className={`rounded-xl p-4 shadow-inner border ${panelBg}`}>
        <div className="flex justify-around items-end">
          <Knob
            value={config.filter.cutoff}
            min={50}
            max={18000}
            onChange={(v) => updateFilter('cutoff', v)}
            label="Cutoff"
            color={knobColor}
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`}
          />
          <Knob
            value={config.filter.resonance}
            min={0}
            max={100}
            onChange={(v) => updateFilter('resonance', v)}
            label="Reso"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={config.filterEnvelope.envMod}
            min={0}
            max={100}
            onChange={(v) => updateFilterEnvelope('envMod', v)}
            label="Env Mod"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}%`}
          />
          <Knob
            value={
              config.devilFish?.enabled
                ? (config.devilFish?.vegDecay ?? 3000)
                : config.filterEnvelope.decay
            }
            min={30}
            max={3000}
            onChange={(v) => {
              if (config.devilFish?.enabled) {
                updateDevilFish('vegDecay', v);
              } else {
                updateFilterEnvelope('decay', v);
              }
            }}
            label={config.devilFish?.enabled ? 'VEG Dec' : 'MEG Dec'}
            color={knobColor}
            formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`}
          />
          <Knob
            value={config.accent.amount}
            min={0}
            max={100}
            onChange={(v) => updateAccent('amount', v)}
            label="Accent"
            color={accentKnobColor}
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </div>

      {/* Slide Control */}
      <div className="bg-[#1a1a1a] rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded flex items-center justify-center font-black text-sm ${isCyanTheme ? 'bg-gradient-to-b from-cyan-400 to-cyan-600 text-black' : 'bg-gradient-to-b from-cyan-400 to-cyan-600 text-white'}`}>
                S
              </div>
              <div className={`text-xs font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-cyan-400'}`}>Slide</div>
            </div>
            <div className="w-px h-6 bg-gray-700" />
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded flex items-center justify-center font-black text-sm ${isCyanTheme ? 'bg-gradient-to-b from-cyan-400 to-cyan-600 text-black' : 'bg-gradient-to-b from-pink-400 to-pink-600 text-white'}`}>
                A
              </div>
              <div className={`text-xs font-bold ${isCyanTheme ? 'text-cyan-400' : 'text-pink-400'}`}>Accent</div>
            </div>
          </div>
          <Knob
            value={config.slide?.time ?? 60}
            min={10}
            max={500}
            onChange={(v) => onChange({ slide: { ...config.slide, time: v } })}
            label="Slide Time"
            size="sm"
            color={knobColor}
            formatValue={(v) => `${Math.round(v)}ms`}
          />
        </div>
      </div>
    </div>
  );

  // Render Devil Fish tab content
  const renderDevilFishTab = () => (
    <div className="tb303-tab-content">
      {/* Devil Fish Enable Toggle */}
      <div className={`rounded-xl p-3 border ${isCyanTheme ? 'bg-gradient-to-b from-cyan-900/20 to-cyan-900/10 border-cyan-900/30' : 'bg-gradient-to-b from-red-900/20 to-red-900/10 border-red-900/30'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${config.devilFish?.enabled ? 'animate-pulse' : ''} ${isCyanTheme ? 'bg-cyan-500' : 'bg-red-500'}`} />
            <span className={`text-sm font-bold uppercase tracking-wide ${isCyanTheme ? 'text-cyan-400' : 'text-red-400'}`}>Devil Fish Mods</span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-gray-500">Enable</span>
            <input
              type="checkbox"
              checked={config.devilFish?.enabled || false}
              onChange={(e) => updateDevilFish('enabled', e.target.checked)}
              className={`w-5 h-5 rounded border-2 bg-transparent cursor-pointer ${isCyanTheme ? 'border-cyan-500 checked:bg-cyan-500' : 'border-red-500 checked:bg-red-500'}`}
            />
          </label>
        </div>
      </div>

      {config.devilFish?.enabled ? (
        <>
          {/* Envelope Generators Section */}
          <div className={`rounded-xl p-3 border ${panelBg}`}>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Envelope Generators</div>
            <div className="flex justify-around items-end">
              <div className="flex flex-col items-center">
                <Knob
                  value={config.devilFish?.normalDecay ?? 200}
                  min={30}
                  max={3000}
                  onChange={(v) => updateDevilFish('normalDecay', v)}
                  label="Normal Dec"
                  size="sm"
                  color={devilFishColor}
                  formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`}
                />
                <div className="text-[9px] text-gray-600">(MEG)</div>
              </div>
              <div className="flex flex-col items-center">
                <Knob
                  value={config.devilFish?.accentDecay ?? 200}
                  min={30}
                  max={3000}
                  onChange={(v) => updateDevilFish('accentDecay', v)}
                  label="Accent Dec"
                  size="sm"
                  color={devilFishColor}
                  formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`}
                />
                <div className="text-[9px] text-gray-600">(MEG)</div>
              </div>
              <div className="flex flex-col items-center">
                <Knob
                  value={config.devilFish?.softAttack ?? 0.3}
                  min={0.3}
                  max={30}
                  onChange={(v) => updateDevilFish('softAttack', v)}
                  label="Soft Atk"
                  size="sm"
                  color={devilFishColor}
                  formatValue={(v) => `${v.toFixed(1)}ms`}
                />
                <div className="text-[9px] text-gray-600">(Normal)</div>
              </div>
              <div className="flex flex-col items-center">
                <Knob
                  value={config.devilFish?.vegSustain ?? 0}
                  min={0}
                  max={100}
                  onChange={(v) => updateDevilFish('vegSustain', v)}
                  label="VEG Sus"
                  size="sm"
                  color={devilFishColor}
                  formatValue={(v) => `${Math.round(v)}%`}
                />
                <div className="text-[9px] text-gray-600">(Amp)</div>
              </div>
            </div>
          </div>

          {/* Filter Modulation Section */}
          <div className={`rounded-xl p-3 border ${panelBg}`}>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Filter Modulation</div>
            <div className="flex justify-around items-end">
              <Knob
                value={config.overdrive?.amount || 0}
                min={0}
                max={100}
                onChange={(v) => updateOverdrive(v)}
                label="Overdrive"
                size="sm"
                color={devilFishColor}
                formatValue={(v) => `${Math.round(v)}%`}
              />
              <Knob
                value={config.devilFish?.filterFM || 0}
                min={0}
                max={100}
                onChange={(v) => updateDevilFish('filterFM', v)}
                label="Filter FM"
                size="sm"
                color={devilFishColor}
                formatValue={(v) => `${Math.round(v)}%`}
              />
              <Knob
                value={config.devilFish?.filterTracking || 0}
                min={0}
                max={200}
                onChange={(v) => updateDevilFish('filterTracking', v)}
                label="Key Track"
                size="sm"
                color={devilFishColor}
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p className="text-sm">Enable Devil Fish mods to access</p>
            <p className="text-xs">extended envelope and filter controls</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className={`synth-editor-container ${mainBg}`}>
      {/* Header - Classic 303 branding - FIXED */}
      <div className={`synth-editor-header px-4 py-2 ${headerBg}`}>
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg" style={{ background: isCyanTheme ? 'linear-gradient(135deg, #00ffff, #008888)' : 'linear-gradient(135deg, #ffcc00, #ff9900)' }}>
            <Zap size={18} className="text-black" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight" style={{ color: accentColor }}>TB-303</h2>
            <p className={`text-[10px] uppercase tracking-widest ${isCyanTheme ? 'text-cyan-600' : 'text-gray-400'}`}>Bass Line</p>
          </div>
        </div>
      </div>

      {/* Filter Visualization - FIXED */}
      <div className="synth-editor-viz-header">
        <div className="flex-1 bg-[#1a1a1a] rounded-lg overflow-hidden">
          <FilterCurve
            cutoff={config.filter.cutoff}
            resonance={config.filter.resonance / 3.3}
            type="lowpass"
            onCutoffChange={(v) => updateFilter('cutoff', v)}
            onResonanceChange={(v) => updateFilter('resonance', v * 3.3)}
            height={70}
            color={filterColor}
          />
        </div>
      </div>

      {/* Tab Bar - FIXED */}
      <TB303Tabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        devilFishEnabled={config.devilFish?.enabled || false}
      />

      {/* Tab Content - FILLS REMAINING SPACE */}
      <div className="synth-editor-content">
        {activeTab === 'main' ? renderMainTab() : renderDevilFishTab()}
      </div>
    </div>
  );
};
