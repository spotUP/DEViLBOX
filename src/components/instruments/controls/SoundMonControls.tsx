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
 *
 * When loaded via UADE (uadeChipRam present), scalar params that have a direct
 * 1-byte equivalent in the synth instrument header are written to chip RAM so
 * UADE picks them up on the next note trigger.
 *
 * SoundMon synth instrument byte layout (offset from instrBase = moduleBase +
 * file offset of the 0xFF marker byte):
 *
 *   +0   : 0xFF marker
 *   +1   : table index (waveType source — not written; would corrupt table ptr)
 *   +2-3 : waveform length word (BE)
 *   +4   : adsrControl
 *   +5   : adsrTable byte
 *   +6-7 : adsrLen word (BE)
 *   +8   : adsrSpeed  → attackSpeed  ✓ written
 *   +9   : lfoControl
 *   +10  : lfoTable byte
 *   +11  : lfoDepth   → vibratoDepth ✓ written
 *   +12-13: lfoLen word (BE)
 *
 *   V1/V2 (instrSize == 29):
 *     +14  : skip byte
 *     +15  : lfoDelay  → vibratoDelay ✓ written
 *     +16  : lfoSpeed  → vibratoSpeed ✓ written
 *     ... ADSR/EG/volume (skipped)
 *
 *   V3 (instrSize == 32):
 *     +14  : lfoDelay  → vibratoDelay ✓ written
 *     +15  : lfoSpeed  → vibratoSpeed ✓ written
 *     ... ADSR/EG/FX/mod/volume (skipped)
 *
 * Fields NOT written to chip RAM (with reason):
 *   waveType       — +1 is the table index pointer; partial overwrite would
 *                    corrupt the waveform table reference
 *   waveSpeed      — purely a SoundMonConfig concept; no chip RAM equivalent
 *   attackVolume   — stored in ADSR table data (variable-length sequence), not
 *   decayVolume      in the fixed instrument header; requires table re-encoding
 *   sustainVolume
 *   releaseVolume
 *   decaySpeed     — no dedicated byte in the instrument header
 *   sustainLength  — no dedicated byte in the instrument header
 *   releaseSpeed   — no dedicated byte in the instrument header
 *   portamentoSpeed — no dedicated byte in the instrument header
 *   arpTable       — stored in separate synth table region; not in instr header
 *   arpSpeed       — no dedicated byte in the instrument header
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { SoundMonConfig, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import {
  EnvelopeVisualization,
  SequenceEditor,
  WaveformThumbnail,
} from '@components/instruments/shared';
import type { SequencePreset } from '@components/instruments/shared';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';

interface SoundMonControlsProps {
  config: SoundMonConfig;
  onChange: (updates: Partial<SoundMonConfig>) => void;
  /** Optional playback position for arpeggio sequence (undefined = not playing) */
  arpPlaybackPosition?: number;
  /** Present when this instrument was loaded via UADE's native SoundMon parser. */
  uadeChipRam?: UADEChipRamInfo;
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

// ── SoundMon instrument size constants ─────────────────────────────────────────
// V1/V2 synth instrument block = 29 bytes; V3 = 32 bytes.
// Used to determine which lfoDelay/lfoSpeed offset applies.
const SM_V1V2_INSTR_SIZE = 29;

/** Byte offset of lfoDelay (vibratoDelay) relative to instrBase. */
function lfoDelayOffset(instrSize: number): number {
  return instrSize === SM_V1V2_INSTR_SIZE ? 15 : 14;
}

/** Byte offset of lfoSpeed (vibratoSpeed) relative to instrBase. */
function lfoSpeedOffset(instrSize: number): number {
  return instrSize === SM_V1V2_INSTR_SIZE ? 16 : 15;
}

// ── Component ──────────────────────────────────────────────────────────────────

export const SoundMonControls: React.FC<SoundMonControlsProps> = ({
  config,
  onChange,
  arpPlaybackPosition,
  uadeChipRam,
}) => {
  const [activeTab, setActiveTab] = useState<SMTab>('main');

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

  const accent  = isCyan ? '#00ffff' : '#44aaff';
  const knob    = isCyan ? '#00ffff' : '#66bbff';
  const dim     = isCyan ? '#004444' : '#001833';
  const panelBg = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#000e1a] border-blue-900/30';

  const upd = useCallback(<K extends keyof SoundMonConfig>(key: K, value: SoundMonConfig[K]) => {
    onChange({ [key]: value } as Partial<SoundMonConfig>);
  }, [onChange]);

  /**
   * Like `upd`, but also writes a single byte to chip RAM when a UADE context
   * is active. byteOffset is relative to instrBase.
   */
  const updWithChipRam = useCallback(
    (key: keyof SoundMonConfig, value: SoundMonConfig[keyof SoundMonConfig], byteOffset: number) => {
      upd(key as Parameters<typeof upd>[0], value as Parameters<typeof upd>[1]);
      if (uadeChipRam && typeof value === 'number') {
        void getEditor().writeU8(uadeChipRam.instrBase + byteOffset, value & 0xFF);
      }
    },
    [upd, uadeChipRam, getEditor],
  );

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
        {/* TODO chip RAM: waveType maps to table index (+1) which is a pointer
            into the synth table region — overwriting it alone would corrupt
            the waveform table reference and is not safe without re-encoding
            the full waveform table. Skipped. */}
        <div className="flex items-center gap-4 mt-2">
          <Knob value={config.waveSpeed} min={0} max={15} step={1}
            onChange={(v) => upd('waveSpeed', Math.round(v))}
            label="Morph Rate" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          {/* TODO chip RAM: waveSpeed has no direct byte in the SoundMon
              instrument header. Skipped. */}
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
            {/* TODO chip RAM: attackVolume is stored in the ADSR table sequence
                (variable-length opcode data), not in the fixed instrument header.
                Re-encoding the ADSR table is non-trivial. Skipped. */}
            <Knob value={config.attackSpeed} min={0} max={63} step={1}
              onChange={(v) => updWithChipRam('attackSpeed', Math.round(v), 8)}
              label="Speed" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: accent, opacity: 0.5 }}>Decay</span>
            <Knob value={config.decayVolume} min={0} max={64} step={1}
              onChange={(v) => upd('decayVolume', Math.round(v))}
              label="Volume" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            {/* TODO chip RAM: decayVolume stored in ADSR table. Skipped. */}
            <Knob value={config.decaySpeed} min={0} max={63} step={1}
              onChange={(v) => upd('decaySpeed', Math.round(v))}
              label="Speed" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            {/* TODO chip RAM: decaySpeed has no dedicated byte in the instrument
                header (adsrSpeed at +8 covers only attackSpeed). Skipped. */}
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: accent, opacity: 0.5 }}>Sustain</span>
            <Knob value={config.sustainVolume} min={0} max={64} step={1}
              onChange={(v) => upd('sustainVolume', Math.round(v))}
              label="Volume" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            {/* TODO chip RAM: sustainVolume stored in ADSR table. Skipped. */}
            <Knob value={config.sustainLength} min={0} max={255} step={1}
              onChange={(v) => upd('sustainLength', Math.round(v))}
              label="Length" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            {/* TODO chip RAM: sustainLength has no dedicated byte. Skipped. */}
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: accent, opacity: 0.5 }}>Release</span>
            <Knob value={config.releaseVolume} min={0} max={64} step={1}
              onChange={(v) => upd('releaseVolume', Math.round(v))}
              label="Volume" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            {/* TODO chip RAM: releaseVolume stored in ADSR table. Skipped. */}
            <Knob value={config.releaseSpeed} min={0} max={63} step={1}
              onChange={(v) => upd('releaseSpeed', Math.round(v))}
              label="Speed" color={knob} size="sm"
              formatValue={(v) => Math.round(v).toString()} />
            {/* TODO chip RAM: releaseSpeed has no dedicated byte. Skipped. */}
          </div>
        </div>
      </div>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel label="Vibrato" />
        <div className="flex gap-4">
          <Knob value={config.vibratoDelay} min={0} max={255} step={1}
            onChange={(v) => {
              const val = Math.round(v);
              updWithChipRam(
                'vibratoDelay', val,
                lfoDelayOffset(uadeChipRam?.instrSize ?? SM_V1V2_INSTR_SIZE),
              );
            }}
            label="Delay" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoSpeed} min={0} max={63} step={1}
            onChange={(v) => {
              const val = Math.round(v);
              updWithChipRam(
                'vibratoSpeed', val,
                lfoSpeedOffset(uadeChipRam?.instrSize ?? SM_V1V2_INSTR_SIZE),
              );
            }}
            label="Speed" color={knob} size="sm"
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoDepth} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('vibratoDepth', Math.round(v), 11)}
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
          {/* TODO chip RAM: portamentoSpeed has no dedicated byte in the
              SoundMon instrument header. Skipped. */}
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
          {/* TODO chip RAM: arpSpeed has no dedicated byte in the instrument
              header; arpeggio data lives in the synth table region. Skipped. */}
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
        {/* TODO chip RAM: arpTable entries live in the synth table region
            (sections.synthTables + table_index * 64), not in the instrument
            header. Writing them requires knowing the correct table index and
            re-encoding all 64 bytes. Skipped. */}
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
      {uadeChipRam && (
        <div className="flex justify-end px-3 py-2 border-t border-opacity-30"
          style={{ borderColor: dim }}>
          <button
            className="text-[10px] px-2 py-1 rounded opacity-70 hover:opacity-100 transition-colors"
            style={{ background: 'rgba(80,120,40,0.3)', color: '#88cc44' }}
            onClick={() => void getEditor().exportModule(
              uadeChipRam.moduleBase,
              uadeChipRam.moduleSize,
              'song.bp'
            )}
          >
            Export .bp (Amiga)
          </button>
        </div>
      )}
    </div>
  );
};
