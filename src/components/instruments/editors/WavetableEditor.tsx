/**
 * WavetableEditor — Chip Musician Waveform Studio.
 *
 * Originally a simple Furnace-style wavetable editor; now a full
 * studio with Draw / Harmonic / Math / Presets modes, drawing aids,
 * A/B compare, chip constraint enforcement, and live spectrum.
 *
 * Compact layout ≈ the original small inline editor (drawing + generators).
 * Studio layout opens the full workspace side-by-side with mode panels
 * and the live spectrum.
 *
 * API compatibility: `wavetable` + `onChange` unchanged, so existing
 * callers (Furnace instrument editor, GT Ultra modal) don't need to
 * update. The new `initialLayout` prop lets parents open in studio mode.
 */

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { Waves, Plus, Trash2, Copy, Wand2, FileUp } from 'lucide-react';
import { WaveformThumbnail } from '@components/instruments/shared';
import {
  StudioToolbar, DrawCanvas, HarmonicPanel, MathPanel, PresetBrowser, LivePanels,
  type StudioMode, type StudioLayout,
  CHIP_TARGETS, detectChipTarget, type ChipTargetId,
  applyChipTarget, dcRemove, normalize, invert as invertOp, reverse as reverseOp,
  mirrorLeftToRight, quarterWaveReflect, phaseAlignToPeak,
} from './wavetable';

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
  /** Initial layout — 'compact' (default) or 'studio' */
  initialLayout?: StudioLayout;
}

interface WavetableListEditorProps {
  wavetables: WavetableData[];
  onChange: (wavetables: WavetableData[]) => void;
  maxWavetables?: number;
}

// ============================================================================
// WAVEFORM GENERATORS (used by the quick Wand2 dropdown + add-new)
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
        value = phase < 0.5 ? phase * 4 * mid : (1 - phase) * 4 * mid;
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

// Resample helper used by file import and length changes
const resampleData = (data: number[], targetLen: number): number[] => {
  if (data.length === targetLen) return data;
  const result: number[] = [];
  const ratio = data.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;
    const a = data[srcIndex];
    const b = data[(srcIndex + 1) % data.length];
    result.push(Math.round(a + (b - a) * frac));
  }
  return result;
};

// ============================================================================
// WAVETABLE EDITOR COMPONENT
// ============================================================================

export const WavetableEditor: React.FC<WavetableEditorProps> = ({
  wavetable,
  onChange,
  onRemove,
  height = 180,
  initialLayout = 'compact',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showGenerator, setShowGenerator] = useState(false);

  // Studio state
  const [layout, setLayout] = useState<StudioLayout>(initialLayout);
  const [mode, setMode] = useState<StudioMode>('draw');
  const [chipTarget, setChipTarget] = useState<ChipTargetId>(() =>
    detectChipTarget(wavetable.data.length || 32, wavetable.max ?? 15),
  );
  const [compareBuffer, setCompareBuffer] = useState<number[] | null>(null);
  const [compareMax, setCompareMax] = useState<number>(wavetable.max ?? 15);
  const [harmonics, setHarmonics] = useState<number[]>(() => {
    const arr = new Array(32).fill(0);
    arr[0] = 1;
    return arr;
  });
  const [mathExpr, setMathExpr] = useState<string>('sin(x*TAU)');

  const maxValue = wavetable.max ?? 15;
  const length = wavetable.data.length || 32;
  const targetConfig = CHIP_TARGETS[chipTarget];

  // When chip target changes, resample/requantize the wavetable to match.
  const handleChipTargetChange = useCallback(
    (newTargetId: ChipTargetId) => {
      const newTarget = CHIP_TARGETS[newTargetId];
      setChipTarget(newTargetId);
      // Only transform if the dimensions actually differ
      if (length === newTarget.defaultLen && maxValue === newTarget.maxValue) return;
      const result = applyChipTarget(wavetable.data, maxValue, newTarget.defaultLen, newTarget.maxValue);
      onChange({ ...wavetable, data: result.data, len: result.len, max: result.max });
    },
    [length, maxValue, wavetable, onChange],
  );

  // Handle file import (.wav or .h)
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.name.endsWith('.h')) {
        const text = await file.text();
        const values = text.split(/[\s,]+/).map((v) => parseInt(v)).filter((v) => !isNaN(v));
        if (values.length > 0) {
          const importMax = Math.max(...values);
          const scaled = values.map((v) => Math.round((v / importMax) * maxValue));
          const resampled = resampleData(scaled, length);
          onChange({ ...wavetable, data: resampled });
        }
      } else {
        const { getDevilboxAudioContext } = await import('@utils/audio-context');
        let audioCtx: AudioContext;
        try { audioCtx = getDevilboxAudioContext(); } catch { audioCtx = new AudioContext(); }
        const arrayBuffer = await file.arrayBuffer();
        const buffer = await audioCtx.decodeAudioData(arrayBuffer);
        const rawData = buffer.getChannelData(0);
        const values = Array.from(rawData).map((v) => Math.round((v + 1) / 2 * maxValue));
        const resampled = resampleData(values, length);
        onChange({ ...wavetable, data: resampled });
      }
    } catch (err) {
      console.error('Failed to import wavetable:', err);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Generator shortcuts
  const applyWaveform = (type: WaveformType) => {
    const newData = generateWaveform(type, length, maxValue);
    onChange({ ...wavetable, data: newData });
    setShowGenerator(false);
  };

  const resizeWavetable = (newLength: number) => {
    const min = targetConfig.minLen;
    const max = targetConfig.maxLen;
    const step = targetConfig.lenStep;
    const snapped = Math.round(newLength / step) * step;
    if (snapped < min || snapped > max) return;
    const newData: number[] = [];
    for (let i = 0; i < snapped; i++) {
      const srcIndex = (i / snapped) * wavetable.data.length;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(wavetable.data.length - 1, srcIndexFloor + 1);
      const frac = srcIndex - srcIndexFloor;
      const value =
        wavetable.data[srcIndexFloor] * (1 - frac) + wavetable.data[srcIndexCeil] * frac;
      newData.push(Math.round(value));
    }
    onChange({ ...wavetable, data: newData, len: snapped });
  };

  const setMaxValueHandler = (newMax: number) => {
    if (newMax < 1 || newMax > 255) return;
    const scale = newMax / maxValue;
    const newData = wavetable.data.map((v) => Math.round(v * scale));
    onChange({ ...wavetable, data: newData, max: newMax });
  };

  const clearWavetable = () => {
    const mid = Math.floor(maxValue / 2);
    onChange({ ...wavetable, data: Array(length).fill(mid) });
  };

  const updateData = useCallback(
    (newData: number[]) => {
      onChange({ ...wavetable, data: newData });
    },
    [wavetable, onChange],
  );

  // ── Quick ops (toolbar) ─────────────────────────────────────
  const opDcRemove = useCallback(() => updateData(dcRemove(wavetable.data, maxValue)), [wavetable.data, maxValue, updateData]);
  const opNormalize = useCallback(() => updateData(normalize(wavetable.data, maxValue)), [wavetable.data, maxValue, updateData]);
  const opInvert = useCallback(() => updateData(invertOp(wavetable.data, maxValue)), [wavetable.data, maxValue, updateData]);
  const opReverse = useCallback(() => updateData(reverseOp(wavetable.data)), [wavetable.data, updateData]);
  const opMirror = useCallback(() => updateData(mirrorLeftToRight(wavetable.data)), [wavetable.data, updateData]);
  const opQuarterReflect = useCallback(() => updateData(quarterWaveReflect(wavetable.data, maxValue)), [wavetable.data, maxValue, updateData]);
  const opPhaseAlign = useCallback(() => updateData(phaseAlignToPeak(wavetable.data)), [wavetable.data, updateData]);

  // ── A/B compare ─────────────────────────────────────────────
  const captureCompare = useCallback(() => {
    setCompareBuffer([...wavetable.data]);
    setCompareMax(maxValue);
  }, [wavetable.data, maxValue]);

  const clearCompare = useCallback(() => {
    setCompareBuffer(null);
  }, []);

  const swapCompare = useCallback(() => {
    if (!compareBuffer) return;
    const currentData = [...wavetable.data];
    updateData(compareBuffer);
    setCompareBuffer(currentData);
  }, [compareBuffer, wavetable.data, updateData]);

  // ── Layout toggle effect: keep chip target synced when wavetable changes externally ──
  useEffect(() => {
    // Nothing to do — the detectChipTarget is only used for initial mount.
  }, []);

  const showStudioPanels = layout === 'studio';
  const showLivePanels = layout === 'studio';

  const headerBadge = useMemo(() => (
    <div className="flex items-center gap-2">
      <Waves size={14} className="text-accent-highlight" />
      <span className="font-mono text-[10px] font-bold text-text-primary">
        Wave {wavetable.id}
      </span>
      <span className="text-[9px] text-text-muted">
        {length}×{maxValue + 1}
      </span>
    </div>
  ), [wavetable.id, length, maxValue]);

  return (
    <div className="bg-dark-bgSecondary rounded-lg border border-dark-border overflow-hidden">
      {/* Header — always shown */}
      <div className="flex items-center justify-between px-3 py-2 bg-dark-bg border-b border-dark-border">
        {headerBadge}
        <div className="flex items-center gap-1">
          {/* Import */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1 text-accent-highlight hover:bg-accent-highlight/20 rounded"
            title="Import .wav or .h wave"
          >
            <FileUp size={14} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.h,.fuw"
            onChange={handleImport}
            className="hidden"
          />
          {/* Generator dropdown (Compact quick access) */}
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
                {(['sine', 'triangle', 'saw', 'square', 'pulse25', 'pulse12', 'noise'] as WaveformType[]).map(
                  (type) => (
                    <button
                      key={type}
                      onClick={() => applyWaveform(type)}
                      className="w-full px-3 py-1.5 text-left text-[10px] font-mono text-text-primary hover:bg-dark-bgSecondary capitalize"
                    >
                      {type}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
          <button
            onClick={clearWavetable}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-border/50 rounded"
            title="Clear"
          >
            <Copy size={14} className="rotate-180" />
          </button>
          {onRemove && (
            <button
              onClick={onRemove}
              className="p-1 text-accent-error hover:text-accent-error hover:bg-accent-error/20 rounded"
              title="Remove wavetable"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Studio toolbar */}
      <StudioToolbar
        mode={mode}
        onModeChange={setMode}
        chipTarget={chipTarget}
        onChipTargetChange={handleChipTargetChange}
        layout={layout}
        onLayoutChange={setLayout}
        onDcRemove={opDcRemove}
        onNormalize={opNormalize}
        onInvert={opInvert}
        onReverse={opReverse}
        onMirror={opMirror}
        onQuarterReflect={opQuarterReflect}
        onPhaseAlign={opPhaseAlign}
        hasCompareBuffer={compareBuffer !== null}
        onCaptureCompare={captureCompare}
        onClearCompare={clearCompare}
        onSwapCompare={swapCompare}
      />

      {/* Main content — draw canvas always visible, optional side/bottom panels */}
      <div className={`p-2 ${showStudioPanels ? 'grid gap-2' : 'flex flex-col gap-2'}`}
        style={showStudioPanels ? { gridTemplateColumns: 'minmax(0, 1fr) 280px' } : undefined}>
        {/* Left column: draw canvas + mode-specific panel */}
        <div className="flex flex-col gap-2 min-w-0">
          <DrawCanvas
            data={wavetable.data}
            maxValue={maxValue}
            height={height}
            chipTarget={targetConfig}
            compareData={compareBuffer}
            onChange={updateData}
          />

          {/* Size controls */}
          <div className="flex items-center justify-between px-2 py-1.5 bg-dark-bg rounded border border-dark-border text-[9px] font-mono">
            <div className="flex items-center gap-2">
              <span className="text-text-muted">Length:</span>
              <button
                onClick={() => resizeWavetable(length - targetConfig.lenStep)}
                className="text-text-muted hover:text-text-primary disabled:opacity-40"
                disabled={targetConfig.lockedLen || length <= targetConfig.minLen}
              >
                ÷
              </button>
              <span className="text-text-primary">{length}</span>
              <button
                onClick={() => resizeWavetable(length + targetConfig.lenStep)}
                className="text-text-muted hover:text-text-primary disabled:opacity-40"
                disabled={targetConfig.lockedLen || length >= targetConfig.maxLen}
              >
                ×
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-text-muted">Height:</span>
              <select
                value={maxValue}
                onChange={(e) => setMaxValueHandler(parseInt(e.target.value))}
                disabled={targetConfig.lockedDepth}
                className="bg-dark-bgSecondary border border-dark-border rounded px-1 py-0.5 text-text-primary disabled:opacity-50"
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
            <div className="text-text-subtle text-[9px]">
              {targetConfig.description}
            </div>
          </div>

          {/* Mode panel (studio layout only) */}
          {showStudioPanels && mode === 'harmonic' && (
            <HarmonicPanel
              harmonics={harmonics}
              onHarmonicsChange={setHarmonics}
              length={length}
              maxValue={maxValue}
              onDataChange={updateData}
            />
          )}
          {showStudioPanels && mode === 'math' && (
            <MathPanel
              expr={mathExpr}
              onExprChange={setMathExpr}
              length={length}
              maxValue={maxValue}
              onDataChange={updateData}
            />
          )}
          {showStudioPanels && mode === 'presets' && (
            <PresetBrowser
              currentLen={length}
              currentMax={maxValue}
              currentData={wavetable.data}
              onLoad={(data, len, max) =>
                onChange({ ...wavetable, data, len, max })
              }
            />
          )}
        </div>

        {/* Right column: live spectrum (studio layout only) */}
        {showLivePanels && (
          <div className="flex flex-col gap-2">
            <LivePanels
              data={wavetable.data}
              maxValue={maxValue}
              compareData={compareBuffer}
              compareMax={compareMax}
            />
          </div>
        )}
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
    wavetables.length > 0 ? 0 : null,
  );

  const addWavetable = () => {
    if (wavetables.length >= maxWavetables) return;
    const newId =
      wavetables.length > 0 ? Math.max(...wavetables.map((w) => w.id)) + 1 : 0;
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
      setSelectedWave(
        newWavetables.length > 0 ? Math.min(index, newWavetables.length - 1) : null,
      );
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
    const newId = Math.max(...wavetables.map((w) => w.id)) + 1;
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
        {wavetables.map((wave, index) => {
          const isSelected = selectedWave === index;
          return (
            <button
              key={wave.id}
              onClick={() => setSelectedWave(index)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded border transition-colors
                ${isSelected
                  ? 'bg-accent-highlight/20 border-accent-highlight'
                  : 'bg-dark-bg border-dark-border hover:border-dark-border/80'
                }`}
            >
              <WaveformThumbnail
                data={wave.data}
                maxValue={wave.max ?? 15}
                width={52}
                height={18}
                color={isSelected ? '#22d3ee' : '#4b5563'}
                style="bar"
              />
              <span
                className={`font-mono text-[9px] ${isSelected ? 'text-accent-highlight' : 'text-text-muted'}`}
              >
                Wave {wave.id}
              </span>
            </button>
          );
        })}

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
                className="px-3 py-1.5 rounded border border-dashed border-dark-border text-text-muted hover:text-text-primary hover:border-accent-highlight text-[10px] font-mono flex items-center gap-1"
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
