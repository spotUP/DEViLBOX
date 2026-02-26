/**
 * DavidWhittakerControls.tsx — David Whittaker instrument editor
 *
 * Exposes all DavidWhittakerConfig parameters: volume, relative tuning,
 * vibrato, and editable volume/frequency sequences with mini SVG visualizations.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { DavidWhittakerConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';

interface DavidWhittakerControlsProps {
  config: DavidWhittakerConfig;
  onChange: (updates: Partial<DavidWhittakerConfig>) => void;
}

type DWTab = 'main' | 'sequences';

// ── Mini SVG: bar chart for volseq ─────────────────────────────────────────
const VolseqBars: React.FC<{ data: number[]; accent: string }> = ({ data, accent }) => {
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
        const barH = (vol / 64) * (H - 2);
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

// ── Mini SVG: step plot for frqseq (semitone offsets) ──────────────────────
const FrqseqPlot: React.FC<{ data: number[]; accent: string }> = ({ data, accent }) => {
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

export const DavidWhittakerControls: React.FC<DavidWhittakerControlsProps> = ({ config, onChange }) => {
  const [activeTab, setActiveTab] = useState<DWTab>('main');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#44aaff';
  const knob    = isCyan ? '#00ffff' : '#66bbff';
  const dim     = isCyan ? '#004444' : '#001833';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#000e1a] border-blue-900/30';

  const upd = useCallback(<K extends keyof DavidWhittakerConfig>(key: K, value: DavidWhittakerConfig[K]) => {
    onChange({ [key]: value } as Partial<DavidWhittakerConfig>);
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
    seqKey: 'volseq' | 'frqseq',
    arr: number[],
    minVal: number,
    maxVal: number,
  ) => (
    <div className="grid grid-cols-8 gap-1">
      {arr.map((v, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] font-mono text-gray-600">
            {i.toString().padStart(2, '0')}
          </span>
          <input
            type="number"
            value={v}
            min={minVal}
            max={maxVal}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val)) {
                const arr2 = [...(configRef.current[seqKey] ?? [])];
                arr2[i] = Math.max(minVal, Math.min(maxVal, val));
                upd(seqKey, arr2);
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
      ))}
    </div>
  );

  // ── MAIN TAB ──────────────────────────────────────────────────────────────
  const renderMain = () => {
    const relVal = config.relative ?? 8364;
    const approxHz = Math.round(3579545 / relVal);

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {/* Volume & Tuning */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Volume &amp; Tuning" />
          <div className="flex items-start gap-6">
            <Knob
              value={config.defaultVolume ?? 64}
              min={0}
              max={64}
              step={1}
              onChange={(v) => upd('defaultVolume', Math.round(v))}
              label="Volume"
              color={knob}
              size="sm"
              formatValue={(v) => Math.round(v).toString()}
            />
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent, opacity: 0.7 }}>
                Relative
              </label>
              <input
                type="number"
                value={relVal}
                min={256}
                max={65535}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) upd('relative', Math.max(256, Math.min(65535, val)));
                }}
                className="text-[11px] font-mono border rounded px-2 py-1"
                style={{
                  width: '80px',
                  background: '#060a0f',
                  borderColor: dim,
                  color: accent,
                }}
              />
              <span className="text-[10px] text-gray-500">
                3579545 / value ≈ {approxHz} Hz
              </span>
            </div>
          </div>
        </div>

        {/* Vibrato */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Vibrato" />
          <div className="flex gap-4">
            <Knob
              value={config.vibratoSpeed ?? 0}
              min={0}
              max={255}
              step={1}
              onChange={(v) => upd('vibratoSpeed', Math.round(v))}
              label="Speed"
              color={knob}
              size="sm"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={config.vibratoDepth ?? 0}
              min={0}
              max={255}
              step={1}
              onChange={(v) => upd('vibratoDepth', Math.round(v))}
              label="Depth"
              color={knob}
              size="sm"
              formatValue={(v) => Math.round(v).toString()}
            />
          </div>
        </div>
      </div>
    );
  };

  // ── SEQUENCES TAB ─────────────────────────────────────────────────────────
  const renderSequences = () => {
    const volseq = config.volseq ?? [];
    const frqseq = config.frqseq ?? [];

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {/* Volume Sequence */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Volume Sequence (volseq)" />
          <VolseqBars data={volseq} accent={accent} />
          {renderSeqGrid('volseq', volseq, -128, 64)}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => upd('volseq', [...(configRef.current.volseq ?? []), 0])}
              className="px-2 py-1 text-[10px] font-mono rounded border transition-colors"
              style={{ borderColor: dim, color: accent, background: '#060a0f' }}
            >
              + Add step
            </button>
            <button
              onClick={() => {
                const arr = configRef.current.volseq ?? [];
                if (arr.length > 1) upd('volseq', arr.slice(0, -1));
              }}
              className="px-2 py-1 text-[10px] font-mono rounded border transition-colors"
              style={{ borderColor: '#333', color: '#666', background: '#060a0f' }}
            >
              – Remove last
            </button>
          </div>
          <p className="text-[9px] text-gray-600 mt-1">
            0–64 = volume level; -128 = loop marker (next byte = loop target)
          </p>
        </div>

        {/* Frequency Sequence */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Frequency Sequence (frqseq)" />
          <FrqseqPlot data={frqseq} accent={accent} />
          {renderSeqGrid('frqseq', frqseq, -128, 127)}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => upd('frqseq', [...(configRef.current.frqseq ?? []), 0])}
              className="px-2 py-1 text-[10px] font-mono rounded border transition-colors"
              style={{ borderColor: dim, color: accent, background: '#060a0f' }}
            >
              + Add step
            </button>
            <button
              onClick={() => {
                const arr = configRef.current.frqseq ?? [];
                if (arr.length > 1) upd('frqseq', arr.slice(0, -1));
              }}
              className="px-2 py-1 text-[10px] font-mono rounded border transition-colors"
              style={{ borderColor: '#333', color: '#666', background: '#060a0f' }}
            >
              – Remove last
            </button>
          </div>
          <p className="text-[9px] text-gray-600 mt-1">
            Values = semitone offsets from note; -128 = loop marker
          </p>
        </div>
      </div>
    );
  };

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
