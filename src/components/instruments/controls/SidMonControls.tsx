/**
 * SidMonControls.tsx — SidMon II (SID-like synthesis) instrument editor
 *
 * Exposes all SidMonConfig parameters: waveform selector, ADSR, filter,
 * vibrato, and arpeggio table.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { SidMonConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';

interface SidMonControlsProps {
  config: SidMonConfig;
  onChange: (updates: Partial<SidMonConfig>) => void;
}

type SMTab = 'main' | 'filter' | 'arpeggio';

const WAVEFORM_NAMES = ['Triangle', 'Sawtooth', 'Pulse', 'Noise'];
const FILTER_MODE_NAMES = ['LP', 'HP', 'BP'];

export const SidMonControls: React.FC<SidMonControlsProps> = ({ config, onChange }) => {
  const [activeTab, setActiveTab] = useState<SMTab>('main');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#ff66aa';
  const knob    = isCyan ? '#00ffff' : '#ff88bb';
  const dim     = isCyan ? '#004444' : '#330022';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#1a0010] border-pink-900/30';

  const upd = useCallback(<K extends keyof SidMonConfig>(key: K, value: SidMonConfig[K]) => {
    onChange({ [key]: value } as Partial<SidMonConfig>);
  }, [onChange]);

  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: accent, opacity: 0.7 }}>
      {label}
    </div>
  );

  // ── MAIN TAB ──
  const renderMain = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {/* Waveform */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Waveform" />
        <div className="flex gap-2 mb-3">
          {WAVEFORM_NAMES.map((name, i) => (
            <button key={i}
              onClick={() => upd('waveform', i as 0 | 1 | 2 | 3)}
              className="flex-1 py-1.5 text-xs font-mono rounded transition-colors"
              style={{
                background: config.waveform === i ? accent : '#111',
                color: config.waveform === i ? '#000' : '#666',
                border: `1px solid ${config.waveform === i ? accent : '#333'}`,
              }}>
              {name}
            </button>
          ))}
        </div>
        {config.waveform === 2 && (
          <div className="flex items-center gap-4">
            <Knob value={config.pulseWidth} min={0} max={255} step={1}
              onChange={(v) => upd('pulseWidth', Math.round(v))}
              label="Pulse Width" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
        )}
      </div>

      {/* ADSR */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="ADSR (SID format, 0–15)" />
        <div className="flex gap-4">
          <Knob value={config.attack} min={0} max={15} step={1}
            onChange={(v) => upd('attack', Math.round(v))}
            label="Attack" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.decay} min={0} max={15} step={1}
            onChange={(v) => upd('decay', Math.round(v))}
            label="Decay" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.sustain} min={0} max={15} step={1}
            onChange={(v) => upd('sustain', Math.round(v))}
            label="Sustain" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.release} min={0} max={15} step={1}
            onChange={(v) => upd('release', Math.round(v))}
            label="Release" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Vibrato" />
        <div className="flex gap-4">
          <Knob value={config.vibDelay} min={0} max={255} step={1}
            onChange={(v) => upd('vibDelay', Math.round(v))}
            label="Delay" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibSpeed} min={0} max={63} step={1}
            onChange={(v) => upd('vibSpeed', Math.round(v))}
            label="Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibDepth} min={0} max={63} step={1}
            onChange={(v) => upd('vibDepth', Math.round(v))}
            label="Depth" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>
    </div>
  );

  // ── FILTER TAB ──
  const renderFilter = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Filter Mode" />
        <div className="flex gap-2 mb-4">
          {FILTER_MODE_NAMES.map((name, i) => (
            <button key={i}
              onClick={() => upd('filterMode', i)}
              className="flex-1 py-1.5 text-xs font-mono rounded transition-colors"
              style={{
                background: config.filterMode === i ? accent : '#111',
                color: config.filterMode === i ? '#000' : '#666',
                border: `1px solid ${config.filterMode === i ? accent : '#333'}`,
              }}>
              {name}
            </button>
          ))}
        </div>
        <div className="flex gap-4">
          <Knob value={config.filterCutoff} min={0} max={255} step={1}
            onChange={(v) => upd('filterCutoff', Math.round(v))}
            label="Cutoff" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.filterResonance} min={0} max={15} step={1}
            onChange={(v) => upd('filterResonance', Math.round(v))}
            label="Resonance" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>
    </div>
  );

  // ── ARPEGGIO TAB ──
  const renderArpeggio = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Arpeggio" />
        <div className="flex gap-4 mb-3">
          <Knob value={config.arpSpeed} min={0} max={15} step={1}
            onChange={(v) => upd('arpSpeed', Math.round(v))}
            label="Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
        <div className="grid grid-cols-4 gap-1">
          {config.arpTable.map((v, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono text-gray-600 w-4">{i}</span>
              <input
                type="number"
                value={v}
                min={-64}
                max={63}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) {
                    const arr = [...configRef.current.arpTable];
                    arr[i] = Math.max(-64, Math.min(63, val));
                    upd('arpTable', arr);
                  }
                }}
                className="text-[10px] font-mono text-center border rounded py-0.5"
                style={{
                  width: '48px',
                  background: '#080006',
                  borderColor: v !== 0 ? dim : '#1a1a1a',
                  color: v !== 0 ? accent : '#444',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const TABS: { id: SMTab; label: string }[] = [
    { id: 'main',     label: 'Main' },
    { id: 'filter',   label: 'Filter' },
    { id: 'arpeggio', label: 'Arpeggio' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b" style={{ borderColor: dim }}>
        {TABS.map(({ id, label }) => (
          <button key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accent : '#666',
              borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
              background: activeTab === id ? (isCyan ? '#041510' : '#1a0010') : 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'main'     && renderMain()}
      {activeTab === 'filter'   && renderFilter()}
      {activeTab === 'arpeggio' && renderArpeggio()}
    </div>
  );
};
