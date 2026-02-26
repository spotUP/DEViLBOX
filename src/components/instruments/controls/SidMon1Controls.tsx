/**
 * SidMon1Controls.tsx — SidMon 1 instrument editor
 *
 * Exposes all SidMon1Config parameters: ADSR envelope speeds/levels,
 * phase oscillator, tuning, arpeggio table, and waveform data.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { SidMon1Config } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';

interface SidMon1ControlsProps {
  config: SidMon1Config;
  onChange: (updates: Partial<SidMon1Config>) => void;
}

type SM1Tab = 'main' | 'arpeggio' | 'waveform';

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

  // ── MAIN TAB ──
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

  // ── ARPEGGIO TAB ──
  const renderArpeggio = () => {
    const arp = config.arpeggio ?? new Array(16).fill(0);
    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Arpeggio (16 steps)" />
          <div className="grid grid-cols-4 gap-2">
            {arp.map((v: number, i: number) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] font-mono text-gray-600">
                  {i.toString(16).toUpperCase().padStart(2, '0')}
                </span>
                <input
                  type="number"
                  value={v}
                  min={0}
                  max={255}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) {
                      const arr = [...(configRef.current.arpeggio ?? new Array(16).fill(0))];
                      arr[i] = Math.max(0, Math.min(255, val));
                      onChange({ arpeggio: arr });
                    }
                  }}
                  className="text-[10px] font-mono text-center border rounded py-0.5"
                  style={{
                    width: '48px',
                    background: '#060a0f',
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
  };

  // ── WAVEFORM TAB ──
  const renderWaveform = () => {
    const mainWave  = config.mainWave  ?? new Array(32).fill(0);
    const phaseWave = config.phaseWave ?? new Array(32).fill(0);

    const makePoints = (wave: number[]) =>
      wave.map((v, i) => {
        const x = (i / 31) * 250 + 3;
        const y = 32 - (v / 128) * 28;
        return `${x},${y}`;
      }).join(' ');

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

        {/* Main Wave */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Main Wave (32 bytes)" />
          <svg width={256} height={64} className="mb-2 rounded"
            style={{ background: '#060a0f', border: `1px solid ${dim}` }}>
            <polyline
              points={makePoints(mainWave)}
              fill="none"
              stroke={accent}
              strokeWidth={1.5}
            />
          </svg>
          <div className="grid grid-cols-8 gap-1">
            {mainWave.map((v: number, i: number) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <span className="text-[8px] font-mono text-gray-600">{i}</span>
                <input
                  type="number"
                  value={v}
                  min={-128}
                  max={127}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) {
                      const arr = [...(configRef.current.mainWave ?? new Array(32).fill(0))];
                      arr[i] = Math.max(-128, Math.min(127, val));
                      onChange({ mainWave: arr });
                    }
                  }}
                  className="text-[10px] font-mono text-center border rounded py-0.5"
                  style={{
                    width: '34px',
                    background: '#060a0f',
                    borderColor: v !== 0 ? dim : '#1a1a1a',
                    color: v !== 0 ? accent : '#444',
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Phase Wave */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Phase Wave (32 bytes)" />
          <svg width={256} height={64} className="mb-2 rounded"
            style={{ background: '#060a0f', border: `1px solid ${dim}` }}>
            <polyline
              points={makePoints(phaseWave)}
              fill="none"
              stroke={knob}
              strokeWidth={1.5}
            />
          </svg>
          <div className="grid grid-cols-8 gap-1">
            {phaseWave.map((v: number, i: number) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <span className="text-[8px] font-mono text-gray-600">{i}</span>
                <input
                  type="number"
                  value={v}
                  min={-128}
                  max={127}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) {
                      const arr = [...(configRef.current.phaseWave ?? new Array(32).fill(0))];
                      arr[i] = Math.max(-128, Math.min(127, val));
                      onChange({ phaseWave: arr });
                    }
                  }}
                  className="text-[10px] font-mono text-center border rounded py-0.5"
                  style={{
                    width: '34px',
                    background: '#060a0f',
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
