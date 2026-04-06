/**
 * HarmonicPanel — additive synthesis mode.
 *
 * 32 harmonic amplitude sliders (sum of sines). Every change updates
 * the wavetable by summing sin(h * phase) * amplitude for each harmonic.
 *
 * Reuses `HarmonicBarsCanvas` for the interactive slider widget. Writes
 * back to the wavetable via `onChange` on every drag frame.
 */

import React, { useCallback, useMemo } from 'react';
import { HarmonicBarsCanvas } from '@components/instruments/shared';
import { RotateCcw } from 'lucide-react';

interface HarmonicPanelProps {
  harmonics: number[];
  onHarmonicsChange: (h: number[]) => void;
  length: number;
  maxValue: number;
  onDataChange: (data: number[]) => void;
}

const HARMONIC_COUNT = 32;

/** Sum-of-sines: render harmonics[] to a waveform of the given length. */
function renderHarmonics(harmonics: number[], length: number, maxValue: number): number[] {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let v = 0;
    const phase = (i / length) * Math.PI * 2;
    for (let h = 0; h < harmonics.length; h++) {
      const amp = harmonics[h];
      if (amp === 0) continue;
      v += Math.sin(phase * (h + 1)) * amp;
    }
    buf[i] = v;
  }
  // Normalize to [-1, +1] then map to [0, maxValue]
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > peak) peak = a;
  }
  const gain = peak > 0 ? 1 / peak : 1;
  const mid = maxValue / 2;
  const out: number[] = [];
  for (let i = 0; i < buf.length; i++) {
    const n = buf[i] * gain;
    out.push(Math.max(0, Math.min(maxValue, Math.round(n * mid + mid))));
  }
  return out;
}

/** Preset harmonic stacks for the quick buttons. */
const HARMONIC_PRESETS: Array<{ name: string; values: number[] }> = [
  { name: 'Sine', values: [1, ...new Array(HARMONIC_COUNT - 1).fill(0)] },
  {
    name: 'Square',
    values: Array.from({ length: HARMONIC_COUNT }, (_, i) => (i % 2 === 0 ? 1 / (i + 1) : 0)),
  },
  {
    name: 'Saw',
    values: Array.from({ length: HARMONIC_COUNT }, (_, i) => 1 / (i + 1)),
  },
  {
    name: 'Triangle',
    values: Array.from({ length: HARMONIC_COUNT }, (_, i) =>
      i % 2 === 0 ? 1 / Math.pow(i + 1, 2) : 0,
    ),
  },
  { name: 'Odd', values: Array.from({ length: HARMONIC_COUNT }, (_, i) => (i % 2 === 0 ? 1 : 0)) },
  { name: 'Even', values: Array.from({ length: HARMONIC_COUNT }, (_, i) => (i % 2 === 1 ? 1 : 0)) },
];

export const HarmonicPanel: React.FC<HarmonicPanelProps> = ({
  harmonics, onHarmonicsChange, length, maxValue, onDataChange,
}) => {
  const canvasWidth = 320;
  const canvasHeight = 160;

  const applyHarmonics = useCallback(
    (newHarmonics: number[]) => {
      onHarmonicsChange(newHarmonics);
      const newData = renderHarmonics(newHarmonics, length, maxValue);
      onDataChange(newData);
    },
    [onHarmonicsChange, length, maxValue, onDataChange],
  );

  const handleDrag = useCallback(
    (nx: number, ny: number) => {
      const idx = Math.max(0, Math.min(HARMONIC_COUNT - 1, Math.floor(nx * HARMONIC_COUNT)));
      const amp = Math.max(0, Math.min(1, ny));
      if (harmonics[idx] === amp) return;
      const newHarmonics = [...harmonics];
      newHarmonics[idx] = amp;
      applyHarmonics(newHarmonics);
    },
    [harmonics, applyHarmonics],
  );

  const clearHarmonics = useCallback(() => {
    applyHarmonics(new Array(HARMONIC_COUNT).fill(0));
  }, [applyHarmonics]);

  const padded = useMemo(() => {
    if (harmonics.length === HARMONIC_COUNT) return harmonics;
    const out = new Array(HARMONIC_COUNT).fill(0);
    for (let i = 0; i < Math.min(harmonics.length, HARMONIC_COUNT); i++) out[i] = harmonics[i];
    return out;
  }, [harmonics]);

  return (
    <div className="space-y-2 p-2 bg-dark-bgSecondary rounded border border-dark-border">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-bold text-text-primary uppercase">
          Additive / Harmonic
        </span>
        <button
          onClick={clearHarmonics}
          title="Clear all harmonics"
          className="p-1 rounded text-text-muted hover:text-text-primary border border-dark-border"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      <div className="flex justify-center">
        <HarmonicBarsCanvas
          harmonics={padded}
          count={HARMONIC_COUNT}
          width={canvasWidth}
          height={canvasHeight}
          barColor="rgba(34, 211, 238, 0.6)"
          highlightColor="rgba(34, 211, 238, 1)"
          gradient
          showLabels
          onDrag={handleDrag}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[9px] font-mono text-text-muted uppercase mr-1">Presets:</span>
        {HARMONIC_PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => applyHarmonics(preset.values)}
            className="px-2 py-0.5 rounded text-[9px] font-mono bg-dark-bg text-text-muted hover:text-text-primary border border-dark-border hover:border-accent-highlight/50"
          >
            {preset.name}
          </button>
        ))}
      </div>

      <p className="text-[9px] font-mono text-text-subtle">
        Drag in the chart to set harmonic amplitudes. Wavetable updates live.
      </p>
    </div>
  );
};
