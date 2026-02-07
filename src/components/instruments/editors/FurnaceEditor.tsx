/**
 * FurnaceEditor - Comprehensive Furnace chip instrument editor
 *
 * Based on deep research of Furnace tracker's insEdit.cpp (9041 lines)
 * Implements chip-specific parameter ranges, FM envelope visualization,
 * algorithm diagrams, and accurate operator controls.
 *
 * Research reference: /Users/spot/Code/DEViLBOX/Reference Code/furnace-master/src/gui/insEdit.cpp
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { FurnaceConfig, FurnaceOperatorConfig, FurnaceMacro } from '@typedefs/instrument';
import { Knob } from '@components/controls/Knob';
import { Cpu, Activity, Zap, Waves, Volume2, Music, Settings, Plus, Library, ChevronDown, ChevronRight } from 'lucide-react';
import { InstrumentOscilloscope } from '@components/visualization';
import {
  getFurnaceWavetablesByCategory,
  type FurnaceWavetablePreset
} from '@constants/furnaceWavetablePresets';
import { MacroListEditor } from './MacroEditor';
import { WavetableListEditor, type WavetableData } from './WavetableEditor';

// ============================================================================
// CHIP-SPECIFIC PARAMETER RANGES (from Furnace insEdit.cpp)
// ============================================================================

interface ChipParameterRanges {
  tl: { min: number; max: number };
  ar: { min: number; max: number };
  dr: { min: number; max: number };
  d2r: { min: number; max: number };
  rr: { min: number; max: number };
  sl: { min: number; max: number };
  mult: { min: number; max: number };
  dt: { min: number; max: number };
  dt2?: { min: number; max: number };
  rs: { min: number; max: number };
  ksl?: { min: number; max: number };
  ws?: { min: number; max: number };
  hasD2R: boolean;
  hasSSG: boolean;
  hasWS: boolean;
  hasDT2: boolean;
  opCount: number;
}

function getChipParameterRanges(chipType: number): ChipParameterRanges {
  // OPN/OPN2/OPNA/OPNB (YM2612, YM2608, YM2610)
  if ([0, 13, 14].includes(chipType)) {
    return {
      tl: { min: 0, max: 127 },
      ar: { min: 0, max: 31 },
      dr: { min: 0, max: 31 },
      d2r: { min: 0, max: 31 },
      rr: { min: 0, max: 15 },
      sl: { min: 0, max: 15 },
      mult: { min: 0, max: 15 },
      dt: { min: -3, max: 3 },
      rs: { min: 0, max: 3 },
      hasD2R: true,
      hasSSG: true,
      hasWS: false,
      hasDT2: false,
      opCount: 4,
    };
  }

  // OPM (YM2151)
  if (chipType === 1) {
    return {
      tl: { min: 0, max: 127 },
      ar: { min: 0, max: 31 },
      dr: { min: 0, max: 31 },
      d2r: { min: 0, max: 31 },
      rr: { min: 0, max: 15 },
      sl: { min: 0, max: 15 },
      mult: { min: 0, max: 15 },
      dt: { min: -3, max: 3 },
      dt2: { min: 0, max: 3 },
      rs: { min: 0, max: 3 },
      hasD2R: true,
      hasSSG: false,
      hasWS: false,
      hasDT2: true,
      opCount: 4,
    };
  }

  // OPL/OPL2/OPL3 (YMF262, YM3812)
  if ([2, 23, 26].includes(chipType)) {
    return {
      tl: { min: 0, max: 63 },
      ar: { min: 0, max: 15 },
      dr: { min: 0, max: 15 },
      d2r: { min: 0, max: 0 }, // OPL has no D2R
      rr: { min: 0, max: 15 },
      sl: { min: 0, max: 15 },
      mult: { min: 0, max: 15 },
      dt: { min: 0, max: 0 }, // OPL has no detune
      rs: { min: 0, max: 0 }, // OPL uses KSL instead
      ksl: { min: 0, max: 3 },
      ws: { min: 0, max: 7 },
      hasD2R: false,
      hasSSG: false,
      hasWS: true,
      hasDT2: false,
      opCount: 4,
    };
  }

  // OPLL (YM2413)
  if (chipType === 11) {
    return {
      tl: { min: 0, max: 63 }, // Modulator: 63, Carrier: 15
      ar: { min: 0, max: 15 },
      dr: { min: 0, max: 15 },
      d2r: { min: 0, max: 0 },
      rr: { min: 0, max: 15 },
      sl: { min: 0, max: 15 },
      mult: { min: 0, max: 15 },
      dt: { min: 0, max: 0 },
      rs: { min: 0, max: 0 },
      ksl: { min: 0, max: 3 },
      hasD2R: false,
      hasSSG: false,
      hasWS: false,
      hasDT2: false,
      opCount: 2,
    };
  }

  // OPZ (YM2414)
  if (chipType === 22) {
    return {
      tl: { min: 0, max: 127 },
      ar: { min: 0, max: 31 },
      dr: { min: 0, max: 31 },
      d2r: { min: 0, max: 31 },
      rr: { min: 0, max: 15 },
      sl: { min: 0, max: 15 },
      mult: { min: 0, max: 15 },
      dt: { min: -3, max: 3 },
      dt2: { min: 0, max: 3 },
      rs: { min: 0, max: 3 },
      hasD2R: true,
      hasSSG: false,
      hasWS: false,
      hasDT2: true,
      opCount: 4,
    };
  }

  // Default (OPN-style)
  return {
    tl: { min: 0, max: 127 },
    ar: { min: 0, max: 31 },
    dr: { min: 0, max: 31 },
    d2r: { min: 0, max: 31 },
    rr: { min: 0, max: 15 },
    sl: { min: 0, max: 15 },
    mult: { min: 0, max: 15 },
    dt: { min: -3, max: 3 },
    rs: { min: 0, max: 3 },
    hasD2R: true,
    hasSSG: true,
    hasWS: false,
    hasDT2: false,
    opCount: 4,
  };
}

// ============================================================================
// FM ENVELOPE VISUALIZATION (from Furnace drawFMEnv)
// ============================================================================

interface FMEnvelopeProps {
  tl: number;
  ar: number;
  dr: number;
  d2r: number;
  rr: number;
  sl: number;
  maxTl: number;
  maxArDr: number;
  hasD2R: boolean;
  width?: number;
  height?: number;
  color?: string;
}

const FMEnvelopeVisualization: React.FC<FMEnvelopeProps> = ({
  tl, ar, dr, d2r, rr, sl, maxTl, maxArDr, hasD2R,
  width = 120, height = 48, color = '#f59e0b'
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const w = width;
    const h = height;
    const padding = 2;

    // Clear
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (h / 4) * i);
      ctx.lineTo(w, (h / 4) * i);
      ctx.stroke();
    }

    // Calculate envelope points
    // TL determines starting level (inverted: 0 = max volume, 127 = silent)
    const startLevel = 1 - (tl / maxTl);

    // AR: Attack time (inverted: 31 = instant, 0 = slow)
    const attackTime = maxArDr > 0 ? (1 - ar / maxArDr) * 0.3 : 0;

    // DR: Decay time to sustain level
    const decayTime = maxArDr > 0 ? (1 - dr / maxArDr) * 0.25 : 0;

    // SL: Sustain level (inverted: 0 = full, 15 = silent)
    const sustainLevel = startLevel * (1 - sl / 15);

    // D2R: Second decay rate (sustain slope)
    const d2rTime = hasD2R && d2r > 0 ? (1 - d2r / 31) * 0.25 : 0.15;
    const d2rEndLevel = hasD2R && d2r > 0 ? sustainLevel * 0.5 : sustainLevel;

    // RR: Release time
    const releaseTime = (1 - rr / 15) * 0.2;

    // Draw envelope path
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    const effectiveW = w - padding * 2;
    const effectiveH = h - padding * 2;

    let x = padding;
    let y = h - padding;

    // Start at 0
    ctx.moveTo(x, y);

    // Attack phase
    x += attackTime * effectiveW;
    y = padding + effectiveH * (1 - startLevel);
    ctx.lineTo(x, y);

    // Decay phase (to sustain level)
    x += decayTime * effectiveW;
    y = padding + effectiveH * (1 - sustainLevel);
    ctx.lineTo(x, y);

    // Sustain/D2R phase
    if (hasD2R && d2r > 0) {
      x += d2rTime * effectiveW;
      y = padding + effectiveH * (1 - d2rEndLevel);
      ctx.lineTo(x, y);
    } else {
      x += 0.15 * effectiveW;
      ctx.lineTo(x, y);
    }

    // Release phase
    const releaseStartY = y;
    void releaseStartY; // Position tracked for future hover info
    x += releaseTime * effectiveW;
    y = h - padding;
    ctx.lineTo(x, y);

    // Continue to end
    ctx.lineTo(w - padding, y);

    ctx.stroke();

    // Fill under curve
    ctx.lineTo(w - padding, h - padding);
    ctx.lineTo(padding, h - padding);
    ctx.closePath();
    ctx.fillStyle = `${color}15`;
    ctx.fill();

  }, [tl, ar, dr, d2r, rr, sl, maxTl, maxArDr, hasD2R, color, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded border border-dark-border w-full"
      style={{ maxWidth: '100%' }}
    />
  );
};

// ============================================================================
// FM ALGORITHM DIAGRAM (from Furnace drawAlgorithm)
// ============================================================================

interface AlgorithmDiagramProps {
  algorithm: number;
  feedback: number;
  opCount?: number;
}

const AlgorithmDiagram: React.FC<AlgorithmDiagramProps> = ({ algorithm, feedback, opCount: _opCount = 4 }) => {
  // Algorithm connections for 4-op FM (OPN/OPM style)
  // Based on Furnace's algorithm visualizations
  const algorithms = [
    // Alg 0: 4→3→2→1→out (serial)
    { ops: [[4,3], [3,2], [2,1]], carriers: [1] },
    // Alg 1: (4+3)→2→1→out
    { ops: [[4,2], [3,2], [2,1]], carriers: [1] },
    // Alg 2: 4→3→1, 2→1→out
    { ops: [[4,3], [3,1], [2,1]], carriers: [1] },
    // Alg 3: 4→3, (3+2)→1→out
    { ops: [[4,3], [3,1], [2,1]], carriers: [1] },
    // Alg 4: (4→3)+(2→1)→out
    { ops: [[4,3], [2,1]], carriers: [3, 1] },
    // Alg 5: 4→(3+2+1)→out
    { ops: [[4,3], [4,2], [4,1]], carriers: [3, 2, 1] },
    // Alg 6: (4→3)+2+1→out
    { ops: [[4,3]], carriers: [3, 2, 1] },
    // Alg 7: 4+3+2+1→out (parallel)
    { ops: [], carriers: [4, 3, 2, 1] },
  ];

  const alg = algorithms[algorithm] || algorithms[0];

  return (
    <div className="bg-dark-bg rounded border border-dark-border p-2">
      <svg viewBox="0 0 120 50" className="w-full h-12">
        {/* Operator boxes */}
        {[4, 3, 2, 1].map((op, i) => {
          const x = 10 + i * 28;
          const y = 15;
          const isCarrier = alg.carriers.includes(op);
          return (
            <g key={op}>
              <rect
                x={x}
                y={y}
                width={20}
                height={20}
                rx={2}
                fill={isCarrier ? '#f59e0b' : '#3b82f6'}
                stroke={isCarrier ? '#fbbf24' : '#60a5fa'}
                strokeWidth={1}
              />
              <text
                x={x + 10}
                y={y + 14}
                textAnchor="middle"
                fontSize="10"
                fill="white"
                fontWeight="bold"
              >
                {op}
              </text>
            </g>
          );
        })}

        {/* Feedback arrow on OP4 */}
        {feedback > 0 && (
          <path
            d="M 20 15 Q 20 5 30 5 Q 40 5 40 15"
            fill="none"
            stroke="#f472b6"
            strokeWidth={1}
            strokeDasharray="2,1"
          />
        )}

        {/* Output arrow */}
        <path
          d="M 110 25 L 118 25"
          fill="none"
          stroke="#22c55e"
          strokeWidth={2}
        />
        <polygon
          points="118,25 114,22 114,28"
          fill="#22c55e"
        />

        {/* Connection lines */}
        {alg.ops.map(([from, to], i) => {
          const fromX = 10 + (4 - from) * 28 + 20;
          const toX = 10 + (4 - to) * 28;
          return (
            <line
              key={i}
              x1={fromX}
              y1={25}
              x2={toX}
              y2={25}
              stroke="#64748b"
              strokeWidth={1}
            />
          );
        })}
      </svg>
      <div className="text-[9px] text-center text-text-muted font-mono">
        ALG {algorithm} • FB {feedback}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN FURNACE EDITOR COMPONENT
// ============================================================================

interface FurnaceEditorProps {
  config: FurnaceConfig;
  instrumentId: number;
  onChange: (updates: Partial<FurnaceConfig>) => void;
}

export const FurnaceEditor: React.FC<FurnaceEditorProps> = ({ config, instrumentId, onChange }) => {
  const [activeTab, setActiveTab] = useState<'fm' | 'macros' | 'chip'>('fm');
  const [expandedOps, setExpandedOps] = useState<Set<number>>(new Set([0, 1, 2, 3]));

  const updateOperator = useCallback((idx: number, updates: Partial<FurnaceOperatorConfig>) => {
    const newOps = [...config.operators];
    newOps[idx] = { ...newOps[idx], ...updates };
    onChange({ operators: newOps });
  }, [config.operators, onChange]);

  const toggleOpExpanded = useCallback((idx: number) => {
    setExpandedOps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const chipName = getChipName(config.chipType);
  const category = getChipCategory(config.chipType);
  const paramRanges = useMemo(() => getChipParameterRanges(config.chipType), [config.chipType]);

  // Determine operator order (Furnace uses different order for visualization)
  const opOrder = useMemo(() => {
    if (paramRanges.opCount === 2) return [0, 1];
    return [0, 2, 1, 3]; // Furnace standard order for 4-op
  }, [paramRanges.opCount]);

  return (
    <div className="space-y-4">
      {/* Chip Header */}
      <div className="flex items-center justify-between bg-dark-bgSecondary p-3 rounded-lg border border-dark-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-violet-700 rounded flex items-center justify-center shadow-lg shadow-indigo-900/20">
            <Cpu size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-white text-sm tracking-tight">{chipName}</h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-muted font-mono uppercase bg-dark-bg px-1.5 py-0.5 rounded border border-dark-border">
                {category} • {paramRanges.opCount}OP
              </span>
              <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                <Zap size={8} /> Ready
              </span>
            </div>
          </div>
        </div>

        {/* Live Oscilloscope */}
        <div className="flex-1 mx-4">
          <InstrumentOscilloscope
            instrumentId={instrumentId}
            width="auto"
            height={40}
            color="#a78bfa"
            backgroundColor="transparent"
            className="w-full rounded border border-violet-500/20"
          />
        </div>

        {/* Global Controls */}
        <div className="flex gap-3">
          <Knob
            label="FMS"
            value={config.fms ?? 0}
            min={0}
            max={7}
            onChange={(v) => onChange({ fms: Math.round(v) })}
            size="sm"
            color="#8b5cf6"
            formatValue={(v) => String(Math.round(v))}
          />
          <Knob
            label="AMS"
            value={config.ams ?? 0}
            min={0}
            max={3}
            onChange={(v) => onChange({ ams: Math.round(v) })}
            size="sm"
            color="#a78bfa"
            formatValue={(v) => String(Math.round(v))}
          />
        </div>
      </div>

      {/* Tab Navigation */}
      {category === "FM" && (
        <div className="flex gap-1 bg-dark-bg p-1 rounded-lg border border-dark-border">
          {(['fm', 'macros', 'chip'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 px-3 rounded text-xs font-mono uppercase transition-colors ${
                activeTab === tab
                  ? 'bg-amber-600 text-white'
                  : 'text-text-muted hover:text-white hover:bg-dark-bgSecondary'
              }`}
            >
              {tab === 'fm' ? 'Operators' : tab === 'macros' ? 'Macros' : 'Settings'}
            </button>
          ))}
        </div>
      )}

      {/* FM OPERATOR PANEL */}
      {category === "FM" && activeTab === 'fm' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Algorithm & Feedback Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Algorithm Diagram */}
            <div className="md:col-span-2">
              <AlgorithmDiagram
                algorithm={config.algorithm}
                feedback={config.feedback}
                opCount={paramRanges.opCount}
              />
            </div>

            {/* Algorithm Controls */}
            <div className="bg-dark-bgSecondary p-3 rounded-lg border border-dark-border">
              <div className="flex flex-wrap gap-6">
                <Knob
                  label="ALG"
                  value={config.algorithm}
                  min={0}
                  max={7}
                  onChange={(v) => onChange({ algorithm: Math.round(v) })}
                  size="md"
                  color="#f59e0b"
                  formatValue={(v) => String(Math.round(v))}
                />
                <Knob
                  label="FB"
                  value={config.feedback}
                  min={0}
                  max={7}
                  onChange={(v) => onChange({ feedback: Math.round(v) })}
                  size="md"
                  color="#d97706"
                  formatValue={(v) => String(Math.round(v))}
                />
              </div>
            </div>
          </div>

          {/* Operators Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {opOrder.slice(0, paramRanges.opCount).map((opIdx) => (
              <OperatorCard
                key={opIdx}
                index={opIdx}
                op={config.operators[opIdx]}
                onUpdate={(u) => updateOperator(opIdx, u)}
                ranges={paramRanges}
                isExpanded={expandedOps.has(opIdx)}
                onToggleExpand={() => toggleOpExpanded(opIdx)}
                isCarrier={isOperatorCarrier(config.algorithm, opIdx)}
              />
            ))}
          </div>
        </div>
      )}

      {/* MACROS TAB */}
      {category === "FM" && activeTab === 'macros' && (
        <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in duration-200">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-violet-400" />
            <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Macro Editor</h3>
            <span className="text-[9px] text-text-muted">Draw to edit • Loop (blue) • Release (red)</span>
          </div>

          <MacroListEditor
            macros={config.macros}
            onChange={(macros) => onChange({ macros: macros as FurnaceMacro[] })}
            chipType={config.chipType}
          />
        </div>
      )}

      {/* CHIP SETTINGS TAB */}
      {category === "FM" && activeTab === 'chip' && (
        <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in duration-200">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={16} className="text-cyan-400" />
            <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Chip Settings</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {config.opllPreset !== undefined && (
              <div>
                <label className="text-[10px] text-text-muted font-mono block mb-1">OPLL Preset</label>
                <select
                  value={config.opllPreset}
                  onChange={(e) => onChange({ opllPreset: parseInt(e.target.value) })}
                  className="w-full bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-white"
                >
                  {OPLL_PRESETS.map((name, i) => (
                    <option key={i} value={i}>{i}: {name}</option>
                  ))}
                </select>
              </div>
            )}

            {paramRanges.hasDT2 && (
              <div className="flex justify-center">
                <Knob
                  label="FMS2"
                  value={config.fms2 ?? 0}
                  min={0}
                  max={7}
                  onChange={(v) => onChange({ fms2: Math.round(v) })}
                  size="sm"
                  color="#06b6d4"
                  formatValue={(v) => String(Math.round(v))}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* CHIP-SPECIFIC PANELS */}
      {/* Game Boy Panel (chipType 5) */}
      {config.chipType === 5 && (
        <GBPanel config={config} onChange={onChange} />
      )}

      {/* C64/SID Panel (chipType 10) */}
      {config.chipType === 10 && (
        <C64Panel config={config} onChange={onChange} />
      )}

      {/* SNES Panel (chipType 24) */}
      {config.chipType === 24 && (
        <SNESPanel config={config} onChange={onChange} />
      )}

      {/* PSG / PULSE PANEL (for other PSG chips) */}
      {category === "PSG" && ![5, 10, 24].includes(config.chipType) && (
        <PSGPanel config={config} onChange={onChange} />
      )}

      {/* WAVETABLE PANEL */}
      {(category === "Wavetable" || config.wavetables.length > 0) && (
        <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-4">
            <Waves size={16} className="text-cyan-400" />
            <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
              Wavetable Editor ({config.wavetables.length} waves)
            </h3>
            <span className="text-[9px] text-text-muted">Draw to edit waveforms</span>
          </div>

          <WavetableListEditor
            wavetables={config.wavetables as WavetableData[]}
            onChange={(wavetables) => onChange({ wavetables })}
          />
        </div>
      )}

      {/* MACROS PANEL (for non-FM categories) */}
      {category !== "FM" && (
        <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-violet-400" />
            <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
              Macros ({config.macros.length})
            </h3>
            <span className="text-[9px] text-text-muted">Draw to edit • Loop (blue) • Release (red)</span>
          </div>

          <MacroListEditor
            macros={config.macros}
            onChange={(macros) => onChange({ macros: macros as FurnaceMacro[] })}
            chipType={config.chipType}
          />
        </div>
      )}

      {/* PCM / SAMPLE PANEL */}
      {category === "PCM" && (
        <PCMPanel config={config} onChange={onChange} />
      )}
    </div>
  );
};

// ============================================================================
// OPERATOR CARD COMPONENT
// ============================================================================

interface OperatorCardProps {
  index: number;
  op: FurnaceOperatorConfig;
  onUpdate: (u: Partial<FurnaceOperatorConfig>) => void;
  ranges: ChipParameterRanges;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isCarrier: boolean;
}

const OperatorCard: React.FC<OperatorCardProps> = ({
  index, op, onUpdate, ranges, isExpanded, onToggleExpand, isCarrier
}) => {
  const borderColor = isCarrier ? 'border-amber-500/30' : 'border-blue-500/30';
  const accentColor = isCarrier ? '#f59e0b' : '#3b82f6';
  const bgGradient = isCarrier
    ? 'from-amber-950/20 to-transparent'
    : 'from-blue-950/20 to-transparent';

  return (
    <div className={`bg-gradient-to-br ${bgGradient} bg-dark-bgSecondary p-3 rounded-lg border ${borderColor} transition-colors`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleExpand}
            className="text-text-muted hover:text-white transition-colors"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <div
            className="w-6 h-6 rounded flex items-center justify-center font-mono text-xs font-bold border"
            style={{
              backgroundColor: `${accentColor}20`,
              borderColor: `${accentColor}50`,
              color: accentColor,
            }}
          >
            {index + 1}
          </div>
          <div>
            <span className="font-mono text-[10px] font-bold text-text-primary uppercase">
              OP{index + 1}
            </span>
            <span className="text-[9px] text-text-muted ml-2">
              {isCarrier ? 'Carrier' : 'Modulator'}
            </span>
          </div>
        </div>

        {/* Enable toggle */}
        <button
          onClick={() => onUpdate({ enabled: !op.enabled })}
          className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
            op.enabled
              ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400'
              : 'bg-dark-bg border-dark-border text-text-muted'
          }`}
        >
          {op.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Envelope Visualization - Full width */}
      <div className="mb-3 w-full">
        <FMEnvelopeVisualization
          tl={op.tl}
          ar={op.ar}
          dr={op.dr}
          d2r={op.d2r ?? 0}
          rr={op.rr}
          sl={op.sl}
          maxTl={ranges.tl.max}
          maxArDr={ranges.ar.max}
          hasD2R={ranges.hasD2R}
          color={accentColor}
          width={280}
          height={48}
        />
      </div>

      {/* Row 1: TL, MULT, DT */}
      <div className="flex justify-between items-center gap-1 mb-2">
        <Knob label="TL" value={op.tl} min={ranges.tl.min} max={ranges.tl.max}
          onChange={(v) => onUpdate({ tl: Math.round(v) })} size="sm" color="#ef4444"
          formatValue={(v) => String(Math.round(v))} />
        <Knob label="MULT" value={op.mult} min={ranges.mult.min} max={ranges.mult.max}
          onChange={(v) => onUpdate({ mult: Math.round(v) })} size="sm" color="#22d3ee"
          formatValue={(v) => String(Math.round(v))} />
        <Knob label="DT" value={op.dt} min={ranges.dt.min} max={ranges.dt.max}
          onChange={(v) => onUpdate({ dt: Math.round(v) })} size="sm" color="#a78bfa"
          formatValue={(v) => { const val = Math.round(v); return val > 0 ? `+${val}` : String(val); }} />
      </div>

      {/* Row 2: AR, DR, SL, RR (envelope row) */}
      <div className="flex justify-between items-center gap-1 mb-2">
        <Knob label="AR" value={op.ar} min={ranges.ar.min} max={ranges.ar.max}
          onChange={(v) => onUpdate({ ar: Math.round(v) })} size="sm" color="#10b981"
          formatValue={(v) => String(Math.round(v))} />
        <Knob label="DR" value={op.dr} min={ranges.dr.min} max={ranges.dr.max}
          onChange={(v) => onUpdate({ dr: Math.round(v) })} size="sm" color="#f59e0b"
          formatValue={(v) => String(Math.round(v))} />
        <Knob label="SL" value={op.sl} min={ranges.sl.min} max={ranges.sl.max}
          onChange={(v) => onUpdate({ sl: Math.round(v) })} size="sm" color="#8b5cf6"
          formatValue={(v) => String(Math.round(v))} />
        <Knob label="RR" value={op.rr} min={ranges.rr.min} max={ranges.rr.max}
          onChange={(v) => onUpdate({ rr: Math.round(v) })} size="sm" color="#ec4899"
          formatValue={(v) => String(Math.round(v))} />
      </div>

      {/* Row 3: D2R, RS + flags (expanded or show if has params) */}
      {isExpanded && (
        <div className="pt-2 border-t border-dark-border mt-1 animate-in slide-in-from-top-2 duration-200">
          {/* Row 3: D2R, RS, DT2, KSL, WS - all in one horizontal row */}
          <div className="flex justify-center items-center gap-3 mb-2">
            {ranges.hasD2R && (
              <Knob label="D2R" value={op.d2r ?? 0} min={ranges.d2r.min} max={ranges.d2r.max}
                onChange={(v) => onUpdate({ d2r: Math.round(v) })} size="sm" color="#fb923c"
                formatValue={(v) => String(Math.round(v))} />
            )}
            {ranges.rs.max > 0 && (
              <Knob label="RS" value={op.rs} min={ranges.rs.min} max={ranges.rs.max}
                onChange={(v) => onUpdate({ rs: Math.round(v) })} size="sm" color="#06b6d4"
                formatValue={(v) => String(Math.round(v))} />
            )}
            {ranges.hasDT2 && (
              <Knob label="DT2" value={op.dt2 ?? 0} min={0} max={3}
                onChange={(v) => onUpdate({ dt2: Math.round(v) })} size="sm" color="#c084fc"
                formatValue={(v) => String(Math.round(v))} />
            )}
            {ranges.ksl && (
              <Knob label="KSL" value={op.ksl} min={ranges.ksl.min} max={ranges.ksl.max}
                onChange={(v) => onUpdate({ ksl: Math.round(v) })} size="sm" color="#fbbf24"
                formatValue={(v) => String(Math.round(v))} />
            )}
            {ranges.hasWS && (
              <Knob label="WS" value={op.ws} min={0} max={7}
                onChange={(v) => onUpdate({ ws: Math.round(v) })} size="sm" color="#34d399"
                formatValue={(v) => String(Math.round(v))} />
            )}
          </div>

          {/* Boolean Flags - horizontal row */}
          <div className="flex justify-center gap-2">
            <ToggleButton label="AM" value={op.am} onChange={(v) => onUpdate({ am: v })} />
            {ranges.hasSSG && (
              <ToggleButton label="SSG" value={(op.ssg ?? 0) > 0} onChange={(v) => onUpdate({ ssg: v ? 8 : 0 })} />
            )}
            {ranges.hasWS && (
              <>
                <ToggleButton label="VIB" value={op.vib} onChange={(v) => onUpdate({ vib: v })} />
                <ToggleButton label="SUS" value={op.sus} onChange={(v) => onUpdate({ sus: v })} />
                <ToggleButton label="KSR" value={op.ksr} onChange={(v) => onUpdate({ ksr: v })} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const ToggleButton: React.FC<{
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
      value
        ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400'
        : 'bg-dark-bg border-dark-border text-text-muted hover:text-white'
    }`}
  >
    {label}
  </button>
);

// @ts-expect-error Reserved for future use
const _MacroMiniView: React.FC<{
  values: number[];
  loop?: number;
  release?: number;
}> = ({ values, loop = -1, release = -1 }) => {
  if (values.length === 0) return null;

  const max = Math.max(...values.map(Math.abs), 1);
  const points = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * 100;
    const y = 50 - (v / max) * 40;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      {/* Loop marker */}
      {loop >= 0 && loop < values.length && (
        <line
          x1={(loop / values.length) * 100}
          y1="0"
          x2={(loop / values.length) * 100}
          y2="100"
          stroke="#3b82f6"
          strokeWidth="2"
        />
      )}
      {/* Release marker */}
      {release >= 0 && release < values.length && (
        <line
          x1={(release / values.length) * 100}
          y1="0"
          x2={(release / values.length) * 100}
          y2="100"
          stroke="#ef4444"
          strokeWidth="2"
        />
      )}
      {/* Value line */}
      <polyline
        points={points}
        fill="none"
        stroke="#a78bfa"
        strokeWidth="2"
      />
    </svg>
  );
};

// ============================================================================
// SUB-PANELS (PSG, Wavetable, PCM, GB, C64, SNES)
// ============================================================================

// Game Boy Panel - matches Furnace insEdit.cpp GB editor (lines 6991-7243)
const GB_DEFAULTS = { envVol: 15, envDir: 0, envLen: 2, soundLen: 0, softEnv: false, alwaysInit: true };

const GBPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const gb = useMemo(() => ({ ...GB_DEFAULTS, ...config.gb }), [config.gb]);

  const updateGB = useCallback((updates: Partial<typeof gb>) => {
    onChange({ gb: { ...config.gb, ...GB_DEFAULTS, ...updates } });
  }, [config.gb, onChange]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
      {/* Envelope Settings */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-emerald-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-emerald-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">GB Envelope</h3>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between gap-4">
            <Knob
              label="VOL"
              value={gb.envVol}
              min={0} max={15}
              onChange={(v) => updateGB({ envVol: Math.round(v) })}
              size="md" color="#34d399"
              formatValue={(v) => String(Math.round(v))}
            />
            <Knob
              label="LEN"
              value={gb.envLen}
              min={0} max={7}
              onChange={(v) => updateGB({ envLen: Math.round(v) })}
              size="md" color="#10b981"
              formatValue={(v) => String(Math.round(v))}
            />
            <Knob
              label="SND"
              value={gb.soundLen}
              min={0} max={64}
              onChange={(v) => updateGB({ soundLen: Math.round(v) })}
              size="md" color="#059669"
              formatValue={(v) => v === 0 || v > 63 ? '∞' : String(Math.round(v))}
            />
          </div>

          {/* Direction */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted font-mono">Direction:</span>
            <button
              onClick={() => updateGB({ envDir: 1 })}
              className={`px-3 py-1 text-[10px] font-mono rounded border transition-colors ${
                gb.envDir === 1
                  ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400'
                  : 'bg-dark-bg border-dark-border text-text-muted hover:text-white'
              }`}
            >
              ↑ UP
            </button>
            <button
              onClick={() => updateGB({ envDir: 0 })}
              className={`px-3 py-1 text-[10px] font-mono rounded border transition-colors ${
                gb.envDir === 0
                  ? 'bg-rose-600/20 border-rose-500/50 text-rose-400'
                  : 'bg-dark-bg border-dark-border text-text-muted hover:text-white'
              }`}
            >
              ↓ DOWN
            </button>
          </div>

          {/* Options */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-dark-border">
            <button
              onClick={() => updateGB({ softEnv: !gb.softEnv })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                gb.softEnv
                  ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              Soft Envelope
            </button>
            <button
              onClick={() => updateGB({ alwaysInit: !gb.alwaysInit })}
              className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                gb.alwaysInit
                  ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              Always Init
            </button>
          </div>
        </div>
      </div>

      {/* Envelope Visualization */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
        <div className="flex items-center gap-2 mb-4">
          <Waves size={16} className="text-emerald-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Envelope Shape</h3>
        </div>
        <GBEnvelopeVisualization
          envVol={gb.envVol}
          envLen={gb.envLen}
          soundLen={gb.soundLen}
          envDir={gb.envDir}
        />
      </div>
    </div>
  );
};

// GB Envelope Visualization (matches Furnace drawGBEnv)
const GBEnvelopeVisualization: React.FC<{
  envVol: number;
  envLen: number;
  soundLen: number;
  envDir: number;
}> = ({ envVol, envLen, soundLen, envDir }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = 200;
  const height = 80;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.setLineDash([2, 2]);
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw envelope
    ctx.beginPath();
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2;

    const startVol = envDir === 1 ? 0 : envVol;
    const endVol = envDir === 1 ? envVol : 0;
    const decaySteps = envLen === 0 ? 1 : 16 - envVol;
    const totalLength = soundLen === 0 || soundLen > 63 ? width : (soundLen / 64) * width;

    const startY = height - (startVol / 15) * (height - 8) - 4;
    const endY = height - (endVol / 15) * (height - 8) - 4;

    ctx.moveTo(0, startY);

    if (envLen === 0) {
      // No decay - stay at initial level
      ctx.lineTo(totalLength, startY);
    } else {
      // Calculate decay time
      const decayX = Math.min((decaySteps * envLen * 4), totalLength);
      ctx.lineTo(decayX, endY);
      // Hold at final level
      if (decayX < totalLength) {
        ctx.lineTo(totalLength, endY);
      }
    }

    ctx.stroke();

    // Labels
    ctx.font = '9px monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`V:${envVol}`, 4, 12);
    ctx.fillText(`L:${envLen}`, 4, 24);
    ctx.fillText(envDir === 1 ? '↑' : '↓', width - 12, 12);
  }, [envVol, envLen, soundLen, envDir]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full rounded border border-dark-border"
      style={{ height }}
    />
  );
};

// C64/SID Panel - matches Furnace insEdit.cpp C64 editor (lines 7244-7400)
const C64_DEFAULTS = {
  triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
  a: 0, d: 8, s: 8, r: 4, duty: 2048, ringMod: false, oscSync: false,
  toFilter: false, filterCutoff: 1024, filterResonance: 0, filterLP: false, filterBP: false, filterHP: false
};

const C64Panel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const c64 = useMemo(() => ({ ...C64_DEFAULTS, ...config.c64 }), [config.c64]);

  const updateC64 = useCallback((updates: Partial<typeof c64>) => {
    onChange({ c64: { ...config.c64, ...C64_DEFAULTS, ...updates } });
  }, [config.c64, onChange]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
      {/* Waveform Selection */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-violet-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Waves size={16} className="text-violet-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Waveform</h3>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => updateC64({ triOn: !c64.triOn })}
            className={`px-4 py-2 text-[10px] font-mono rounded border transition-colors ${
              c64.triOn
                ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400'
                : 'bg-dark-bg border-dark-border text-text-muted hover:text-white'
            }`}
          >
            TRI
          </button>
          <button
            onClick={() => updateC64({ sawOn: !c64.sawOn })}
            className={`px-4 py-2 text-[10px] font-mono rounded border transition-colors ${
              c64.sawOn
                ? 'bg-amber-600/20 border-amber-500/50 text-amber-400'
                : 'bg-dark-bg border-dark-border text-text-muted hover:text-white'
            }`}
          >
            SAW
          </button>
          <button
            onClick={() => updateC64({ pulseOn: !c64.pulseOn })}
            className={`px-4 py-2 text-[10px] font-mono rounded border transition-colors ${
              c64.pulseOn
                ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400'
                : 'bg-dark-bg border-dark-border text-text-muted hover:text-white'
            }`}
          >
            PULSE
          </button>
          <button
            onClick={() => updateC64({ noiseOn: !c64.noiseOn })}
            className={`px-4 py-2 text-[10px] font-mono rounded border transition-colors ${
              c64.noiseOn
                ? 'bg-rose-600/20 border-rose-500/50 text-rose-400'
                : 'bg-dark-bg border-dark-border text-text-muted hover:text-white'
            }`}
          >
            NOISE
          </button>
        </div>
      </div>

      {/* ADSR Envelope */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-amber-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">ADSR Envelope</h3>
        </div>

        <div className="flex justify-between gap-4">
          <Knob label="A" value={c64.a} min={0} max={15}
            onChange={(v) => updateC64({ a: Math.round(v) })}
            size="md" color="#f59e0b" formatValue={(v) => String(Math.round(v))} />
          <Knob label="D" value={c64.d} min={0} max={15}
            onChange={(v) => updateC64({ d: Math.round(v) })}
            size="md" color="#fb923c" formatValue={(v) => String(Math.round(v))} />
          <Knob label="S" value={c64.s} min={0} max={15}
            onChange={(v) => updateC64({ s: Math.round(v) })}
            size="md" color="#fbbf24" formatValue={(v) => String(Math.round(v))} />
          <Knob label="R" value={c64.r} min={0} max={15}
            onChange={(v) => updateC64({ r: Math.round(v) })}
            size="md" color="#facc15" formatValue={(v) => String(Math.round(v))} />
        </div>
      </div>

      {/* Duty & Modulation */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={16} className="text-cyan-400" />
            <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Pulse Width</h3>
          </div>
          <Knob label="DUTY" value={c64.duty} min={0} max={4095}
            onChange={(v) => updateC64({ duty: Math.round(v) })}
            size="md" color="#22d3ee" formatValue={(v) => String(Math.round(v))} />
        </div>

        <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} className="text-rose-400" />
            <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Modulation</h3>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => updateC64({ ringMod: !c64.ringMod })}
              className={`flex-1 px-2 py-2 text-[10px] font-mono rounded border transition-colors ${
                c64.ringMod
                  ? 'bg-rose-600/20 border-rose-500/50 text-rose-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              RING
            </button>
            <button
              onClick={() => updateC64({ oscSync: !c64.oscSync })}
              className={`flex-1 px-2 py-2 text-[10px] font-mono rounded border transition-colors ${
                c64.oscSync
                  ? 'bg-violet-600/20 border-violet-500/50 text-violet-400'
                  : 'bg-dark-bg border-dark-border text-text-muted'
              }`}
            >
              SYNC
            </button>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
        <div className="flex items-center gap-2 mb-4">
          <Volume2 size={16} className="text-purple-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Filter</h3>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => updateC64({ toFilter: !c64.toFilter })}
            className={`px-3 py-1 text-[10px] font-mono rounded border transition-colors ${
              c64.toFilter
                ? 'bg-purple-600/20 border-purple-500/50 text-purple-400'
                : 'bg-dark-bg border-dark-border text-text-muted'
            }`}
          >
            Enable
          </button>

          {c64.toFilter && (
            <>
              <Knob label="CUT" value={c64.filterCutoff ?? 1024} min={0} max={2047}
                onChange={(v) => updateC64({ filterCutoff: Math.round(v) })}
                size="sm" color="#a855f7" formatValue={(v) => String(Math.round(v))} />
              <Knob label="RES" value={c64.filterResonance ?? 0} min={0} max={15}
                onChange={(v) => updateC64({ filterResonance: Math.round(v) })}
                size="sm" color="#c084fc" formatValue={(v) => String(Math.round(v))} />

              <div className="flex gap-1">
                <button
                  onClick={() => updateC64({ filterLP: !c64.filterLP })}
                  className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                    c64.filterLP
                      ? 'bg-purple-600/20 border-purple-500/50 text-purple-400'
                      : 'bg-dark-bg border-dark-border text-text-muted'
                  }`}
                >
                  LP
                </button>
                <button
                  onClick={() => updateC64({ filterBP: !c64.filterBP })}
                  className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                    c64.filterBP
                      ? 'bg-purple-600/20 border-purple-500/50 text-purple-400'
                      : 'bg-dark-bg border-dark-border text-text-muted'
                  }`}
                >
                  BP
                </button>
                <button
                  onClick={() => updateC64({ filterHP: !c64.filterHP })}
                  className={`px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
                    c64.filterHP
                      ? 'bg-purple-600/20 border-purple-500/50 text-purple-400'
                      : 'bg-dark-bg border-dark-border text-text-muted'
                  }`}
                >
                  HP
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// SNES Panel - matches Furnace insEdit.cpp SNES editor (lines 7978-8093)
const SNES_DEFAULTS = { useEnv: true, gainMode: 0, gain: 127, a: 15, d: 7, s: 7, r: 0 };

const SNESPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const snes = useMemo(() => ({ ...SNES_DEFAULTS, ...config.snes }), [config.snes]);

  const updateSNES = useCallback((updates: Partial<typeof snes>) => {
    onChange({ snes: { ...config.snes, ...SNES_DEFAULTS, ...updates } });
  }, [config.snes, onChange]);

  const gainModes = ['Direct', 'Inc Linear', 'Inc Bent', 'Dec Linear', 'Dec Exp'];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
      {/* Envelope Mode */}
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-cyan-500/30">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-cyan-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">SNES Envelope</h3>
          <button
            onClick={() => updateSNES({ useEnv: !snes.useEnv })}
            className={`ml-auto px-2 py-1 text-[9px] font-mono rounded border transition-colors ${
              snes.useEnv
                ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-400'
                : 'bg-dark-bg border-dark-border text-text-muted'
            }`}
          >
            {snes.useEnv ? 'ADSR' : 'GAIN'}
          </button>
        </div>

        {snes.useEnv ? (
          <div className="flex justify-between gap-4">
            <Knob label="A" value={snes.a} min={0} max={15}
              onChange={(v) => updateSNES({ a: Math.round(v) })}
              size="md" color="#06b6d4" formatValue={(v) => String(Math.round(v))} />
            <Knob label="D" value={snes.d} min={0} max={7}
              onChange={(v) => updateSNES({ d: Math.round(v) })}
              size="md" color="#22d3ee" formatValue={(v) => String(Math.round(v))} />
            <Knob label="S" value={snes.s} min={0} max={7}
              onChange={(v) => updateSNES({ s: Math.round(v) })}
              size="md" color="#67e8f9" formatValue={(v) => String(Math.round(v))} />
            <Knob label="R" value={snes.r} min={0} max={31}
              onChange={(v) => updateSNES({ r: Math.round(v) })}
              size="md" color="#a5f3fc" formatValue={(v) => String(Math.round(v))} />
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div>
              <label className="text-[10px] text-text-muted font-mono block mb-1">Gain Mode</label>
              <select
                value={typeof snes.gainMode === 'number' ? snes.gainMode : 0}
                onChange={(e) => updateSNES({ gainMode: parseInt(e.target.value) })}
                className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-white"
              >
                {gainModes.map((mode, i) => (
                  <option key={i} value={i}>{mode}</option>
                ))}
              </select>
            </div>
            <Knob label="GAIN" value={snes.gain} min={0} max={127}
              onChange={(v) => updateSNES({ gain: Math.round(v) })}
              size="md" color="#06b6d4" formatValue={(v) => String(Math.round(v))} />
          </div>
        )}
      </div>
    </div>
  );
};

// PSG Panel - fixed to use actual config values
const PSG_DEFAULTS = { duty: 50, width: 50, noiseMode: 'white' as const, attack: 0, decay: 8, sustain: 10, release: 5 };

const PSGPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const psg = useMemo(() => ({ ...PSG_DEFAULTS, ...config.psg }), [config.psg]);

  const updatePSG = useCallback((updates: Partial<typeof psg>) => {
    onChange({ psg: { ...config.psg, ...PSG_DEFAULTS, ...updates } });
  }, [config.psg, onChange]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2">
      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
        <div className="flex items-center gap-2 mb-4">
          <Music size={16} className="text-sky-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Pulse Control</h3>
        </div>
        <div className="flex flex-wrap gap-6">
          <Knob label="DUTY" value={psg.duty} min={0} max={100}
            onChange={(v) => updatePSG({ duty: Math.round(v) })}
            size="md" color="#38bdf8" formatValue={(v) => `${Math.round(v)}%`} />
          <Knob label="WIDTH" value={psg.width} min={0} max={100}
            onChange={(v) => updatePSG({ width: Math.round(v) })}
            size="md" color="#0ea5e9" formatValue={(v) => `${Math.round(v)}%`} />
        </div>
      </div>

      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-rose-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Noise Mode</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => updatePSG({ noiseMode: 'white' })}
            className={`py-2 font-mono text-[10px] rounded border transition-colors ${
              psg.noiseMode === 'white'
                ? 'bg-rose-600/20 border-rose-500/50 text-rose-400'
                : 'bg-dark-bg border-dark-border text-text-muted hover:bg-rose-950/20'
            }`}
          >
            WHITE
          </button>
          <button
            onClick={() => updatePSG({ noiseMode: 'periodic' })}
            className={`py-2 font-mono text-[10px] rounded border transition-colors ${
              psg.noiseMode === 'periodic'
                ? 'bg-rose-600/20 border-rose-500/50 text-rose-400'
                : 'bg-dark-bg border-dark-border text-text-muted hover:bg-rose-950/20'
            }`}
          >
            PERIODIC
          </button>
        </div>
      </div>

      <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={16} className="text-emerald-400" />
          <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Envelope</h3>
        </div>
        <div className="flex justify-between gap-2">
          <Knob label="ATK" value={psg.attack} min={0} max={15}
            onChange={(v) => updatePSG({ attack: Math.round(v) })}
            size="sm" color="#34d399" formatValue={(v) => String(Math.round(v))} />
          <Knob label="DEC" value={psg.decay} min={0} max={15}
            onChange={(v) => updatePSG({ decay: Math.round(v) })}
            size="sm" color="#10b981" formatValue={(v) => String(Math.round(v))} />
          <Knob label="SUS" value={psg.sustain} min={0} max={15}
            onChange={(v) => updatePSG({ sustain: Math.round(v) })}
            size="sm" color="#059669" formatValue={(v) => String(Math.round(v))} />
          <Knob label="REL" value={psg.release} min={0} max={15}
            onChange={(v) => updatePSG({ release: Math.round(v) })}
            size="sm" color="#047857" formatValue={(v) => String(Math.round(v))} />
        </div>
      </div>
    </div>
  );
};

// @ts-expect-error Reserved for future use
const _WavetablePanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => (
  <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in slide-in-from-top-2">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Waves size={16} className="text-cyan-400" />
        <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
          Wavetable Engine ({config.wavetables.length} waves)
        </h3>
      </div>
      <WavetablePresetSelector
        chipType={config.chipType}
        onSelect={(preset) => {
          const newWavetables = [...config.wavetables, { id: config.wavetables.length, data: preset.data }];
          onChange({ wavetables: newWavetables });
        }}
      />
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {config.wavetables.map((wave, i) => (
        <WavetableVisualizer
          key={i}
          data={wave.data}
          index={wave.id}
          onRemove={() => {
            const newWavetables = config.wavetables.filter((_, idx) => idx !== i);
            onChange({ wavetables: newWavetables });
          }}
        />
      ))}
      {config.wavetables.length === 0 && (
        <div className="col-span-4 h-16 border border-dashed border-dark-border rounded flex items-center justify-center">
          <span className="text-[10px] text-text-muted font-mono italic">No custom waves. Click "Add Preset" to load wavetables.</span>
        </div>
      )}
    </div>
  </div>
);

// PCM Panel - fixed to use actual config values
const PCM_DEFAULTS = { sampleRate: 44100, loopStart: 0, loopEnd: 65535, loopPoint: 0, bitDepth: 8, loopEnabled: false };

const PCMPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => {
  const pcm = useMemo(() => ({ ...PCM_DEFAULTS, ...config.pcm }), [config.pcm]);

  const updatePCM = useCallback((updates: Partial<typeof pcm>) => {
    onChange({ pcm: { ...config.pcm, ...PCM_DEFAULTS, ...updates } });
  }, [config.pcm, onChange]);

  const bitDepths = [8, 16];

  return (
    <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center gap-2 mb-4">
        <Volume2 size={16} className="text-violet-400" />
        <h3 className="font-mono text-xs font-bold text-text-primary uppercase">PCM Sample Properties</h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Knob label="RATE" value={pcm.sampleRate} min={4000} max={48000}
          onChange={(v) => updatePCM({ sampleRate: Math.round(v) })}
          size="sm" color="#a78bfa" formatValue={(v) => `${Math.round(v/1000)}k`} />
        <Knob label="START" value={pcm.loopStart} min={0} max={65535}
          onChange={(v) => updatePCM({ loopStart: Math.round(v) })}
          size="sm" color="#8b5cf6" formatValue={(v) => String(Math.round(v))} />
        <Knob label="END" value={pcm.loopEnd} min={0} max={65535}
          onChange={(v) => updatePCM({ loopEnd: Math.round(v) })}
          size="sm" color="#7c3aed" formatValue={(v) => String(Math.round(v))} />
        <Knob label="LOOP" value={pcm.loopPoint} min={0} max={65535}
          onChange={(v) => updatePCM({ loopPoint: Math.round(v) })}
          size="sm" color="#6d28d9" formatValue={(v) => String(Math.round(v))} />
        <div className="flex flex-col items-center justify-center gap-1">
          <span className="text-[9px] font-bold text-text-muted uppercase">Bit Depth</span>
          <select
            value={pcm.bitDepth}
            onChange={(e) => updatePCM({ bitDepth: parseInt(e.target.value) })}
            className="bg-dark-bg px-2 py-1 rounded border border-dark-border text-xs font-mono text-violet-400"
          >
            {bitDepths.map((d) => (
              <option key={d} value={d}>{d}-BIT</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-dark-border">
        <button
          onClick={() => updatePCM({ loopEnabled: !pcm.loopEnabled })}
          className={`px-3 py-1 text-[10px] font-mono rounded border transition-colors ${
            pcm.loopEnabled
              ? 'bg-violet-600/20 border-violet-500/50 text-violet-400'
              : 'bg-dark-bg border-dark-border text-text-muted'
          }`}
        >
          {pcm.loopEnabled ? '🔁 Loop Enabled' : 'Loop Disabled'}
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// WAVETABLE COMPONENTS
// ============================================================================

const WavetableVisualizer: React.FC<{ data: number[]; index: number; onRemove?: () => void }> = ({ data, index, onRemove }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const width = 120;
  const height = 48;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const w = width;
    const h = height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1e293b';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, h/2); ctx.lineTo(w, h/2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#22d3ee');
    gradient.addColorStop(1, '#0891b2');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.5;

    const maxVal = Math.max(...data.map(Math.abs), 1);
    const isUnsigned = data.every(v => v >= 0);

    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      let y;
      if (isUnsigned) {
        y = h - (data[i] / maxVal) * h * 0.8 - h * 0.1;
      } else {
        y = h / 2 - (data[i] / maxVal) * (h / 2) * 0.8;
      }
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fillStyle = 'rgba(34, 211, 238, 0.05)';
    ctx.fill();
  }, [data]);

  return (
    <div className="bg-dark-bgTertiary p-1 rounded border border-dark-border hover:border-cyan-500/50 transition-colors group relative">
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 hover:bg-red-500 rounded-full text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          title="Remove wavetable"
        >
          ×
        </button>
      )}
      <canvas ref={canvasRef} width={120} height={48} className="w-full h-12" />
      <div className="flex justify-between items-center px-1 mt-1">
        <span className="text-[8px] font-mono text-cyan-400 font-bold">W{index}</span>
        <span className="text-[8px] font-mono text-text-muted">{data.length} pts</span>
      </div>
    </div>
  );
};

const WavetablePresetSelector: React.FC<{
  chipType: number;
  onSelect: (preset: FurnaceWavetablePreset) => void;
}> = ({ chipType, onSelect }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState<'32x16' | '32x32' | '128x256'>('32x16');

  const getRecommendedCategory = (): '32x16' | '32x32' | '128x256' => {
    if ([5, 8, 19].includes(chipType)) return '32x16';
    if ([6, 44].includes(chipType)) return '32x32';
    if ([25].includes(chipType)) return '128x256';
    return '32x16';
  };

  React.useEffect(() => {
    setSelectedCategory(getRecommendedCategory());
  }, [chipType]);

  const presets = getFurnaceWavetablesByCategory(selectedCategory);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 bg-dark-bg border border-dark-border rounded hover:border-cyan-500/50 transition-colors text-xs text-text-muted hover:text-cyan-400"
      >
        <Library size={12} />
        <span className="font-mono">Add Preset</span>
        <Plus size={10} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-8 z-50 bg-dark-bgSecondary border border-dark-border rounded-lg shadow-xl w-64 max-h-80 overflow-hidden">
            <div className="p-2 border-b border-dark-border">
              <div className="flex gap-1">
                {(['32x16', '32x32', '128x256'] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`flex-1 text-[10px] font-mono py-1 rounded transition-colors ${
                      selectedCategory === cat
                        ? 'bg-cyan-600 text-white'
                        : 'bg-dark-bg text-text-muted hover:text-cyan-400'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-y-auto max-h-56">
              {presets.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => {
                    onSelect(preset);
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-dark-bg transition-colors flex items-center gap-2 border-b border-dark-border/50 last:border-0"
                >
                  <MiniWaveform data={preset.data} max={preset.max} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-text-primary truncate">{preset.name}</div>
                    <div className="text-[9px] text-text-muted font-mono">{preset.len} pts</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const MiniWaveform: React.FC<{ data: number[]; max: number }> = ({ data, max }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = 32;
  const height = 16;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (v / max) * (height - 2) - 1;
      return { x, y };
    });

    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1;
    
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }, [data, max]);

  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height} 
      className="flex-shrink-0"
      style={{ width, height }}
    />
  );
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getChipCategory(id: number): "FM" | "PSG" | "Wavetable" | "PCM" | "Other" {
  if ([0, 1, 2, 11, 13, 14, 22, 23, 26].includes(id)) return "FM";
  if ([3, 4, 5, 12, 15, 16, 17, 18, 33, 34, 35, 43, 44].includes(id)) return "PSG";
  if ([6, 7, 8, 9, 19, 36, 37, 38].includes(id)) return "Wavetable";
  if ([10, 20, 21, 24, 25, 27, 28, 29, 30, 31, 32, 39, 40, 41, 42].includes(id)) return "PCM";
  return "Other";
}

function getChipName(id: number): string {
  // Descriptive names with console/platform info
  const names: Record<number, string> = {
    0: "Sega Genesis (YM2612)",
    1: "Arcade / X68000 (YM2151)",
    2: "AdLib / Sound Blaster (OPL3)",
    3: "Sega Master System (SN76489)",
    4: "Nintendo NES (2A03)",
    5: "Nintendo Game Boy (LR35902)",
    6: "PC Engine / TurboGrafx (HuC6280)",
    7: "Konami MSX (SCC)",
    8: "Namco Arcade (N163)",
    9: "Famicom (VRC6)",
    10: "Commodore 64 (SID)",
    11: "MSX / Sega (OPLL)",
    12: "ZX Spectrum / Amstrad (AY-3-8910)",
    13: "NEC PC-98 (OPNA)",
    14: "Neo Geo (OPNB)",
    15: "Atari 2600 (TIA)",
    16: "Famicom Disk System",
    17: "Famicom (MMC5)",
    18: "SAM Coupe (SAA1099)",
    19: "Bandai WonderSwan",
    20: "Arcade (OKI MSM6295)",
    21: "Ensoniq (ES5506)",
    22: "Yamaha TX81Z (OPZ)",
    23: "MSX-Audio (Y8950)",
    24: "Super Nintendo (SPC700)",
    25: "Atari Lynx",
    26: "Yamaha (OPL4)",
    27: "Sega Arcade (SegaPCM)",
    28: "Yamaha (YMZ280B)",
    29: "Sega CD (RF5C68)",
    30: "Irem Arcade (GA20)",
    31: "Namco Arcade (C140)",
    32: "Capcom Arcade (QSound)",
    33: "Commodore VIC-20",
    34: "Commodore Plus/4 (TED)",
    35: "Watara Supervision",
    36: "Commander X16 (VERA)",
    37: "Game Gear (SM8521)",
    38: "Konami Bubble System",
    39: "Konami Arcade (K007232)",
    40: "Konami Arcade (K053260)",
    41: "Seta Arcade (X1-010)",
    42: "NEC (μPD1771)",
    43: "Toshiba (T6W28)",
    44: "Nintendo Virtual Boy",
  };
  return names[id] || `Unknown Chip (${id})`;
}

function isOperatorCarrier(algorithm: number, opIndex: number): boolean {
  // Based on Furnace's opIsOutput array
  const carrierMap: Record<number, number[]> = {
    0: [0],           // Alg 0: OP1 is carrier
    1: [0],           // Alg 1: OP1 is carrier
    2: [0],           // Alg 2: OP1 is carrier
    3: [0],           // Alg 3: OP1 is carrier
    4: [0, 2],        // Alg 4: OP1 and OP3 are carriers
    5: [0, 1, 2],     // Alg 5: OP1, OP2, OP3 are carriers
    6: [0, 1, 2],     // Alg 6: OP1, OP2, OP3 are carriers
    7: [0, 1, 2, 3],  // Alg 7: All operators are carriers
  };
  return carrierMap[algorithm]?.includes(opIndex) ?? false;
}

// @ts-expect-error Reserved for future use
function _getMacroTypeName(type: number): string {
  const names: Record<number, string> = {
    0: 'VOL', 1: 'ARP', 2: 'DUTY', 3: 'WAVE', 4: 'PITCH',
    5: 'EX1', 6: 'EX2', 7: 'EX3', 8: 'ALG', 9: 'FB',
    10: 'FMS', 11: 'AMS', 12: 'PAN.L', 13: 'PAN.R', 14: 'RESET',
  };
  return names[type] || `M${type}`;
}

const OPLL_PRESETS = [
  'Custom', 'Violin', 'Guitar', 'Piano', 'Flute',
  'Clarinet', 'Oboe', 'Trumpet', 'Organ', 'Horn',
  'Synth', 'Harpsichord', 'Vibraphone', 'Synth Bass', 'Wood Bass', 'Electric Bass'
];
