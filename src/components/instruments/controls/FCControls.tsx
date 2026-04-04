/**
 * FCControls.tsx — Future Composer 1.3/1.4 instrument editor
 *
 * Exposes all FCConfig parameters: waveform selector, synth macro table,
 * ADSR envelope, vibrato, and arpeggio table.
 *
 * When loaded via UADE (uadeChipRam present), scalar params are also written
 * directly to chip RAM so UADE picks them up on the next note trigger.
 *
 * FC vol macro byte layout (instrBase = moduleBase + volMacroPtr + instrIdx*64):
 *   byte[0] = volSpeed  (synthSpeed)
 *   byte[1] = freqMacroIdx  (not exposed — do not overwrite)
 *   byte[2] = vibSpeed
 *   byte[3] = vibDepth
 *   byte[4] = vibDelay
 *   byte[5..63] = vol envelope opcodes (ADSR — written via encodeFCVolEnvelope)
 */

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import type { FCConfig, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { EnvelopeVisualization, SectionLabel } from '@components/instruments/shared';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import {
  FC_SYNTH_MACRO_COLUMNS,
  FC_ARPEGGIO_COLUMNS,
  fcSynthMacroToFormatChannel,
  fcArpeggioToFormatChannel,
  makeSynthMacroCellChange,
  makeArpeggioCellChange,
} from '@/components/fc/fcAdapter';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';
import { encodeFCVolEnvelope, encodeFCFreqMacro } from '@/engine/uade/chipRamEncoders';

interface FCControlsProps {
  config: FCConfig;
  onChange: (updates: Partial<FCConfig>) => void;
  /** Present when this instrument was loaded via UADE's native FC parser. */
  uadeChipRam?: UADEChipRamInfo;
}

type FCTab = 'envelope' | 'synth' | 'arpeggio';

// FC waveform names (0-46). Groups: 0-3 basic, 4-46 composite.
const FC_WAVE_NAMES: Record<number, string> = {
  0: 'Sawtooth', 1: 'Square', 2: 'Triangle', 3: 'Noise',
  4: 'Saw+Sq', 5: 'Saw+Tri', 6: 'Sq+Tri', 7: 'Pulse 1', 8: 'Pulse 2',
  9: 'Pulse 3', 10: 'Pulse 4', 11: 'Pulse 5',
};

function waveLabel(n: number): string {
  return FC_WAVE_NAMES[n] ?? `Wave ${n}`;
}

export const FCControls: React.FC<FCControlsProps> = ({ config, onChange, uadeChipRam }) => {
  const [activeTab, setActiveTab] = useState<FCTab>('envelope');

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const chipEditorRef = useRef<UADEChipEditor | null>(null);
  const getEditor = useCallback(() => {
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }, []);

  const { isCyan, accent, knob, dim, panelBg } = useInstrumentColors('#ffdd44', { knob: '#ffee77', dim: '#332a00' });

  const upd = useCallback(<K extends keyof FCConfig>(key: K, value: FCConfig[K]) => {
    onChange({ [key]: value } as Partial<FCConfig>);
  }, [onChange]);

  /**
   * Like `upd`, but also writes a single byte to chip RAM when a UADE context
   * is active. byteOffset is relative to instrBase (start of the 64-byte vol
   * macro for this instrument).
   *
   * Byte map:
   *   0 = synthSpeed
   *   2 = vibSpeed
   *   3 = vibDepth
   *   4 = vibDelay
   *
   * Note: ADSR params (atkLength/atkVolume/decLength/decVolume/sustVolume/relLength)
   * are encoded as FC vol-envelope opcodes and written as a block to byte[5..63]
   * via updADSRWithChipRam(). See encodeFCVolEnvelope() in chipRamEncoders.ts.
   *
   * Note: arpTable/synthTable changes require writing separate arp/synth macro
   * regions (not part of the 64-byte vol macro) — not yet implemented.
   */
  const updWithChipRam = useCallback(
    (key: keyof FCConfig, value: FCConfig[keyof FCConfig], byteOffset: number) => {
      upd(key as Parameters<typeof upd>[0], value as Parameters<typeof upd>[1]);
      if (uadeChipRam && typeof value === 'number' && UADEEngine.hasInstance()) {
        void getEditor().writeU8(uadeChipRam.instrBase + byteOffset, value & 0xFF).catch((err) => console.warn('FC chip RAM write failed:', err));
      }
    },
    [upd, uadeChipRam, getEditor],
  );

  /**
   * Update an ADSR parameter and re-encode the full vol-envelope opcode sequence
   * to chip RAM bytes [5..63]. This is needed because FC ADSR is stored as a
   * variable-length opcode stream, not individual header bytes.
   */
  const updADSRWithChipRam = useCallback(
    (key: keyof FCConfig, value: number) => {
      upd(key as Parameters<typeof upd>[0], value as Parameters<typeof upd>[1]);
      if (uadeChipRam && UADEEngine.hasInstance()) {
        const newCfg = { ...configRef.current, [key]: value };
        const opcodes = encodeFCVolEnvelope(newCfg);
        // Write opcodes to bytes [5..63] — pad with 0xE1 (end) if shorter than 59
        const fullBuf = new Array(59).fill(0xE1);
        for (let i = 0; i < opcodes.length; i++) fullBuf[i] = opcodes[i];
        void getEditor().writeBlock(uadeChipRam.instrBase + 5, fullBuf).catch((err) => console.warn('FC chip RAM write failed:', err));
      }
    },
    [upd, uadeChipRam, getEditor],
  );

  /**
   * Write the full 64-byte freq macro to chip RAM when synthTable or arpTable changes.
   * The freq macro address is sections.freqMacros + freqMacroIdx * 64,
   * where freqMacroIdx is stored in vol macro byte[1].
   */
  const writeFreqMacroToChipRam = useCallback(
    (newCfg: FCConfig) => {
      if (!uadeChipRam || !uadeChipRam.sections.freqMacros) return;
      if (!UADEEngine.hasInstance()) return; // UADE not active — skip chip RAM write
      void (async () => {
        try {
          const editor = getEditor();
          // Read freqMacroIdx from vol macro byte[1]
          const freqMacroIdxBytes = await editor.readBytes(uadeChipRam.instrBase + 1, 1);
          const freqMacroIdx = freqMacroIdxBytes[0];
          const freqMacroAddr = uadeChipRam.sections.freqMacros + freqMacroIdx * 64;
          const encoded = encodeFCFreqMacro(newCfg.synthTable, newCfg.arpTable);
          void editor.writeBlock(freqMacroAddr, Array.from(encoded));
        } catch {
          // WASM not ready or module not loaded — ignore
        }
      })();
    },
    [uadeChipRam, getEditor],
  );

  // ── ENVELOPE TAB ──
  const renderEnvelope = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {/* Initial waveform */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel color={accent} label="Base Waveform" />
        <div className="flex items-center gap-3">
          <select
            value={config.waveNumber}
            onChange={(e) => upd('waveNumber', parseInt(e.target.value))}
            className="text-xs font-mono border rounded px-2 py-1.5"
            style={{ background: '#100d00', borderColor: dim, color: accent }}>
            {Array.from({ length: 47 }, (_, i) => (
              <option key={i} value={i} style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}>
                {i}: {waveLabel(i)}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-text-muted">Initial waveform (overridden by synth macro)</span>
        </div>
      </div>

      {/* ADSR */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel color={accent} label="Volume Envelope" />
        <div className="mb-3">
          <EnvelopeVisualization
            mode="steps"
            attackVol={config.atkVolume}   attackSpeed={config.atkLength}
            decayVol={config.decVolume}    decaySpeed={config.decLength}
            sustainVol={config.sustVolume} sustainLen={32}
            releaseVol={0}                 releaseSpeed={config.relLength}
            maxVol={64}
            color={knob}
            width={300} height={56}
          />
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.atkLength} min={0} max={255} step={1}
              onChange={(v) => updADSRWithChipRam('atkLength', Math.round(v))}
              label="Atk Len" color={knob}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.atkVolume} min={0} max={64} step={1}
              onChange={(v) => updADSRWithChipRam('atkVolume', Math.round(v))}
              label="Atk Vol" color={knob}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.decLength} min={0} max={255} step={1}
              onChange={(v) => updADSRWithChipRam('decLength', Math.round(v))}
              label="Dec Len" color={knob}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.decVolume} min={0} max={64} step={1}
              onChange={(v) => updADSRWithChipRam('decVolume', Math.round(v))}
              label="Dec Vol" color={knob}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob value={config.relLength} min={0} max={255} step={1}
              onChange={(v) => updADSRWithChipRam('relLength', Math.round(v))}
              label="Rel Len" color={knob}
              formatValue={(v) => Math.round(v).toString()} />
            <Knob value={config.sustVolume} min={0} max={64} step={1}
              onChange={(v) => updADSRWithChipRam('sustVolume', Math.round(v))}
              label="Sus Vol" color={knob}
              formatValue={(v) => Math.round(v).toString()} />
          </div>
        </div>
      </div>

      {/* Vibrato */}
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel color={accent} label="Vibrato" />
        <div className="flex gap-4">
          <Knob value={config.vibDelay} min={0} max={255} step={1}
            onChange={(v) => updWithChipRam('vibDelay', Math.round(v), 4)}
            label="Delay" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibSpeed} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('vibSpeed', Math.round(v), 2)}
            label="Speed" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob value={config.vibDepth} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('vibDepth', Math.round(v), 3)}
            label="Depth" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
        </div>
      </div>
    </div>
  );

  // ── SYNTH MACRO TAB — PatternEditorCanvas in format mode ──
  const synthMacroChannels = useMemo(
    () => fcSynthMacroToFormatChannel(config),
    [config]
  );
  const synthMacroCellChange = useMemo(
    () => {
      const baseCellChange = makeSynthMacroCellChange(config, (updates) => {
        onChange(updates);
        if (updates.synthTable) {
          writeFreqMacroToChipRam({ ...configRef.current, ...updates });
        }
      });
      return baseCellChange;
    },
    [config, onChange, writeFreqMacroToChipRam]
  );

  const renderSynth = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel color={accent} label="Synth Macro Sequencer" />
        <div className="flex items-center gap-4 mb-3">
          <Knob value={config.synthSpeed} min={0} max={15} step={1}
            onChange={(v) => updWithChipRam('synthSpeed', Math.round(v), 0)}
            label="Speed" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <span className="text-[10px] text-text-muted">Ticks per macro step (0 = disabled)</span>
        </div>

        {/* Pattern editor in format mode */}
        <div style={{ flex: 1, minHeight: 200 }}>
          <PatternEditorCanvas
            formatColumns={FC_SYNTH_MACRO_COLUMNS}
            formatChannels={synthMacroChannels}
            formatCurrentRow={0}
            formatIsPlaying={false}
            onFormatCellChange={synthMacroCellChange}
            hideVUMeters={true}
          />
        </div>
      </div>
    </div>
  );

  // ── ARPEGGIO TAB — PatternEditorCanvas in format mode ──
  const arpeggioChannels = useMemo(
    () => fcArpeggioToFormatChannel(config),
    [config]
  );
  const arpeggioCellChange = useMemo(
    () => {
      const baseCellChange = makeArpeggioCellChange(config, (updates) => {
        onChange(updates);
        if (updates.arpTable) {
          writeFreqMacroToChipRam({ ...configRef.current, ...updates });
        }
      });
      return baseCellChange;
    },
    [config, onChange, writeFreqMacroToChipRam]
  );

  const renderArpeggio = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`}>
        <SectionLabel color={accent} label="Arpeggio Table (semitone offsets)" />
        <div style={{ flex: 1, minHeight: 200 }}>
          <PatternEditorCanvas
            formatColumns={FC_ARPEGGIO_COLUMNS}
            formatChannels={arpeggioChannels}
            formatCurrentRow={0}
            formatIsPlaying={false}
            onFormatCellChange={arpeggioCellChange}
            hideVUMeters={true}
          />
        </div>
      </div>
    </div>
  );

  const TABS: { id: FCTab; label: string }[] = [
    { id: 'envelope', label: 'Envelope' },
    { id: 'synth',    label: 'Synth Macro' },
    { id: 'arpeggio', label: 'Arpeggio' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b" style={{ borderColor: dim }}>
        {TABS.map(({ id, label }) => (
          <button key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accent : '#666',
              borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
              background: activeTab === id ? (isCyan ? '#041510' : '#1a1500') : 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'envelope' && renderEnvelope()}
      {activeTab === 'synth'    && renderSynth()}
      {activeTab === 'arpeggio' && renderArpeggio()}
      {uadeChipRam && (
        <div className="flex justify-end px-3 py-2 border-t border-yellow-900/30">
          <button
            className="text-[10px] px-2 py-1 rounded bg-yellow-900/40 text-yellow-400 hover:bg-yellow-900/60 transition-colors"
            onClick={() => void getEditor().exportModule(
              uadeChipRam.moduleBase,
              uadeChipRam.moduleSize,
              'song.fc'
            )}
          >
            Export .fc (Amiga)
          </button>
        </div>
      )}
    </div>
  );
};
