/**
 * SonicArrangerControls.tsx — Sonic Arranger instrument editor
 *
 * Exposes all SonicArrangerConfig parameters across 3 tabs:
 *  - Synthesis: effect mode, effect args, waveform display
 *  - Envelope: volume, fine tuning, ADSR table (BarChart + PatternEditorCanvas), AMF table
 *  - Modulation: vibrato, portamento, arpeggio tables (PatternEditorCanvas)
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { SonicArrangerConfig } from '@/types/instrument';
import type { ColumnDef, FormatChannel, FormatCell, OnCellChange } from '@/components/shared/format-editor-types';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { SectionLabel, WaveformLineCanvas, BarChart } from '@components/instruments/shared';

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
  };
}

/** Create an OnCellChange for a byte table (adsrTable or amfTable). */
function makeTableCellChange(
  configRef: React.MutableRefObject<SonicArrangerConfig>,
  tableKey: 'adsrTable' | 'amfTable',
  signed: boolean,
  onChange: (updates: Partial<SonicArrangerConfig>) => void,
): OnCellChange {
  return (_channelIdx: number, rowIdx: number, _columnKey: string, value: number) => {
    const realValue = signed ? (value > 127 ? value - 256 : value) : value;
    const table = [...configRef.current[tableKey]];
    table[rowIdx] = realValue;
    onChange({ ...configRef.current, [tableKey]: table });
  };
}

interface SonicArrangerControlsProps {
  config: SonicArrangerConfig;
  onChange: (updates: Partial<SonicArrangerConfig>) => void;
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
}) => {
  const [activeTab, setActiveTab] = useState<SATab>('synthesis');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors('#ff8844', { knob: '#ffaa66', dim: '#331a00' });

  const updateParam = useCallback((key: keyof SonicArrangerConfig, value: number) => {
    onChange({ ...configRef.current, [key]: value });
  }, [onChange]);

  // ── Memoized format channels + cell-change handlers ────────────────────────

  const adsrChannel = useMemo(
    () => [tableToFormatChannel(config.adsrTable, 'ADSR')] as FormatChannel[],
    [config.adsrTable],
  );
  const adsrCellChange = useMemo(
    () => makeTableCellChange(configRef, 'adsrTable', false, onChange),
    [onChange],
  );
  const amfChannel = useMemo(
    () => [tableToFormatChannel(config.amfTable, 'AMF')] as FormatChannel[],
    [config.amfTable],
  );
  const amfCellChange = useMemo(
    () => makeTableCellChange(configRef, 'amfTable', true, onChange),
    [onChange],
  );
  const arpChannels = useMemo(() =>
    ([0, 1, 2] as const).map((tIdx) =>
      [arpToFormatChannel(config.arpeggios[tIdx], `Arp ${tIdx + 1}`)] as FormatChannel[]
    ),
    [config.arpeggios],
  );
  const arpCellChanges = useMemo(() =>
    ([0, 1, 2] as const).map((tIdx) =>
      makeArpCellChange(configRef, tIdx, onChange)
    ),
    [onChange],
  );

  // ── SYNTHESIS TAB ──────────────────────────────────────────────────────────

  const renderSynthesis = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
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
        <select
          value={config.effect}
          onChange={(e) => updateParam('effect', parseInt(e.target.value))}
          className="w-full text-xs font-mono border rounded px-2 py-1.5 mt-3"
          style={{ background: '#0a0a0a', borderColor: dim, color: accent }}
        >
          {EFFECT_MODES.map((m) => (
            <option key={m.value} value={m.value} style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}>
              {m.value}: {m.name}
            </option>
          ))}
        </select>
      </div>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Waveform" />
        <WaveformLineCanvas data={config.waveformData} width={320} height={72} color={accent} maxSamples={128} />
        <div className="flex items-center gap-3 mt-2 text-[10px] text-text-muted">
          <span>Wave #{config.waveformNumber}</span>
          <span>Length: {config.waveformLength} words</span>
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
    },
    [onChange],
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
      </div>
      {activeTab === 'synthesis'  && renderSynthesis()}
      {activeTab === 'envelope'   && renderEnvelope()}
      {activeTab === 'modulation' && renderModulation()}
    </div>
  );
};
