/**
 * DeltaMusic2Controls.tsx — Delta Music 2.0 instrument editor
 *
 * Exposes all DeltaMusic2Config parameters: 5-entry volume table
 * (speed/level/sustain), 5-entry vibrato table (speed/delay/sustain),
 * pitch bend, and (for synth instruments) a read-only 48-byte sequence
 * preview.  The wavetable sequence is editable: clicking a cell lets you
 * type a new value (0-254 for waveform, 255 for loop/end).
 *
 * When loaded via UADE (uadeChipRam present), all params including
 * individual table entries are written to chip RAM so UADE picks them up
 * on the next note trigger.
 *
 * DM2 instrument header byte layout (offset from instrBase):
 *
 *   +6  + v*3   volTable[v].speed    ✓ written (uint8)
 *   +7  + v*3   volTable[v].level    ✓ written (uint8)
 *   +8  + v*3   volTable[v].sustain  ✓ written (uint8)
 *   +21 + v*3   vibTable[v].speed    ✓ written (uint8)
 *   +22 + v*3   vibTable[v].delay    ✓ written (uint8)
 *   +23 + v*3   vibTable[v].sustain  ✓ written (uint8)
 *   +36-37      pitchBend            ✓ written (uint16 BE)
 *   +38         isSample             — NOT written (structural)
 *   +39         sampleNum            — NOT written (structural)
 *   +40-87      table                ✓ written (uint8 per entry)
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { DeltaMusic2Config, DeltaMusic2VolEntry, DeltaMusic2VibEntry, UADEChipRamInfo } from '@/types/instrument';
import { Knob } from '@components/controls/Knob';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { SectionLabel } from '@components/instruments/shared';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';

// ── DM2 instrument header byte offsets ─────────────────────────────────────

/** Volume table starts at +6; each entry is 3 bytes. */
const OFF_VOL_TABLE = 6;
/** Vibrato table starts at +21; each entry is 3 bytes. */
const OFF_VIB_TABLE = 21;
/** Pitch bend: uint16 BE at +36. */
const OFF_PITCH_BEND = 36;
/** Wavetable sequence starts at +40; 48 bytes. */
const OFF_TABLE = 40;

// ── Tab type ────────────────────────────────────────────────────────────────

type DM2Tab = 'envelope' | 'modulation' | 'table';

// ── Props ───────────────────────────────────────────────────────────────────

interface DeltaMusic2ControlsProps {
  config: DeltaMusic2Config;
  onChange: (updates: Partial<DeltaMusic2Config>) => void;
  /** Present when this instrument was loaded via UADE's native DeltaMusic2 parser. */
  uadeChipRam?: UADEChipRamInfo;
}

// ── Component ───────────────────────────────────────────────────────────────

export const DeltaMusic2Controls: React.FC<DeltaMusic2ControlsProps> = ({
  config,
  onChange,
  uadeChipRam,
}) => {
  const [activeTab, setActiveTab] = useState<DM2Tab>('envelope');

  // configRef pattern: prevents stale closures in callbacks
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  // Lazy UADEChipEditor singleton
  const chipEditorRef = useRef<UADEChipEditor | null>(null);
  const getEditor = useCallback(() => {
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }, []);

  const { isCyan, accent, knob, dim, panelBg, panelStyle } = useInstrumentColors('#ff9944', { knob: '#ffbb66', dim: '#331800' });

  // ── Volume table updater ──────────────────────────────────────────────────

  /**
   * Update a single field in volTable[entryIndex] and write to chip RAM.
   * field: 0=speed (+0), 1=level (+1), 2=sustain (+2)
   */
  const updateVolEntry = useCallback(
    (entryIndex: number, field: 0 | 1 | 2, value: number) => {
      const cur = configRef.current;
      const newTable: DeltaMusic2VolEntry[] = cur.volTable.map((e, idx) =>
        idx === entryIndex
          ? (
            field === 0 ? { ...e, speed: value } :
            field === 1 ? { ...e, level: value } :
                          { ...e, sustain: value }
          )
          : e
      );
      onChange({ volTable: newTable });
      if (uadeChipRam) {
        const byteOff = OFF_VOL_TABLE + entryIndex * 3 + field;
        void getEditor().writeU8(uadeChipRam.instrBase + byteOff, value & 0xFF);
      }
    },
    [onChange, uadeChipRam, getEditor],
  );

  // ── Vibrato table updater ─────────────────────────────────────────────────

  /**
   * Update a single field in vibTable[entryIndex] and write to chip RAM.
   * field: 0=speed (+0), 1=delay (+1), 2=sustain (+2)
   */
  const updateVibEntry = useCallback(
    (entryIndex: number, field: 0 | 1 | 2, value: number) => {
      const cur = configRef.current;
      const newTable: DeltaMusic2VibEntry[] = cur.vibTable.map((e, idx) =>
        idx === entryIndex
          ? (
            field === 0 ? { ...e, speed: value } :
            field === 1 ? { ...e, delay: value } :
                          { ...e, sustain: value }
          )
          : e
      );
      onChange({ vibTable: newTable });
      if (uadeChipRam) {
        const byteOff = OFF_VIB_TABLE + entryIndex * 3 + field;
        void getEditor().writeU8(uadeChipRam.instrBase + byteOff, value & 0xFF);
      }
    },
    [onChange, uadeChipRam, getEditor],
  );

  // ── Pitch bend updater ────────────────────────────────────────────────────

  const updatePitchBend = useCallback(
    (value: number) => {
      onChange({ pitchBend: value });
      if (uadeChipRam) {
        void getEditor().writeU16(uadeChipRam.instrBase + OFF_PITCH_BEND, value & 0xFFFF);
      }
    },
    [onChange, uadeChipRam, getEditor],
  );

  // ── Wavetable entry updater ───────────────────────────────────────────

  const updateTableEntry = useCallback(
    (index: number, value: number) => {
      if (!configRef.current.table) return;
      const newTable = new Uint8Array(configRef.current.table);
      newTable[index] = value & 0xFF;
      onChange({ table: newTable });
      if (uadeChipRam) {
        void getEditor().writeU8(uadeChipRam.instrBase + OFF_TABLE + index, value & 0xFF);
      }
    },
    [onChange, uadeChipRam, getEditor],
  );

  // ── ENVELOPE TAB (volume table) ───────────────────────────────────────────

  const renderEnvelope = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Volume Table (5 entries)" />
        <div className="text-[10px] text-text-muted mb-2">
          Each entry: Speed (step rate), Level (0-255), Sustain (ticks at this level).
        </div>
        {config.volTable.slice(0, 5).map((entry, idx) => (
          <div key={idx} className="mb-3">
            <span className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: accent, opacity: 0.5 }}>
              Entry {idx + 1}
            </span>
            <div className="flex gap-4">
              <Knob
                value={entry.speed} min={0} max={255} step={1}
                onChange={(v) => updateVolEntry(idx, 0, Math.round(v))}
                label="Speed" color={knob}
                formatValue={(v) => Math.round(v).toString()}
              />
              <Knob
                value={entry.level} min={0} max={255} step={1}
                onChange={(v) => updateVolEntry(idx, 1, Math.round(v))}
                label="Level" color={knob}
                formatValue={(v) => Math.round(v).toString()}
              />
              <Knob
                value={entry.sustain} min={0} max={255} step={1}
                onChange={(v) => updateVolEntry(idx, 2, Math.round(v))}
                label="Sustain" color={knob}
                formatValue={(v) => Math.round(v).toString()}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── MODULATION TAB (vibrato table + pitch bend) ───────────────────────────

  const renderModulation = () => (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>

      {/* Vibrato table */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Vibrato Table (5 entries)" />
        <div className="text-[10px] text-text-muted mb-2">
          Each entry: Speed (LFO rate), Delay (ticks before start), Sustain (ticks at this vibrato).
        </div>
        {config.vibTable.slice(0, 5).map((entry, idx) => (
          <div key={idx} className="mb-3">
            <span className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: accent, opacity: 0.5 }}>
              Entry {idx + 1}
            </span>
            <div className="flex gap-4">
              <Knob
                value={entry.speed} min={0} max={255} step={1}
                onChange={(v) => updateVibEntry(idx, 0, Math.round(v))}
                label="Speed" color={knob}
                formatValue={(v) => Math.round(v).toString()}
              />
              <Knob
                value={entry.delay} min={0} max={255} step={1}
                onChange={(v) => updateVibEntry(idx, 1, Math.round(v))}
                label="Delay" color={knob}
                formatValue={(v) => Math.round(v).toString()}
              />
              <Knob
                value={entry.sustain} min={0} max={255} step={1}
                onChange={(v) => updateVibEntry(idx, 2, Math.round(v))}
                label="Sustain" color={knob}
                formatValue={(v) => Math.round(v).toString()}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Pitch bend */}
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accent} label="Pitch Bend" />
        <div className="flex items-center gap-4">
          <Knob
            value={config.pitchBend} min={0} max={65535} step={1}
            onChange={(v) => updatePitchBend(Math.round(v))}
            label="Bend" color={knob} size="md"
            formatValue={(v) => Math.round(v).toString()}
          />
          <span className="text-[10px] text-text-muted">0 = no bend</span>
        </div>
      </div>
    </div>
  );

  // ── SOUND TABLE TAB (synth only, editable) ────────────────────────────

  const renderTable = () => {
    if (config.isSample || !config.table) {
      return (
        <div className="p-3 text-[11px] text-text-muted">
          No synth sound table — this is a PCM sample instrument.
        </div>
      );
    }

    const table = config.table;

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
          <SectionLabel color={accent} label="Wavetable Sequence (48 bytes)" />
          <div className="grid grid-cols-8 gap-1">
            {Array.from(table).map((entry, idx) => {
              const isLoop  = entry === 0xFF;
              const isWave  = entry < 0xFF;

              let bg = '#0a0e14';
              let textColor = '#555';

              if (isWave) {
                bg = accent + '1a';
                textColor = accent;
              } else if (isLoop) {
                bg = '#1a0000';
                textColor = '#884444';
              }

              return (
                <div key={idx}
                  className="flex flex-col items-center py-1 rounded text-[8px] font-mono"
                  style={{ background: bg, border: `1px solid ${textColor}44` }}
                  title={`Byte ${idx}: ${entry} (0x${entry.toString(16).padStart(2, '0').toUpperCase()})`}>
                  <span style={{ color: textColor, opacity: 0.5 }}>{idx}</span>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={entry}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v >= 0 && v <= 255) {
                        updateTableEntry(idx, v);
                      }
                    }}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (isNaN(v)) {
                        updateTableEntry(idx, 0);
                      } else {
                        updateTableEntry(idx, Math.max(0, Math.min(255, v)));
                      }
                    }}
                    className="w-full text-center bg-transparent border-none outline-none text-[9px] font-mono"
                    style={{
                      color: textColor,
                      MozAppearance: 'textfield',
                      WebkitAppearance: 'none',
                    } as React.CSSProperties}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-col gap-1 text-[9px]" style={{ color: accent, opacity: 0.6 }}>
            <span>0-254 = waveform index  ·  255 = loop/end marker (LP)</span>
            <span>Click any cell to edit its value</span>
          </div>
        </div>
      </div>
    );
  };

  // ── TABS ──────────────────────────────────────────────────────────────────

  const tabs: Array<[DM2Tab, string]> = [
    ['envelope',   'Envelope'],
    ['modulation', 'Modulation'],
    ...(!config.isSample ? [['table', 'Table'] as [DM2Tab, string]] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b overflow-x-auto" style={{ borderColor: dim }}>
        {tabs.map(([id, label]) => (
          <button key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
            style={{
              color: activeTab === id ? accent : '#666',
              borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
              background: activeTab === id ? (isCyan ? '#041510' : '#1a0e00') : 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'envelope'   && renderEnvelope()}
      {activeTab === 'modulation' && renderModulation()}
      {activeTab === 'table'      && renderTable()}

      {uadeChipRam && (
        <div className="flex justify-end px-3 py-2 border-t border-opacity-30"
          style={{ borderColor: dim }}>
          <button
            className="text-[10px] px-2 py-1 rounded opacity-70 hover:opacity-100 transition-colors"
            style={{ background: 'rgba(80,50,20,0.5)', color: '#ffaa44' }}
            onClick={() => void getEditor().exportModule(
              uadeChipRam.moduleBase,
              uadeChipRam.moduleSize,
              'song.dm2',
            )}
          >
            Export .dm2 (Amiga)
          </button>
        </div>
      )}
    </div>
  );
};
