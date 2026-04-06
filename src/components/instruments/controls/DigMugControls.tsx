/**
 * DigMugControls.tsx -- Digital Mugician (V1/V2) instrument editor
 *
 * Exposes all DigMugConfig parameters: 4-wave selector, blend position,
 * morph speed, volume, vibrato, and arpeggio table.
 *
 * Enhanced with:
 *  - WaveformThumbnail: mini visual previews on each of the 4 wave slots
 *  - PatternEditorCanvas: vertical tracker-style arpeggio table editor
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { DigMugConfig, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { SectionLabel, WaveformThumbnail } from '@components/instruments/shared';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import type { ColumnDef, FormatChannel, FormatCell, OnCellChange } from '@/components/shared/format-editor-types';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';

interface DigMugControlsProps {
  config: DigMugConfig;
  onChange: (updates: Partial<DigMugConfig>) => void;
  arpPlaybackPosition?: number;
  /** Present when this instrument was loaded via UADE's native DigMug parser. */
  uadeChipRam?: UADEChipRamInfo;
}

type DMTab = 'main' | 'arpeggio';

// Built-in Digital Mugician waveform names + shape hints
const DM_WAVES: { name: string; type: 'sine' | 'triangle' | 'saw' | 'square' | 'pulse25' | 'pulse12' | 'noise' }[] = [
  { name: 'Sine',      type: 'sine'     },
  { name: 'Triangle',  type: 'triangle' },
  { name: 'Sawtooth',  type: 'saw'      },
  { name: 'Square',    type: 'square'   },
  { name: 'Pulse 25%', type: 'pulse25'  },
  { name: 'Pulse 12%', type: 'pulse12'  },
  { name: 'Noise',     type: 'noise'    },
  { name: 'Organ 1',   type: 'sine'     },
  { name: 'Organ 2',   type: 'sine'     },
  { name: 'Brass',     type: 'saw'      },
  { name: 'String',    type: 'saw'      },
  { name: 'Bell',      type: 'sine'     },
  { name: 'Piano',     type: 'triangle' },
  { name: 'Flute',     type: 'sine'     },
  { name: 'Reed',      type: 'square'   },
];

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
    color: '#aaff44',
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
    next[row] = value > 127 ? value - 256 : (value > 63 ? value - 128 : value);
    onChangeData(next);
  };
}

// -- Component ---

export const DigMugControls: React.FC<DigMugControlsProps> = ({
  config,
  onChange,
  arpPlaybackPosition,
  uadeChipRam,
}) => {
  const [activeTab, setActiveTab] = useState<DMTab>('main');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const chipEditorRef = useRef<UADEChipEditor | null>(null);
  const getEditor = useCallback(() => {
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }, []);

  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors('#aaff44', { knob: '#bbff66', dim: '#1a3300' });

  const upd = useCallback(<K extends keyof DigMugConfig>(key: K, value: DigMugConfig[K]) => {
    onChange({ [key]: value } as Partial<DigMugConfig>);
  }, [onChange]);

  const updWithChipRam = useCallback(
    (key: keyof DigMugConfig, value: number, byteOffset: number) => {
      upd(key as Parameters<typeof upd>[0], value as Parameters<typeof upd>[1]);
      if (uadeChipRam) {
        void getEditor().writeU8(uadeChipRam.instrBase + byteOffset, value & 0xFF);
      }
    },
    [upd, uadeChipRam, getEditor],
  );

  const handleExport = useCallback(async () => {
    if (!uadeChipRam) return;
    try {
      await getEditor().exportModule(
        uadeChipRam.moduleBase,
        uadeChipRam.moduleSize,
        'digmug_module.dm',
      );
    } catch (e) { console.error('[DigMugControls] Export failed:', e); }
  }, [uadeChipRam, getEditor]);

  const updateWavetable = useCallback((slot: 0 | 1 | 2 | 3, value: number) => {
    const wt: [number, number, number, number] = [...configRef.current.wavetable] as [number, number, number, number];
    wt[slot] = value;
    onChange({ wavetable: wt });

    if (uadeChipRam) {
      const byteOffset = slot === 0 ? 0 : slot === 2 ? 12 : slot === 3 ? 13 : -1;
      if (byteOffset >= 0) {
        void getEditor().writeU8(uadeChipRam.instrBase + byteOffset, value & 0xFF);
      }
    }
  }, [onChange, uadeChipRam, getEditor]);

  // -- MAIN TAB ---
  const renderMain = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Wavetable Slots (4 waves)" />
        <div className="grid grid-cols-4 gap-2 mb-3">
          {([0, 1, 2, 3] as const).map((slot) => {
            const waveIdx = config.wavetable[slot];
            const waveDef = DM_WAVES[waveIdx] ?? DM_WAVES[0];
            return (
              <div key={slot} className="flex flex-col gap-1">
                <span className="text-[10px] text-text-muted text-center">Wave {slot + 1}</span>
                <div className="rounded overflow-hidden border" style={{ borderColor: dim }}>
                  <WaveformThumbnail type={waveDef.type} width={72} height={28} color={accent} style="line" />
                </div>
                <select
                  value={waveIdx}
                  onChange={(e) => updateWavetable(slot, parseInt(e.target.value))}
                  className="text-[9px] font-mono border rounded px-1 py-0.5"
                  style={{ background: '#0a0f00', borderColor: dim, color: accent }}>
                  {DM_WAVES.map((w, i) => (
                    <option key={i} value={i} style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}>
                      {i}: {w.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4">
          <Knob value={config.waveBlend} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('waveBlend', Math.round(v), 6)}
            label="Blend Pos" color={knob} formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.waveSpeed} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('waveSpeed', Math.round(v), 14)}
            label="Morph Spd" color={knob} formatValue={(v) => Math.round(v).toString()} />
        </div>
        <div className="mt-2 h-3 rounded overflow-hidden" style={{ background: 'var(--color-bg-secondary)', border: `1px solid ${dim}` }}>
          <div className="h-full transition-all" style={{
            width: `${(config.waveBlend / 63) * 100}%`,
            background: `linear-gradient(to right, ${accent}88, ${accent})`,
          }} />
        </div>
        <div className="flex justify-between text-[9px] text-text-muted mt-0.5">
          <span>W1</span><span>W2</span><span>W3</span><span>W4</span>
        </div>
      </div>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Volume & Vibrato" />
        <div className="flex gap-4">
          <Knob value={config.volume} min={0} max={64} step={1}
            onChange={(v) => updWithChipRam('volume', Math.round(v), 2)}
            label="Volume" color={knob} size="md" formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibSpeed} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('vibSpeed', Math.round(v), 5)}
            label="Vib Speed" color={knob} formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibDepth} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('vibDepth', Math.round(v), 7)}
            label="Vib Depth" color={knob} formatValue={(v) => Math.round(v).toString()} />
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
          <Knob value={config.arpSpeed} min={0} max={15} step={1}
            onChange={(v) => {
              const val = Math.round(v);
              upd('arpSpeed', val);
              if (uadeChipRam) {
                void getEditor().writeU8(uadeChipRam.instrBase + 14, Math.round(val * 17) & 0xFF);
              }
            }}
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
              background: activeTab === id ? (isCyan ? '#041510' : '#0a1400') : 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'main'     && renderMain()}
      {activeTab === 'arpeggio' && renderArpeggio()}
      {uadeChipRam && (
        <div className="flex justify-end px-3 py-2 border-t border-opacity-30"
          style={{ borderColor: dim }}>
          <button
            className="text-[10px] px-2 py-1 rounded opacity-70 hover:opacity-100 transition-colors"
            style={{ background: 'rgba(40,80,20,0.3)', color: '#aaff44' }}
            onClick={() => void handleExport()}
          >
            Export .dm (Amiga)
          </button>
        </div>
      )}
    </div>
  );
};
