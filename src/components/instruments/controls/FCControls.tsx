/**
 * FCControls.tsx — Future Composer 1.3/1.4 instrument editor
 *
 * Exposes all FCConfig parameters: waveform selector, synth macro table,
 * ADSR envelope, vibrato, and arpeggio table.
 *
 * When loaded via UADE (uadeChipRam present), scalar params are also written
 * directly to chip RAM so UADE picks them up on the next note trigger.
 *
 * FC vol macro byte layout (instrBase = moduleBase + volMacroPtr + instrIdx*64):
 *   byte[0] = volSpeed  (synthSpeed)
 *   byte[1] = freqMacroIdx  (not exposed — do not overwrite)
 *   byte[2] = vibSpeed
 *   byte[3] = vibDepth
 *   byte[4] = vibDelay
 *   byte[5..63] = vol envelope opcodes (ADSR — complex, no chip RAM write yet)
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { FCConfig, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import { EnvelopeVisualization } from '@components/instruments/shared';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';

interface FCControlsProps {
  config: FCConfig;
  onChange: (updates: Partial<FCConfig>) => void;
  /** Present when this instrument was loaded via UADE's native FC parser. */
  uadeChipRam?: UADEChipRamInfo;
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

export const FCControls: React.FC<FCControlsProps> = ({ config, onChange, uadeChipRam }) => {
  const [activeTab, setActiveTab] = useState<FCTab>('envelope');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const chipEditorRef = useRef<UADEChipEditor | null>(null);
  const getEditor = useCallback(() => {
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }, []);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#ffdd44';
  const knob    = isCyan ? '#00ffff' : '#ffee77';
  const dim     = isCyan ? '#004444' : '#332a00';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#1a1500] border-yellow-900/30';

  const upd = useCallback(<K extends keyof FCConfig>(key: K, value: FCConfig[K]) => {
    onChange({ [key]: value } as Partial<FCConfig>);
  }, [onChange]);

  /**
   * Like `upd`, but also writes a single byte to chip RAM when a UADE context
   * is active. byteOffset is relative to instrBase (start of the 64-byte vol
   * macro for this instrument).
   *
   * Byte map:
   *   0 = synthSpeed
   *   2 = vibSpeed
   *   3 = vibDepth
   *   4 = vibDelay
   *
   * TODO: atkLength/atkVolume/decLength/decVolume/sustVolume/relLength require
   * encoding as FC vol-envelope opcodes (variable-length ADSR sequences) and
   * writing byte[5..63]. The opcode format is non-trivial; skipped for now.
   *
   * TODO: arpTable / synthTable changes require writing the separate arp/synth
   * macro regions (not part of the 64-byte vol macro). Skipped for now.
   */
  const updWithChipRam = useCallback(
    (key: keyof FCConfig, value: FCConfig[keyof FCConfig], byteOffset: number) => {
      upd(key as Parameters<typeof upd>[0], value as Parameters<typeof upd>[1]);
      if (uadeChipRam && typeof value === 'number') {
        void getEditor().writeU8(uadeChipRam.instrBase + byteOffset, value & 0xFF);
      }
    },
    [upd, uadeChipRam, getEditor],
  );

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
        <div className="mb-3">
          <EnvelopeVisualization
            mode="steps"
            attackVol={config.atkVolume}   attackSpeed={config.atkLength}
            decayVol={config.decVolume}    decaySpeed={config.decLength}
            sustainVol={config.sustVolume} sustainLen={32}
            releaseVol={0}                 releaseSpeed={config.relLength}
            maxVol={64}
            color={knob}
            width={300} height={56}
          />
        </div>
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
            onChange={(v) => updWithChipRam('vibDelay', Math.round(v), 4)}
            label="Delay" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibSpeed} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('vibSpeed', Math.round(v), 2)}
            label="Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibDepth} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('vibDepth', Math.round(v), 3)}
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
              onChange={(v) => updWithChipRam('synthSpeed', Math.round(v), 0)}
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
      {uadeChipRam && (
        <div className="flex justify-end px-3 py-2 border-t border-yellow-900/30">
          <button
            className="text-[10px] px-2 py-1 rounded bg-yellow-900/40 text-yellow-400 hover:bg-yellow-900/60 transition-colors"
            onClick={() => void getEditor().exportModule(
              uadeChipRam.moduleBase,
              uadeChipRam.moduleSize,
              'song.fc'
            )}
          >
            Export .fc (Amiga)
          </button>
        </div>
      )}
    </div>
  );
};
