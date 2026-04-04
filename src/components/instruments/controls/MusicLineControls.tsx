/**
 * MusicLineControls — Info panel for MusicLine Editor waveform instruments.
 *
 * MusicLine waveform instruments store the SHAPE as actual PCM in the SMPL chunk.
 * The `inst_SmplType` field (stored as mlSynthConfig.waveformType) is a LOOP SIZE
 * selector, not a shape selector:
 *   1 → 32-sample loop  (8287/32  ≈ C3 at PAL C3 period)
 *   2 → 64-sample loop  (8287/64  ≈ C2)
 *   3 → 128-sample loop (8287/128 ≈ C1)
 *   4 → 256-sample loop (8287/256 ≈ C0)
 *
 * Because the waveform shape comes from the SMPL data (parsed at import time),
 * it cannot be regenerated from the type number alone, so this panel is read-only.
 *
 * The Arpeggio tab shows the arpeggio table assigned to the current instrument,
 * loaded from WASM at runtime via MusicLineEngine.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import type { ColumnDef, FormatChannel, FormatCell, OnCellChange } from '@/components/shared/format-editor-types';
import { MusicLineEngine } from '@/engine/musicline/MusicLineEngine';
import type { MusicLineArpEntry } from '@/engine/musicline/MusicLineEngine';

// ── Constants ──────────────────────────────────────────────────────────────────

const PAL_C3_RATE = 8287;

// Correct loop lengths from FixWaveLength (smplLength=128 words → shifted by 5-smplType):
// type 1 → 8 words = 16 bytes; type 2 → 16 = 32; type 3 → 32 = 64; type 4 → 64 = 128; type 5+ → 256
const LOOP_SIZE_DEFS: Record<number, { samples: number; approxNote: string }> = {
  1: { samples: 16,  approxNote: 'C-4' },
  2: { samples: 32,  approxNote: 'C-3' },
  3: { samples: 64,  approxNote: 'C-2' },
  4: { samples: 128, approxNote: 'C-1' },
  5: { samples: 256, approxNote: 'C-0' },
};

// ── MusicLine note formatter ─────────────────────────────────────────────────

const ML_NOTES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function formatMLNote(value: number): string {
  if (value === 0) return '---';
  const note = (value - 1) % 12;
  const octave = Math.floor((value - 1) / 12) + 1;
  return `${ML_NOTES[note]}${octave}`;
}

function formatHex1(value: number): string {
  if (value === 0) return '-';
  return value.toString(16).toUpperCase();
}

function formatHex2(value: number): string {
  if (value === 0) return '--';
  return value.toString(16).toUpperCase().padStart(2, '0');
}

// ── Column definitions for arpeggio table ────────────────────────────────────

const ML_ARP_COLUMNS: ColumnDef[] = [
  {
    key: 'note',
    label: 'Note',
    charWidth: 3,
    type: 'note',
    color: '#60e060',
    emptyColor: '#2a2a3a',
    emptyValue: 0,
    formatter: formatMLNote,
  },
  {
    key: 'smpl',
    label: 'WS',
    charWidth: 2,
    type: 'hex',
    hexDigits: 2,
    color: '#e0c040',
    emptyColor: '#2a2a3a',
    emptyValue: 0,
    formatter: formatHex2,
  },
  {
    key: 'fx1',
    label: 'F1',
    charWidth: 1,
    type: 'hex',
    hexDigits: 1,
    color: '#60a0e0',
    emptyColor: '#2a2a3a',
    emptyValue: 0,
    formatter: formatHex1,
  },
  {
    key: 'param1',
    label: 'P1',
    charWidth: 2,
    type: 'hex',
    hexDigits: 2,
    color: '#6080c0',
    emptyColor: '#2a2a3a',
    emptyValue: 0,
    formatter: formatHex2,
  },
  {
    key: 'fx2',
    label: 'F2',
    charWidth: 1,
    type: 'hex',
    hexDigits: 1,
    color: '#c060e0',
    emptyColor: '#2a2a3a',
    emptyValue: 0,
    formatter: formatHex1,
  },
  {
    key: 'param2',
    label: 'P2',
    charWidth: 2,
    type: 'hex',
    hexDigits: 2,
    color: '#a060c0',
    emptyColor: '#2a2a3a',
    emptyValue: 0,
    formatter: formatHex2,
  },
];

// Field index mapping: key → WASM fieldIdx for ml_set_arp_entry
const ARP_FIELD_MAP: Record<string, number> = {
  note: 0,
  smpl: 1,
  fx1: 2,
  param1: 3,
  fx2: 4,
  param2: 5,
};

// ── Types ──────────────────────────────────────────────────────────────────────

type MLTab = 'info' | 'arpeggio';

interface MusicLineControlsProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export const MusicLineControls: React.FC<MusicLineControlsProps> = ({ instrument }) => {
  const [tab, setTab] = useState<MLTab>('info');

  const mlConfig = instrument.metadata?.mlSynthConfig;
  const waveformType: number = mlConfig?.waveformType ?? 3;
  const volume = mlConfig?.volume ?? 64;
  const mlInstIdx: number = instrument.metadata?.mlInstIdx ?? 0;

  const loopDef = LOOP_SIZE_DEFS[waveformType] ?? { samples: 256, approxNote: '?' };
  const freq = Math.round(PAL_C3_RATE / loopDef.samples);

  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #0a0a12 0%, #060608 100%)',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontFamily: 'monospace',
        height: '100%',
      }}
    >
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4 }}>
        {(['info', 'arpeggio'] as MLTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 16px',
              background: tab === t ? '#1a1a30' : 'transparent',
              border: tab === t ? '1px solid #6060ff' : '1px solid #2a2a4a',
              borderRadius: 4,
              color: tab === t ? '#a0a0ff' : '#4a4a6a',
              fontSize: 11,
              fontFamily: 'monospace',
              letterSpacing: 1,
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <>
          {/* Loop size row */}
          <div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: '#4a4a6a', textTransform: 'uppercase', marginBottom: 10 }}>
              Waveform Loop
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              background: '#0e0e18',
              border: '1px solid #2a2a4a',
              borderRadius: 6,
            }}>
              <div style={{
                padding: '6px 14px',
                background: '#1a1a30',
                border: '1px solid #6060ff',
                borderRadius: 4,
                fontSize: 18,
                fontWeight: 'bold',
                color: '#a0a0ff',
                letterSpacing: 1,
              }}>
                {loopDef.samples}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12, color: '#7a7a9a' }}>
                  {loopDef.samples}-sample single-cycle waveform
                </span>
                <span style={{ fontSize: 10, color: '#4a4a6a' }}>
                  Loop type {waveformType} · {freq} Hz fundamental at {loopDef.approxNote}
                </span>
              </div>
            </div>
          </div>

          {/* Info row */}
          <div style={{
            display: 'flex',
            gap: 24,
            padding: '10px 14px',
            background: '#0e0e18',
            border: '1px solid #1e1e2e',
            borderRadius: 6,
          }}>
            <InfoItem label="Volume" value={`${volume} / 64`} />
            <InfoItem label="Sample rate" value={`${PAL_C3_RATE} Hz`} />
            <InfoItem label="Loop" value="Full cycle" />
            <InfoItem label="Base note" value={loopDef.approxNote} />
          </div>

          {/* Note */}
          <div style={{
            fontSize: 9,
            color: '#3a3a5a',
            lineHeight: 1.6,
            letterSpacing: 0.5,
          }}>
            Waveform shape is stored as PCM in the song file and cannot be edited here.
            The loop type determines the playback pitch at a given note trigger.
          </div>
        </>
      )}

      {tab === 'arpeggio' && (
        <ArpPanel instIdx={mlInstIdx} />
      )}
    </div>
  );
};

// ── Info item helper ─────────────────────────────────────────────────────────

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#4a4a6a' }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: '#7a7a9a', fontFamily: 'monospace' }}>
        {value}
      </span>
    </div>
  );
}

// ── Arpeggio Panel ───────────────────────────────────────────────────────────

interface ArpPanelProps {
  instIdx: number;
}

function ArpPanel({ instIdx }: ArpPanelProps) {
  const [arpConfig, setArpConfig] = useState<{ table: number; speed: number; groove: number; numArps: number } | null>(null);
  const [arpRows, setArpRows] = useState<MusicLineArpEntry[]>([]);
  const [arpLength, setArpLength] = useState(0);
  const [loading, setLoading] = useState(true);

  // Load arp config and table data from WASM
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      if (!MusicLineEngine.hasInstance()) {
        setLoading(false);
        return;
      }
      const engine = MusicLineEngine.getInstance();
      await engine.ready();

      const config = await engine.readInstArpConfig(instIdx);
      if (cancelled) return;
      setArpConfig(config);

      if (config.table >= 0) {
        const data = await engine.readArpTable(config.table);
        if (cancelled) return;
        setArpRows(data.rows);
        setArpLength(data.length);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [instIdx]);

  // Convert arp rows to FormatChannel for PatternEditorCanvas
  const formatChannels: FormatChannel[] = useMemo(() => {
    if (arpRows.length === 0) return [];
    const rows: FormatCell[] = arpRows.map((entry) => ({
      note: entry.note,
      smpl: entry.smpl,
      fx1: entry.fx1,
      param1: entry.param1,
      fx2: entry.fx2,
      param2: entry.param2,
    }));
    return [{
      label: `Arp ${arpConfig?.table ?? 0}`,
      patternLength: arpLength,
      rows,
      isPatternChannel: false,
    }];
  }, [arpRows, arpLength, arpConfig?.table]);

  // Cell change handler — writes to WASM and updates local state
  const onCellChange: OnCellChange = useCallback((_chIdx: number, rowIdx: number, columnKey: string, value: number) => {
    const fieldIdx = ARP_FIELD_MAP[columnKey];
    if (fieldIdx === undefined || !arpConfig || arpConfig.table < 0) return;

    // Write to WASM
    if (MusicLineEngine.hasInstance()) {
      const engine = MusicLineEngine.getInstance();
      engine.writeArpEntry(arpConfig.table, rowIdx, fieldIdx, value);
    }

    // Update local state
    setArpRows((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], [columnKey]: value };
      return next;
    });
  }, [arpConfig]);

  if (loading) {
    return (
      <div style={{ color: '#4a4a6a', fontSize: 11, padding: 12 }}>
        Loading arpeggio data...
      </div>
    );
  }

  if (!arpConfig || arpConfig.table < 0 || arpLength === 0) {
    return (
      <div style={{ color: '#4a4a6a', fontSize: 11, padding: 12 }}>
        No arpeggio table assigned to this instrument.
        {arpConfig && arpConfig.numArps > 0 && (
          <span style={{ display: 'block', marginTop: 8, color: '#3a3a5a' }}>
            Song has {arpConfig.numArps} arpeggio table{arpConfig.numArps !== 1 ? 's' : ''}.
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
      {/* Arp header info */}
      <div style={{
        display: 'flex',
        gap: 16,
        padding: '8px 12px',
        background: '#0e0e18',
        border: '1px solid #1e1e2e',
        borderRadius: 4,
        fontSize: 10,
      }}>
        <span style={{ color: '#7a7a9a' }}>Table: <span style={{ color: '#a0a0ff' }}>{arpConfig.table}</span></span>
        <span style={{ color: '#7a7a9a' }}>Speed: <span style={{ color: '#a0a0ff' }}>{arpConfig.speed}</span></span>
        <span style={{ color: '#7a7a9a' }}>Groove: <span style={{ color: '#a0a0ff' }}>{arpConfig.groove}</span></span>
        <span style={{ color: '#7a7a9a' }}>Rows: <span style={{ color: '#a0a0ff' }}>{arpLength}</span></span>
      </div>

      {/* Pattern editor canvas */}
      <div style={{ flex: 1, minHeight: 200 }}>
        <PatternEditorCanvas
          formatColumns={ML_ARP_COLUMNS}
          formatChannels={formatChannels}
          onFormatCellChange={onCellChange}
          hideVUMeters={true}
        />
      </div>
    </div>
  );
}
