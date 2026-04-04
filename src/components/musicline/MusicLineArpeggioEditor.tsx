/**
 * MusicLineArpeggioEditor -- Standalone arpeggio table editor for MusicLine.
 *
 * Features:
 * - Dropdown to select any arpeggio table (0..numArps-1)
 * - Scrollable grid: 12 visible rows, columns: Row#, Note, WaveSample, Fx1, Par1, Fx2, Par2
 * - Note column displays note names (C-1..B-5) or special values (Wait/End/Restart)
 * - Effect columns displayed as hex with named sub-effect tooltips
 * - Click-to-select cell, keyboard editing (hex input for numeric fields, note input for note field)
 * - Reads data from MusicLineEngine arp API, writes changes via writeArpEntry
 *
 * Row format (6 bytes each):
 *   field 0: Note     — 0=wait, 1-60=note, 61=end, 62=restart, bit7=relative transpose
 *   field 1: WaveSample
 *   field 2: Effect1Num   (0=noop, 1=pitch up, 2=pitch down, 3=set vol, 4=vol up, 5=vol down, 6=restart)
 *   field 3: Effect1Param
 *   field 4: Effect2Num
 *   field 5: Effect2Param
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MusicLineEngine } from '@/engine/musicline/MusicLineEngine';
import type { MusicLineArpEntry } from '@/engine/musicline/MusicLineEngine';

// ── Constants ──────────────────────────────────────────────────────────────────

const VISIBLE_ROWS = 12;
const ROW_HEIGHT = 22;
const GRID_HEIGHT = VISIBLE_ROWS * ROW_HEIGHT;

const ML_NOTES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

const SUB_FX_NAMES: Record<number, string> = {
  0: '---',
  1: 'Pitch Up',
  2: 'Pitch Dn',
  3: 'Set Vol',
  4: 'Vol Up',
  5: 'Vol Dn',
  6: 'Restart',
};

type ColumnKey = 'note' | 'smpl' | 'fx1' | 'param1' | 'fx2' | 'param2';

interface ColumnDef {
  key: ColumnKey;
  label: string;
  width: number;
  fieldIdx: number;
  maxValue: number;
  /** Number of hex digits for display (0 = use note formatter) */
  hexDigits: number;
  color: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'note',   label: 'Note', width: 42, fieldIdx: 0, maxValue: 255, hexDigits: 0, color: '#60e060' },
  { key: 'smpl',   label: 'WS',   width: 32, fieldIdx: 1, maxValue: 255, hexDigits: 2, color: '#e0c040' },
  { key: 'fx1',    label: 'F1',   width: 24, fieldIdx: 2, maxValue: 15,  hexDigits: 1, color: '#60a0e0' },
  { key: 'param1', label: 'P1',   width: 32, fieldIdx: 3, maxValue: 255, hexDigits: 2, color: '#6080c0' },
  { key: 'fx2',    label: 'F2',   width: 24, fieldIdx: 4, maxValue: 15,  hexDigits: 1, color: '#c060e0' },
  { key: 'param2', label: 'P2',   width: 32, fieldIdx: 5, maxValue: 255, hexDigits: 2, color: '#a060c0' },
];

const ROW_NUM_WIDTH = 30;
const TOTAL_WIDTH = ROW_NUM_WIDTH + COLUMNS.reduce((s, c) => s + c.width, 0);

// ── Formatters ─────────────────────────────────────────────────────────────────

function formatNote(value: number): string {
  if (value === 0) return '---';
  if (value === 61) return 'END';
  if (value === 62) return 'RST';
  const rel = value & 0x80;
  const raw = value & 0x7f;
  if (raw >= 1 && raw <= 60) {
    const n = (raw - 1) % 12;
    const o = Math.floor((raw - 1) / 12) + 1;
    const name = `${ML_NOTES[n]}${o}`;
    return rel ? `~${name.slice(0, 2)}${o}` : name;
  }
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function formatHex(value: number, digits: number): string {
  if (value === 0) return digits === 1 ? '-' : '--';
  return value.toString(16).toUpperCase().padStart(digits, '0');
}

function formatCell(col: ColumnDef, value: number): string {
  if (col.hexDigits === 0) return formatNote(value);
  return formatHex(value, col.hexDigits);
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface MusicLineArpeggioEditorProps {
  /** Initial table index to show (from instrument config). -1 = none. */
  initialTable?: number;
  /** Callback when the user selects a different table (optional, for parent sync). */
  onTableChange?: (tableIdx: number) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export const MusicLineArpeggioEditor: React.FC<MusicLineArpeggioEditorProps> = ({
  initialTable = 0,
  onTableChange,
}) => {
  const [numArps, setNumArps] = useState(0);
  const [selectedTable, setSelectedTable] = useState(Math.max(0, initialTable));
  const [rows, setRows] = useState<MusicLineArpEntry[]>([]);
  const [tableLength, setTableLength] = useState(0);
  const [loading, setLoading] = useState(true);

  // Selected cell: [row, colIndex]
  const [selRow, setSelRow] = useState(0);
  const [selCol, setSelCol] = useState(0);
  const [hexBuffer, setHexBuffer] = useState('');

  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Load number of arp tables on mount ─────────────────────────────────────

  useEffect(() => {
    if (!MusicLineEngine.hasInstance()) return;
    const engine = MusicLineEngine.getInstance();
    engine.ready().then(() => {
      // Use readInstArpConfig with inst 0 just to get numArps
      engine.readInstArpConfig(0).then((cfg) => {
        setNumArps(cfg.numArps);
      });
    });
  }, []);

  // ── Load table data when selectedTable changes ─────────────────────────────

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

      const data = await engine.readArpTable(selectedTable);
      if (cancelled) return;

      setRows(data.rows);
      setTableLength(data.length);
      setLoading(false);
      setSelRow(0);
      setSelCol(0);
      setHexBuffer('');
    })();

    return () => { cancelled = true; };
  }, [selectedTable]);

  // ── Table selector change ──────────────────────────────────────────────────

  const handleTableChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value, 10);
    setSelectedTable(idx);
    onTableChange?.(idx);
  }, [onTableChange]);

  // ── Cell click ─────────────────────────────────────────────────────────────

  const handleCellClick = useCallback((row: number, col: number) => {
    setSelRow(row);
    setSelCol(col);
    setHexBuffer('');
  }, []);

  // ── Write a value to the engine and update local state ─────────────────────

  const commitValue = useCallback((row: number, colIdx: number, value: number) => {
    const col = COLUMNS[colIdx];
    const clamped = Math.max(0, Math.min(col.maxValue, value));

    if (MusicLineEngine.hasInstance()) {
      const engine = MusicLineEngine.getInstance();
      engine.writeArpEntry(selectedTable, row, col.fieldIdx, clamped);
    }

    setRows((prev) => {
      const next = [...prev];
      next[row] = { ...next[row], [col.key]: clamped };
      return next;
    });
  }, [selectedTable]);

  // ── Keyboard handling ──────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const col = COLUMNS[selCol];

    // Navigation
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelRow((r) => Math.min(r + 1, tableLength - 1));
      setHexBuffer('');
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelRow((r) => Math.max(r - 1, 0));
      setHexBuffer('');
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'Tab') {
      e.preventDefault();
      setSelCol((c) => Math.min(c + 1, COLUMNS.length - 1));
      setHexBuffer('');
      return;
    }
    if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      setSelCol((c) => Math.max(c - 1, 0));
      setHexBuffer('');
      return;
    }

    // Delete / clear
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      commitValue(selRow, selCol, 0);
      setHexBuffer('');
      return;
    }

    // Note column: special values
    if (col.key === 'note') {
      // Quick entry for special note values
      if (e.key === 'e' || e.key === 'E') {
        // 'E' = End (61)
        commitValue(selRow, selCol, 61);
        setSelRow((r) => Math.min(r + 1, tableLength - 1));
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        // 'R' = Restart (62)
        commitValue(selRow, selCol, 62);
        setSelRow((r) => Math.min(r + 1, tableLength - 1));
        return;
      }
    }

    // Hex input for all columns
    const hexChar = e.key.match(/^[0-9a-fA-F]$/);
    if (hexChar) {
      e.preventDefault();
      const digits = col.hexDigits === 0 ? 2 : col.hexDigits; // note col uses 2-digit hex
      const newBuf = (hexBuffer + hexChar[0]).slice(-digits);
      setHexBuffer(newBuf);
      const value = parseInt(newBuf, 16);
      commitValue(selRow, selCol, value);
      if (newBuf.length >= digits) {
        setHexBuffer('');
        setSelRow((r) => Math.min(r + 1, tableLength - 1));
      }
      return;
    }

    // Enter = advance row
    if (e.key === 'Enter') {
      e.preventDefault();
      setSelRow((r) => Math.min(r + 1, tableLength - 1));
      setHexBuffer('');
    }
  }, [selRow, selCol, hexBuffer, tableLength, commitValue]);

  // ── Scroll selected row into view ──────────────────────────────────────────

  useEffect(() => {
    if (!scrollRef.current) return;
    const top = selRow * ROW_HEIGHT;
    const bot = top + ROW_HEIGHT;
    const st = scrollRef.current.scrollTop;
    if (top < st) {
      scrollRef.current.scrollTop = top;
    } else if (bot > st + GRID_HEIGHT) {
      scrollRef.current.scrollTop = bot - GRID_HEIGHT;
    }
  }, [selRow]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ color: '#4a4a6a', fontSize: 11, padding: 12 }}>
        Loading arpeggio data...
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        flex: 1,
        minHeight: 0,
        fontFamily: 'monospace',
        fontSize: 11,
      }}
    >
      {/* ── Header: table selector + info ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '6px 8px',
          background: '#0e0e18',
          border: '1px solid #1e1e2e',
          borderRadius: 4,
        }}
      >
        <label style={{ color: '#7a7a9a', fontSize: 10 }}>
          Table:
          <select
            value={selectedTable}
            onChange={handleTableChange}
            style={{
              marginLeft: 4,
              background: '#14141e',
              color: '#a0a0ff',
              border: '1px solid #2a2a3e',
              borderRadius: 3,
              padding: '2px 4px',
              fontSize: 10,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            {Array.from({ length: numArps }, (_, i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </label>
        <span style={{ color: '#7a7a9a', fontSize: 10 }}>
          Rows: <span style={{ color: '#a0a0ff' }}>{tableLength}</span>
        </span>
        <span style={{ color: '#3a3a5a', fontSize: 9, marginLeft: 'auto' }}>
          Hex input / E=End / R=Restart / Del=Clear
        </span>
      </div>

      {/* ── Sub-effect legend ── */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '3px 8px',
          fontSize: 9,
          color: '#5a5a7a',
          flexWrap: 'wrap',
        }}
      >
        {Object.entries(SUB_FX_NAMES).map(([k, v]) => (
          <span key={k}>
            <span style={{ color: '#60a0e0' }}>{parseInt(k).toString(16).toUpperCase()}</span>
            ={v}
          </span>
        ))}
      </div>

      {/* ── Column headers ── */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #2a2a3e',
          padding: '2px 0',
          userSelect: 'none',
        }}
      >
        <div style={{ width: ROW_NUM_WIDTH, textAlign: 'right', paddingRight: 4, color: '#4a4a6a', fontSize: 9 }}>
          #
        </div>
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            style={{
              width: col.width,
              textAlign: 'center',
              color: col.color,
              fontSize: 9,
              opacity: 0.7,
            }}
          >
            {col.label}
          </div>
        ))}
      </div>

      {/* ── Scrollable grid ── */}
      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={() => gridRef.current?.focus()}
        style={{
          flex: 1,
          minHeight: GRID_HEIGHT,
          maxHeight: GRID_HEIGHT,
          overflowY: 'auto',
          overflowX: 'hidden',
          outline: 'none',
          cursor: 'default',
        }}
      >
        <div ref={gridRef} style={{ width: TOTAL_WIDTH }}>
          {rows.slice(0, tableLength).map((entry, rowIdx) => {
            const isSelectedRow = rowIdx === selRow;
            return (
              <div
                key={rowIdx}
                style={{
                  display: 'flex',
                  height: ROW_HEIGHT,
                  alignItems: 'center',
                  background: isSelectedRow ? '#1a1a2e' : rowIdx % 4 === 0 ? '#0c0c16' : 'transparent',
                  borderBottom: '1px solid #12121e',
                }}
              >
                {/* Row number */}
                <div
                  style={{
                    width: ROW_NUM_WIDTH,
                    textAlign: 'right',
                    paddingRight: 4,
                    color: rowIdx % 4 === 0 ? '#5a5a8a' : '#3a3a5a',
                    fontSize: 10,
                  }}
                >
                  {rowIdx.toString(16).toUpperCase().padStart(2, '0')}
                </div>

                {/* Data cells */}
                {COLUMNS.map((col, colIdx) => {
                  const value = entry[col.key];
                  const isSelected = isSelectedRow && colIdx === selCol;
                  const displayText = formatCell(col, value);
                  // Show sub-effect name as title tooltip for fx columns
                  const tooltip = (col.key === 'fx1' || col.key === 'fx2')
                    ? SUB_FX_NAMES[value] ?? `Unknown (${value})`
                    : undefined;

                  return (
                    <div
                      key={col.key}
                      onClick={() => handleCellClick(rowIdx, colIdx)}
                      title={tooltip}
                      style={{
                        width: col.width,
                        textAlign: 'center',
                        color: value === 0 ? '#2a2a3e' : col.color,
                        cursor: 'pointer',
                        background: isSelected ? '#2a2a4e' : 'transparent',
                        borderRadius: isSelected ? 2 : 0,
                        outline: isSelected ? `1px solid ${col.color}44` : 'none',
                        lineHeight: `${ROW_HEIGHT}px`,
                        transition: 'background 0.05s',
                      }}
                    >
                      {displayText}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
