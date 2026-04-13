/**
 * SymphonieControls.tsx — Symphonie Pro instrument editor
 *
 * Exposes per-instrument SymphonieConfig parameters: volume, tuning,
 * loop settings, DSP bypass, and multichannel routing.
 *
 * Symphonie Pro uses libopenmpt for audio playback; these controls edit
 * the instrument metadata displayed in the UI.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { SymphonieConfig } from '@/types/instrument/exotic';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { SectionLabel } from '@components/instruments/shared';
import { CustomSelect } from '@components/common/CustomSelect';
import { SymphonieEngine } from '@/engine/symphonie/SymphonieEngine';

// ── Instrument type labels ─────────────────────────────────────────────────

const INST_TYPES: Record<number, string> = {
  0:  'Normal (one-shot)',
  4:  'Loop',
  8:  'Sustain',
  [-4 & 0xFF]: 'Kill',     // -4 stored as number
  [-8 & 0xFF]: 'Silent',   // -8 stored as number
};

function getTypeLabel(type: number): string {
  if (type === -4 || type === 252) return 'Kill';
  if (type === -8 || type === 248) return 'Silent';
  return INST_TYPES[type] ?? `Type ${type}`;
}

const MULTI_CHANNEL_LABELS: Record<number, string> = {
  0: 'Mono',
  1: 'Stereo L',
  2: 'Stereo R',
  3: 'Line Source',
};

// ── Tab type ────────────────────────────────────────────────────────────────

type SymphonieTab = 'general' | 'loop' | 'routing';

// ── Props ───────────────────────────────────────────────────────────────────

interface SymphonieControlsProps {
  config: SymphonieConfig;
  onChange: (updates: Partial<SymphonieConfig>) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export const SymphonieControls: React.FC<SymphonieControlsProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<SymphonieTab>('general');

  // configRef pattern: prevents stale closures in callbacks
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors('#bb88ff', { knob: '#cc99ff', dim: '#1a0033' });

  const upd = useCallback(<K extends keyof SymphonieConfig>(key: K, value: SymphonieConfig[K]) => {
    onChange({ [key]: value } as Partial<SymphonieConfig>);

    // Push numeric values to the running WASM engine
    if (typeof value === 'number' && SymphonieEngine.hasInstance()) {
      SymphonieEngine.getInstance().setInstrumentParam(0, key, value);
    }
  }, [onChange]);

  // ── GENERAL TAB ──────────────────────────────────────────────────────────

  const renderGeneral = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Type indicator */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Instrument Type" />
        <div className="flex items-center gap-3">
          <CustomSelect
            value={String(config.type)}
            onChange={(v) => upd('type', parseInt(v, 10))}
            options={[
              { value: '0', label: 'Normal (one-shot)' },
              { value: '4', label: 'Loop' },
              { value: '8', label: 'Sustain' },
              { value: '-4', label: 'Kill' },
              { value: '-8', label: 'Silent' },
            ]}
            className="text-xs px-2 py-1 rounded bg-black/30 border border-white/10 outline-none"
            style={{ color: accent }}
          />
          <span className="text-[10px] text-text-muted">{getTypeLabel(config.type)}</span>
        </div>
      </div>

      {/* Volume */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Volume" />
        <div className="flex items-center gap-4">
          <Knob
            value={config.volume} min={0} max={100} step={1}
            onChange={(v) => upd('volume', Math.round(v))}
            label="Volume" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()}
          />
          <span className="text-[10px] text-text-muted">0-100 (Symphonie scale)</span>
        </div>
      </div>

      {/* Tuning */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Tuning" />
        <div className="flex gap-4">
          <Knob
            value={config.tune} min={-48} max={48} step={1}
            onChange={(v) => upd('tune', Math.round(v))}
            label="Tune" color={knob} size="md"
            formatValue={(v) => {
              const r = Math.round(v);
              return r > 0 ? `+${r}` : `${r}`;
            }}
          />
          <Knob
            value={config.fineTune} min={-128} max={127} step={1}
            onChange={(v) => upd('fineTune', Math.round(v))}
            label="Fine Tune" color={knob} size="md"
            formatValue={(v) => {
              const r = Math.round(v);
              return r > 0 ? `+${r}` : `${r}`;
            }}
          />
        </div>
        <div className="text-[10px] text-text-muted mt-1">
          Tune: semitone offset. Fine Tune: sub-semitone adjustment.
        </div>
      </div>

      {/* Sample Rate */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Sample Rate" />
        <div className="flex items-center gap-4">
          <Knob
            value={config.sampledFrequency} min={4000} max={48000} step={1}
            onChange={(v) => upd('sampledFrequency', Math.round(v))}
            label="Rate" color={knob} size="md"
            formatValue={(v) => `${Math.round(v)} Hz`}
          />
          <span className="text-[10px] text-text-muted">Original sample rate (0 = 8363 Hz default)</span>
        </div>
      </div>
    </div>
  );

  // ── LOOP TAB ──────────────────────────────────────────────────────────────

  const renderLoop = () => {
    const loopPct = config.loopStart / (100 * 65536) * 100;
    const lenPct  = config.loopLen  / (100 * 65536) * 100;

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <SectionLabel color={accent} label="Loop Settings" />

          {/* Loop visual bar */}
          <div className="relative h-6 rounded bg-black/40 mb-3 overflow-hidden">
            <div
              className="absolute h-full rounded opacity-40"
              style={{
                left: `${loopPct}%`,
                width: `${Math.min(lenPct, 100 - loopPct)}%`,
                background: accent,
              }}
            />
            <span className="absolute text-[9px] left-1 top-1 text-text-muted">
              Start: {loopPct.toFixed(1)}% | Len: {lenPct.toFixed(1)}%
            </span>
          </div>

          <div className="flex gap-4 mb-3">
            <Knob
              value={loopPct} min={0} max={100} step={0.1}
              onChange={(v) => upd('loopStart', Math.round(v / 100 * 100 * 65536))}
              label="Start %" color={knob} size="md"
              formatValue={(v) => `${v.toFixed(1)}%`}
            />
            <Knob
              value={lenPct} min={0} max={100} step={0.1}
              onChange={(v) => upd('loopLen', Math.round(v / 100 * 100 * 65536))}
              label="Length %" color={knob} size="md"
              formatValue={(v) => `${v.toFixed(1)}%`}
            />
          </div>

          <div className="flex gap-4 mb-3">
            <Knob
              value={config.numLoops} min={0} max={255} step={1}
              onChange={(v) => upd('numLoops', Math.round(v))}
              label="Repeats" color={knob}
              formatValue={(v) => Math.round(v) === 0 ? 'Inf' : Math.round(v).toString()}
            />
          </div>

          <div className="flex items-center gap-3 mt-2">
            <label className="flex items-center gap-2 text-[11px] cursor-pointer" style={{ color: accent }}>
              <input
                type="checkbox"
                checked={config.newLoopSystem}
                onChange={(e) => upd('newLoopSystem', e.target.checked)}
                className="rounded"
              />
              New Loop System
            </label>
          </div>

          <div className="text-[10px] text-text-muted mt-2">
            Loop start/length as percentages of sample length. Repeats 0 = infinite loop.
          </div>
        </div>
      </div>
    );
  };

  // ── ROUTING TAB ──────────────────────────────────────────────────────────

  const renderRouting = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Multi-Channel */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Channel Routing" />
        <div className="flex items-center gap-3">
          <CustomSelect
            value={String(config.multiChannel)}
            onChange={(v) => upd('multiChannel', parseInt(v, 10))}
            options={[
              { value: '0', label: 'Mono' },
              { value: '1', label: 'Stereo L' },
              { value: '2', label: 'Stereo R' },
              { value: '3', label: 'Line Source' },
            ]}
            className="text-xs px-2 py-1 rounded bg-black/30 border border-white/10 outline-none"
            style={{ color: accent }}
          />
          <span className="text-[10px] text-text-muted">
            {MULTI_CHANNEL_LABELS[config.multiChannel] ?? 'Unknown'}
          </span>
        </div>
      </div>

      {/* DSP Bypass */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="DSP Processing" />
        <label className="flex items-center gap-2 text-[11px] cursor-pointer" style={{ color: accent }}>
          <input
            type="checkbox"
            checked={config.noDsp}
            onChange={(e) => upd('noDsp', e.target.checked)}
            className="rounded"
          />
          Bypass DSP (no echo/delay)
        </label>
        <div className="text-[10px] text-text-muted mt-2">
          When enabled, this instrument bypasses the Symphonie DSP ring buffer effects
          (echo, delay, creative echo, creative delay).
        </div>
      </div>
    </div>
  );

  // ── TABS ──────────────────────────────────────────────────────────────────

  const tabs: Array<[SymphonieTab, string]> = [
    ['general', 'General'],
    ['loop',    'Loop'],
    ['routing', 'Routing'],
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b overflow-x-auto" style={{ borderColor: dim }}>
        {tabs.map(([id, label]) => (
          <button key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
            style={{
              color: activeTab === id ? accent : '#666',
              borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
              background: activeTab === id ? (isCyan ? '#041510' : '#120820') : 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && renderGeneral()}
      {activeTab === 'loop'    && renderLoop()}
      {activeTab === 'routing' && renderRouting()}
    </div>
  );
};
