/**
 * SonicArrangerControls.tsx — Sonic Arranger instrument editor
 *
 * Exposes all SonicArrangerConfig parameters across 3 tabs:
 *  - Synthesis: effect mode, effect args, waveform display
 *  - Envelope: volume, fine tuning, ADSR table (BarChart + PatternEditorCanvas), AMF table
 *  - Modulation: vibrato, portamento, arpeggio tables (PatternEditorCanvas)
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { SonicArrangerConfig, UADEChipRamInfo } from '@/types/instrument';
import type { ColumnDef, FormatChannel, FormatCell, OnCellChange } from '@/components/shared/format-editor-types';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { SectionLabel, WaveformLineCanvas, BarChart, SampleBrowserPane } from '@components/instruments/shared';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';
import { useTrackerStore } from '@stores/useTrackerStore';
import { CustomSelect } from '@components/common/CustomSelect';
import { SonicArrangerSynth } from '@/engine/sonic-arranger/SonicArrangerSynth';
import { SonicArrangerEngine } from '@/engine/sonic-arranger/SonicArrangerEngine';

// SA instrument struct byte offsets (from SonicArrangerParser.ts file header).
// All multi-byte fields are uint16 big-endian unless noted.
const SA_OFFSET: Record<string, number> = {
  volume:         16,  // u16
  fineTuning:     18,  // i16
  portamentoSpeed:20,
  vibratoDelay:   22,
  vibratoSpeed:   24,
  vibratoLevel:   26,
  amfNumber:      28,
  amfDelay:       30,
  amfLength:      32,
  amfRepeat:      34,
  adsrNumber:     36,
  adsrDelay:      38,
  adsrLength:     40,
  adsrRepeat:     42,
  sustainPoint:   44,
  sustainDelay:   46,
  effectArg1:     64,
  effect:         66,
  effectArg2:     68,
  effectArg3:     70,
  effectDelay:    72,
};

// ── Adapter helpers ─────────────────────────────────────────────────────────

/** Display a signed byte (-128..127) as unsigned hex (00-FF). */
function signedHex2(val: number): string {
  return ((val & 0xFF)).toString(16).toUpperCase().padStart(2, '0');
}

/** Display an unsigned byte (0-255) as hex (00-FF). */
function unsignedHex2(val: number): string {
  return (val & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

const ARP_COLUMN: ColumnDef[] = [
  {
    key: 'semitone',
    label: 'ST',
    charWidth: 2,
    type: 'hex',
    color: '#ffcc66',
    emptyColor: '#334455',
    emptyValue: undefined,
    hexDigits: 2,
    formatter: signedHex2,
  },
];

const ADSR_COLUMN: ColumnDef[] = [
  {
    key: 'value',
    label: 'Vol',
    charWidth: 2,
    type: 'hex',
    color: '#66ffaa',
    emptyColor: '#334455',
    emptyValue: undefined,
    hexDigits: 2,
    formatter: unsignedHex2,
  },
];

const AMF_COLUMN: ColumnDef[] = [
  {
    key: 'value',
    label: 'Pit',
    charWidth: 2,
    type: 'hex',
    color: '#ff88cc',
    emptyColor: '#334455',
    emptyValue: undefined,
    hexDigits: 2,
    formatter: signedHex2,
  },
];

/** Convert an arpeggio sub-table to a single-channel FormatChannel. */
function arpToFormatChannel(
  arp: { length: number; repeat: number; values: number[] },
  label: string,
): FormatChannel {
  const rows: FormatCell[] = arp.values.slice(0, 14).map((v) => ({
    semitone: v & 0xFF,
  }));
  return { label, patternLength: 14, rows, isPatternChannel: false };
}

/** Convert a byte table (ADSR or AMF) to a single-channel FormatChannel. */
function tableToFormatChannel(
  data: number[],
  label: string,
): FormatChannel {
  const len = Math.min(data.length, 128);
  const rows: FormatCell[] = Array.from({ length: len }, (_, i) => ({
    value: data[i] & 0xFF,
  }));
  return { label, patternLength: len, rows, isPatternChannel: false };
}

/** Create an OnCellChange for a specific arpeggio sub-table index. */
function makeArpCellChange(
  configRef: React.MutableRefObject<SonicArrangerConfig>,
  tableIdx: 0 | 1 | 2,
  onChange: (updates: Partial<SonicArrangerConfig>) => void,
  writeByte?: (subTblIdx: number, pos: number, value: number) => void,
): OnCellChange {
  return (_channelIdx: number, rowIdx: number, _columnKey: string, value: number) => {
    const signed = value > 127 ? value - 256 : value;
    const arps = configRef.current.arpeggios.map((a, i) => {
      if (i !== tableIdx) return { ...a };
      const vals = [...a.values];
      vals[rowIdx] = signed;
      return { ...a, values: vals };
    }) as SonicArrangerConfig['arpeggios'];
    onChange({ ...configRef.current, arpeggios: arps });
    writeByte?.(tableIdx, rowIdx, value & 0xFF);
  };
}

/** Create an OnCellChange for a byte table (adsrTable or amfTable). */
function makeTableCellChange(
  configRef: React.MutableRefObject<SonicArrangerConfig>,
  tableKey: 'adsrTable' | 'amfTable',
  signed: boolean,
  onChange: (updates: Partial<SonicArrangerConfig>) => void,
  writeByte?: (rowIdx: number, value: number) => void,
): OnCellChange {
  return (_channelIdx: number, rowIdx: number, _columnKey: string, value: number) => {
    const realValue = signed ? (value > 127 ? value - 256 : value) : value;
    const table = [...configRef.current[tableKey]];
    table[rowIdx] = realValue;
    onChange({ ...configRef.current, [tableKey]: table });
    writeByte?.(rowIdx, value & 0xFF);
  };
}

interface SonicArrangerControlsProps {
  config: SonicArrangerConfig;
  onChange: (updates: Partial<SonicArrangerConfig>) => void;
  /** Present when this instrument was loaded via UADE's native SA parser. */
  uadeChipRam?: UADEChipRamInfo;
  /** Runtime id of the instrument being edited — used by Find Usage to scan patterns. */
  instrumentId?: number;
}

type SATab = 'synthesis' | 'envelope' | 'modulation';

// ── Effect mode definitions ──────────────────────────────────────────────────

const EFFECT_MODES: { value: number; name: string }[] = [
  { value: 0,  name: 'None' },
  { value: 1,  name: 'Wave Negator' },
  { value: 2,  name: 'Free Negator' },
  { value: 3,  name: 'Rotate Vertical' },
  { value: 4,  name: 'Rotate Horizontal' },
  { value: 5,  name: 'Alien Voice' },
  { value: 6,  name: 'Poly Negator' },
  { value: 7,  name: 'Shack Wave 1' },
  { value: 8,  name: 'Shack Wave 2' },
  { value: 9,  name: 'Metamorph' },
  { value: 10, name: 'Laser' },
  { value: 11, name: 'Wave Alias' },
  { value: 12, name: 'Noise Generator 1' },
  { value: 13, name: 'Low Pass Filter 1' },
  { value: 14, name: 'Low Pass Filter 2' },
  { value: 15, name: 'Oszilator' },
  { value: 16, name: 'Noise Generator 2' },
  { value: 17, name: 'FM Drum' },
];

function arg1Label(mode: number): string {
  if (mode === 9 || mode === 15) return 'Target Wave';
  if (mode === 3 || mode === 11) return 'Delta';
  if (mode === 5 || mode === 7 || mode === 8) return 'Source Wave';
  return 'Arg 1';
}

function arg2Label(mode: number): string {
  if (mode === 10 || mode === 17) return 'Detune';
  return 'Start Pos';
}

function arg3Label(mode: number): string {
  if (mode === 10) return 'Repeats';
  if (mode === 17) return 'Threshold';
  return 'Stop Pos';
}

// ── Component ────────────────────────────────────────────────────────────────

export const SonicArrangerControls: React.FC<SonicArrangerControlsProps> = ({
  config,
  onChange,
  uadeChipRam,
  instrumentId,
}) => {
  const [activeTab, setActiveTab] = useState<SATab>('synthesis');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  // ── Find Usage — scan tracker patterns for any cell referencing this
  // instrument's runtime id, find the song position of the first pattern
  // that contains such a cell, and seek the player there. Mirrors the
  // TFMX/FC/JC/HC Find Usage pattern. ──────────────────────────────────────
  const findUsage = useCallback((): boolean => {
    if (instrumentId === undefined) return false;
    const store = useTrackerStore.getState();
    const patterns = store.patterns;
    const order = store.patternOrder;
    const usingPatternIdx = new Set<number>();
    for (let p = 0; p < patterns.length; p++) {
      const pat = patterns[p];
      if (!pat) continue;
      outer: for (const ch of pat.channels) {
        for (const row of ch.rows) {
          if (row && row.instrument === instrumentId) {
            usingPatternIdx.add(p);
            break outer;
          }
        }
      }
    }
    if (usingPatternIdx.size === 0) return false;
    for (let i = 0; i < order.length; i++) {
      if (usingPatternIdx.has(order[i])) {
        store.setCurrentPosition(i, false);
        return true;
      }
    }
    return false;
  }, [instrumentId]);

  // ── Preview synth — dedicated instance for audition ──────────────────────
  const [previewNote, setPreviewNote] = useState(48); // C-3
  const previewSynthRef = useRef<SonicArrangerSynth | null>(null);

  // Dispose preview synth on unmount
  useEffect(() => {
    return () => {
      previewSynthRef.current?.dispose();
      previewSynthRef.current = null;
    };
  }, []);

  const handlePreview = useCallback(async () => {
    let synth = previewSynthRef.current;
    if (!synth) {
      synth = new SonicArrangerSynth();
      previewSynthRef.current = synth;
      synth.output.connect(synth.output.context.destination);
    }
    await synth.setInstrument(config);
    synth.triggerAttack(previewNote);
    // Auto-release after 800ms so the note doesn't ring forever
    setTimeout(() => synth!.triggerRelease(), 800);
  }, [config, previewNote]);

  const chipEditorRef = useRef<UADEChipEditor | null>(null);
  const getEditor = useCallback(() => {
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }, []);

  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors('#ff8844', { knob: '#ffaa66', dim: '#331a00' });

  const updateParam = useCallback(<K extends keyof SonicArrangerConfig>(
    key: K,
    value: SonicArrangerConfig[K],
  ) => {
    onChange({ ...configRef.current, [key]: value });
    // Push numeric params to the WASM engine for live playback
    if (typeof value === 'number' && SonicArrangerEngine.hasInstance()) {
      SonicArrangerEngine.getInstance().setInstrumentParam(0, key as string, value);
    }
    // Mirror to UADE chip RAM as a u16BE write at the SA instrument struct offset
    // for this parameter, when an SA instrument was loaded via UADE. Only numeric
    // fields are mirrored — string fields like `name` live in the file header and
    // don't map to the 152-byte instrument struct.
    if (
      typeof value === 'number' &&
      uadeChipRam &&
      SA_OFFSET[key as string] !== undefined &&
      UADEEngine.hasInstance()
    ) {
      const off = SA_OFFSET[key as string];
      const addr = uadeChipRam.instrBase + off;
      // fineTuning is signed; the rest are unsigned. writeU16 stores both correctly
      // because we mask to & 0xFFFF before splitting into bytes.
      const numVal = value as number;
      const u = (numVal < 0 ? numVal + 0x10000 : numVal) & 0xFFFF;
      void getEditor().writeU16(addr, u).catch((err) => console.warn('SA chip RAM write failed:', err));
    }
  }, [onChange, uadeChipRam, getEditor]);

  // ── Chip RAM byte writers for ADSR/AMF/arpeggio tables ───────────────────
  // ADSR tables live in the SYAR section (128 unsigned bytes each).
  // AMF tables live in the SYAF section (128 signed int8 — masked to & 0xFF on write).
  // Arpeggios live INSIDE the 152-byte instrument struct at offset +74:
  //   3 × { u8 length, u8 repeat, i8[14] values } = 16 bytes each = 48 bytes total.
  const setAdsrByte = useCallback((tableIdx: number, pos: number, value: number) => {
    if (!uadeChipRam || !UADEEngine.hasInstance()) return;
    const syarBase = uadeChipRam.sections.syarBase;
    if (syarBase === undefined) return;
    const addr = syarBase + tableIdx * 128 + pos;
    void getEditor().writeU8(addr, value & 0xFF).catch((err) => console.warn('SA ADSR chip RAM write failed:', err));
  }, [uadeChipRam, getEditor]);

  const setAmfByte = useCallback((tableIdx: number, pos: number, value: number) => {
    if (!uadeChipRam || !UADEEngine.hasInstance()) return;
    const syafBase = uadeChipRam.sections.syafBase;
    if (syafBase === undefined) return;
    const addr = syafBase + tableIdx * 128 + pos;
    void getEditor().writeU8(addr, value & 0xFF).catch((err) => console.warn('SA AMF chip RAM write failed:', err));
  }, [uadeChipRam, getEditor]);

  const setArpByte = useCallback((subTblIdx: number, pos: number, value: number) => {
    if (!uadeChipRam || !UADEEngine.hasInstance()) return;
    // pos: 0..13 → values[pos] at instrBase + 74 + subTblIdx*16 + 2 + pos
    const addr = uadeChipRam.instrBase + 74 + subTblIdx * 16 + 2 + pos;
    void getEditor().writeU8(addr, value & 0xFF).catch((err) => console.warn('SA arp chip RAM write failed:', err));
  }, [uadeChipRam, getEditor]);

  const setArpHeader = useCallback((subTblIdx: number, field: 'length' | 'repeat', value: number) => {
    if (!uadeChipRam || !UADEEngine.hasInstance()) return;
    // length at +0, repeat at +1 within each 16-byte sub-table
    const offset = field === 'length' ? 0 : 1;
    const addr = uadeChipRam.instrBase + 74 + subTblIdx * 16 + offset;
    void getEditor().writeU8(addr, value & 0xFF).catch((err) => console.warn('SA arp header chip RAM write failed:', err));
  }, [uadeChipRam, getEditor]);

  // ── Memoized format channels + cell-change handlers ────────────────────────

  const adsrChannel = useMemo(
    () => [tableToFormatChannel(config.adsrTable, 'ADSR')] as FormatChannel[],
    [config.adsrTable],
  );
  const adsrCellChange = useMemo(
    () => makeTableCellChange(configRef, 'adsrTable', false, onChange,
      (rowIdx, value) => setAdsrByte(configRef.current.adsrNumber, rowIdx, value)),
    [onChange, setAdsrByte],
  );
  const amfChannel = useMemo(
    () => [tableToFormatChannel(config.amfTable, 'AMF')] as FormatChannel[],
    [config.amfTable],
  );
  const amfCellChange = useMemo(
    () => makeTableCellChange(configRef, 'amfTable', true, onChange,
      (rowIdx, value) => setAmfByte(configRef.current.amfNumber, rowIdx, value)),
    [onChange, setAmfByte],
  );
  const arpChannels = useMemo(() =>
    ([0, 1, 2] as const).map((tIdx) =>
      [arpToFormatChannel(config.arpeggios[tIdx], `Arp ${tIdx + 1}`)] as FormatChannel[]
    ),
    [config.arpeggios],
  );
  const arpCellChanges = useMemo(() =>
    ([0, 1, 2] as const).map((tIdx) =>
      makeArpCellChange(configRef, tIdx, onChange, setArpByte)
    ),
    [onChange, setArpByte],
  );

  // ── SYNTHESIS TAB ──────────────────────────────────────────────────────────

  // Number of ADSR / AMF tables available on this instrument's source module,
  // exposed by SonicArrangerParser via the UADE chipRam.sections bag. When
  // unavailable (e.g. loaded from a project snapshot) fall back to 16 which is
  // the reasonable practical upper bound for SA songs.
  const numAdsrTables = uadeChipRam?.sections?.numAdsrTables ?? 16;
  const numAmfTables  = uadeChipRam?.sections?.numAmfTables  ?? 16;
  const numWaveforms  = (config.allWaveforms ?? []).length;

  const renderSynthesis = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Instrument" />
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-text-muted w-12">Name</label>
          <input
            type="text"
            value={config.name ?? ''}
            onChange={(e) => updateParam('name', e.target.value)}
            className="flex-1 text-xs font-mono border rounded px-2 py-1"
            style={{ background: '#0a0a0a', borderColor: dim, color: accent }}
          />
        </div>
      </div>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Synthesis Effect" />
        <div className="flex gap-3 flex-wrap">
          <Knob value={config.effectArg1} min={0} max={127} step={1}
            onChange={(v) => updateParam('effectArg1', Math.round(v))}
            label={arg1Label(config.effect)} color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.effectArg2} min={0} max={127} step={1}
            onChange={(v) => updateParam('effectArg2', Math.round(v))}
            label={arg2Label(config.effect)} color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.effectArg3} min={0} max={127} step={1}
            onChange={(v) => updateParam('effectArg3', Math.round(v))}
            label={arg3Label(config.effect)} color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.effectDelay} min={1} max={255} step={1}
            onChange={(v) => updateParam('effectDelay', Math.round(v))}
            label="Effect Speed" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
        <CustomSelect
          value={String(config.effect)}
          onChange={(v) => updateParam('effect', parseInt(v))}
          options={EFFECT_MODES.map((m) => ({ value: String(m.value), label: `${m.value}: ${m.name}` }))}
          className="w-full text-xs font-mono border rounded px-2 py-1.5 mt-3"
          style={{ background: '#0a0a0a', borderColor: dim, color: accent }}
        />
      </div>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Waveform" />
        <WaveformLineCanvas data={config.waveformData} width={320} height={72} color={accent} maxSamples={128} />
        <div className="flex items-center gap-3 mt-2 text-[10px] text-text-muted">
          <div className="flex items-center gap-1">
            <label>Wave #</label>
            {numWaveforms > 0 ? (
              <CustomSelect
                value={String(config.waveformNumber)}
                onChange={(v) => updateParam('waveformNumber', parseInt(v) || 0)}
                options={Array.from({ length: numWaveforms }, (_, i) => ({ value: String(i), label: String(i) }))}
                className="text-[10px] font-mono border rounded px-1 py-0.5"
                style={{ background: '#0a0a0a', borderColor: dim, color: accent }}
              />
            ) : (
              <input
                type="number"
                min={0}
                max={255}
                value={config.waveformNumber}
                onChange={(e) => updateParam('waveformNumber', Math.max(0, Math.min(255, parseInt(e.target.value) || 0)))}
                className="w-14 text-[10px] font-mono border rounded px-1 py-0.5"
                style={{ background: '#0a0a0a', borderColor: dim, color: accent }}
              />
            )}
          </div>
          <div className="flex items-center gap-1">
            <label>Length</label>
            <input
              type="number"
              min={0}
              max={65535}
              value={config.waveformLength}
              onChange={(e) => updateParam('waveformLength', Math.max(0, Math.min(65535, parseInt(e.target.value) || 0)))}
              className="w-16 text-[10px] font-mono border rounded px-1 py-0.5"
              style={{ background: '#0a0a0a', borderColor: dim, color: accent }}
            />
            <span>words</span>
          </div>
        </div>
      </div>
    </div>
  );

  // ── ENVELOPE TAB ───────────────────────────────────────────────────────────

  const renderEnvelope = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Volume & Tuning" />
        <div className="flex gap-4">
          <Knob value={config.volume} min={0} max={64} step={1}
            onChange={(v) => updateParam('volume', Math.round(v))}
            label="Volume" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.fineTuning} min={-128} max={127} step={1}
            onChange={(v) => updateParam('fineTuning', Math.round(v))}
            label="Fine Tune" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="ADSR Envelope" />
        <BarChart data={config.adsrTable} width={320} height={56} color={accent} />
        <div className="flex items-center gap-2 mt-2">
          <label className="text-[10px] text-text-muted">ADSR Table #</label>
          <CustomSelect
            value={String(config.adsrNumber)}
            onChange={(v) => updateParam('adsrNumber', parseInt(v) || 0)}
            options={Array.from({ length: numAdsrTables }, (_, i) => ({ value: String(i), label: String(i) }))}
            className="text-[10px] font-mono border rounded px-1 py-0.5"
            style={{ background: '#0a0a0a', borderColor: dim, color: accent }}
          />
          <span className="text-[9px] text-text-muted">({numAdsrTables} available)</span>
        </div>
        <div className="flex gap-3 flex-wrap mt-3">
          <Knob value={config.adsrDelay} min={0} max={255} step={1}
            onChange={(v) => updateParam('adsrDelay', Math.round(v))}
            label="Delay" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.adsrLength} min={0} max={127} step={1}
            onChange={(v) => updateParam('adsrLength', Math.round(v))}
            label="Length" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.adsrRepeat} min={0} max={127} step={1}
            onChange={(v) => updateParam('adsrRepeat', Math.round(v))}
            label="Repeat" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.sustainPoint} min={0} max={127} step={1}
            onChange={(v) => updateParam('sustainPoint', Math.round(v))}
            label="Sus Point" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.sustainDelay} min={0} max={255} step={1}
            onChange={(v) => updateParam('sustainDelay', Math.round(v))}
            label="Sus Delay" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
        <div style={{ height: 280, marginTop: 8 }}>
          <PatternEditorCanvas
            formatColumns={ADSR_COLUMN}
            formatChannels={adsrChannel}
            formatCurrentRow={0}
            formatIsPlaying={false}
            onFormatCellChange={adsrCellChange}
            hideVUMeters={true}
          />
        </div>
      </div>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="AMF (Pitch Modulation)" />
        <BarChart data={config.amfTable} width={320} height={56} color={accent} signed />
        <div className="flex items-center gap-2 mt-2">
          <label className="text-[10px] text-text-muted">AMF Table #</label>
          <CustomSelect
            value={String(config.amfNumber)}
            onChange={(v) => updateParam('amfNumber', parseInt(v) || 0)}
            options={Array.from({ length: numAmfTables }, (_, i) => ({ value: String(i), label: String(i) }))}
            className="text-[10px] font-mono border rounded px-1 py-0.5"
            style={{ background: '#0a0a0a', borderColor: dim, color: accent }}
          />
          <span className="text-[9px] text-text-muted">({numAmfTables} available)</span>
        </div>
        <div className="flex gap-3 mt-3">
          <Knob value={config.amfDelay} min={0} max={255} step={1}
            onChange={(v) => updateParam('amfDelay', Math.round(v))}
            label="Delay" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.amfLength} min={0} max={127} step={1}
            onChange={(v) => updateParam('amfLength', Math.round(v))}
            label="Length" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.amfRepeat} min={0} max={127} step={1}
            onChange={(v) => updateParam('amfRepeat', Math.round(v))}
            label="Repeat" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
        <div style={{ height: 280, marginTop: 8 }}>
          <PatternEditorCanvas
            formatColumns={AMF_COLUMN}
            formatChannels={amfChannel}
            formatCurrentRow={0}
            formatIsPlaying={false}
            onFormatCellChange={amfCellChange}
            hideVUMeters={true}
          />
        </div>
      </div>
    </div>
  );

  // ── MODULATION TAB ─────────────────────────────────────────────────────────

  const updateArpField = useCallback(
    (index: 0 | 1 | 2, field: 'length' | 'repeat', value: number) => {
      const arps = configRef.current.arpeggios.map((a, i) =>
        i === index ? { ...a, [field]: value } : { ...a },
      ) as SonicArrangerConfig['arpeggios'];
      onChange({ ...configRef.current, arpeggios: arps });
      setArpHeader(index, field, value);
    },
    [onChange, setArpHeader],
  );

  const renderModulation = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Vibrato" />
        <div className="flex gap-3">
          <Knob value={config.vibratoDelay} min={0} max={255} step={1}
            onChange={(v) => updateParam('vibratoDelay', Math.round(v))}
            label="Delay" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoSpeed} min={0} max={65535} step={1}
            onChange={(v) => updateParam('vibratoSpeed', Math.round(v))}
            label="Speed" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoLevel} min={0} max={65535} step={1}
            onChange={(v) => updateParam('vibratoLevel', Math.round(v))}
            label="Level" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Portamento" />
        <div className="flex items-center gap-4">
          <Knob value={config.portamentoSpeed} min={0} max={65535} step={1}
            onChange={(v) => updateParam('portamentoSpeed', Math.round(v))}
            label="Speed" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <span className="text-[10px] text-text-muted">0 = disabled</span>
        </div>
      </div>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Arpeggio Tables" />
        <div className="flex flex-col gap-3">
          {([0, 1, 2] as const).map((tIdx) => {
            const arp = config.arpeggios[tIdx];
            return (
              <div key={tIdx} className="rounded border p-2" style={{ borderColor: dim, background: '#0a0a0a' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold" style={{ color: accent }}>Arp {tIdx + 1}</span>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-text-muted">Len</label>
                    <input type="number" min={0} max={14} value={arp.length}
                      onChange={(e) => updateArpField(tIdx, 'length', Math.max(0, Math.min(14, parseInt(e.target.value) || 0)))}
                      className="w-10 text-[10px] font-mono text-center border rounded px-1 py-0.5"
                      style={{ background: 'var(--color-bg-secondary)', borderColor: dim, color: 'var(--color-text-secondary)' }} />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-text-muted">Rep</label>
                    <input type="number" min={0} max={14} value={arp.repeat}
                      onChange={(e) => updateArpField(tIdx, 'repeat', Math.max(0, Math.min(14, parseInt(e.target.value) || 0)))}
                      className="w-10 text-[10px] font-mono text-center border rounded px-1 py-0.5"
                      style={{ background: 'var(--color-bg-secondary)', borderColor: dim, color: 'var(--color-text-secondary)' }} />
                  </div>
                </div>
                <div style={{ height: 240 }}>
                  <PatternEditorCanvas
                    formatColumns={ARP_COLUMN}
                    formatChannels={arpChannels[tIdx]}
                    formatCurrentRow={0}
                    formatIsPlaying={false}
                    onFormatCellChange={arpCellChanges[tIdx]}
                    hideVUMeters={true}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── Tab bar + render ───────────────────────────────────────────────────────

  const tabs = useMemo(() => [
    ['synthesis', 'Synthesis'],
    ['envelope', 'Envelope'],
    ['modulation', 'Modulation'],
  ] as const, []);

  // ── Sample browser pane ──────────────────────────────────────────────────
  // Sonic Arranger carries its full waveform bank INSIDE each instrument's
  // config as `allWaveforms: number[][]` (one signed-byte array per waveform).
  // No cross-instrument walk needed — the data is all local to `config`.
  // Highlight the currently-selected waveform as "(this instrument)".
  const [showSamplePane, setShowSamplePane] = useState(false);

  /** Map signed-byte waveform samples to an 8-cell ASCII bar visualization. */
  function miniWave(data: number[]): string {
    if (!data || data.length === 0) return '';
    const bars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const cells = 16;
    const out: string[] = [];
    const step = Math.max(1, Math.floor(data.length / cells));
    for (let i = 0; i < cells; i++) {
      const start = i * step;
      const end = Math.min(data.length, start + step);
      let sum = 0;
      for (let j = start; j < end; j++) {
        const v = data[j];
        const s = v > 127 ? v - 256 : v;
        sum += Math.abs(s);
      }
      const avg = sum / Math.max(1, end - start); // 0..127
      const idx = Math.min(7, Math.floor((avg / 128) * 8));
      out.push(bars[idx]);
    }
    return out.join('');
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b" style={{ borderColor: dim }}>
        {tabs.map(([id, label]) => (
          <button key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accent : '#666',
              borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
              background: activeTab === id ? (isCyan ? '#041510' : '#140a00') : 'transparent',
            }}>
            {label}
          </button>
        ))}
        <div className="ml-auto mr-2 my-1 flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={95}
            value={previewNote}
            onChange={(e) => setPreviewNote(Math.max(0, Math.min(95, parseInt(e.target.value) || 0)))}
            title="MIDI note (0-95) for preview audition"
            style={{
              width: '40px', fontSize: '10px', padding: '3px 4px',
              background: 'var(--color-bg)', color: '#c084fc',
              border: '1px solid #c084fc', borderRadius: '3px',
              fontFamily: 'inherit', textAlign: 'center',
            }}
          />
          <button
            onClick={() => void handlePreview()}
            title="Play a preview note using this instrument"
            style={{
              fontSize: '10px', padding: '4px 8px', cursor: 'pointer',
              background: 'rgba(192,132,252,0.15)', color: '#c084fc',
              border: '1px solid #c084fc', borderRadius: '3px',
              fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            &#9834; Preview
          </button>
          {instrumentId !== undefined && (
            <button
              onClick={() => {
                const ok = findUsage();
                if (!ok) console.warn('[SonicArranger] instrument is unused — nothing to seek to');
              }}
              title="Find a song position where this instrument is used and seek the player there"
              className="px-2 py-0.5 rounded text-[10px] font-mono bg-dark-bg text-accent-primary border border-dark-border hover:border-accent-primary/60 transition-colors"
            >
              ▶ Find Usage
            </button>
          )}
          <button
            onClick={() => setShowSamplePane((v) => !v)}
            title={`${showSamplePane ? 'Hide' : 'Show'} sample browser`}
            className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
              showSamplePane
                ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/60'
                : 'bg-dark-bg text-text-secondary border-dark-border hover:text-accent-primary hover:border-accent-primary/50'
            }`}
          >
            SMP
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 overflow-y-auto">
          {activeTab === 'synthesis'  && renderSynthesis()}
          {activeTab === 'envelope'   && renderEnvelope()}
          {activeTab === 'modulation' && renderModulation()}
        </div>
        {showSamplePane && (
          <SampleBrowserPane
            headerLabel="WAVEFORMS"
            entries={(config.allWaveforms ?? []).map((wf, i) => ({
              id: i,
              name: `${String(i).padStart(2, '0')}. wave${i}`,
              sizeBytes: wf.length,
              isCurrent: i === config.waveformNumber,
            }))}
            onEntryClick={(entry) => updateParam('waveformNumber', entry.id as number)}
            emptyMessage="No waveform bank on this instrument."
            renderEntry={(entry) => {
              const wf = (config.allWaveforms ?? [])[entry.id as number];
              const isCurrent = (entry.id as number) === config.waveformNumber;
              return (
                <>
                  <div className={`font-mono ${isCurrent ? 'text-accent-primary' : 'text-text-primary'}`}>
                    {String(entry.id).padStart(2, '0')}. wave{entry.id}
                  </div>
                  <div className="text-text-muted mt-0.5">
                    {wf?.length ?? 0} bytes
                  </div>
                  <div className="mt-0.5 font-mono text-accent-highlight text-[10px] leading-none tracking-tight">
                    {wf ? miniWave(wf) : ''}
                  </div>
                  {isCurrent && (
                    <div className="mt-0.5 text-[9px] text-accent-primary">(this instrument)</div>
                  )}
                </>
              );
            }}
          />
        )}
      </div>
    </div>
  );
};
