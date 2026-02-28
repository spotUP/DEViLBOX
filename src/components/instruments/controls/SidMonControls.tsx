/**
 * SidMonControls.tsx — SidMon II (SID-like synthesis) instrument editor
 *
 * Exposes all SidMonConfig parameters: waveform selector, ADSR, filter,
 * vibrato, and arpeggio table.
 *
 * Enhanced with:
 *  - WaveformThumbnail: visual previews on waveform selector buttons
 *  - EnvelopeVisualization mode="adsr": SID-format ADSR curve
 *  - SequenceEditor: arpeggio table editor
 *
 * When loaded via UADE (uadeChipRam present), scalar params that have a direct
 * 1-byte equivalent in the SidMon 2 instrument header are written to chip RAM
 * so UADE picks them up on the next note trigger.
 *
 * SidMon 2 instrument byte layout (offset from instrBase, 32 bytes total):
 *
 *   +0   : wave (×16 = table offset)       — skipped
 *   +1   : waveLen                          — skipped
 *   +2   : waveSpeed                        — skipped
 *   +3   : waveDelay                        — skipped
 *   +4   : arpeggio (×16 = table offset)   — skipped (separate table)
 *   +5   : arpeggioLen                      — skipped
 *   +6   : arpeggioSpeed                    ✓ written (arpSpeed * 16)
 *   +7   : arpeggioDelay                    — skipped
 *   +8   : vibrato (×16 = table offset)    — skipped
 *   +9   : vibratoLen (→ vibDepth in UI)   ✓ written
 *   +10  : vibratoSpeed                     ✓ written
 *   +11  : vibratoDelay                     ✓ written
 *   +12  : pitchBend (signed)              — skipped
 *   +13  : pitchBendDelay                  — skipped
 *   +14..+15 : (skipped)
 *   +16  : attackMax                        — skipped (NOT SID attack)
 *   +17  : attackSpeed → SID attack = 15 - floor(raw*16/256)   ✓ written
 *   +18  : decayMin   → SID sustain = round(raw*15/255)        ✓ written
 *   +19  : decaySpeed → SID decay   = 15 - floor(raw*16/256)  ✓ written
 *   +20  : sustain hold counter                                 — skipped
 *   +21  : releaseMin                                           — skipped
 *   +22  : releaseSpeed → SID release = 15 - floor(raw*16/256) ✓ written
 *   +23..+31 : (skipped)
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { SidMonConfig, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import {
  EnvelopeVisualization,
  FilterFrequencyResponse,
  SequenceEditor,
  WaveformThumbnail,
} from '@components/instruments/shared';
import type { FilterType } from '@components/instruments/shared';
import type { SequencePreset } from '@components/instruments/shared';
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

type SMTab = 'main' | 'filter' | 'arpeggio';

// SID waveforms with visual shape hints
const WAVEFORMS: { name: string; type: 'triangle' | 'saw' | 'square' | 'noise' }[] = [
  { name: 'Triangle', type: 'triangle' },
  { name: 'Sawtooth', type: 'saw'      },
  { name: 'Pulse',    type: 'square'   },
  { name: 'Noise',    type: 'noise'    },
];

const FILTER_MODE_NAMES = ['LP', 'HP', 'BP'];
const FILTER_MODE_TYPES: FilterType[] = ['lowpass', 'highpass', 'bandpass'];

const ARP_PRESETS: SequencePreset[] = [
  { name: 'Major',  data: [0, 4, 7, 0, 4, 7, 12, 12, 0, 4, 7, 0, 4, 7, 12, 12], loop: 0 },
  { name: 'Minor',  data: [0, 3, 7, 0, 3, 7, 12, 12, 0, 3, 7, 0, 3, 7, 12, 12], loop: 0 },
  { name: 'Octave', data: [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12], loop: 0 },
  { name: 'Power',  data: [0, 7, 12, 7, 0, 7, 12, 7, 0, 7, 12, 7, 0, 7, 12, 7], loop: 0 },
  { name: 'Clear',  data: new Array(16).fill(0) },
];

// ── Component ──────────────────────────────────────────────────────────────────

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

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#ff66aa';
  const knob    = isCyan ? '#00ffff' : '#ff88bb';
  const dim     = isCyan ? '#004444' : '#330022';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#1a0010] border-pink-900/30';

  const upd = useCallback(<K extends keyof SidMonConfig>(key: K, value: SidMonConfig[K]) => {
    onChange({ [key]: value } as Partial<SidMonConfig>);
  }, [onChange]);

  /**
   * Like `upd`, but also writes a chip RAM byte when a UADE context is active.
   * chipWriter receives the editor and instrBase; any async errors are swallowed
   * to avoid interrupting the UI interaction.
   */
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

  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: accent, opacity: 0.7 }}>
      {label}
    </div>
  );

  // ── MAIN TAB ──────────────────────────────────────────────────────────────
  const renderMain = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Waveform — buttons with visual thumbnails */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Waveform" />
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
                <WaveformThumbnail
                  type={wf.type}
                  width={56} height={22}
                  color={active ? accent : '#555'}
                  style="line"
                />
                <span className="text-[9px] font-mono leading-tight"
                  style={{ color: active ? accent : '#555' }}>
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
              label="Pulse Width" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
        )}
      </div>

      {/* ADSR — knobs + SID-format envelope curve */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="ADSR (SID format, 0–15)" />

        {/* Envelope visualization */}
        <div className="mb-3">
          <EnvelopeVisualization
            mode="adsr"
            ar={config.attack}
            dr={config.decay}
            rr={config.release}
            sl={config.sustain}
            tl={0}
            maxRate={15}
            maxTl={1}
            width={320} height={64}
            color={accent}
          />
        </div>

        <div className="flex gap-4">
          <Knob value={config.attack} min={0} max={15} step={1}
            onChange={(v) => {
              const sid = Math.round(v);
              const raw = Math.round((15 - sid) * 256 / 16);
              updWithChipRam('attack', sid, async (ed, base) => {
                await ed.writeU8(base + 17, raw);
              });
            }}
            label="Attack" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.decay} min={0} max={15} step={1}
            onChange={(v) => {
              const sid = Math.round(v);
              const raw = Math.round((15 - sid) * 256 / 16);
              updWithChipRam('decay', sid, async (ed, base) => {
                await ed.writeU8(base + 19, raw);
              });
            }}
            label="Decay" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.sustain} min={0} max={15} step={1}
            onChange={(v) => {
              const sid = Math.round(v);
              const raw = Math.round(sid * 255 / 15);
              updWithChipRam('sustain', sid, async (ed, base) => {
                await ed.writeU8(base + 18, raw);
              });
            }}
            label="Sustain" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.release} min={0} max={15} step={1}
            onChange={(v) => {
              const sid = Math.round(v);
              const raw = Math.round((15 - sid) * 256 / 16);
              updWithChipRam('release', sid, async (ed, base) => {
                await ed.writeU8(base + 22, raw);
              });
            }}
            label="Release" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Vibrato" />
        <div className="flex gap-4">
          <Knob value={config.vibDelay} min={0} max={255} step={1}
            onChange={(v) => updWithChipRam('vibDelay', Math.round(v), async (ed, base) => {
              await ed.writeU8(base + 11, Math.round(v));
            })}
            label="Delay" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibSpeed} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('vibSpeed', Math.round(v), async (ed, base) => {
              await ed.writeU8(base + 10, Math.round(v));
            })}
            label="Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibDepth} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('vibDepth', Math.round(v), async (ed, base) => {
              await ed.writeU8(base + 9, Math.round(v));
            })}
            label="Depth" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>
    </div>
  );

  // ── FILTER TAB ──────────────────────────────────────────────────────────
  const renderFilter = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Filter Mode" />
        <div className="flex gap-2 mb-4">
          {FILTER_MODE_NAMES.map((name, i) => (
            <button key={i}
              onClick={() => upd('filterMode', i)}
              className="flex-1 py-1.5 text-xs font-mono rounded transition-colors"
              style={{
                background: config.filterMode === i ? accent : '#111',
                color: config.filterMode === i ? '#000' : '#666',
                border: `1px solid ${config.filterMode === i ? accent : '#333'}`,
              }}>
              {name}
            </button>
          ))}
        </div>
        <div className="mb-3">
          <FilterFrequencyResponse
            filterType={FILTER_MODE_TYPES[config.filterMode] ?? 'lowpass'}
            cutoff={config.filterCutoff / 255}
            resonance={config.filterResonance / 15}
            poles={2}
            color={accent}
            width={320} height={64}
          />
        </div>
        <div className="flex gap-4">
          <Knob value={config.filterCutoff} min={0} max={255} step={1}
            onChange={(v) => upd('filterCutoff', Math.round(v))}
            label="Cutoff" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.filterResonance} min={0} max={15} step={1}
            onChange={(v) => upd('filterResonance', Math.round(v))}
            label="Resonance" color={knob} size="md"
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
            onChange={(v) => updWithChipRam('arpSpeed', Math.round(v), async (ed, base) => {
              await ed.writeU8(base + 6, Math.round(v) * 16); // scale 0-15 → 0-240
            })}
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

  const TABS: { id: SMTab; label: string }[] = [
    { id: 'main',     label: 'Main' },
    { id: 'filter',   label: 'Filter' },
    { id: 'arpeggio', label: 'Arpeggio' },
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
            className="ml-auto flex items-center gap-1 px-2 py-1 text-[10px] font-mono bg-dark-bgSecondary hover:bg-dark-bg border border-dark-border rounded transition-colors"
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
    </div>
  );
};
