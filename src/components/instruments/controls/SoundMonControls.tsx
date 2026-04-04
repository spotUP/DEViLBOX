/**
 * SoundMonControls.tsx -- SoundMon II (Brian Postma) instrument editor
 *
 * Exposes all SoundMonConfig parameters: waveform type, ADSR volumes/speeds,
 * vibrato, arpeggio table, and portamento.
 *
 * Enhanced with:
 *  - EnvelopeVisualization: visual ADSR curve in the Volume Envelope section
 *  - PatternEditorCanvas: vertical tracker-style arpeggio table editor
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
 *   +1   : table index (waveType source -- not written; would corrupt table ptr)
 *   +2-3 : waveform length word (BE)
 *   +4   : adsrControl
 *   +5   : adsrTable byte
 *   +6-7 : adsrLen word (BE)
 *   +8   : adsrSpeed  -> attackSpeed  written
 *   +9   : lfoControl
 *   +10  : lfoTable byte
 *   +11  : lfoDepth   -> vibratoDepth written
 *   +12-13: lfoLen word (BE)
 *
 *   V1/V2 (instrSize == 29):
 *     +14  : skip byte
 *     +15  : lfoDelay  -> vibratoDelay written
 *     +16  : lfoSpeed  -> vibratoSpeed written
 *     ... ADSR/EG/volume (skipped)
 *
 *   V3 (instrSize == 32):
 *     +14  : lfoDelay  -> vibratoDelay written
 *     +15  : lfoSpeed  -> vibratoSpeed written
 *     ... ADSR/EG/FX/mod/volume (skipped)
 *
 * Fields NOT written to chip RAM (with reason):
 *   waveType       -- table index pointer at +1; instead of overwriting the pointer,
 *                    we generate the waveform and write 64 bytes to the synth table
 *                    region at synthTables + (tableIndex << 6)
 *   waveSpeed      -- purely a SoundMonConfig concept; no chip RAM equivalent
 *   portamentoSpeed -- no dedicated byte in the instrument header
 *   arpTable       -- stored in separate synth table region; not in instr header
 *   arpSpeed       -- no dedicated byte in the instrument header
 *
 * Fields written to ADSR table in synth table region (via updADSRWithChipRam):
 *   attackVolume, decayVolume, sustainVolume, releaseVolume -- re-encoded as
 *   volume sequence in synthTables + (adsrTable << 6) using encodeSoundMonADSR()
 *   attackSpeed, decaySpeed, sustainLength, releaseSpeed -- also encoded into
 *   the ADSR sequence shape
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { SoundMonConfig, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useThemeStore } from '@stores';
import {
  EnvelopeVisualization,
  SectionLabel,
  WaveformThumbnail,
} from '@components/instruments/shared';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import type { ColumnDef, FormatChannel, FormatCell, OnCellChange } from '@/components/shared/format-editor-types';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';
import { encodeSoundMonADSR, generateSoundMonWaveform } from '@/engine/uade/chipRamEncoders';

interface SoundMonControlsProps {
  config: SoundMonConfig;
  onChange: (updates: Partial<SoundMonConfig>) => void;
  /** Optional playback position for arpeggio sequence (undefined = not playing) */
  arpPlaybackPosition?: number;
  /** Present when this instrument was loaded via UADE's native SoundMon parser. */
  uadeChipRam?: UADEChipRamInfo;
}

type SMTab = 'main' | 'arpeggio';

// -- Wave type definitions (16 waveforms) ---

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
    color: '#44aaff',
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

// -- SoundMon instrument size constants ---
// V1/V2 synth instrument block = 29 bytes; V3 = 32 bytes.
const SM_V1V2_INSTR_SIZE = 29;

/** Byte offset of lfoDelay (vibratoDelay) relative to instrBase. */
function lfoDelayOffset(instrSize: number): number {
  return instrSize === SM_V1V2_INSTR_SIZE ? 15 : 14;
}

/** Byte offset of lfoSpeed (vibratoSpeed) relative to instrBase. */
function lfoSpeedOffset(instrSize: number): number {
  return instrSize === SM_V1V2_INSTR_SIZE ? 16 : 15;
}

// -- Component ---

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
  const panelBg = isCyan ? 'bg-[#041510] border-accent-highlight/20' : 'bg-[#000e1a] border-blue-900/30';

  const upd = useCallback(<K extends keyof SoundMonConfig>(key: K, value: SoundMonConfig[K]) => {
    onChange({ [key]: value } as Partial<SoundMonConfig>);
  }, [onChange]);

  const updWithChipRam = useCallback(
    (key: keyof SoundMonConfig, value: SoundMonConfig[keyof SoundMonConfig], byteOffset: number) => {
      upd(key as Parameters<typeof upd>[0], value as Parameters<typeof upd>[1]);
      if (uadeChipRam && typeof value === 'number') {
        void getEditor().writeU8(uadeChipRam.instrBase + byteOffset, value & 0xFF);
      }
    },
    [upd, uadeChipRam, getEditor],
  );

  const updADSRWithChipRam = useCallback(
    (key: keyof SoundMonConfig, value: number) => {
      upd(key as Parameters<typeof upd>[0], value as Parameters<typeof upd>[1]);
      if (uadeChipRam && uadeChipRam.sections.synthTables) {
        void (async () => {
          const editor = getEditor();
          const headerBytes = await editor.readBytes(uadeChipRam.instrBase + 5, 3);
          const adsrTableOff = headerBytes[0] << 6;
          const adsrLen = (headerBytes[1] << 8) | headerBytes[2];
          if (adsrLen <= 0) return;
          const newCfg = { ...configRef.current, [key]: value };
          const sequence = encodeSoundMonADSR(newCfg, adsrLen);
          const addr = uadeChipRam.sections.synthTables + adsrTableOff;
          void editor.writeBlock(addr, Array.from(sequence));
        })();
      }
    },
    [upd, uadeChipRam, getEditor],
  );

  const updWaveTypeWithChipRam = useCallback(
    (waveType: number) => {
      upd('waveType', waveType);
      if (uadeChipRam && uadeChipRam.sections.synthTables) {
        void (async () => {
          const editor = getEditor();
          const tableIndexBytes = await editor.readBytes(uadeChipRam.instrBase + 1, 1);
          const tableIndex = tableIndexBytes[0] & 0x0F;
          const waveAddr = uadeChipRam.sections.synthTables + (tableIndex << 6);
          const waveData = generateSoundMonWaveform(waveType);
          void editor.writeBlock(waveAddr, Array.from(waveData));
        })();
      }
    },
    [upd, uadeChipRam, getEditor],
  );

  // -- MAIN TAB ---

  const renderMain = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Waveform selector */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel color={accent} label="Waveform" />
        <div className="flex items-center gap-4 mb-3">
          <Knob value={config.waveSpeed} min={0} max={15} step={1}
            onChange={(v) => upd('waveSpeed', Math.round(v))}
            label="Morph Rate" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
        <div className="grid grid-cols-4 gap-1 mt-2">
          {WAVE_DEFS.map((def, i) => {
            const active = config.waveType === i;
            return (
              <button key={i}
                onClick={() => updWaveTypeWithChipRam(i)}
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
      </div>

      {/* Volume Envelope */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel color={accent} label="Volume Envelope" />

        <div className="grid grid-cols-4 gap-3">
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: accent, opacity: 0.5 }}>Attack</span>
            <Knob value={config.attackVolume} min={0} max={64} step={1}
              onChange={(v) => updADSRWithChipRam('attackVolume', Math.round(v))}
              label="Volume" color={knob}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.attackSpeed} min={0} max={63} step={1}
              onChange={(v) => {
                updADSRWithChipRam('attackSpeed', Math.round(v));
                if (uadeChipRam) {
                  void getEditor().writeU8(uadeChipRam.instrBase + 8, Math.round(v) & 0xFF);
                }
              }}
              label="Speed" color={knob}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: accent, opacity: 0.5 }}>Decay</span>
            <Knob value={config.decayVolume} min={0} max={64} step={1}
              onChange={(v) => updADSRWithChipRam('decayVolume', Math.round(v))}
              label="Volume" color={knob}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.decaySpeed} min={0} max={63} step={1}
              onChange={(v) => updADSRWithChipRam('decaySpeed', Math.round(v))}
              label="Speed" color={knob}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: accent, opacity: 0.5 }}>Sustain</span>
            <Knob value={config.sustainVolume} min={0} max={64} step={1}
              onChange={(v) => updADSRWithChipRam('sustainVolume', Math.round(v))}
              label="Volume" color={knob}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.sustainLength} min={0} max={255} step={1}
              onChange={(v) => updADSRWithChipRam('sustainLength', Math.round(v))}
              label="Length" color={knob}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: accent, opacity: 0.5 }}>Release</span>
            <Knob value={config.releaseVolume} min={0} max={64} step={1}
              onChange={(v) => updADSRWithChipRam('releaseVolume', Math.round(v))}
              label="Volume" color={knob}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.releaseSpeed} min={0} max={63} step={1}
              onChange={(v) => updADSRWithChipRam('releaseSpeed', Math.round(v))}
              label="Speed" color={knob}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
        </div>

        <div className="mt-2">
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
      </div>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel color={accent} label="Vibrato" />
        <div className="flex gap-4">
          <Knob value={config.vibratoDelay} min={0} max={255} step={1}
            onChange={(v) => {
              const val = Math.round(v);
              updWithChipRam(
                'vibratoDelay', val,
                lfoDelayOffset(uadeChipRam?.instrSize ?? SM_V1V2_INSTR_SIZE),
              );
            }}
            label="Delay" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoSpeed} min={0} max={63} step={1}
            onChange={(v) => {
              const val = Math.round(v);
              updWithChipRam(
                'vibratoSpeed', val,
                lfoSpeedOffset(uadeChipRam?.instrSize ?? SM_V1V2_INSTR_SIZE),
              );
            }}
            label="Speed" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibratoDepth} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('vibratoDepth', Math.round(v), 11)}
            label="Depth" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>

      {/* Portamento */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel color={accent} label="Portamento" />
        <div className="flex items-center gap-4">
          <Knob value={config.portamentoSpeed} min={0} max={63} step={1}
            onChange={(v) => upd('portamentoSpeed', Math.round(v))}
            label="Speed" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()} />
          <span className="text-[10px] text-text-muted">0 = disabled</span>
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
      <div className={`rounded-lg border p-3 ${panelBg} flex flex-col`} style={{ flex: 1, minHeight: 0 }}>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel color={accent} label="Arpeggio Speed" />
          <Knob value={config.arpSpeed} min={0} max={15} step={1}
            onChange={(v) => upd('arpSpeed', Math.round(v))}
            label="Speed" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
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
