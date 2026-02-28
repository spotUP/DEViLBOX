/**
 * DigMugControls.tsx — Digital Mugician (V1/V2) instrument editor
 *
 * Exposes all DigMugConfig parameters: 4-wave selector, blend position,
 * morph speed, volume, vibrato, and arpeggio table.
 *
 * Enhanced with:
 *  - WaveformThumbnail: mini visual previews on each of the 4 wave slots
 *  - SequenceEditor: proper step-sequence editor for the arpeggio table
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { DigMugConfig, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import { SequenceEditor, WaveformThumbnail } from '@components/instruments/shared';
import type { SequencePreset } from '@components/instruments/shared';
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

const ARP_PRESETS: SequencePreset[] = [
  { name: 'Major',  data: [0, 4, 7, 0, 4, 7, 12, 12, 0, 4, 7, 0, 4, 7, 12, 12], loop: 0 },
  { name: 'Minor',  data: [0, 3, 7, 0, 3, 7, 12, 12, 0, 3, 7, 0, 3, 7, 12, 12], loop: 0 },
  { name: 'Octave', data: [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12], loop: 0 },
  { name: 'Power',  data: [0, 7, 12, 7, 0, 7, 12, 7, 0, 7, 12, 7, 0, 7, 12, 7], loop: 0 },
  { name: 'Clear',  data: new Array(16).fill(0) },
];

// ── Component ──────────────────────────────────────────────────────────────────

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

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#aaff44';
  const knob    = isCyan ? '#00ffff' : '#bbff66';
  const dim     = isCyan ? '#004444' : '#1a3300';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#0a1400] border-lime-900/30';

  const upd = useCallback(<K extends keyof DigMugConfig>(key: K, value: DigMugConfig[K]) => {
    onChange({ [key]: value } as Partial<DigMugConfig>);
  }, [onChange]);

  /**
   * Like `upd`, but also writes the new value to chip RAM when a UADE context
   * is active. byteOffset is relative to instrBase.
   *
   * Chip RAM layout for DigMug 16-byte instrument struct:
   *   +2  volume (uint8, 0-63)
   *   +14 effectSpeed / arpSpeed (uint8; arpSpeed 0-15 → stored as ×17, 0-255)
   */
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

  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: accent, opacity: 0.7 }}>
      {label}
    </div>
  );

  const updateWavetable = useCallback((slot: 0 | 1 | 2 | 3, value: number) => {
    const wt: [number, number, number, number] = [...configRef.current.wavetable] as [number, number, number, number];
    wt[slot] = value;
    onChange({ wavetable: wt });
  }, [onChange]);

  // ── MAIN TAB ──────────────────────────────────────────────────────────────
  const renderMain = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* 4-wave slot selectors with thumbnails */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Wavetable Slots (4 waves)" />

        {/* Slot buttons — each shows a thumbnail of the selected wave */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {([0, 1, 2, 3] as const).map((slot) => {
            const waveIdx = config.wavetable[slot];
            const waveDef = DM_WAVES[waveIdx] ?? DM_WAVES[0];
            return (
              <div key={slot} className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-500 text-center">Wave {slot + 1}</span>
                {/* Waveform preview */}
                <div className="rounded overflow-hidden border"
                  style={{ borderColor: dim }}>
                  <WaveformThumbnail
                    type={waveDef.type}
                    width={72} height={28}
                    color={accent}
                    style="line"
                  />
                </div>
                {/* Select dropdown below preview */}
                <select
                  value={waveIdx}
                  onChange={(e) => updateWavetable(slot, parseInt(e.target.value))}
                  className="text-[9px] font-mono border rounded px-1 py-0.5"
                  style={{ background: '#0a0f00', borderColor: dim, color: accent }}>
                  {DM_WAVES.map((w, i) => (
                    <option key={i} value={i} style={{ background: '#111', color: '#ccc' }}>
                      {i}: {w.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        {/* Blend + Morph controls */}
        <div className="flex gap-4">
          <Knob value={config.waveBlend} min={0} max={63} step={1}
            onChange={(v) => upd('waveBlend', Math.round(v))}
            label="Blend Pos" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.waveSpeed} min={0} max={63} step={1}
            onChange={(v) => upd('waveSpeed', Math.round(v))}
            label="Morph Spd" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>

        {/* Blend position bar */}
        <div className="mt-2 h-3 rounded overflow-hidden" style={{ background: '#111', border: `1px solid ${dim}` }}>
          <div className="h-full transition-all" style={{
            width: `${(config.waveBlend / 63) * 100}%`,
            background: `linear-gradient(to right, ${accent}88, ${accent})`,
          }} />
        </div>
        <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
          <span>W1</span><span>W2</span><span>W3</span><span>W4</span>
        </div>
      </div>

      {/* Volume + Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Volume & Vibrato" />
        <div className="flex gap-4">
          <Knob value={config.volume} min={0} max={64} step={1}
            onChange={(v) => updWithChipRam('volume', Math.round(v), 2)}
            label="Volume" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibSpeed} min={0} max={63} step={1}
            onChange={(v) => upd('vibSpeed', Math.round(v))}
            label="Vib Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibDepth} min={0} max={63} step={1}
            onChange={(v) => upd('vibDepth', Math.round(v))}
            label="Vib Depth" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>
    </div>
  );

  // ── ARPEGGIO TAB ──────────────────────────────────────────────────────────
  const renderArpeggio = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel label="Arpeggio Speed" />
          <Knob value={config.arpSpeed} min={0} max={15} step={1}
            onChange={(v) => {
              const val = Math.round(v);
              upd('arpSpeed', val);
              // chip RAM effectSpeed (+14) is 0-255; arpSpeed 0-15 → × 17
              if (uadeChipRam) {
                void getEditor().writeU8(uadeChipRam.instrBase + 14, Math.round(val * 17) & 0xFF);
              }
            }}
            label="Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>

        <SequenceEditor
          label="Arpeggio Table"
          data={config.arpTable}
          onChange={(d) => upd('arpTable', d)}
          min={-64} max={63}
          bipolar
          fixedLength
          showNoteNames
          presets={ARP_PRESETS}
          playbackPosition={arpPlaybackPosition}
          color={accent}
          height={100}
        />
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
