/**
 * VisualTB303Editor - VST-style TB-303 acid synthesizer editor
 * Classic silver panel design with authentic knob layout
 */

import React from 'react';
import type { TB303Config } from '@typedefs/instrument';
import { Knob } from '@components/ui/Knob';
import { FilterCurve } from '@components/ui/FilterCurve';
import { Zap } from 'lucide-react';

interface VisualTB303EditorProps {
  config: TB303Config;
  onChange: (updates: Partial<TB303Config>) => void;
}

export const VisualTB303Editor: React.FC<VisualTB303EditorProps> = ({
  config,
  onChange,
}) => {
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
      softAttack: 4,
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

  return (
    <div className="bg-gradient-to-b from-[#c0c0c0] to-[#a0a0a0] min-h-full">
      {/* Header - Classic 303 branding */}
      <div className="px-6 py-4 bg-gradient-to-r from-[#2a2a2a] to-[#1a1a1a] border-b-4 border-[#ffcc00]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-[#ffcc00] to-[#ff9900] rounded-lg">
              <Zap size={24} className="text-black" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-[#ffcc00] tracking-tight">TB-303</h2>
              <p className="text-xs text-gray-400 uppercase tracking-widest">Bass Line Synthesizer</p>
            </div>
          </div>

          {/* Devil Fish badge if enabled */}
          {config.devilFish?.enabled && (
            <div className="px-3 py-1 bg-red-600 text-white font-black text-sm rounded-full animate-pulse">
              DEVIL FISH MOD
            </div>
          )}
        </div>
      </div>

      {/* Main Panel - Silver background */}
      <div className="p-6">
        {/* Waveform Selection */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-gray-500" />
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Waveform</span>
            <div className="h-px flex-1 bg-gray-500" />
          </div>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => onChange({ oscillator: { ...config.oscillator, type: 'sawtooth' } })}
              className={`
                w-24 h-16 rounded-lg border-4 transition-all shadow-lg
                ${config.oscillator.type === 'sawtooth'
                  ? 'bg-[#1a1a1a] border-[#ffcc00] shadow-[#ffcc00]/30'
                  : 'bg-[#2a2a2a] border-gray-600 hover:border-gray-400'
                }
              `}
            >
              <svg viewBox="0 0 40 24" className="w-full h-full p-2">
                <path
                  d="M 4 12 L 4 4 L 20 20 L 20 4 L 36 20"
                  fill="none"
                  stroke={config.oscillator.type === 'sawtooth' ? '#ffcc00' : '#666'}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <div className={`text-xs font-bold ${config.oscillator.type === 'sawtooth' ? 'text-[#ffcc00]' : 'text-gray-500'}`}>
                SAW
              </div>
            </button>
            <button
              onClick={() => onChange({ oscillator: { ...config.oscillator, type: 'square' } })}
              className={`
                w-24 h-16 rounded-lg border-4 transition-all shadow-lg
                ${config.oscillator.type === 'square'
                  ? 'bg-[#1a1a1a] border-[#ffcc00] shadow-[#ffcc00]/30'
                  : 'bg-[#2a2a2a] border-gray-600 hover:border-gray-400'
                }
              `}
            >
              <svg viewBox="0 0 40 24" className="w-full h-full p-2">
                <path
                  d="M 4 20 L 4 4 L 20 4 L 20 20 L 36 20 L 36 4"
                  fill="none"
                  stroke={config.oscillator.type === 'square' ? '#ffcc00' : '#666'}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <div className={`text-xs font-bold ${config.oscillator.type === 'square' ? 'text-[#ffcc00]' : 'text-gray-500'}`}>
                SQR
              </div>
            </button>
          </div>
        </div>

        {/* Main Knobs Row */}
        <div className="bg-gradient-to-b from-[#e8e8e8] to-[#d0d0d0] rounded-2xl p-6 shadow-inner border border-gray-400 mb-6">
          <div className="flex justify-around items-end">
            <div className="flex flex-col items-center">
              <Knob
                value={config.filter.cutoff}
                min={200}
                max={20000}
                onChange={(v) => updateFilter('cutoff', v)}
                label="Cutoff"
                size="lg"
                color="#ff6600"
                formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`}
              />
            </div>
            <div className="flex flex-col items-center">
              <Knob
                value={config.filter.resonance}
                min={0}
                max={100}
                onChange={(v) => updateFilter('resonance', v)}
                label="Resonance"
                size="lg"
                color="#ff6600"
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
            <div className="flex flex-col items-center">
              <Knob
                value={config.filterEnvelope.envMod}
                min={0}
                max={100}
                onChange={(v) => updateFilterEnvelope('envMod', v)}
                label="Env Mod"
                size="lg"
                color="#ff6600"
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
            <div className="flex flex-col items-center">
              <Knob
                value={config.filterEnvelope.decay}
                min={30}
                max={3000}
                onChange={(v) => updateFilterEnvelope('decay', v)}
                label="Decay"
                size="lg"
                color="#ff6600"
                formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`}
              />
            </div>
            <div className="flex flex-col items-center">
              <Knob
                value={config.accent.amount}
                min={0}
                max={100}
                onChange={(v) => updateAccent('amount', v)}
                label="Accent"
                size="lg"
                color="#ff0066"
                formatValue={(v) => `${Math.round(v)}%`}
              />
            </div>
          </div>
        </div>

        {/* Filter Visualization */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-gray-500" />
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Filter Response</span>
            <div className="h-px flex-1 bg-gray-500" />
          </div>
          <div className="bg-[#1a1a1a] rounded-xl p-2">
            <FilterCurve
              cutoff={config.filter.cutoff}
              resonance={config.filter.resonance / 3.3} // Convert 0-100 to 0-30 Q
              type="lowpass"
              onCutoffChange={(v) => updateFilter('cutoff', v)}
              onResonanceChange={(v) => updateFilter('resonance', v * 3.3)}
              width={360}
              height={120}
              color="#ff6600"
            />
          </div>
        </div>

        {/* Devil Fish Mods */}
        <div className="bg-gradient-to-b from-red-900/20 to-red-900/10 rounded-xl p-4 border border-red-900/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-bold text-red-400 uppercase tracking-wide">Devil Fish Mods</span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-gray-500">Enable</span>
              <input
                type="checkbox"
                checked={config.devilFish?.enabled || false}
                onChange={(e) => updateDevilFish('enabled', e.target.checked)}
                className="w-5 h-5 rounded border-2 border-red-500 bg-transparent checked:bg-red-500 cursor-pointer"
              />
            </label>
          </div>

          {config.devilFish?.enabled && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#1a1a1a] rounded-lg p-3 flex flex-col items-center">
                <Knob
                  value={config.overdrive?.amount || 0}
                  min={0}
                  max={100}
                  onChange={(v) => updateOverdrive(v)}
                  label="Overdrive"
                  size="sm"
                  color="#ff3333"
                  formatValue={(v) => `${Math.round(v)}%`}
                />
              </div>
              <div className="bg-[#1a1a1a] rounded-lg p-3 flex flex-col items-center">
                <Knob
                  value={config.devilFish?.filterFM || 0}
                  min={0}
                  max={100}
                  onChange={(v) => updateDevilFish('filterFM', v)}
                  label="Filter FM"
                  size="sm"
                  color="#ff3333"
                  formatValue={(v) => `${Math.round(v)}%`}
                />
              </div>
              <div className="bg-[#1a1a1a] rounded-lg p-3 flex flex-col items-center">
                <Knob
                  value={config.devilFish?.filterTracking || 0}
                  min={0}
                  max={200}
                  onChange={(v) => updateDevilFish('filterTracking', v)}
                  label="Key Track"
                  size="sm"
                  color="#ff3333"
                  formatValue={(v) => `${Math.round(v)}%`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Slide & Accent Info */}
        <div className="mt-4 bg-[#1a1a1a] rounded-lg p-3">
          <div className="flex items-center justify-around text-xs">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-gradient-to-b from-cyan-400 to-cyan-600 flex items-center justify-center font-black text-white">
                S
              </div>
              <div className="text-gray-400">
                <div className="font-bold text-cyan-400">Slide</div>
                <div>Portamento glide</div>
              </div>
            </div>
            <div className="w-px h-8 bg-gray-700" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-gradient-to-b from-pink-400 to-pink-600 flex items-center justify-center font-black text-white">
                A
              </div>
              <div className="text-gray-400">
                <div className="font-bold text-pink-400">Accent</div>
                <div>Emphasize note</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
