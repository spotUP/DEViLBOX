/**
 * SoundMonControls.tsx — SoundMon II (Brian Postma) instrument editor
 *
 * Exposes all SoundMonConfig parameters: waveform type, ADSR volumes/speeds,
 * vibrato, arpeggio table, and portamento.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { SoundMonConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';

interface SoundMonControlsProps {
  config: SoundMonConfig;
  onChange: (updates: Partial<SoundMonConfig>) => void;
}

type SMTab = 'main' | 'arpeggio';

const WAVE_TYPE_NAMES = [
  'Square', 'Sawtooth', 'Triangle', 'Noise',
  'Pulse 1', 'Pulse 2', 'Pulse 3', 'Pulse 4',
  'Blend 1', 'Blend 2', 'Blend 3', 'Blend 4',
  'Ring 1', 'Ring 2', 'FM 1', 'FM 2',
];

export const SoundMonControls: React.FC<SoundMonControlsProps> = ({ config, onChange }) => {
  const [activeTab, setActiveTab] = useState<SMTab>('main');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#44aaff';
  const knob    = isCyan ? '#00ffff' : '#66bbff';
  const dim     = isCyan ? '#004444' : '#001833';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#000e1a] border-blue-900/30';

  const upd = useCallback(<K extends keyof SoundMonConfig>(key: K, value: SoundMonConfig[K]) => {
    onChange({ [key]: value } as Partial<SoundMonConfig>);
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
      {/* Waveform selector */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Waveform" />
        <div className="grid grid-cols-4 gap-1 mb-2">
          {WAVE_TYPE_NAMES.map((name, i) => (
            <button key={i}
              onClick={() => upd('waveType', i)}
              className="px-1.5 py-1 text-[10px] font-mono rounded transition-colors truncate"
              style={{
                background: config.waveType === i ? accent : '#111',
                color: config.waveType === i ? '#000' : '#666',
                border: `1px solid ${config.waveType === i ? accent : '#333'}`,
              }}>
              {name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-2">
          <Knob value={config.waveSpeed} min={0} max={15} step={1}
            onChange={(v) => upd('waveSpeed', Math.round(v))}
            label="Morph Rate" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* ADSR Volumes */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Volume Envelope" />
        <div className="grid grid-cols-4 gap-3">
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.attackVolume} min={0} max={64} step={1}
              onChange={(v) => upd('attackVolume', Math.round(v))}
              label="Atk Vol" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.attackSpeed} min={0} max={63} step={1}
              onChange={(v) => upd('attackSpeed', Math.round(v))}
              label="Atk Spd" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.decayVolume} min={0} max={64} step={1}
              onChange={(v) => upd('decayVolume', Math.round(v))}
              label="Dec Vol" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.decaySpeed} min={0} max={63} step={1}
              onChange={(v) => upd('decaySpeed', Math.round(v))}
              label="Dec Spd" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.sustainVolume} min={0} max={64} step={1}
              onChange={(v) => upd('sustainVolume', Math.round(v))}
              label="Sus Vol" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.sustainLength} min={0} max={255} step={1}
              onChange={(v) => upd('sustainLength', Math.round(v))}
              label="Sus Len" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.releaseVolume} min={0} max={64} step={1}
              onChange={(v) => upd('releaseVolume', Math.round(v))}
              label="Rel Vol" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.releaseSpeed} min={0} max={63} step={1}
              onChange={(v) => upd('releaseSpeed', Math.round(v))}
              label="Rel Spd" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
        </div>
      </div>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Vibrato" />
        <div className="flex gap-4">
          <Knob value={config.vibratoDelay} min={0} max={255} step={1}
            onChange={(v) => upd('vibratoDelay', Math.round(v))}
            label="Delay" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoSpeed} min={0} max={63} step={1}
            onChange={(v) => upd('vibratoSpeed', Math.round(v))}
            label="Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoDepth} min={0} max={63} step={1}
            onChange={(v) => upd('vibratoDepth', Math.round(v))}
            label="Depth" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Portamento */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Portamento" />
        <div className="flex items-center gap-4">
          <Knob value={config.portamentoSpeed} min={0} max={63} step={1}
            onChange={(v) => upd('portamentoSpeed', Math.round(v))}
            label="Speed" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <span className="text-[10px] text-gray-600">0 = disabled</span>
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b" style={{ borderColor: dim }}>
        {([['main', 'Parameters'], ['arpeggio', 'Arpeggio']] as const).map(([id, label]) => (
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
    </div>
  );
};
