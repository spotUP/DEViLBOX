/**
 * DeltaMusic1Controls.tsx — Delta Music 1.0 instrument editor
 *
 * Exposes all DeltaMusic1Config parameters: volume, ADSR envelope, vibrato,
 * portamento, arpeggio table, and (for synth instruments) an editable
 * 48-byte sound table.
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
 *   +30-77 table[48]     ✓ written (48 × uint8, synth-only sound table)
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { DeltaMusic1Config, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { EnvelopeVisualization, SectionLabel } from '@components/instruments/shared';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import type { ColumnDef, FormatChannel, FormatCell, OnCellChange } from '@/components/shared/format-editor-types';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';
import { DeltaMusic1Engine } from '@/engine/deltamusic1/DeltaMusic1Engine';

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
const OFF_TABLE          = 30; // 48 × uint8 at +30..+77
// +24-29 sample lengths — NOT written (structural)

// ── Arpeggio PatternEditorCanvas adapter ────────────────────────────────────

function signedHex2(val: number): string {
  if (val === 0) return ' 00';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '+';
  return `${sign}${abs.toString(16).toUpperCase().padStart(2, '0')}`;
}

const ARP_COLUMN: ColumnDef[] = [
  {
    key: 'semitone',
    label: 'ST',
    charWidth: 3,
    type: 'hex',
    color: '#ff9944',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: signedHex2,
  },
];

// ── Sound table PatternEditorCanvas adapter ─────────────────────────────────

const TABLE_COLUMN: ColumnDef[] = [
  {
    key: 'value',
    label: 'VAL',
    charWidth: 3,
    type: 'hex',
    color: '#ff9944',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: (v: number) => v.toString(16).toUpperCase().padStart(2, '0'),
  },
];

// ── Tab type ────────────────────────────────────────────────────────────────

type DM1Tab = 'envelope' | 'modulation' | 'arpeggio' | 'table' | 'sample';

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

  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors('#ff9944', { knob: '#ffbb66', dim: '#331800' });

  // Basic updater — just calls onChange with the partial config
  const upd = useCallback(<K extends keyof DeltaMusic1Config>(key: K, value: DeltaMusic1Config[K]) => {
    onChange({ [key]: value } as Partial<DeltaMusic1Config>);
    // Push numeric params to the WASM engine for live playback
    if (typeof value === 'number' && DeltaMusic1Engine.hasInstance()) {
      DeltaMusic1Engine.getInstance().setInstrumentParam(0, key as string, value);
    }
  }, [onChange]);

  /**
   * Like `upd`, but also writes a single uint8 byte to chip RAM at
   * instrBase + byteOffset when a UADE context is active.
   */
  const updU8 = useCallback(
    (key: keyof DeltaMusic1Config, value: number, byteOffset: number) => {
      onChange({ [key]: value } as Partial<DeltaMusic1Config>);
      if (DeltaMusic1Engine.hasInstance()) {
        DeltaMusic1Engine.getInstance().setInstrumentParam(0, key as string, value);
      }
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
      if (DeltaMusic1Engine.hasInstance()) {
        DeltaMusic1Engine.getInstance().setInstrumentParam(0, key as string, value);
      }
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
      if (DeltaMusic1Engine.hasInstance()) {
        DeltaMusic1Engine.getInstance().setInstrumentParam(0, key as string, value);
      }
      if (uadeChipRam) {
        void getEditor().writeU16(uadeChipRam.instrBase + byteOffset, value & 0xFFFF);
      }
    },
    [onChange, uadeChipRam, getEditor],
  );

  /**
   * Update a single byte in the synth sound table and write it to chip RAM.
   */
  const updateTableEntry = useCallback((index: number, value: number) => {
    if (!configRef.current.table) return;
    const clamped = Math.max(0, Math.min(255, Math.round(value))) & 0xFF;
    const newTable = [...configRef.current.table];
    newTable[index] = clamped;
    onChange({ table: newTable });
    if (uadeChipRam) {
      void getEditor().writeU8(uadeChipRam.instrBase + OFF_TABLE + index, clamped);
    }
  }, [onChange, uadeChipRam, getEditor]);

  // ── ENVELOPE TAB ─────────────────────────────────────────────────────────

  const renderEnvelope = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Volume */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Volume" />
        <div className="flex items-center gap-4">
          <Knob
            value={config.volume} min={0} max={64} step={1}
            onChange={(v) => updU8('volume', Math.round(v), OFF_VOLUME)}
            label="Volume" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()}
          />
          <span className="text-[10px] text-text-muted">0-64 Amiga scale</span>
        </div>
      </div>

      {/* ADSR Envelope */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Volume Envelope" />

        {/* Attack */}
        <div className="mb-3">
          <span className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: accent, opacity: 0.5 }}>Attack</span>
          <div className="flex gap-4">
            <Knob
              value={config.attackStep} min={0} max={255} step={1}
              onChange={(v) => updU8('attackStep', Math.round(v), OFF_ATTACK_STEP)}
              label="Step" color={knob}
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={config.attackDelay} min={0} max={255} step={1}
              onChange={(v) => updU8('attackDelay', Math.round(v), OFF_ATTACK_DELAY)}
              label="Delay" color={knob}
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
              label="Step" color={knob}
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={config.decayDelay} min={0} max={255} step={1}
              onChange={(v) => updU8('decayDelay', Math.round(v), OFF_DECAY_DELAY)}
              label="Delay" color={knob}
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
              label="Length" color={knob}
              formatValue={(v) => Math.round(v).toString()}
            />
            <span className="text-[10px] text-text-muted self-center">ticks (0 = off)</span>
          </div>
        </div>

        {/* Release */}
        <div>
          <span className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: accent, opacity: 0.5 }}>Release</span>
          <div className="flex gap-4">
            <Knob
              value={config.releaseStep} min={0} max={255} step={1}
              onChange={(v) => updU8('releaseStep', Math.round(v), OFF_RELEASE_STEP)}
              label="Step" color={knob}
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={config.releaseDelay} min={0} max={255} step={1}
              onChange={(v) => updU8('releaseDelay', Math.round(v), OFF_RELEASE_DELAY)}
              label="Delay" color={knob}
              formatValue={(v) => Math.round(v).toString()}
            />
          </div>
        </div>

        {/* Envelope visualization */}
        <div className="mt-2">
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
      </div>
    </div>
  );

  const renderModulation = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Vibrato" />
        <div className="flex gap-4">
          <Knob
            value={config.vibratoWait} min={0} max={255} step={1}
            onChange={(v) => updU8('vibratoWait', Math.round(v), OFF_VIBRATO_WAIT)}
            label="Wait" color={knob}
            formatValue={(v) => Math.round(v).toString()}
          />
          <Knob
            value={config.vibratoStep} min={0} max={255} step={1}
            onChange={(v) => updU8('vibratoStep', Math.round(v), OFF_VIBRATO_STEP)}
            label="Step" color={knob}
            formatValue={(v) => Math.round(v).toString()}
          />
          <Knob
            value={config.vibratoLength} min={0} max={255} step={1}
            onChange={(v) => updU8('vibratoLength', Math.round(v), OFF_VIBRATO_LENGTH)}
            label="Depth" color={knob}
            formatValue={(v) => Math.round(v).toString()}
          />
        </div>
        <div className="text-[10px] text-text-muted mt-1">Wait: ticks before start. Step: LFO speed. Depth: period delta.</div>
      </div>

      {/* Bend Rate */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Pitch Bend" />
        <div className="flex items-center gap-4">
          <Knob
            value={config.bendRate} min={-128} max={127} step={1}
            onChange={(v) => updS8('bendRate', Math.round(v), OFF_BEND_RATE)}
            label="Rate" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()}
          />
          <span className="text-[10px] text-text-muted">0 = no bend</span>
        </div>
      </div>

      {/* Portamento */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Portamento" />
        <div className="flex items-center gap-4">
          <Knob
            value={config.portamento} min={0} max={255} step={1}
            onChange={(v) => updU8('portamento', Math.round(v), OFF_PORTAMENTO)}
            label="Speed" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()}
          />
          <span className="text-[10px] text-text-muted">0 = disabled</span>
        </div>
      </div>

      {/* Table Delay (synth instruments only) */}
      {!config.isSample && (
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <SectionLabel color={accent} label="Synth Table Delay" />
          <div className="flex items-center gap-4">
            <Knob
              value={config.tableDelay} min={0} max={127} step={1}
              onChange={(v) => updU8('tableDelay', Math.round(v), OFF_TABLE_DELAY)}
              label="Delay" color={knob} size="md"
              formatValue={(v) => Math.round(v).toString()}
            />
            <span className="text-[10px] text-text-muted">ticks between waveform segment advances</span>
          </div>
        </div>
      )}
    </div>
  );

  // ── ARPEGGIO TAB ──────────────────────────────────────────────────────────

  const arpChannels = useMemo((): FormatChannel[] => {
    const arpData = config.arpeggio.slice(0, 8);
    while (arpData.length < 8) arpData.push(0);
    const rows: FormatCell[] = arpData.map((v) => ({ semitone: v }));
    return [{ label: 'Arp', patternLength: 8, rows, isPatternChannel: false }];
  }, [config.arpeggio]);

  const arpCellChange = useMemo((): OnCellChange => {
    return (_ch: number, row: number, _col: string, value: number) => {
      const arpData = configRef.current.arpeggio.slice(0, 8);
      while (arpData.length < 8) arpData.push(0);
      // Treat values > 63 as signed (hex input gives unsigned 0-FF)
      arpData[row] = value > 127 ? value - 256 : (value > 63 ? value - 128 : value);
      upd('arpeggio', arpData);
      if (uadeChipRam) {
        void getEditor().writeBlock(
          uadeChipRam.instrBase + OFF_ARPEGGIO,
          arpData.map((v) => v & 0xFF),
        );
      }
    };
  }, [upd, uadeChipRam, getEditor]);

  const renderArpeggio = () => (
    <div className="flex flex-col gap-3 p-3" style={{ height: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg} flex flex-col`} style={{ ...panelStyle, flex: 1, minHeight: 0 }}>
        <SectionLabel color={accent} label="Arpeggio Table (8 steps)" />
        <div className="text-[10px] text-text-muted mb-2">
          8 semitone offsets played in sequence. 0 = no arpeggio.
        </div>
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

  // ── SOUND TABLE TAB (synth only, editable) ──────────────────────────────

  const tableChannels = useMemo((): FormatChannel[] => {
    if (config.isSample || !config.table) return [];
    const rows: FormatCell[] = config.table.map((v) => ({ value: v }));
    return [{ label: 'Tbl', patternLength: config.table.length, rows, isPatternChannel: false }];
  }, [config.table, config.isSample]);

  const tableCellChange = useMemo((): OnCellChange => {
    return (_ch: number, row: number, _col: string, value: number) => {
      updateTableEntry(row, value);
    };
  }, [updateTableEntry]);

  const renderTable = () => {
    if (config.isSample || !config.table) {
      return (
        <div className="p-3 text-[11px] text-text-muted">
          No synth sound table — this is a PCM sample instrument.
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3 p-3" style={{ height: 'calc(100vh - 280px)' }}>
        <div className={`rounded-lg border p-3 ${panelBg} flex flex-col`} style={{ ...panelStyle, flex: 1, minHeight: 0 }}>
          <SectionLabel color={accent} label="Sound Table (48-byte sequence)" />
          <div className="text-[10px] text-text-muted mb-2">
            W## = waveform segment (0-7F), D## = delay (80-FE), FF = loop
          </div>
          <div style={{ flex: 1, minHeight: 120 }}>
            <PatternEditorCanvas
              formatColumns={TABLE_COLUMN}
              formatChannels={tableChannels}
              formatCurrentRow={0}
              formatIsPlaying={false}
              onFormatCellChange={tableCellChange}
              hideVUMeters={true}
            />
          </div>
        </div>
      </div>
    );
  };

  // ── SAMPLE PREVIEW TAB (read-only waveform of raw sampleData) ────────────

  const sampleCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (activeTab !== 'sample') return;
    const canvas = sampleCanvasRef.current;
    if (!canvas) return;
    const sd = configRef.current.sampleData;
    if (!sd || sd.length === 0) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 320;
      const cssH = canvas.clientHeight || 120;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      const w = cssW;
      const h = cssH;
      const mid = h / 2;

      // Background
      ctx.fillStyle = '#0a0e14';
      ctx.fillRect(0, 0, w, h);

      // Center line
      ctx.strokeStyle = '#1a2a3a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();

      // Waveform: sampleData entries are signed 8-bit (-128..127)
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const step = Math.max(1, Math.floor(sd.length / w));
      for (let x = 0; x < w; x++) {
        const i = Math.min(sd.length - 1, Math.floor((x / w) * sd.length));
        // Peak-pick across the bucket so dense samples remain visible
        let peak = 0;
        const end = Math.min(sd.length, i + step);
        for (let j = i; j < end; j++) {
          const v = sd[j];
          const signed = v > 127 ? v - 256 : v; // tolerate either signed or unsigned ints
          if (Math.abs(signed) > Math.abs(peak)) peak = signed;
        }
        const y = mid - (peak / 128) * (mid - 2);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    const raf = requestAnimationFrame(draw);
    const obs = new ResizeObserver(draw);
    obs.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [activeTab, config.sampleData, accent]);

  const renderSample = () => {
    const sd = config.sampleData;
    if (!sd || sd.length === 0) {
      return (
        <div className="p-3 text-[11px] text-text-muted">
          No raw sample data available for this instrument.
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <SectionLabel color={accent} label="Raw Sample Data (read-only preview)" />
          <div className="text-[10px] text-text-muted mb-2">
            {sd.length.toLocaleString()} bytes — signed 8-bit PCM from the DM1 sample pool.
            {config.isSample
              ? ' This is the playable PCM sample for this instrument.'
              : ' For synth instruments this is the waveform pool used by the sound table.'}
          </div>
          <canvas
            ref={sampleCanvasRef}
            className="w-full rounded border border-dark-border bg-[#0a0e14]"
            style={{ height: 140 }}
          />
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono"
            style={{ color: accent, opacity: 0.8 }}>
            <div>Bytes: <span className="text-text-muted">{sd.length}</span></div>
            <div>Min: <span className="text-text-muted">
              {Math.min(...sd.map((v) => (v > 127 ? v - 256 : v)))}
            </span></div>
            <div>Max: <span className="text-text-muted">
              {Math.max(...sd.map((v) => (v > 127 ? v - 256 : v)))}
            </span></div>
            <div>Mode: <span className="text-text-muted">{config.isSample ? 'PCM sample' : 'Synth waveform pool'}</span></div>
          </div>
        </div>
      </div>
    );
  };

  // ── TABS ──────────────────────────────────────────────────────────────────

  const hasSampleData = !!(config.sampleData && config.sampleData.length > 0);

  const tabs: Array<[DM1Tab, string]> = [
    ['envelope',   'Envelope'],
    ['modulation', 'Modulation'],
    ['arpeggio',   'Arpeggio'],
    ...(!config.isSample ? [['table', 'Table'] as [DM1Tab, string]] : []),
    ...(hasSampleData ? [['sample', 'Sample'] as [DM1Tab, string]] : []),
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
      {activeTab === 'sample'     && renderSample()}

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
