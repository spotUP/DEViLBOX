/**
 * SidMon1Controls.tsx — SidMon 1 instrument editor
 *
 * Exposes all SidMon1Config parameters: ADSR envelope speeds/levels,
 * phase oscillator, tuning, arpeggio table, and waveform data.
 *
 * Enhanced with PatternEditorCanvas for arpeggio and waveform tables.
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
 *   mainWave   — NOW IMPLEMENTED: reads waveform index at +0..+3, writes 32 bytes
 *                at sections.waveData + waveIndex * 32
 *   phaseWave  — NOW IMPLEMENTED: uses phaseShift at +28, writes 32 bytes
 *                at sections.waveData + phaseShift * 32
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { SidMon1Config, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { EnvelopeVisualization, SectionLabel } from '@components/instruments/shared';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import type { ColumnDef, FormatChannel, FormatCell, OnCellChange } from '@/components/shared/format-editor-types';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';
import { SidMon1Engine } from '@/engine/sidmon1/SidMon1Engine';

interface SidMon1ControlsProps {
  config: SidMon1Config;
  onChange: (updates: Partial<SidMon1Config>) => void;
  /** Present when this instrument was loaded via UADE's native SidMon 1 parser. */
  uadeChipRam?: UADEChipRamInfo;
}

type SM1Tab = 'main' | 'arpeggio' | 'waveform';

// ── PatternEditorCanvas column definitions ─────────────────────────────────

const ARP_COLUMN: ColumnDef[] = [
  {
    key: 'value',
    label: 'Arp',
    charWidth: 3,
    type: 'hex',
    color: '#44aaff',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: (v: number) => v.toString(16).toUpperCase().padStart(2, '0'),
  },
];

function signedHex2(val: number): string {
  if (val === 0) return ' 00';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '+';
  return `${sign}${abs.toString(16).toUpperCase().padStart(2, '0')}`;
}

const WAVE_COLUMN: ColumnDef[] = [
  {
    key: 'value',
    label: 'Wave',
    charWidth: 3,
    type: 'hex',
    color: '#44aaff',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: signedHex2,
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

  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors('#44aaff', { knob: '#66bbff', dim: '#001833' });

  const upd = useCallback(<K extends keyof SidMon1Config>(key: K, value: SidMon1Config[K]) => {
    onChange({ [key]: value } as Partial<SidMon1Config>);
    // Push to WASM engine if running
    if (SidMon1Engine.hasInstance() && typeof value === 'number') {
      SidMon1Engine.getInstance().setInstrumentParam(0, key, value);
    }
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

  // ── MAIN TAB ──────────────────────────────────────────────────────────────
  const renderMain = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* ADSR Envelope */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="ADSR Envelope" />
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
            label="Atk Speed" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.attackMax ?? 0} min={0} max={64} step={1}
            onChange={(v) => updU8WithChipRam('attackMax', Math.round(v), 21)}
            label="Atk Max" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.decaySpeed ?? 0} min={0} max={255} step={1}
            onChange={(v) => updU8WithChipRam('decaySpeed', Math.round(v), 22)}
            label="Dec Speed" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.decayMin ?? 0} min={0} max={64} step={1}
            onChange={(v) => updU8WithChipRam('decayMin', Math.round(v), 23)}
            label="Dec Min" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.sustain ?? 0} min={0} max={255} step={1}
            onChange={(v) => updU8WithChipRam('sustain', Math.round(v), 24)}
            label="Sustain" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          {/* +25 is unused/padding — skipped */}
          <Knob value={config.releaseSpeed ?? 0} min={0} max={255} step={1}
            onChange={(v) => updU8WithChipRam('releaseSpeed', Math.round(v), 26)}
            label="Rel Speed" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.releaseMin ?? 0} min={0} max={64} step={1}
            onChange={(v) => updU8WithChipRam('releaseMin', Math.round(v), 27)}
            label="Rel Min" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Phase Oscillator */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Phase Oscillator" />
        <div className="flex gap-4 items-center">
          <Knob value={config.phaseShift ?? 0} min={0} max={255} step={1}
            onChange={(v) => updU8WithChipRam('phaseShift', Math.round(v), 28)}
            label="Phase Shift" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.phaseSpeed ?? 0} min={0} max={255} step={1}
            onChange={(v) => updU8WithChipRam('phaseSpeed', Math.round(v), 29)}
            label="Phase Speed" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <span className="text-[10px] text-text-muted">Phase Shift 0 = disabled</span>
        </div>
      </div>

      {/* Tuning */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Tuning" />
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
            label="Finetune" color={knob}
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
            label="Pitch Fall" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>
    </div>
  );

  // ── ARPEGGIO TAB ──────────────────────────────────────────────────────────

  const arpChannels = useMemo((): FormatChannel[] => {
    const arp = config.arpeggio ?? new Array(16).fill(0);
    const rows: FormatCell[] = arp.map((v) => ({ value: v }));
    return [{ label: 'Arp', patternLength: arp.length, rows, isPatternChannel: false }];
  }, [config.arpeggio]);

  const arpCellChange = useMemo((): OnCellChange => {
    return (_ch: number, row: number, _col: string, value: number) => {
      const arp = [...(configRef.current.arpeggio ?? new Array(16).fill(0))];
      arp[row] = value & 0xFF;
      upd('arpeggio', arp);
      if (uadeChipRam) {
        void getEditor().writeBlock(uadeChipRam.instrBase + 4, arp.slice(0, 16));
      }
    };
  }, [upd, uadeChipRam, getEditor]);

  const renderArpeggio = () => (
    <div className="flex flex-col gap-3 p-3" style={{ height: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg} flex flex-col`} style={{ ...panelStyle, flex: 1, minHeight: 0 }}>
        <SectionLabel color={accent} label="Arpeggio (16 steps, unsigned byte)" />
        <div style={{ flex: 1, minHeight: 120 }}>
          <PatternEditorCanvas
            formatColumns={ARP_COLUMN}
            formatChannels={arpChannels}
            formatCurrentRow={0}
            formatIsPlaying={false}
            onFormatCellChange={arpCellChange}
            hideVUMeters={true}
          />
        </div>
      </div>
    </div>
  );

  // ── WAVEFORM TAB ──────────────────────────────────────────────────────────

  const mainWaveChannels = useMemo((): FormatChannel[] => {
    const wave = config.mainWave ?? new Array(32).fill(0);
    const rows: FormatCell[] = wave.map((v) => ({ value: v }));
    return [{ label: 'Main', patternLength: wave.length, rows, isPatternChannel: false }];
  }, [config.mainWave]);

  const mainWaveCellChange = useMemo((): OnCellChange => {
    return (_ch: number, row: number, _col: string, value: number) => {
      const wave = [...(configRef.current.mainWave ?? new Array(32).fill(0))];
      // Hex input gives unsigned 0-FF; treat >127 as signed
      wave[row] = value > 127 ? value - 256 : value;
      upd('mainWave', wave);
      if (uadeChipRam && uadeChipRam.sections.waveData) {
        void (async () => {
          const editor = getEditor();
          const waveIdx = await editor.readU32(uadeChipRam.instrBase);
          const addr = uadeChipRam.sections.waveData + waveIdx * 32;
          const bytes = wave.slice(0, 32).map((v) => ((v ?? 0) + 256) & 0xFF);
          void editor.writeBlock(addr, bytes);
        })();
      }
    };
  }, [upd, uadeChipRam, getEditor]);

  const phaseWaveChannels = useMemo((): FormatChannel[] => {
    const wave = config.phaseWave ?? new Array(32).fill(0);
    const rows: FormatCell[] = wave.map((v) => ({ value: v }));
    return [{ label: 'Phase', patternLength: wave.length, rows, isPatternChannel: false }];
  }, [config.phaseWave]);

  const phaseWaveCellChange = useMemo((): OnCellChange => {
    return (_ch: number, row: number, _col: string, value: number) => {
      const wave = [...(configRef.current.phaseWave ?? new Array(32).fill(0))];
      wave[row] = value > 127 ? value - 256 : value;
      upd('phaseWave', wave);
      if (uadeChipRam && uadeChipRam.sections.waveData) {
        const phaseIdx = configRef.current.phaseShift ?? 0;
        if (phaseIdx > 0) {
          const addr = uadeChipRam.sections.waveData + phaseIdx * 32;
          const bytes = wave.slice(0, 32).map((v) => ((v ?? 0) + 256) & 0xFF);
          void getEditor().writeBlock(addr, bytes);
        }
      }
    };
  }, [upd, uadeChipRam, getEditor]);

  const renderWaveform = () => (
    <div className="flex flex-col gap-3 p-3" style={{ height: 'calc(100vh - 280px)' }}>

      {/* Main Wave */}
      <div className={`rounded-lg border p-3 ${panelBg} flex flex-col`} style={{ ...panelStyle, flex: 1, minHeight: 0 }}>
        <SectionLabel color={accent} label="Main Wave (32 bytes, signed)" />
        <div style={{ flex: 1, minHeight: 120 }}>
          <PatternEditorCanvas
            formatColumns={WAVE_COLUMN}
            formatChannels={mainWaveChannels}
            formatCurrentRow={0}
            formatIsPlaying={false}
            onFormatCellChange={mainWaveCellChange}
            hideVUMeters={true}
          />
        </div>
      </div>

      {/* Phase Wave */}
      <div className={`rounded-lg border p-3 ${panelBg} flex flex-col`} style={{ ...panelStyle, flex: 1, minHeight: 0 }}>
        <SectionLabel color={accent} label="Phase Wave (32 bytes, signed)" />
        <div style={{ flex: 1, minHeight: 120 }}>
          <PatternEditorCanvas
            formatColumns={WAVE_COLUMN}
            formatChannels={phaseWaveChannels}
            formatCurrentRow={0}
            formatIsPlaying={false}
            onFormatCellChange={phaseWaveCellChange}
            hideVUMeters={true}
          />
        </div>
      </div>
    </div>
  );

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
