/**
 * SIDFilterTab — DOM WebSID filter emulation parameter controls.
 *
 * Nine filter curve parameters (matching DeepSID), SID revision presets,
 * reset button, and a small SVG filter curve preview.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import { CustomSelect } from '@components/common/CustomSelect';
import { getActiveC64SidEngine } from '@/engine/replayer/NativeEngineRouting';

interface SIDFilterTabProps {
  className?: string;
}

interface FilterParams {
  minimum: number;
  maximum: number;
  steepness: number;
  xOffset: number;
  kink: number;
  distortion: number;
  distOffset: number;
  distScale: number;
  distThreshold: number;
}

const DEFAULT_PARAMS: FilterParams = {
  minimum: 0.2,
  maximum: 0.8,
  steepness: 0.5,
  xOffset: 0.5,
  kink: 0.5,
  distortion: 0.0,
  distOffset: 0.5,
  distScale: 0.5,
  distThreshold: 0.5,
};

const R2_PARAMS: FilterParams = {
  minimum: 0.22, maximum: 0.82, steepness: 0.55,
  xOffset: 0.48, kink: 0.45, distortion: 0.15,
  distOffset: 0.50, distScale: 0.45, distThreshold: 0.50,
};

const R3_PARAMS: FilterParams = {
  minimum: 0.18, maximum: 0.78, steepness: 0.50,
  xOffset: 0.52, kink: 0.50, distortion: 0.0,
  distOffset: 0.50, distScale: 0.50, distThreshold: 0.50,
};

const R4_PARAMS: FilterParams = {
  minimum: 0.15, maximum: 0.75, steepness: 0.48,
  xOffset: 0.54, kink: 0.52, distortion: 0.0,
  distOffset: 0.50, distScale: 0.52, distThreshold: 0.48,
};

const REVISION_OPTIONS = [
  { value: 'r2', label: 'R2 (6581)' },
  { value: 'r3', label: 'R3 (8580)' },
  { value: 'r4', label: 'R4 (8580D)' },
];

const REVISION_MAP: Record<string, FilterParams> = {
  r2: R2_PARAMS,
  r3: R3_PARAMS,
  r4: R4_PARAMS,
};

type ParamKey = keyof FilterParams;

const PARAM_DEFS: { key: ParamKey; label: string }[] = [
  { key: 'minimum', label: 'Minimum' },
  { key: 'maximum', label: 'Maximum' },
  { key: 'steepness', label: 'Steepness' },
  { key: 'xOffset', label: 'X-Offset' },
  { key: 'kink', label: 'Kink' },
  { key: 'distortion', label: 'Distortion' },
  { key: 'distOffset', label: 'Dist. Offset' },
  { key: 'distScale', label: 'Dist. Scale' },
  { key: 'distThreshold', label: 'Dist. Threshold' },
];

const SVG_W = 280;
const SVG_H = 80;
const PAD = 6;

function buildCurvePath(params: FilterParams): string {
  const { minimum, maximum, steepness, xOffset, kink } = params;
  const plotW = SVG_W - PAD * 2;
  const plotH = SVG_H - PAD * 2;
  const yMin = PAD + plotH * (1 - minimum);
  const yMax = PAD + plotH * (1 - maximum);
  const xCenter = PAD + plotW * xOffset;
  const curveWidth = plotW * steepness * 0.8;
  const kinkOffset = (kink - 0.5) * plotH * 0.3;

  return [
    `M ${PAD} ${yMin}`,
    `C ${xCenter - curveWidth} ${yMin + kinkOffset},`,
    `  ${xCenter - curveWidth * 0.3} ${yMax - kinkOffset},`,
    `  ${xCenter} ${yMax}`,
    `C ${xCenter + curveWidth * 0.3} ${yMax - kinkOffset},`,
    `  ${xCenter + curveWidth} ${yMin + kinkOffset},`,
    `  ${SVG_W - PAD} ${yMin}`,
  ].join(' ');
}

function buildFillPath(params: FilterParams): string {
  const curve = buildCurvePath(params);
  return `${curve} L ${SVG_W - PAD} ${SVG_H - PAD} L ${PAD} ${SVG_H - PAD} Z`;
}

function applyFilterToEngine(p: FilterParams): void {
  try {
    getActiveC64SidEngine()?.setFilterConfig6581(
      p.minimum, p.maximum, p.steepness, p.xOffset,
      p.kink, p.distortion, p.distOffset, p.distScale, p.distThreshold,
    );
  } catch { /* engine not ready */ }
}

export const SIDFilterTab: React.FC<SIDFilterTabProps> = ({ className }) => {
  const [params, setParams] = useState<FilterParams>({ ...DEFAULT_PARAMS });
  const [revision, setRevision] = useState('r2');
  const [engineSupported, setEngineSupported] = useState<boolean | null>(null);

  // Check whether the active engine supports filter curve control (WebSID only)
  useEffect(() => {
    const engine = getActiveC64SidEngine();
    // WebSID backend: adapter has setFilterConfig6581; jsSID: no API
    const supported = typeof engine?.setFilterConfig6581 === 'function';
    setEngineSupported(supported);
  }, []);

  // Apply params to engine whenever they change
  useEffect(() => {
    applyFilterToEngine(params);
  }, [params]);

  const updateParam = useCallback((key: ParamKey, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleRevisionChange = useCallback((value: string) => {
    setRevision(value);
    const preset = REVISION_MAP[value];
    if (preset) setParams({ ...preset });
  }, []);

  const handleReset = useCallback(() => {
    setParams({ ...DEFAULT_PARAMS });
  }, []);

  const curvePath = useMemo(() => buildCurvePath(params), [params]);
  const fillPath = useMemo(() => buildFillPath(params), [params]);

  return (
    <div className={`flex flex-col gap-2 p-3 h-full ${className ?? ''}`}>
      {/* Top row: Revision select + Reset */}
      <div className="flex items-center gap-3">
        <label className="text-[10px] font-mono text-text-secondary shrink-0">SID Revision</label>
        <CustomSelect
          value={revision}
          onChange={(v) => handleRevisionChange(v)}
          options={REVISION_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          className="bg-dark-bg border border-dark-border text-text-primary text-[10px] font-mono
                     px-2 py-1 rounded"
        />

        <div className="flex-1" />

        {engineSupported === false && (
          <span className="text-[9px] font-mono text-text-muted italic">jsSID — visual only</span>
        )}

        <button
          onClick={handleReset}
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono text-text-secondary
                     border border-dark-border rounded hover:bg-dark-bgHover
                     hover:text-text-primary transition-colors"
        >
          <RotateCcw size={10} />
          Reset
        </button>
      </div>

      {/* Filter curve SVG preview */}
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full border border-dark-border rounded"
        style={{ background: '#0d0d1a', maxHeight: 80 }}
      >
        {/* Grid lines */}
        {[1, 2, 3].map(i => (
          <line key={`vg${i}`} x1={(SVG_W / 4) * i} y1={0} x2={(SVG_W / 4) * i} y2={SVG_H}
                stroke="#1a1a3a" strokeWidth={0.5} />
        ))}
        {[1, 2].map(i => (
          <line key={`hg${i}`} x1={0} y1={(SVG_H / 3) * i} x2={SVG_W} y2={(SVG_H / 3) * i}
                stroke="#1a1a3a" strokeWidth={0.5} />
        ))}
        {/* Fill under curve */}
        <path d={fillPath} fill="var(--color-accent)" opacity={0.1} />
        {/* Curve stroke */}
        <path d={curvePath} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} opacity={0.9} />
      </svg>

      {/* Parameter sliders */}
      <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto">
        {PARAM_DEFS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2">
            <label className="text-[10px] font-mono text-text-muted w-28 shrink-0">
              {label}
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={params[key]}
              onChange={e => updateParam(key, parseFloat(e.target.value))}
              className="flex-1 h-1 accent-accent-primary cursor-pointer"
            />
            <span className="text-[10px] font-mono text-accent-primary w-10 text-right tabular-nums">
              {params[key].toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
