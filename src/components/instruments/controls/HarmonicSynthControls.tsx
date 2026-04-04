/**
 * HarmonicSynthControls - UI for the additive/spectral synthesizer
 *
 * Layout:
 * - Top: 32-bar harmonic graph with drag-to-draw + preset buttons
 * - Bottom: Spectral, Filter, Envelope, LFO knobs
 */

import React, { useCallback, useState } from 'react';
import type { HarmonicSynthConfig } from '@/types/instrument';
import { DEFAULT_HARMONIC_SYNTH } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { FilterFrequencyResponse, EnvelopeVisualization, HarmonicBarsCanvas } from '@components/instruments/shared';

interface HarmonicSynthControlsProps {
  config: HarmonicSynthConfig;
  instrumentId: number;
  onChange: (updates: Partial<HarmonicSynthConfig>) => void;
}

const NUM_HARMONICS = 32;

// Spectral shape presets
const SPECTRAL_PRESETS: Record<string, number[]> = {
  Saw: Array.from({ length: NUM_HARMONICS }, (_, i) => 1 / (i + 1)),
  Square: Array.from({ length: NUM_HARMONICS }, (_, i) => (i + 1) % 2 === 1 ? 1 / (i + 1) : 0),
  Triangle: Array.from({ length: NUM_HARMONICS }, (_, i) => {
    if ((i + 1) % 2 === 0) return 0;
    const n = i + 1;
    return (1 / (n * n)) * (n % 4 === 1 ? 1 : -1);
  }).map(v => Math.abs(v)),
  Organ: Array.from({ length: NUM_HARMONICS }, (_, i) => {
    const n = i + 1;
    return [1, 2, 3, 4, 5, 6, 8].includes(n) ? 0.8 / Math.sqrt(n) : 0;
  }),
  Bell: Array.from({ length: NUM_HARMONICS }, (_, i) => {
    const n = i + 1;
    return Math.exp(-0.3 * n) * (1 + 0.5 * Math.sin(n * 0.7));
  }),
  Choir: Array.from({ length: NUM_HARMONICS }, (_, i) => {
    const n = i + 1;
    const f = n * 200;
    // Formant-like peaks at ~500Hz, ~1500Hz, ~2500Hz
    const d1 = Math.exp(-((f - 500) ** 2) / (200 ** 2));
    const d2 = Math.exp(-((f - 1500) ** 2) / (400 ** 2)) * 0.6;
    const d3 = Math.exp(-((f - 2500) ** 2) / (600 ** 2)) * 0.3;
    return (d1 + d2 + d3) * (1 / n);
  }),
};

// Normalize presets to 0-1
for (const key of Object.keys(SPECTRAL_PRESETS)) {
  const arr = SPECTRAL_PRESETS[key];
  const maxVal = Math.max(...arr);
  if (maxVal > 0) {
    SPECTRAL_PRESETS[key] = arr.map(v => v / maxVal);
  }
}

export const HarmonicSynthControls: React.FC<HarmonicSynthControlsProps> = ({
  config,
  instrumentId: _instrumentId,
  onChange,
}) => {
  const [_isDragging, setIsDragging] = useState(false);

  const { isCyan: isCyanTheme, knob: knobColor, panelBg } = useInstrumentColors('#4ade80');
  const barColor = isCyanTheme ? 'rgba(0, 255, 255, 0.7)' : 'rgba(74, 222, 128, 0.7)';
  const barHighlight = isCyanTheme ? 'rgba(0, 255, 255, 1)' : 'rgba(74, 222, 128, 1)';

  const harmonics = config.harmonics || DEFAULT_HARMONIC_SYNTH.harmonics;

  // Normalized-coordinate harmonic editor (nx=0-1 horizontal, ny=0-1 vertical top-down)
  const setHarmonicFromNormalized = useCallback((nx: number, ny: number) => {
    const idx = Math.floor(nx * NUM_HARMONICS);
    const amp = Math.max(0, Math.min(1, 1 - ny));
    if (idx >= 0 && idx < NUM_HARMONICS) {
      const newH = [...harmonics];
      newH[idx] = amp;
      onChange({ harmonics: newH });
    }
  }, [harmonics, onChange]);

  // Helpers for nested updates
  const updateFilter = (updates: Partial<typeof config.filter>) => {
    onChange({ filter: { ...config.filter, ...updates } });
  };
  const updateEnvelope = (updates: Partial<typeof config.envelope>) => {
    onChange({ envelope: { ...config.envelope, ...updates } });
  };
  const updateLFO = (updates: Partial<typeof config.lfo>) => {
    onChange({ lfo: { ...config.lfo, ...updates } });
  };

  return (
    <div className="space-y-3">
      {/* Harmonic Bar Graph */}
      <div className={`rounded-lg border ${panelBg} overflow-hidden`}>
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-dark-border">
          <span className="font-mono text-[10px] font-bold text-text-primary tracking-wider">HARMONICS</span>
          <div className="flex items-center gap-1">
            {Object.keys(SPECTRAL_PRESETS).map((name) => (
              <button
                key={name}
                onClick={() => onChange({ harmonics: [...SPECTRAL_PRESETS[name]] })}
                className="px-2 py-0.5 text-[9px] font-mono rounded border border-dark-border hover:border-accent text-text-muted hover:text-text-primary transition-colors"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <HarmonicBarsCanvas
          harmonics={harmonics}
          count={NUM_HARMONICS}
          width={600}
          height={120}
          barColor={barColor}
          highlightColor={barHighlight}
          backgroundColor={isCyanTheme ? '#030d0d' : '#111111'}
          gridColor={isCyanTheme ? 'rgba(0, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.06)'}
          gradient
          showLabels
          labelColor={isCyanTheme ? 'rgba(0, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.3)'}
          hiDpi
          onDragStart={(nx, ny) => { setIsDragging(true); setHarmonicFromNormalized(nx, ny); }}
          onDrag={setHarmonicFromNormalized}
          onDragEnd={() => setIsDragging(false)}
        />
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-4 gap-3">
        {/* Spectral */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <div className="font-mono text-[10px] font-bold text-text-muted mb-2 tracking-wider">SPECTRAL</div>
          <div className="flex gap-4 justify-center">
            <Knob
              value={config.spectralTilt} min={-100} max={100} onChange={(v) => onChange({ spectralTilt: v })}
              label="Tilt" color={knobColor} bipolar defaultValue={0}
            />
            <Knob
              value={config.evenOddBalance} min={-100} max={100} onChange={(v) => onChange({ evenOddBalance: v })}
              label="E/O" color={knobColor} bipolar defaultValue={0}
            />
            <Knob
              value={config.maxVoices} min={4} max={8} onChange={(v) => onChange({ maxVoices: Math.round(v) })}
              label="Voices" color={knobColor}
              formatValue={v => `${Math.round(v)}`}
            />
          </div>
        </div>

        {/* Filter */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] font-bold text-text-muted tracking-wider">FILTER</span>
            <select
              value={config.filter.type}
              onChange={(e) => updateFilter({ type: e.target.value as 'lowpass' | 'highpass' | 'bandpass' })}
              className="bg-transparent border border-dark-border rounded px-1.5 py-0.5 text-[9px] font-mono text-text-primary"
            >
              <option value="lowpass">LP</option>
              <option value="highpass">HP</option>
              <option value="bandpass">BP</option>
            </select>
          </div>
          <div className="flex gap-4 justify-center">
            <Knob
              value={config.filter.cutoff} min={20} max={20000} onChange={(v) => updateFilter({ cutoff: v })}
              label="Cutoff" unit="Hz" color={knobColor} logarithmic
            />
            <Knob
              value={config.filter.resonance} min={0} max={30} onChange={(v) => updateFilter({ resonance: v })}
              label="Reso" color={knobColor}
            />
          </div>
          <div className="mt-2">
            <FilterFrequencyResponse
              filterType={config.filter.type}
              cutoff={Math.log10(Math.max(config.filter.cutoff, 20) / 20) / 3}
              resonance={config.filter.resonance / 30}
              poles={2} color={knobColor} width={300} height={56}
            />
          </div>
        </div>

        {/* Envelope */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <div className="font-mono text-[10px] font-bold text-text-muted mb-2 tracking-wider">ENVELOPE</div>
          <div className="flex gap-3 justify-center">
            <Knob
              value={config.envelope.attack} min={0} max={2000} onChange={(v) => updateEnvelope({ attack: v })}
              label="A" unit="ms" color={knobColor}
            />
            <Knob
              value={config.envelope.decay} min={0} max={2000} onChange={(v) => updateEnvelope({ decay: v })}
              label="D" unit="ms" color={knobColor}
            />
            <Knob
              value={config.envelope.sustain} min={0} max={100} onChange={(v) => updateEnvelope({ sustain: v })}
              label="S" unit="%" color={knobColor}
            />
            <Knob
              value={config.envelope.release} min={0} max={5000} onChange={(v) => updateEnvelope({ release: v })}
              label="R" unit="ms" color={knobColor}
            />
          </div>
          <div className="mt-2">
            <EnvelopeVisualization
              mode="linear"
              attack={config.envelope.attack / 2000}
              decay={config.envelope.decay / 2000}
              sustain={config.envelope.sustain / 100}
              release={config.envelope.release / 5000}
              color={knobColor}
              width={300} height={48}
            />
          </div>
        </div>

        {/* LFO */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] font-bold text-text-muted tracking-wider">LFO</span>
            <select
              value={config.lfo.target}
              onChange={(e) => updateLFO({ target: e.target.value as 'pitch' | 'filter' | 'spectral' })}
              className="bg-transparent border border-dark-border rounded px-1.5 py-0.5 text-[9px] font-mono text-text-primary"
            >
              <option value="pitch">Pitch</option>
              <option value="filter">Filter</option>
              <option value="spectral">Spectral</option>
            </select>
          </div>
          <div className="flex gap-4 justify-center">
            <Knob
              value={config.lfo.rate} min={0.1} max={20} onChange={(v) => updateLFO({ rate: v })}
              label="Rate" unit="Hz" color={knobColor}
            />
            <Knob
              value={config.lfo.depth} min={0} max={100} onChange={(v) => updateLFO({ depth: v })}
              label="Depth" color={knobColor}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
