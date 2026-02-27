/**
 * MacroEditor - Full-featured Furnace-style macro editor (enhanced)
 *
 * Based on Furnace tracker's macro editing (insEdit.cpp drawMacroEdit)
 * Features:
 * - Canvas-based value drawing with mouse drag
 * - Shift+drag line-draw mode for smooth envelopes
 * - Loop and release point markers (click-to-set)
 * - Playback position cursor (live tracking when playing)
 * - Hover tooltip with value + musical interpretation (note names for ARP)
 * - Note reference guide lines for ARP macros (Root, 3rd, 5th, Oct)
 * - Preset pattern library (Zap button, click-toggle dropdown)
 * - Macro length control + speed setting
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FurnaceMacroType, type FurnaceMacro } from '@typedefs/instrument';
import { RotateCcw, Plus, Minus, Repeat, Flag, Zap } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MacroEditorProps {
  macro: FurnaceMacro;
  macroType: number;
  onChange: (macro: FurnaceMacro) => void;
  minValue?: number;
  maxValue?: number;
  height?: number;
  color?: string;
  label?: string;
  bipolar?: boolean;      // For pitch/arp macros that can be negative
  playbackPosition?: number; // Current playing step (undefined = not playing)
}

interface MacroListEditorProps {
  macros: FurnaceMacro[];
  onChange: (macros: FurnaceMacro[]) => void;
  chipType?: number;
  playbackPositions?: Record<number, number>; // macroType → current playback step
}

// ── Macro type metadata ────────────────────────────────────────────────────────

const MACRO_TYPE_NAMES: Record<number, string> = {
  [FurnaceMacroType.VOL]:         'Volume',
  [FurnaceMacroType.ARP]:         'Arpeggio',
  [FurnaceMacroType.DUTY]:        'Duty',
  [FurnaceMacroType.WAVE]:        'Waveform',
  [FurnaceMacroType.PITCH]:       'Pitch',
  [FurnaceMacroType.EX1]:         'Extra 1',
  [FurnaceMacroType.EX2]:         'Extra 2',
  [FurnaceMacroType.EX3]:         'Extra 3',
  [FurnaceMacroType.ALG]:         'Algorithm',
  [FurnaceMacroType.FB]:          'Feedback',
  [FurnaceMacroType.FMS]:         'FM LFO Speed',
  [FurnaceMacroType.AMS]:         'AM LFO Speed',
  [FurnaceMacroType.PAN_L]:       'Pan Left',
  [FurnaceMacroType.PAN_R]:       'Pan Right',
  [FurnaceMacroType.PHASE_RESET]: 'Phase Reset',
  [FurnaceMacroType.EX4]:         'Extra 4',
  [FurnaceMacroType.EX5]:         'Extra 5',
  [FurnaceMacroType.EX6]:         'Extra 6',
  [FurnaceMacroType.EX7]:         'Extra 7',
  [FurnaceMacroType.EX8]:         'Extra 8',
  [FurnaceMacroType.FMS2]:        'FM LFO Speed 2',
  [FurnaceMacroType.AMS2]:        'AM LFO Speed 2',
};

// ── ARP note reference lines (musical intervals) ──────────────────────────────

const ARP_NOTE_REFS = [
  { value: -12, label: '−Oct', color: 'rgba(90, 180, 255, 0.45)' },
  { value:  -7, label: '−5th', color: 'rgba(90, 180, 255, 0.22)' },
  { value:  -5, label: '−4th', color: 'rgba(90, 180, 255, 0.18)' },
  { value:  -4, label: '−M3',  color: 'rgba(90, 180, 255, 0.18)' },
  { value:  -3, label: '−m3',  color: 'rgba(90, 180, 255, 0.18)' },
  { value:   0, label: 'Root', color: 'rgba(80, 255, 120, 0.65)' },
  { value:   3, label: 'm3',   color: 'rgba(90, 180, 255, 0.18)' },
  { value:   4, label: 'M3',   color: 'rgba(90, 180, 255, 0.18)' },
  { value:   5, label: '4th',  color: 'rgba(90, 180, 255, 0.18)' },
  { value:   7, label: '5th',  color: 'rgba(90, 180, 255, 0.45)' },
  { value:   9, label: 'M6',   color: 'rgba(90, 180, 255, 0.22)' },
  { value:  10, label: 'm7',   color: 'rgba(90, 180, 255, 0.18)' },
  { value:  12, label: '+Oct', color: 'rgba(90, 180, 255, 0.45)' },
] as const;

// ── Preset patterns ────────────────────────────────────────────────────────────

interface MacroPreset {
  name: string;
  data: number[];
  loop?: number;
  release?: number;
}

const MACRO_PRESETS: Partial<Record<number, MacroPreset[]>> = {
  [FurnaceMacroType.VOL]: [
    { name: 'Fade In',   data: [0, 2, 4, 6, 8, 10, 12, 14, 15, 15, 15, 15, 15, 15, 15, 15] },
    { name: 'Fade Out',  data: [15, 13, 11, 9, 7, 5, 3, 1, 0] },
    { name: 'Tremolo',   data: [15, 8, 15, 8, 15, 8, 15, 8], loop: 0 },
    { name: 'Gate',      data: [15, 15, 15, 15, 0, 0, 0, 0], loop: 0 },
    { name: 'Staccato',  data: [15, 0, 0, 0], loop: 0 },
    { name: 'Organ',     data: [12, 12, 12, 12, 12, 12, 12, 12, 8, 8, 8, 8, 6, 6, 5, 4], loop: 2, release: 8 },
    { name: 'Piano',     data: [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] },
  ],
  [FurnaceMacroType.ARP]: [
    { name: 'Major',     data: [0, 4, 7, 0, 4, 7], loop: 0 },
    { name: 'Minor',     data: [0, 3, 7, 0, 3, 7], loop: 0 },
    { name: 'Power',     data: [0, 7, 0, 7], loop: 0 },
    { name: 'Octave',    data: [0, 12, 0, 12], loop: 0 },
    { name: 'Maj 7th',   data: [0, 4, 7, 11], loop: 0 },
    { name: 'Dom 7th',   data: [0, 4, 7, 10], loop: 0 },
    { name: 'Min 7th',   data: [0, 3, 7, 10], loop: 0 },
    { name: 'Chromatic', data: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], loop: 0 },
    { name: 'Diminished',data: [0, 3, 6, 0, 3, 6], loop: 0 },
  ],
  [FurnaceMacroType.PITCH]: [
    { name: 'Vibrato',   data: [0, 2, 4, 2, 0, -2, -4, -2], loop: 0 },
    { name: 'Vib Fast',  data: [0, 4, 0, -4, 0, 4, 0, -4], loop: 0 },
    { name: 'Trill',     data: [0, 2, 0, 2, 0, 2, 0, 2], loop: 0 },
    { name: 'Bend Up',   data: [0, 2, 4, 6, 8, 10, 12] },
    { name: 'Bend Down', data: [0, -2, -4, -6, -8, -10, -12] },
    { name: 'Drop',      data: [0, 0, 0, 0, 0, -3, -6, -9, -12] },
    { name: 'Scoop',     data: [-8, -6, -4, -2, 0] },
  ],
  [FurnaceMacroType.DUTY]: [
    { name: 'Square',    data: [2] },
    { name: 'Pulse 25%', data: [1] },
    { name: 'Pulse 12%', data: [0] },
    { name: 'PWM Up',    data: [0, 0, 1, 1, 2, 2, 3, 3], loop: 0 },
    { name: 'PWM Down',  data: [3, 3, 2, 2, 1, 1, 0, 0], loop: 0 },
    { name: 'PWM Slow',  data: [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1], loop: 0 },
  ],
};

// ── Value display formatting ───────────────────────────────────────────────────

function formatMacroValue(value: number, macroType: number): string {
  const sign = (v: number) => v > 0 ? `+${v}` : `${v}`;
  switch (macroType) {
    case FurnaceMacroType.ARP: {
      const ref = ARP_NOTE_REFS.find(r => r.value === value);
      return ref ? `${sign(value)} (${ref.label})` : sign(value);
    }
    case FurnaceMacroType.PITCH:
      return sign(value);
    case FurnaceMacroType.VOL:
      return `Vol ${value}`;
    case FurnaceMacroType.DUTY:
      return `Duty ${value}`;
    case FurnaceMacroType.WAVE:
      return `Wave ${value}`;
    default:
      return `${value}`;
  }
}

// ── MacroEditor component ──────────────────────────────────────────────────────

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
  playbackPosition,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isSettingLoop, setIsSettingLoop] = useState(false);
  const [isSettingRelease, setIsSettingRelease] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [hoveredStep, setHoveredStep] = useState<{
    step: number; value: number; x: number; y: number
  } | null>(null);

  // Line-draw mode state (persists across renders via ref)
  const dragStartRef = useRef<{ step: number; value: number } | null>(null);
  const isLineModeRef = useRef(false);

  const macroLabel = label || MACRO_TYPE_NAMES[macroType] || `Macro ${macroType}`;
  const presets = MACRO_PRESETS[macroType] ?? [];
  const isArpMacro = macroType === FurnaceMacroType.ARP && bipolar;

  // Calculate step width so all steps are visible
  const stepWidth = Math.max(8, Math.min(20, 400 / Math.max(macro.data.length, 1)));
  const canvasWidth = Math.max(400, macro.data.length * stepWidth);

  // ── Canvas drawing ──────────────────────────────────────────────────────────

  const drawMacro = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = canvasWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width  = `${canvasWidth}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const w = canvasWidth;
    const h = height;
    const range = maxValue - minValue;

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    // Horizontal grid lines (4 divisions)
    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Zero line for bipolar macros
    if (bipolar && minValue < 0) {
      const zeroY = h * (maxValue / range);
      ctx.strokeStyle = '#5a5a8e';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, zeroY); ctx.lineTo(w, zeroY); ctx.stroke();
    }

    // ARP note reference lines (musical intervals)
    if (isArpMacro) {
      ctx.setLineDash([3, 6]);
      ARP_NOTE_REFS.forEach(ref => {
        if (ref.value < minValue || ref.value > maxValue) return;
        const y = h - ((ref.value - minValue) / range) * h;
        ctx.strokeStyle = ref.color;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        // Label at left edge
        ctx.fillStyle = ref.color;
        ctx.font = '8px monospace';
        ctx.fillText(ref.label, 3, y - 1);
      });
      ctx.setLineDash([]);
    }

    // Vertical grid (every 4 steps)
    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth = 1;
    for (let i = 0; i < macro.data.length; i += 4) {
      const x = (i / macro.data.length) * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    // Loop region shading
    if (macro.loop >= 0 && macro.loop < macro.data.length) {
      const loopX = (macro.loop / macro.data.length) * w;
      const releaseX = macro.release >= 0 ? (macro.release / macro.data.length) * w : w;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.10)';
      ctx.fillRect(loopX, 0, releaseX - loopX, h);
    }

    // Value bars
    const barWidth = w / macro.data.length;
    macro.data.forEach((value, i) => {
      const x = i * barWidth;
      const normalizedValue = (value - minValue) / range;
      const barHeight = normalizedValue * h;
      const y = h - barHeight;

      const isHovered = hoveredStep?.step === i;
      ctx.fillStyle   = isHovered ? 'rgba(255, 255, 255, 0.85)' : color;
      ctx.strokeStyle = isHovered ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
      ctx.strokeRect(x + 1, y, barWidth - 2, barHeight);
    });

    // Loop point marker
    if (macro.loop >= 0 && macro.loop < macro.data.length) {
      const loopX = (macro.loop / macro.data.length) * w;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(loopX, 0); ctx.lineTo(loopX, h); ctx.stroke();
      // Arrow pointing down
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.moveTo(loopX - 6, 10); ctx.lineTo(loopX, 0); ctx.lineTo(loopX + 6, 10);
      ctx.closePath(); ctx.fill();
    }

    // Release point marker
    if (macro.release >= 0 && macro.release < macro.data.length) {
      const releaseX = (macro.release / macro.data.length) * w;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(releaseX, 0); ctx.lineTo(releaseX, h); ctx.stroke();
      // Square marker
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(releaseX - 5, 5, 10, 10);
    }

    // Playback cursor (yellow diamond + line)
    if (typeof playbackPosition === 'number' && playbackPosition >= 0 && playbackPosition < macro.data.length) {
      const px = ((playbackPosition + 0.5) / macro.data.length) * w;
      ctx.strokeStyle = 'rgba(255, 220, 0, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
      ctx.fillStyle = 'rgba(255, 220, 0, 0.9)';
      ctx.beginPath();
      ctx.moveTo(px, 4);
      ctx.lineTo(px - 5, 14);
      ctx.lineTo(px, 24);
      ctx.lineTo(px + 5, 14);
      ctx.closePath(); ctx.fill();
    }
  }, [macro, minValue, maxValue, color, bipolar, isArpMacro, canvasWidth, height, hoveredStep, playbackPosition]);

  useEffect(() => { drawMacro(); }, [drawMacro]);

  // ── Mouse coordinate helpers ────────────────────────────────────────────────

  const getStepFromMouse = (e: React.MouseEvent): { step: number; value: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { step: 0, value: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const step  = Math.max(0, Math.min(macro.data.length - 1, Math.floor((x / rect.width) * macro.data.length)));
    const range = maxValue - minValue;
    const value = Math.max(minValue, Math.min(maxValue, Math.round(minValue + (1 - y / rect.height) * range)));
    return { step, value };
  };

  // Fill values along a straight line between two step positions
  const applyLine = useCallback((
    startStep: number, startVal: number,
    endStep:   number, endVal:   number,
  ) => {
    const newData = [...macro.data];
    const lo = Math.min(startStep, endStep);
    const hi = Math.max(startStep, endStep);
    for (let s = lo; s <= hi; s++) {
      const t = hi === lo ? 0 : (s - lo) / (hi - lo);
      const v = startStep <= endStep
        ? startVal + (endVal - startVal) * t
        : endVal   + (startVal - endVal) * (1 - t);
      newData[s] = Math.max(minValue, Math.min(maxValue, Math.round(v)));
    }
    onChange({ ...macro, data: newData });
  }, [macro, minValue, maxValue, onChange]);

  // ── Mouse event handlers ────────────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent) => {
    // Mode: set loop/release point
    if (isSettingLoop || isSettingRelease) {
      const { step } = getStepFromMouse(e);
      if (isSettingLoop) {
        onChange({ ...macro, loop: step });
        setIsSettingLoop(false);
      } else {
        onChange({ ...macro, release: step });
        setIsSettingRelease(false);
      }
      return;
    }

    setIsDragging(true);
    const { step, value } = getStepFromMouse(e);
    dragStartRef.current = { step, value };
    isLineModeRef.current = e.shiftKey;

    // In normal mode, paint the first step immediately
    if (!e.shiftKey) {
      const newData = [...macro.data];
      newData[step] = value;
      onChange({ ...macro, data: newData });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const { step, value } = getStepFromMouse(e);

    // Always update hover tooltip
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const currentValue = macro.data[step] ?? value;
      setHoveredStep({
        step,
        value: currentValue,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }

    if (!isDragging) return;

    if (isLineModeRef.current && dragStartRef.current) {
      // Line-draw: interpolate from drag start to current
      applyLine(dragStartRef.current.step, dragStartRef.current.value, step, value);
    } else {
      // Normal paint mode
      const newData = [...macro.data];
      newData[step] = value;
      onChange({ ...macro, data: newData });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoveredStep(null);
  };

  // ── Length controls ─────────────────────────────────────────────────────────

  const addStep = () => {
    if (macro.data.length >= 256) return;
    onChange({ ...macro, data: [...macro.data, macro.data[macro.data.length - 1] ?? 0] });
  };

  const removeStep = () => {
    if (macro.data.length <= 1) return;
    const newData    = macro.data.slice(0, -1);
    const newLoop    = macro.loop    >= newData.length ? newData.length - 1 : macro.loop;
    const newRelease = macro.release >= newData.length ? newData.length - 1 : macro.release;
    onChange({ ...macro, data: newData, loop: newLoop, release: newRelease });
  };

  const resetMacro = () => {
    onChange({
      ...macro,
      data: Array(macro.data.length).fill(bipolar ? 0 : minValue),
      loop: -1,
      release: -1,
    });
  };

  const applyPreset = (preset: MacroPreset) => {
    onChange({
      ...macro,
      data:    [...preset.data],
      loop:    preset.loop    ?? -1,
      release: preset.release ?? -1,
    });
    setShowPresets(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

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
          {isArpMacro && (
            <span className="text-[9px] text-blue-400/70 font-mono hidden sm:inline">
              shift+drag = line
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Speed */}
          <label className="flex items-center gap-1 text-[10px] text-text-muted mr-1">
            <span>Spd:</span>
            <input
              type="number" min={1} max={16}
              value={macro.speed ?? 1}
              onChange={(e) => onChange({ ...macro, speed: parseInt(e.target.value) || 1 })}
              className="w-8 bg-dark-bg border border-dark-border rounded px-1 py-0.5 text-text-primary text-[10px] font-mono"
            />
          </label>

          {/* Step count */}
          <button onClick={removeStep}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-border/50 rounded"
            title="Remove step">
            <Minus size={12} />
          </button>
          <button onClick={addStep}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-border/50 rounded"
            title="Add step">
            <Plus size={12} />
          </button>

          {/* Loop */}
          <button
            onClick={() => { setIsSettingLoop(!isSettingLoop); setIsSettingRelease(false); }}
            className={`p-1 rounded transition-colors ${
              isSettingLoop ? 'bg-blue-500 text-white' : 'text-blue-400 hover:bg-blue-500/20'
            }`}
            title={isSettingLoop ? 'Click canvas to set loop point' : 'Set loop point'}>
            <Repeat size={12} />
          </button>

          {/* Release */}
          <button
            onClick={() => { setIsSettingRelease(!isSettingRelease); setIsSettingLoop(false); }}
            className={`p-1 rounded transition-colors ${
              isSettingRelease ? 'bg-red-500 text-white' : 'text-red-400 hover:bg-red-500/20'
            }`}
            title={isSettingRelease ? 'Click canvas to set release point' : 'Set release point'}>
            <Flag size={12} />
          </button>

          {/* Preset patterns */}
          {presets.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowPresets(!showPresets)}
                className={`p-1 rounded transition-colors ${
                  showPresets
                    ? 'bg-amber-500/30 text-amber-300'
                    : 'text-amber-400 hover:bg-amber-500/20'
                }`}
                title="Preset patterns">
                <Zap size={12} />
              </button>
              {showPresets && (
                <div className="absolute top-full right-0 mt-1 bg-dark-bg border border-dark-border rounded-lg shadow-xl z-30 min-w-[130px]">
                  <div className="px-2 py-1 text-[9px] text-text-muted font-mono uppercase border-b border-dark-border">
                    Patterns
                  </div>
                  {presets.map((preset, i) => (
                    <button
                      key={i}
                      onClick={() => applyPreset(preset)}
                      className="w-full px-3 py-1.5 text-left text-[10px] font-mono text-text-primary hover:bg-dark-bgSecondary flex items-center justify-between gap-4">
                      <span>{preset.name}</span>
                      <span className="text-text-muted text-[9px]">{preset.data.length}st</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reset */}
          <button onClick={resetMacro}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-border/50 rounded"
            title="Reset macro">
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="relative overflow-x-auto"
        style={{ height: height + 20 }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: 'block' }}
          className={`${
            isSettingLoop || isSettingRelease ? 'cursor-crosshair' : 'cursor-pointer'
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        />

        {/* Hover tooltip */}
        {hoveredStep && (
          <div
            className="absolute pointer-events-none z-20 bg-dark-bg/95 border border-dark-border rounded px-2 py-1 text-[10px] font-mono text-text-primary shadow-lg"
            style={{
              left:       Math.min(hoveredStep.x + 10, canvasWidth - 110),
              top:        Math.max(4, hoveredStep.y - 30),
              whiteSpace: 'nowrap',
            }}
          >
            <span className="text-text-muted mr-1">#{hoveredStep.step}:</span>
            {formatMacroValue(hoveredStep.value, macroType)}
          </div>
        )}

        {/* Bottom info bar */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center gap-4 px-2 py-0.5 bg-dark-bg/80 text-[9px] font-mono">
          {macro.loop >= 0 ? (
            <button
              onClick={() => onChange({ ...macro, loop: -1 })}
              className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
              <Repeat size={9} /> Loop@{macro.loop}
              <span className="text-text-muted ml-0.5">×</span>
            </button>
          ) : (
            <span className="text-text-muted">No loop</span>
          )}

          {macro.release >= 0 ? (
            <button
              onClick={() => onChange({ ...macro, release: -1 })}
              className="flex items-center gap-1 text-red-400 hover:text-red-300">
              <Flag size={9} /> Release@{macro.release}
              <span className="text-text-muted ml-0.5">×</span>
            </button>
          ) : (
            <span className="text-text-muted">No release</span>
          )}

          {typeof playbackPosition === 'number' && (
            <span className="text-yellow-400 ml-auto">▶ {playbackPosition}</span>
          )}
        </div>
      </div>
    </div>
  );
};

// ── MacroListEditor ────────────────────────────────────────────────────────────

export const MacroListEditor: React.FC<MacroListEditorProps> = ({
  macros,
  onChange,
  playbackPositions,
}) => {
  const [expandedMacro, setExpandedMacro] = useState<number | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const getMacroRange = (macroType: number): { min: number; max: number; bipolar: boolean } => {
    switch (macroType) {
      case FurnaceMacroType.VOL:   return { min: 0,    max: 15,  bipolar: false };
      case FurnaceMacroType.ARP:   return { min: -12,  max: 12,  bipolar: true  };
      case FurnaceMacroType.DUTY:  return { min: 0,    max: 3,   bipolar: false };
      case FurnaceMacroType.WAVE:  return { min: 0,    max: 255, bipolar: false };
      case FurnaceMacroType.PITCH: return { min: -128, max: 127, bipolar: true  };
      case FurnaceMacroType.ALG:   return { min: 0,    max: 7,   bipolar: false };
      case FurnaceMacroType.FB:    return { min: 0,    max: 7,   bipolar: false };
      default:                     return { min: 0,    max: 15,  bipolar: false };
    }
  };

  const getMacroColor = (macroType: number): string => {
    const colors: Record<number, string> = {
      [FurnaceMacroType.VOL]:   '#22c55e',
      [FurnaceMacroType.ARP]:   '#3b82f6',
      [FurnaceMacroType.DUTY]:  '#f59e0b',
      [FurnaceMacroType.WAVE]:  '#06b6d4',
      [FurnaceMacroType.PITCH]: '#ec4899',
    };
    return colors[macroType] ?? '#a78bfa';
  };

  const addMacro = (type: number) => {
    const range = getMacroRange(type);
    const newMacro: FurnaceMacro = {
      type,
      data:    Array(16).fill(range.bipolar ? 0 : range.min),
      loop:    -1,
      release: -1,
      mode:    0,
      speed:   1,
    };
    onChange([...macros, newMacro]);
    setExpandedMacro(macros.length);
    setShowAddMenu(false);
  };

  const removeMacro = (index: number) => {
    onChange(macros.filter((_, i) => i !== index));
    if (expandedMacro === index) setExpandedMacro(null);
  };

  const updateMacro = (index: number, updated: FurnaceMacro) => {
    const newMacros = [...macros];
    newMacros[index] = updated;
    onChange(newMacros);
  };

  // Types not yet added
  const availableTypes = Object.entries(MACRO_TYPE_NAMES)
    .filter(([typeNum]) => !macros.some(m => m.type === parseInt(typeNum)))
    .map(([typeNum, name]) => ({ type: parseInt(typeNum), name }));

  return (
    <div className="space-y-2">
      {/* Existing macros */}
      {macros.map((macro, index) => (
        <div key={index} className="border border-dark-border rounded-lg overflow-hidden">
          {/* Collapsed header */}
          <div
            className="flex items-center justify-between px-3 py-2 bg-dark-bg cursor-pointer hover:bg-dark-bgSecondary select-none"
            onClick={() => setExpandedMacro(expandedMacro === index ? null : index)}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: getMacroColor(macro.type) }}
              />
              <span className="font-mono text-xs font-bold text-text-primary">
                {MACRO_TYPE_NAMES[macro.type] || `Macro ${macro.type}`}
              </span>
              <span className="text-[10px] text-text-muted">
                {macro.data.length}st
                {macro.loop    >= 0 && ` · loop@${macro.loop}`}
                {macro.release >= 0 && ` · rel@${macro.release}`}
              </span>
              {typeof playbackPositions?.[macro.type] === 'number' && (
                <span className="text-[9px] text-yellow-400">▶ {playbackPositions[macro.type]}</span>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); removeMacro(index); }}
              className="text-red-400 hover:text-red-300 text-xs px-1 hover:bg-red-500/10 rounded"
            >
              ×
            </button>
          </div>

          {/* Expanded editor */}
          {expandedMacro === index && (
            <MacroEditor
              macro={macro}
              macroType={macro.type}
              onChange={(m) => updateMacro(index, m)}
              {...getMacroRange(macro.type)}
              color={getMacroColor(macro.type)}
              playbackPosition={playbackPositions?.[macro.type]}
            />
          )}
        </div>
      ))}

      {/* Add macro — click-toggle dropdown (not hover) */}
      {availableTypes.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className={`w-full py-2 border border-dashed rounded-lg text-xs font-mono flex items-center justify-center gap-2 transition-colors ${
              showAddMenu
                ? 'border-accent text-text-primary bg-dark-bgSecondary'
                : 'border-dark-border text-text-muted hover:text-text-primary hover:border-accent'
            }`}
          >
            <Plus size={14} />
            Add Macro
          </button>
          {showAddMenu && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-dark-bg border border-dark-border rounded-lg shadow-xl z-10 max-h-52 overflow-y-auto">
              {availableTypes.map(({ type, name }) => (
                <button
                  key={type}
                  onClick={() => addMacro(type)}
                  className="w-full px-3 py-2 text-left text-xs font-mono text-text-primary hover:bg-dark-bgSecondary flex items-center gap-2"
                >
                  <div
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: getMacroColor(type) }}
                  />
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MacroEditor;
