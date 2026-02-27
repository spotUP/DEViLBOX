/**
 * SidMon1Controls.tsx — SidMon 1 instrument editor
 *
 * Exposes all SidMon1Config parameters: ADSR envelope speeds/levels,
 * phase oscillator, tuning, arpeggio table, and waveform data.
 *
 * Enhanced with SequenceEditor for arpeggio and waveform tables.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { SidMon1Config } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import { SequenceEditor } from '@components/instruments/shared';
import type { SequencePreset } from '@components/instruments/shared';

interface SidMon1ControlsProps {
  config: SidMon1Config;
  onChange: (updates: Partial<SidMon1Config>) => void;
}

type SM1Tab = 'main' | 'arpeggio' | 'waveform';

// ── Presets ────────────────────────────────────────────────────────────────────

const ARP_PRESETS: SequencePreset[] = [
  { name: 'Major',  data: [0, 4, 7, 0, 4, 7, 12, 12, 0, 4, 7, 0, 4, 7, 12, 12], loop: 0 },
  { name: 'Minor',  data: [0, 3, 7, 0, 3, 7, 12, 12, 0, 3, 7, 0, 3, 7, 12, 12], loop: 0 },
  { name: 'Octave', data: [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12], loop: 0 },
  { name: 'Clear',  data: new Array(16).fill(0) },
];

const WAVE_PRESETS: SequencePreset[] = [
  {
    name: 'Sine',
    data: Array.from({ length: 32 }, (_, i) => Math.round(Math.sin((i / 32) * Math.PI * 2) * 100)),
  },
  {
    name: 'Saw',
    data: Array.from({ length: 32 }, (_, i) => Math.round(((i / 31) * 2 - 1) * 100)),
  },
  {
    name: 'Square',
    data: Array.from({ length: 32 }, (_, i) => (i < 16 ? 100 : -100)),
  },
  {
    name: 'Triangle',
    data: Array.from({ length: 32 }, (_, i) =>
      i < 16 ? Math.round((i / 15) * 2 - 1) * 100 : Math.round((1 - ((i - 16) / 15)) * 2 - 1) * 100
    ),
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

export const SidMon1Controls: React.FC<SidMon1ControlsProps> = ({ config, onChange }) => {
  const [activeTab, setActiveTab] = useState<SM1Tab>('main');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#44aaff';
  const knob    = isCyan ? '#00ffff' : '#66bbff';
  const dim     = isCyan ? '#004444' : '#001833';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#000e1a] border-blue-900/30';

  const upd = useCallback(<K extends keyof SidMon1Config>(key: K, value: SidMon1Config[K]) => {
    onChange({ [key]: value } as Partial<SidMon1Config>);
  }, [onChange]);

  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: accent, opacity: 0.7 }}>
      {label}
    </div>
  );

  // ── MAIN TAB ──────────────────────────────────────────────────────────────
  const renderMain = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* ADSR Envelope */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="ADSR Envelope" />
        <div className="grid grid-cols-4 gap-3">
          <Knob value={config.attackSpeed ?? 0} min={0} max={255} step={1}
            onChange={(v) => upd('attackSpeed', Math.round(v))}
            label="Atk Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.attackMax ?? 0} min={0} max={64} step={1}
            onChange={(v) => upd('attackMax', Math.round(v))}
            label="Atk Max" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.decaySpeed ?? 0} min={0} max={255} step={1}
            onChange={(v) => upd('decaySpeed', Math.round(v))}
            label="Dec Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.decayMin ?? 0} min={0} max={64} step={1}
            onChange={(v) => upd('decayMin', Math.round(v))}
            label="Dec Min" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.sustain ?? 0} min={0} max={255} step={1}
            onChange={(v) => upd('sustain', Math.round(v))}
            label="Sustain" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.releaseSpeed ?? 0} min={0} max={255} step={1}
            onChange={(v) => upd('releaseSpeed', Math.round(v))}
            label="Rel Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.releaseMin ?? 0} min={0} max={64} step={1}
            onChange={(v) => upd('releaseMin', Math.round(v))}
            label="Rel Min" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Phase Oscillator */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Phase Oscillator" />
        <div className="flex gap-4 items-center">
          <Knob value={config.phaseShift ?? 0} min={0} max={255} step={1}
            onChange={(v) => upd('phaseShift', Math.round(v))}
            label="Phase Shift" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.phaseSpeed ?? 0} min={0} max={255} step={1}
            onChange={(v) => upd('phaseSpeed', Math.round(v))}
            label="Phase Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <span className="text-[10px] text-gray-600">Phase Shift 0 = disabled</span>
        </div>
      </div>

      {/* Tuning */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Tuning" />
        <div className="flex gap-4 items-center">
          <Knob value={config.finetune ?? 0} min={0} max={1005} step={67}
            onChange={(v) => {
              const steps = Math.round(v / 67);
              upd('finetune', steps * 67);
            }}
            label="Finetune" color={knob} size="sm"
            formatValue={(v) => `${Math.round(v / 67)}/15`} />
          <Knob value={config.pitchFall ?? 0} min={-128} max={127} step={1}
            onChange={(v) => upd('pitchFall', Math.round(v))}
            label="Pitch Fall" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>
    </div>
  );

  // ── ARPEGGIO TAB ──────────────────────────────────────────────────────────
  const renderArpeggio = () => {
    const arp = config.arpeggio ?? new Array(16).fill(0);
    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Arpeggio (16 steps)" />
          <SequenceEditor
            label="Arpeggio"
            data={arp}
            onChange={(d) => upd('arpeggio', d)}
            min={0} max={255}
            fixedLength
            presets={ARP_PRESETS}
            color={accent}
            height={80}
            cellFormat="hex"
            showCells
          />
        </div>
      </div>
    );
  };

  // ── WAVEFORM TAB ──────────────────────────────────────────────────────────
  const renderWaveform = () => {
    const mainWave  = config.mainWave  ?? new Array(32).fill(0);
    const phaseWave = config.phaseWave ?? new Array(32).fill(0);

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

        {/* Main Wave */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Main Wave (32 bytes)" />
          <SequenceEditor
            label="Main Wave"
            data={mainWave}
            onChange={(d) => upd('mainWave', d)}
            min={-128} max={127}
            bipolar
            fixedLength
            presets={WAVE_PRESETS}
            color={accent}
            height={80}
          />
        </div>

        {/* Phase Wave */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Phase Wave (32 bytes)" />
          <SequenceEditor
            label="Phase Wave"
            data={phaseWave}
            onChange={(d) => upd('phaseWave', d)}
            min={-128} max={127}
            bipolar
            fixedLength
            presets={WAVE_PRESETS}
            color={knob}
            height={80}
          />
        </div>
      </div>
    );
  };

  const TABS: Array<[SM1Tab, string]> = [
    ['main',     'Parameters'],
    ['arpeggio', 'Arpeggio'],
    ['waveform', 'Waveform'],
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
      {activeTab === 'main'     && renderMain()}
      {activeTab === 'arpeggio' && renderArpeggio()}
      {activeTab === 'waveform' && renderWaveform()}
    </div>
  );
};
