/**
 * SidMonControls.tsx -- SidMon II (SID-like synthesis) instrument editor
 *
 * Exposes all SidMonConfig parameters: waveform selector, ADSR, filter,
 * vibrato, and arpeggio table.
 *
 * Enhanced with:
 *  - WaveformThumbnail: visual previews on waveform selector buttons
 *  - EnvelopeVisualization mode="adsr": SID-format ADSR curve
 *  - PatternEditorCanvas: vertical tracker-style arpeggio table editor
 *
 * When loaded via UADE (uadeChipRam present), scalar params that have a direct
 * 1-byte equivalent in the SidMon 2 instrument header are written to chip RAM
 * so UADE picks them up on the next note trigger.
 *
 * SidMon 2 instrument byte layout (offset from instrBase, 32 bytes total):
 *
 *   +0   : wave (x16 = table offset)       -- skipped
 *   +1   : waveLen                          -- skipped
 *   +2   : waveSpeed                        -- skipped
 *   +3   : waveDelay                        -- skipped
 *   +4   : arpeggio (x16 = table offset)   -- skipped (separate table)
 *   +5   : arpeggioLen                      -- skipped
 *   +6   : arpeggioSpeed                    written (arpSpeed * 16)
 *   +7   : arpeggioDelay                    -- skipped
 *   +8   : vibrato (x16 = table offset)    -- skipped
 *   +9   : vibratoLen (-> vibDepth in UI)   written
 *   +10  : vibratoSpeed                     written
 *   +11  : vibratoDelay                     written
 *   +12  : pitchBend (signed)              -- skipped
 *   +13  : pitchBendDelay                  -- skipped
 *   +14..+15 : (skipped)
 *   +16  : attackMax                        -- skipped (NOT SID attack)
 *   +17  : attackSpeed -> SID attack = 15 - floor(raw*16/256)   written
 *   +18  : decayMin   -> SID sustain = round(raw*15/255)        written
 *   +19  : decaySpeed -> SID decay   = 15 - floor(raw*16/256)  written
 *   +20  : sustain hold counter                                 -- skipped
 *   +21  : releaseMin                                           -- skipped
 *   +22  : releaseSpeed -> SID release = 15 - floor(raw*16/256) written
 *   +23..+31 : (skipped)
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { SidMonConfig, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import {
  EnvelopeVisualization,
  FilterFrequencyResponse,
  SectionLabel,
  WaveformThumbnail,
} from '@components/instruments/shared';
import type { FilterType } from '@components/instruments/shared';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import type { ColumnDef, FormatChannel, FormatCell, OnCellChange } from '@/components/shared/format-editor-types';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';
import { Download } from 'lucide-react';

interface SidMonControlsProps {
  config: SidMonConfig;
  onChange: (updates: Partial<SidMonConfig>) => void;
  arpPlaybackPosition?: number;
  /** Present when this instrument was loaded via UADE's native SidMon 2 parser. */
  uadeChipRam?: UADEChipRamInfo;
}

type SMTab = 'main' | 'filter' | 'arpeggio' | 'pcm';

// SID waveforms with visual shape hints
const WAVEFORMS: { name: string; type: 'triangle' | 'saw' | 'square' | 'noise' }[] = [
  { name: 'Triangle', type: 'triangle' },
  { name: 'Sawtooth', type: 'saw'      },
  { name: 'Pulse',    type: 'square'   },
  { name: 'Noise',    type: 'noise'    },
];

const FILTER_MODE_NAMES = ['LP', 'HP', 'BP'];
const FILTER_MODE_TYPES: FilterType[] = ['lowpass', 'highpass', 'bandpass'];

// -- Arpeggio adapter (inline -- single column) ---

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
    color: '#ff66aa',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: signedHex2,
  },
];

function arpToFormatChannel(data: number[]): FormatChannel[] {
  const rows: FormatCell[] = data.map((v) => ({ semitone: v }));
  return [{ label: 'Arp', patternLength: data.length, rows, isPatternChannel: false }];
}

function makeArpCellChange(
  data: number[],
  onChangeData: (d: number[]) => void,
): OnCellChange {
  return (_ch: number, row: number, _col: string, value: number) => {
    const next = [...data];
    // Treat values > 63 as signed (hex input gives unsigned 0-FF)
    next[row] = value > 127 ? value - 256 : (value > 63 ? value - 128 : value);
    onChangeData(next);
  };
}

// -- Component ---

export const SidMonControls: React.FC<SidMonControlsProps> = ({
  config,
  onChange,
  arpPlaybackPosition,
  uadeChipRam,
}) => {
  const [activeTab, setActiveTab] = useState<SMTab>('main');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const chipEditorRef = useRef<UADEChipEditor | null>(null);
  const getEditor = useCallback((): UADEChipEditor | null => {
    if (!uadeChipRam) return null;
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }, [uadeChipRam]);

  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors('#ff66aa', { knob: '#ff88bb', dim: '#330022' });

  const upd = useCallback(<K extends keyof SidMonConfig>(key: K, value: SidMonConfig[K]) => {
    onChange({ [key]: value } as Partial<SidMonConfig>);
  }, [onChange]);

  const updWithChipRam = useCallback(<K extends keyof SidMonConfig>(
    key: K,
    value: SidMonConfig[K],
    chipWriter?: (editor: UADEChipEditor, base: number) => Promise<void>,
  ) => {
    onChange({ [key]: value } as Partial<SidMonConfig>);
    const editor = getEditor();
    if (editor && uadeChipRam && chipWriter) {
      chipWriter(editor, uadeChipRam.instrBase).catch(console.error);
    }
  }, [onChange, getEditor, uadeChipRam]);

  // -- MAIN TAB ---
  const renderMain = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Waveform" />
        <div className="grid grid-cols-4 gap-2 mb-3">
          {WAVEFORMS.map((wf, i) => {
            const active = config.waveform === i;
            return (
              <button key={i}
                onClick={() => upd('waveform', i as 0 | 1 | 2 | 3)}
                className="flex flex-col items-center gap-0.5 px-1 py-1.5 rounded transition-colors"
                style={{
                  background: active ? accent + '28' : '#0a0012',
                  border: `1px solid ${active ? accent : '#2a002a'}`,
                }}>
                <WaveformThumbnail type={wf.type} width={56} height={22} color={active ? accent : '#555'} style="line" />
                <span className="text-[9px] font-mono leading-tight" style={{ color: active ? accent : '#555' }}>
                  {wf.name}
                </span>
              </button>
            );
          })}
        </div>
        {config.waveform === 2 && (
          <div className="flex items-center gap-4">
            <Knob value={config.pulseWidth} min={0} max={255} step={1}
              onChange={(v) => upd('pulseWidth', Math.round(v))}
              label="Pulse Width" color={knob} formatValue={(v) => Math.round(v).toString()} />
          </div>
        )}
      </div>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="ADSR (SID format, 0-15)" />
        <div className="flex gap-4">
          <Knob value={config.attack} min={0} max={15} step={1}
            onChange={(v) => {
              const sid = Math.round(v);
              const raw = Math.round((15 - sid) * 256 / 16);
              updWithChipRam('attack', sid, async (ed, base) => { await ed.writeU8(base + 17, raw); });
            }}
            label="Attack" color={knob} formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.decay} min={0} max={15} step={1}
            onChange={(v) => {
              const sid = Math.round(v);
              const raw = Math.round((15 - sid) * 256 / 16);
              updWithChipRam('decay', sid, async (ed, base) => { await ed.writeU8(base + 19, raw); });
            }}
            label="Decay" color={knob} formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.sustain} min={0} max={15} step={1}
            onChange={(v) => {
              const sid = Math.round(v);
              const raw = Math.round(sid * 255 / 15);
              updWithChipRam('sustain', sid, async (ed, base) => { await ed.writeU8(base + 18, raw); });
            }}
            label="Sustain" color={knob} formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.release} min={0} max={15} step={1}
            onChange={(v) => {
              const sid = Math.round(v);
              const raw = Math.round((15 - sid) * 256 / 16);
              updWithChipRam('release', sid, async (ed, base) => { await ed.writeU8(base + 22, raw); });
            }}
            label="Release" color={knob} formatValue={(v) => Math.round(v).toString()} />
        </div>
        <div className="mt-2">
          <EnvelopeVisualization mode="adsr" ar={config.attack} dr={config.decay} rr={config.release} sl={config.sustain} tl={0} maxRate={15} maxTl={1} width={320} height={64} color={accent} />
        </div>
      </div>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Vibrato" />
        <div className="flex gap-4">
          <Knob paramKey="sidmon.vibDelay" value={config.vibDelay} min={0} max={255} step={1}
            onChange={(v) => updWithChipRam('vibDelay', Math.round(v), async (ed, base) => { await ed.writeU8(base + 11, Math.round(v)); })}
            label="Delay" color={knob} formatValue={(v) => Math.round(v).toString()} />
          <Knob paramKey="sidmon.vibSpeed" value={config.vibSpeed} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('vibSpeed', Math.round(v), async (ed, base) => { await ed.writeU8(base + 10, Math.round(v)); })}
            label="Speed" color={knob} formatValue={(v) => Math.round(v).toString()} />
          <Knob paramKey="sidmon.vibDepth" value={config.vibDepth} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('vibDepth', Math.round(v), async (ed, base) => { await ed.writeU8(base + 9, Math.round(v)); })}
            label="Depth" color={knob} formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>
    </div>
  );

  // -- FILTER TAB ---
  const renderFilter = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Filter Mode" />
        <div className="flex gap-2 mb-2">
          {FILTER_MODE_NAMES.map((name, i) => (
            <button key={i}
              onClick={() => upd('filterMode', i)}
              className="flex-1 py-1.5 text-xs font-mono rounded transition-colors"
              style={{
                background: config.filterMode === i ? accent : '#111',
                color: config.filterMode === i ? '#000' : '#666',
                border: `1px solid ${config.filterMode === i ? accent : 'var(--color-border-light)'}`,
              }}>
              {name}
            </button>
          ))}
        </div>
        <div className="flex gap-4">
          <Knob paramKey="sidmon.filterCutoff" value={config.filterCutoff} min={0} max={255} step={1}
            onChange={(v) => upd('filterCutoff', Math.round(v))}
            label="Cutoff" color={knob} size="md" formatValue={(v) => Math.round(v).toString()} />
          <Knob paramKey="sidmon.filterResonance" value={config.filterResonance} min={0} max={15} step={1}
            onChange={(v) => upd('filterResonance', Math.round(v))}
            label="Resonance" color={knob} size="md" formatValue={(v) => Math.round(v).toString()} />
        </div>
        <div className="mt-2">
          <FilterFrequencyResponse filterType={FILTER_MODE_TYPES[config.filterMode] ?? 'lowpass'} cutoff={config.filterCutoff / 255} resonance={config.filterResonance / 15} poles={2} color={accent} width={320} height={64} />
        </div>
      </div>
    </div>
  );

  // -- ARPEGGIO TAB ---
  const arpChannels = useMemo(() => arpToFormatChannel(config.arpTable), [config.arpTable]);
  const arpCellChange = useMemo(
    () => makeArpCellChange(config.arpTable, (d) => upd('arpTable', d)),
    [config.arpTable, upd],
  );

  const renderArpeggio = () => (
    <div className="flex flex-col gap-3 p-3" style={{ height: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg} flex flex-col`} style={{ ...panelStyle, flex: 1, minHeight: 0 }}>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel color={accent} label="Arpeggio Speed" />
          <Knob paramKey="sidmon.arpSpeed" value={config.arpSpeed} min={0} max={15} step={1}
            onChange={(v) => updWithChipRam('arpSpeed', Math.round(v), async (ed, base) => {
              await ed.writeU8(base + 6, Math.round(v) * 16);
            })}
            label="Speed" color={knob} formatValue={(v) => Math.round(v).toString()} />
        </div>
        <div style={{ flex: 1, minHeight: 120 }}>
          <PatternEditorCanvas
            formatColumns={ARP_COLUMN}
            formatChannels={arpChannels}
            formatCurrentRow={arpPlaybackPosition ?? 0}
            formatIsPlaying={arpPlaybackPosition !== undefined}
            onFormatCellChange={arpCellChange}
            hideVUMeters={true}
          />
        </div>
      </div>
    </div>
  );

  // -- PCM TAB ---
  const pcmCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pcmLen = config.pcmData ? config.pcmData.length : 0;

  useEffect(() => {
    if (activeTab !== 'pcm') return;
    const canvas = pcmCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#0a0012';
    ctx.fillRect(0, 0, W, H);

    // Center line
    ctx.strokeStyle = dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    const data = config.pcmData;
    if (!data || data.length === 0) {
      ctx.fillStyle = '#555';
      ctx.font = '11px monospace';
      ctx.fillText('(no PCM data)', 8, H / 2 - 6);
      return;
    }

    // Waveform — treat bytes as signed 8-bit
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = Math.max(1, Math.floor(data.length / W));
    for (let x = 0; x < W; x++) {
      const i = Math.min(data.length - 1, x * step);
      const b = data[i];
      const s = b > 127 ? b - 256 : b;
      const y = H / 2 - (s / 128) * (H / 2 - 2);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Loop region overlay
    const ls = config.loopStart ?? 0;
    const ll = config.loopLength ?? 0;
    if (ll > 0 && ls >= 0 && ls < data.length) {
      const x1 = Math.floor((ls / data.length) * W);
      const x2 = Math.floor(((ls + ll) / data.length) * W);
      ctx.fillStyle = accent + '22';
      ctx.fillRect(x1, 0, Math.max(1, x2 - x1), H);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1 + 0.5, 0);
      ctx.lineTo(x1 + 0.5, H);
      ctx.moveTo(x2 + 0.5, 0);
      ctx.lineTo(x2 + 0.5, H);
      ctx.stroke();
    }
  }, [activeTab, config.pcmData, config.loopStart, config.loopLength, accent, dim]);

  const renderPcm = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="PCM Sample (read-only preview)" />
        <canvas
          ref={pcmCanvasRef}
          width={480}
          height={96}
          className="w-full rounded"
          style={{ background: '#0a0012', border: `1px solid ${dim}`, imageRendering: 'pixelated' }}
        />
        <div className="mt-2 text-[10px] font-mono" style={{ color: '#888' }}>
          {pcmLen > 0
            ? `${pcmLen.toLocaleString()} bytes (${(pcmLen / 1024).toFixed(2)} KB)`
            : 'No PCM data loaded'}
        </div>
      </div>

      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Loop Points" />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: accent }}>
              Loop Start
            </span>
            <input
              type="number"
              min={0}
              max={Math.max(0, pcmLen)}
              step={1}
              value={config.loopStart ?? 0}
              onChange={(e) => {
                const raw = parseInt(e.target.value, 10);
                const v = Number.isFinite(raw) ? Math.max(0, Math.min(pcmLen, raw)) : 0;
                upd('loopStart', v);
              }}
              className="px-2 py-1 text-xs font-mono rounded"
              style={{
                background: '#0a0012',
                color: accent,
                border: `1px solid ${dim}`,
              }}
            />
            <span className="text-[9px] font-mono" style={{ color: '#666' }}>
              0 .. {pcmLen}
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: accent }}>
              Loop Length
            </span>
            <input
              type="number"
              min={0}
              max={Math.max(0, pcmLen)}
              step={1}
              value={config.loopLength ?? 0}
              onChange={(e) => {
                const raw = parseInt(e.target.value, 10);
                const v = Number.isFinite(raw) ? Math.max(0, Math.min(pcmLen, raw)) : 0;
                upd('loopLength', v);
              }}
              className="px-2 py-1 text-xs font-mono rounded"
              style={{
                background: '#0a0012',
                color: accent,
                border: `1px solid ${dim}`,
              }}
            />
            <span className="text-[9px] font-mono" style={{ color: '#666' }}>
              0 .. {pcmLen} (0 = no loop)
            </span>
          </label>
        </div>
      </div>

      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Finetune" />
        <div className="flex items-center gap-4">
          <Knob
            value={config.finetune ?? 0}
            min={-8}
            max={7}
            step={1}
            onChange={(v) => upd('finetune', Math.round(v))}
            label="Finetune"
            color={knob}
            formatValue={(v) => {
              const n = Math.round(v);
              return n > 0 ? `+${n}` : n.toString();
            }}
          />
          <div className="text-[10px] font-mono" style={{ color: '#888' }}>
            -8 .. +7 (signed nibble)
          </div>
        </div>
      </div>
    </div>
  );

  const TABS: { id: SMTab; label: string }[] = [
    { id: 'main',     label: 'Main' },
    { id: 'filter',   label: 'Filter' },
    { id: 'arpeggio', label: 'Arpeggio' },
    ...(config.type === 'pcm' ? [{ id: 'pcm' as SMTab, label: 'PCM Sample' }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center border-b" style={{ borderColor: dim }}>
        {TABS.map(({ id, label }) => (
          <button key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accent : '#666',
              borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
              background: activeTab === id ? (isCyan ? '#041510' : '#1a0010') : 'transparent',
            }}>
            {label}
          </button>
        ))}
        {uadeChipRam && (
          <button
            onClick={() => {
              const editor = getEditor();
              if (editor && uadeChipRam) {
                editor.exportModule(uadeChipRam.moduleBase, uadeChipRam.moduleSize, 'sidmon2_instrument.sm2')
                  .catch(console.error);
              }
            }}
            className="ml-auto flex items-center gap-1 px-2 py-1 text-[10px] font-mono bg-dark-bgSecondary hover:bg-dark-bg border rounded transition-colors"
            title="Export module with current edits"
          >
            <Download size={10} />
            Export .sm2 (Amiga)
          </button>
        )}
      </div>
      {activeTab === 'main'     && renderMain()}
      {activeTab === 'filter'   && renderFilter()}
      {activeTab === 'arpeggio' && renderArpeggio()}
      {activeTab === 'pcm'      && renderPcm()}
    </div>
  );
};
