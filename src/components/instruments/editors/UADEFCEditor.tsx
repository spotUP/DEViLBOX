/**
 * UADEFCEditor — Future Composer chip RAM instrument parameter editor.
 *
 * Displays and allows live editing of FC vol macro and freq macro bytes
 * for FCSynth instruments loaded via the UADE native parser.
 *
 * The FC vol macro (64 bytes) layout:
 *   [0]  volSpeed       — ticks per volume envelope step
 *   [1]  freqMacroIdx   — which freq macro this instrument uses
 *   [2]  vibSpeed       — vibrato speed
 *   [3]  vibDepth       — vibrato depth
 *   [4]  vibDelay       — ticks before vibrato starts
 *   [5..63] vol data    — volume envelope values; 0xE1 = end marker
 *
 * The FC freq macro (64 bytes) layout — raw opcodes used by FC replay:
 *   0xE1 = end, 0xE0 nn = loop-to nn, 0xE2/E4 ww = set waveform ww,
 *   0xE3/EA/E8 = pitch effects, anything else = pitch offset
 *
 * instrBase (from UADEChipRamInfo) = moduleBase + volMacroPtr + instrIdx*64
 * So instrIdx = (instrBase - sections.volMacros) / 64
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import { UADEChipEditor } from '@engine/uade/UADEChipEditor';
import { UADEEngine } from '@engine/uade/UADEEngine';
import { Download, AlertCircle, RefreshCcw, Music } from 'lucide-react';

interface Props {
  instrument: InstrumentConfig;
}

const MACRO_SIZE = 64;

// ── Byte-grid cell component ─────────────────────────────────────────────────

interface ByteCellProps {
  index: number;
  value: number;
  onChange: (index: number, value: number) => void;
  label?: string;
  signed?: boolean;
}

function ByteCell({ index, value, onChange, label, signed }: ByteCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = signed
    ? (value > 127 ? value - 256 : value)
    : value;

  const isEndMarker = value === 0xE1;
  const isSpecial   = value >= 0xE0 && value <= 0xFF;

  function startEdit() {
    setDraft(displayValue.toString(16).toUpperCase().padStart(2, '0'));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit() {
    const parsed = parseInt(draft, 16);
    if (!isNaN(parsed)) {
      const clamped = Math.max(0, Math.min(255, parsed < 0 ? parsed + 256 : parsed));
      onChange(index, clamped);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') setEditing(false);
  }

  const cellBg = isEndMarker
    ? 'bg-amber-900/40 border-amber-700/60'
    : isSpecial
      ? 'bg-purple-900/40 border-purple-700/60'
      : 'bg-dark-bgSecondary border-dark-border hover:border-dark-border/80 hover:bg-dark-bg/80 cursor-pointer';

  return (
    <div className="flex flex-col items-center gap-0.5">
      {label && (
        <span className="text-[8px] font-mono text-text-muted uppercase tracking-wide leading-none">
          {label}
        </span>
      )}
      <div
        className={`w-7 h-7 rounded border text-[10px] font-mono flex items-center justify-center relative ${cellBg}`}
        onClick={() => !isEndMarker && startEdit()}
        title={`Byte ${index}: 0x${value.toString(16).toUpperCase().padStart(2, '0')} (dec ${value})`}
      >
        {editing ? (
          <input
            ref={inputRef}
            className="absolute inset-0 w-full h-full text-center text-[10px] font-mono bg-dark-bg text-white border-0 outline-none rounded"
            value={draft}
            onChange={e => setDraft(e.target.value.slice(0, 2))}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            maxLength={2}
          />
        ) : (
          <span className={
            isEndMarker ? 'text-amber-400' :
            isSpecial   ? 'text-purple-300' :
            'text-text-primary'
          }>
            {value.toString(16).toUpperCase().padStart(2, '0')}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, address }: { title: string; address: number }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">{title}</h3>
      <span className="text-[10px] font-mono text-text-muted bg-dark-bg px-1.5 py-0.5 rounded border border-dark-border">
        0x{address.toString(16).toUpperCase()}
      </span>
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────

export function UADEFCEditor({ instrument }: Props) {
  const chipRam = instrument.uadeChipRam;
  const editorRef = useRef<UADEChipEditor | null>(null);

  const [volMacro, setVolMacro]   = useState<Uint8Array | null>(null);
  const [freqMacro, setFreqMacro] = useState<Uint8Array | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Lazy-initialise the chip editor singleton reference
  if (!editorRef.current) {
    editorRef.current = new UADEChipEditor(UADEEngine.getInstance());
  }

  // ── Derived addresses ───────────────────────────────────────────────────────

  const volMacroAddr: number | null =
    chipRam?.sections?.['volMacros'] != null
      ? chipRam.instrBase   // instrBase IS the vol macro address for this instrument
      : null;

  const instrIdx: number | null =
    chipRam?.sections?.['volMacros'] != null
      ? Math.floor((chipRam.instrBase - chipRam.sections['volMacros']) / MACRO_SIZE)
      : null;

  // ── Load macro data from chip RAM ───────────────────────────────────────────

  const loadMacros = useCallback(async () => {
    if (!chipRam || !editorRef.current || volMacroAddr === null) return;
    setLoading(true);
    setError(null);
    try {
      const editor = editorRef.current;
      const vol = await editor.readBytes(volMacroAddr, MACRO_SIZE);
      setVolMacro(new Uint8Array(vol));

      // byte 1 of vol macro = freqMacroIdx
      const freqIdx = vol[1] ?? 0;
      const freqAddr = chipRam.sections['freqMacros'] + freqIdx * MACRO_SIZE;
      const freq = await editor.readBytes(freqAddr, MACRO_SIZE);
      setFreqMacro(new Uint8Array(freq));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [chipRam, volMacroAddr]);

  useEffect(() => {
    loadMacros();
  }, [loadMacros]);

  // ── Byte change handlers ────────────────────────────────────────────────────

  const handleVolByteChange = useCallback(async (index: number, value: number) => {
    if (!volMacro || !editorRef.current || volMacroAddr === null) return;
    try {
      await editorRef.current.writeU8(volMacroAddr + index, value);
      const updated = new Uint8Array(volMacro);
      updated[index] = value;
      setVolMacro(updated);

      // If freqMacroIdx changed (byte 1), reload freq macro
      if (index === 1 && chipRam) {
        const newFreqAddr = chipRam.sections['freqMacros'] + value * MACRO_SIZE;
        const freq = await editorRef.current.readBytes(newFreqAddr, MACRO_SIZE);
        setFreqMacro(new Uint8Array(freq));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [volMacro, volMacroAddr, chipRam]);

  const handleFreqByteChange = useCallback(async (index: number, value: number) => {
    if (!freqMacro || !editorRef.current || !chipRam || !volMacro) return;
    const freqIdx = volMacro[1] ?? 0;
    const freqAddr = chipRam.sections['freqMacros'] + freqIdx * MACRO_SIZE;
    try {
      await editorRef.current.writeU8(freqAddr + index, value);
      const updated = new Uint8Array(freqMacro);
      updated[index] = value;
      setFreqMacro(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [freqMacro, chipRam, volMacro]);

  // ── Export handler ──────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    if (!chipRam || !editorRef.current) return;
    setExporting(true);
    try {
      const filename = `${instrument.name || 'fc_module'}.mod`;
      await editorRef.current.exportModule(chipRam.moduleBase, chipRam.moduleSize, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }, [chipRam, instrument.name]);

  // ── Guard: not loaded via UADE ──────────────────────────────────────────────

  if (!chipRam || chipRam.sections['volMacros'] == null) {
    return (
      <div className="flex items-center gap-2 p-4 bg-dark-bgSecondary rounded-lg border border-dark-border text-text-muted text-xs">
        <AlertCircle size={14} className="shrink-0 text-amber-400" />
        <span>
          No chip RAM data available. This instrument was not loaded via the UADE native parser,
          or the FC module has not been played yet.
        </span>
      </div>
    );
  }

  // ── Vol macro header labels (first 5 bytes have named fields) ──────────────

  const VOL_LABELS: Record<number, string> = {
    0: 'spd',
    1: 'frq#',
    2: 'vspd',
    3: 'vdep',
    4: 'vdly',
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const freqMacroIdx = volMacro?.[1] ?? 0;
  const freqMacroAddr =
    chipRam.sections['freqMacros'] != null
      ? chipRam.sections['freqMacros'] + freqMacroIdx * MACRO_SIZE
      : null;

  return (
    <div className="space-y-4 p-3">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music size={13} className="text-text-muted" />
          <span className="text-xs font-mono text-text-muted">
            FC Inst {instrIdx !== null ? instrIdx + 1 : '?'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadMacros}
            disabled={loading}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono bg-dark-bgSecondary hover:bg-dark-bg border border-dark-border rounded transition-colors disabled:opacity-50"
            title="Reload from chip RAM"
          >
            <RefreshCcw size={10} className={loading ? 'animate-spin' : ''} />
            Reload
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono bg-dark-bgSecondary hover:bg-dark-bg border border-dark-border rounded transition-colors disabled:opacity-50"
            title="Export module with current edits"
          >
            <Download size={10} />
            Export
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded text-[11px] text-red-300">
          <AlertCircle size={12} className="shrink-0" />
          <span className="font-mono">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200 text-xs">✕</button>
        </div>
      )}

      {/* ── Vol macro ── */}
      <div className="bg-dark-bgSecondary rounded-lg border border-dark-border p-3">
        <SectionHeader title="Vol Macro" address={volMacroAddr ?? 0} />
        {loading && !volMacro ? (
          <div className="text-[10px] text-text-muted font-mono py-2">Loading…</div>
        ) : volMacro ? (
          <div className="flex flex-wrap gap-1">
            {Array.from(volMacro).map((byte, i) => (
              <ByteCell
                key={i}
                index={i}
                value={byte}
                onChange={handleVolByteChange}
                label={VOL_LABELS[i]}
              />
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-text-muted font-mono py-2">No data</div>
        )}
        <div className="mt-2 flex flex-wrap gap-3 text-[9px] font-mono text-text-muted">
          <span><span className="text-amber-400">E1</span> = end</span>
          <span><span className="text-purple-300">E0..FF</span> = control</span>
          <span>col 0: speed · col 1: freq# · col 2-4: vibrato</span>
        </div>
      </div>

      {/* ── Freq macro ── */}
      <div className="bg-dark-bgSecondary rounded-lg border border-dark-border p-3">
        <SectionHeader
          title={`Freq Macro #${freqMacroIdx}`}
          address={freqMacroAddr ?? 0}
        />
        {loading && !freqMacro ? (
          <div className="text-[10px] text-text-muted font-mono py-2">Loading…</div>
        ) : freqMacro ? (
          <div className="flex flex-wrap gap-1">
            {Array.from(freqMacro).map((byte, i) => (
              <ByteCell
                key={i}
                index={i}
                value={byte}
                onChange={handleFreqByteChange}
                signed
              />
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-text-muted font-mono py-2">No data</div>
        )}
        <div className="mt-2 flex flex-wrap gap-3 text-[9px] font-mono text-text-muted">
          <span><span className="text-amber-400">E1</span> = end</span>
          <span><span className="text-purple-300">E0</span> nn = loop</span>
          <span><span className="text-purple-300">E2/E4</span> ww = wave</span>
          <span><span className="text-purple-300">E3/E7-EA</span> = fx</span>
          <span>other = pitch offset (signed)</span>
        </div>
      </div>

    </div>
  );
}
