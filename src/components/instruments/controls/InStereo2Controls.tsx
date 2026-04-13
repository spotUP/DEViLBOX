/**
 * InStereo2Controls.tsx — InStereo! 2.0 synth instrument editor
 *
 * Exposes all InStereo2Config parameters across 4 tabs:
 *  - Synthesis: waveform display (2 waveforms), volume, waveform length
 *  - Envelope: ADSR table + sustain, EG table + mode/params
 *  - Modulation: vibrato, portamento, LFO table
 *  - Arpeggio: 3 sub-tables with length/repeat/values (PatternEditorCanvas)
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { InStereo2Config } from '@/types/instrument';
import type { ColumnDef, FormatChannel, FormatCell, OnCellChange } from '@/components/shared/format-editor-types';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { Knob } from '@components/controls/Knob';
import { CustomSelect } from '@components/common/CustomSelect';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { SectionLabel, WaveformLineCanvas, BarChart } from '@components/instruments/shared';
import { InStereo2Engine } from '@/engine/instereo2/InStereo2Engine';

// ── Arpeggio adapter ────────────────────────────────────────────────────────

/** Display a signed byte (-128..127) as unsigned hex (00-FF). */
function signedHex2(val: number): string {
  return ((val & 0xFF)).toString(16).toUpperCase().padStart(2, '0');
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

/** Convert an arpeggio sub-table to a single-channel FormatChannel. */
function arpToFormatChannel(
  arp: { length: number; repeat: number; values: number[] },
  label: string,
): FormatChannel {
  const rows: FormatCell[] = arp.values.slice(0, 14).map((v) => ({
    semitone: v & 0xFF,
  }));
  return {
    label,
    patternLength: 14,
    rows,
    isPatternChannel: false,
  };
}

/** Create an OnCellChange for a specific arpeggio sub-table index. */
function makeArpCellChange(
  configRef: React.MutableRefObject<InStereo2Config>,
  tableIdx: 0 | 1 | 2,
  onChange: (updates: Partial<InStereo2Config>) => void,
): OnCellChange {
  return (_channelIdx: number, rowIdx: number, _columnKey: string, value: number) => {
    const signed = value > 127 ? value - 256 : value;
    const arps = configRef.current.arpeggios.map((a, i) => {
      if (i !== tableIdx) return { ...a };
      const vals = [...a.values];
      vals[rowIdx] = signed;
      return { ...a, values: vals };
    }) as InStereo2Config['arpeggios'];
    onChange({ ...configRef.current, arpeggios: arps });
  };
}

interface InStereo2ControlsProps {
  config: InStereo2Config;
  onChange: (updates: Partial<InStereo2Config>) => void;
}

type IS20Tab = 'synthesis' | 'envelope' | 'modulation' | 'arpeggio';

const EG_MODES = [
  { value: 0, name: 'Disabled' },
  { value: 1, name: 'Calc' },
  { value: 2, name: 'Free' },
];

// ── Component ────────────────────────────────────────────────────────────────

export const InStereo2Controls: React.FC<InStereo2ControlsProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<IS20Tab>('synthesis');

  // --- configRef pattern (from CLAUDE.md) ---
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors('#ff8844', { knob: '#ffaa66', dim: '#331a00' });

  const updateParam = useCallback((key: keyof InStereo2Config, value: number) => {
    onChange({ ...configRef.current, [key]: value });

    // Push to running WASM engine
    if (InStereo2Engine.hasInstance()) {
      // Map TS config keys to C param names (EG fields differ)
      const paramMap: Record<string, string> = {
        egStartLen: 'startLen',
        egStopRep: 'stopRep',
        egSpeedUp: 'speedUp',
        egSpeedDown: 'speedDown',
      };
      const paramName = paramMap[key] ?? key;
      InStereo2Engine.getInstance().setInstrumentParam(0, paramName, value);
    }
  }, [onChange]);

  // ── SYNTHESIS TAB ──────────────────────────────────────────────────────────

  const renderSynthesis = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Volume + Waveform Length */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Volume & Waveform" />
        <div className="flex gap-4">
          <Knob value={config.volume} min={0} max={64} step={1}
            onChange={(v) => updateParam('volume', Math.round(v))}
            label="Volume" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.waveformLength} min={2} max={256} step={2}
            onChange={(v) => updateParam('waveformLength', Math.round(v))}
            label="Wave Len" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Waveform 1 display */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Waveform 1" />
        <WaveformLineCanvas
          data={config.waveform1}
          width={320} height={72}
          color={accent}
          label="WF1"
        />
      </div>

      {/* Waveform 2 display */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Waveform 2" />
        <WaveformLineCanvas
          data={config.waveform2}
          width={320} height={72}
          color={isCyan ? '#00cc99' : '#cc6633'}
          label="WF2"
        />
      </div>
    </div>
  );

  // ── ENVELOPE TAB ───────────────────────────────────────────────────────────

  const adsrMarkers = useMemo(() => {
    const m: { pos: number; color: string; label?: string }[] = [];
    if (config.sustainPoint > 0) m.push({ pos: config.sustainPoint, color: '#ffff00', label: 'S' });
    if (config.adsrLength > 0) m.push({ pos: config.adsrLength, color: '#ff4444', label: 'L' });
    if (config.adsrRepeat > 0) m.push({ pos: config.adsrRepeat, color: '#44ff44', label: 'R' });
    return m;
  }, [config.sustainPoint, config.adsrLength, config.adsrRepeat]);

  const egMarkers = useMemo(() => {
    const m: { pos: number; color: string; label?: string }[] = [];
    if (config.egMode === 2 && config.egStartLen > 0) m.push({ pos: config.egStartLen, color: '#ff4444', label: 'L' });
    return m;
  }, [config.egMode, config.egStartLen]);

  const renderEnvelope = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* ADSR Section */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="ADSR Envelope" />
        <div className="flex gap-3 flex-wrap">
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
          <Knob value={config.sustainSpeed} min={0} max={255} step={1}
            onChange={(v) => updateParam('sustainSpeed', Math.round(v))}
            label="Sus Speed" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
        <div className="mt-2">
          <BarChart
            data={config.adsrTable}
            width={320} height={56}
            color={accent}
            markers={adsrMarkers}
          />
        </div>
      </div>

      {/* Envelope Generator Section */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Envelope Generator (EG)" />
        <CustomSelect
          value={String(config.egMode)}
          onChange={(v) => updateParam('egMode', parseInt(v))}
          options={EG_MODES.map((m) => ({ value: String(m.value), label: m.name }))}
          className="w-full text-xs font-mono border rounded px-2 py-1.5 mb-3"
          style={{ background: '#0a0a0a', borderColor: dim, color: accent }}
        />

        {config.egMode !== 0 && (
          <>
            {config.egMode === 1 && (
              <div className="flex gap-3 flex-wrap">
                <Knob value={config.egStartLen} min={0} max={255} step={1}
                  onChange={(v) => updateParam('egStartLen', Math.round(v))}
                  label="Start/Len" color={knob}
                  formatValue={(v) => Math.round(v).toString()} />
                <Knob value={config.egStopRep} min={0} max={255} step={1}
                  onChange={(v) => updateParam('egStopRep', Math.round(v))}
                  label="Stop/Rep" color={knob}
                  formatValue={(v) => Math.round(v).toString()} />
                <Knob value={config.egSpeedUp} min={0} max={255} step={1}
                  onChange={(v) => updateParam('egSpeedUp', Math.round(v))}
                  label="Speed Up" color={knob}
                  formatValue={(v) => Math.round(v).toString()} />
                <Knob value={config.egSpeedDown} min={0} max={255} step={1}
                  onChange={(v) => updateParam('egSpeedDown', Math.round(v))}
                  label="Speed Dn" color={knob}
                  formatValue={(v) => Math.round(v).toString()} />
              </div>
            )}
            {config.egMode === 2 && (
              <div className="flex gap-3 flex-wrap">
                <Knob value={config.egStartLen} min={0} max={255} step={1}
                  onChange={(v) => updateParam('egStartLen', Math.round(v))}
                  label="Start Len" color={knob}
                  formatValue={(v) => Math.round(v).toString()} />
                <Knob value={config.egStopRep} min={0} max={255} step={1}
                  onChange={(v) => updateParam('egStopRep', Math.round(v))}
                  label="Stop Rep" color={knob}
                  formatValue={(v) => Math.round(v).toString()} />
              </div>
            )}
            <div className="mt-2">
              <BarChart
                data={config.egTable}
                width={320} height={48}
                color={isCyan ? '#00cc99' : '#cc6633'}
                markers={egMarkers}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );

  // ── MODULATION TAB ─────────────────────────────────────────────────────────

  const renderModulation = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Vibrato" />
        <div className="flex gap-3">
          <Knob value={config.vibratoDelay} min={0} max={255} step={1}
            onChange={(v) => updateParam('vibratoDelay', Math.round(v))}
            label="Delay" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoSpeed} min={0} max={255} step={1}
            onChange={(v) => updateParam('vibratoSpeed', Math.round(v))}
            label="Speed" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoLevel} min={0} max={255} step={1}
            onChange={(v) => updateParam('vibratoLevel', Math.round(v))}
            label="Level" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Portamento */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Portamento" />
        <div className="flex items-center gap-4">
          <Knob value={config.portamentoSpeed} min={0} max={255} step={1}
            onChange={(v) => updateParam('portamentoSpeed', Math.round(v))}
            label="Speed" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <span className="text-[10px] text-text-muted">0 = disabled</span>
        </div>
      </div>

      {/* LFO Table */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="LFO (Pitch Modulation)" />
        <div className="flex gap-3">
          <Knob value={config.amfLength} min={0} max={127} step={1}
            onChange={(v) => updateParam('amfLength', Math.round(v))}
            label="Length" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.amfRepeat} min={0} max={127} step={1}
            onChange={(v) => updateParam('amfRepeat', Math.round(v))}
            label="Repeat" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
        <div className="mt-2">
          <BarChart
            data={config.lfoTable}
            width={320} height={56}
            color={accent}
            signed
          />
        </div>
      </div>
    </div>
  );

  // ── ARPEGGIO TAB ──────────────────────────────────────────────────────────

  const updateArpField = useCallback(
    (index: 0 | 1 | 2, field: 'length' | 'repeat', value: number) => {
      const arps = configRef.current.arpeggios.map((a, i) =>
        i === index ? { ...a, [field]: value } : { ...a },
      ) as InStereo2Config['arpeggios'];
      onChange({ ...configRef.current, arpeggios: arps });
    },
    [onChange],
  );

  // Memoize arpeggio format channels and cell-change handlers
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

  const renderArpeggio = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Arpeggio Tables" />
        <div className="flex flex-col gap-3">
          {([0, 1, 2] as const).map((tIdx) => {
            const arp = config.arpeggios[tIdx];
            return (
              <div key={tIdx} className="rounded border p-2" style={{ borderColor: dim, background: '#0a0a0a' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold" style={{ color: accent }}>
                    Arp {tIdx + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-text-muted">Len</label>
                    <input
                      type="number" min={0} max={14}
                      value={arp.length}
                      onChange={(e) => updateArpField(tIdx, 'length', Math.max(0, Math.min(14, parseInt(e.target.value) || 0)))}
                      className="w-10 text-[10px] font-mono text-center border rounded px-1 py-0.5"
                      style={{ background: 'var(--color-bg-secondary)', borderColor: dim, color: 'var(--color-text-secondary)' }}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[9px] text-text-muted">Rep</label>
                    <input
                      type="number" min={0} max={14}
                      value={arp.repeat}
                      onChange={(e) => updateArpField(tIdx, 'repeat', Math.max(0, Math.min(14, parseInt(e.target.value) || 0)))}
                      className="w-10 text-[10px] font-mono text-center border rounded px-1 py-0.5"
                      style={{ background: 'var(--color-bg-secondary)', borderColor: dim, color: 'var(--color-text-secondary)' }}
                    />
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
    ['arpeggio', 'Arpeggio'],
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
      {activeTab === 'arpeggio'   && renderArpeggio()}
    </div>
  );
};
