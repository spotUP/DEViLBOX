/**
 * HippelCoSoControls.tsx — Chris Hülsbeck (Hippel CoSo) instrument editor
 *
 * Exposes all HippelCoSoConfig parameters: timing, vibrato, and editable
 * frequency/volume sequences using the shared SequenceEditor component.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { HippelCoSoConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import { SequenceEditor } from '@components/instruments/shared';
import type { SequencePreset } from '@components/instruments/shared';

interface HippelCoSoControlsProps {
  config: HippelCoSoConfig;
  onChange: (updates: Partial<HippelCoSoConfig>) => void;
  fseqPlaybackPosition?: number;
  vseqPlaybackPosition?: number;
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
}) => {
  const [activeTab, setActiveTab] = useState<HCSTab>('main');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#44aaff';
  const knob    = isCyan ? '#00ffff' : '#66bbff';
  const dim     = isCyan ? '#004444' : '#001833';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#000e1a] border-blue-900/30';

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
            onChange={(v) => upd('volSpeed', Math.round(v))}
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
            onChange={(v) => upd('vibDelay', Math.round(v))}
            label="Delay" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()}
          />
          <Knob
            value={config.vibSpeed}
            min={-128} max={127} step={1}
            onChange={(v) => upd('vibSpeed', Math.round(v))}
            label="Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()}
          />
          <Knob
            value={config.vibDepth}
            min={0} max={255} step={1}
            onChange={(v) => upd('vibDepth', Math.round(v))}
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
      <div className="flex border-b" style={{ borderColor: dim }}>
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
      </div>
      {activeTab === 'main'      && renderMain()}
      {activeTab === 'sequences' && renderSequences()}
    </div>
  );
};
