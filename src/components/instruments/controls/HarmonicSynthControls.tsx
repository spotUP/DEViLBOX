/**
 * HarmonicSynthControls - UI for the additive/spectral synthesizer
 *
 * Layout:
 * - Top: 32-bar harmonic graph with drag-to-draw + preset buttons
 * - Bottom: Spectral, Filter, Envelope, LFO knobs
 */

import React, { useRef, useCallback, useState, useEffect } from 'react';
import type { HarmonicSynthConfig } from '@/types/instrument';
import { DEFAULT_HARMONIC_SYNTH } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import { FilterFrequencyResponse, EnvelopeVisualization } from '@components/instruments/shared';

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  const knobColor = isCyanTheme ? '#00ffff' : '#4ade80';
  const barColor = isCyanTheme ? 'rgba(0, 255, 255, 0.7)' : 'rgba(74, 222, 128, 0.7)';
  const barHighlight = isCyanTheme ? 'rgba(0, 255, 255, 1)' : 'rgba(74, 222, 128, 1)';

  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-gray-800';

  const harmonics = config.harmonics || DEFAULT_HARMONIC_SYNTH.harmonics;

  // Draw harmonic bars
  const drawHarmonics = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = isCyanTheme ? '#030d0d' : '#111111';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = isCyanTheme ? 'rgba(0, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Bars
    const barW = w / NUM_HARMONICS;
    const gap = Math.max(1, barW * 0.1);

    for (let i = 0; i < NUM_HARMONICS; i++) {
      const amp = harmonics[i] || 0;
      const barH = amp * h;
      const x = i * barW + gap / 2;
      const y = h - barH;

      // Gradient
      const grad = ctx.createLinearGradient(x, y, x, h);
      grad.addColorStop(0, barHighlight);
      grad.addColorStop(1, barColor);
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barW - gap, barH);

      // Harmonic number labels (every 4th)
      if ((i + 1) % 4 === 1 || i === 0) {
        ctx.fillStyle = isCyanTheme ? 'rgba(0, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.3)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), x + (barW - gap) / 2, h - 3);
      }
    }
  }, [harmonics, isCyanTheme, barColor, barHighlight]);

  useEffect(() => {
    drawHarmonics();
  }, [drawHarmonics]);

  // Mouse interaction for harmonic bar editing
  const setHarmonicFromMouse = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const idx = Math.floor((x / rect.width) * NUM_HARMONICS);
    const amp = Math.max(0, Math.min(1, 1 - y / rect.height));

    if (idx >= 0 && idx < NUM_HARMONICS) {
      const newH = [...harmonics];
      newH[idx] = amp;
      onChange({ harmonics: newH });
    }
  }, [harmonics, onChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setHarmonicFromMouse(e);
  }, [setHarmonicFromMouse]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) setHarmonicFromMouse(e);
  }, [isDragging, setHarmonicFromMouse]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

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
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair"
          style={{ height: '120px' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Spectral */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <div className="font-mono text-[10px] font-bold text-text-muted mb-2 tracking-wider">SPECTRAL</div>
          <div className="flex gap-4 justify-center">
            <Knob
              value={config.spectralTilt} min={-100} max={100} onChange={(v) => onChange({ spectralTilt: v })}
              label="Tilt" size="sm" color={knobColor} bipolar defaultValue={0}
            />
            <Knob
              value={config.evenOddBalance} min={-100} max={100} onChange={(v) => onChange({ evenOddBalance: v })}
              label="E/O" size="sm" color={knobColor} bipolar defaultValue={0}
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
          <div className="mb-2">
            <FilterFrequencyResponse
              filterType={config.filter.type}
              cutoff={Math.log10(Math.max(config.filter.cutoff, 20) / 20) / 3}
              resonance={config.filter.resonance / 30}
              poles={2} color={knobColor} width={300} height={56}
            />
          </div>
          <div className="flex gap-4 justify-center">
            <Knob
              value={config.filter.cutoff} min={20} max={20000} onChange={(v) => updateFilter({ cutoff: v })}
              label="Cutoff" unit="Hz" size="sm" color={knobColor} logarithmic
            />
            <Knob
              value={config.filter.resonance} min={0} max={30} onChange={(v) => updateFilter({ resonance: v })}
              label="Reso" size="sm" color={knobColor}
            />
          </div>
        </div>

        {/* Envelope */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <div className="font-mono text-[10px] font-bold text-text-muted mb-2 tracking-wider">ENVELOPE</div>
          <div className="mb-2">
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
          <div className="flex gap-3 justify-center">
            <Knob
              value={config.envelope.attack} min={0} max={2000} onChange={(v) => updateEnvelope({ attack: v })}
              label="A" unit="ms" size="sm" color={knobColor}
            />
            <Knob
              value={config.envelope.decay} min={0} max={2000} onChange={(v) => updateEnvelope({ decay: v })}
              label="D" unit="ms" size="sm" color={knobColor}
            />
            <Knob
              value={config.envelope.sustain} min={0} max={100} onChange={(v) => updateEnvelope({ sustain: v })}
              label="S" unit="%" size="sm" color={knobColor}
            />
            <Knob
              value={config.envelope.release} min={0} max={5000} onChange={(v) => updateEnvelope({ release: v })}
              label="R" unit="ms" size="sm" color={knobColor}
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
              label="Rate" unit="Hz" size="sm" color={knobColor}
            />
            <Knob
              value={config.lfo.depth} min={0} max={100} onChange={(v) => updateLFO({ depth: v })}
              label="Depth" size="sm" color={knobColor}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
