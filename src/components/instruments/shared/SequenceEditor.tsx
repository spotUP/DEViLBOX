/**
 * SequenceEditor - Step sequence editor for UADE synth instruments
 *
 * A Furnace-inspired modular sequence/arpeggio editor that can be reused
 * across all UADE synth editors that use step tables (SoundMon arpeggio,
 * SidMon1 waveform sequence, OctaMED note table, HippelCoSo macros, etc.).
 *
 * Features:
 * - Bar-chart canvas with click-drag editing
 * - Shift+drag line-draw mode for smooth envelopes
 * - Optional playback cursor
 * - Loop/end point markers
 * - Hover tooltip with value label
 * - Named value display (e.g. note names for semitone offsets, waveform names)
 * - Preset patterns (common arpeggios, envelopes, etc.)
 * - Optional text cells overlay (for hex/decimal step entry)
 *
 * Usage:
 *   <SequenceEditor
 *     label="Arpeggio"
 *     data={config.arpTable}
 *     onChange={(d) => onChange({ arpTable: d })}
 *     min={-64} max={63}
 *     bipolar
 *     showNoteNames
 *   />
 *
 *   <SequenceEditor
 *     label="Wave Sequence"
 *     data={config.waveSeq}
 *     onChange={(d) => onChange({ waveSeq: d })}
 *     min={0} max={7}
 *     valueLabels={['Sine', 'Tri', 'Saw', 'Square', 'Pulse', 'Noise', 'Wave6', 'Wave7']}
 *   />
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Repeat, Flag, Zap, Minus, Plus, RotateCcw } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SequencePreset {
  name: string;
  data: number[];
  loop?: number;
  end?: number;
}

export interface SequenceEditorProps {
  /** Sequence label shown in header */
  label: string;
  /** Sequence data (the step values) */
  data: number[];
  onChange: (data: number[]) => void;

  /** Value range */
  min?: number;
  max?: number;
  /** Allow negative values (draws zero-line + shows sign in tooltip) */
  bipolar?: boolean;

  /** Loop point index (-1 = none) */
  loop?: number;
  onLoopChange?: (loop: number) => void;
  /** End/release point index (-1 = none) */
  end?: number;
  onEndChange?: (end: number) => void;

  /** Current playback position (undefined = not playing) */
  playbackPosition?: number;

  /** Custom value labels for enumerated values (e.g. waveform names) */
  valueLabels?: string[];
  /** Show semitone interval names for ARP-style sequences */
  showNoteNames?: boolean;

  /** Preset patterns for quick insertion */
  presets?: SequencePreset[];

  /** Fixed step count (if set, +/- step buttons hidden) */
  fixedLength?: boolean;
  maxLength?: number;

  /** Bar color */
  color?: string;
  /** Canvas height in px */
  height?: number;

  /** Show hex text inputs below canvas (for precise editing) */
  showCells?: boolean;
  /** Cell display format */
  cellFormat?: 'dec' | 'hex' | 'signed';
}

// ── Musical interval reference lines ──────────────────────────────────────────

const NOTE_REFS = [
  { value: -12, label: '−Oct', color: 'rgba(90, 180, 255, 0.45)' },
  { value:  -7, label: '−5th', color: 'rgba(90, 180, 255, 0.22)' },
  { value:   0, label: 'Root', color: 'rgba(80, 255, 120, 0.65)' },
  { value:   7, label: '5th',  color: 'rgba(90, 180, 255, 0.45)' },
  { value:  12, label: '+Oct', color: 'rgba(90, 180, 255, 0.45)' },
] as const;

// ── Value format helpers ───────────────────────────────────────────────────────

function formatValue(
  value: number,
  format: SequenceEditorProps['cellFormat'],
  valueLabels?: string[],
  showNoteNames?: boolean,
): string {
  if (valueLabels && value >= 0 && value < valueLabels.length) {
    return valueLabels[value];
  }
  if (showNoteNames) {
    const ref = NOTE_REFS.find(r => r.value === value);
    if (ref) return `${value > 0 ? '+' : ''}${value} (${ref.label})`;
    return value > 0 ? `+${value}` : `${value}`;
  }
  switch (format) {
    case 'hex':    return `$${(value & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
    case 'signed': return value > 0 ? `+${value}` : `${value}`;
    default:       return `${value}`;
  }
}

// ── SequenceEditor component ───────────────────────────────────────────────────

export const SequenceEditor: React.FC<SequenceEditorProps> = ({
  label,
  data,
  onChange,
  min = 0,
  max = 15,
  bipolar = false,
  loop = -1,
  onLoopChange,
  end = -1,
  onEndChange,
  playbackPosition,
  valueLabels,
  showNoteNames = false,
  presets = [],
  fixedLength = false,
  maxLength = 256,
  color = '#a78bfa',
  height = 100,
  showCells = false,
  cellFormat = 'dec',
}) => {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isDragging,      setIsDragging]      = useState(false);
  const [isSettingLoop,   setIsSettingLoop]    = useState(false);
  const [isSettingEnd,    setIsSettingEnd]     = useState(false);
  const [showPresets,     setShowPresets]      = useState(false);
  const [hoveredStep,     setHoveredStep]      = useState<{
    step: number; value: number; x: number; y: number;
  } | null>(null);

  const dragStartRef    = useRef<{ step: number; value: number } | null>(null);
  const isLineModeRef   = useRef(false);

  const range      = max - min;
  const stepWidth  = Math.max(8, Math.min(24, 400 / Math.max(data.length, 1)));
  const canvasWidth = Math.max(400, data.length * stepWidth);

  // ── Canvas drawing ────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width        = canvasWidth * dpr;
    canvas.height       = height * dpr;
    canvas.style.width  = `${canvasWidth}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const w = canvasWidth;
    const h = height;

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    // Horizontal grid
    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Zero line for bipolar
    if (bipolar && min < 0) {
      const zeroY = h * (max / range);
      ctx.strokeStyle = '#5a5a8e';
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(0, zeroY); ctx.lineTo(w, zeroY); ctx.stroke();
    }

    // Note reference lines
    if (showNoteNames) {
      ctx.setLineDash([3, 6]);
      NOTE_REFS.forEach(ref => {
        if (ref.value < min || ref.value > max) return;
        const y = h - ((ref.value - min) / range) * h;
        ctx.strokeStyle = ref.color;
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        ctx.fillStyle = ref.color;
        ctx.font      = '8px monospace';
        ctx.fillText(ref.label, 3, y - 1);
      });
      ctx.setLineDash([]);
    }

    // Vertical grid (every 4 steps)
    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth   = 1;
    for (let i = 0; i < data.length; i += 4) {
      const x = (i / data.length) * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    // Loop region fill
    if (loop >= 0 && loop < data.length) {
      const loopX = (loop / data.length) * w;
      const endX  = end >= 0 ? (end / data.length) * w : w;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.10)';
      ctx.fillRect(loopX, 0, endX - loopX, h);
    }

    // Bars
    const barWidth = w / data.length;
    data.forEach((value, i) => {
      const x = i * barWidth;
      const normalised = (value - min) / range;
      const barH = normalised * h;
      const y    = h - barH;

      const isHovered = hoveredStep?.step === i;
      ctx.fillStyle   = isHovered ? 'rgba(255,255,255,0.85)' : color;
      ctx.strokeStyle = isHovered ? 'rgba(255,255,255,0.4)'  : 'rgba(255,255,255,0.12)';
      ctx.lineWidth   = 1;
      ctx.fillRect  (x + 1, y, barWidth - 2, barH);
      ctx.strokeRect(x + 1, y, barWidth - 2, barH);
    });

    // Loop marker (blue arrow down)
    if (loop >= 0 && loop < data.length) {
      const lx = (loop / data.length) * w;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, h); ctx.stroke();
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.moveTo(lx - 6, 10); ctx.lineTo(lx, 0); ctx.lineTo(lx + 6, 10);
      ctx.closePath(); ctx.fill();
    }

    // End/release marker (red square)
    if (end >= 0 && end < data.length) {
      const ex = (end / data.length) * w;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.moveTo(ex, 0); ctx.lineTo(ex, h); ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(ex - 5, 5, 10, 10);
    }

    // Playback cursor (yellow diamond)
    if (typeof playbackPosition === 'number' && playbackPosition >= 0 && playbackPosition < data.length) {
      const px = ((playbackPosition + 0.5) / data.length) * w;
      ctx.strokeStyle = 'rgba(255, 220, 0, 0.9)';
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
      ctx.fillStyle = 'rgba(255, 220, 0, 0.9)';
      ctx.beginPath();
      ctx.moveTo(px, 4); ctx.lineTo(px - 5, 14);
      ctx.lineTo(px, 24); ctx.lineTo(px + 5, 14);
      ctx.closePath(); ctx.fill();
    }
  }, [data, min, max, range, bipolar, showNoteNames, loop, end,
      playbackPosition, hoveredStep, color, canvasWidth, height]);

  useEffect(() => { draw(); }, [draw]);

  // ── Mouse helpers ─────────────────────────────────────────────────────────

  const getStepFromMouse = (e: React.MouseEvent): { step: number; value: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { step: 0, value: 0 };
    const rect  = canvas.getBoundingClientRect();
    const x     = e.clientX - rect.left;
    const y     = e.clientY - rect.top;
    const step  = Math.max(0, Math.min(data.length - 1, Math.floor((x / rect.width) * data.length)));
    const value = Math.max(min, Math.min(max, Math.round(min + (1 - y / rect.height) * range)));
    return { step, value };
  };

  const applyLine = useCallback((
    s0: number, v0: number, s1: number, v1: number,
  ) => {
    const newData = [...data];
    const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
    for (let s = lo; s <= hi; s++) {
      const t  = hi === lo ? 0 : (s - lo) / (hi - lo);
      const v  = s0 <= s1 ? v0 + (v1 - v0) * t : v1 + (v0 - v1) * (1 - t);
      newData[s] = Math.max(min, Math.min(max, Math.round(v)));
    }
    onChange(newData);
  }, [data, min, max, onChange]);

  // ── Event handlers ────────────────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isSettingLoop || isSettingEnd) {
      const { step } = getStepFromMouse(e);
      if (isSettingLoop) { onLoopChange?.(step); setIsSettingLoop(false); }
      else               { onEndChange?.(step);  setIsSettingEnd(false);  }
      return;
    }
    setIsDragging(true);
    const { step, value } = getStepFromMouse(e);
    dragStartRef.current  = { step, value };
    isLineModeRef.current = e.shiftKey;
    if (!e.shiftKey) {
      const d = [...data]; d[step] = value; onChange(d);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const { step, value } = getStepFromMouse(e);
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      setHoveredStep({ step, value: data[step] ?? value, x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    if (!isDragging) return;
    if (isLineModeRef.current && dragStartRef.current) {
      applyLine(dragStartRef.current.step, dragStartRef.current.value, step, value);
    } else {
      const d = [...data]; d[step] = value; onChange(d);
    }
  };

  const handleMouseUp    = () => { setIsDragging(false); dragStartRef.current = null; };
  const handleMouseLeave = () => { setIsDragging(false); setHoveredStep(null); };

  // ── Length controls ───────────────────────────────────────────────────────

  const addStep = () => {
    if (data.length >= maxLength) return;
    onChange([...data, data[data.length - 1] ?? 0]);
  };

  const removeStep = () => {
    if (data.length <= 1) return;
    onChange(data.slice(0, -1));
  };

  const resetAll = () => {
    onChange(Array(data.length).fill(bipolar ? 0 : min));
  };

  // ── Cell (text input) change ──────────────────────────────────────────────

  const setCellValue = (i: number, raw: string) => {
    const parsed = cellFormat === 'hex'
      ? parseInt(raw.replace(/^\$/, ''), 16)
      : parseInt(raw);
    if (isNaN(parsed)) return;
    const d = [...data];
    d[i] = Math.max(min, Math.min(max, parsed));
    onChange(d);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-dark-bgSecondary rounded-lg border border-dark-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-dark-bg border-b border-dark-border">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
            {label}
          </span>
          <span className="text-[10px] text-text-muted font-mono">{data.length} steps</span>
          <span className="text-[9px] text-blue-400/60 font-mono hidden sm:inline">shift+drag=line</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Step count */}
          {!fixedLength && (
            <>
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
            </>
          )}

          {/* Loop */}
          {onLoopChange && (
            <button
              onClick={() => { setIsSettingLoop(!isSettingLoop); setIsSettingEnd(false); }}
              className={`p-1 rounded transition-colors ${
                isSettingLoop ? 'bg-blue-500 text-white' : 'text-blue-400 hover:bg-blue-500/20'
              }`}
              title={isSettingLoop ? 'Click canvas to set loop' : 'Set loop point'}>
              <Repeat size={12} />
            </button>
          )}

          {/* End */}
          {onEndChange && (
            <button
              onClick={() => { setIsSettingEnd(!isSettingEnd); setIsSettingLoop(false); }}
              className={`p-1 rounded transition-colors ${
                isSettingEnd ? 'bg-red-500 text-white' : 'text-red-400 hover:bg-red-500/20'
              }`}
              title={isSettingEnd ? 'Click canvas to set end' : 'Set end point'}>
              <Flag size={12} />
            </button>
          )}

          {/* Presets */}
          {presets.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowPresets(!showPresets)}
                className={`p-1 rounded transition-colors ${
                  showPresets ? 'bg-amber-500/30 text-amber-300' : 'text-amber-400 hover:bg-amber-500/20'
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
                      onClick={() => {
                        onChange([...preset.data]);
                        if (preset.loop !== undefined) onLoopChange?.(preset.loop);
                        if (preset.end  !== undefined) onEndChange?.(preset.end);
                        setShowPresets(false);
                      }}
                      className="w-full px-3 py-1.5 text-left text-[10px] font-mono text-text-primary hover:bg-dark-bgSecondary flex items-center justify-between gap-4"
                    >
                      <span>{preset.name}</span>
                      <span className="text-text-muted text-[9px]">{preset.data.length}st</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reset */}
          <button onClick={resetAll}
            className="p-1 text-text-muted hover:text-text-primary hover:bg-dark-border/50 rounded"
            title="Reset">
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="relative overflow-x-auto" style={{ height: height + 20 }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block' }}
          className={isSettingLoop || isSettingEnd ? 'cursor-crosshair' : 'cursor-pointer'}
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
              left:       Math.min(hoveredStep.x + 10, canvasWidth - 120),
              top:        Math.max(4, hoveredStep.y - 30),
              whiteSpace: 'nowrap',
            }}
          >
            <span className="text-text-muted mr-1">#{hoveredStep.step}:</span>
            {formatValue(hoveredStep.value, cellFormat, valueLabels, showNoteNames)}
          </div>
        )}

        {/* Status bar */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center gap-4 px-2 py-0.5 bg-dark-bg/80 text-[9px] font-mono">
          {loop >= 0 ? (
            <button
              onClick={() => onLoopChange?.(-1)}
              className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
              <Repeat size={9} /> Loop@{loop} <span className="text-text-muted ml-0.5">×</span>
            </button>
          ) : <span className="text-text-muted">No loop</span>}

          {end >= 0 ? (
            <button
              onClick={() => onEndChange?.(-1)}
              className="flex items-center gap-1 text-red-400 hover:text-red-300">
              <Flag size={9} /> End@{end} <span className="text-text-muted ml-0.5">×</span>
            </button>
          ) : <span className="text-text-muted">No end</span>}

          {typeof playbackPosition === 'number' && (
            <span className="text-yellow-400 ml-auto">▶ {playbackPosition}</span>
          )}
        </div>
      </div>

      {/* Optional text cell grid */}
      {showCells && (
        <div className="overflow-x-auto border-t border-dark-border bg-dark-bg">
          <div className="flex gap-0.5 p-2">
            {data.map((v, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5 flex-shrink-0">
                <span className="text-[8px] font-mono text-text-muted">{i.toString().padStart(2, '0')}</span>
                <input
                  type="text"
                  value={cellFormat === 'hex'
                    ? (v & 0xff).toString(16).toUpperCase().padStart(2, '0')
                    : String(v)}
                  onChange={(e) => setCellValue(i, e.target.value)}
                  className="text-[10px] font-mono text-center border rounded py-0.5"
                  style={{
                    width: '36px',
                    background:   '#060a0f',
                    borderColor:  v !== 0 ? '#1a2a3a' : '#111',
                    color:        v !== 0 ? '#7dd3fc' : '#444',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SequenceEditor;
