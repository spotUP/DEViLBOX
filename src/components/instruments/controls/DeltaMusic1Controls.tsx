/**
 * DeltaMusic1Controls.tsx — Delta Music 1.0 instrument editor
 *
 * Exposes all DeltaMusic1Config parameters: volume, ADSR envelope, vibrato,
 * portamento, arpeggio table, and (for synth instruments) a read-only
 * preview of the 48-byte sound table.
 *
 * When loaded via UADE (uadeChipRam present), scalar params that have a
 * direct byte equivalent in the DM1 instrument header are written to chip
 * RAM so UADE picks them up on the next note trigger.
 *
 * DM1 instrument header byte layout (offset from instrBase = file offset of
 * the instrument, since DM1 loads at chip RAM address 0x000000):
 *
 *   +0   attackStep     ✓ written (uint8)
 *   +1   attackDelay    ✓ written (uint8)
 *   +2   decayStep      ✓ written (uint8)
 *   +3   decayDelay     ✓ written (uint8)
 *   +4-5 sustain        ✓ written (uint16 BE)
 *   +6   releaseStep    ✓ written (uint8)
 *   +7   releaseDelay   ✓ written (uint8)
 *   +8   volume         ✓ written (uint8)
 *   +9   vibratoWait    ✓ written (uint8)
 *   +10  vibratoStep    ✓ written (uint8)
 *   +11  vibratoLength  ✓ written (uint8)
 *   +12  bendRate       ✓ written (int8)
 *   +13  portamento     ✓ written (uint8)
 *   +14  isSample       — NOT written (structural, do not modify)
 *   +15  tableDelay     ✓ written (uint8)
 *   +16-23 arpeggio[8]  ✓ written (8 × uint8)
 *   +24-25 sampleLength — NOT written (structural, determines PCM extent)
 *   +26-27 repeatStart  — NOT written (structural, determines loop point)
 *   +28-29 repeatLength — NOT written (structural, determines loop length)
 *   [+30-77 table[48]]  — NOT written (synth-only; re-encoding requires
 *                         full segment index recalculation)
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { DeltaMusic1Config, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import { EnvelopeVisualization, SequenceEditor } from '@components/instruments/shared';
import type { SequencePreset } from '@components/instruments/shared';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';

// ── DM1 instrument header byte offsets ─────────────────────────────────────

const OFF_ATTACK_STEP    =  0;
const OFF_ATTACK_DELAY   =  1;
const OFF_DECAY_STEP     =  2;
const OFF_DECAY_DELAY    =  3;
const OFF_SUSTAIN        =  4; // uint16 BE → 2 bytes
const OFF_RELEASE_STEP   =  6;
const OFF_RELEASE_DELAY  =  7;
const OFF_VOLUME         =  8;
const OFF_VIBRATO_WAIT   =  9;
const OFF_VIBRATO_STEP   = 10;
const OFF_VIBRATO_LENGTH = 11;
const OFF_BEND_RATE      = 12; // int8
const OFF_PORTAMENTO     = 13;
// +14 isSample  — NOT written (structural)
const OFF_TABLE_DELAY    = 15;
const OFF_ARPEGGIO       = 16; // 8 × uint8 at +16..+23
// +24-29 sample lengths — NOT written (structural)

// ── Arpeggio presets ────────────────────────────────────────────────────────

const ARP_PRESETS: SequencePreset[] = [
  { name: 'Major',  data: [0, 4, 7, 0, 4, 7, 0, 0], loop: 0 },
  { name: 'Minor',  data: [0, 3, 7, 0, 3, 7, 0, 0], loop: 0 },
  { name: 'Octave', data: [0, 12, 0, 12, 0, 12, 0, 0], loop: 0 },
  { name: 'Power',  data: [0, 7, 12, 0, 7, 12, 0, 0], loop: 0 },
  { name: 'Clear',  data: new Array(8).fill(0) },
];

// ── Tab type ────────────────────────────────────────────────────────────────

type DM1Tab = 'envelope' | 'modulation' | 'arpeggio' | 'table';

// ── Props ───────────────────────────────────────────────────────────────────

interface DeltaMusic1ControlsProps {
  config: DeltaMusic1Config;
  onChange: (updates: Partial<DeltaMusic1Config>) => void;
  /** Present when this instrument was loaded via UADE's native DeltaMusic1 parser. */
  uadeChipRam?: UADEChipRamInfo;
}

// ── Component ───────────────────────────────────────────────────────────────

export const DeltaMusic1Controls: React.FC<DeltaMusic1ControlsProps> = ({
  config,
  onChange,
  uadeChipRam,
}) => {
  const [activeTab, setActiveTab] = useState<DM1Tab>('envelope');

  // configRef pattern: prevents stale closures in callbacks
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  // Lazy UADEChipEditor singleton
  const chipEditorRef = useRef<UADEChipEditor | null>(null);
  const getEditor = useCallback(() => {
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }, []);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#ff9944';
  const knob    = isCyan ? '#00ffff' : '#ffbb66';
  const dim     = isCyan ? '#004444' : '#331800';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#1a0e00] border-orange-900/30';

  // Basic updater — just calls onChange with the partial config
  const upd = useCallback(<K extends keyof DeltaMusic1Config>(key: K, value: DeltaMusic1Config[K]) => {
    onChange({ [key]: value } as Partial<DeltaMusic1Config>);
  }, [onChange]);

  /**
   * Like `upd`, but also writes a single uint8 byte to chip RAM at
   * instrBase + byteOffset when a UADE context is active.
   */
  const updU8 = useCallback(
    (key: keyof DeltaMusic1Config, value: number, byteOffset: number) => {
      onChange({ [key]: value } as Partial<DeltaMusic1Config>);
      if (uadeChipRam) {
        void getEditor().writeU8(uadeChipRam.instrBase + byteOffset, value & 0xFF);
      }
    },
    [onChange, uadeChipRam, getEditor],
  );

  /**
   * Like `upd`, but also writes a signed int8 byte to chip RAM.
   */
  const updS8 = useCallback(
    (key: keyof DeltaMusic1Config, value: number, byteOffset: number) => {
      onChange({ [key]: value } as Partial<DeltaMusic1Config>);
      if (uadeChipRam) {
        void getEditor().writeS8(uadeChipRam.instrBase + byteOffset, value);
      }
    },
    [onChange, uadeChipRam, getEditor],
  );

  /**
   * Like `upd`, but writes a big-endian uint16 to chip RAM (for sustain).
   */
  const updU16 = useCallback(
    (key: keyof DeltaMusic1Config, value: number, byteOffset: number) => {
      onChange({ [key]: value } as Partial<DeltaMusic1Config>);
      if (uadeChipRam) {
        void getEditor().writeU16(uadeChipRam.instrBase + byteOffset, value & 0xFFFF);
      }
    },
    [onChange, uadeChipRam, getEditor],
  );

  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: accent, opacity: 0.7 }}>
      {label}
    </div>
  );

  // ── ENVELOPE TAB ─────────────────────────────────────────────────────────

  const renderEnvelope = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Volume */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Volume" />
        <div className="flex items-center gap-4">
          <Knob
            value={config.volume} min={0} max={64} step={1}
            onChange={(v) => updU8('volume', Math.round(v), OFF_VOLUME)}
            label="Volume" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()}
          />
          <span className="text-[10px] text-gray-600">0-64 Amiga scale</span>
        </div>
      </div>

      {/* ADSR Envelope */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Volume Envelope" />

        {/* Visual ADSR curve using step-based mode.
            DM1 ADSR: attackStep/attackDelay control ramp-up rate,
            sustain is a hold counter, releaseStep/releaseDelay control ramp-down. */}
        <div className="mb-3">
          <EnvelopeVisualization
            mode="steps"
            attackVol={config.volume}    attackSpeed={config.attackStep > 0 ? config.attackDelay : 0}
            decayVol={config.volume / 2} decaySpeed={config.decayStep > 0 ? config.decayDelay : 0}
            sustainVol={config.volume / 2} sustainLen={Math.min(config.sustain, 255)}
            releaseVol={0}               releaseSpeed={config.releaseStep > 0 ? config.releaseDelay : 0}
            maxVol={64}
            width={320} height={72}
            color={accent}
          />
        </div>

        {/* Attack */}
        <div className="mb-3">
          <span className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: accent, opacity: 0.5 }}>Attack</span>
          <div className="flex gap-4">
            <Knob
              value={config.attackStep} min={0} max={255} step={1}
              onChange={(v) => updU8('attackStep', Math.round(v), OFF_ATTACK_STEP)}
              label="Step" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={config.attackDelay} min={0} max={255} step={1}
              onChange={(v) => updU8('attackDelay', Math.round(v), OFF_ATTACK_DELAY)}
              label="Delay" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()}
            />
          </div>
        </div>

        {/* Decay */}
        <div className="mb-3">
          <span className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: accent, opacity: 0.5 }}>Decay</span>
          <div className="flex gap-4">
            <Knob
              value={config.decayStep} min={0} max={255} step={1}
              onChange={(v) => updU8('decayStep', Math.round(v), OFF_DECAY_STEP)}
              label="Step" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={config.decayDelay} min={0} max={255} step={1}
              onChange={(v) => updU8('decayDelay', Math.round(v), OFF_DECAY_DELAY)}
              label="Delay" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()}
            />
          </div>
        </div>

        {/* Sustain */}
        <div className="mb-3">
          <span className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: accent, opacity: 0.5 }}>Sustain</span>
          <div className="flex gap-4">
            <Knob
              value={config.sustain} min={0} max={65535} step={1}
              onChange={(v) => updU16('sustain', Math.round(v), OFF_SUSTAIN)}
              label="Length" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()}
            />
            <span className="text-[10px] text-gray-600 self-center">ticks (0 = off)</span>
          </div>
        </div>

        {/* Release */}
        <div>
          <span className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: accent, opacity: 0.5 }}>Release</span>
          <div className="flex gap-4">
            <Knob
              value={config.releaseStep} min={0} max={255} step={1}
              onChange={(v) => updU8('releaseStep', Math.round(v), OFF_RELEASE_STEP)}
              label="Step" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={config.releaseDelay} min={0} max={255} step={1}
              onChange={(v) => updU8('releaseDelay', Math.round(v), OFF_RELEASE_DELAY)}
              label="Delay" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()}
            />
          </div>
        </div>
      </div>
    </div>
  );

  // ── MODULATION TAB ────────────────────────────────────────────────────────

  const renderModulation = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Vibrato" />
        <div className="flex gap-4">
          <Knob
            value={config.vibratoWait} min={0} max={255} step={1}
            onChange={(v) => updU8('vibratoWait', Math.round(v), OFF_VIBRATO_WAIT)}
            label="Wait" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()}
          />
          <Knob
            value={config.vibratoStep} min={0} max={255} step={1}
            onChange={(v) => updU8('vibratoStep', Math.round(v), OFF_VIBRATO_STEP)}
            label="Step" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()}
          />
          <Knob
            value={config.vibratoLength} min={0} max={255} step={1}
            onChange={(v) => updU8('vibratoLength', Math.round(v), OFF_VIBRATO_LENGTH)}
            label="Depth" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()}
          />
        </div>
        <div className="text-[10px] text-gray-600 mt-1">Wait: ticks before start. Step: LFO speed. Depth: period delta.</div>
      </div>

      {/* Bend Rate */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Pitch Bend" />
        <div className="flex items-center gap-4">
          <Knob
            value={config.bendRate} min={-128} max={127} step={1}
            onChange={(v) => updS8('bendRate', Math.round(v), OFF_BEND_RATE)}
            label="Rate" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()}
          />
          <span className="text-[10px] text-gray-600">0 = no bend</span>
        </div>
      </div>

      {/* Portamento */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Portamento" />
        <div className="flex items-center gap-4">
          <Knob
            value={config.portamento} min={0} max={255} step={1}
            onChange={(v) => updU8('portamento', Math.round(v), OFF_PORTAMENTO)}
            label="Speed" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()}
          />
          <span className="text-[10px] text-gray-600">0 = disabled</span>
        </div>
      </div>

      {/* Table Delay (synth instruments only) */}
      {!config.isSample && (
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Synth Table Delay" />
          <div className="flex items-center gap-4">
            <Knob
              value={config.tableDelay} min={0} max={127} step={1}
              onChange={(v) => updU8('tableDelay', Math.round(v), OFF_TABLE_DELAY)}
              label="Delay" color={knob} size="md"
              formatValue={(v) => Math.round(v).toString()}
            />
            <span className="text-[10px] text-gray-600">ticks between waveform segment advances</span>
          </div>
        </div>
      )}
    </div>
  );

  // ── ARPEGGIO TAB ──────────────────────────────────────────────────────────

  const renderArpeggio = () => {
    // Build 8-element sequence for the SequenceEditor
    const arpData = config.arpeggio.slice(0, 8);
    while (arpData.length < 8) arpData.push(0);

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Arpeggio Table" />
          <SequenceEditor
            label="Arpeggio (8 steps)"
            data={arpData}
            onChange={(d) => {
              // Pad/truncate to exactly 8 entries
              const arr = d.slice(0, 8);
              while (arr.length < 8) arr.push(0);
              upd('arpeggio', arr);
              if (uadeChipRam) {
                void getEditor().writeBlock(
                  uadeChipRam.instrBase + OFF_ARPEGGIO,
                  arr.map((v) => v & 0xFF),
                );
              }
            }}
            min={0} max={63}
            bipolar={false}
            fixedLength
            showNoteNames={false}
            presets={ARP_PRESETS}
            color={accent}
            height={80}
          />
          <div className="text-[10px] text-gray-600 mt-2">
            8 semitone offsets played in sequence. 0 = no arpeggio.
          </div>
        </div>
      </div>
    );
  };

  // ── SOUND TABLE TAB (synth only, read-only preview) ───────────────────────

  const renderTable = () => {
    if (config.isSample || !config.table) {
      return (
        <div className="p-3 text-[11px] text-gray-500">
          No synth sound table — this is a PCM sample instrument.
        </div>
      );
    }

    const table = config.table;

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Sound Table (48-byte sequence, read-only)" />
          <div className="grid grid-cols-8 gap-1">
            {table.map((entry, idx) => {
              const isDelay  = entry >= 0x80 && entry !== 0xFF;
              const isLoop   = entry === 0xFF;
              const isWave   = entry < 0x80;

              let bg = '#0a0e14';
              let textColor = '#555';
              let label = '';

              if (isWave) {
                bg = accent + '1a';
                textColor = accent;
                label = `W${entry}`;
              } else if (isDelay) {
                bg = '#1a1400';
                textColor = '#888822';
                label = `D${entry & 0x7F}`;
              } else if (isLoop) {
                bg = '#1a0000';
                textColor = '#884444';
                label = 'LP';
              }

              return (
                <div key={idx}
                  className="flex flex-col items-center py-1 rounded text-[8px] font-mono"
                  style={{ background: bg, border: `1px solid ${textColor}44` }}>
                  <span style={{ color: textColor, opacity: 0.5 }}>{idx}</span>
                  <span style={{ color: textColor }}>{label || '--'}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-col gap-1 text-[9px]" style={{ color: accent, opacity: 0.6 }}>
            <span>W## = play waveform segment at offset ##×32 in sample data</span>
            <span>D## = set table delay to ## ticks, advance</span>
            <span>LP  = loop back to entry 0xFF+1</span>
          </div>
        </div>
      </div>
    );
  };

  // ── TABS ──────────────────────────────────────────────────────────────────

  const tabs: Array<[DM1Tab, string]> = [
    ['envelope',   'Envelope'],
    ['modulation', 'Modulation'],
    ['arpeggio',   'Arpeggio'],
    ...(!config.isSample ? [['table', 'Table'] as [DM1Tab, string]] : []),
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
              background: activeTab === id ? (isCyan ? '#041510' : '#1a0e00') : 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'envelope'   && renderEnvelope()}
      {activeTab === 'modulation' && renderModulation()}
      {activeTab === 'arpeggio'   && renderArpeggio()}
      {activeTab === 'table'      && renderTable()}

      {uadeChipRam && (
        <div className="flex justify-end px-3 py-2 border-t border-opacity-30"
          style={{ borderColor: dim }}>
          <button
            className="text-[10px] px-2 py-1 rounded opacity-70 hover:opacity-100 transition-colors"
            style={{ background: 'rgba(80,50,20,0.5)', color: '#ffaa44' }}
            onClick={() => void getEditor().exportModule(
              uadeChipRam.moduleBase,
              uadeChipRam.moduleSize,
              'song.dm',
            )}
          >
            Export .dm (Amiga)
          </button>
        </div>
      )}
    </div>
  );
};
