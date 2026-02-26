/**
 * FCControls.tsx — Future Composer 1.3/1.4 instrument editor
 *
 * Exposes all FCConfig parameters: waveform selector, synth macro table,
 * ADSR envelope, vibrato, and arpeggio table.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { FCConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';

interface FCControlsProps {
  config: FCConfig;
  onChange: (updates: Partial<FCConfig>) => void;
}

type FCTab = 'envelope' | 'synth' | 'arpeggio';

// FC waveform names (0-46). Groups: 0-3 basic, 4-46 composite.
const FC_WAVE_NAMES: Record<number, string> = {
  0: 'Sawtooth', 1: 'Square', 2: 'Triangle', 3: 'Noise',
  4: 'Saw+Sq', 5: 'Saw+Tri', 6: 'Sq+Tri', 7: 'Pulse 1', 8: 'Pulse 2',
  9: 'Pulse 3', 10: 'Pulse 4', 11: 'Pulse 5',
};

function waveLabel(n: number): string {
  return FC_WAVE_NAMES[n] ?? `Wave ${n}`;
}

export const FCControls: React.FC<FCControlsProps> = ({ config, onChange }) => {
  const [activeTab, setActiveTab] = useState<FCTab>('envelope');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#ffdd44';
  const knob    = isCyan ? '#00ffff' : '#ffee77';
  const dim     = isCyan ? '#004444' : '#332a00';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#1a1500] border-yellow-900/30';

  const upd = useCallback(<K extends keyof FCConfig>(key: K, value: FCConfig[K]) => {
    onChange({ [key]: value } as Partial<FCConfig>);
  }, [onChange]);

  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: accent, opacity: 0.7 }}>
      {label}
    </div>
  );

  // ── ENVELOPE TAB ──
  const renderEnvelope = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {/* Initial waveform */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Base Waveform" />
        <div className="flex items-center gap-3">
          <select
            value={config.waveNumber}
            onChange={(e) => upd('waveNumber', parseInt(e.target.value))}
            className="text-xs font-mono border rounded px-2 py-1.5"
            style={{ background: '#100d00', borderColor: dim, color: accent }}>
            {Array.from({ length: 47 }, (_, i) => (
              <option key={i} value={i} style={{ background: '#111', color: '#ccc' }}>
                {i}: {waveLabel(i)}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-gray-500">Initial waveform (overridden by synth macro)</span>
        </div>
      </div>

      {/* ADSR */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Volume Envelope" />
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.atkLength} min={0} max={255} step={1}
              onChange={(v) => upd('atkLength', Math.round(v))}
              label="Atk Len" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.atkVolume} min={0} max={64} step={1}
              onChange={(v) => upd('atkVolume', Math.round(v))}
              label="Atk Vol" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.decLength} min={0} max={255} step={1}
              onChange={(v) => upd('decLength', Math.round(v))}
              label="Dec Len" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.decVolume} min={0} max={64} step={1}
              onChange={(v) => upd('decVolume', Math.round(v))}
              label="Dec Vol" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.relLength} min={0} max={255} step={1}
              onChange={(v) => upd('relLength', Math.round(v))}
              label="Rel Len" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.sustVolume} min={0} max={64} step={1}
              onChange={(v) => upd('sustVolume', Math.round(v))}
              label="Sus Vol" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
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

  // ── SYNTH MACRO TAB ──
  const renderSynth = () => {
    const updateStep = (i: number, field: 'waveNum' | 'transposition' | 'effect', value: number) => {
      const table = configRef.current.synthTable.map((s, idx) =>
        idx === i ? { ...s, [field]: value } : s
      );
      onChange({ synthTable: table });
    };

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Synth Macro Sequencer" />
          <div className="flex items-center gap-4 mb-3">
            <Knob value={config.synthSpeed} min={0} max={15} step={1}
              onChange={(v) => upd('synthSpeed', Math.round(v))}
              label="Speed" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <span className="text-[10px] text-gray-500">Ticks per macro step (0 = disabled)</span>
          </div>

          {/* Macro step grid */}
          <div className="flex font-mono text-[10px] text-gray-500 px-1 border-b mb-1"
            style={{ borderColor: dim }}>
            <span className="w-6 text-center">#</span>
            <span className="w-28 text-center">Waveform</span>
            <span className="w-12 text-center">Trans</span>
            <span className="w-12 text-center">FX</span>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: '260px' }}>
            {config.synthTable.map((step, i) => (
              <div key={i} className="flex items-center gap-1 py-0.5 font-mono">
                <span className="w-6 text-center text-[10px] text-gray-600">
                  {i.toString().padStart(2, '0')}
                </span>
                <select
                  value={step.waveNum}
                  onChange={(e) => updateStep(i, 'waveNum', parseInt(e.target.value))}
                  className="text-[10px] font-mono border rounded px-1"
                  style={{ width: '108px', background: '#100d00', borderColor: dim, color: accent }}>
                  {Array.from({ length: 47 }, (_, n) => (
                    <option key={n} value={n} style={{ background: '#111', color: '#ccc' }}>
                      {n}: {waveLabel(n)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={step.transposition}
                  min={-64}
                  max={63}
                  onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateStep(i, 'transposition', Math.max(-64, Math.min(63, v))); }}
                  className="text-[10px] font-mono text-center border rounded py-0.5"
                  style={{ width: '44px', background: '#100d00', borderColor: dim, color: step.transposition !== 0 ? '#ffcc44' : '#444' }}
                />
                <input
                  type="number"
                  value={step.effect}
                  min={0}
                  max={15}
                  onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateStep(i, 'effect', Math.max(0, Math.min(15, v))); }}
                  className="text-[10px] font-mono text-center border rounded py-0.5"
                  style={{ width: '40px', background: '#100d00', borderColor: dim, color: step.effect !== 0 ? '#ff8844' : '#444' }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ── ARPEGGIO TAB ──
  const renderArpeggio = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Arpeggio Table (semitone offsets)" />
        <div className="grid grid-cols-8 gap-1">
          {config.arpTable.map((v, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] font-mono text-gray-600">
                {i.toString().padStart(2, '0')}
              </span>
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
                  width: '36px',
                  background: '#0e0c00',
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

  const TABS: { id: FCTab; label: string }[] = [
    { id: 'envelope', label: 'Envelope' },
    { id: 'synth',    label: 'Synth Macro' },
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
              background: activeTab === id ? (isCyan ? '#041510' : '#1a1500') : 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'envelope' && renderEnvelope()}
      {activeTab === 'synth'    && renderSynth()}
      {activeTab === 'arpeggio' && renderArpeggio()}
    </div>
  );
};
