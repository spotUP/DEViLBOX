/**
 * LFOControls - UI for controlling LFO modulation parameters
 * Provides controls for filter, pitch, and volume modulation
 */

import React, { useRef, useEffect } from 'react';
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
  
  // Use ref to prevent stale closures in callbacks
  const lfoRef = useRef(lfo);
  useEffect(() => { lfoRef.current = lfo; }, [lfo]);

  // Update LFO config
  const updateLFO = (updates: Partial<LFOConfig>) => {
    onChange({
      lfo: { ...lfoRef.current, ...updates },
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
              <Filter size={12} className="text-accent-highlight" />
              <input
                type="range"
                min={0}
                max={100}
                value={lfo.filterAmount}
                onChange={(e) => updateLFO({ filterAmount: parseInt(e.target.value) })}
                className="w-12 h-1 accent-accent-highlight"
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
      <div className="mb-3 bg-dark-bg rounded-lg border border-dark-border overflow-hidden">
        <LFOVisualizer
          instrumentId={instrument.id}
          rate={lfo.rate}
          depth={Math.max(lfo.filterAmount, lfo.pitchAmount, lfo.volumeAmount)}
          waveform={lfo.waveform}
          width="auto"
          height={60}
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

      {/* All controls in one row */}
      <div className="flex flex-wrap gap-4 items-end justify-center">
        <Knob
          value={lfo.rate}
          min={0.1}
          max={20}
          step={0.1}
          onChange={(v) => updateLFO({ rate: v })}
          label="Rate"
          color="#a855f7"
          formatValue={(v) => `${v.toFixed(1)}Hz`}
        />
        <Knob
          value={lfo.filterAmount}
          min={0}
          max={100}
          onChange={(v) => updateLFO({ filterAmount: v })}
          label="Filter"
          color="#22d3ee"
          formatValue={(v) => `${Math.round(v)}%`}
        />
        <Knob
          value={lfo.pitchAmount}
          min={0}
          max={100}
          onChange={(v) => updateLFO({ pitchAmount: v })}
          label="Pitch"
          color="#facc15"
          formatValue={(v) => `${Math.round(v)}¢`}
        />
        <Knob
          value={lfo.volumeAmount}
          min={0}
          max={100}
          onChange={(v) => updateLFO({ volumeAmount: v })}
          label="Volume"
          color="#22c55e"
          formatValue={(v) => `${Math.round(v)}%`}
        />
      </div>

      {/* Advanced Options */}
      <div className="mt-3 pt-3 border-t border-dark-border flex gap-4 items-end justify-center">
        <Knob
          value={lfo.phase}
          min={0}
          max={360}
          onChange={(v) => updateLFO({ phase: v })}
          label="Phase"
          color="#a855f7"
          formatValue={(v) => `${Math.round(v)}°`}
        />
        <div className="text-center">
          <label className="block text-[10px] text-text-muted mb-1">Retrigger</label>
          <button
            onClick={() => updateLFO({ retrigger: !lfo.retrigger })}
            className={`px-3 py-1.5 rounded text-xs transition-colors ${
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
  );
};
