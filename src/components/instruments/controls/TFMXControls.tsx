/**
 * TFMXControls.tsx — TFMX (Jochen Hippel) instrument viewer/editor
 *
 * Displays and edits TFMX instrument data structured into three tabs:
 *   • Summary: stats + sample bank info
 *   • VolModSeq: parsed envelope/vibrato header + volume data bytes
 *   • SndModSeqs: decoded command stream for each sound macro sequence
 *
 * Binary format (from libtfmxaudiodecoder Instrument.cpp + Envelope.cpp):
 *
 * VolModSeq (64 bytes per instrument):
 *   [0]   envelopeSpeed  — ticks per envelope step
 *   [1]   sndSeqNum      — which SndModSeq this instrument uses
 *   [2]   vibSpeed
 *   [3]   vibAmpl        — also initial vibrato offset
 *   [4]   vibDelay       — ticks before vibrato starts
 *   [5..63] volume envelope data:
 *           regular byte = volume value (0-64)
 *           0xE0 nn      = loop to position (nn & 0x3F), adjusted -5 for header
 *           0xE1         = end
 *           0xE8 nn      = sustain for nn ticks
 *           0xEA nn mm   = volume slide (speed=nn, time=mm)
 *
 * SndModSeq (64 bytes per sequence):
 *   cmd < 0xE0  → 2-byte regular entry: (transpose/pitch, parameter)
 *   0xE0 nn     → loop to pos (nn & 0x3F)
 *   0xE1        → end
 *   0xE2 nn     → set_wave  (sample index nn, restart envelope)
 *   0xE3 nn mm  → vibrato   (speed nn, amplitude mm)
 *   0xE4 nn     → new_wave  (sample index nn, no envelope restart)
 *   0xE5 nn … (9 bytes total) → wave_mod setup
 *   0xE6 nn … (6 bytes total) → update_wave_mod
 *   0xE7 nn     → set_seq   (jump to SndModSeq nn)
 *   0xE8 nn     → sustain   (sndMod sustain nn ticks)
 *   0xE9 nn mm  → sample_pack (pack index nn, sample within pack mm)
 *   0xEA nn     → randomize / volume randomization threshold
 *
 * Sample header (30 bytes per sample, from TFMXParser.ts TFMX_SAMPLE_STRUCT_SIZE):
 *   [0..17]  name (18 bytes, null-padded)
 *   [18..21] startOffset u32BE
 *   [22..23] lenWords    u16BE  (byte length = lenWords * 2)
 *   [24..25] repOffsWords u16BE
 *   [26..27] repOffsBytes u16BE
 *   [28..29] repLenWords  u16BE
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { TFMXConfig, UADEChipRamInfo } from '@/types/instrument';
import { useThemeStore } from '@stores';
import { UADEChipEditor } from '@/engine/uade/UADEChipEditor';
import { UADEEngine } from '@/engine/uade/UADEEngine';

interface TFMXControlsProps {
  config: TFMXConfig;
  onChange?: (cfg: TFMXConfig) => void;
  /** Present when this instrument was loaded via UADE's native TFMX parser. */
  uadeChipRam?: UADEChipRamInfo;
}

type TFMXTab = 'summary' | 'volmod' | 'sndmod';

// ── Binary parsing helpers ────────────────────────────────────────────────────

interface VolModHeader {
  envelopeSpeed: number;
  sndSeqNum: number;
  vibSpeed: number;
  vibAmpl: number;
  vibDelay: number;
}

function parseVolModHeader(data: Uint8Array): VolModHeader {
  return {
    envelopeSpeed: data[0] ?? 0,
    sndSeqNum:     data[1] ?? 0,
    vibSpeed:      data[2] ?? 0,
    vibAmpl:       data[3] ?? 0,
    vibDelay:      data[4] ?? 0,
  };
}

interface VolEnvEntry {
  pos: number;      // byte offset within data (starting at 5)
  raw: number;
  kind: 'volume' | 'loop' | 'end' | 'sustain' | 'slide' | 'unknown';
  label: string;
  detail: string;
  argBytes: number; // total bytes consumed including cmd byte
}

/** Parse the volume envelope data starting at byte 5 of a VolModSeq. */
function parseVolEnvelope(data: Uint8Array): VolEnvEntry[] {
  const entries: VolEnvEntry[] = [];
  let i = 5; // envelope data starts at offset 5
  const limit = Math.min(data.length, 64);
  while (i < limit) {
    const cmd = data[i];
    if (cmd === 0xE0 && i + 1 < limit) {
      const target = (data[i + 1] ?? 0) & 0x3F;
      entries.push({ pos: i, raw: cmd, kind: 'loop', label: 'LOOP', detail: `→ pos ${target}`, argBytes: 2 });
      i += 2;
    } else if (cmd === 0xE1) {
      entries.push({ pos: i, raw: cmd, kind: 'end', label: 'END', detail: '', argBytes: 1 });
      i += 1;
      break;
    } else if (cmd === 0xE8 && i + 1 < limit) {
      const ticks = data[i + 1] ?? 0;
      entries.push({ pos: i, raw: cmd, kind: 'sustain', label: 'SUSTAIN', detail: `${ticks} ticks`, argBytes: 2 });
      i += 2;
    } else if (cmd === 0xEA && i + 2 < limit) {
      const speed = data[i + 1] ?? 0;
      const time  = data[i + 2] ?? 0;
      entries.push({ pos: i, raw: cmd, kind: 'slide', label: 'VOL SLIDE', detail: `spd=${speed} t=${time}`, argBytes: 3 });
      i += 3;
    } else if (cmd >= 0xE0) {
      entries.push({ pos: i, raw: cmd, kind: 'unknown', label: `$${cmd.toString(16).toUpperCase()}`, detail: 'unknown cmd', argBytes: 1 });
      i += 1;
    } else {
      // Regular volume value (0-64)
      entries.push({ pos: i, raw: cmd, kind: 'volume', label: 'VOL', detail: `${cmd}`, argBytes: 1 });
      i += 1;
    }
  }
  return entries;
}

interface SndSeqEntry {
  pos: number;
  raw: number;
  kind: string;
  label: string;
  detail: string;
  argBytes: number;
}

/** Parse one 64-byte SndModSeq into a list of decoded entries. */
function parseSndSeq(data: Uint8Array, seqIdx: number, seqsCount: number): SndSeqEntry[] {
  const entries: SndSeqEntry[] = [];
  const base  = seqIdx * 64;
  const limit = Math.min(base + 64, data.length);
  let i = base;
  while (i < limit) {
    const pos = i - base;
    const cmd = data[i];
    if (cmd < 0xE0) {
      const param = i + 1 < limit ? data[i + 1] : 0;
      const isLocked = (cmd & 0x80) !== 0;
      const val = cmd & 0x7F;
      entries.push({
        pos, raw: cmd, kind: 'note',
        label: isLocked ? 'NOTE' : 'TRANS',
        detail: isLocked ? `pitch=$${val.toString(16).padStart(2,'0')} p2=$${param.toString(16).padStart(2,'0')}` : `trans=${val - 64} p2=$${param.toString(16).padStart(2,'0')}`,
        argBytes: 2,
      });
      i += 2;
    } else if (cmd === 0xE0 && i + 1 < limit) {
      const target = (data[i + 1] ?? 0) & 0x3F;
      entries.push({ pos, raw: cmd, kind: 'loop',   label: 'LOOP',    detail: `→ pos ${target}`, argBytes: 2 });
      i += 2;
    } else if (cmd === 0xE1) {
      entries.push({ pos, raw: cmd, kind: 'end',    label: 'END',     detail: '',               argBytes: 1 });
      i += 1;
      break;
    } else if (cmd === 0xE2 && i + 1 < limit) {
      const smp = data[i + 1] ?? 0;
      entries.push({ pos, raw: cmd, kind: 'setwave', label: 'SET_WAVE', detail: `smp#${smp}`, argBytes: 2 });
      i += 2;
    } else if (cmd === 0xE3 && i + 2 < limit) {
      const spd = data[i + 1] ?? 0;
      const amp = data[i + 2] ?? 0;
      entries.push({ pos, raw: cmd, kind: 'vibrato', label: 'VIBRATO', detail: `spd=${spd} amp=${amp}`, argBytes: 3 });
      i += 3;
    } else if (cmd === 0xE4 && i + 1 < limit) {
      const smp = data[i + 1] ?? 0;
      entries.push({ pos, raw: cmd, kind: 'newwave', label: 'NEW_WAVE', detail: `smp#${smp}`, argBytes: 2 });
      i += 2;
    } else if (cmd === 0xE5) {
      // wave_mod: 9 bytes total (cmd + 8 args)
      const smp   = i + 1 < limit ? data[i + 1] : 0;
      entries.push({ pos, raw: cmd, kind: 'wavemod', label: 'WAVE_MOD', detail: `smp#${smp} (+8 args)`, argBytes: 9 });
      i += 9;
    } else if (cmd === 0xE6) {
      // update_wave_mod: 6 bytes total (cmd + 5 args)
      entries.push({ pos, raw: cmd, kind: 'updwavemod', label: 'UPD_WAVE_MOD', detail: '(+5 args)', argBytes: 6 });
      i += 6;
    } else if (cmd === 0xE7 && i + 1 < limit) {
      const seq = data[i + 1] ?? 0;
      const valid = seq < seqsCount;
      entries.push({ pos, raw: cmd, kind: 'setseq', label: 'SET_SEQ', detail: `seq#${seq}${valid ? '' : ' (!)'}`, argBytes: 2 });
      i += 2;
    } else if (cmd === 0xE8 && i + 1 < limit) {
      const ticks = data[i + 1] ?? 0;
      entries.push({ pos, raw: cmd, kind: 'sustain', label: 'SUSTAIN', detail: `${ticks} ticks`, argBytes: 2 });
      i += 2;
    } else if (cmd === 0xE9 && i + 2 < limit) {
      const pack = data[i + 1] ?? 0;
      const smp  = data[i + 2] ?? 0;
      entries.push({ pos, raw: cmd, kind: 'smppack', label: 'SMP_PACK', detail: `pack#${pack} smp#${smp}`, argBytes: 3 });
      i += 3;
    } else if (cmd === 0xEA && i + 1 < limit) {
      const thresh = data[i + 1] ?? 0;
      entries.push({ pos, raw: cmd, kind: 'random', label: 'RANDOMIZE', detail: `thresh=${thresh}`, argBytes: 2 });
      i += 2;
    } else {
      entries.push({ pos, raw: cmd, kind: 'unknown', label: `$${cmd.toString(16).toUpperCase()}`, detail: '?', argBytes: 1 });
      i += 1;
    }
  }
  return entries;
}

interface SampleInfo {
  idx: number;
  name: string;
  startOffset: number;
  lenBytes: number;
  repOffset: number;
  repLenBytes: number;
}

const SAMPLE_STRUCT_SIZE = 30;

function parseSampleHeaders(headers: Uint8Array, count: number): SampleInfo[] {
  const result: SampleInfo[] = [];
  for (let i = 0; i < count; i++) {
    const base = i * SAMPLE_STRUCT_SIZE;
    if (base + SAMPLE_STRUCT_SIZE > headers.length) break;
    let name = '';
    for (let j = 0; j < 18; j++) {
      const b = headers[base + j];
      if (b === 0) break;
      name += String.fromCharCode(b);
    }
    const startOffset = ((headers[base + 18] << 24) | (headers[base + 19] << 16) | (headers[base + 20] << 8) | headers[base + 21]) >>> 0;
    const lenWords    = (headers[base + 22] << 8) | headers[base + 23];
    const repOffsBytes= (headers[base + 24] << 8) | headers[base + 25]; // actually offset at [26,27] per parser note
    const repLenWords = (headers[base + 28] << 8) | headers[base + 29];
    result.push({
      idx: i,
      name: name.trim() || `Sample ${i + 1}`,
      startOffset,
      lenBytes:    lenWords * 2,
      repOffset:   repOffsBytes,
      repLenBytes: repLenWords * 2,
    });
  }
  return result;
}

// ── Hex preview ───────────────────────────────────────────────────────────────

function hexPreview(data: Uint8Array, maxBytes = 64): string {
  const bytes = data.slice(0, maxBytes);
  const rows: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const hex   = Array.from(chunk).map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const asc   = Array.from(chunk).map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
    rows.push(`${i.toString(16).padStart(4, '0')}  ${hex.padEnd(47)}  ${asc}`);
  }
  return rows.join('\n');
}

// ── Component ─────────────────────────────────────────────────────────────────

export const TFMXControls: React.FC<TFMXControlsProps> = ({ config, onChange, uadeChipRam }) => {
  const [activeTab,    setActiveTab]    = useState<TFMXTab>('summary');
  const [showVolHex,   setShowVolHex]   = useState(false);
  const [showSndHex,   setShowSndHex]   = useState(false);
  const [activeSndSeq, setActiveSndSeq] = useState(0);

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  // Lazy UADEChipEditor singleton — only created when chip RAM is present
  const chipEditorRef = useRef<UADEChipEditor | null>(null);
  const getEditor = useCallback(() => {
    if (!chipEditorRef.current) {
      chipEditorRef.current = new UADEChipEditor(UADEEngine.getInstance());
    }
    return chipEditorRef.current;
  }, []);

  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const isCyan = currentThemeId === 'cyan-lineart';

  const accent   = isCyan ? '#00ffff' : '#ff6644';
  const accentDim = isCyan ? '#009999' : '#cc4422';
  const dim      = isCyan ? '#004444' : '#331100';
  const panelBg  = isCyan ? 'bg-[#041510] border-cyan-900/50' : 'bg-[#1a0800] border-red-900/30';
  const panelBg2 = isCyan ? '#041510' : '#1a0800';
  const inputBg  = isCyan ? '#020e0a' : '#0e0500';

  const readonly = !onChange;

  // ── Mutation helpers ──────────────────────────────────────────────────────

  /**
   * Write a single byte into volModSeqData, call onChange, and mirror the
   * change to chip RAM when a UADE context is active.
   *
   * byteIdx is relative to the start of this instrument's VolModSeq block.
   * In chip RAM: address = instrBase + byteIdx.
   */
  const setVolByte = useCallback((byteIdx: number, value: number) => {
    if (!onChange) return;
    const cur = configRef.current;
    const next = new Uint8Array(cur.volModSeqData);
    next[byteIdx] = Math.max(0, Math.min(255, value));
    onChange({ ...cur, volModSeqData: next });
    if (uadeChipRam) {
      void getEditor().writeU8(uadeChipRam.instrBase + byteIdx, next[byteIdx]);
    }
  }, [onChange, uadeChipRam, getEditor]);

  // ── Sub-renderers ─────────────────────────────────────────────────────────

  const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-2"
      style={{ color: accent, opacity: 0.7 }}>
      {label}
    </div>
  );

  const StatRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[10px] text-gray-500 w-36">{label}</span>
      <span className="text-[10px] font-mono" style={{ color: accent }}>{value}</span>
    </div>
  );

  // ── SUMMARY TAB ───────────────────────────────────────────────────────────

  const renderSummary = () => {
    const samples = parseSampleHeaders(config.sampleHeaders, config.sampleCount);
    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {/* Overview stats */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="TFMX Instrument Data" />
          <StatRow label="SndModSeq count"  value={config.sndSeqsCount.toString()} />
          <StatRow label="SndModSeq bytes"  value={`${config.sndModSeqData.byteLength} B`} />
          <StatRow label="VolModSeq bytes"  value={`${config.volModSeqData.byteLength} B`} />
          <StatRow label="Sample slots"     value={config.sampleCount.toString()} />
          <StatRow label="Sample headers"   value={`${config.sampleHeaders.byteLength} B`} />
          <StatRow label="Sample PCM bank"  value={`${(config.sampleData.byteLength / 1024).toFixed(1)} KiB`} />
          <div className="mt-2 text-[9px] text-gray-600">
            TFMX instruments use SndMod/VolMod macro sequences with a shared PCM sample bank.
          </div>
        </div>

        {/* Sample bank */}
        {samples.length > 0 && (
          <div className={`rounded-lg border p-3 ${panelBg}`}>
            <SectionLabel label="Sample Bank" />
            <div className="font-mono text-[9px] flex border-b mb-1 pb-0.5"
              style={{ borderColor: dim, color: '#555' }}>
              <span className="w-5">#</span>
              <span className="w-28">Name</span>
              <span className="w-16 text-right pr-2">Offset</span>
              <span className="w-16 text-right pr-2">Len</span>
              <span className="w-16 text-right">RepLen</span>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
              {samples.map((s) => (
                <div key={s.idx} className="font-mono text-[9px] flex py-0.5 items-center">
                  <span className="w-5 text-gray-600">{s.idx}</span>
                  <span className="w-28 truncate" style={{ color: accent }}>{s.name}</span>
                  <span className="w-16 text-right pr-2 text-gray-500">
                    ${s.startOffset.toString(16).padStart(6, '0')}
                  </span>
                  <span className="w-16 text-right pr-2 text-gray-400">
                    {s.lenBytes > 0 ? `${(s.lenBytes / 1024).toFixed(1)}K` : '0'}
                  </span>
                  <span className="w-16 text-right text-gray-500">
                    {s.repLenBytes > 2 ? `${(s.repLenBytes / 1024).toFixed(1)}K` : '–'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Export .mdat — only shown when chip RAM context is available */}
        {uadeChipRam && (
          <div className={`rounded-lg border p-3 ${panelBg}`}>
            <SectionLabel label="Export" />
            <button
              onClick={() => {
                void getEditor().exportModule(
                  uadeChipRam.moduleBase,
                  uadeChipRam.moduleSize,
                  'module.mdat',
                );
              }}
              className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded border transition-colors"
              style={{
                borderColor: accentDim,
                color: accentDim,
                background: 'transparent',
              }}>
              Export .mdat (Amiga)
            </button>
            <div className="mt-1 text-[9px] text-gray-600">
              Downloads the full mdat file with any chip RAM edits applied.
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── VOLMOD TAB ────────────────────────────────────────────────────────────

  const renderVolMod = () => {
    const hdr  = parseVolModHeader(config.volModSeqData);
    const envEntries = parseVolEnvelope(config.volModSeqData);

    const kindColor = (kind: string): string => {
      if (kind === 'volume')  return accent;
      if (kind === 'end')     return '#ff4444';
      if (kind === 'loop')    return '#44ff88';
      if (kind === 'sustain') return '#ffaa44';
      if (kind === 'slide')   return '#aa88ff';
      return '#666';
    };

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {/* Header fields */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <SectionLabel label="VolModSeq Header (bytes 0–4)" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {([
              ['[0] Env Speed',  0, hdr.envelopeSpeed],
              ['[1] SndSeq #',   1, hdr.sndSeqNum],
              ['[2] Vib Speed',  2, hdr.vibSpeed],
              ['[3] Vib Ampl',   3, hdr.vibAmpl],
              ['[4] Vib Delay',  4, hdr.vibDelay],
            ] as [string, number, number][]).map(([lbl, idx, val]) => (
              <div key={idx} className="flex items-center gap-2 py-0.5">
                <span className="text-[9px] text-gray-500 w-24">{lbl}</span>
                <input
                  type="number"
                  min={0} max={255}
                  disabled={readonly}
                  value={val}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v)) setVolByte(idx, v);
                  }}
                  className="text-[10px] font-mono text-center border rounded py-0.5"
                  style={{
                    width: '52px',
                    background: inputBg,
                    borderColor: dim,
                    color: val !== 0 ? accent : '#444',
                    cursor: readonly ? 'default' : undefined,
                  }}
                />
              </div>
            ))}
          </div>
          {hdr.sndSeqNum >= config.sndSeqsCount && (
            <div className="mt-2 text-[9px]" style={{ color: '#ff6644' }}>
              Warning: SndSeq #{hdr.sndSeqNum} is out of range (max {config.sndSeqsCount - 1})
            </div>
          )}
        </div>

        {/* Volume envelope data */}
        <div className={`rounded-lg border p-3 ${panelBg}`}>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel label="Volume Envelope (bytes 5–63)" />
            <button
              onClick={() => setShowVolHex((v) => !v)}
              className="text-[9px] px-2 py-0.5 rounded border"
              style={{ borderColor: dim, color: accentDim, background: 'transparent' }}>
              {showVolHex ? 'Hide' : 'Hex'}
            </button>
          </div>

          {showVolHex ? (
            <pre className="text-[9px] font-mono overflow-x-auto p-2 rounded"
              style={{ background: '#080400', color: '#888', border: `1px solid ${dim}` }}>
              {hexPreview(config.volModSeqData.slice(5))}
            </pre>
          ) : (
            <>
              {/* Column headers */}
              <div className="flex font-mono text-[9px] border-b mb-1 pb-0.5"
                style={{ borderColor: dim, color: '#555' }}>
                <span className="w-6 text-center">Pos</span>
                <span className="w-8 text-center">Hex</span>
                <span className="w-16 text-center">Cmd</span>
                <span className="flex-1">Detail</span>
                {!readonly && <span className="w-12 text-right">Edit</span>}
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: '220px' }}>
                {envEntries.length === 0 ? (
                  <div className="text-[9px] text-gray-600 py-2">No envelope data</div>
                ) : (
                  envEntries.map((e, i) => (
                    <div key={i} className="flex items-center font-mono text-[9px] py-0.5">
                      <span className="w-6 text-center text-gray-600">{e.pos}</span>
                      <span className="w-8 text-center text-gray-500">
                        {e.raw.toString(16).padStart(2,'0')}
                      </span>
                      <span className="w-16 text-center font-bold" style={{ color: kindColor(e.kind) }}>
                        {e.label}
                      </span>
                      <span className="flex-1 text-gray-400">{e.detail}</span>
                      {!readonly && e.kind === 'volume' && (
                        <input
                          type="number"
                          min={0} max={64}
                          value={e.raw}
                          onChange={(ev) => {
                            const v = parseInt(ev.target.value);
                            if (!isNaN(v)) setVolByte(5 + e.pos, v);
                          }}
                          className="text-[9px] font-mono text-center border rounded py-0"
                          style={{
                            width: '44px',
                            background: inputBg,
                            borderColor: dim,
                            color: accent,
                          }}
                        />
                      )}
                      {!readonly && e.kind !== 'volume' && (
                        <span className="w-12" />
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="mt-2 text-[9px] text-gray-600">
                Volume range 0–64. Commands: E0=loop E1=end E8=sustain EA=vol-slide
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ── SNDMOD TAB ────────────────────────────────────────────────────────────

  const renderSndMod = () => {
    const seqCount = Math.min(config.sndSeqsCount, Math.floor(config.sndModSeqData.length / 64));
    const clampedSeq = Math.max(0, Math.min(seqCount - 1, activeSndSeq));
    const entries = seqCount > 0
      ? parseSndSeq(config.sndModSeqData, clampedSeq, seqCount)
      : [];

    const kindColor = (kind: string): string => {
      switch (kind) {
        case 'setwave':
        case 'newwave':   return '#88ccff';
        case 'end':       return '#ff4444';
        case 'loop':      return '#44ff88';
        case 'sustain':   return '#ffaa44';
        case 'vibrato':   return '#ff88ff';
        case 'setseq':    return '#ffff44';
        case 'wavemod':
        case 'updwavemod':return '#44ffff';
        case 'smppack':   return '#88ff88';
        case 'random':    return '#ffaa88';
        case 'note':      return accent;
        default:          return '#666';
      }
    };

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {seqCount === 0 ? (
          <div className={`rounded-lg border p-3 ${panelBg}`}>
            <div className="text-[9px] text-gray-600">No SndModSeq data</div>
          </div>
        ) : (
          <>
            {/* Sequence selector */}
            <div className={`rounded-lg border p-3 ${panelBg}`}>
              <SectionLabel label="Sound Modulation Sequences" />
              <div className="flex items-center gap-2 flex-wrap">
                {Array.from({ length: seqCount }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveSndSeq(i)}
                    className="text-[9px] font-mono px-2 py-0.5 rounded border transition-colors"
                    style={{
                      borderColor: i === clampedSeq ? accent : dim,
                      color:       i === clampedSeq ? panelBg2 : accentDim,
                      background:  i === clampedSeq ? accent   : 'transparent',
                    }}>
                    {i}
                  </button>
                ))}
              </div>
            </div>

            {/* Sequence entries */}
            <div className={`rounded-lg border p-3 ${panelBg}`}>
              <div className="flex items-center justify-between mb-2">
                <SectionLabel label={`SndModSeq #${clampedSeq}`} />
                <button
                  onClick={() => setShowSndHex((v) => !v)}
                  className="text-[9px] px-2 py-0.5 rounded border"
                  style={{ borderColor: dim, color: accentDim, background: 'transparent' }}>
                  {showSndHex ? 'Hide' : 'Hex'}
                </button>
              </div>

              {showSndHex ? (
                <pre className="text-[9px] font-mono overflow-x-auto p-2 rounded"
                  style={{ background: '#080400', color: '#888', border: `1px solid ${dim}` }}>
                  {hexPreview(config.sndModSeqData.slice(clampedSeq * 64, clampedSeq * 64 + 64))}
                </pre>
              ) : (
                <>
                  {/* Column headers */}
                  <div className="flex font-mono text-[9px] border-b mb-1 pb-0.5"
                    style={{ borderColor: dim, color: '#555' }}>
                    <span className="w-6 text-center">Pos</span>
                    <span className="w-8 text-center">Hex</span>
                    <span className="w-24 text-center">Cmd</span>
                    <span className="flex-1">Detail</span>
                  </div>
                  <div className="overflow-y-auto" style={{ maxHeight: '260px' }}>
                    {entries.length === 0 ? (
                      <div className="text-[9px] text-gray-600 py-2">Empty sequence</div>
                    ) : (
                      entries.map((e, i) => (
                        <div key={i} className="flex items-center font-mono text-[9px] py-0.5">
                          <span className="w-6 text-center text-gray-600">{e.pos}</span>
                          <span className="w-8 text-center text-gray-500">
                            {e.raw.toString(16).padStart(2,'0')}
                          </span>
                          <span className="w-24 text-center font-bold" style={{ color: kindColor(e.kind) }}>
                            {e.label}
                          </span>
                          <span className="flex-1 text-gray-400">{e.detail}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="mt-2 text-[9px] text-gray-600">
                    E2/E4=set/new wave · E3=vibrato · E7=jump seq · E8=sustain · E9=smp pack
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  // ── Tab bar ───────────────────────────────────────────────────────────────

  const TABS: { id: TFMXTab; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'volmod',  label: 'VolModSeq' },
    { id: 'sndmod',  label: 'SndModSeqs' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b" style={{ borderColor: dim }}>
        {TABS.map(({ id, label }) => (
          <button key={id}
            onClick={() => setActiveTab(id)}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              color:        activeTab === id ? accent : '#666',
              borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
              background:   activeTab === id ? (isCyan ? '#041510' : '#1a0800') : 'transparent',
            }}>
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'summary' && renderSummary()}
      {activeTab === 'volmod'  && renderVolMod()}
      {activeTab === 'sndmod'  && renderSndMod()}
    </div>
  );
};
