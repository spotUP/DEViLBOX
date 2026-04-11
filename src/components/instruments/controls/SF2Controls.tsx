/**
 * SF2Controls — SID Factory II instrument editor (DOM).
 *
 * Three tabs modeled after the native SF2 editor and GTUltraControls:
 *   1. Instrument — Hex byte editor with SID parameter annotations
 *   2. Tables — All driver-defined tables (instrument, command, etc.)
 *   3. SID Monitor — Live SID register display ($D400-$D418)
 *
 * SF2 instruments are driver-defined byte layouts — the exact meaning of each
 * column varies by driver version. We show the raw hex values and annotate
 * common byte positions with their SID meaning where possible.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { SF2Config } from '@/types/instrument/exotic';
import { useSF2Store, type SF2TableDef } from '@/stores/useSF2Store';
import { EnvelopeVisualization, SectionLabel } from '@components/instruments/shared';

// ── Types ──

interface Props {
  config: SF2Config;
  onChange: (updates: Partial<SF2Config>) => void;
  instrumentId: number;
}

type SF2Tab = 'instrument' | 'tables' | 'monitor';

// ── SID Constants ──

const ATTACK_MS = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1000, 3000, 5000, 8000];
const DECAY_MS  = [6, 24, 48, 72, 114, 168, 204, 240, 300, 750, 1500, 2400, 3000, 9000, 15000, 24000];
const RELEASE_MS = DECAY_MS;

const SID_VOICE_REGS = [
  { offset: 0, label: 'Freq Lo' }, { offset: 1, label: 'Freq Hi' },
  { offset: 2, label: 'PW Lo' }, { offset: 3, label: 'PW Hi' },
  { offset: 4, label: 'Control' }, { offset: 5, label: 'AD' }, { offset: 6, label: 'SR' },
] as const;

const SID_GLOBAL_REGS = [
  { offset: 21, label: 'FC Lo' }, { offset: 22, label: 'FC Hi' },
  { offset: 23, label: 'Res/Filt' }, { offset: 24, label: 'Mode/Vol' },
] as const;

// ── Helpers ──

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

// ── Component ──

export const SF2Controls: React.FC<Props> = ({ config, onChange }) => {
  const [tab, setTab] = useState<SF2Tab>('instrument');
  const descriptor = useSF2Store((s) => s.descriptor);
  const instruments = useSF2Store((s) => s.instruments);
  const tableDefs = useSF2Store((s) => s.tableDefs);
  const c64Memory = useSF2Store((s) => s.c64Memory);

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  // Find the instrument table definition
  const instrTableDef = tableDefs.find(t => t.type === 0x80);

  // Get the instrument data from the store (source of truth for edits)
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

  const driverVersion = descriptor
    ? `${descriptor.driverName} v${descriptor.versionMajor}.${String(descriptor.versionMinor).padStart(2, '0')}`
    : 'Unknown Driver';

  // ── Live SID registers ──
  const [sidRegs, setSidRegs] = useState<number[]>(new Array(25).fill(0));
  useEffect(() => {
    if (tab !== 'monitor') return;
    const iv = setInterval(() => {
      const mem = useSF2Store.getState().c64Memory;
      if (mem.length >= 0xD419) {
        const regs: number[] = [];
        for (let i = 0; i < 25; i++) regs.push(mem[0xD400 + i]);
        setSidRegs(regs);
      }
    }, 50);
    return () => clearInterval(iv);
  }, [tab]);

  const tabs: { id: SF2Tab; label: string }[] = [
    { id: 'instrument', label: 'Instrument' },
    { id: 'tables', label: 'Tables' },
    { id: 'monitor', label: 'SID Monitor' },
  ];

  return (
    <div className="flex flex-col gap-2 p-3 text-xs font-mono h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-accent-primary font-bold text-sm">SF2</span>
        <span className="text-text-muted text-[10px]">{driverVersion}</span>
        <span className="text-text-secondary">#{config.instIndex + 1}</span>
        <input
          type="text"
          value={config.name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="flex-1 px-2 py-0.5 bg-dark-bgSecondary border border-dark-border rounded text-text-primary text-xs font-mono min-w-0"
          maxLength={31}
        />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 flex-shrink-0 border-b border-dark-border pb-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1 text-[11px] rounded-t border border-b-0 transition-colors ${
              tab === t.id
                ? 'bg-dark-bgSecondary text-accent-primary border-dark-border font-bold'
                : 'bg-transparent text-text-muted border-transparent hover:text-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'instrument' && (
          <InstrumentTab
            rawBytes={rawBytes}
            colCount={colCount}
            instrTableDef={instrTableDef}
            onByteChange={handleByteChange}
          />
        )}
        {tab === 'tables' && (
          <TablesTab tableDefs={tableDefs} c64Memory={c64Memory} />
        )}
        {tab === 'monitor' && (
          <SIDMonitorTab regs={sidRegs} />
        )}
      </div>
    </div>
  );
};

// ── Instrument Tab ──

const InstrumentTab: React.FC<{
  rawBytes: Uint8Array;
  colCount: number;
  instrTableDef?: SF2TableDef;
  onByteChange: (offset: number, value: number) => void;
}> = ({ rawBytes, colCount, instrTableDef, onByteChange }) => {

  // Try to interpret first bytes as SID-like parameters
  // Many SF2 drivers use: byte[0]=AD, byte[1]=SR, byte[2]=waveform command, etc.
  const hasEnoughBytes = colCount >= 2;
  const ad = hasEnoughBytes ? rawBytes[0] : 0;
  const sr = hasEnoughBytes ? rawBytes[1] : 0;
  const attack = (ad >> 4) & 0x0F;
  const decay = ad & 0x0F;
  const sustain = (sr >> 4) & 0x0F;
  const release = sr & 0x0F;

  return (
    <div className="flex flex-col gap-3">
      {/* ADSR visualization — first 2 bytes are commonly AD/SR */}
      {hasEnoughBytes && (
        <div className="flex flex-col gap-2">
          <SectionLabel label="Envelope (AD/SR)" />
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <EnvelopeVisualization
                mode="sid"
                attack={attack}
                decay={decay}
                sustain={sustain}
                release={release}
              />
            </div>
            <div className="flex flex-col gap-1 text-[10px] text-text-secondary min-w-[80px]">
              <div className="flex justify-between"><span className="text-text-muted">ATK:</span> <span>{attack} ({ATTACK_MS[attack]}ms)</span></div>
              <div className="flex justify-between"><span className="text-text-muted">DEC:</span> <span>{decay} ({DECAY_MS[decay]}ms)</span></div>
              <div className="flex justify-between"><span className="text-text-muted">SUS:</span> <span>{sustain} ({Math.round(sustain / 15 * 100)}%)</span></div>
              <div className="flex justify-between"><span className="text-text-muted">REL:</span> <span>{release} ({RELEASE_MS[release]}ms)</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Waveform info — byte 2 is often a waveform command index */}
      {colCount >= 3 && (
        <div className="flex flex-col gap-1">
          <SectionLabel label="Waveform Pointer" />
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-text-muted">Table idx:</span>
            <span className="text-accent-primary font-bold">${hex(rawBytes[2])}</span>
            <span className="text-text-muted ml-2">({rawBytes[2]})</span>
          </div>
        </div>
      )}

      {/* Raw byte table — the definitive hex editor */}
      <div className="flex flex-col gap-1">
        <SectionLabel label={instrTableDef ? `${instrTableDef.name} (${colCount} cols)` : `Raw Bytes (${colCount})`} />
        {/* Column headers */}
        <div className="flex gap-0.5">
          {Array.from({ length: colCount }, (_, i) => (
            <div key={i} className="w-7 text-center text-text-muted text-[9px]">
              {hex(i)}
            </div>
          ))}
        </div>
        {/* Byte values */}
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
                    onByteChange(i, parsed);
                  }
                }}
                className="w-7 px-0.5 py-0.5 text-center bg-dark-bgSecondary border border-dark-border rounded text-accent-primary text-[10px] font-mono focus:border-accent-primary focus:outline-none"
                maxLength={2}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Tables Tab ──

const TablesTab: React.FC<{
  tableDefs: SF2TableDef[];
  c64Memory: Uint8Array;
}> = ({ tableDefs, c64Memory }) => {
  const [selectedTable, setSelectedTable] = useState(0);
  const td = tableDefs[selectedTable];

  if (tableDefs.length === 0) {
    return <div className="text-text-muted text-center py-8">No driver tables defined</div>;
  }

  const rows = td ? Math.min(td.rowCount, 256) : 0;
  const cols = td?.columnCount ?? 0;
  const displayRows = Math.min(rows, 64); // show first 64 rows

  return (
    <div className="flex flex-col gap-2">
      {/* Table selector tabs */}
      <div className="flex gap-1 flex-wrap">
        {tableDefs.map((t, i) => (
          <button
            key={i}
            onClick={() => setSelectedTable(i)}
            className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
              selectedTable === i
                ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/40 font-bold'
                : 'bg-dark-bgSecondary text-text-muted border-dark-border hover:text-text-secondary'
            }`}
          >
            {t.name}
            <span className="ml-1 text-[9px] opacity-60">
              {t.type === 0x80 ? 'INS' : t.type === 0x81 ? 'CMD' : ''}
            </span>
          </button>
        ))}
      </div>

      {/* Table info */}
      {td && (
        <div className="text-[10px] text-text-muted">
          {td.name} — {td.rowCount} rows × {td.columnCount} cols — addr: ${hex(td.address, 4)}
        </div>
      )}

      {/* Table hex grid */}
      {td && (
        <div className="overflow-auto max-h-[400px]">
          <table className="border-collapse text-[10px]">
            <thead>
              <tr>
                <th className="sticky top-0 bg-dark-bgTertiary text-text-muted px-1 text-right w-8 border-r border-dark-border">Row</th>
                {Array.from({ length: cols }, (_, c) => (
                  <th key={c} className="sticky top-0 bg-dark-bgTertiary text-text-muted px-1 w-6 text-center border-r border-dark-border">
                    {hex(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: displayRows }, (_, r) => (
                <tr key={r} className={r % 16 === 0 ? 'border-t border-dark-border' : ''}>
                  <td className="text-right text-text-muted px-1 border-r border-dark-border bg-dark-bgSecondary">
                    {hex(r)}
                  </td>
                  {Array.from({ length: cols }, (_, c) => {
                    const addr = td.address + r * cols + c;
                    const val = addr < c64Memory.length ? c64Memory[addr] : 0;
                    return (
                      <td key={c} className={`text-center px-0.5 border-r border-dark-border/30 ${
                        val === 0 ? 'text-text-muted/40' : 'text-accent-primary'
                      }`}>
                        {hex(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {rows > displayRows && (
            <div className="text-[9px] text-text-muted mt-1">
              Showing {displayRows} of {rows} rows
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── SID Monitor Tab ──

const SIDMonitorTab: React.FC<{ regs: number[] }> = ({ regs }) => {
  const voices = [0, 1, 2];
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel label="SID Registers ($D400–$D418)" />
      <div className="text-[10px] text-text-muted mb-1">Live values from running SID emulation (20 Hz refresh)</div>

      {voices.map(v => {
        const base = v * 7;
        const freq = regs[base] | (regs[base + 1] << 8);
        const pw = (regs[base + 2] | ((regs[base + 3] & 0x0F) << 8));
        const ctrl = regs[base + 4];
        const gate = ctrl & 1;
        const wf = getActiveWaveforms(ctrl);

        return (
          <div key={v} className="border border-dark-border rounded p-2 bg-dark-bgSecondary">
            <div className="flex items-center gap-2 mb-1">
              <span className={`font-bold ${gate ? 'text-accent-success' : 'text-text-muted'}`}>
                Voice {v + 1}
              </span>
              <span className={`text-[9px] px-1 rounded ${gate ? 'bg-accent-success/20 text-accent-success' : 'bg-dark-bgTertiary text-text-muted'}`}>
                {gate ? 'GATE ON' : 'gate off'}
              </span>
              <span className="text-accent-primary text-[10px] font-bold">{wf}</span>
            </div>
            <div className="grid grid-cols-4 gap-x-3 gap-y-0.5 text-[10px]">
              {SID_VOICE_REGS.map(r => (
                <div key={r.offset} className="flex justify-between">
                  <span className="text-text-muted">{r.label}:</span>
                  <span className="text-text-secondary">${hex(regs[base + r.offset])}</span>
                </div>
              ))}
              <div className="flex justify-between">
                <span className="text-text-muted">Freq:</span>
                <span className="text-text-secondary">{freq}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">PW:</span>
                <span className="text-text-secondary">{pw} ({Math.round(pw / 40.95)}%)</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Global filter registers */}
      <div className="border border-dark-border rounded p-2 bg-dark-bgSecondary">
        <div className="font-bold text-text-secondary text-[11px] mb-1">Filter / Volume</div>
        <div className="grid grid-cols-4 gap-x-3 gap-y-0.5 text-[10px]">
          {SID_GLOBAL_REGS.map(r => (
            <div key={r.offset} className="flex justify-between">
              <span className="text-text-muted">{r.label}:</span>
              <span className="text-text-secondary">${hex(regs[r.offset])}</span>
            </div>
          ))}
          <div className="flex justify-between">
            <span className="text-text-muted">Cutoff:</span>
            <span className="text-text-secondary">{(regs[21] & 7) | (regs[22] << 3)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Res:</span>
            <span className="text-text-secondary">{(regs[23] >> 4) & 0x0F}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Vol:</span>
            <span className="text-text-secondary">{regs[24] & 0x0F}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
