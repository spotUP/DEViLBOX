/**
 * SF2Controls — SID Factory II instrument editor (DOM).
 *
 * Three tabs matching unified SID editor quality:
 *   1. Instrument — ADSR envelope + waveform pointer + raw hex byte editor
 *   2. Tables — All driver-defined tables (instrument, command, etc.)
 *   3. SID Monitor — Live SID register display ($D400-$D418)
 *
 * SF2 instruments are driver-defined byte layouts — the exact meaning of each
 * column varies by driver version. Bytes 0-1 are commonly AD/SR.
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import type { SF2Config } from '@/types/instrument/exotic';
import { useSF2Store, type SF2TableDef } from '@/stores/useSF2Store';
import { EnvelopeVisualization, SectionLabel } from '@components/instruments/shared';
import { useInstrumentColors } from '@/hooks/useInstrumentColors';
import { ATTACK_MS, DECAY_MS, RELEASE_MS, timeLabel, hex2 } from '@/lib/sid/sidConstants';

type SF2Tab = 'instrument' | 'tables' | 'monitor';

interface Props {
  config: SF2Config;
  onChange: (updates: Partial<SF2Config>) => void;
  instrumentId: number;
}

const ACCENT = '#60a5fa';

function hex(v: number, digits = 2): string {
  return v.toString(16).toUpperCase().padStart(digits, '0');
}

function getActiveWaveforms(ctrl: number): string {
  const names: string[] = [];
  if (ctrl & 0x10) names.push('TRI');
  if (ctrl & 0x20) names.push('SAW');
  if (ctrl & 0x40) names.push('PUL');
  if (ctrl & 0x80) names.push('NOI');
  return names.length > 0 ? names.join('+') : 'OFF';
}

const AdsrSlider = ({ label, value, timeMs, accentColor, onChange }: {
  label: string; value: number; timeMs: number; accentColor: string;
  onChange: (v: number) => void;
}) => (
  <div className="flex flex-col items-center gap-0.5" style={{ width: 36 }}>
    <span className="text-[9px] font-mono" style={{ color: accentColor }}>
      {value.toString(16).toUpperCase()}
    </span>
    <input type="range" min={0} max={15} step={1} value={value}
      onChange={(e) => onChange(parseInt(e.target.value))}
      style={{
        writingMode: 'vertical-lr' as React.CSSProperties['writingMode'],
        direction: 'rtl', width: 20, height: 64, accentColor,
      }} />
    <span className="text-[9px] font-bold text-text-secondary">{label}</span>
    <span className="text-[8px] text-text-secondary font-mono">{timeLabel(timeMs)}</span>
  </div>
);

export const SF2Controls: React.FC<Props> = ({ config, onChange }) => {
  const [activeTab, setActiveTab] = useState<SF2Tab>('instrument');
  const descriptor = useSF2Store((s) => s.descriptor);
  const instruments = useSF2Store((s) => s.instruments);
  const tableDefs = useSF2Store((s) => s.tableDefs);
  const c64Memory = useSF2Store((s) => s.c64Memory);

  const { accent: accentColor, dim: dimColor, panelBg, panelStyle } =
    useInstrumentColors(ACCENT, { dim: '#0a1020' });

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const instrTableDef = tableDefs.find(t => t.type === 0x80);
  const storeInst = instruments[config.instIndex];
  const rawBytes = storeInst?.rawBytes ?? config.rawBytes;
  const colCount = instrTableDef?.columnCount ?? config.columnCount;

  const handleByteChange = useCallback((byteOffset: number, value: number) => {
    useSF2Store.getState().setInstrumentByte(configRef.current.instIndex, byteOffset, value);
    const newBytes = new Uint8Array(configRef.current.rawBytes);
    newBytes[byteOffset] = value;
    onChange({ rawBytes: newBytes });
  }, [onChange]);

  const handleNameChange = useCallback((name: string) => {
    onChange({ name });
  }, [onChange]);

  // ADSR from raw bytes (convention: byte[0]=AD, byte[1]=SR)
  const hasEnoughBytes = colCount >= 2;
  const ad = hasEnoughBytes ? rawBytes[0] : 0;
  const sr = hasEnoughBytes ? rawBytes[1] : 0;
  const attack = (ad >> 4) & 0xF;
  const decay = ad & 0xF;
  const sustain = (sr >> 4) & 0xF;
  const release = sr & 0xF;

  const setAdsr = useCallback((a: number, d: number, s: number, r: number) => {
    handleByteChange(0, (a << 4) | (d & 0xF));
    handleByteChange(1, (s << 4) | (r & 0xF));
  }, [handleByteChange]);

  const driverVersion = descriptor
    ? `${descriptor.driverName} v${descriptor.versionMajor}.${String(descriptor.versionMinor).padStart(2, '0')}`
    : 'Unknown Driver';

  // Live SID registers from C64 memory
  const [sidRegs, setSidRegs] = useState<Uint8Array>(new Uint8Array(25));
  useEffect(() => {
    if (activeTab !== 'monitor') return;
    const iv = setInterval(() => {
      const mem = useSF2Store.getState().c64Memory;
      if (mem.length >= 0xD419) {
        const regs = new Uint8Array(25);
        for (let i = 0; i < 25; i++) regs[i] = mem[0xD400 + i];
        setSidRegs(regs);
      }
    }, 66);
    return () => clearInterval(iv);
  }, [activeTab]);

  const tabs: [SF2Tab, string][] = [
    ['instrument', 'Instrument'],
    ...(tableDefs.length > 0 ? [['tables', 'Tables'] as [SF2Tab, string]] : []),
    ['monitor', 'SID Monitor'],
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b" style={{ borderColor: dimColor }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === id ? accentColor : '#666',
              borderBottom: activeTab === id ? `2px solid ${accentColor}` : '2px solid transparent',
              background: activeTab === id ? '#0a1020' : 'transparent',
            }}>
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center px-3 gap-2">
          <span className="text-[9px] text-text-secondary opacity-60">{driverVersion}</span>
          <span className="text-[10px] font-mono" style={{ color: accentColor }}>
            #{config.instIndex + 1}
          </span>
          <input
            type="text"
            value={config.name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="px-2 py-0.5 bg-dark-bgSecondary border border-dark-border rounded text-text-primary text-[10px] font-mono w-32"
            maxLength={31}
          />
        </div>
      </div>

      {/* Instrument tab */}
      {activeTab === 'instrument' && (
        <div className="grid gap-3 p-3 overflow-y-auto synth-controls-flow"
          style={{ maxHeight: 'calc(100vh - 280px)', gridTemplateColumns: hasEnoughBytes ? '1fr 1fr' : '1fr' }}>

          {/* ADSR Envelope */}
          {hasEnoughBytes && (
            <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
              <SectionLabel color={accentColor} label="ADSR Envelope" />
              <EnvelopeVisualization
                mode="sid"
                attack={attack} decay={decay} sustain={sustain} release={release}
                width="auto" height={72}
                color={accentColor} backgroundColor="#060a0e" border="none"
              />
              <div className="flex justify-center gap-2">
                <AdsrSlider label="A" value={attack} timeMs={ATTACK_MS[attack]}
                  accentColor={accentColor}
                  onChange={(v) => setAdsr(v, decay, sustain, release)} />
                <AdsrSlider label="D" value={decay} timeMs={DECAY_MS[decay]}
                  accentColor={accentColor}
                  onChange={(v) => setAdsr(attack, v, sustain, release)} />
                <AdsrSlider label="S" value={sustain} timeMs={0}
                  accentColor={accentColor}
                  onChange={(v) => setAdsr(attack, decay, v, release)} />
                <AdsrSlider label="R" value={release} timeMs={RELEASE_MS[release]}
                  accentColor={accentColor}
                  onChange={(v) => setAdsr(attack, decay, sustain, v)} />
              </div>
              <div className="text-[9px] text-text-secondary text-center mt-1 font-mono">
                AD=${hex2((attack << 4) | decay)} SR=${hex2((sustain << 4) | release)}
              </div>
            </div>
          )}

          {/* Raw Bytes + Waveform Pointer */}
          <div className="flex flex-col gap-3">
            {/* Waveform pointer (byte 2) */}
            {colCount >= 3 && (
              <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
                <SectionLabel color={accentColor} label="Waveform Pointer" />
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-text-muted">Table idx:</span>
                  <span className="font-bold font-mono" style={{ color: accentColor }}>${hex(rawBytes[2])}</span>
                  <span className="text-text-muted">({rawBytes[2]})</span>
                </div>
              </div>
            )}

            {/* Raw hex byte editor */}
            <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
              <SectionLabel color={accentColor}
                label={instrTableDef ? `${instrTableDef.name} (${colCount} cols)` : `Raw Bytes (${colCount})`} />
              <div className="flex gap-0.5 mb-1">
                {Array.from({ length: colCount }, (_, i) => (
                  <div key={i} className="w-7 text-center text-text-muted text-[9px] font-mono">
                    {hex(i)}
                  </div>
                ))}
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: colCount }, (_, i) => {
                  const val = i < rawBytes.length ? rawBytes[i] : 0;
                  return (
                    <input
                      key={i}
                      type="text"
                      value={hex(val)}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value, 16);
                        if (!isNaN(parsed) && parsed >= 0 && parsed <= 0xFF) {
                          handleByteChange(i, parsed);
                        }
                      }}
                      className="w-7 px-0.5 py-0.5 text-center rounded text-[10px] font-mono focus:outline-none"
                      style={{
                        background: '#060a0e',
                        border: `1px solid ${accentColor}33`,
                        color: val > 0 ? accentColor : '#444',
                      }}
                      maxLength={2}
                    />
                  );
                })}
              </div>
              {/* Byte annotations for common positions */}
              {colCount >= 2 && (
                <div className="flex gap-0.5 mt-0.5">
                  <div className="w-7 text-center text-[7px] text-text-muted">AD</div>
                  <div className="w-7 text-center text-[7px] text-text-muted">SR</div>
                  {colCount >= 3 && <div className="w-7 text-center text-[7px] text-text-muted">WF</div>}
                  {Array.from({ length: Math.max(0, colCount - 3) }, (_, i) => (
                    <div key={i + 3} className="w-7" />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tables tab */}
      {activeTab === 'tables' && (
        <TablesTab tableDefs={tableDefs} c64Memory={c64Memory} accentColor={accentColor}
          dimColor={dimColor} panelBg={panelBg} panelStyle={panelStyle} />
      )}

      {/* SID Monitor tab */}
      {activeTab === 'monitor' && (
        <SF2SIDMonitor regs={sidRegs} accentColor={accentColor}
          panelBg={panelBg} panelStyle={panelStyle} />
      )}
    </div>
  );
};

// ── Tables Tab ──

const TablesTab: React.FC<{
  tableDefs: SF2TableDef[];
  c64Memory: Uint8Array;
  accentColor: string;
  dimColor: string;
  panelBg: string;
  panelStyle: React.CSSProperties;
}> = ({ tableDefs, c64Memory, accentColor, dimColor, panelBg, panelStyle }) => {
  const [selectedTable, setSelectedTable] = useState(0);
  const td = tableDefs[selectedTable];
  const setTableByte = useSF2Store((s) => s.setTableByte);

  if (tableDefs.length === 0) {
    return <div className="text-text-muted text-center py-8 text-xs">No driver tables defined</div>;
  }

  const rows = td ? Math.min(td.rowCount, 256) : 0;
  const cols = td?.columnCount ?? 0;
  const displayRows = Math.min(rows, 64);

  return (
    <div className="flex flex-col gap-2 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
      {/* Table selector */}
      <div className="flex gap-1 flex-wrap">
        {tableDefs.map((t, i) => (
          <button key={i} onClick={() => setSelectedTable(i)}
            className="px-2.5 py-1 text-[10px] rounded border transition-colors font-bold"
            style={{
              color: selectedTable === i ? accentColor : '#666',
              borderColor: selectedTable === i ? accentColor + '66' : '#333',
              background: selectedTable === i ? accentColor + '15' : 'transparent',
            }}>
            {t.name}
            <span className="ml-1 text-[9px] opacity-60">
              {t.type === 0x80 ? 'INS' : t.type === 0x81 ? 'CMD' : ''}
            </span>
          </button>
        ))}
      </div>

      {/* Table info */}
      {td && (
        <div className="text-[10px] text-text-muted font-mono">
          {td.rowCount} rows × {td.columnCount} cols — addr: ${hex(td.address, 4)}
        </div>
      )}

      {/* Table hex grid */}
      {td && (
        <div className={`rounded-lg border overflow-auto max-h-[400px] ${panelBg}`} style={panelStyle}>
          <table className="border-collapse text-[10px] font-mono w-full">
            <thead>
              <tr>
                <th className="sticky top-0 px-1 text-right w-8 border-r text-text-muted text-[9px]"
                  style={{ background: dimColor, borderColor: accentColor + '22' }}>Row</th>
                {Array.from({ length: cols }, (_, c) => (
                  <th key={c} className="sticky top-0 px-1 w-6 text-center border-r text-text-muted text-[9px]"
                    style={{ background: dimColor, borderColor: accentColor + '22' }}>
                    {hex(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: displayRows }, (_, r) => (
                <tr key={r} style={r % 16 === 0 ? { borderTop: `1px solid ${accentColor}22` } : undefined}>
                  <td className="text-right text-text-muted px-1 border-r"
                    style={{ borderColor: accentColor + '22', background: dimColor }}>
                    {hex(r)}
                  </td>
                  {Array.from({ length: cols }, (_, c) => {
                    const addr = td.address + c * td.rowCount + r;
                    const val = addr < c64Memory.length ? c64Memory[addr] : 0;
                    return (
                      <td key={c} className="p-0" style={{ borderRight: `1px solid ${accentColor}11` }}>
                        <input
                          type="text"
                          value={hex(val)}
                          onChange={(e) => {
                            const parsed = parseInt(e.target.value, 16);
                            if (!isNaN(parsed) && parsed >= 0 && parsed <= 0xFF) {
                              setTableByte(td, r, c, parsed);
                            }
                          }}
                          className="w-6 px-0.5 py-0 text-center bg-transparent border-none font-mono text-[10px] focus:outline-none focus:ring-1"
                          style={{
                            color: val === 0 ? '#333' : accentColor,
                            ['--tw-ring-color' as string]: accentColor + '50',
                          }}
                          maxLength={2}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {rows > displayRows && (
            <div className="text-[9px] text-text-muted p-2">
              Showing {displayRows} of {rows} rows
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── SID Monitor ──

const SF2SIDMonitor: React.FC<{
  regs: Uint8Array;
  accentColor: string;
  panelBg: string;
  panelStyle: React.CSSProperties;
}> = ({ regs, accentColor, panelBg, panelStyle }) => {
  const voices = [0, 1, 2];

  const SID_VOICE_REG_LABELS = [
    { offset: 0, label: 'Freq Lo' }, { offset: 1, label: 'Freq Hi' },
    { offset: 2, label: 'PW Lo' }, { offset: 3, label: 'PW Hi' },
    { offset: 4, label: 'Control' }, { offset: 5, label: 'AD' }, { offset: 6, label: 'SR' },
  ] as const;

  const SID_FILTER_REG_LABELS = [
    { offset: 21, label: 'FC Lo' }, { offset: 22, label: 'FC Hi' },
    { offset: 23, label: 'Res/Filt' }, { offset: 24, label: 'Mode/Vol' },
  ] as const;

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto synth-controls-flow"
      style={{ maxHeight: 'calc(100vh - 280px)' }}>
      <div className={`rounded-lg border p-3 ${panelBg}`} style={panelStyle}>
        <SectionLabel color={accentColor} label="SID Registers ($D400–$D418)" />
        <div className="font-mono text-xs" style={{ lineHeight: '1.6' }}>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {voices.map((voice) => {
              const base = voice * 7;
              const ctrl = regs[base + 4];
              const gate = ctrl & 1;
              const wf = getActiveWaveforms(ctrl);
              return (
                <div key={voice}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold" style={{ color: accentColor, opacity: 0.6 }}>
                      Voice {voice + 1}
                    </span>
                    <span className="text-[8px] px-1 rounded font-bold"
                      style={{
                        background: gate ? accentColor + '30' : '#111',
                        color: gate ? accentColor : '#444',
                      }}>
                      {gate ? 'GATE' : 'off'}
                    </span>
                    <span className="text-[9px] font-bold" style={{ color: accentColor }}>{wf}</span>
                  </div>
                  <div className="grid gap-x-2" style={{ gridTemplateColumns: 'auto 1fr' }}>
                    {SID_VOICE_REG_LABELS.map(({ offset, label }) => {
                      const val = regs[base + offset];
                      return (
                        <React.Fragment key={offset}>
                          <span className="text-text-secondary text-right">{label}</span>
                          <span style={{ color: val > 0 ? accentColor : '#444' }}>{hex2(val)}</span>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div>
              <div className="text-xs font-bold mb-1" style={{ color: accentColor, opacity: 0.6 }}>
                Filter
              </div>
              <div className="grid gap-x-2" style={{ gridTemplateColumns: 'auto 1fr' }}>
                {SID_FILTER_REG_LABELS.map(({ offset, label }) => {
                  const val = regs[offset];
                  return (
                    <React.Fragment key={offset}>
                      <span className="text-text-secondary text-right">{label}</span>
                      <span style={{ color: val > 0 ? accentColor : '#444' }}>{hex2(val)}</span>
                    </React.Fragment>
                  );
                })}
                <span className="text-text-secondary text-right">Cutoff</span>
                <span style={{ color: accentColor }}>
                  {(regs[21] & 7) | (regs[22] << 3)}
                </span>
                <span className="text-text-secondary text-right">Res</span>
                <span style={{ color: accentColor }}>{(regs[23] >> 4) & 0xF}</span>
                <span className="text-text-secondary text-right">Vol</span>
                <span style={{ color: accentColor }}>{regs[24] & 0xF}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
