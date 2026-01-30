/**
 * LFOControls - UI for controlling LFO modulation parameters
 * Provides controls for filter, pitch, and volume modulation
 */

import React from 'react';
import { Knob } from '@components/controls/Knob';
import { LFOVisualizer } from '@components/visualization';
import { Waves, Volume2, Music, Filter, Power } from 'lucide-react';
import type { LFOConfig, LFOWaveform, InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_LFO } from '@typedefs/instrument';

interface LFOControlsProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
  compact?: boolean;
}

const WAVEFORM_OPTIONS: { value: LFOWaveform; label: string; icon: string }[] = [
  { value: 'sine', label: 'Sine', icon: '∿' },
  { value: 'triangle', label: 'Triangle', icon: '△' },
  { value: 'sawtooth', label: 'Saw', icon: '⩘' },
  { value: 'square', label: 'Square', icon: '⊓' },
];

export const LFOControls: React.FC<LFOControlsProps> = ({
  instrument,
  onChange,
  compact = false,
}) => {
  // Get LFO config with defaults
  const lfo: LFOConfig = instrument.lfo || { ...DEFAULT_LFO };

  // Update LFO config
  const updateLFO = (updates: Partial<LFOConfig>) => {
    onChange({
      lfo: { ...lfo, ...updates },
    });
  };

  // Toggle LFO enabled
  const toggleEnabled = () => {
    updateLFO({ enabled: !lfo.enabled });
  };

  if (compact) {
    // Compact inline version for toolbar
    return (
      <div className="flex items-center gap-2 px-2 py-1 bg-dark-bgSecondary rounded-lg border border-dark-border">
        <button
          onClick={toggleEnabled}
          className={`p-1.5 rounded transition-colors ${
            lfo.enabled
              ? 'bg-accent-primary text-dark-bg'
              : 'bg-dark-bgTertiary text-text-muted hover:text-text-primary'
          }`}
          title="Toggle LFO"
        >
          <Waves size={14} />
        </button>

        {lfo.enabled && (
          <>
            {/* Rate */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-muted">Rate</span>
              <input
                type="range"
                min={0.1}
                max={20}
                step={0.1}
                value={lfo.rate}
                onChange={(e) => updateLFO({ rate: parseFloat(e.target.value) })}
                className="w-16 h-1 accent-accent-primary"
              />
              <span className="text-[10px] text-text-secondary w-8">{lfo.rate.toFixed(1)}Hz</span>
            </div>

            {/* Filter Amount */}
            <div className="flex items-center gap-1">
              <Filter size={12} className="text-cyan-400" />
              <input
                type="range"
                min={0}
                max={100}
                value={lfo.filterAmount}
                onChange={(e) => updateLFO({ filterAmount: parseInt(e.target.value) })}
                className="w-12 h-1 accent-cyan-400"
              />
            </div>

            {/* Pitch Amount */}
            <div className="flex items-center gap-1">
              <Music size={12} className="text-yellow-400" />
              <input
                type="range"
                min={0}
                max={100}
                value={lfo.pitchAmount}
                onChange={(e) => updateLFO({ pitchAmount: parseInt(e.target.value) })}
                className="w-12 h-1 accent-yellow-400"
              />
            </div>

            {/* Volume Amount */}
            <div className="flex items-center gap-1">
              <Volume2 size={12} className="text-green-400" />
              <input
                type="range"
                min={0}
                max={100}
                value={lfo.volumeAmount}
                onChange={(e) => updateLFO({ volumeAmount: parseInt(e.target.value) })}
                className="w-12 h-1 accent-green-400"
              />
            </div>
          </>
        )}
      </div>
    );
  }

  // Full panel version
  return (
    <div className="bg-dark-bgSecondary rounded-lg border border-dark-border p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Waves size={16} className="text-accent-primary" />
          <h3 className="text-sm font-semibold text-text-primary">LFO Modulation</h3>
        </div>
        <button
          onClick={toggleEnabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            lfo.enabled
              ? 'bg-accent-primary text-dark-bg'
              : 'bg-dark-bgTertiary text-text-muted hover:text-text-primary hover:bg-dark-bgHover'
          }`}
        >
          <Power size={12} />
          {lfo.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* LFO Visualizer */}
      <div className="mb-4 bg-dark-bg rounded-lg p-2 border border-dark-border">
        <LFOVisualizer
          instrumentId={instrument.id}
          rate={lfo.rate}
          depth={Math.max(lfo.filterAmount, lfo.pitchAmount, lfo.volumeAmount)}
          waveform={lfo.waveform}
          width={200}
          height={50}
        />
      </div>

      {/* Waveform Selection */}
      <div className="mb-4">
        <label className="block text-xs text-text-muted mb-2">Waveform</label>
        <div className="flex gap-1">
          {WAVEFORM_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateLFO({ waveform: opt.value })}
              className={`flex-1 px-2 py-2 rounded text-center text-lg transition-colors ${
                lfo.waveform === opt.value
                  ? 'bg-accent-primary text-dark-bg'
                  : 'bg-dark-bgTertiary text-text-muted hover:text-text-primary'
              }`}
              title={opt.label}
            >
              {opt.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Rate Control */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-text-muted">Rate</label>
          <span className="text-xs text-text-secondary">{lfo.rate.toFixed(1)} Hz</span>
        </div>
        <div className="flex items-center gap-2">
          <Knob
            value={lfo.rate}
            min={0.1}
            max={20}
            step={0.1}
            onChange={(v) => updateLFO({ rate: v })}
            size="md"
            color="#a855f7"
          />
          <input
            type="range"
            min={0.1}
            max={20}
            step={0.1}
            value={lfo.rate}
            onChange={(e) => updateLFO({ rate: parseFloat(e.target.value) })}
            className="flex-1 h-2 accent-purple-500 rounded-lg"
          />
        </div>
      </div>

      {/* Modulation Targets */}
      <div className="grid grid-cols-3 gap-4">
        {/* Filter */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-2">
            <Filter size={14} className="text-cyan-400" />
            <span className="text-xs text-text-muted">Filter</span>
          </div>
          <Knob
            value={lfo.filterAmount}
            min={0}
            max={100}
            onChange={(v) => updateLFO({ filterAmount: v })}
            size="lg"
            color="#22d3ee"
          />
          <div className="text-[10px] text-text-secondary mt-1">{lfo.filterAmount}%</div>
        </div>

        {/* Pitch */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-2">
            <Music size={14} className="text-yellow-400" />
            <span className="text-xs text-text-muted">Pitch</span>
          </div>
          <Knob
            value={lfo.pitchAmount}
            min={0}
            max={100}
            onChange={(v) => updateLFO({ pitchAmount: v })}
            size="lg"
            color="#facc15"
          />
          <div className="text-[10px] text-text-secondary mt-1">{lfo.pitchAmount} cents</div>
        </div>

        {/* Volume */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-2">
            <Volume2 size={14} className="text-green-400" />
            <span className="text-xs text-text-muted">Volume</span>
          </div>
          <Knob
            value={lfo.volumeAmount}
            min={0}
            max={100}
            onChange={(v) => updateLFO({ volumeAmount: v })}
            size="lg"
            color="#22c55e"
          />
          <div className="text-[10px] text-text-secondary mt-1">{lfo.volumeAmount}%</div>
        </div>
      </div>

      {/* Advanced Options */}
      <div className="mt-4 pt-4 border-t border-dark-border">
        <div className="grid grid-cols-2 gap-4">
          {/* Phase */}
          <div>
            <label className="block text-xs text-text-muted mb-1">Start Phase</label>
            <input
              type="range"
              min={0}
              max={360}
              value={lfo.phase}
              onChange={(e) => updateLFO({ phase: parseInt(e.target.value) })}
              className="w-full h-1 accent-accent-primary"
            />
            <div className="text-[10px] text-text-secondary text-center">{lfo.phase}°</div>
          </div>

          {/* Retrigger */}
          <div>
            <label className="block text-xs text-text-muted mb-1">Note Retrigger</label>
            <button
              onClick={() => updateLFO({ retrigger: !lfo.retrigger })}
              className={`w-full px-3 py-1.5 rounded text-xs transition-colors ${
                lfo.retrigger
                  ? 'bg-accent-primary text-dark-bg'
                  : 'bg-dark-bgTertiary text-text-muted'
              }`}
            >
              {lfo.retrigger ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
