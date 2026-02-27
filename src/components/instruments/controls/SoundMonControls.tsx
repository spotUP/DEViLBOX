/**
 * SoundMonControls.tsx — SoundMon II (Brian Postma) instrument editor
 *
 * Exposes all SoundMonConfig parameters: waveform type, ADSR volumes/speeds,
 * vibrato, arpeggio table, and portamento.
 *
 * Enhanced with:
 *  - EnvelopeVisualization: visual ADSR curve in the Volume Envelope section
 *  - SequenceEditor: proper step-sequence editor for the arpeggio table
 *  - WaveformThumbnail: mini previews on each wave-type button
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { SoundMonConfig } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import {
  EnvelopeVisualization,
  SequenceEditor,
  WaveformThumbnail,
} from '@components/instruments/shared';
import type { SequencePreset } from '@components/instruments/shared';

interface SoundMonControlsProps {
  config: SoundMonConfig;
  onChange: (updates: Partial<SoundMonConfig>) => void;
  /** Optional playback position for arpeggio sequence (undefined = not playing) */
  arpPlaybackPosition?: number;
}

type SMTab = 'main' | 'arpeggio';

// ── Wave type definitions (16 waveforms) ───────────────────────────────────────

interface WaveDef {
  name: string;
  type: 'sine' | 'triangle' | 'saw' | 'square' | 'pulse25' | 'pulse12' | 'noise';
}

const WAVE_DEFS: WaveDef[] = [
  { name: 'Square',  type: 'square'  },
  { name: 'Saw',     type: 'saw'     },
  { name: 'Triangle',type: 'triangle'},
  { name: 'Noise',   type: 'noise'   },
  { name: 'Pulse 1', type: 'pulse25' },
  { name: 'Pulse 2', type: 'pulse12' },
  { name: 'Pulse 3', type: 'pulse12' },
  { name: 'Pulse 4', type: 'pulse25' },
  { name: 'Blend 1', type: 'sine'    },
  { name: 'Blend 2', type: 'triangle'},
  { name: 'Blend 3', type: 'saw'     },
  { name: 'Blend 4', type: 'square'  },
  { name: 'Ring 1',  type: 'sine'    },
  { name: 'Ring 2',  type: 'triangle'},
  { name: 'FM 1',    type: 'sine'    },
  { name: 'FM 2',    type: 'triangle'},
];

// ── Arpeggio presets ────────────────────────────────────────────────────────────

const ARP_PRESETS: SequencePreset[] = [
  { name: 'Major',      data: [0, 4, 7, 0, 4, 7, 12, 12, 0, 4, 7, 0, 4, 7, 12, 12], loop: 0 },
  { name: 'Minor',      data: [0, 3, 7, 0, 3, 7, 12, 12, 0, 3, 7, 0, 3, 7, 12, 12], loop: 0 },
  { name: 'Octave',     data: [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12], loop: 0 },
  { name: 'Power',      data: [0, 7, 12, 7, 0, 7, 12, 7, 0, 7, 12, 7, 0, 7, 12, 7], loop: 0 },
  { name: 'Dom7',       data: [0, 4, 7, 10, 12, 10, 7, 4, 0, 4, 7, 10, 12, 10, 7, 4], loop: 0 },
  { name: 'Ascend Oct', data: [0, 2, 4, 5, 7, 9, 11, 12, 0, 2, 4, 5, 7, 9, 11, 12], loop: 0 },
  { name: 'Trill',      data: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1], loop: 0 },
  { name: 'Clear',      data: new Array(16).fill(0) },
];

// ── Component ──────────────────────────────────────────────────────────────────

export const SoundMonControls: React.FC<SoundMonControlsProps> = ({
  config,
  onChange,
  arpPlaybackPosition,
}) => {
  const [activeTab, setActiveTab] = useState<SMTab>('main');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent  = isCyan ? '#00ffff' : '#44aaff';
  const knob    = isCyan ? '#00ffff' : '#66bbff';
  const dim     = isCyan ? '#004444' : '#001833';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#000e1a] border-blue-900/30';

  const upd = useCallback(<K extends keyof SoundMonConfig>(key: K, value: SoundMonConfig[K]) => {
    onChange({ [key]: value } as Partial<SoundMonConfig>);
  }, [onChange]);

  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: accent, opacity: 0.7 }}>
      {label}
    </div>
  );

  // ── MAIN TAB ──────────────────────────────────────────────────────────────────

  const renderMain = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Waveform selector — 4×4 grid with mini waveform thumbnails */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Waveform" />
        <div className="grid grid-cols-4 gap-1 mb-2">
          {WAVE_DEFS.map((def, i) => {
            const active = config.waveType === i;
            return (
              <button key={i}
                onClick={() => upd('waveType', i)}
                className="flex flex-col items-center gap-0.5 px-1 py-1.5 rounded transition-colors"
                style={{
                  background: active ? accent + '28' : '#0a0e14',
                  border: `1px solid ${active ? accent : '#2a2a2a'}`,
                }}>
                <WaveformThumbnail
                  type={def.type}
                  width={40} height={18}
                  color={active ? accent : '#444'}
                  style="line"
                />
                <span className="text-[9px] font-mono leading-tight"
                  style={{ color: active ? accent : '#555' }}>
                  {def.name}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-2">
          <Knob value={config.waveSpeed} min={0} max={15} step={1}
            onChange={(v) => upd('waveSpeed', Math.round(v))}
            label="Morph Rate" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Volume Envelope — knobs + visual curve */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Volume Envelope" />

        {/* Envelope visualization */}
        <div className="mb-3">
          <EnvelopeVisualization
            mode="steps"
            attackVol={config.attackVolume}   attackSpeed={config.attackSpeed}
            decayVol={config.decayVolume}     decaySpeed={config.decaySpeed}
            sustainVol={config.sustainVolume} sustainLen={config.sustainLength}
            releaseVol={config.releaseVolume} releaseSpeed={config.releaseSpeed}
            maxVol={64}
            width={320} height={72}
            color={accent}
          />
        </div>

        {/* ADSR Knobs — 4 columns (A / D / S / R) */}
        <div className="grid grid-cols-4 gap-3">
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: accent, opacity: 0.5 }}>Attack</span>
            <Knob value={config.attackVolume} min={0} max={64} step={1}
              onChange={(v) => upd('attackVolume', Math.round(v))}
              label="Volume" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.attackSpeed} min={0} max={63} step={1}
              onChange={(v) => upd('attackSpeed', Math.round(v))}
              label="Speed" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: accent, opacity: 0.5 }}>Decay</span>
            <Knob value={config.decayVolume} min={0} max={64} step={1}
              onChange={(v) => upd('decayVolume', Math.round(v))}
              label="Volume" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.decaySpeed} min={0} max={63} step={1}
              onChange={(v) => upd('decaySpeed', Math.round(v))}
              label="Speed" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: accent, opacity: 0.5 }}>Sustain</span>
            <Knob value={config.sustainVolume} min={0} max={64} step={1}
              onChange={(v) => upd('sustainVolume', Math.round(v))}
              label="Volume" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.sustainLength} min={0} max={255} step={1}
              onChange={(v) => upd('sustainLength', Math.round(v))}
              label="Length" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: accent, opacity: 0.5 }}>Release</span>
            <Knob value={config.releaseVolume} min={0} max={64} step={1}
              onChange={(v) => upd('releaseVolume', Math.round(v))}
              label="Volume" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.releaseSpeed} min={0} max={63} step={1}
              onChange={(v) => upd('releaseSpeed', Math.round(v))}
              label="Speed" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
        </div>
      </div>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Vibrato" />
        <div className="flex gap-4">
          <Knob value={config.vibratoDelay} min={0} max={255} step={1}
            onChange={(v) => upd('vibratoDelay', Math.round(v))}
            label="Delay" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoSpeed} min={0} max={63} step={1}
            onChange={(v) => upd('vibratoSpeed', Math.round(v))}
            label="Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoDepth} min={0} max={63} step={1}
            onChange={(v) => upd('vibratoDepth', Math.round(v))}
            label="Depth" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Portamento */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Portamento" />
        <div className="flex items-center gap-4">
          <Knob value={config.portamentoSpeed} min={0} max={63} step={1}
            onChange={(v) => upd('portamentoSpeed', Math.round(v))}
            label="Speed" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <span className="text-[10px] text-gray-600">0 = disabled</span>
        </div>
      </div>
    </div>
  );

  // ── ARPEGGIO TAB ──────────────────────────────────────────────────────────────

  const renderArpeggio = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel label="Arpeggio Speed" />
          <Knob value={config.arpSpeed} min={0} max={15} step={1}
            onChange={(v) => upd('arpSpeed', Math.round(v))}
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
              background: activeTab === id ? (isCyan ? '#041510' : '#000e1a') : 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'main'     && renderMain()}
      {activeTab === 'arpeggio' && renderArpeggio()}
    </div>
  );
};
