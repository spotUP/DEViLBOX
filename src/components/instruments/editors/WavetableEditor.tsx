/**
 * WavetableEditor - Full-featured Furnace-style wavetable editor
 *
 * Based on Furnace tracker's wavetable editing (waveEdit.cpp)
 * Features:
 * - Canvas-based waveform drawing
 * - Waveform generation (sine, triangle, saw, square, noise)
 * - Wavetable length/height control
 * - Multiple wavetables per instrument
 * - Preset selection
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Waves, Plus, RotateCcw, Trash2, Copy, Wand2 } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface WavetableData {
  id: number;
  data: number[];
  len?: number;   // Length (number of samples)
  max?: number;   // Max value (height - 1)
}

interface WavetableEditorProps {
  wavetable: WavetableData;
  onChange: (wavetable: WavetableData) => void;
  onRemove?: () => void;
  height?: number;
  color?: string;
}

interface WavetableListEditorProps {
  wavetables: WavetableData[];
  onChange: (wavetables: WavetableData[]) => void;
  maxWavetables?: number;
}

// ============================================================================
// WAVEFORM GENERATORS
// ============================================================================

type WaveformType = 'sine' | 'triangle' | 'saw' | 'square' | 'pulse25' | 'pulse12' | 'noise' | 'custom';

const generateWaveform = (type: WaveformType, length: number, maxValue: number): number[] => {
  const data: number[] = [];
  const mid = maxValue / 2;

  for (let i = 0; i < length; i++) {
    const phase = i / length;
    let value: number;

    switch (type) {
      case 'sine':
        value = Math.sin(phase * 2 * Math.PI) * mid + mid;
        break;
      case 'triangle':
        value = phase < 0.5
          ? phase * 4 * mid
          : (1 - phase) * 4 * mid;
        break;
      case 'saw':
        value = phase * maxValue;
        break;
      case 'square':
        value = phase < 0.5 ? maxValue : 0;
        break;
      case 'pulse25':
        value = phase < 0.25 ? maxValue : 0;
        break;
      case 'pulse12':
        value = phase < 0.125 ? maxValue : 0;
        break;
      case 'noise':
        value = Math.random() * maxValue;
        break;
      default:
        value = mid;
    }

    data.push(Math.round(Math.max(0, Math.min(maxValue, value))));
  }

  return data;
};

// ============================================================================
// WAVETABLE EDITOR COMPONENT
// ============================================================================

export const WavetableEditor: React.FC<WavetableEditorProps> = ({
  wavetable,
  onChange,
  onRemove,
  height = 100,
  color = '#06b6d4',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);

  const maxValue = wavetable.max ?? 15;
  const length = wavetable.data.length || 32;

  // Draw the wavetable
  const drawWavetable = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = Math.max(200, length * 6);
    const logicalHeight = height;
    
    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    ctx.scale(dpr, dpr);

    const w = logicalWidth;
    const h = logicalHeight;

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    // Draw grid
    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth = 1;

    // Horizontal grid (4 lines)
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Vertical grid (every 8 samples for 32-sample wave)
    const gridStep = Math.max(1, Math.floor(length / 8));
    for (let i = 0; i < length; i += gridStep) {
      const x = (i / length) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Draw waveform as bars
    const barWidth = w / length;
    wavetable.data.forEach((value, i) => {
      const x = i * barWidth;
      const normalizedValue = value / maxValue;
      const barHeight = normalizedValue * h;
      const y = h - barHeight;

      // Bar fill
      ctx.fillStyle = color;
      ctx.fillRect(x, y, barWidth - 1, barHeight);
    });

    // Draw waveform line on top
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    wavetable.data.forEach((value, i) => {
      const x = (i / length) * w + (barWidth / 2);
      const y = h - (value / maxValue) * h;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }, [wavetable, maxValue, length, color]);

  useEffect(() => {
    drawWavetable();
  }, [drawWavetable]);

  // Mouse interaction
  const handleMouseEvent = (e: React.MouseEvent, isDown: boolean = false) => {
    if (!isDragging && !isDown) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const sampleIndex = Math.floor((x / rect.width) * length);
    const normalizedY = 1 - (y / rect.height);
    const value = Math.round(normalizedY * maxValue);

    if (sampleIndex >= 0 && sampleIndex < length) {
      const newData = [...wavetable.data];
      newData[sampleIndex] = Math.max(0, Math.min(maxValue, value));
      onChange({ ...wavetable, data: newData });
    }
  };

  // Generator functions
  const applyWaveform = (type: WaveformType) => {
    const newData = generateWaveform(type, length, maxValue);
    onChange({ ...wavetable, data: newData });
    setShowGenerator(false);
  };

  const resizeWavetable = (newLength: number) => {
    if (newLength < 4 || newLength > 256) return;

    const newData: number[] = [];
    for (let i = 0; i < newLength; i++) {
      // Interpolate from old data
      const srcIndex = (i / newLength) * wavetable.data.length;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(wavetable.data.length - 1, srcIndexFloor + 1);
      const frac = srcIndex - srcIndexFloor;
      const value = wavetable.data[srcIndexFloor] * (1 - frac) + wavetable.data[srcIndexCeil] * frac;
      newData.push(Math.round(value));
    }

    onChange({ ...wavetable, data: newData, len: newLength });
  };

  const setMaxValue = (newMax: number) => {
    if (newMax < 1 || newMax > 255) return;

    // Scale existing data
    const scale = newMax / maxValue;
    const newData = wavetable.data.map(v => Math.round(v * scale));
    onChange({ ...wavetable, data: newData, max: newMax });
  };

  const clearWavetable = () => {
    const mid = Math.floor(maxValue / 2);
    onChange({ ...wavetable, data: Array(length).fill(mid) });
  };

  const invertWavetable = () => {
    const newData = wavetable.data.map(v => maxValue - v);
    onChange({ ...wavetable, data: newData });
  };

  return (
    <div className="bg-dark-bgSecondary rounded-lg border border-dark-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-dark-bg border-b border-dark-border">
        <div className="flex items-center gap-2">
          <Waves size={14} className="text-cyan-400" />
          <span className="font-mono text-[10px] font-bold text-text-primary">
            Wave {wavetable.id}
          </span>
          <span className="text-[9px] text-text-muted">
            {length}×{maxValue + 1}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Generator dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowGenerator(!showGenerator)}
              className="p-1 text-amber-400 hover:bg-amber-500/20 rounded"
              title="Generate waveform"
            >
              <Wand2 size={14} />
            </button>

            {showGenerator && (
              <div className="absolute top-full right-0 mt-1 bg-dark-bg border border-dark-border rounded shadow-lg z-20 min-w-[120px]">
                {(['sine', 'triangle', 'saw', 'square', 'pulse25', 'pulse12', 'noise'] as WaveformType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => applyWaveform(type)}
                    className="w-full px-3 py-1.5 text-left text-[10px] font-mono text-text-primary hover:bg-dark-bgSecondary capitalize"
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Invert */}
          <button
            onClick={invertWavetable}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-border/50 rounded"
            title="Invert"
          >
            <Copy size={14} />
          </button>

          {/* Clear */}
          <button
            onClick={clearWavetable}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-border/50 rounded"
            title="Clear"
          >
            <RotateCcw size={14} />
          </button>

          {/* Remove */}
          {onRemove && (
            <button
              onClick={onRemove}
              className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded"
              title="Remove wavetable"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={Math.max(200, length * 6)}
          height={height}
          className="cursor-crosshair w-full"
          onMouseDown={(e) => { setIsDragging(true); handleMouseEvent(e, true); }}
          onMouseMove={(e) => handleMouseEvent(e)}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
        />
      </div>

      {/* Size controls */}
      <div className="flex items-center justify-between px-3 py-2 bg-dark-bg border-t border-dark-border text-[9px] font-mono">
        <div className="flex items-center gap-2">
          <span className="text-text-muted">Length:</span>
          <button
            onClick={() => resizeWavetable(length / 2)}
            className="text-text-muted hover:text-text-primary"
            disabled={length <= 4}
          >
            ÷2
          </button>
          <span className="text-text-primary">{length}</span>
          <button
            onClick={() => resizeWavetable(length * 2)}
            className="text-text-muted hover:text-text-primary"
            disabled={length >= 256}
          >
            ×2
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-text-muted">Height:</span>
          <select
            value={maxValue}
            onChange={(e) => setMaxValue(parseInt(e.target.value))}
            className="bg-dark-bgSecondary border border-dark-border rounded px-1 py-0.5 text-text-primary"
          >
            <option value={3}>4</option>
            <option value={7}>8</option>
            <option value={15}>16</option>
            <option value={31}>32</option>
            <option value={63}>64</option>
            <option value={127}>128</option>
            <option value={255}>256</option>
          </select>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// WAVETABLE LIST EDITOR
// ============================================================================

export const WavetableListEditor: React.FC<WavetableListEditorProps> = ({
  wavetables,
  onChange,
  maxWavetables = 64,
}) => {
  const [selectedWave, setSelectedWave] = useState<number | null>(
    wavetables.length > 0 ? 0 : null
  );

  const addWavetable = () => {
    if (wavetables.length >= maxWavetables) return;

    const newId = wavetables.length > 0
      ? Math.max(...wavetables.map(w => w.id)) + 1
      : 0;

    const newWave: WavetableData = {
      id: newId,
      data: generateWaveform('sine', 32, 15),
      len: 32,
      max: 15,
    };

    onChange([...wavetables, newWave]);
    setSelectedWave(wavetables.length);
  };

  const removeWavetable = (index: number) => {
    const newWavetables = wavetables.filter((_, i) => i !== index);
    onChange(newWavetables);

    if (selectedWave === index) {
      setSelectedWave(newWavetables.length > 0 ? Math.min(index, newWavetables.length - 1) : null);
    } else if (selectedWave !== null && selectedWave > index) {
      setSelectedWave(selectedWave - 1);
    }
  };

  const updateWavetable = (index: number, updated: WavetableData) => {
    const newWavetables = [...wavetables];
    newWavetables[index] = updated;
    onChange(newWavetables);
  };

  const duplicateWavetable = (index: number) => {
    if (wavetables.length >= maxWavetables) return;

    const source = wavetables[index];
    const newId = Math.max(...wavetables.map(w => w.id)) + 1;

    const newWave: WavetableData = {
      ...source,
      id: newId,
      data: [...source.data],
    };

    onChange([...wavetables, newWave]);
    setSelectedWave(wavetables.length);
  };

  return (
    <div className="space-y-3">
      {/* Wavetable selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {wavetables.map((wave, index) => (
          <button
            key={wave.id}
            onClick={() => setSelectedWave(index)}
            className={`
              px-3 py-1.5 rounded font-mono text-[10px] border transition-colors
              ${selectedWave === index
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                : 'bg-dark-bg border-dark-border text-text-muted hover:text-text-primary hover:border-dark-border/80'
              }
            `}
          >
            Wave {wave.id}
          </button>
        ))}

        {wavetables.length < maxWavetables && (
          <>
            <button
              onClick={addWavetable}
              className="px-3 py-1.5 rounded border border-dashed border-dark-border text-text-muted hover:text-text-primary hover:border-accent text-[10px] font-mono flex items-center gap-1"
            >
              <Plus size={12} />
              Add
            </button>
            {selectedWave !== null && (
              <button
                onClick={() => duplicateWavetable(selectedWave)}
                className="px-3 py-1.5 rounded border border-dashed border-dark-border text-text-muted hover:text-text-primary hover:border-cyan-500 text-[10px] font-mono flex items-center gap-1"
              >
                <Copy size={12} />
                Duplicate
              </button>
            )}
          </>
        )}
      </div>

      {/* Selected wavetable editor */}
      {selectedWave !== null && wavetables[selectedWave] && (
        <WavetableEditor
          wavetable={wavetables[selectedWave]}
          onChange={(w) => updateWavetable(selectedWave, w)}
          onRemove={wavetables.length > 1 ? () => removeWavetable(selectedWave) : undefined}
        />
      )}

      {/* Empty state */}
      {wavetables.length === 0 && (
        <div className="text-center py-8 text-text-muted text-sm">
          <Waves size={32} className="mx-auto mb-2 opacity-50" />
          <p>No wavetables</p>
          <button
            onClick={addWavetable}
            className="mt-2 text-accent hover:underline text-xs"
          >
            Add your first wavetable
          </button>
        </div>
      )}
    </div>
  );
};

export default WavetableEditor;
