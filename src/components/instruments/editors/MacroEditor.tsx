/**
 * MacroEditor - Full-featured Furnace-style macro editor
 *
 * Based on Furnace tracker's macro editing (insEdit.cpp drawMacroEdit)
 * Features:
 * - Canvas-based value drawing with mouse drag
 * - Loop and release point markers
 * - Macro length control
 * - Speed/mode settings
 * - Visual feedback of current playback position
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FurnaceMacroType, type FurnaceMacro } from '@typedefs/instrument';
import { RotateCcw, Plus, Minus, Repeat, Flag } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface MacroEditorProps {
  macro: FurnaceMacro;
  macroType: number;
  onChange: (macro: FurnaceMacro) => void;
  minValue?: number;
  maxValue?: number;
  height?: number;
  color?: string;
  label?: string;
  bipolar?: boolean;  // For pitch/arp macros that can be negative
}

// ============================================================================
// MACRO TYPE NAMES
// ============================================================================

const MACRO_TYPE_NAMES: Record<number, string> = {
  [FurnaceMacroType.VOL]: 'Volume',
  [FurnaceMacroType.ARP]: 'Arpeggio',
  [FurnaceMacroType.DUTY]: 'Duty',
  [FurnaceMacroType.WAVE]: 'Waveform',
  [FurnaceMacroType.PITCH]: 'Pitch',
  [FurnaceMacroType.EX1]: 'Extra 1',
  [FurnaceMacroType.EX2]: 'Extra 2',
  [FurnaceMacroType.EX3]: 'Extra 3',
  [FurnaceMacroType.EX4]: 'Extra 4',
  [FurnaceMacroType.EX5]: 'Extra 5',
  [FurnaceMacroType.EX6]: 'Extra 6',
  [FurnaceMacroType.EX7]: 'Extra 7',
  [FurnaceMacroType.EX8]: 'Extra 8',
  [FurnaceMacroType.ALG]: 'Algorithm',
  [FurnaceMacroType.FB]: 'Feedback',
  [FurnaceMacroType.FMS]: 'FM LFO Speed',
  [FurnaceMacroType.AMS]: 'AM LFO Speed',
  [FurnaceMacroType.PAN_L]: 'Pan Left',
  [FurnaceMacroType.PAN_R]: 'Pan Right',
  [FurnaceMacroType.PHASE_RESET]: 'Phase Reset',
};

// ============================================================================
// MACRO EDITOR COMPONENT
// ============================================================================

export const MacroEditor: React.FC<MacroEditorProps> = ({
  macro,
  macroType,
  onChange,
  minValue = 0,
  maxValue = 15,
  height = 120,
  color = '#a78bfa',
  label,
  bipolar = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSettingLoop, setIsSettingLoop] = useState(false);
  const [isSettingRelease, setIsSettingRelease] = useState(false);

  const macroLabel = label || MACRO_TYPE_NAMES[macroType] || `Macro ${macroType}`;

  // Calculate dimensions
  const stepWidth = Math.max(8, Math.min(20, 400 / Math.max(macro.data.length, 1)));
  const canvasWidth = Math.max(400, macro.data.length * stepWidth);

  // Draw the macro
  const drawMacro = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const range = maxValue - minValue;

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    // Draw grid lines
    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth = 1;

    // Horizontal grid
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Zero line for bipolar
    if (bipolar && minValue < 0) {
      const zeroY = h * (maxValue / range);
      ctx.strokeStyle = '#4a4a6e';
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(w, zeroY);
      ctx.stroke();
    }

    // Vertical grid (every 4 steps)
    ctx.strokeStyle = '#2a2a4e';
    for (let i = 0; i < macro.data.length; i += 4) {
      const x = (i / macro.data.length) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Draw loop region
    if (macro.loop >= 0 && macro.loop < macro.data.length) {
      const loopX = (macro.loop / macro.data.length) * w;
      const releaseX = macro.release >= 0 ? (macro.release / macro.data.length) * w : w;

      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.fillRect(loopX, 0, releaseX - loopX, h);
    }

    // Draw bars
    const barWidth = w / macro.data.length;
    macro.data.forEach((value, i) => {
      const x = i * barWidth;
      const normalizedValue = (value - minValue) / range;
      const barHeight = normalizedValue * h;
      const y = h - barHeight;

      // Bar fill
      ctx.fillStyle = color;
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);

      // Bar outline
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.strokeRect(x + 1, y, barWidth - 2, barHeight);
    });

    // Draw loop marker
    if (macro.loop >= 0 && macro.loop < macro.data.length) {
      const loopX = (macro.loop / macro.data.length) * w;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(loopX, 0);
      ctx.lineTo(loopX, h);
      ctx.stroke();

      // Loop arrow
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.moveTo(loopX - 6, 10);
      ctx.lineTo(loopX, 0);
      ctx.lineTo(loopX + 6, 10);
      ctx.closePath();
      ctx.fill();
    }

    // Draw release marker
    if (macro.release >= 0 && macro.release < macro.data.length) {
      const releaseX = (macro.release / macro.data.length) * w;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(releaseX, 0);
      ctx.lineTo(releaseX, h);
      ctx.stroke();

      // Release square
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(releaseX - 5, 5, 10, 10);
    }
  }, [macro, minValue, maxValue, color, bipolar]);

  useEffect(() => {
    drawMacro();
  }, [drawMacro]);

  // Handle mouse interaction
  const getStepFromMouse = (e: React.MouseEvent): { step: number; value: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { step: 0, value: 0 };

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const step = Math.floor((x / rect.width) * macro.data.length);
    const range = maxValue - minValue;
    const normalizedY = 1 - (y / rect.height);
    const value = Math.round(minValue + normalizedY * range);

    return {
      step: Math.max(0, Math.min(macro.data.length - 1, step)),
      value: Math.max(minValue, Math.min(maxValue, value)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isSettingLoop || isSettingRelease) {
      const { step } = getStepFromMouse(e);
      if (isSettingLoop) {
        onChange({ ...macro, loop: step });
        setIsSettingLoop(false);
      } else if (isSettingRelease) {
        onChange({ ...macro, release: step });
        setIsSettingRelease(false);
      }
      return;
    }

    setIsDragging(true);
    const { step, value } = getStepFromMouse(e);
    const newData = [...macro.data];
    newData[step] = value;
    onChange({ ...macro, data: newData });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const { step, value } = getStepFromMouse(e);
    const newData = [...macro.data];
    newData[step] = value;
    onChange({ ...macro, data: newData });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Length controls
  const addStep = () => {
    if (macro.data.length >= 256) return;
    onChange({ ...macro, data: [...macro.data, macro.data[macro.data.length - 1] || 0] });
  };

  const removeStep = () => {
    if (macro.data.length <= 1) return;
    const newData = macro.data.slice(0, -1);
    const newLoop = macro.loop >= newData.length ? newData.length - 1 : macro.loop;
    const newRelease = macro.release >= newData.length ? newData.length - 1 : macro.release;
    onChange({ ...macro, data: newData, loop: newLoop, release: newRelease });
  };

  const resetMacro = () => {
    const defaultValue = bipolar ? 0 : minValue;
    onChange({
      ...macro,
      data: Array(macro.data.length).fill(defaultValue),
      loop: -1,
      release: -1,
    });
  };

  const clearLoop = () => {
    onChange({ ...macro, loop: -1 });
  };

  const clearRelease = () => {
    onChange({ ...macro, release: -1 });
  };

  return (
    <div className="bg-dark-bgSecondary rounded-lg border border-dark-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-dark-bg border-b border-dark-border">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
            {macroLabel}
          </span>
          <span className="text-[10px] text-text-muted font-mono">
            {macro.data.length} steps
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Speed control */}
          <label className="flex items-center gap-1 text-[10px] text-text-muted mr-2">
            <span>Speed:</span>
            <input
              type="number"
              min={1}
              max={16}
              value={macro.speed || 1}
              onChange={(e) => onChange({ ...macro, speed: parseInt(e.target.value) || 1 })}
              className="w-10 bg-dark-bg border border-dark-border rounded px-1 py-0.5 text-text-primary text-[10px] font-mono"
            />
          </label>

          {/* Length controls */}
          <button
            onClick={removeStep}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-border/50 rounded"
            title="Remove step"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={addStep}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-border/50 rounded"
            title="Add step"
          >
            <Plus size={14} />
          </button>

          {/* Loop/Release */}
          <button
            onClick={() => { setIsSettingLoop(!isSettingLoop); setIsSettingRelease(false); }}
            className={`p-1 rounded ${isSettingLoop ? 'bg-blue-500 text-white' : 'text-blue-400 hover:bg-blue-500/20'}`}
            title={isSettingLoop ? 'Click on macro to set loop' : 'Set loop point'}
          >
            <Repeat size={14} />
          </button>
          <button
            onClick={() => { setIsSettingRelease(!isSettingRelease); setIsSettingLoop(false); }}
            className={`p-1 rounded ${isSettingRelease ? 'bg-red-500 text-white' : 'text-red-400 hover:bg-red-500/20'}`}
            title={isSettingRelease ? 'Click on macro to set release' : 'Set release point'}
          >
            <Flag size={14} />
          </button>

          {/* Reset */}
          <button
            onClick={resetMacro}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-border/50 rounded"
            title="Reset macro"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative overflow-x-auto"
        style={{ height: height + 20 }}
      >
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={height}
          className={`cursor-${isSettingLoop || isSettingRelease ? 'crosshair' : 'pointer'}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />

        {/* Loop/Release info */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center gap-4 px-2 py-1 bg-dark-bg/80 text-[9px] font-mono">
          {macro.loop >= 0 ? (
            <button onClick={clearLoop} className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
              <Repeat size={10} />
              Loop: {macro.loop}
              <span className="text-text-muted">×</span>
            </button>
          ) : (
            <span className="text-text-muted">No loop</span>
          )}
          {macro.release >= 0 ? (
            <button onClick={clearRelease} className="flex items-center gap-1 text-red-400 hover:text-red-300">
              <Flag size={10} />
              Release: {macro.release}
              <span className="text-text-muted">×</span>
            </button>
          ) : (
            <span className="text-text-muted">No release</span>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MACRO LIST EDITOR
// ============================================================================

interface MacroListEditorProps {
  macros: FurnaceMacro[];
  onChange: (macros: FurnaceMacro[]) => void;
  chipType?: number;  // For chip-specific macro ranges
}

export const MacroListEditor: React.FC<MacroListEditorProps> = ({
  macros,
  onChange,
  chipType: _chipType = 0,  // Reserved for future chip-specific macro ranges
}) => {
  const [expandedMacro, setExpandedMacro] = useState<number | null>(null);

  // Get macro range based on type
  const getMacroRange = (macroType: number): { min: number; max: number; bipolar: boolean } => {
    switch (macroType) {
      case FurnaceMacroType.VOL:
        return { min: 0, max: 15, bipolar: false };
      case FurnaceMacroType.ARP:
        return { min: -12, max: 12, bipolar: true };
      case FurnaceMacroType.DUTY:
        return { min: 0, max: 3, bipolar: false };
      case FurnaceMacroType.WAVE:
        return { min: 0, max: 255, bipolar: false };
      case FurnaceMacroType.PITCH:
        return { min: -128, max: 127, bipolar: true };
      case FurnaceMacroType.ALG:
        return { min: 0, max: 7, bipolar: false };
      case FurnaceMacroType.FB:
        return { min: 0, max: 7, bipolar: false };
      default:
        return { min: 0, max: 15, bipolar: false };
    }
  };

  // Get color for macro type
  const getMacroColor = (macroType: number): string => {
    switch (macroType) {
      case FurnaceMacroType.VOL: return '#22c55e';
      case FurnaceMacroType.ARP: return '#3b82f6';
      case FurnaceMacroType.DUTY: return '#f59e0b';
      case FurnaceMacroType.WAVE: return '#06b6d4';
      case FurnaceMacroType.PITCH: return '#ec4899';
      default: return '#a78bfa';
    }
  };

  const addMacro = (type: number) => {
    const range = getMacroRange(type);
    const defaultValue = range.bipolar ? 0 : range.min;
    const newMacro: FurnaceMacro = {
      type,
      data: Array(16).fill(defaultValue),
      loop: -1,
      release: -1,
      mode: 0,
      speed: 1,
    };
    onChange([...macros, newMacro]);
    setExpandedMacro(macros.length);
  };

  const removeMacro = (index: number) => {
    onChange(macros.filter((_, i) => i !== index));
    if (expandedMacro === index) setExpandedMacro(null);
  };

  const updateMacro = (index: number, updatedMacro: FurnaceMacro) => {
    const newMacros = [...macros];
    newMacros[index] = updatedMacro;
    onChange(newMacros);
  };

  // Available macro types to add
  const availableTypes = Object.entries(MACRO_TYPE_NAMES)
    .filter(([typeNum]) => !macros.some(m => m.type === parseInt(typeNum)))
    .map(([typeNum, name]) => ({ type: parseInt(typeNum), name }));

  return (
    <div className="space-y-2">
      {/* Existing macros */}
      {macros.map((macro, index) => (
        <div key={index} className="border border-dark-border rounded-lg overflow-hidden">
          {/* Macro header (collapsed view) */}
          <div
            className="flex items-center justify-between px-3 py-2 bg-dark-bg cursor-pointer hover:bg-dark-bgSecondary"
            onClick={() => setExpandedMacro(expandedMacro === index ? null : index)}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: getMacroColor(macro.type) }}
              />
              <span className="font-mono text-xs font-bold text-text-primary">
                {MACRO_TYPE_NAMES[macro.type] || `Macro ${macro.type}`}
              </span>
              <span className="text-[10px] text-text-muted">
                {macro.data.length} steps
                {macro.loop >= 0 && ` • Loop@${macro.loop}`}
                {macro.release >= 0 && ` • Rel@${macro.release}`}
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); removeMacro(index); }}
              className="text-red-400 hover:text-red-300 text-xs"
            >
              ×
            </button>
          </div>

          {/* Expanded macro editor */}
          {expandedMacro === index && (
            <MacroEditor
              macro={macro}
              macroType={macro.type}
              onChange={(m) => updateMacro(index, m)}
              {...getMacroRange(macro.type)}
              color={getMacroColor(macro.type)}
            />
          )}
        </div>
      ))}

      {/* Add macro button */}
      {availableTypes.length > 0 && (
        <div className="relative group">
          <button className="w-full py-2 border border-dashed border-dark-border rounded-lg text-text-muted hover:text-text-primary hover:border-accent text-xs font-mono flex items-center justify-center gap-2">
            <Plus size={14} />
            Add Macro
          </button>
          <div className="absolute top-full left-0 right-0 mt-1 bg-dark-bg border border-dark-border rounded-lg shadow-lg z-10 hidden group-hover:block">
            {availableTypes.slice(0, 10).map(({ type, name }) => (
              <button
                key={type}
                onClick={() => addMacro(type)}
                className="w-full px-3 py-2 text-left text-xs font-mono text-text-primary hover:bg-dark-bgSecondary flex items-center gap-2"
              >
                <div
                  className="w-2 h-2 rounded-sm"
                  style={{ backgroundColor: getMacroColor(type) }}
                />
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MacroEditor;
