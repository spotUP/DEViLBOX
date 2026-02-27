/**
 * DavidWhittakerControls.tsx — David Whittaker instrument editor
 *
 * Exposes all DavidWhittakerConfig parameters: volume, relative tuning,
 * vibrato, and editable volume/frequency sequences.
 *
 * Enhanced with SequenceEditor (replaces SVG mini-charts + raw grids).
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { DavidWhittakerConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import { SequenceEditor } from '@components/instruments/shared';
import type { SequencePreset } from '@components/instruments/shared';

interface DavidWhittakerControlsProps {
  config: DavidWhittakerConfig;
  onChange: (updates: Partial<DavidWhittakerConfig>) => void;
  volseqPlaybackPosition?: number;
  frqseqPlaybackPosition?: number;
}

type DWTab = 'main' | 'sequences';

// ── Presets ────────────────────────────────────────────────────────────────────

const VOLSEQ_PRESETS: SequencePreset[] = [
  { name: 'Attack',  data: [0, 10, 20, 35, 50, 60, 64, 58, 50, 42], loop: 9 },
  { name: 'Organ',   data: [64, 60, 58, 55, 52, 50, 48, 46], loop: 7 },
  { name: 'Pluck',   data: [64, 50, 38, 28, 20, 14, 9, 5, 2, 0] },
  { name: 'Pad',     data: [0, 12, 26, 42, 56, 64], loop: 5 },
  { name: 'Full',    data: [64], loop: 0 },
];

const FRQSEQ_PRESETS: SequencePreset[] = [
  { name: 'Vibrato',    data: [0, 3, 5, 3, 0, -3, -5, -3], loop: 0 },
  { name: 'Slide Up',   data: [-12, -9, -6, -3, 0], loop: 4 },
  { name: 'Slide Down', data: [12, 9, 6, 3, 0], loop: 4 },
  { name: 'Tremolo',    data: [0, 6, 12, 6], loop: 0 },
  { name: 'Flat',       data: [0] },
];

// ── Component ──────────────────────────────────────────────────────────────────

export const DavidWhittakerControls: React.FC<DavidWhittakerControlsProps> = ({
  config,
  onChange,
  volseqPlaybackPosition,
  frqseqPlaybackPosition,
}) => {
  const [activeTab, setActiveTab] = useState<DWTab>('main');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#44aaff';
  const knob    = isCyan ? '#00ffff' : '#66bbff';
  const dim     = isCyan ? '#004444' : '#001833';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#000e1a] border-blue-900/30';

  const upd = useCallback(<K extends keyof DavidWhittakerConfig>(key: K, value: DavidWhittakerConfig[K]) => {
    onChange({ [key]: value } as Partial<DavidWhittakerConfig>);
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
  const renderMain = () => {
    const relVal = config.relative ?? 8364;
    const approxHz = Math.round(3579545 / relVal);

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {/* Volume & Tuning */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Volume & Tuning" />
          <div className="flex items-start gap-6">
            <Knob
              value={config.defaultVolume ?? 64}
              min={0} max={64} step={1}
              onChange={(v) => upd('defaultVolume', Math.round(v))}
              label="Volume" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()}
            />
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: accent, opacity: 0.7 }}>
                Relative
              </label>
              <input
                type="number"
                value={relVal}
                min={256} max={65535}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val)) upd('relative', Math.max(256, Math.min(65535, val)));
                }}
                className="text-[11px] font-mono border rounded px-2 py-1"
                style={{ width: '80px', background: '#060a0f', borderColor: dim, color: accent }}
              />
              <span className="text-[10px] text-gray-500">
                3579545 / value ≈ {approxHz} Hz
              </span>
            </div>
          </div>
        </div>

        {/* Vibrato */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Vibrato" />
          <div className="flex gap-4">
            <Knob
              value={config.vibratoSpeed ?? 0}
              min={0} max={255} step={1}
              onChange={(v) => upd('vibratoSpeed', Math.round(v))}
              label="Speed" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()}
            />
            <Knob
              value={config.vibratoDepth ?? 0}
              min={0} max={255} step={1}
              onChange={(v) => upd('vibratoDepth', Math.round(v))}
              label="Depth" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()}
            />
          </div>
        </div>
      </div>
    );
  };

  // ── SEQUENCES TAB ─────────────────────────────────────────────────────────
  const renderSequences = () => {
    const volseq = config.volseq ?? [];
    const frqseq = config.frqseq ?? [];

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

        {/* Volume Sequence — 0-64 volume levels */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Volume Sequence" />
          <SequenceEditor
            label="volseq"
            data={volseq.map(v => Math.max(0, v))}  // clamp -128 loop markers
            onChange={(d) => upd('volseq', d)}
            min={0} max={64}
            presets={VOLSEQ_PRESETS}
            playbackPosition={volseqPlaybackPosition}
            color={accent}
            height={80}
          />
          <p className="text-[9px] text-gray-600 mt-1">
            Volume level per step (0–64). Sequence loops at the loop point.
          </p>
        </div>

        {/* Frequency Sequence — semitone offsets */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="Frequency Sequence" />
          <SequenceEditor
            label="frqseq"
            data={frqseq}
            onChange={(d) => upd('frqseq', d)}
            min={-127} max={127}
            bipolar
            showNoteNames
            presets={FRQSEQ_PRESETS}
            playbackPosition={frqseqPlaybackPosition}
            color={knob}
            height={80}
          />
          <p className="text-[9px] text-gray-600 mt-1">
            Semitone offsets from note pitch per step. Use the loop marker (L) to set loop point.
          </p>
        </div>
      </div>
    );
  };

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
