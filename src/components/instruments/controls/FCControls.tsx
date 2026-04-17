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
import { CustomSelect } from '@components/common/CustomSelect';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { EnvelopeVisualization, SectionLabel, SampleBrowserPane } from '@components/instruments/shared';
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
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { FCEngine } from '@/engine/fc/FCEngine';

interface FCControlsProps {
  config: FCConfig;
  onChange: (updates: Partial<FCConfig>) => void;
  /** Present when this instrument was loaded via UADE's native FC parser. */
  uadeChipRam?: UADEChipRamInfo;
}

type FCTab = 'envelope' | 'synth' | 'arpeggio' | 'rawvol';

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

  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors('#ffdd44', { knob: '#ffee77', dim: '#332a00' });

  const upd = useCallback(<K extends keyof FCConfig>(key: K, value: FCConfig[K]) => {
    onChange({ [key]: value } as Partial<FCConfig>);
    // Push numeric params to the WASM engine for live playback
    if (typeof value === 'number' && FCEngine.hasInstance()) {
      FCEngine.getInstance().setInstrumentParam(0, key as string, value);
    }
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
   * Note: arpTable/synthTable changes are written to a separate freq macro
   * region (sections.freqMacros + freqMacroIdx*64) via writeFreqMacroToChipRam
   * below — they are NOT part of the 64-byte vol macro. The freqMacroIdx is
   * read from vol macro byte[1] at write time so we always target the
   * instrument's actual freq macro.
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
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Base Waveform" />
        <div className="flex items-center gap-3">
          <CustomSelect
            value={String(config.waveNumber)}
            onChange={(v) => upd('waveNumber', parseInt(v))}
            options={Array.from({ length: 47 }, (_, i) => ({ value: String(i), label: `${i}: ${waveLabel(i)}` }))}
            className="text-xs font-mono border rounded px-2 py-1.5"
            style={{ background: '#100d00', borderColor: dim, color: accent }}
          />
          <span className="text-[10px] text-text-muted">Initial waveform (overridden by synth macro)</span>
        </div>
      </div>

      {/* ADSR */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
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
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Vibrato" />
        <div className="flex gap-4">
          <Knob paramKey="fc.vibDelay" value={config.vibDelay} min={0} max={255} step={1}
            onChange={(v) => updWithChipRam('vibDelay', Math.round(v), 4)}
            label="Delay" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob paramKey="fc.vibSpeed" value={config.vibSpeed} min={0} max={63} step={1}
            onChange={(v) => updWithChipRam('vibSpeed', Math.round(v), 2)}
            label="Speed" color={knob}
            formatValue={(v) => Math.round(v).toString()} />
          <Knob paramKey="fc.vibDepth" value={config.vibDepth} min={0} max={63} step={1}
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
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Synth Macro Sequencer" />
        <div className="flex items-center gap-4 mb-3">
          <Knob paramKey="fc.synthSpeed" value={config.synthSpeed} min={0} max={15} step={1}
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
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
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
    { id: 'rawvol',   label: 'Raw Vol Macro' },
  ];

  // ── RAW VOL MACRO TAB ──────────────────────────────────────────────────
  // Exposes the 59-byte vol envelope opcode stream (bytes 5..63 of the FC
  // vol macro) as an editable hex grid, plus the `volMacroSpeed` knob (which
  // aliases byte[0] of the vol macro — same register as `synthSpeed`).
  //
  // Opcode annotations match encodeFCVolEnvelope / Future Composer 1.3/1.4:
  //   0xE0 <dest>          = LOOP → dest
  //   0xE1                 = END
  //   0xE8 <count>         = SUSTAIN <count>
  //   0xEA <speed> <target>= SLIDE (volume slide opcode)
  //   else (0..64)         = raw volume value
  const [rawVolExpanded, setRawVolExpanded] = useState(false);

  // Effective 59-byte stream: prefer stored raw bytes, else derive from ADSR.
  const effectiveVolBytes = useMemo<number[]>(() => {
    if (config.volMacroData && config.volMacroData.length > 0) {
      const out = new Array(59).fill(0xE1);
      for (let i = 0; i < Math.min(59, config.volMacroData.length); i++) {
        out[i] = config.volMacroData[i] & 0xFF;
      }
      return out;
    }
    const encoded = encodeFCVolEnvelope(config);
    const out = new Array(59).fill(0xE1);
    for (let i = 0; i < Math.min(59, encoded.length); i++) out[i] = encoded[i];
    return out;
  }, [config]);

  const annotateByte = useCallback((bytes: number[], i: number): string => {
    const b = bytes[i];
    if (b === 0xE1) return 'END';
    if (b === 0xE0) {
      const dest = bytes[i + 1];
      return `LOOP→${dest ?? '?'}`;
    }
    if (b === 0xE8) {
      const n = bytes[i + 1];
      return `SUS ${n ?? '?'}`;
    }
    if (b === 0xEA) {
      const s = bytes[i + 1];
      const t = bytes[i + 2];
      return `SLD ${s ?? '?'},${t ?? '?'}`;
    }
    // Check if previous byte was an opcode arg
    if (i > 0) {
      const prev = bytes[i - 1];
      if (prev === 0xE0) return '(dest)';
      if (prev === 0xE8) return '(count)';
      if (prev === 0xEA) return '(speed)';
    }
    if (i > 1 && bytes[i - 2] === 0xEA) return '(target)';
    if (b <= 64) return `vol ${b}`;
    return `0x${b.toString(16).toUpperCase()}`;
  }, []);

  const updateRawVolByte = useCallback(
    (index: number, newVal: number) => {
      const clamped = newVal & 0xFF;
      const current = configRef.current.volMacroData
        ? [...configRef.current.volMacroData]
        : [...effectiveVolBytes];
      // Make sure it's 59 long
      while (current.length < 59) current.push(0xE1);
      current[index] = clamped;
      onChange({ volMacroData: current });
      if (uadeChipRam && UADEEngine.hasInstance()) {
        void getEditor().writeU8(uadeChipRam.instrBase + 5 + index, clamped)
          .catch((err) => console.warn('FC raw vol byte write failed:', err));
      }
    },
    [effectiveVolBytes, onChange, uadeChipRam, getEditor],
  );

  const updateVolMacroSpeed = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(15, Math.round(value)));
      onChange({ volMacroSpeed: clamped });
      if (uadeChipRam && UADEEngine.hasInstance()) {
        // byte[0] of vol macro — shared with synthSpeed header slot
        void getEditor().writeU8(uadeChipRam.instrBase + 0, clamped & 0xFF)
          .catch((err) => console.warn('FC volMacroSpeed write failed:', err));
      }
    },
    [onChange, uadeChipRam, getEditor],
  );

  const reencodeFromADSR = useCallback(() => {
    const encoded = encodeFCVolEnvelope(configRef.current);
    const out = new Array(59).fill(0xE1);
    for (let i = 0; i < Math.min(59, encoded.length); i++) out[i] = encoded[i];
    onChange({ volMacroData: out });
    if (uadeChipRam && UADEEngine.hasInstance()) {
      void getEditor().writeBlock(uadeChipRam.instrBase + 5, out)
        .catch((err) => console.warn('FC re-encode chip RAM write failed:', err));
    }
  }, [onChange, uadeChipRam, getEditor]);

  const renderRawVol = () => {
    const currentSpeed = config.volMacroSpeed ?? config.synthSpeed ?? 0;
    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <SectionLabel color={accent} label="Vol Macro Speed" />
          <div className="flex items-center gap-4">
            <Knob
              value={currentSpeed}
              min={0}
              max={15}
              step={1}
              onChange={(v) => updateVolMacroSpeed(v)}
              label="Speed"
              color={knob}
              formatValue={(v) => Math.round(v).toString()}
            />
            <span className="text-[10px] text-text-muted">
              Ticks per vol macro step (byte[0] of vol macro — aliases synthSpeed).
            </span>
          </div>
        </div>

        <div className={`rounded-lg border ${panelBg}`} style={panelStyle}>
          <button
            type="button"
            onClick={() => setRawVolExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-left"
          >
            <SectionLabel color={accent} label={`Raw Vol Macro Bytes (59) ${rawVolExpanded ? '▾' : '▸'}`} />
            <span className="text-[10px] text-text-muted">
              {config.volMacroData ? 'custom' : 'derived from ADSR'}
            </span>
          </button>
          {rawVolExpanded && (
            <div className="px-3 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={reencodeFromADSR}
                  className="text-[10px] px-2 py-1 rounded bg-yellow-900/40 text-yellow-400 hover:bg-yellow-900/60 transition-colors border border-yellow-900/60"
                >
                  Re-encode from ADSR
                </button>
                {config.volMacroData && (
                  <button
                    type="button"
                    onClick={() => onChange({ volMacroData: undefined })}
                    className="text-[10px] px-2 py-1 rounded bg-dark-bg text-text-secondary hover:text-accent-primary border border-dark-border"
                  >
                    Clear override (use ADSR)
                  </button>
                )}
                <span className="text-[10px] text-text-muted ml-auto">
                  0xE0=LOOP · 0xE1=END · 0xE8=SUS · 0xEA=SLD · 0..64=vol
                </span>
              </div>
              <div
                className="grid gap-1 font-mono text-[9px]"
                style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}
              >
                {effectiveVolBytes.map((b, i) => {
                  const ann = annotateByte(effectiveVolBytes, i);
                  const isOpcode = b >= 0xE0;
                  return (
                    <div
                      key={i}
                      className="flex flex-col items-center border rounded px-0.5 py-0.5"
                      style={{
                        borderColor: dim,
                        background: isOpcode ? '#221100' : '#100d00',
                      }}
                      title={`byte[${i}] = 0x${b.toString(16).padStart(2, '0').toUpperCase()} (${b}) — ${ann}`}
                    >
                      <span className="text-[8px] text-text-muted">{i}</span>
                      <input
                        type="text"
                        value={b.toString(16).padStart(2, '0').toUpperCase()}
                        onChange={(e) => {
                          const parsed = parseInt(e.target.value, 16);
                          if (!isNaN(parsed)) updateRawVolByte(i, parsed);
                        }}
                        className="w-full text-center bg-transparent border-0 outline-none p-0"
                        style={{ color: isOpcode ? '#ffaa44' : accent }}
                        maxLength={2}
                      />
                      <span
                        className="text-[8px] truncate w-full text-center"
                        style={{ color: isOpcode ? '#ffaa44' : '#776633' }}
                      >
                        {ann}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Sample browser pane ──────────────────────────────────────────────────
  // Future Composer waveforms come from a shared 47-entry table that lives
  // in chip RAM (sections.waveData). The parser doesn't expose per-waveform
  // length metadata via sections, but each FCConfig carries its active
  // wave via `waveNumber` + optional `wavePCM` (the decoded samples for
  // that single wave). Walk every FCSynth instrument in the store and
  // list one row per instrument showing its active wave.
  const [showSamplePane, setShowSamplePane] = useState(false);
  const allInstruments = useInstrumentStore((s) => s.instruments);
  const sampleRows = useMemo(() => {
    return allInstruments
      .filter((inst) => inst.synthType === 'FCSynth' && inst.fc)
      .map((inst) => {
        const c = inst.fc!;
        return {
          id: inst.id,
          instrName: inst.name || `#${inst.id}`,
          waveNumber: c.waveNumber,
          waveSize: c.wavePCM?.length ?? 0,
          isCurrent: c === config,
        };
      });
  }, [allInstruments, config]);

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
        <button
          onClick={() => setShowSamplePane((v) => !v)}
          title={`${showSamplePane ? 'Hide' : 'Show'} sample browser`}
          className={`ml-auto mr-2 my-1 px-2 py-0.5 rounded text-[10px] font-mono border ${
            showSamplePane
              ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/60'
              : 'bg-dark-bg text-text-secondary border-dark-border hover:text-accent-primary hover:border-accent-primary/50'
          }`}
        >
          SMP
        </button>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 overflow-y-auto">
          {activeTab === 'envelope' && renderEnvelope()}
          {activeTab === 'synth'    && renderSynth()}
          {activeTab === 'arpeggio' && renderArpeggio()}
          {activeTab === 'rawvol'   && renderRawVol()}
        </div>
        {showSamplePane && (
          <SampleBrowserPane
            entries={sampleRows.map((s) => ({
              id: s.id,
              name: `${String(s.id).padStart(2, '0')}. ${s.instrName}`,
              isCurrent: s.isCurrent,
            }))}
            emptyMessage="No Future Composer instruments loaded."
            renderEntry={(entry) => {
              const s = sampleRows.find((r) => r.id === entry.id)!;
              return (
                <>
                  <div className={`font-mono truncate ${s.isCurrent ? 'text-accent-primary' : 'text-text-primary'}`}>
                    {String(s.id).padStart(2, '0')}. {s.instrName}
                  </div>
                  <div className="text-text-muted mt-0.5">
                    wave #{s.waveNumber}
                    {s.waveSize > 0 && <span className="ml-1">· {s.waveSize}B</span>}
                  </div>
                  <div className="mt-0.5 text-[9px]">
                    <span className={s.waveNumber < 10 ? 'text-accent-secondary' : 'text-accent-highlight'}>
                      {s.waveNumber < 10 ? 'PCM SLOT' : 'SYNTH WAVE'}
                    </span>
                    {s.isCurrent && <span className="ml-1 text-accent-primary">(this instrument)</span>}
                  </div>
                </>
              );
            }}
          />
        )}
      </div>
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
