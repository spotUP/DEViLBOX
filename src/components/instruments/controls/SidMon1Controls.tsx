/**
 * SidMon1Controls.tsx — SidMon 1 instrument editor
 *
 * Exposes all SidMon1Config parameters: ADSR envelope speeds/levels,
 * phase oscillator, tuning, arpeggio table, and waveform data.
 *
 * Enhanced with SequenceEditor for arpeggio and waveform tables.
 *
 * When loaded via UADE (uadeChipRam present), scalar params that have a direct
 * 1-byte equivalent in the SidMon 1 instrument header are written to chip RAM
 * so UADE picks them up on the next note trigger.
 *
 * SidMon 1 instrument byte layout (offset from instrBase):
 *
 *   +0..+3  : waveform (uint32 BE) — not written; waveform index into table
 *   +4..+19 : arpeggio[0..15] (16 × uint8)  ✓ written as block
 *   +20     : attackSpeed                    ✓ written
 *   +21     : attackMax                      ✓ written
 *   +22     : decaySpeed                     ✓ written
 *   +23     : decayMin                       ✓ written
 *   +24     : sustain                        ✓ written
 *   +25     : (unused / padding)             — skipped
 *   +26     : releaseSpeed                   ✓ written
 *   +27     : releaseMin                     ✓ written
 *   +28     : phaseShift                     ✓ written
 *   +29     : phaseSpeed                     ✓ written
 *   +30     : finetune (raw index 0-15)      ✓ written (config value / 67)
 *   +31     : pitchFall (signed int8)        ✓ written via writeS8
 *
 * Fields NOT written to chip RAM (with reason):
 *   mainWave   — 32-byte sample data stored at waveData + waveIndex * 32;
 *                requires knowing the waveform index stored at +0..+3. TODO.
 *   phaseWave  — same region as mainWave; same complexity. TODO.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { SidMon1Config, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import { SequenceEditor, EnvelopeVisualization } from '@components/instruments/shared';
import type { SequencePreset } from '@components/instruments/shared';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';

interface SidMon1ControlsProps {
  config: SidMon1Config;
  onChange: (updates: Partial<SidMon1Config>) => void;
  /** Present when this instrument was loaded via UADE's native SidMon 1 parser. */
  uadeChipRam?: UADEChipRamInfo;
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

export const SidMon1Controls: React.FC<SidMon1ControlsProps> = ({ config, onChange, uadeChipRam }) => {
  const [activeTab, setActiveTab] = useState<SM1Tab>('main');

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

  const accent  = isCyan ? '#00ffff' : '#44aaff';
  const knob    = isCyan ? '#00ffff' : '#66bbff';
  const dim     = isCyan ? '#004444' : '#001833';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#000e1a] border-blue-900/30';

  const upd = useCallback(<K extends keyof SidMon1Config>(key: K, value: SidMon1Config[K]) => {
    onChange({ [key]: value } as Partial<SidMon1Config>);
  }, [onChange]);

  /**
   * Like `upd`, but also writes a single unsigned byte to chip RAM when a UADE
   * context is active. byteOffset is relative to instrBase.
   */
  const updU8WithChipRam = useCallback(
    (key: keyof SidMon1Config, value: SidMon1Config[keyof SidMon1Config], byteOffset: number) => {
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

  // ── MAIN TAB ──────────────────────────────────────────────────────────────
  const renderMain = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* ADSR Envelope */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="ADSR Envelope" />
        <div className="mb-3">
          <EnvelopeVisualization
            mode="steps"
            attackVol={config.attackMax ?? 0}    attackSpeed={config.attackSpeed ?? 0}
            decayVol={config.decayMin ?? 0}      decaySpeed={config.decaySpeed ?? 0}
            sustainVol={config.decayMin ?? 0}    sustainLen={config.sustain ?? 0}
            releaseVol={config.releaseMin ?? 0}  releaseSpeed={config.releaseSpeed ?? 0}
            maxVol={64}
            color={knob}
            width={300} height={56}
          />
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Knob value={config.attackSpeed ?? 0} min={0} max={255} step={1}
            onChange={(v) => updU8WithChipRam('attackSpeed', Math.round(v), 20)}
            label="Atk Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.attackMax ?? 0} min={0} max={64} step={1}
            onChange={(v) => updU8WithChipRam('attackMax', Math.round(v), 21)}
            label="Atk Max" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.decaySpeed ?? 0} min={0} max={255} step={1}
            onChange={(v) => updU8WithChipRam('decaySpeed', Math.round(v), 22)}
            label="Dec Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.decayMin ?? 0} min={0} max={64} step={1}
            onChange={(v) => updU8WithChipRam('decayMin', Math.round(v), 23)}
            label="Dec Min" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.sustain ?? 0} min={0} max={255} step={1}
            onChange={(v) => updU8WithChipRam('sustain', Math.round(v), 24)}
            label="Sustain" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          {/* +25 is unused/padding — skipped */}
          <Knob value={config.releaseSpeed ?? 0} min={0} max={255} step={1}
            onChange={(v) => updU8WithChipRam('releaseSpeed', Math.round(v), 26)}
            label="Rel Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.releaseMin ?? 0} min={0} max={64} step={1}
            onChange={(v) => updU8WithChipRam('releaseMin', Math.round(v), 27)}
            label="Rel Min" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Phase Oscillator */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Phase Oscillator" />
        <div className="flex gap-4 items-center">
          <Knob value={config.phaseShift ?? 0} min={0} max={255} step={1}
            onChange={(v) => updU8WithChipRam('phaseShift', Math.round(v), 28)}
            label="Phase Shift" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.phaseSpeed ?? 0} min={0} max={255} step={1}
            onChange={(v) => updU8WithChipRam('phaseSpeed', Math.round(v), 29)}
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
              const newVal = steps * 67;
              upd('finetune', newVal);
              // Chip RAM stores raw index 0-15 at +30 (parser: finetune / 67)
              if (uadeChipRam) {
                void getEditor().writeU8(uadeChipRam.instrBase + 30, steps & 0xFF);
              }
            }}
            label="Finetune" color={knob} size="sm"
            formatValue={(v) => `${Math.round(v / 67)}/15`} />
          <Knob value={config.pitchFall ?? 0} min={-128} max={127} step={1}
            onChange={(v) => {
              const val = Math.round(v);
              upd('pitchFall', val);
              // Chip RAM stores signed int8 at +31
              if (uadeChipRam) {
                void getEditor().writeS8(uadeChipRam.instrBase + 31, val);
              }
            }}
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
            onChange={(d) => {
              upd('arpeggio', d);
              // Write all 16 arpeggio bytes as a block at instrBase + 4
              if (uadeChipRam) {
                void getEditor().writeBlock(uadeChipRam.instrBase + 4, d.slice(0, 16));
              }
            }}
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
          {/* TODO chip RAM: mainWave lives at sections.waveData + waveIndex * 32.
              The waveform index is stored as uint32 BE at instrBase + 0..+3.
              Writing this region requires reading the index first, then writing
              32 bytes at the correct waveData offset. Deferred. */}
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
          {/* TODO chip RAM: phaseWave lives at sections.waveData + phaseShift * 32.
              The phaseShift index at +28 identifies the waveform. Writing requires
              the same waveData region lookup as mainWave. Deferred. */}
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
      {uadeChipRam && (
        <div className="flex justify-end px-3 py-2 border-t border-opacity-30"
          style={{ borderColor: dim }}>
          <button
            className="text-[10px] px-2 py-1 rounded opacity-70 hover:opacity-100 transition-colors"
            style={{ background: 'rgba(60,40,100,0.4)', color: '#cc88ff' }}
            onClick={() => void getEditor().exportModule(
              uadeChipRam.moduleBase,
              uadeChipRam.moduleSize,
              'song.sid1'
            )}
          >
            Export .sid1 (Amiga)
          </button>
        </div>
      )}
    </div>
  );
};
