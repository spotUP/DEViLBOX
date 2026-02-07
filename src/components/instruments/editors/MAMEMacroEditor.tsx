/**
 * MAMEMacroEditor - Furnace-style macro editor for MAME chip synths
 *
 * Allows editing of tracker-style macros:
 * - Volume envelope
 * - Arpeggio sequence
 * - Pitch offset
 * - Duty cycle / noise mode
 * - Wavetable select
 * - Panning
 *
 * Features:
 * - Canvas-based step editor
 * - Loop point markers
 * - Release point markers
 * - Preset generators
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Trash2, ChevronDown } from 'lucide-react';
import { getToneEngine } from '@engine/ToneEngine';
import { MacroType } from '@engine/mame/MAMEMacroTypes';
import { useThemeStore } from '@stores/useThemeStore';

// ============================================================================
// TYPES
// ============================================================================

export interface MacroData {
  type: MacroType;
  data: number[];
  loop: number;      // Loop point index (-1 = no loop)
  release: number;   // Release point index (-1 = no release)
}

interface MacroEditorProps {
  macro: MacroData;
  onChange: (macro: MacroData) => void;
  label: string;
  min?: number;
  max?: number;
  signed?: boolean;
  color?: string;
  height?: number;
}

interface MAMEMacroEditorProps {
  instrumentId: number;
  macros: MacroData[];
  onChange: (macros: MacroData[]) => void;
  chipCapabilities?: {
    hasWavetable?: boolean;
    hasFM?: boolean;
    hasNoise?: boolean;
    hasPanning?: boolean;
  };
}

// ============================================================================
// MACRO TYPE METADATA
// ============================================================================

const MACRO_TYPE_INFO: Record<number, {
  label: string;
  min: number;
  max: number;
  signed: boolean;
  color: string;
  description: string;
}> = {
  [MacroType.VOLUME]: {
    label: 'Volume',
    min: 0, max: 127, signed: false,
    color: '#00d4aa',
    description: 'Volume envelope (0-127)',
  },
  [MacroType.ARPEGGIO]: {
    label: 'Arpeggio',
    min: -24, max: 24, signed: true,
    color: '#ff6b6b',
    description: 'Semitone offset (-24 to +24)',
  },
  [MacroType.DUTY]: {
    label: 'Duty/Wave',
    min: 0, max: 7, signed: false,
    color: '#ffd93d',
    description: 'Duty cycle or wave mode',
  },
  [MacroType.WAVETABLE]: {
    label: 'Wavetable',
    min: 0, max: 63, signed: false,
    color: '#6bcbff',
    description: 'Wavetable index select',
  },
  [MacroType.PITCH]: {
    label: 'Pitch',
    min: -128, max: 127, signed: true,
    color: '#c56bff',
    description: 'Fine pitch offset (cents)',
  },
  [MacroType.PANNING]: {
    label: 'Panning',
    min: -127, max: 127, signed: true,
    color: '#ff9f43',
    description: 'Left/Right panning',
  },
  [MacroType.PHASE_RESET]: {
    label: 'Phase Reset',
    min: 0, max: 1, signed: false,
    color: '#ff6b9d',
    description: 'Trigger phase reset (0/1)',
  },
  [MacroType.ALG]: {
    label: 'Algorithm',
    min: 0, max: 7, signed: false,
    color: '#4ecdc4',
    description: 'FM algorithm select',
  },
  [MacroType.FB]: {
    label: 'Feedback',
    min: 0, max: 7, signed: false,
    color: '#45b7d1',
    description: 'FM feedback amount',
  },
};

// ============================================================================
// MACRO PRESETS
// ============================================================================

const MACRO_PRESETS: Record<string, { name: string; data: number[]; loop?: number }> = {
  // Volume presets
  'vol-sustain': { name: 'Sustain', data: [127], loop: 0 },
  'vol-decay': { name: 'Decay', data: [127, 100, 80, 64, 50, 40, 32, 25, 20, 15, 10, 5, 0] },
  'vol-pluck': { name: 'Pluck', data: [127, 80, 50, 30, 15, 5, 0] },
  'vol-swell': { name: 'Swell', data: [0, 10, 25, 45, 70, 100, 127], loop: 6 },
  'vol-tremolo': { name: 'Tremolo', data: [127, 100, 80, 100, 127, 100, 80, 100], loop: 0 },

  // Arpeggio presets
  'arp-maj': { name: 'Major', data: [0, 4, 7], loop: 0 },
  'arp-min': { name: 'Minor', data: [0, 3, 7], loop: 0 },
  'arp-oct': { name: 'Octave', data: [0, 12], loop: 0 },
  'arp-5th': { name: 'Fifth', data: [0, 7], loop: 0 },
  'arp-dim': { name: 'Dim', data: [0, 3, 6], loop: 0 },

  // Pitch presets
  'pitch-vibrato': { name: 'Vibrato', data: [0, 5, 10, 5, 0, -5, -10, -5], loop: 0 },
  'pitch-wobble': { name: 'Wobble', data: [0, 15, 0, -15], loop: 0 },
  'pitch-slide-up': { name: 'Slide Up', data: [0, 5, 10, 15, 20, 25, 30] },
  'pitch-slide-dn': { name: 'Slide Down', data: [0, -5, -10, -15, -20, -25, -30] },

  // Duty presets
  'duty-cycle': { name: 'Cycle', data: [0, 1, 2, 3], loop: 0 },
  'duty-pulse': { name: 'Pulse', data: [0, 1, 0, 1, 2, 1], loop: 0 },
};

// ============================================================================
// SINGLE MACRO EDITOR COMPONENT
// ============================================================================

function SingleMacroEditor({
  macro,
  onChange,
  label,
  min = 0,
  max = 127,
  signed = false,
  color = '#00d4aa',
  height = 80,
}: MacroEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  const effectiveColor = isCyanTheme ? '#00ffff' : color;
  const bgColor = isCyanTheme ? '#030808' : '#0a0a0b';
  const gridColor = isCyanTheme ? 'rgba(0, 255, 255, 0.08)' : 'rgba(100, 100, 120, 0.15)';
  const textColor = isCyanTheme ? '#00ffff' : '#888';

  const data = macro.data.length > 0 ? macro.data : [signed ? 0 : Math.floor(max / 2)];
  const length = data.length;

  // Draw the macro editor
  const drawMacro = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = Math.max(200, length * 12);
    const logicalHeight = height;

    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    canvas.style.width = logicalWidth + 'px';
    canvas.style.height = logicalHeight + 'px';
    ctx.scale(dpr, dpr);

    const w = logicalWidth;
    const h = logicalHeight;
    const pad = 2;
    const stepWidth = (w - pad * 2) / Math.max(1, length);
    const range = max - min;
    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    // Horizontal grid (5 lines)
    for (let i = 0; i <= 4; i++) {
      const y = pad + ((h - pad * 2) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
    }

    // Zero line for signed values
    if (signed) {
      ctx.strokeStyle = isCyanTheme ? 'rgba(0, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(pad, h / 2);
      ctx.lineTo(w - pad, h / 2);
      ctx.stroke();
    }

    // Loop point marker
    if (macro.loop >= 0 && macro.loop < length) {
      const loopX = pad + macro.loop * stepWidth;
      ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
      ctx.fillRect(loopX, 0, w - loopX, h);
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(loopX, 0);
      ctx.lineTo(loopX, h);
      ctx.stroke();
    }

    // Release point marker
    if (macro.release >= 0 && macro.release < length) {
      const relX = pad + macro.release * stepWidth;
      ctx.strokeStyle = '#ff6600';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(relX, 0);
      ctx.lineTo(relX, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw bars
    for (let i = 0; i < length; i++) {
      const x = pad + i * stepWidth;
      const val = data[i];
      const normalizedVal = (val - min) / range;
      const barH = normalizedVal * (h - pad * 2);

      if (signed) {
        // Signed: draw from center
        const centerY = h / 2;
        const barTop = val >= 0 ? centerY - (normalizedVal - 0.5) * (h - pad * 2) : centerY;
        const barHeight = Math.abs(val) / (max - min) * (h - pad * 2);

        ctx.fillStyle = selectedStep === i ? '#ffffff' : effectiveColor;
        ctx.fillRect(x + 1, barTop, stepWidth - 2, barHeight);
      } else {
        // Unsigned: draw from bottom
        ctx.fillStyle = selectedStep === i ? '#ffffff' : effectiveColor;
        ctx.fillRect(x + 1, h - pad - barH, stepWidth - 2, barH);
      }

      // Step number (every 8 steps)
      if (i % 8 === 0) {
        ctx.fillStyle = textColor;
        ctx.font = '8px monospace';
        ctx.fillText(String(i), x + 2, h - 2);
      }
    }
  }, [data, length, height, min, max, signed, macro.loop, macro.release, selectedStep, effectiveColor, bgColor, gridColor, textColor, isCyanTheme]);

  useEffect(() => {
    drawMacro();
  }, [drawMacro]);

  // Handle mouse events
  const getStepFromEvent = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const stepWidth = rect.width / length;
    return Math.floor(x / stepWidth);
  }, [length]);

  const getValueFromEvent = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const normalizedY = 1 - y / rect.height;
    const range = max - min;
    return Math.round(min + normalizedY * range);
  }, [min, max]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const step = getStepFromEvent(e);
    const value = getValueFromEvent(e);
    if (step === null || step < 0 || step >= length) return;

    setIsDragging(true);
    setSelectedStep(step);

    const newData = [...data];
    newData[step] = Math.max(min, Math.min(max, value));
    onChange({ ...macro, data: newData });
  }, [getStepFromEvent, getValueFromEvent, data, length, min, max, onChange, macro]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;

    const step = getStepFromEvent(e);
    const value = getValueFromEvent(e);
    if (step === null || step < 0 || step >= length) return;

    setSelectedStep(step);
    const newData = [...data];
    newData[step] = Math.max(min, Math.min(max, value));
    onChange({ ...macro, data: newData });
  }, [isDragging, getStepFromEvent, getValueFromEvent, data, length, min, max, onChange, macro]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setSelectedStep(null);
  }, []);

  // Length controls
  const addStep = useCallback(() => {
    const newData = [...data, data[data.length - 1] || 0];
    onChange({ ...macro, data: newData });
  }, [data, onChange, macro]);

  const removeStep = useCallback(() => {
    if (data.length <= 1) return;
    const newData = data.slice(0, -1);
    const newLoop = macro.loop >= newData.length ? newData.length - 1 : macro.loop;
    const newRelease = macro.release >= newData.length ? -1 : macro.release;
    onChange({ ...macro, data: newData, loop: newLoop, release: newRelease });
  }, [data, onChange, macro]);

  const clearMacro = useCallback(() => {
    const defaultVal = signed ? 0 : Math.floor(max / 2);
    onChange({ ...macro, data: [defaultVal], loop: -1, release: -1 });
  }, [onChange, macro, signed, max]);

  const setLoopPoint = useCallback(() => {
    if (selectedStep !== null) {
      onChange({ ...macro, loop: macro.loop === selectedStep ? -1 : selectedStep });
    }
  }, [selectedStep, onChange, macro]);

  const setReleasePoint = useCallback(() => {
    if (selectedStep !== null) {
      onChange({ ...macro, release: macro.release === selectedStep ? -1 : selectedStep });
    }
  }, [selectedStep, onChange, macro]);

  return (
    <div className="flex flex-col gap-1">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: effectiveColor }}>
          {label}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-slate-500">{length} steps</span>
          <button
            onClick={addStep}
            className="px-1 py-0.5 text-[9px] bg-dark-surface hover:bg-dark-border rounded"
            title="Add step"
          >+</button>
          <button
            onClick={removeStep}
            className="px-1 py-0.5 text-[9px] bg-dark-surface hover:bg-dark-border rounded"
            title="Remove step"
          >-</button>
          <button
            onClick={setLoopPoint}
            className="px-1 py-0.5 text-[9px] bg-green-900/50 hover:bg-green-800/50 rounded"
            title="Set loop point"
          >L</button>
          <button
            onClick={setReleasePoint}
            className="px-1 py-0.5 text-[9px] bg-orange-900/50 hover:bg-orange-800/50 rounded"
            title="Set release point"
          >R</button>
          <button
            onClick={clearMacro}
            className="px-1 py-0.5 text-[9px] bg-red-900/50 hover:bg-red-800/50 rounded"
            title="Clear"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative overflow-x-auto">
        <canvas
          ref={canvasRef}
          className="cursor-crosshair rounded"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
    </div>
  );
}

// ============================================================================
// MAIN MACRO EDITOR COMPONENT
// ============================================================================

export function MAMEMacroEditor({
  instrumentId,
  macros,
  onChange,
  chipCapabilities = {},
}: MAMEMacroEditorProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<number>>(new Set([MacroType.VOLUME]));
  const [presetMenuOpen, setPresetMenuOpen] = useState<number | null>(null);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Determine which macro types to show based on chip capabilities
  const availableMacroTypes = useMemo(() => {
    const types: MacroType[] = [MacroType.VOLUME, MacroType.ARPEGGIO, MacroType.PITCH];

    if (chipCapabilities.hasWavetable) {
      types.push(MacroType.WAVETABLE);
    }
    if (chipCapabilities.hasNoise) {
      types.push(MacroType.DUTY);
    }
    if (chipCapabilities.hasPanning) {
      types.push(MacroType.PANNING);
    }
    if (chipCapabilities.hasFM) {
      types.push(MacroType.ALG, MacroType.FB);
    }
    types.push(MacroType.PHASE_RESET);

    return types;
  }, [chipCapabilities]);

  // Get macro by type or create default
  const getMacro = useCallback((type: MacroType): MacroData => {
    const existing = macros.find(m => m.type === type);
    if (existing) return existing;

    const info = MACRO_TYPE_INFO[type];
    const defaultVal = info?.signed ? 0 : (info?.max || 127);
    return {
      type,
      data: [defaultVal],
      loop: -1,
      release: -1,
    };
  }, [macros]);

  // Update a specific macro
  const updateMacro = useCallback((type: MacroType, macro: MacroData) => {
    const newMacros = macros.filter(m => m.type !== type);
    newMacros.push(macro);
    onChange(newMacros);

    // Also update the synth instance
    const engine = getToneEngine();
    const synth = engine.getMAMEChipSynth(instrumentId);
    if (synth) {
      synth.setMacro({
        type: macro.type,
        data: macro.data,
        loop: macro.loop,
        release: macro.release,
      });
    }
  }, [macros, onChange, instrumentId]);

  // Apply a preset
  const applyPreset = useCallback((type: MacroType, presetKey: string) => {
    const preset = MACRO_PRESETS[presetKey];
    if (!preset) return;

    const macro = getMacro(type);
    updateMacro(type, {
      ...macro,
      data: [...preset.data],
      loop: preset.loop ?? -1,
    });
    setPresetMenuOpen(null);
  }, [getMacro, updateMacro]);

  // Toggle expanded state
  const toggleExpanded = useCallback((type: MacroType) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Get relevant presets for a macro type
  const getPresetsForType = useCallback((type: MacroType): string[] => {
    const prefix = type === MacroType.VOLUME ? 'vol-' :
                   type === MacroType.ARPEGGIO ? 'arp-' :
                   type === MacroType.PITCH ? 'pitch-' :
                   type === MacroType.DUTY ? 'duty-' : '';
    return Object.keys(MACRO_PRESETS).filter(k => k.startsWith(prefix));
  }, []);

  const panelBg = isCyanTheme
    ? 'linear-gradient(180deg, #0a1515 0%, #050c0c 100%)'
    : 'linear-gradient(180deg, #1e1e1e 0%, #151515 100%)';
  const borderColor = isCyanTheme ? 'rgba(0, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.08)';

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: panelBg, border: `1px solid ${borderColor}` }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center justify-between border-b"
        style={{ borderColor }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: isCyanTheme ? '#00ffff' : '#e2e8f0' }}
        >
          Macros
        </span>
        <span className="text-[10px] text-slate-500">
          {macros.filter(m => m.data.length > 1).length} active
        </span>
      </div>

      {/* Macro Editors */}
      <div className="p-2 space-y-2">
        {availableMacroTypes.map(type => {
          const info = MACRO_TYPE_INFO[type];
          if (!info) return null;

          const macro = getMacro(type);
          const isExpanded = expandedTypes.has(type);
          const isActive = macro.data.length > 1;
          const presets = getPresetsForType(type);

          return (
            <div
              key={type}
              className="rounded border"
              style={{ borderColor: isActive ? info.color + '40' : borderColor }}
            >
              {/* Macro Header */}
              <button
                onClick={() => toggleExpanded(type)}
                className="w-full px-2 py-1.5 flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: isActive ? info.color : '#444' }}
                  />
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: isCyanTheme ? '#00ffff' : '#e2e8f0' }}
                  >
                    {info.label}
                  </span>
                  {isActive && (
                    <span className="text-[9px] text-slate-500">
                      ({macro.data.length} steps)
                    </span>
                  )}
                </div>
                <ChevronDown
                  size={14}
                  className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  style={{ color: isCyanTheme ? '#00ffff' : '#888' }}
                />
              </button>

              {/* Expanded Editor */}
              {isExpanded && (
                <div className="px-2 pb-2 space-y-2">
                  {/* Preset dropdown */}
                  {presets.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setPresetMenuOpen(presetMenuOpen === type ? null : type)}
                        className="text-[10px] px-2 py-1 bg-dark-surface hover:bg-dark-border rounded flex items-center gap-1"
                      >
                        Presets
                        <ChevronDown size={10} />
                      </button>
                      {presetMenuOpen === type && (
                        <div className="absolute top-full left-0 mt-1 bg-dark-bg border border-dark-border rounded shadow-lg z-10">
                          {presets.map(key => (
                            <button
                              key={key}
                              onClick={() => applyPreset(type, key)}
                              className="block w-full text-left px-3 py-1.5 text-[10px] hover:bg-dark-surface"
                            >
                              {MACRO_PRESETS[key].name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Macro canvas editor */}
                  <SingleMacroEditor
                    macro={macro}
                    onChange={(newMacro) => updateMacro(type, newMacro)}
                    label={info.label}
                    min={info.min}
                    max={info.max}
                    signed={info.signed}
                    color={info.color}
                    height={60}
                  />

                  {/* Description */}
                  <p className="text-[9px] text-slate-500 px-1">{info.description}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MAMEMacroEditor;
