/**
 * HippelCoSoControls.tsx — Chris Hülsbeck (Hippel CoSo) instrument editor
 *
 * Exposes all HippelCoSoConfig parameters: timing, vibrato, and editable
 * frequency/volume sequences using the shared SequenceEditor component.
 *
 * When loaded via UADE (uadeChipRam present), scalar params that map directly
 * to bytes in the volseq header are written back to chip RAM so UADE picks them
 * up on the next note trigger. An export button is also shown.
 *
 * HippelCoSo volseq header byte layout (offset from instrBase):
 *   +0  : volSpeed  (uint8)      ✓ written
 *   +1  : fseqIdx   (int8)       — skip (index into fseq table, not a user param)
 *   +2  : vibSpeed  (int8)       ✓ written via writeS8
 *   +3  : vibDepth  (int8 mag)   ✓ written (stored as negative depth in hardware)
 *   +4  : vibDelay  (uint8)      ✓ written
 *   +5..: vseq data (variable)   — skip (variable-length sequence data)
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { HippelCoSoConfig, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import { SequenceEditor } from '@components/instruments/shared';
import type { SequencePreset } from '@components/instruments/shared';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';
import { Download } from 'lucide-react';

interface HippelCoSoControlsProps {
  config: HippelCoSoConfig;
  onChange: (updates: Partial<HippelCoSoConfig>) => void;
  fseqPlaybackPosition?: number;
  vseqPlaybackPosition?: number;
  /** Present when this instrument was loaded via UADE's native HippelCoSo parser. */
  uadeChipRam?: UADEChipRamInfo;
}

type HCSTab = 'main' | 'sequences';

// ── Presets ────────────────────────────────────────────────────────────────────

const FSEQ_PRESETS: SequencePreset[] = [
  { name: 'Vibrato',    data: [0, 3, 5, 3, 0, -3, -5, -3], loop: 0 },
  { name: 'Slide Up',   data: [-12, -9, -6, -3, 0], loop: 4 },
  { name: 'Slide Dn',   data: [12, 9, 6, 3, 0], loop: 4 },
  { name: 'Tremolo',    data: [0, 6, 12, 6], loop: 0 },
  { name: 'Flat',       data: [0] },
];

const VSEQ_PRESETS: SequencePreset[] = [
  { name: 'Attack-Dec', data: [0, 16, 32, 48, 63, 48, 32, 20, 12, 8, 4, 2, 1, 0] },
  { name: 'Organ',      data: [63, 63, 50, 40, 38, 35, 33, 30], loop: 7 },
  { name: 'Pluck',      data: [63, 50, 40, 30, 22, 16, 10, 6, 3, 1, 0] },
  { name: 'Pad',        data: [0, 8, 18, 30, 42, 54, 63], loop: 6 },
  { name: 'Full',       data: [63], loop: 0 },
];

// ── Component ──────────────────────────────────────────────────────────────────

export const HippelCoSoControls: React.FC<HippelCoSoControlsProps> = ({
  config,
  onChange,
  fseqPlaybackPosition,
  vseqPlaybackPosition,
  uadeChipRam,
}) => {
  const [activeTab, setActiveTab] = useState<HCSTab>('main');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const chipEditorRef = useRef<UADEChipEditor | null>(null);
  function getEditor(): UADEChipEditor | null {
    if (!uadeChipRam) return null;
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#44aaff';
  const knob    = isCyan ? '#00ffff' : '#66bbff';
  const dim     = isCyan ? '#004444' : '#001833';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#000e1a] border-blue-900/30';

  /**
   * Like `upd`, but also writes a single byte to chip RAM when a UADE context is
   * active. byteOffset is relative to instrBase (the volseq header address).
   */
  const updU8WithChipRam = useCallback(
    (key: keyof HippelCoSoConfig, value: HippelCoSoConfig[keyof HippelCoSoConfig], byteOffset: number) => {
      onChange({ [key]: value } as Partial<HippelCoSoConfig>);
      if (uadeChipRam && typeof value === 'number') {
        const editor = getEditor();
        if (editor) {
          void editor.writeU8(uadeChipRam.instrBase + byteOffset, value & 0xFF);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, uadeChipRam],
  );

  /**
   * Like updU8WithChipRam but writes a signed byte (two's complement).
   */
  const updS8WithChipRam = useCallback(
    (key: keyof HippelCoSoConfig, value: HippelCoSoConfig[keyof HippelCoSoConfig], byteOffset: number) => {
      onChange({ [key]: value } as Partial<HippelCoSoConfig>);
      if (uadeChipRam && typeof value === 'number') {
        const editor = getEditor();
        if (editor) {
          void editor.writeU8(uadeChipRam.instrBase + byteOffset, value < 0 ? (256 + value) : value);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, uadeChipRam],
  );

  const upd = useCallback(<K extends keyof HippelCoSoConfig>(key: K, value: HippelCoSoConfig[K]) => {
    onChange({ [key]: value } as Partial<HippelCoSoConfig>);
  }, [onChange]);

  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div
      className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: accent, opacity: 0.7 }}
    >
      {label}
    </div>
  );

  // ── MAIN TAB ──────────────────────────────────────────────────────────────
  const renderMain = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {/* Timing */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Timing" />
        <div className="flex gap-4">
          <Knob
            value={config.volSpeed}
            min={1} max={16} step={1}
            onChange={(v) => updU8WithChipRam('volSpeed', Math.round(v), 0)}
            label="Vol Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()}
          />
        </div>
        <span className="text-[10px] text-gray-600 mt-1 block">ticks per vseq step</span>
      </div>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Vibrato" />
        <div className="flex gap-4">
          <Knob
            value={config.vibDelay}
            min={0} max={255} step={1}
            onChange={(v) => updU8WithChipRam('vibDelay', Math.round(v), 4)}
            label="Delay" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()}
          />
          <Knob
            value={config.vibSpeed}
            min={-128} max={127} step={1}
            onChange={(v) => updS8WithChipRam('vibSpeed', Math.round(v), 2)}
            label="Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()}
          />
          <Knob
            value={config.vibDepth}
            min={0} max={255} step={1}
            onChange={(v) => updU8WithChipRam('vibDepth', Math.round(v), 3)}
            label="Depth" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()}
          />
        </div>
      </div>
    </div>
  );

  // ── SEQUENCES TAB ─────────────────────────────────────────────────────────
  const renderSequences = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Frequency Sequence — relative pitch offsets (semitones) */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Frequency Sequence" />
        <SequenceEditor
          label="fseq"
          data={config.fseq}
          onChange={(d) => upd('fseq', d)}
          min={-127} max={127}
          bipolar
          showNoteNames
          presets={FSEQ_PRESETS}
          playbackPosition={fseqPlaybackPosition}
          color={accent}
          height={80}
        />
        <p className="text-[9px] text-gray-600 mt-1">
          Relative pitch offsets per step (semitones). Use the loop marker (L) to set loop point.
        </p>
      </div>

      {/* Volume Sequence — 0-63 volume levels */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Volume Sequence" />
        <SequenceEditor
          label="vseq"
          data={config.vseq.map(v => Math.max(0, v))}  // clamp -128 loop markers for display
          onChange={(d) => upd('vseq', d)}
          min={0} max={63}
          presets={VSEQ_PRESETS}
          playbackPosition={vseqPlaybackPosition}
          color={knob}
          height={80}
        />
        <p className="text-[9px] text-gray-600 mt-1">
          Volume level per step (0–63). Sequence loops at the loop point.
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center border-b" style={{ borderColor: dim }}>
        {([['main', 'Parameters'], ['sequences', 'Sequences']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accent : '#666',
              borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
              background: activeTab === id ? (isCyan ? '#041510' : '#000e1a') : 'transparent',
            }}
          >
            {label}
          </button>
        ))}
        {uadeChipRam && (
          <button
            onClick={() => {
              const editor = getEditor();
              if (editor && uadeChipRam) {
                editor.exportModule(uadeChipRam.moduleBase, uadeChipRam.moduleSize, 'module.hipc')
                  .catch(console.error);
              }
            }}
            className="ml-auto flex items-center gap-1 px-2 py-1 mr-2 text-[10px] font-mono bg-dark-bgSecondary hover:bg-dark-bg border border-dark-border rounded transition-colors"
            title="Export module with current edits"
            style={{ color: accent }}
          >
            <Download size={10} />
            Export .hipc
          </button>
        )}
      </div>
      {activeTab === 'main'      && renderMain()}
      {activeTab === 'sequences' && renderSequences()}
    </div>
  );
};
