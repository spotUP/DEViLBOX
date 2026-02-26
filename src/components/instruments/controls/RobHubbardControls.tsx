/**
 * RobHubbardControls.tsx — Rob Hubbard instrument editor
 *
 * Exposes all RobHubbardConfig parameters: sample volume, loop, vibrato
 * table, wobble bounds, tuning, and read-only waveform/vibrato preview.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { RobHubbardConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';

interface RobHubbardControlsProps {
  config: RobHubbardConfig;
  onChange: (updates: Partial<RobHubbardConfig>) => void;
}

type RHTab = 'main' | 'vibwave' | 'sample';

export const RobHubbardControls: React.FC<RobHubbardControlsProps> = ({ config, onChange }) => {
  const [activeTab, setActiveTab] = useState<RHTab>('main');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#44aaff';
  const knob    = isCyan ? '#00ffff' : '#66bbff';
  const dim     = isCyan ? '#004444' : '#001833';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#000e1a] border-blue-900/30';

  const upd = useCallback(<K extends keyof RobHubbardConfig>(key: K, value: RobHubbardConfig[K]) => {
    onChange({ [key]: value } as Partial<RobHubbardConfig>);
  }, [onChange]);

  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: accent, opacity: 0.7 }}>
      {label}
    </div>
  );

  const InfoValue: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: accent, opacity: 0.5 }}>
        {label}
      </span>
      <span className="text-[11px] font-mono" style={{ color: accent }}>
        {value}
      </span>
    </div>
  );

  // ── MAIN TAB ──
  const renderMain = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Sample */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Sample" />
        <div className="flex gap-6 items-start flex-wrap">
          <Knob value={config.sampleVolume} min={0} max={64} step={1}
            onChange={(v) => upd('sampleVolume', Math.round(v))}
            label="Volume" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <div className="flex flex-col gap-2">
            <InfoValue
              label="Loop Offset"
              value={config.loopOffset < 0 ? 'No loop' : config.loopOffset.toString()}
            />
            <InfoValue
              label="Sample Length"
              value={`${config.sampleLen} bytes`}
            />
          </div>
        </div>
      </div>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Vibrato" />
        <div className="flex gap-4 items-center">
          <Knob value={config.divider} min={0} max={255} step={1}
            onChange={(v) => upd('divider', Math.round(v))}
            label="Depth Divisor" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoIdx} min={0} max={255} step={1}
            onChange={(v) => upd('vibratoIdx', Math.round(v))}
            label="Start Index" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <span className="text-[10px] text-gray-600">Divisor 0 = disabled</span>
        </div>
      </div>

      {/* Wobble */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Wobble" />
        <div className="flex gap-4 items-center">
          <Knob value={config.hiPos} min={0} max={255} step={1}
            onChange={(v) => upd('hiPos', Math.round(v))}
            label="Upper Bound" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.loPos} min={0} max={255} step={1}
            onChange={(v) => upd('loPos', Math.round(v))}
            label="Lower Bound" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <span className="text-[10px] text-gray-600">Upper 0 = disabled</span>
        </div>
      </div>

      {/* Tuning */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Tuning" />
        <div className="flex gap-4 items-center flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: accent, opacity: 0.5 }}>
              Relative
            </span>
            <input
              type="number"
              value={config.relative}
              min={256}
              max={16383}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) {
                  upd('relative', Math.max(256, Math.min(16383, val)));
                }
              }}
              className="text-[11px] font-mono text-center border rounded py-1 px-2"
              style={{
                width: '72px',
                background: '#060a0f',
                borderColor: dim,
                color: accent,
              }}
            />
          </div>
          <span className="text-[10px] font-mono" style={{ color: accent, opacity: 0.6 }}>
            3579545 / {config.relative} ≈ {Math.round(3579545 / Math.max(1, config.relative))} Hz
          </span>
        </div>
      </div>
    </div>
  );

  // ── VIBWAVE TAB ──
  const renderVibwave = () => {
    const vib = config.vibTable ?? [];
    const hasData = vib.length > 0;
    const preview16 = vib.slice(0, 16);

    const makePoints = () => {
      if (vib.length === 0) return '';
      if (vib.length === 1) return `3,32 253,32`;
      return vib.map((v, i) => {
        const x = (i / (vib.length - 1)) * 250 + 3;
        const y = 32 - (v / 128) * 28;
        return `${x},${y}`;
      }).join(' ');
    };

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Vibrato Wave Table" />
          {hasData ? (
            <>
              <svg width={256} height={64} className="mb-2 rounded"
                style={{ background: '#060a0f', border: `1px solid ${dim}` }}>
                <polyline
                  points={makePoints()}
                  fill="none"
                  stroke={accent}
                  strokeWidth={1.5}
                />
              </svg>
              <div className="text-[10px] font-mono mb-2" style={{ color: accent, opacity: 0.6 }}>
                {vib.length} entries
              </div>
              <div className="grid grid-cols-8 gap-1">
                {preview16.map((v: number, i: number) => (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <span className="text-[8px] font-mono text-gray-600">{i}</span>
                    <span
                      className="text-[10px] font-mono text-center border rounded py-0.5 px-1"
                      style={{
                        background: '#060a0f',
                        borderColor: v !== 0 ? dim : '#1a1a1a',
                        color: v !== 0 ? accent : '#444',
                        minWidth: '34px',
                        display: 'inline-block',
                      }}>
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-[11px] font-mono" style={{ color: '#444' }}>
              No vibrato table data
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── SAMPLE TAB ──
  const renderSample = () => {
    const raw = config.sampleData ?? [];
    const hasData = raw.length > 0;

    // Subsample to max 512 points for performance
    const MAX_POINTS = 512;
    const step = Math.max(1, Math.ceil(raw.length / MAX_POINTS));
    const samples: number[] = [];
    for (let i = 0; i < raw.length; i += step) {
      samples.push(raw[i]);
    }

    const makePoints = () => {
      if (samples.length === 0) return '';
      if (samples.length === 1) return `3,32 253,32`;
      return samples.map((v, i) => {
        const x = (i / (samples.length - 1)) * 250 + 3;
        const y = 32 - (v / 128) * 28;
        return `${x},${y}`;
      }).join(' ');
    };

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Sample Waveform" />
          {hasData ? (
            <>
              <svg width={256} height={64} className="mb-2 rounded"
                style={{ background: '#060a0f', border: `1px solid ${dim}` }}>
                <polyline
                  points={makePoints()}
                  fill="none"
                  stroke={knob}
                  strokeWidth={1}
                />
              </svg>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono" style={{ color: accent, opacity: 0.6 }}>
                  {config.sampleLen} bytes total
                </span>
                <span className="text-[10px] text-gray-600">
                  (read-only — from parsed binary)
                </span>
              </div>
            </>
          ) : (
            <div className="text-[11px] font-mono" style={{ color: '#444' }}>
              No sample data
            </div>
          )}
        </div>
      </div>
    );
  };

  const TABS: Array<[RHTab, string]> = [
    ['main',    'Parameters'],
    ['vibwave', 'Vib Wave'],
    ['sample',  'Sample'],
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b" style={{ borderColor: dim }}>
        {TABS.map(([id, label]) => (
          <button key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accent : '#666',
              borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
              background: activeTab === id ? (isCyan ? '#041510' : '#000e1a') : 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'main'    && renderMain()}
      {activeTab === 'vibwave' && renderVibwave()}
      {activeTab === 'sample'  && renderSample()}
    </div>
  );
};
