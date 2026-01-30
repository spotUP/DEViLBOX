/**
 * FurnaceEditor - Comprehensive Furnace chip instrument editor
 *
 * Based on deep research of Furnace tracker's insEdit.cpp (9041 lines)
 * Implements chip-specific parameter ranges, FM envelope visualization,
 * algorithm diagrams, and accurate operator controls.
 *
 * Research reference: /Users/spot/Code/DEViLBOX/Reference Code/furnace-master/src/gui/insEdit.cpp
 */

import React, { useState, useCallback, useMemo } from 'react';
import type { FurnaceConfig, FurnaceOperatorConfig } from '@typedefs/instrument';
import { Knob } from '@components/controls/Knob';
import { Cpu, Activity, Zap, Waves, Volume2, Music, Settings, Plus, Library, ChevronDown, ChevronRight } from 'lucide-react';
import { InstrumentOscilloscope } from '@components/visualization';
import {
  getFurnaceWavetablesByCategory,
  type FurnaceWavetablePreset
} from '@constants/furnaceWavetablePresets';

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

    const w = canvas.width;
    const h = canvas.height;
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
      className="rounded border border-dark-border"
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
        <div className="flex-1 mx-4 max-w-[200px]">
          <InstrumentOscilloscope
            instrumentId={instrumentId}
            width={200}
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
              <div className="flex justify-around">
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
          </div>

          {config.macros.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm">
              <p className="mb-2">No macros defined</p>
              <p className="text-xs opacity-60">Macros allow automated parameter changes over time</p>
            </div>
          ) : (
            <div className="space-y-2">
              {config.macros.map((macro, i) => (
                <div key={i} className="bg-dark-bg p-2 rounded border border-dark-border flex items-center gap-2">
                  <span className="text-[10px] font-mono text-violet-400 w-12">
                    {getMacroTypeName(macro.type)}
                  </span>
                  <div className="flex-1 h-6 bg-dark-bgTertiary rounded relative overflow-hidden">
                    {/* Mini macro visualization */}
                    <MacroMiniView values={macro.data} loop={macro.loop} release={macro.release} />
                  </div>
                  <span className="text-[9px] text-text-muted font-mono">
                    {macro.data.length} steps
                  </span>
                </div>
              ))}
            </div>
          )}
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

      {/* PSG / PULSE PANEL */}
      {category === "PSG" && (
        <PSGPanel config={config} onChange={onChange} />
      )}

      {/* WAVETABLE PANEL */}
      {(category === "Wavetable" || config.wavetables.length > 0) && (
        <WavetablePanel config={config} onChange={onChange} />
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
      <div className="flex items-center justify-between mb-3">
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

      {/* Envelope Visualization */}
      <div className="mb-3">
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
          width={200}
          height={40}
        />
      </div>

      {/* Basic Parameters - Always Visible */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <Knob
          label="TL"
          value={op.tl}
          min={ranges.tl.min}
          max={ranges.tl.max}
          onChange={(v) => onUpdate({ tl: Math.round(v) })}
          size="sm"
          color="#ef4444"
          formatValue={(v) => String(Math.round(v))}
        />
        <Knob
          label="MULT"
          value={op.mult}
          min={ranges.mult.min}
          max={ranges.mult.max}
          onChange={(v) => onUpdate({ mult: Math.round(v) })}
          size="sm"
          color="#22d3ee"
          formatValue={(v) => String(Math.round(v))}
        />
        <Knob
          label="DT"
          value={op.dt}
          min={ranges.dt.min}
          max={ranges.dt.max}
          onChange={(v) => onUpdate({ dt: Math.round(v) })}
          size="sm"
          color="#a78bfa"
          formatValue={(v) => {
            const val = Math.round(v);
            return val > 0 ? `+${val}` : String(val);
          }}
        />
      </div>

      {/* Envelope Parameters */}
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        <Knob
          label="AR"
          value={op.ar}
          min={ranges.ar.min}
          max={ranges.ar.max}
          onChange={(v) => onUpdate({ ar: Math.round(v) })}
          size="sm"
          color="#10b981"
          formatValue={(v) => String(Math.round(v))}
        />
        <Knob
          label="DR"
          value={op.dr}
          min={ranges.dr.min}
          max={ranges.dr.max}
          onChange={(v) => onUpdate({ dr: Math.round(v) })}
          size="sm"
          color="#f59e0b"
          formatValue={(v) => String(Math.round(v))}
        />
        <Knob
          label="SL"
          value={op.sl}
          min={ranges.sl.min}
          max={ranges.sl.max}
          onChange={(v) => onUpdate({ sl: Math.round(v) })}
          size="sm"
          color="#8b5cf6"
          formatValue={(v) => String(Math.round(v))}
        />
        <Knob
          label="RR"
          value={op.rr}
          min={ranges.rr.min}
          max={ranges.rr.max}
          onChange={(v) => onUpdate({ rr: Math.round(v) })}
          size="sm"
          color="#ec4899"
          formatValue={(v) => String(Math.round(v))}
        />
      </div>

      {/* Expanded Parameters */}
      {isExpanded && (
        <div className="pt-2 border-t border-dark-border mt-2 space-y-2 animate-in slide-in-from-top-2 duration-200">
          {/* D2R (if supported) */}
          {ranges.hasD2R && (
            <div className="flex justify-center">
              <Knob
                label="D2R"
                value={op.d2r ?? 0}
                min={ranges.d2r.min}
                max={ranges.d2r.max}
                onChange={(v) => onUpdate({ d2r: Math.round(v) })}
                size="sm"
                color="#fb923c"
                formatValue={(v) => String(Math.round(v))}
              />
            </div>
          )}

          {/* Rate Scaling */}
          {ranges.rs.max > 0 && (
            <div className="flex justify-center">
              <Knob
                label="RS"
                value={op.rs}
                min={ranges.rs.min}
                max={ranges.rs.max}
                onChange={(v) => onUpdate({ rs: Math.round(v) })}
                size="sm"
                color="#06b6d4"
                formatValue={(v) => String(Math.round(v))}
              />
            </div>
          )}

          {/* DT2 (OPM/OPZ) */}
          {ranges.hasDT2 && (
            <div className="flex justify-center">
              <Knob
                label="DT2"
                value={op.dt2 ?? 0}
                min={0}
                max={3}
                onChange={(v) => onUpdate({ dt2: Math.round(v) })}
                size="sm"
                color="#c084fc"
                formatValue={(v) => String(Math.round(v))}
              />
            </div>
          )}

          {/* KSL (OPL) */}
          {ranges.ksl && (
            <div className="flex justify-center">
              <Knob
                label="KSL"
                value={op.ksl}
                min={ranges.ksl.min}
                max={ranges.ksl.max}
                onChange={(v) => onUpdate({ ksl: Math.round(v) })}
                size="sm"
                color="#fbbf24"
                formatValue={(v) => String(Math.round(v))}
              />
            </div>
          )}

          {/* Waveform Select (OPL) */}
          {ranges.hasWS && (
            <div className="flex justify-center">
              <Knob
                label="WS"
                value={op.ws}
                min={0}
                max={7}
                onChange={(v) => onUpdate({ ws: Math.round(v) })}
                size="sm"
                color="#34d399"
                formatValue={(v) => String(Math.round(v))}
              />
            </div>
          )}

          {/* Boolean Flags */}
          <div className="flex flex-wrap gap-1 justify-center">
            <ToggleButton
              label="AM"
              value={op.am}
              onChange={(v) => onUpdate({ am: v })}
            />
            {ranges.hasSSG && (
              <ToggleButton
                label="SSG"
                value={(op.ssg ?? 0) > 0}
                onChange={(v) => onUpdate({ ssg: v ? 8 : 0 })}
              />
            )}
            {ranges.hasWS && (
              <>
                <ToggleButton
                  label="VIB"
                  value={op.vib}
                  onChange={(v) => onUpdate({ vib: v })}
                />
                <ToggleButton
                  label="SUS"
                  value={op.sus}
                  onChange={(v) => onUpdate({ sus: v })}
                />
                <ToggleButton
                  label="KSR"
                  value={op.ksr}
                  onChange={(v) => onUpdate({ ksr: v })}
                />
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

const MacroMiniView: React.FC<{
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
// SUB-PANELS (PSG, Wavetable, PCM)
// ============================================================================

const PSGPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config: _config, onChange: _onChange }) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2">
    <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
      <div className="flex items-center gap-2 mb-4">
        <Music size={16} className="text-sky-400" />
        <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Pulse Control</h3>
      </div>
      <div className="flex justify-around">
        <Knob label="DUTY" value={50} min={0} max={100} onChange={() => {}} size="md" color="#38bdf8" />
        <Knob label="WIDTH" value={50} min={0} max={100} onChange={() => {}} size="md" color="#0ea5e9" />
      </div>
    </div>

    <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={16} className="text-rose-400" />
        <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Noise Mode</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="bg-dark-bg border border-dark-border rounded py-2 font-mono text-[10px] text-rose-400 hover:bg-rose-950/20">WHITE</button>
        <button className="bg-dark-bg border border-dark-border rounded py-2 font-mono text-[10px] text-text-muted">PERIODIC</button>
      </div>
    </div>

    <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border">
      <div className="flex items-center gap-2 mb-4">
        <Settings size={16} className="text-emerald-400" />
        <h3 className="font-mono text-xs font-bold text-text-primary uppercase">Envelope</h3>
      </div>
      <div className="flex justify-between gap-2">
        <Knob label="ATK" value={0} min={0} max={15} onChange={() => {}} size="sm" color="#34d399" />
        <Knob label="DEC" value={8} min={0} max={15} onChange={() => {}} size="sm" color="#10b981" />
        <Knob label="SUS" value={10} min={0} max={15} onChange={() => {}} size="sm" color="#059669" />
        <Knob label="REL" value={5} min={0} max={15} onChange={() => {}} size="sm" color="#047857" />
      </div>
    </div>
  </div>
);

const WavetablePanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config, onChange }) => (
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

const PCMPanel: React.FC<{ config: FurnaceConfig; onChange: (u: Partial<FurnaceConfig>) => void }> = ({ config: _config, onChange: _onChange }) => (
  <div className="bg-dark-bgSecondary p-4 rounded-lg border border-dark-border animate-in fade-in slide-in-from-top-2">
    <div className="flex items-center gap-2 mb-4">
      <Volume2 size={16} className="text-violet-400" />
      <h3 className="font-mono text-xs font-bold text-text-primary uppercase">PCM Sample Properties</h3>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <Knob label="RATE" value={44100} min={4000} max={48000} onChange={() => {}} size="sm" color="#a78bfa" />
      <Knob label="START" value={0} min={0} max={65535} onChange={() => {}} size="sm" color="#8b5cf6" />
      <Knob label="END" value={65535} min={0} max={65535} onChange={() => {}} size="sm" color="#7c3aed" />
      <Knob label="LOOP" value={0} min={0} max={65535} onChange={() => {}} size="sm" color="#6d28d9" />
      <div className="flex flex-col items-center justify-center gap-1">
        <span className="text-[9px] font-bold text-text-muted uppercase">Bit Depth</span>
        <div className="bg-dark-bg px-2 py-1 rounded border border-dark-border text-xs font-mono text-violet-400">8-BIT</div>
      </div>
    </div>
  </div>
);

// ============================================================================
// WAVETABLE COMPONENTS
// ============================================================================

const WavetableVisualizer: React.FC<{ data: number[]; index: number; onRemove?: () => void }> = ({ data, index, onRemove }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
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
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 32;
    const y = 16 - (v / max) * 14;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width="32" height="16" className="flex-shrink-0">
      <polyline points={points} fill="none" stroke="#22d3ee" strokeWidth="1" />
    </svg>
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
  const names: Record<number, string> = {
    0: "Sega Genesis (YM2612)",
    1: "Arcade FM (YM2151)",
    2: "Yamaha OPL3 (YMF262)",
    3: "Sega PSG (SN76489)",
    4: "Nintendo NES (2A03)",
    5: "Game Boy (LR35902)",
    6: "PC Engine (HuC6280)",
    7: "Konami SCC",
    8: "Namco 163",
    9: "Konami VRC6",
    10: "Commodore 64 (SID)",
    11: "Yamaha OPLL (YM2413)",
    12: "AY-3-8910",
    13: "Yamaha OPNA (YM2608)",
    14: "Yamaha OPNB (YM2610)",
    15: "Atari TIA",
    16: "Famicom Disk System",
    17: "Famicom MMC5",
    18: "Philips SAA1099",
    19: "WonderSwan",
    20: "OKI MSM6295",
    21: "Ensoniq ES5506",
    22: "Yamaha OPZ (YM2414)",
    23: "Yamaha Y8950",
    24: "Super Nintendo (SPC700)",
    25: "Atari Lynx",
    26: "Yamaha OPL4",
    27: "SegaPCM",
    28: "Yamaha YMZ280B",
    29: "Ricoh RF5C68",
    30: "Irem GA20",
    31: "Namco C140",
    32: "Capcom QSound",
    33: "Commodore VIC-20",
    34: "Commodore TED",
    35: "Watara Supervision",
    36: "Commander X16 VERA",
    37: "Sharp SM8521",
    38: "Konami Bubble System",
    39: "Konami K007232",
    40: "Konami K053260",
    41: "Seta X1-010",
    42: "NEC uPD1771",
    43: "Toshiba T6W28",
    44: "Virtual Boy (VSU)",
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

function getMacroTypeName(type: number): string {
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
