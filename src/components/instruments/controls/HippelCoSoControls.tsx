/**
 * HippelCoSoControls.tsx — Chris Hülsbeck (Hippel CoSo) instrument editor
 *
 * Exposes all HippelCoSoConfig parameters: timing, vibrato, and editable
 * frequency/volume sequences with mini SVG visualizations.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { HippelCoSoConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';

interface HippelCoSoControlsProps {
  config: HippelCoSoConfig;
  onChange: (updates: Partial<HippelCoSoConfig>) => void;
}

type HCSTab = 'main' | 'sequences';

// ── Mini SVG: step plot for fseq (relative pitch changes) ──────────────────
const FseqPlot: React.FC<{ data: number[]; accent: string }> = ({ data, accent }) => {
  const W = 128;
  const H = 32;
  const visible = data.filter((v) => v !== -128);
  if (visible.length === 0) return <svg width={W} height={H} />;

  const minV = Math.min(...visible);
  const maxV = Math.max(...visible);
  const range = maxV - minV || 1;

  const toY = (v: number) => H - 2 - ((v - minV) / range) * (H - 4);
  const stepW = W / Math.max(visible.length, 1);

  const segments = visible.map((v, i) => {
    const x = i * stepW;
    const y = toY(v);
    const nextX = (i + 1) * stepW;
    return `M${x},${y} H${nextX}`;
  });

  return (
    <svg width={W} height={H} style={{ display: 'block', marginBottom: 4 }}>
      <rect width={W} height={H} fill="#060a0f" rx={2} />
      {segments.map((d, i) => (
        <path key={i} d={d} stroke={accent} strokeWidth={1.5} fill="none" opacity={0.85} />
      ))}
    </svg>
  );
};

// ── Mini SVG: bar chart for vseq (volume envelope) ─────────────────────────
const VseqBars: React.FC<{ data: number[]; accent: string }> = ({ data, accent }) => {
  const W = 128;
  const H = 32;
  const visible = data.filter((v) => v !== -128);
  if (visible.length === 0) return <svg width={W} height={H} />;

  const barW = W / Math.max(visible.length, 1);

  return (
    <svg width={W} height={H} style={{ display: 'block', marginBottom: 4 }}>
      <rect width={W} height={H} fill="#060a0f" rx={2} />
      {visible.map((v, i) => {
        const vol = Math.max(0, v);
        const barH = (vol / 63) * (H - 2);
        return (
          <rect
            key={i}
            x={i * barW + 0.5}
            y={H - barH - 1}
            width={Math.max(barW - 1, 1)}
            height={barH}
            fill={accent}
            opacity={0.75}
          />
        );
      })}
    </svg>
  );
};

export const HippelCoSoControls: React.FC<HippelCoSoControlsProps> = ({ config, onChange }) => {
  const [activeTab, setActiveTab] = useState<HCSTab>('main');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#44aaff';
  const knob    = isCyan ? '#00ffff' : '#66bbff';
  const dim     = isCyan ? '#004444' : '#001833';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#000e1a] border-blue-900/30';

  const upd = useCallback(<K extends keyof HippelCoSoConfig>(key: K, value: HippelCoSoConfig[K]) => {
    onChange({ [key]: value } as Partial<HippelCoSoConfig>);
  }, [onChange]);

  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div
      className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: accent, opacity: 0.7 }}
    >
      {label}
    </div>
  );

  // ── Shared editable sequence grid ─────────────────────────────────────────
  const renderSeqGrid = (
    seqKey: 'fseq' | 'vseq',
    arr: number[],
    minVal: number,
    maxVal: number,
  ) => (
    <div className="grid grid-cols-8 gap-1">
      {arr.map((v, i) => {
        const isLoop = v === -128 && i + 1 < arr.length;
        const loopTarget = isLoop ? arr[i + 1] & 0x7f : null;
        return (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] font-mono text-gray-600">
              {isLoop && loopTarget !== null ? `→${loopTarget}` : i.toString().padStart(2, '0')}
            </span>
            <input
              type="number"
              value={v}
              min={minVal}
              max={maxVal}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) {
                  const next = [...configRef.current[seqKey]];
                  next[i] = Math.max(minVal, Math.min(maxVal, val));
                  upd(seqKey, next);
                }
              }}
              className="text-[10px] font-mono text-center border rounded py-0.5"
              style={{
                width: '36px',
                background: '#060a0f',
                borderColor: v !== 0 ? dim : '#1a1a1a',
                color: v === -128 ? '#ff8844' : v !== 0 ? accent : '#444',
              }}
            />
          </div>
        );
      })}
    </div>
  );

  // ── MAIN TAB ──────────────────────────────────────────────────────────────
  const renderMain = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {/* Timing */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Timing" />
        <div className="flex gap-4">
          <Knob
            value={config.volSpeed}
            min={1}
            max={16}
            step={1}
            onChange={(v) => upd('volSpeed', Math.round(v))}
            label="Vol Speed"
            color={knob}
            size="sm"
            formatValue={(v) => Math.round(v).toString()}
          />
        </div>
        <span className="text-[10px] text-gray-600 mt-1 block">ticks per vseq step</span>
      </div>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Vibrato" />
        <div className="flex gap-4">
          <Knob
            value={config.vibDelay}
            min={0}
            max={255}
            step={1}
            onChange={(v) => upd('vibDelay', Math.round(v))}
            label="Delay"
            color={knob}
            size="sm"
            formatValue={(v) => Math.round(v).toString()}
          />
          <Knob
            value={config.vibSpeed}
            min={-128}
            max={127}
            step={1}
            onChange={(v) => upd('vibSpeed', Math.round(v))}
            label="Speed"
            color={knob}
            size="sm"
            formatValue={(v) => Math.round(v).toString()}
          />
          <Knob
            value={config.vibDepth}
            min={0}
            max={255}
            step={1}
            onChange={(v) => upd('vibDepth', Math.round(v))}
            label="Depth"
            color={knob}
            size="sm"
            formatValue={(v) => Math.round(v).toString()}
          />
        </div>
      </div>
    </div>
  );

  // ── SEQUENCES TAB ─────────────────────────────────────────────────────────
  const renderSequences = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {/* Frequency Sequence */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Frequency Sequence (fseq)" />
        <FseqPlot data={config.fseq} accent={accent} />
        {renderSeqGrid('fseq', config.fseq, -128, 127)}
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => upd('fseq', [...configRef.current.fseq, 0])}
            className="px-2 py-1 text-[10px] font-mono rounded border transition-colors"
            style={{ borderColor: dim, color: accent, background: '#060a0f' }}
          >
            + Add step
          </button>
          <button
            onClick={() => {
              const arr = configRef.current.fseq;
              if (arr.length > 1) upd('fseq', arr.slice(0, -1));
            }}
            className="px-2 py-1 text-[10px] font-mono rounded border transition-colors"
            style={{ borderColor: '#333', color: '#666', background: '#060a0f' }}
          >
            – Remove last
          </button>
        </div>
        <p className="text-[9px] text-gray-600 mt-1">
          -128 followed by N = loop to step (N &amp; 0x7F)
        </p>
      </div>

      {/* Volume Sequence */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Volume Sequence (vseq)" />
        <VseqBars data={config.vseq} accent={accent} />
        {renderSeqGrid('vseq', config.vseq, -128, 63)}
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => upd('vseq', [...configRef.current.vseq, 0])}
            className="px-2 py-1 text-[10px] font-mono rounded border transition-colors"
            style={{ borderColor: dim, color: accent, background: '#060a0f' }}
          >
            + Add step
          </button>
          <button
            onClick={() => {
              const arr = configRef.current.vseq;
              if (arr.length > 1) upd('vseq', arr.slice(0, -1));
            }}
            className="px-2 py-1 text-[10px] font-mono rounded border transition-colors"
            style={{ borderColor: '#333', color: '#666', background: '#060a0f' }}
          >
            – Remove last
          </button>
        </div>
        <p className="text-[9px] text-gray-600 mt-1">
          0–63 = volume level; -128 = loop marker (next byte = loop target)
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b" style={{ borderColor: dim }}>
        {([['main', 'Parameters'], ['sequences', 'Sequences']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accent : '#666',
              borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
              background: activeTab === id ? (isCyan ? '#041510' : '#000e1a') : 'transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'main'      && renderMain()}
      {activeTab === 'sequences' && renderSequences()}
    </div>
  );
};
